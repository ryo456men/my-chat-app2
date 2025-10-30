window.onload = function () {
    // --- Simple real-time chat client ---
    const socket = (window.io) ? io() : null;
    // elements for login overlay
    const loginOverlay = document.getElementById('loginOverlay');
    const loginBtn = document.getElementById('loginBtn');
    const loginCancel = document.getElementById('loginCancel');
    const loginNameInput = document.getElementById('loginName');
    const loginIdInput = document.getElementById('loginId');
    // profile modal elements
    const profileModalEl = document.getElementById('profileModal');
    const profileNameInput = document.getElementById('profileNameInput');
    const profileIdInput = document.getElementById('profileIdInput');
    const profileAvatarInput = document.getElementById('profileAvatarInput');
    const profileBioInput = document.getElementById('profileBioInput');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
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

    // bootstrap modal instance (if available)
    let profileModal = null;
    try {
        if (profileModalEl && window.bootstrap && window.bootstrap.Modal) profileModal = new bootstrap.Modal(profileModalEl);
    } catch (e) { profileModal = null; }
        socket.io.on('reconnect_attempt', () => setStatus('connecting'));
    }

    // Fetch server-side persisted data when connected
    if (hasSocket) {
        socket.on('connect', () => {
            socket.emit('list_posts', (srvPosts) => {
                if (!srvPosts || !Array.isArray(srvPosts)) return;
                // cache globally for profile page filtering
                window.__nezumiya_posts = srvPosts;
                if (feedList) {
                    feedList.innerHTML = '';
                    srvPosts.forEach(p => {
                        const el = createPostElement(p.text, p.author?.name || 'Anon');
                        feedList.appendChild(el);
                    });
                }
            });
            socket.emit('list_profiles', (srvProfiles) => {
                if (srvProfiles && Array.isArray(srvProfiles) && srvProfiles.length) {
                    const first = srvProfiles[0];
                    if (first && profileNameEl && profileNameEl.textContent === 'Your Name') profileNameEl.textContent = first.name || 'Your Name';
                }
            });
            socket.emit('list_groups', (srvGroups) => {
                // render groups list in left sidebar
                renderGroups(srvGroups || []);
            });
        });

        socket.on('new_post', (post) => {
            if (!post) return;
            const el = createPostElement(post.text, post.author?.name || 'Anon');
            if (feedList) feedList.insertBefore(el, feedList.firstChild);
        });

        socket.on('profiles', (list) => {
            console.log('profiles updated', list);
        });

        socket.on('group_created', (group) => {
            console.log('group created', group);
            alert('Group created: ' + (group.name || group.id));
            // append to list
            const g = group || {};
            appendGroupToList(g);
        });
    }

    let currentUser = { id: 'A', name: 'User A' };
    let currentRoom = 'default';

    // Groups DOM helpers
    const groupListEl = document.getElementById('groupList');
    function appendGroupToList(g) {
        if (!groupListEl) return;
        // remove placeholder
        const placeholder = groupListEl.querySelector('.text-muted');
        if (placeholder) placeholder.remove();
        const li = document.createElement('li');
        li.className = 'mb-2';
        li.style.cursor = 'pointer';
        li.textContent = g.name || (g.id || 'Unnamed group');
        li.addEventListener('click', () => {
            if (!confirm('Join group "' + (g.name || g.id) + '"?')) return;
            currentRoom = g.id || g.name;
            if (roomLabel) roomLabel.textContent = currentRoom;
            if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom });
            const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(currentRoom);
            window.history.replaceState({}, '', url);
            showSection('chat');
        });
        groupListEl.appendChild(li);
    }
    function renderGroups(list) {
        if (!groupListEl) return;
        groupListEl.innerHTML = '';
        if (!list || !list.length) {
            const li = document.createElement('li'); li.className = 'text-muted small'; li.textContent = 'No groups yet'; groupListEl.appendChild(li); return;
        }
        list.forEach(g => appendGroupToList(g));
    }

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

    // --- Login flow: check localStorage for saved profile, otherwise show overlay ---
    function hideLoginOverlay() { if (loginOverlay) loginOverlay.style.display = 'none'; }
    function showLoginOverlay() { if (loginOverlay) loginOverlay.style.display = 'flex'; }

    function loadLocalProfile() {
        try {
            const raw = localStorage.getItem('nezumiya_profile');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function saveLocalProfile(p) {
        try { localStorage.setItem('nezumiya_profile', JSON.stringify(p)); } catch (e) {}
    }

    // handle login button
    loginBtn?.addEventListener('click', (e) => {
        const name = (loginNameInput && loginNameInput.value && loginNameInput.value.trim()) || null;
        if (!name) { alert('Please enter a display name'); return; }
        const idVal = (loginIdInput && loginIdInput.value && loginIdInput.value.trim()) || genId(8);
        const profile = { id: idVal, name, avatar: '', bio: '' };
        currentUser = profile;
        saveLocalProfile(profile);
        if (profileNameEl) profileNameEl.textContent = name;
        // if socket is connected, create profile on server
        if (hasSocket) {
            if (socket.connected) socket.emit('create_profile', currentUser, () => {});
            else socket.once('connect', () => socket.emit('create_profile', currentUser));
        }
        hideLoginOverlay();
        // join room after login
        if (!params.has('room')) {
            if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom });
        } else {
            if (passwordSection) passwordSection.classList.remove('hidden');
        }
    });

    loginCancel?.addEventListener('click', () => {
        // fallback: hide overlay and allow viewing the page without logging in
        // but we recommend logging in to use chat
        hideLoginOverlay();
    });

    // pre-load profile if present
    const savedProfile = loadLocalProfile();
    if (savedProfile) {
        currentUser = savedProfile;
        if (profileNameEl) profileNameEl.textContent = (currentUser && currentUser.name) || 'Your Name';
        hideLoginOverlay();
        // ensure server knows about this profile
        if (hasSocket) {
            if (socket.connected) socket.emit('create_profile', currentUser, () => {});
            else socket.once('connect', () => socket.emit('create_profile', currentUser));
        }
        // auto-join room when profile already exists
        if (!params.has('room')) {
            if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom });
        } else {
            if (passwordSection) passwordSection.classList.remove('hidden');
        }
    } else {
        // require login before continuing
        showLoginOverlay();
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
            if (userCountEl) userCountEl.textContent = String(users.length || 0);
            // if there are named slots A/B, update them for quick identification
            if (users[0] && document.getElementById('nameA')) document.getElementById('nameA').textContent = users[0].name;
            if (users[1] && document.getElementById('nameB')) document.getElementById('nameB').textContent = users[1].name;

            // make user names clickable to start a DM (added to contacts list)
            const contacts = document.querySelector('.right-sidebar .card ul');
            if (contacts) {
                // clear existing dynamic entries (but keep static header items if any)
                // remove items that have data-uid attribute
                Array.from(contacts.querySelectorAll('li[data-uid]')).forEach(n => n.remove());
                users.forEach(u => {
                    if (!u || u.id === currentUser.id) return;
                    const li = document.createElement('li');
                    li.className = 'mb-2';
                    li.dataset.uid = u.id;
                    li.textContent = u.name;
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => {
                        if (!confirm('Start a private chat with ' + u.name + '?')) return;
                        if (hasSocket) {
                            socket.emit('start_dm', { from: currentUser, to: u }, (res) => {
                                if (res && res.room) {
                                    // join the DM room
                                    currentRoom = res.room;
                                    if (roomLabel) roomLabel.textContent = currentRoom;
                                    if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom });
                                    showSection('chat');
                                    const url = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(currentRoom);
                                    window.history.replaceState({}, '', url);
                                }
                            });
                        }
                    });
                    contacts.appendChild(li);
                });
            }
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
    if (name) { nameA.textContent = name; 
        // only change currentUser when there is no saved profile
        if (!loadLocalProfile()) { currentUser = { id: 'A', name }; if (hasSocket) { socket.emit('profile update', currentUser); socket.emit('create_profile', currentUser); } }
    }
    });
    editB?.addEventListener('click', () => {
        const name = prompt('Name for B', nameB?.textContent || 'User B');
    if (name) { nameB.textContent = name;
        if (!loadLocalProfile()) { currentUser = { id: 'B', name }; if (hasSocket) { socket.emit('profile update', currentUser); socket.emit('create_profile', currentUser); } }
    }
    });

    // Clear chat
    clearBtn?.addEventListener('click', () => { if (!confirm('Clear chat for this room?')) return; if (hasSocket) socket.emit('clear chat'); });

    // Room join / create / share
    joinRoomBtn?.addEventListener('click', () => {
        const pw = passwordInput?.value || null;
        // avoid overwriting an existing full profile
        if (!currentUser || !currentUser.id) currentUser = { id: senderSelect?.value || 'A', name: nameA?.textContent || 'User A' };
        if (hasSocket) socket.emit('join', { profile: currentUser, room: currentRoom, password: pw });
        if (passwordSection) passwordSection.classList.add('hidden');
        if (roomLabel) roomLabel.textContent = currentRoom;
    });
    newRoomBtn?.addEventListener('click', () => {
        currentRoom = genId(10);
        const pw = prompt('Set room password (optional)');
        if (!currentUser || !currentUser.id) currentUser = { id: senderSelect?.value || 'A', name: nameA?.textContent || 'User A' };
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

    // Note: auto-join is handled after login or when a saved profile is detected

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

    // Profile page navigation
    const viewProfileLink = document.getElementById('viewProfileLink');
    const profileSection = document.getElementById('profile');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileUserId = document.getElementById('profileUserId');
    const profileBioEl = document.getElementById('profileBio');
    const profileAvatarLarge = document.getElementById('profileAvatarLarge');
    const profilePostsEl = document.getElementById('profilePosts');
    const editProfileBtn = document.getElementById('editProfileBtn');

    function showProfileSection() {
        // hide feed column and show profile
        const feedCol = document.getElementById('feedColumn');
        if (feedCol) feedCol.style.display = 'none';
        if (profileSection) profileSection.style.display = 'block';
        // render current user profile
        renderProfile(currentUser);
    }

    function hideProfileSection() {
        const feedCol = document.getElementById('feedColumn');
        if (feedCol) feedCol.style.display = 'block';
        if (profileSection) profileSection.style.display = 'none';
    }

    viewProfileLink?.addEventListener('click', (e) => { e.preventDefault(); showProfileSection(); });
    // also support edit button
    editProfileBtn?.addEventListener('click', (e) => { e.preventDefault(); openProfileModal(); });

    function renderProfile(profile) {
        if (!profile) profile = currentUser || {};
        profileDisplayName && (profileDisplayName.textContent = profile.name || 'Your Name');
        profileUserId && (profileUserId.textContent = '@' + (profile.id || 'guest'));
        if (profileBioEl) profileBioEl.textContent = profile.bio || 'No bio yet.';
        if (profileAvatarLarge && profile.avatar) {
            profileAvatarLarge.style.backgroundImage = `url('${profile.avatar}')`;
            profileAvatarLarge.style.backgroundSize = 'cover';
            profileAvatarLarge.style.backgroundPosition = 'center';
        }
        // render user's posts (filter existing feed if loaded)
        if (profilePostsEl) {
            profilePostsEl.innerHTML = '';
            // if we have posts from server (fetched earlier), filter them
            if (Array.isArray(window.__nezumiya_posts) && window.__nezumiya_posts.length) {
                const userPosts = window.__nezumiya_posts.filter(p => (p.author && (p.author.id == profile.id)));
                if (!userPosts.length) {
                    const li = document.createElement('div'); li.className = 'text-muted small'; li.textContent = 'No posts yet'; profilePostsEl.appendChild(li);
                } else {
                    userPosts.forEach(p => {
                        const el = createPostElement(p.text, p.author?.name || 'You');
                        profilePostsEl.appendChild(el);
                    });
                }
            } else {
                const li = document.createElement('div'); li.className = 'text-muted small'; li.textContent = 'No posts yet'; profilePostsEl.appendChild(li);
            }
        }
    }

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
            if (hasSocket) { socket.emit('profile update', currentUser); socket.emit('create_profile', currentUser); }
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
            if (hasSocket) { socket.emit('profile update', currentUser); socket.emit('create_profile', currentUser); }
        }
    });

    // Open profile modal from settings or avatar
    function openProfileModal() {
        // fill with current user values
        const p = currentUser || {};
        profileNameInput && (profileNameInput.value = p.name || '');
        profileIdInput && (profileIdInput.value = p.id || '');
        profileAvatarInput && (profileAvatarInput.value = p.avatar || '');
        profileBioInput && (profileBioInput.value = p.bio || '');
        if (profileModal) profileModal.show();
        else profileModalEl && (profileModalEl.style.display = 'block');
    }

    // wire settings menu to open profile modal
    settingsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openProfileModal();
    });

    // Save profile handler
    saveProfileBtn?.addEventListener('click', () => {
        const name = profileNameInput?.value && profileNameInput.value.trim();
        if (!name) { alert('Please enter a display name'); return; }
        const id = profileIdInput?.value && profileIdInput.value.trim() || genId(8);
        const avatar = profileAvatarInput?.value && profileAvatarInput.value.trim();
        const bio = profileBioInput?.value && profileBioInput.value.trim();
        const profile = { id, name, avatar, bio };
        // keep the full profile object as currentUser
        currentUser = profile;
        // update UI
        if (profileNameEl) profileNameEl.textContent = name;
        if (document.querySelector('.avatar-lg') && avatar) {
            const el = document.querySelector('.avatar-lg');
            el.style.backgroundImage = `url('${avatar}')`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
        }
        // persist locally and to server
        saveLocalProfile(profile);
        if (hasSocket) socket.emit('create_profile', profile, (res) => {});
        // close modal
        if (profileModal) profileModal.hide();
        else profileModalEl && (profileModalEl.style.display = 'none');
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
        const postObj = { author: { id: currentUser.id, name: currentUser.name }, text };
        if (hasSocket) {
            socket.emit('create_post', postObj, (res) => {
                if (res && res.ok) {
                    postInput.value = '';
                } else {
                    alert('Failed to post');
                }
            });
        } else {
            const postEl = createPostElement(text, 'You');
            if (feedList) feedList.insertBefore(postEl, feedList.firstChild);
            postInput.value = '';
        }
    });

    // Create group UI
    const createGroupBtn = document.getElementById('createGroupBtn');
    createGroupBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const name = prompt('Group name');
        if (!name) return;
        const membersCsv = prompt('Member IDs (comma separated), leave blank for none');
        const members = membersCsv ? membersCsv.split(',').map(s => s.trim()).filter(Boolean) : [];
        const group = { name, members };
        if (hasSocket) {
            socket.emit('create_group', group, (res) => {
                if (res && res.ok) {
                    alert('Group created: ' + res.group.name);
                } else alert('Failed to create group');
            });
        } else {
            alert('Group created locally (no server)');
        }
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