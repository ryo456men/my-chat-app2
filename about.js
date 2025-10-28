window.onload = function () {
    // --- Simple real-time chat client ---
    const socket = (window.io) ? io() : null;
    const chatWindow = document.getElementById('chatWindow');
    const form = document.getElementById('messageForm');
    const input = document.getElementById('messageInput');
    const senderSelect = document.getElementById('senderSelect');
    const clearBtn = document.getElementById('clearChat');
    const nameA = document.getElementById('nameA');
    const nameB = document.getElementById('nameB');
    const settingsBtn = document.getElementById('settingsBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileNameEl = document.getElementById('profileName');
    const editA = document.getElementById('editA');
    const editB = document.getElementById('editB');
    const connStatusEl = document.getElementById('conn-status');
    const newRoomBtn = document.getElementById('newRoomBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const roomLabel = document.getElementById('roomId');
    const passwordSection = document.getElementById('passwordSection');
    const passwordInput = document.getElementById('roomPassword');
    const joinRoomBtn = document.getElementById('joinRoom');

    const hasSocket = Boolean(socket);

    // helpers
    function setStatus(state) {
        if (!connStatusEl) return;
        connStatusEl.className = '';
        if (state === 'online') { connStatusEl.textContent = 'Online'; connStatusEl.classList.add('conn-online'); }
        else if (state === 'offline') { connStatusEl.textContent = 'Offline'; connStatusEl.classList.add('conn-offline'); }
        else { connStatusEl.textContent = 'Connecting…'; connStatusEl.classList.add('conn-connecting'); }
    }

    if (!hasSocket) {
        if (connStatusEl) connStatusEl.textContent = 'Socket.IO not loaded';
    } else {
        socket.on('connect', () => setStatus('online'));
        socket.on('disconnect', () => setStatus('offline'));
        socket.io.on('reconnect_attempt', () => setStatus('connecting'));
    }

    let currentUser = { id: 'A', name: 'User A' };
    let currentRoom = 'default';

    // Read room from URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('room')) {
        currentRoom = params.get('room');
        if (passwordSection) passwordSection.classList.remove('hidden');
    }
    if (roomLabel) roomLabel.textContent = currentRoom;

    function genId(len = 8) {
        return Math.random().toString(36).slice(2, 2 + len);
    }

    function appendMessageToDOM(msg) {
        if (!chatWindow) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'message ' + ((msg.sender === 'A') ? 'A' : 'B');
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = msg.text;
        const meta = document.createElement('div');
        meta.className = 'meta';
        const displayName = msg.name || (msg.sender === 'A' ? nameA?.textContent || 'A' : nameB?.textContent || 'B');
        meta.textContent = displayName + ' • ' + new Date(msg.ts).toLocaleTimeString();
        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);
        chatWindow.appendChild(wrapper);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Socket events
    if (hasSocket) {
        socket.on('previous-messages', (messages) => {
            if (!chatWindow) return;
            chatWindow.innerHTML = '';
            messages.forEach(appendMessageToDOM);
        });
        socket.on('chat message', appendMessageToDOM);
        socket.on('cleared', () => { if (chatWindow) chatWindow.innerHTML = ''; });
        socket.on('join_error', (err) => { alert(err); if (passwordInput) passwordInput.classList.add('error'); });

        // update room users (multi-person support)
        socket.on('users', (users) => {
            const userCountEl = document.getElementById('userCount');
            // if there are named slots A/B, update them for quick identification
            if (users[0] && document.getElementById('nameA')) document.getElementById('nameA').textContent = users[0].name;
            if (users[1] && document.getElementById('nameB')) document.getElementById('nameB').textContent = users[1].name;
        });
    }

    // Typing indicator
    let typingTimeout;
    input?.addEventListener('input', () => {
        if (hasSocket) socket.emit('typing', currentUser);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { if (hasSocket) socket.emit('typing', null); }, 900);
    });
    if (hasSocket) {
        socket.on('typing', (profile) => {
        const existing = document.getElementById('typing-indicator');
        if (profile) {
            if (!existing) {
                const el = document.createElement('div'); el.id = 'typing-indicator'; el.textContent = `${profile.name} is typing...`; el.className = 'meta'; chatWindow.appendChild(el);
            }
        } else if (existing) existing.remove();
        });
    }

    // Send message
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value && input.value.trim();
        if (!text) return;
        const sender = senderSelect?.value || currentUser.id;
        const msg = { text, sender, name: currentUser.name, ts: Date.now() };
        if (hasSocket) socket.emit('chat message', msg);
        input.value = '';
    });

    // Edit profiles
    editA?.addEventListener('click', () => {
        const name = prompt('Name for A', nameA?.textContent || 'User A');
        if (name) { nameA.textContent = name; currentUser = { id: 'A', name }; if (hasSocket) socket.emit('profile update', currentUser); }
    });
    editB?.addEventListener('click', () => {
        const name = prompt('Name for B', nameB?.textContent || 'User B');
        if (name) { nameB.textContent = name; currentUser = { id: 'B', name }; if (hasSocket) socket.emit('profile update', currentUser); }
    });

    // Clear chat
    clearBtn?.addEventListener('click', () => { if (!confirm('Clear chat for this room?')) return; if (hasSocket) socket.emit('clear chat'); });

    // Room join / create / share
    joinRoomBtn?.addEventListener('click', () => {
        const pw = passwordInput?.value || null;
        currentUser = { id: senderSelect?.value || 'A', name: nameA?.textContent || 'User A' };
        if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom, password: pw });
        if (passwordSection) passwordSection.classList.add('hidden');
        if (roomLabel) roomLabel.textContent = currentRoom;
    });
    newRoomBtn?.addEventListener('click', () => {
        currentRoom = genId(10);
        const pw = prompt('Set room password (optional)');
        currentUser = { id: senderSelect?.value || 'A', name: nameA?.textContent || 'User A' };
        if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom, password: pw || null });
        if (roomLabel) roomLabel.textContent = currentRoom;
        const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(currentRoom);
        window.history.replaceState({}, '', url);
    });

    copyLinkBtn?.addEventListener('click', async () => {
        const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(currentRoom);
        try {
            await navigator.clipboard.writeText(url);
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => { copyLinkBtn.textContent = 'Share room'; }, 1400);
        } catch (e) {
            const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            alert('Link copied to clipboard (fallback)');
        }
    });

    // Auto-join default room if none provided
    if (!params.has('room')) {
        if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom });
    } else {
        if (passwordSection) passwordSection.classList.remove('hidden');
    }

    // --- Simple page switching (home / chat) and mobile menu ---
    // showSection now maps logical sections to page actions (scroll/focus)
    function showSection(id) {
        // close any mobile nav overlay if present
        const _mobileNav = document.getElementById('mobileNav');
        _mobileNav?.classList.remove('visible');
        if (!id) return;
        if (id === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (id === 'chat') {
            const el = document.getElementById('chatWindow');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        // fallback: try to show element with that id by scrolling
        const target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // initial visible section
    if (params.has('room')) {
        showSection('chat');
    } else {
        showSection('home');
    }

    // mobile menu toggles
    const hamburger = document.getElementById('hamburger');
    const mobileNav = document.getElementById('mobileNav');
    const closeMenu = document.getElementById('closeMenu');
    hamburger?.addEventListener('click', () => mobileNav?.classList.add('visible'));
    closeMenu?.addEventListener('click', () => mobileNav?.classList.remove('visible'));

    // nav links (desktop and mobile)
    const navLinks = Array.from(document.querySelectorAll('[data-section]'));
    navLinks.forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('data-section');
        if (id) showSection(id);
    }));

    // Settings / Logout / Avatar interactions
    settingsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const current = profileNameEl?.textContent || (nameA?.textContent || 'User');
        const newName = prompt('Display name', current);
        if (newName) {
            if (profileNameEl) profileNameEl.textContent = newName;
            // update A/B slots if present
            if (document.getElementById('nameA')) document.getElementById('nameA').textContent = newName;
            if (document.getElementById('nameB')) document.getElementById('nameB').textContent = newName;
            currentUser.name = newName;
            if (hasSocket) socket.emit('profile update', currentUser);
        }
    });

    logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm('Log out?')) return;
        try { if (hasSocket) socket.disconnect(); } catch (err) {}
        // clear UI small state and reload
        window.location.reload();
    });

    // Make large avatar in left sidebar editable (click to edit name)
    const leftAvatar = document.querySelector('.avatar-lg');
    leftAvatar?.addEventListener('click', () => {
        const current = profileNameEl?.textContent || (nameA?.textContent || 'User');
        const newName = prompt('Display name', current);
        if (newName) {
            if (profileNameEl) profileNameEl.textContent = newName;
            if (document.getElementById('nameA')) document.getElementById('nameA').textContent = newName;
            currentUser.name = newName;
            if (hasSocket) socket.emit('profile update', currentUser);
        }
    });

    // --- Simple feed interactions (post creation, like/comment UI) ---
    const postInput = document.getElementById('postInput');
    const postBtn = document.getElementById('postBtn');
    const feedList = document.getElementById('feedList');

    function createPostElement(text, author = 'You') {
        const card = document.createElement('div');
        card.className = 'post-card card mb-3';
        card.innerHTML = `
            <div class="card-body">
                <div class="d-flex align-items-center mb-2">
                    <div class="avatar-sm me-2" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(45deg,#ffd6f2,#ffdede)"></div>
                    <div>
                        <div class="fw-bold">${author}</div>
                        <div class="text-muted small">just now</div>
                    </div>
                </div>
                <p class="post-text">${escapeHtml(text)}</p>
                <div class="d-flex gap-3 small text-muted post-actions">
                    <div class="post-like" role="button"><i class="fas fa-thumbs-up me-1"></i>Like <span class="like-count">0</span></div>
                    <div class="post-comment" role="button"><i class="fas fa-comment me-1"></i>Comment</div>
                    <div class="post-share" role="button"><i class="fas fa-share me-1"></i>Share</div>
                </div>
            </div>
        `;
        return card;
    }

    function escapeHtml(unsafe) {
        return String(unsafe).replace(/[&<>"]+/g, function (m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[m]; });
    }

    postBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const text = postInput?.value && postInput.value.trim();
        if (!text) return;
        const postEl = createPostElement(text, 'You');
        if (feedList) feedList.insertBefore(postEl, feedList.firstChild);
        postInput.value = '';
    });

    // Event delegation for post actions (like/comment/share)
    feedList?.addEventListener('click', (e) => {
        const likeBtn = e.target.closest('.post-like');
        if (likeBtn) {
            const countEl = likeBtn.querySelector('.like-count');
            const v = parseInt(countEl.textContent || '0', 10) + 1;
            countEl.textContent = String(v);
            return;
        }
        const commentBtn = e.target.closest('.post-comment');
        if (commentBtn) {
            const comment = prompt('Write a comment');
            if (comment) alert('Comment posted (UI only)');
            return;
        }
        const shareBtn = e.target.closest('.post-share');
        if (shareBtn) {
            alert('Share dialog (UI-only)');
            return;
        }
    });
};