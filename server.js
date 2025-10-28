const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(__dirname));

// Per-room storage (in-memory, persisted to disk)
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'rooms.json');

function ensureDataDir() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function loadRoomsData() {
    try {
        ensureDataDir();
        if (!fs.existsSync(dataFile)) {
            fs.writeFileSync(dataFile, JSON.stringify({ messages: {}, passwords: {} }, null, 2));
        }
        const raw = fs.readFileSync(dataFile, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        return parsed;
    } catch (e) {
        console.error('Failed to load rooms data:', e);
        return { messages: {}, passwords: {} };
    }
}

function saveRoomsDataSync(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save rooms data:', e);
    }
}

// initialize from disk
const persisted = loadRoomsData();
const roomMessages = new Map(Object.entries(persisted.messages || {}));
const roomUsers = new Map();
const roomPasswords = new Map(Object.entries(persisted.passwords || {}));

io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('join', ({ profile, room, password }) => {
        if (!room) room = 'default';
        
        if (roomPasswords.has(room)) {
            if (roomPasswords.get(room) !== password) {
                socket.emit('join_error', 'Incorrect password');
                return;
            }
        } else if (password) {
            roomPasswords.set(room, password);
            // persist password
            const out = { messages: Object.fromEntries(roomMessages), passwords: Object.fromEntries(roomPasswords) };
            saveRoomsDataSync(out);
        }

        socket.join(room);
        socket.data.room = room;

        // store user in room
        if (!roomUsers.has(room)) roomUsers.set(room, new Map());
        roomUsers.get(room).set(socket.id, profile || { id: 'guest', name: 'Guest' });

        // send room users
        const usersArr = Array.from(roomUsers.get(room).values());
        io.to(room).emit('users', usersArr);

        // send previous messages for this room
        const msgs = roomMessages.get(room) || [];
        socket.emit('previous-messages', msgs);
    });

    socket.on('chat message', (msg) => {
        const room = socket.data.room || 'default';
        if (!roomMessages.has(room)) roomMessages.set(room, []);
        const msgs = roomMessages.get(room);
        msgs.push(msg);
        if (msgs.length > 500) msgs.shift(); // keep last 500
        // persist messages for this room
        const out = { messages: Object.fromEntries(roomMessages), passwords: Object.fromEntries(roomPasswords) };
        saveRoomsDataSync(out);
        io.to(room).emit('chat message', msg);
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
        roomMessages.set(room, []);
        const out = { messages: Object.fromEntries(roomMessages), passwords: Object.fromEntries(roomPasswords) };
        saveRoomsDataSync(out);
        io.to(room).emit('cleared');
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