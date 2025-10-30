const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

// Persistence: prefer SQLite for durability. We still keep 'data/rooms.json' as a migration source.
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'rooms.json');

// SQLite setup
const sqlite3 = require('sqlite3').verbose();
const dbFile = path.join(dataDir, 'nezumiya.db');
function ensureDataDir() { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); }

ensureDataDir();
const db = new sqlite3.Database(dbFile);

// Initialize DB tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT,
        sender TEXT,
        name TEXT,
        text TEXT,
        ts INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        author_id TEXT,
        author_name TEXT,
        text TEXT,
        ts INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT,
        data TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT,
        members TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS room_passwords (
        room TEXT PRIMARY KEY,
        password TEXT
    )`);
});

const roomUsers = new Map();

// Simple helper: migrate existing JSON file into SQLite if DB is empty
function migrateJsonToSqlite() {
    try {
        if (!fs.existsSync(dataFile)) return;
        const raw = fs.readFileSync(dataFile, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (!parsed) return;
        db.serialize(() => {
            db.get('SELECT COUNT(1) as c FROM posts', (e, row) => {
                if (e) return;
                if (row && row.c === 0 && Array.isArray(parsed.posts) && parsed.posts.length) {
                    const stmt = db.prepare('INSERT OR REPLACE INTO posts (id, author_id, author_name, text, ts) VALUES (?, ?, ?, ?, ?)');
                    parsed.posts.forEach(p => {
                        try { stmt.run(p.id || String(Date.now()), p.author?.id || null, p.author?.name || p.author?.display || null, p.text || '', p.ts || Date.now()); } catch (err) {}
                    });
                    stmt.finalize();
                }
            });
            db.get('SELECT COUNT(1) as c FROM profiles', (e, row) => {
                if (e) return;
                if (row && row.c === 0 && parsed.profiles) {
                    const stmt = db.prepare('INSERT OR REPLACE INTO profiles (id, name, data) VALUES (?, ?, ?)');
                    Object.entries(parsed.profiles || {}).forEach(([id, prof]) => {
                        stmt.run(id, prof.name || prof.display || '', JSON.stringify(prof));
                    });
                    stmt.finalize();
                }
            });
            db.get('SELECT COUNT(1) as c FROM groups', (e, row) => {
                if (e) return;
                if (row && row.c === 0 && parsed.groups) {
                    const stmt = db.prepare('INSERT OR REPLACE INTO groups (id, name, members) VALUES (?, ?, ?)');
                    Object.entries(parsed.groups || {}).forEach(([id, g]) => {
                        stmt.run(id, g.name || '', JSON.stringify(g.members || []));
                    });
                    stmt.finalize();
                }
            });
            db.get('SELECT COUNT(1) as c FROM messages', (e, row) => {
                if (e) return;
                if (row && row.c === 0 && parsed.messages) {
                    const stmt = db.prepare('INSERT INTO messages (room, sender, name, text, ts) VALUES (?, ?, ?, ?, ?)');
                    Object.entries(parsed.messages || {}).forEach(([room, msgs]) => {
                        (msgs || []).forEach(m => {
                            stmt.run(room, m.sender || null, m.name || null, m.text || '', m.ts || Date.now());
                        });
                    });
                    stmt.finalize();
                }
            });
            // room passwords
            if (parsed.passwords) {
                const stmt = db.prepare('INSERT OR REPLACE INTO room_passwords (room, password) VALUES (?, ?)');
                Object.entries(parsed.passwords || {}).forEach(([r, pw]) => { stmt.run(r, pw); });
                stmt.finalize();
            }
        });
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrateJsonToSqlite();

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('join', ({ profile, room, password }) => {
        if (!room) room = 'default';

        // Check room password in DB
        db.get('SELECT password FROM room_passwords WHERE room = ?', [room], (err, row) => {
            if (err) { console.error('db error', err); }
            if (row && row.password) {
                if (row.password !== password) {
                    socket.emit('join_error', 'Incorrect password');
                    return;
                }
            } else if (password) {
                db.run('INSERT OR REPLACE INTO room_passwords (room, password) VALUES (?, ?)', [room, password]);
            }

            // Now join
            socket.join(room);
            socket.data.room = room;

            // store user in room (in-memory)
            if (!roomUsers.has(room)) roomUsers.set(room, new Map());
            roomUsers.get(room).set(socket.id, profile || { id: 'guest', name: 'Guest' });

            // send room users
            const usersArr = Array.from(roomUsers.get(room).values());
            io.to(room).emit('users', usersArr);

            // send previous messages for this room from DB
            db.all('SELECT sender, name, text, ts FROM messages WHERE room = ? ORDER BY ts ASC LIMIT 500', [room], (err2, rows) => {
                if (err2) {
                    console.error('failed to load messages', err2);
                    socket.emit('previous-messages', []);
                } else {
                    // rows are in chronological order
                    const msgs = (rows || []).map(r => ({ sender: r.sender, name: r.name, text: r.text, ts: r.ts }));
                    socket.emit('previous-messages', msgs);
                }
            });
        });
    });

    socket.on('chat message', (msg) => {
        const room = socket.data.room || 'default';
        // persist message to DB
        try {
            db.run('INSERT INTO messages (room, sender, name, text, ts) VALUES (?, ?, ?, ?, ?)', [room, msg.sender || null, msg.name || null, msg.text || '', msg.ts || Date.now()], (err) => {
                if (err) console.error('failed to save message', err);
                // emit to room regardless
                io.to(room).emit('chat message', msg);
            });
        } catch (e) {
            console.error('sqlite error', e);
            io.to(room).emit('chat message', msg);
        }
    });

    socket.on('typing', (profile) => {
        const room = socket.data.room || 'default';
        socket.to(room).emit('typing', profile);
    });

    socket.on('profile update', (profile) => {
        const room = socket.data.room || 'default';
        if (!roomUsers.has(room)) roomUsers.set(room, new Map());
        roomUsers.get(room).set(socket.id, profile);
        io.to(room).emit('users', Array.from(roomUsers.get(room).values()));
    });

    socket.on('clear chat', () => {
        const room = socket.data.room || 'default';
        db.run('DELETE FROM messages WHERE room = ?', [room], (err) => {
            if (err) console.error('failed to clear messages', err);
            io.to(room).emit('cleared');
        });
    });

    // Profiles: create and list
    socket.on('create_profile', (profile, cb) => {
        if (!profile || !profile.id) {
            if (cb) cb({ error: 'invalid_profile' });
            return;
        }
        const data = JSON.stringify(profile || {});
        db.run('INSERT OR REPLACE INTO profiles (id, name, data) VALUES (?, ?, ?)', [profile.id, profile.name || '', data], (err) => {
            if (err) {
                console.error('failed to save profile', err);
                if (cb) cb({ error: 'db_error' });
                return;
            }
            // broadcast updated profiles list
            db.all('SELECT id, name, data FROM profiles', (e, rows) => {
                if (e) { if (cb) cb({ error: 'db_error' }); return; }
                const out = (rows || []).map(r => { try { return JSON.parse(r.data); } catch (ex) { return { id: r.id, name: r.name }; } });
                io.emit('profiles', out);
                if (cb) cb({ ok: true, profile });
            });
        });
    });

    socket.on('list_profiles', (cb) => {
        db.all('SELECT id, name, data FROM profiles', (e, rows) => {
            if (e) { if (cb) cb([]); return; }
            const out = (rows || []).map(r => { try { return JSON.parse(r.data); } catch (ex) { return { id: r.id, name: r.name }; } });
            if (cb) cb(out);
        });
    });

    // Posts / Home feed
    socket.on('create_post', (post, cb) => {
        if (!post || !post.author) {
            if (cb) cb({ error: 'invalid_post' });
            return;
        }
        post.id = post.id || String(Date.now());
        post.ts = Date.now();
        db.run('INSERT OR REPLACE INTO posts (id, author_id, author_name, text, ts) VALUES (?, ?, ?, ?, ?)', [post.id, post.author.id || null, post.author.name || null, post.text || '', post.ts], (err) => {
            if (err) { console.error('failed to save post', err); if (cb) cb({ error: 'db_error' }); return; }
            io.emit('new_post', post);
            if (cb) cb({ ok: true, post });
        });
    });

    socket.on('list_posts', (cb) => {
        db.all('SELECT id, author_id, author_name, text, ts FROM posts ORDER BY ts DESC LIMIT 200', (err, rows) => {
            if (err) { if (cb) cb([]); return; }
            const out = (rows || []).map(r => ({ id: r.id, author: { id: r.author_id, name: r.author_name }, text: r.text, ts: r.ts }));
            if (cb) cb(out);
        });
    });

    // Groups
    socket.on('create_group', (group, cb) => {
        if (!group || !group.name) {
            if (cb) cb({ error: 'invalid_group' });
            return;
        }
        const id = group.id || `g_${Date.now()}`;
        group.id = id;
        group.members = group.members || [];
        db.run('INSERT OR REPLACE INTO groups (id, name, members) VALUES (?, ?, ?)', [id, group.name, JSON.stringify(group.members || [])], (err) => {
            if (err) { console.error('failed to save group', err); if (cb) cb({ error: 'db_error' }); return; }
            io.emit('group_created', group);
            if (cb) cb({ ok: true, group });
        });
    });

    socket.on('list_groups', (cb) => {
        db.all('SELECT id, name, members FROM groups', (err, rows) => {
            if (err) { if (cb) cb([]); return; }
            const out = (rows || []).map(r => ({ id: r.id, name: r.name, members: JSON.parse(r.members || '[]') }));
            if (cb) cb(out);
        });
    });

    // Start or get a DM room id between two users
    socket.on('start_dm', ({ from, to }, cb) => {
        if (!from || !to) {
            if (cb) cb({ error: 'missing_participants' });
            return;
        }
        const a = String(from.id || from);
        const b = String(to.id || to);
        const dmId = a < b ? `dm_${a}_${b}` : `dm_${b}_${a}`;
        if (cb) cb({ room: dmId });
    });

    socket.on('disconnect', () => {
        const room = socket.data.room || 'default';
        if (roomUsers.has(room)) {
            roomUsers.get(room).delete(socket.id);
            io.to(room).emit('users', Array.from(roomUsers.get(room).values()));
        }
        console.log('user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('To access from other devices on your network:');
    console.log(`1. Find your IP address by running 'ipconfig' in a new terminal`);
    console.log(`2. Use http://YOUR_IP:${PORT} (replace YOUR_IP with your IPv4 address)`);
});