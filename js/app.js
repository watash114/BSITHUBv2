// ==========================================
// BSITHUB v2.0.1 - Main Application
// ==========================================
const APP_VERSION = '2.0.0';

// ==========================================
// Storage Manager
// ==========================================
const Storage = {
    get(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
        localStorage.removeItem(key);
    }
};

// Security: Simple hash function
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(16);
}

// Generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Format date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format time
function formatTime(date) {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateSeparator(date) {
    const now = new Date();
    const msgDate = new Date(date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today - 86400000);
    const msgDay = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    if (msgDay.getTime() === today.getTime()) return 'Today';
    if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
    return formatDate(date);
}

function formatLastSeen(date) {
    const diffMs = Date.now() - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + ' min ago';
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return diffHours + ' hours ago';
    return formatDate(date);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    toast.innerHTML = '<i class="' + icons[type] + '"></i><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function() {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

// ==========================================
// Modal
// ==========================================
function showModal(content) {
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// ==========================================
// Initialize Default Data
// ==========================================
function initializeDefaultData() {
    if (!Storage.get('users')) {
        Storage.set('users', [
            { id: 'admin1', name: 'Admin User', username: 'admin', email: 'admin@bsithub.com', password: hashPassword('admin123'), role: 'admin', status: 'active', bio: 'System Administrator', phone: '+1234567890', location: 'New York', createdAt: '2024-01-01T00:00:00.000Z', avatar: null, blockedUsers: [] },
            { id: 'user1', name: 'John Doe', username: 'johndoe', email: 'john@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'Software Developer', phone: '+1234567891', location: 'San Francisco', createdAt: '2024-02-15T00:00:00.000Z', avatar: null, blockedUsers: [] },
            { id: 'user2', name: 'Jane Smith', username: 'janesmith', email: 'jane@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'UX Designer', phone: '+1234567892', location: 'Los Angeles', createdAt: '2024-03-01T00:00:00.000Z', avatar: null, blockedUsers: [] }
        ]);
    }
    if (!Storage.get('chats')) {
        Storage.set('chats', [
            { id: 'chat1', participants: ['user1', 'user2'], createdAt: '2024-03-01T00:00:00.000Z', pinned: false, muted: false, archived: false, isGroup: false }
        ]);
    }
    if (!Storage.get('messages')) {
        Storage.set('messages', [
            { id: 'msg1', chatId: 'chat1', senderId: 'user2', text: 'Hey John! How are you?', timestamp: '2024-03-20T10:00:00.000Z', read: true, status: 'read', reactions: {}, edited: false, starred: false, replyTo: null, forwarded: false },
            { id: 'msg2', chatId: 'chat1', senderId: 'user1', text: 'Hi Jane! Doing great, thanks!', timestamp: '2024-03-20T10:05:00.000Z', read: true, status: 'read', reactions: {}, edited: false, starred: false, replyTo: null, forwarded: false }
        ]);
    }
    if (!Storage.get('settings')) {
        Storage.set('settings', { darkMode: false, fontSize: 'medium', soundAlerts: true, onlineStatus: true, readReceipts: true, typingIndicator: true, browserNotifications: false });
    }
    if (!Storage.get('logs')) {
        Storage.set('logs', []);
    }
    if (!Storage.get('starredMessages')) {
        Storage.set('starredMessages', []);
    }
}

// ==========================================
// Global State
// ==========================================
let currentUser = null;
let activeChat = null;
let peer = null;
let localStream = null;
let currentCall = null;
let isVideoCall = false;
let callTimerInterval = null;
let pinnedChatsView = false;

// ==========================================
// Authentication
// ==========================================
function login(email, password) {
    const users = Storage.get('users') || [];
    const hashedPassword = hashPassword(password);
    const user = users.find(function(u) { return u.email === email && u.password === hashedPassword; });
    
    if (!user) return { success: false, message: 'Invalid email or password' };
    if (user.status === 'banned') return { success: false, message: 'Your account has been banned' };
    
    currentUser = user;
    Storage.set('currentUser', { id: user.id });
    addLog('info', 'User ' + user.username + ' logged in');
    return { success: true };
}

function register(name, username, email, password) {
    const users = Storage.get('users') || [];
    if (users.find(function(u) { return u.email === email; })) return { success: false, message: 'Email already registered' };
    if (users.find(function(u) { return u.username === username; })) return { success: false, message: 'Username already taken' };
    
    const newUser = {
        id: generateId(),
        name: name,
        username: username,
        email: email,
        password: hashPassword(password),
        role: 'user',
        status: 'active',
        bio: '',
        phone: '',
        location: '',
        createdAt: new Date().toISOString(),
        avatar: null,
        blockedUsers: []
    };
    
    users.push(newUser);
    Storage.set('users', users);
    currentUser = newUser;
    Storage.set('currentUser', { id: newUser.id });
    addLog('info', 'New user registered: ' + username);
    return { success: true };
}

function logout() {
    if (peer) {
        try { peer.destroy(); } catch(e) {}
    }
    currentUser = null;
    Storage.remove('currentUser');
    showAuthPage();
}

function addLog(type, message) {
    const logs = Storage.get('logs') || [];
    logs.unshift({ id: generateId(), type: type, message: message, timestamp: new Date().toISOString() });
    if (logs.length > 50) logs.pop();
    Storage.set('logs', logs);
}

// ==========================================
// Page Navigation
// ==========================================
function showAuthPage() {
    document.getElementById('auth-page').classList.add('active');
    document.getElementById('app-page').classList.remove('active');
}

function showApp() {
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('app-page').classList.add('active');
    initializeApp();
}

function initAuth() {
    const savedUser = Storage.get('currentUser');
    if (savedUser) {
        const users = Storage.get('users') || [];
        const user = users.find(function(u) { return u.id === savedUser.id; });
        if (user && user.status === 'active') {
            currentUser = user;
            showApp();
            return;
        }
    }
    showAuthPage();
}

// ==========================================
// App Initialization
// ==========================================
function initializeApp() {
    updateSidebar();
    applySettings();
    loadChats();
    loadProfile();
    initNavigation();
    
    // Try to initialize PeerJS (non-blocking)
    setTimeout(function() {
        try {
            initPeerJS();
        } catch(e) {
            console.warn('PeerJS not available:', e);
        }
    }, 1000);
    
    // Admin check
    if (currentUser.role === 'admin') {
        document.querySelector('.admin-only').classList.add('visible');
        loadAdminData();
    } else {
        document.querySelector('.admin-only').classList.remove('visible');
    }
}

function updateSidebar() {
    document.getElementById('sidebar-username').textContent = currentUser.username;
}

// ==========================================
// Navigation
// ==========================================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.onclick = function(e) {
            e.preventDefault();
            var section = this.dataset.section;
            
            document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
            this.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
            document.getElementById(section + '-section').classList.add('active');
            
            if (section === 'chats') loadChats();
            if (section === 'profile') loadProfile();
            if (section === 'admin') loadAdminData();
        };
    });
}

// ==========================================
// Chats
// ==========================================
function loadChats() {
    var chatList = document.getElementById('chat-list');
    var chats = Storage.get('chats') || [];
    var messages = Storage.get('messages') || [];
    var users = Storage.get('users') || [];
    
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && !c.archived; });
    
    if (pinnedChatsView) {
        myChats = myChats.filter(function(c) { return c.pinned; });
    }
    
    myChats.sort(function(a, b) {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
    });
    
    var html = '';
    myChats.forEach(function(chat) {
        var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
        var otherUser = users.find(function(u) { return u.id === otherUserId; });
        if (!otherUser) return;
        
        var chatMessages = messages.filter(function(m) { return m.chatId === chat.id; });
        var lastMessage = chatMessages[chatMessages.length - 1];
        var unreadCount = chatMessages.filter(function(m) { return !m.read && m.senderId !== currentUser.id; }).length;
        var isActive = activeChat && activeChat.id === chat.id;
        
        html += '<div class="chat-item ' + (isActive ? 'active' : '') + (chat.pinned ? ' pinned' : '') + '" data-chat-id="' + chat.id + '" data-user-id="' + otherUser.id + '">';
        html += '<div class="chat-item-avatar-wrapper"><div class="chat-item-avatar">' + (otherUser.avatar ? '<img src="' + otherUser.avatar + '">' : otherUser.name.charAt(0).toUpperCase()) + '</div></div>';
        html += '<div class="chat-item-info"><div class="chat-item-name">' + otherUser.name + '</div>';
        html += '<div class="chat-item-message">' + (lastMessage ? escapeHtml(lastMessage.text).substring(0, 30) : 'No messages yet') + '</div></div>';
        html += '<div class="chat-item-meta"><div class="chat-item-time">' + (lastMessage ? formatTime(lastMessage.timestamp) : '') + '</div>';
        if (unreadCount > 0) html += '<span class="chat-item-badge">' + unreadCount + '</span>';
        html += '</div></div>';
    });
    
    chatList.innerHTML = html;
    
    chatList.querySelectorAll('.chat-item').forEach(function(item) {
        item.onclick = function() {
            openChat(item.dataset.chatId, item.dataset.userId);
        };
    });
}

function openChat(chatId, userId) {
    var users = Storage.get('users') || [];
    var otherUser = users.find(function(u) { return u.id === userId; });
    if (!otherUser) return;
    
    activeChat = { id: chatId, userId: userId };
    
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-active').style.display = 'flex';
    document.getElementById('chat-user-name').textContent = otherUser.name;
    document.getElementById('chat-user-status').textContent = 'Online';
    
    renderMessages(chatId);
    
    document.querySelectorAll('.chat-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.chatId === chatId) item.classList.add('active');
    });
}

function renderMessages(chatId) {
    var messages = Storage.get('messages') || [];
    var messagesContainer = document.getElementById('chat-messages');
    var chatMessages = messages.filter(function(m) { return m.chatId === chatId; });
    
    // Mark as read
    chatMessages.forEach(function(msg) {
        if (!msg.read && msg.senderId !== currentUser.id) {
            msg.read = true;
            msg.status = 'read';
        }
    });
    Storage.set('messages', messages);
    
    var html = '';
    chatMessages.forEach(function(msg) {
        var isSent = msg.senderId === currentUser.id;
        html += '<div class="message ' + (isSent ? 'sent' : 'received') + '">';
        html += '<div class="message-text">' + escapeHtml(msg.text) + '</div>';
        html += '<div class="message-time">' + formatTime(msg.timestamp) + '</div>';
        html += '</div>';
    });
    
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage(text) {
    if (!activeChat || !text.trim()) return;
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    renderMessages(activeChat.id);
    loadChats();
    
    // Simulate reply
    setTimeout(function() {
        simulateReply();
    }, 2000);
}

function simulateReply() {
    if (!activeChat) return;
    var replies = ['Sounds good!', 'I agree!', 'Let me think about it.', 'Thanks!', 'Got it!', 'Sure thing!'];
    
    var messages = Storage.get('messages') || [];
    var reply = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: activeChat.userId,
        text: replies[Math.floor(Math.random() * replies.length)],
        timestamp: new Date().toISOString(),
        read: true,
        status: 'read',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    
    messages.push(reply);
    Storage.set('messages', messages);
    renderMessages(activeChat.id);
    loadChats();
}

function startNewChat() {
    var users = Storage.get('users') || [];
    var chats = Storage.get('chats') || [];
    var availableUsers = users.filter(function(u) {
        return u.id !== currentUser.id && u.status === 'active' &&
               !chats.some(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && c.participants.indexOf(u.id) !== -1; });
    });
    
    if (availableUsers.length === 0) {
        showToast('No users available', 'info');
        return;
    }
    
    var html = '<div class="modal-header"><h3>New Chat</h3><button class="modal-close" onclick="closeModal()">&times;</button></div><div class="chat-list">';
    availableUsers.forEach(function(user) {
        html += '<div class="chat-item" onclick="createNewChat(\'' + user.id + '\')">';
        html += '<div class="chat-item-avatar">' + user.name.charAt(0).toUpperCase() + '</div>';
        html += '<div class="chat-item-info"><div class="chat-item-name">' + user.name + '</div>';
        html += '<div class="chat-item-message">@' + user.username + '</div></div></div>';
    });
    html += '</div>';
    
    showModal(html);
}

function createNewChat(userId) {
    var chats = Storage.get('chats') || [];
    var newChat = {
        id: generateId(),
        participants: [currentUser.id, userId],
        createdAt: new Date().toISOString(),
        pinned: false,
        muted: false,
        archived: false,
        isGroup: false
    };
    chats.push(newChat);
    Storage.set('chats', chats);
    closeModal();
    loadChats();
    openChat(newChat.id, userId);
}

// ==========================================
// Profile
// ==========================================
function loadProfile() {
    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-username').textContent = '@' + currentUser.username;
    document.getElementById('profile-bio').textContent = currentUser.bio || 'No bio yet';
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-username').value = currentUser.username;
    document.getElementById('edit-email').value = currentUser.email;
    document.getElementById('edit-bio').value = currentUser.bio || '';
    document.getElementById('edit-phone').value = currentUser.phone || '';
    document.getElementById('edit-location').value = currentUser.location || '';
    
    var chats = Storage.get('chats') || [];
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
    document.getElementById('profile-chats').textContent = myChats.length;
    document.getElementById('profile-friends').textContent = (Storage.get('users') || []).length - 1;
    document.getElementById('profile-joined').textContent = formatDate(currentUser.createdAt);
}

function updateProfile(data) {
    var users = Storage.get('users') || [];
    var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
    if (userIndex === -1) return;
    
    users[userIndex] = Object.assign(users[userIndex], data);
    Storage.set('users', users);
    currentUser = users[userIndex];
    updateSidebar();
    loadProfile();
    showToast('Profile updated', 'success');
}

// ==========================================
// Settings
// ==========================================
function applySettings() {
    var settings = Storage.get('settings') || {};
    if (settings.darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function initSettings() {
    var darkToggle = document.getElementById('dark-mode-toggle');
    if (darkToggle) {
        darkToggle.checked = (Storage.get('settings') || {}).darkMode;
        darkToggle.onchange = function() {
            var settings = Storage.get('settings') || {};
            settings.darkMode = this.checked;
            Storage.set('settings', settings);
            applySettings();
            showToast(this.checked ? 'Dark mode on' : 'Dark mode off', 'info');
        };
    }
}

// ==========================================
// Admin
// ==========================================
function loadAdminData() {
    if (!currentUser || currentUser.role !== 'admin') return;
    var users = Storage.get('users') || [];
    var messages = Storage.get('messages') || [];
    
    document.getElementById('total-users').textContent = users.length;
    document.getElementById('total-messages').textContent = messages.length;
    document.getElementById('active-users').textContent = users.filter(function(u) { return u.status === 'active'; }).length;
    document.getElementById('banned-users').textContent = users.filter(function(u) { return u.status === 'banned'; }).length;
    
    var tbody = document.getElementById('users-table-body');
    tbody.innerHTML = users.map(function(user) {
        return '<tr><td>' + user.name + '</td><td>' + user.email + '</td><td><span class="role-badge ' + user.role + '">' + user.role + '</span></td><td>' + user.status + '</td><td>' + formatDate(user.createdAt) + '</td></tr>';
    }).join('');
}

// ==========================================
// PeerJS / Calls
// ==========================================
var callPollInterval = null;

function initPeerJS() {
    if (typeof Peer === 'undefined') {
        console.log('PeerJS not loaded');
        return;
    }
    
    var peerId = currentUser.id + '_' + Math.random().toString(36).substr(2, 8);
    console.log('Creating peer with ID:', peerId);
    
    try {
        peer = new Peer(peerId);
    } catch(e) {
        console.error('Failed to create peer:', e);
        return;
    }
    
    peer.on('open', function(id) {
        console.log('PeerJS connected:', id);
        // Store peer ID so other tabs can find us
        localStorage.setItem('bsithub_peer_' + currentUser.id, JSON.stringify({
            peerId: id,
            timestamp: Date.now()
        }));
        showToast('Ready for calls', 'info');
    });
    
    peer.on('error', function(err) {
        console.error('PeerJS error:', err.type, err.message);
    });
    
    peer.on('call', function(call) {
        console.log('Incoming call from:', call.peer);
        var callerUserId = call.peer.split('_')[0];
        var users = Storage.get('users') || [];
        var caller = users.find(function(u) { return u.id === callerUserId; });
        
        if (caller) {
            currentCall = call;
            isVideoCall = call.metadata && call.metadata.isVideo;
            showIncomingCall(caller, isVideoCall);
        }
    });
    
    // Poll for call signals from other tabs
    callPollInterval = setInterval(pollForCalls, 1000);
}

function pollForCalls() {
    if (!currentUser || !peer) return;
    
    try {
        // Check for call signals meant for us
        var callSignal = localStorage.getItem('bsithub_call_' + currentUser.id);
        if (callSignal) {
            var signal = JSON.parse(callSignal);
            if (signal && !signal.processed) {
                // Mark as processed
                signal.processed = true;
                localStorage.setItem('bsithub_call_' + currentUser.id, JSON.stringify(signal));
                
                // Show incoming call UI
                var users = Storage.get('users') || [];
                var caller = users.find(function(u) { return u.id === signal.callerId; });
                if (caller) {
                    window.callerPeerId = signal.callerPeerId;
                    isVideoCall = signal.isVideo;
                    showIncomingCall(caller, isVideoCall);
                }
            }
        }
    } catch(e) {}
}

function startVoiceCall() {
    if (!activeChat) { showToast('Select a chat first', 'info'); return; }
    if (!peer) { showToast('Call service not ready. Please refresh and try again.', 'error'); return; }
    initiateCall(false);
}

function startVideoCall() {
    if (!activeChat) { showToast('Select a chat first', 'info'); return; }
    if (!peer) { showToast('Call service not ready. Please refresh and try again.', 'error'); return; }
    initiateCall(true);
}

function initiateCall(isVideo) {
    var targetUserId = activeChat.userId;
    
    console.log('Initiating call to:', targetUserId);
    showToast('Calling...', 'info');
    
    // Get target user's peer ID
    var targetPeerData = localStorage.getItem('bsithub_peer_' + targetUserId);
    var targetPeerId = null;
    
    if (targetPeerData) {
        try {
            var data = JSON.parse(targetPeerData);
            if (data && data.peerId && (Date.now() - data.timestamp < 60000)) {
                targetPeerId = data.peerId;
            }
        } catch(e) {}
    }
    
    if (!targetPeerId) {
        showToast('User is offline. Please make sure they have BSITHUB open.', 'error');
        return;
    }
    
    console.log('Target peer ID:', targetPeerId);
    
    // Send call signal to target
    localStorage.setItem('bsithub_call_' + targetUserId, JSON.stringify({
        callerId: currentUser.id,
        callerPeerId: peer.id,
        isVideo: isVideo,
        timestamp: Date.now(),
        processed: false
    }));
    
    // Get user media and place the call
    navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true })
        .then(function(stream) {
            localStream = stream;
            showCallUI(targetUserId, isVideo);
            document.getElementById('call-status').textContent = 'Calling...';
            
            var call = peer.call(targetPeerId, stream, {
                metadata: { isVideo: isVideo, callerId: currentUser.id }
            });
            
            if (call) {
                currentCall = call;
                
                call.on('stream', function(remoteStream) {
                    console.log('Call connected!');
                    document.getElementById('remote-video').srcObject = remoteStream;
                    document.getElementById('call-status').textContent = 'Connected';
                    startCallTimer();
                });
                
                call.on('close', function() {
                    console.log('Call ended');
                    endCall();
                });
                
                call.on('error', function(err) {
                    console.error('Call error:', err);
                    showToast('Call failed', 'error');
                    endCall();
                });
            }
            
            // Timeout for no answer
            setTimeout(function() {
                if (document.getElementById('call-status').textContent === 'Calling...') {
                    showToast('No answer', 'info');
                    endCall();
                }
            }, 30000);
        })
        .catch(function(err) {
            console.error('Media error:', err);
            if (err.name === 'NotAllowedError') {
                showToast('Camera/microphone permission denied', 'error');
            } else {
                showToast('Could not access camera/microphone', 'error');
            }
        });
}

function showIncomingCall(caller, isVideo) {
    console.log('Showing incoming call from:', caller.name);
    document.getElementById('incoming-call-name').textContent = caller.name;
    document.getElementById('incoming-call-type').textContent = isVideo ? 'Incoming Video Call' : 'Incoming Voice Call';
    document.getElementById('incoming-call-overlay').style.display = 'flex';
    
    // Play ring sound
    try {
        var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 440;
        gain.gain.value = 0.1;
        osc.start();
        setTimeout(function() { osc.stop(); }, 2000);
    } catch(e) {}
}

function acceptCall() {
    document.getElementById('incoming-call-overlay').style.display = 'none';
    
    var callerPeerId = currentCall ? currentCall.peer : window.callerPeerId;
    var callerUserId = callerPeerId ? callerPeerId.split('_')[0] : null;
    
    console.log('Accepting call. Caller peer:', callerPeerId);
    
    navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true })
        .then(function(stream) {
            localStream = stream;
            
            if (currentCall && currentCall.answer) {
                // Answer the incoming call
                currentCall.answer(stream);
                showCallUI(callerUserId, isVideoCall);
                document.getElementById('call-status').textContent = 'Connected';
                
                currentCall.on('stream', function(remoteStream) {
                    console.log('Got remote stream');
                    document.getElementById('remote-video').srcObject = remoteStream;
                    startCallTimer();
                });
                
                currentCall.on('close', function() {
                    endCall();
                });
            } else if (window.callerPeerId) {
                // Call back to the caller
                var call = peer.call(window.callerPeerId, stream, {
                    metadata: { isVideo: isVideoCall, callerId: currentUser.id }
                });
                
                if (call) {
                    currentCall = call;
                    showCallUI(callerUserId, isVideoCall);
                    document.getElementById('call-status').textContent = 'Connected';
                    
                    call.on('stream', function(remoteStream) {
                        document.getElementById('remote-video').srcObject = remoteStream;
                        startCallTimer();
                    });
                    
                    call.on('close', function() {
                        endCall();
                    });
                }
            }
            
            window.callerPeerId = null;
        })
        .catch(function(err) {
            console.error('Media error:', err);
            showToast('Could not access camera/microphone', 'error');
        });
}

function declineCall() {
    document.getElementById('incoming-call-overlay').style.display = 'none';
    if (currentCall) {
        try { currentCall.close(); } catch(e) {}
        currentCall = null;
    }
    window.callerPeerId = null;
}

function showCallUI(userId, isVideo) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === userId; });
    document.getElementById('call-name').textContent = user ? user.name : 'User';
    document.getElementById('call-status').textContent = 'Connecting...';
    document.getElementById('call-timer').style.display = 'none';
    document.getElementById('call-timer').textContent = '00:00';
    document.getElementById('call-overlay').style.display = 'flex';
    
    var videoContainer = document.querySelector('.call-video-container');
    if (videoContainer) {
        videoContainer.style.display = isVideo ? 'block' : 'none';
    }
    
    // Show local video if video call
    if (localStream && isVideo) {
        document.getElementById('local-video').srcObject = localStream;
    }
}

function startCallTimer() {
    var startTime = Date.now();
    document.getElementById('call-timer').style.display = 'block';
    
    if (callTimerInterval) clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - startTime) / 1000);
        var mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        var secs = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('call-timer').textContent = mins + ':' + secs;
    }, 1000);
}

function endCall() {
    console.log('Ending call');
    document.getElementById('call-overlay').style.display = 'none';
    document.getElementById('incoming-call-overlay').style.display = 'none';
    
    if (currentCall) {
        try { currentCall.close(); } catch(e) {}
        currentCall = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(function(track) { track.stop(); });
        localStream = null;
    }
    
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    
    document.getElementById('remote-video').srcObject = null;
    document.getElementById('local-video').srcObject = null;
}

function toggleMicrophone() {
    if (localStream) {
        var audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            audioTracks[0].enabled = !audioTracks[0].enabled;
            var btn = document.getElementById('toggle-mic-btn');
            btn.classList.toggle('active');
            btn.innerHTML = audioTracks[0].enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
        }
    }
}

function toggleVideo() {
    if (localStream) {
        var videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            videoTracks[0].enabled = !videoTracks[0].enabled;
            var btn = document.getElementById('toggle-video-btn');
            btn.classList.toggle('active');
            btn.innerHTML = videoTracks[0].enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
        }
    }
}

// ==========================================
// Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    initializeDefaultData();
    
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(function(tab) {
        tab.onclick = function() {
            document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
            document.getElementById(this.dataset.tab + '-form').classList.add('active');
        };
    });
    
    // Login form
    document.getElementById('login-form').onsubmit = function(e) {
        e.preventDefault();
        var email = document.getElementById('login-email').value;
        var password = document.getElementById('login-password').value;
        var result = login(email, password);
        
        if (result.success) {
            showToast('Welcome back!', 'success');
            showApp();
        } else {
            document.getElementById('login-error').textContent = result.message;
            document.getElementById('login-error').style.display = 'block';
        }
    };
    
    // Register form
    document.getElementById('register-form').onsubmit = function(e) {
        e.preventDefault();
        var name = document.getElementById('register-name').value;
        var username = document.getElementById('register-username').value;
        var email = document.getElementById('register-email').value;
        var password = document.getElementById('register-password').value;
        var confirm = document.getElementById('register-confirm').value;
        
        if (password !== confirm) {
            document.getElementById('register-error').textContent = 'Passwords do not match';
            document.getElementById('register-error').style.display = 'block';
            return;
        }
        if (password.length < 6) {
            document.getElementById('register-error').textContent = 'Password must be 6+ characters';
            document.getElementById('register-error').style.display = 'block';
            return;
        }
        
        var result = register(name, username, email, password);
        if (result.success) {
            showToast('Account created!', 'success');
            showApp();
        } else {
            document.getElementById('register-error').textContent = result.message;
            document.getElementById('register-error').style.display = 'block';
        }
    };
    
    // Chat actions
    document.getElementById('new-chat-btn').onclick = startNewChat;
    document.getElementById('send-btn').onclick = function() {
        var input = document.getElementById('message-input');
        sendMessage(input.value);
        input.value = '';
    };
    document.getElementById('message-input').onkeypress = function(e) {
        if (e.key === 'Enter') {
            sendMessage(this.value);
            this.value = '';
        }
    };
    
    // Profile form
    document.getElementById('profile-form').onsubmit = function(e) {
        e.preventDefault();
        updateProfile({
            name: document.getElementById('edit-name').value,
            username: document.getElementById('edit-username').value,
            email: document.getElementById('edit-email').value,
            bio: document.getElementById('edit-bio').value,
            phone: document.getElementById('edit-phone').value,
            location: document.getElementById('edit-location').value
        });
    };
    
    // Logout
    document.getElementById('logout-btn').onclick = logout;
    
    // Call buttons
    document.querySelector('[title="Voice Call"]').onclick = startVoiceCall;
    document.querySelector('[title="Video Call"]').onclick = startVideoCall;
    document.getElementById('end-call-btn').onclick = endCall;
    document.getElementById('toggle-mic-btn').onclick = toggleMicrophone;
    document.getElementById('toggle-video-btn').onclick = toggleVideo;
    document.getElementById('accept-call-btn').onclick = acceptCall;
    document.getElementById('decline-call-btn').onclick = declineCall;
    
    // Modal close
    document.getElementById('modal').onclick = function(e) {
        if (e.target.id === 'modal') closeModal();
    };
    
    // Initialize
    initAuth();
    initSettings();
});