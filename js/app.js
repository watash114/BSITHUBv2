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
            if (section === 'groups') loadGroups();
            if (section === 'profile') loadProfile();
            if (section === 'admin') loadAdminData();
        };
    });
}

// ==========================================
// Groups
// ==========================================
function loadGroups() {
    var groupsContainer = document.getElementById('groups-container');
    var chats = Storage.get('chats') || [];
    var myGroups = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && c.isGroup; });
    
    if (myGroups.length === 0) {
        groupsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No groups yet</p><p>Create a group to get started</p></div>';
        return;
    }
    
    var html = '';
    myGroups.forEach(function(group) {
        html += '<div class="group-card" onclick="openChat(\'' + group.id + '\', \'' + group.participants[0] + '\')">';
        html += '<div class="group-avatar"><i class="fas fa-users"></i></div>';
        html += '<div class="group-name">' + (group.groupName || 'Group') + '</div>';
        html += '<div class="group-members">' + group.participants.length + ' members</div>';
        html += '</div>';
    });
    
    groupsContainer.innerHTML = html;
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
        var chatMessages = messages.filter(function(m) { return m.chatId === chat.id; });
        var lastMessage = chatMessages[chatMessages.length - 1];
        var unreadCount = chatMessages.filter(function(m) { return !m.read && m.senderId !== currentUser.id; }).length;
        var isActive = activeChat && activeChat.id === chat.id;
        
        var chatName = '';
        var chatAvatar = '';
        var chatUserId = '';
        
        if (chat.isGroup) {
            chatName = chat.groupName || 'Group';
            chatAvatar = '<i class="fas fa-users"></i>';
            chatUserId = chat.participants[0];
        } else {
            var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
            var otherUser = users.find(function(u) { return u.id === otherUserId; });
            if (!otherUser) return;
            chatName = otherUser.name;
            chatAvatar = otherUser.avatar ? '<img src="' + otherUser.avatar + '">' : otherUser.name.charAt(0).toUpperCase();
            chatUserId = otherUserId;
        }
        
        html += '<div class="chat-item ' + (isActive ? 'active' : '') + (chat.pinned ? ' pinned' : '') + '" data-chat-id="' + chat.id + '" data-user-id="' + chatUserId + '">';
        html += '<div class="chat-item-avatar-wrapper"><div class="chat-item-avatar">' + chatAvatar + '</div></div>';
        html += '<div class="chat-item-info"><div class="chat-item-name">' + chatName + '</div>';
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
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    if (!chat) return;
    
    activeChat = { id: chatId, userId: userId };
    
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-active').style.display = 'flex';
    
    if (chat.isGroup) {
        document.getElementById('chat-user-name').textContent = chat.groupName || 'Group';
        document.getElementById('chat-user-status').textContent = chat.participants.length + ' members';
    } else {
        var users = Storage.get('users') || [];
        var otherUser = users.find(function(u) { return u.id === userId; });
        if (!otherUser) return;
        document.getElementById('chat-user-name').textContent = otherUser.name;
        document.getElementById('chat-user-status').textContent = 'Online';
    }
    
    // Apply wallpaper
    var wallpaper = chat.wallpaper || (Storage.get('settings') || {}).wallpaper || 'none';
    document.getElementById('chat-wallpaper').style.background = wallpaper;
    
    renderMessages(chatId);
    
    document.querySelectorAll('.chat-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.chatId === chatId) item.classList.add('active');
    });
}

function loadChatMessages(chatId) {
    renderMessages(chatId);
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
        
        // Check for image
        if (msg.fileData && msg.fileType && msg.fileType.startsWith('image/')) {
            html += '<div class="message-media"><img src="' + msg.fileData + '" alt="Image" onclick="viewImage(this.src)"></div>';
        }
        // Check for audio
        else if (msg.audioData) {
            html += '<div class="message-audio"><audio controls src="' + msg.audioData + '"></audio></div>';
        }
        // Check for file
        else if (msg.fileData) {
            html += '<div class="message-file"><a href="' + msg.fileData + '" download="' + (msg.fileName || 'file') + '">' + escapeHtml(msg.text) + '</a></div>';
        }
        // Regular text
        else {
            html += '<div class="message-text">' + escapeHtml(msg.text) + '</div>';
        }
        
        html += '<div class="message-time">' + formatTime(msg.timestamp) + '</div>';
        html += '</div>';
    });
    
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function viewImage(src) {
    showModal('<div class="image-viewer"><img src="' + src + '" style="max-width:100%;max-height:80vh;"></div>');
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
    if (settings.fontSize) {
        document.documentElement.style.fontSize = settings.fontSize === 'small' ? '14px' : settings.fontSize === 'large' ? '18px' : '16px';
    }
}

function initSettings() {
    var settings = Storage.get('settings') || {};
    
    // Dark mode toggle
    var darkToggle = document.getElementById('dark-mode-toggle');
    if (darkToggle) {
        darkToggle.checked = settings.darkMode || false;
        darkToggle.onchange = function() {
            settings.darkMode = this.checked;
            Storage.set('settings', settings);
            applySettings();
            showToast(this.checked ? 'Dark mode on' : 'Dark mode off', 'info');
        };
    }
    
    // Font size select
    var fontSizeSelect = document.getElementById('font-size-select');
    if (fontSizeSelect) {
        fontSizeSelect.value = settings.fontSize || 'medium';
        fontSizeSelect.onchange = function() {
            settings.fontSize = this.value;
            Storage.set('settings', settings);
            applySettings();
            showToast('Font size: ' + this.value, 'info');
        };
    }
    
    // Push notifications
    var pushNotif = document.getElementById('push-notifications');
    if (pushNotif) {
        pushNotif.checked = settings.pushNotifications !== false;
        pushNotif.onchange = function() {
            settings.pushNotifications = this.checked;
            Storage.set('settings', settings);
            if (this.checked && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
            showToast(this.checked ? 'Push notifications on' : 'Push notifications off', 'info');
        };
    }
    
    // Sound alerts
    var soundAlerts = document.getElementById('sound-alerts');
    if (soundAlerts) {
        soundAlerts.checked = settings.sound !== false;
        soundAlerts.onchange = function() {
            settings.sound = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Sound alerts on' : 'Sound alerts off', 'info');
        };
    }
    
    // Email notifications
    var emailNotif = document.getElementById('email-notifications');
    if (emailNotif) {
        emailNotif.checked = settings.emailNotifications || false;
        emailNotif.onchange = function() {
            settings.emailNotifications = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Email notifications on' : 'Email notifications off', 'info');
        };
    }
    
    // Browser notifications
    var browserNotif = document.getElementById('browser-notifications');
    if (browserNotif) {
        browserNotif.checked = settings.browserNotifications || false;
        browserNotif.onchange = function() {
            settings.browserNotifications = this.checked;
            Storage.set('settings', settings);
            if (this.checked && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
            showToast(this.checked ? 'Browser notifications on' : 'Browser notifications off', 'info');
        };
    }
    
    // Online status
    var onlineStatus = document.getElementById('online-status');
    if (onlineStatus) {
        onlineStatus.checked = settings.onlineStatus !== false;
        onlineStatus.onchange = function() {
            settings.onlineStatus = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Online status visible' : 'Online status hidden', 'info');
        };
    }
    
    // Read receipts
    var readReceipts = document.getElementById('read-receipts');
    if (readReceipts) {
        readReceipts.checked = settings.readReceipts !== false;
        readReceipts.onchange = function() {
            settings.readReceipts = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Read receipts on' : 'Read receipts off', 'info');
        };
    }
    
    // Typing indicator
    var typingIndicator = document.getElementById('typing-indicator-toggle');
    if (typingIndicator) {
        typingIndicator.checked = settings.typingIndicator !== false;
        typingIndicator.onchange = function() {
            settings.typingIndicator = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Typing indicator on' : 'Typing indicator off', 'info');
        };
    }
    
    // Disappearing messages
    var disappearing = document.getElementById('disappearing-messages');
    if (disappearing) {
        disappearing.value = settings.disappearing || 'off';
        disappearing.onchange = function() {
            settings.disappearing = this.value;
            Storage.set('settings', settings);
            showToast('Disappearing messages: ' + this.value, 'info');
        };
    }
    
    // Two-factor authentication
    var twoFactor = document.getElementById('two-factor');
    if (twoFactor) {
        twoFactor.checked = settings.twoFactor || false;
        twoFactor.onchange = function() {
            settings.twoFactor = this.checked;
            Storage.set('settings', settings);
            showToast(this.checked ? 'Two-factor on' : 'Two-factor off', 'info');
        };
    }
    
    applySettings();
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
// Version History
// ==========================================
function showVersionHistory() {
    var versions = Storage.get('versionInfo') || [
        { version: '2.0.0', date: '2026-04-02', changes: 'Reply to messages, Star/bookmark, Message forwarding, Mute/Archive chats, Disappearing messages, Link previews, Chat wallpapers, Group chats, Voice messages, Message threads, @mentions, GIF support, Polls' },
        { version: '1.5.0', date: '2026-04-02', changes: 'Typing indicator, Message reactions, Edit/delete messages, Date separators, Emoji picker, Message status, Pinned chats, Message search, Browser notifications, Blocked users' },
        { version: '1.0.0', date: '2026-04-02', changes: 'Login/Register, Chat functionality, User profiles, Admin dashboard, Settings, Dark/Light mode, Online status' }
    ];
    
    var html = '<div class="version-history"><h3>Version History</h3>';
    versions.forEach(function(v) {
        html += '<div class="version-item"><strong>v' + v.version + '</strong> - ' + v.date + '<p>' + v.changes + '</p></div>';
    });
    html += '</div>';
    showModal(html);
}

// ==========================================
// Archived Chats
// ==========================================
function toggleArchivedChats() {
    var chats = Storage.get('chats') || [];
    var myArchivedChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && c.archived; });
    
    if (myArchivedChats.length === 0) {
        showToast('No archived chats', 'info');
        return;
    }
    
    var html = '<div class="archived-chats"><h3>Archived Chats</h3>';
    myArchivedChats.forEach(function(chat) {
        var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
        var users = Storage.get('users') || [];
        var otherUser = users.find(function(u) { return u.id === otherUserId; });
        html += '<div class="archived-chat-item" onclick="unarchiveChat(\'' + chat.id + '\')">' + (otherUser ? otherUser.name : 'Unknown') + '</div>';
    });
    html += '</div>';
    showModal(html);
}

function unarchiveChat(chatId) {
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    if (chat) {
        chat.archived = false;
        Storage.set('chats', chats);
        closeModal();
        loadChats();
        showToast('Chat unarchived', 'success');
    }
}

// ==========================================
// Search Messages
// ==========================================
function toggleMessageSearch() {
    var searchBar = document.getElementById('chat-search-bar');
    if (searchBar.style.display === 'none') {
        searchBar.style.display = 'flex';
        document.getElementById('message-search-input').focus();
    } else {
        searchBar.style.display = 'none';
    }
}

function closeMessageSearch() {
    document.getElementById('chat-search-bar').style.display = 'none';
    document.getElementById('message-search-input').value = '';
}

function searchMessages() {
    var query = document.getElementById('message-search-input').value.toLowerCase();
    if (!query || !activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
    var filtered = chatMessages.filter(function(m) { return m.text.toLowerCase().includes(query); });
    
    var container = document.getElementById('chat-messages');
    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="no-messages">No messages found</div>';
        return;
    }
    
    filtered.forEach(function(msg) {
        var users = Storage.get('users') || [];
        var sender = users.find(function(u) { return u.id === msg.senderId; });
        var isMe = msg.senderId === currentUser.id;
        
        var div = document.createElement('div');
        div.className = 'message ' + (isMe ? 'sent' : 'received');
        div.innerHTML = '<div class="message-content"><div class="message-text">' + escapeHtml(msg.text) + '</div><div class="message-time">' + formatTime(msg.timestamp) + '</div></div>';
        container.appendChild(div);
    });
}

// ==========================================
// Starred Messages
// ==========================================
function showStarredMessages() {
    var messages = Storage.get('messages') || [];
    var starred = messages.filter(function(m) { return m.starred; });
    
    if (starred.length === 0) {
        showToast('No starred messages', 'info');
        return;
    }
    
    var html = '<div class="starred-messages"><h3>Starred Messages</h3>';
    starred.forEach(function(msg) {
        html += '<div class="starred-item"><p>' + escapeHtml(msg.text) + '</p><small>' + formatTime(msg.timestamp) + '</small></div>';
    });
    html += '</div>';
    showModal(html);
}

// ==========================================
// Chat Options
// ==========================================
function showChatOptions() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var chat = Storage.get('chats') || [];
    chat = chat.find(function(c) { return c.id === activeChat.id; });
    
    var html = '<div class="chat-options"><h3>Chat Options</h3>';
    html += '<button class="btn" onclick="toggleMuteChat()">' + (chat && chat.muted ? 'Unmute' : 'Mute') + ' Notifications</button>';
    html += '<button class="btn" onclick="togglePinChat()">' + (chat && chat.pinned ? 'Unpin' : 'Pin') + ' Chat</button>';
    html += '<button class="btn" onclick="archiveChat()">Archive Chat</button>';
    html += '<button class="btn" onclick="clearChatHistory()">Clear Chat History</button>';
    html += '<button class="btn danger" onclick="deleteChat()">Delete Chat</button>';
    html += '</div>';
    showModal(html);
}

function toggleMuteChat() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (chat) {
        chat.muted = !chat.muted;
        Storage.set('chats', chats);
        closeModal();
        showToast(chat.muted ? 'Chat muted' : 'Chat unmuted', 'success');
    }
}

function togglePinChat() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (chat) {
        chat.pinned = !chat.pinned;
        Storage.set('chats', chats);
        closeModal();
        loadChats();
        showToast(chat.pinned ? 'Chat pinned' : 'Chat unpinned', 'success');
    }
}

function archiveChat() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (chat) {
        chat.archived = true;
        Storage.set('chats', chats);
        closeModal();
        activeChat = null;
        document.getElementById('chat-section').classList.remove('active');
        document.getElementById('empty-chat').classList.add('active');
        loadChats();
        showToast('Chat archived', 'success');
    }
}

function clearChatHistory() {
    if (!activeChat) return;
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.chatId !== activeChat.id; });
    Storage.set('messages', messages);
    closeModal();
    loadChatMessages(activeChat.id);
    showToast('Chat history cleared', 'success');
}

function deleteChat() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    chats = chats.filter(function(c) { return c.id !== activeChat.id; });
    Storage.set('chats', chats);
    
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.chatId !== activeChat.id; });
    Storage.set('messages', messages);
    
    closeModal();
    activeChat = null;
    document.getElementById('chat-section').classList.remove('active');
    document.getElementById('empty-chat').classList.add('active');
    loadChats();
    showToast('Chat deleted', 'success');
}

// ==========================================
// File & Media Functions
// ==========================================
function attachFile() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(event) {
                var messages = Storage.get('messages') || [];
                var newMessage = {
                    id: generateId(),
                    chatId: activeChat.id,
                    senderId: currentUser.id,
                    text: '📎 ' + file.name,
                    fileData: event.target.result,
                    fileName: file.name,
                    fileType: file.type,
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
                loadChatMessages(activeChat.id);
                showToast('File sent!', 'success');
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function showGifPicker() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var gifs = ['😀', '😂', '🤣', '😍', '🥰', '😎', '🤔', '👍', '👏', '🎉', '❤️', '🔥', '💯', '✨', '🙌', '💪', '😎', '🤩', '😋', '🤪', '😴', '🤗', '🤭', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤'];
    var html = '<div class="gif-picker"><h3>Send Sticker</h3><div class="gif-grid">';
    gifs.forEach(function(gif, index) {
        html += '<div class="gif-item" data-index="' + index + '">' + gif + '</div>';
    });
    html += '</div></div>';
    showModal(html);
    
    setTimeout(function() {
        document.querySelectorAll('.gif-item').forEach(function(item, index) {
            item.onclick = function() {
                sendGif(gifs[index]);
            };
        });
    }, 50);
}

function sendGif(emoji) {
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        text: emoji,
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
    closeModal();
    loadChatMessages(activeChat.id);
    showToast('Sent!', 'success');
}

function toggleVoiceMessage() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Voice recording not supported', 'error');
        return;
    }
    
    showModal('<div class="voice-message"><h3>Voice Message</h3><p>Click to start recording</p><button class="btn btn-primary" id="record-btn" onclick="startRecording()"><i class="fas fa-microphone"></i> Record</button></div>');
}

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            var mediaRecorder = new MediaRecorder(stream);
            var audioChunks = [];
            
            mediaRecorder.ondataavailable = function(e) {
                audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = function() {
                var audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                var reader = new FileReader();
                reader.onload = function(event) {
                    var messages = Storage.get('messages') || [];
                    var newMessage = {
                        id: generateId(),
                        chatId: activeChat.id,
                        senderId: currentUser.id,
                        text: '🎤 Voice message',
                        audioData: event.target.result,
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
                    closeModal();
                    loadChatMessages(activeChat.id);
                    showToast('Voice message sent!', 'success');
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(function(track) { track.stop(); });
            };
            
            mediaRecorder.start();
            document.getElementById('record-btn').innerHTML = '<i class="fas fa-stop"></i> Stop';
            document.getElementById('record-btn').onclick = function() {
                mediaRecorder.stop();
            };
        })
        .catch(function(err) {
            showToast('Microphone access denied', 'error');
        });
}

function toggleEmojiPicker() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄', '💋', '🩸'];
    var html = '<div class="emoji-picker"><h3>Emoji</h3><div class="emoji-grid">';
    emojis.forEach(function(emoji, index) {
        html += '<div class="emoji-item" data-index="' + index + '">' + emoji + '</div>';
    });
    html += '</div></div>';
    showModal(html);
    
    setTimeout(function() {
        document.querySelectorAll('.emoji-item').forEach(function(item, index) {
            item.onclick = function() {
                insertEmoji(emojis[index]);
            };
        });
    }, 50);
}

function insertEmoji(emoji) {
    var input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
    closeModal();
}

// ==========================================
// Group Functions
// ==========================================
function showCreateGroup() {
    var users = Storage.get('users') || [];
    var otherUsers = users.filter(function(u) { return u.id !== currentUser.id; });
    
    var html = '<div class="create-group"><h3>Create Group</h3>';
    html += '<input type="text" id="group-name-input" placeholder="Group name">';
    html += '<div class="user-list">';
    otherUsers.forEach(function(user) {
        html += '<label><input type="checkbox" value="' + user.id + '"> ' + user.name + '</label>';
    });
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="createGroup()">Create</button>';
    html += '</div>';
    showModal(html);
}

function createGroup() {
    var name = document.getElementById('group-name-input').value;
    if (!name) {
        showToast('Enter a group name', 'error');
        return;
    }
    
    var checkboxes = document.querySelectorAll('#modal input[type="checkbox"]:checked');
    var participants = [currentUser.id];
    checkboxes.forEach(function(cb) { participants.push(cb.value); });
    
    if (participants.length < 2) {
        showToast('Select at least one participant', 'error');
        return;
    }
    
    var chats = Storage.get('chats') || [];
    var newChat = {
        id: generateId(),
        participants: participants,
        createdAt: new Date().toISOString(),
        pinned: false,
        muted: false,
        archived: false,
        isGroup: true,
        groupName: name
    };
    chats.push(newChat);
    Storage.set('chats', chats);
    
    closeModal();
    loadChats();
    showToast('Group created!', 'success');
}

// ==========================================
// Profile Functions
// ==========================================
function changeAvatar() {
    showToast('Avatar change coming soon', 'info');
}

// ==========================================
// Settings Functions
// ==========================================
function showWallpaperPicker() {
    var wallpapers = ['none', '#f5f5f5', '#e8f5e9', '#fff3e0', '#e3f2fd', '#fce4ec'];
    var html = '<div class="wallpaper-picker"><h3>Chat Wallpaper</h3><div class="wallpaper-options">';
    wallpapers.forEach(function(w) {
        html += '<div class="wallpaper-option" style="background:' + w + '" onclick="setWallpaper(\'' + w + '\')"></div>';
    });
    html += '</div></div>';
    showModal(html);
}

function setWallpaper(color) {
    document.getElementById('chat-wallpaper').style.background = color;
    var settings = Storage.get('settings') || {};
    settings.wallpaper = color;
    Storage.set('settings', settings);
    
    // Also save to current chat if active
    if (activeChat) {
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.id === activeChat.id; });
        if (chat) {
            chat.wallpaper = color;
            Storage.set('chats', chats);
        }
    }
    
    closeModal();
    showToast('Wallpaper changed', 'success');
}

function showChangePassword() {
    var html = '<div class="change-password"><h3>Change Password</h3>';
    html += '<input type="password" id="current-password" placeholder="Current password">';
    html += '<input type="password" id="new-password" placeholder="New password">';
    html += '<input type="password" id="confirm-new-password" placeholder="Confirm new password">';
    html += '<button class="btn btn-primary" onclick="changePassword()">Change Password</button>';
    html += '</div>';
    showModal(html);
}

function changePassword() {
    var current = document.getElementById('current-password').value;
    var newPass = document.getElementById('new-password').value;
    var confirm = document.getElementById('confirm-new-password').value;
    
    if (hashPassword(current) !== currentUser.password) {
        showToast('Current password incorrect', 'error');
        return;
    }
    if (newPass !== confirm) {
        showToast('New passwords do not match', 'error');
        return;
    }
    if (newPass.length < 6) {
        showToast('Password must be 6+ characters', 'error');
        return;
    }
    
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === currentUser.id; });
    if (user) {
        user.password = hashPassword(newPass);
        currentUser.password = user.password;
        Storage.set('users', users);
        closeModal();
        showToast('Password changed!', 'success');
    }
}

function showBlockedUsers() {
    var users = Storage.get('users') || [];
    var blocked = currentUser.blockedUsers || [];
    var blockedUsers = users.filter(function(u) { return blocked.indexOf(u.id) !== -1; });
    
    var html = '<div class="blocked-users"><h3>Blocked Users</h3>';
    if (blockedUsers.length === 0) {
        html += '<p>No blocked users</p>';
    } else {
        blockedUsers.forEach(function(user) {
            html += '<div class="blocked-user"><span>' + user.name + '</span><button class="btn btn-small" onclick="unblockUser(\'' + user.id + '\')">Unblock</button></div>';
        });
    }
    html += '</div>';
    showModal(html);
}

function unblockUser(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === currentUser.id; });
    if (user && user.blockedUsers) {
        user.blockedUsers = user.blockedUsers.filter(function(id) { return id !== userId; });
        currentUser.blockedUsers = user.blockedUsers;
        Storage.set('users', users);
        showBlockedUsers();
        showToast('User unblocked', 'success');
    }
}

function exportData() {
    var data = {
        user: currentUser,
        chats: Storage.get('chats') || [],
        messages: Storage.get('messages') || []
    };
    
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-data-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported!', 'success');
}

function clearCache() {
    localStorage.clear();
    showToast('Cache cleared', 'success');
    setTimeout(function() { location.reload(); }, 1000);
}

function confirmDeleteAccount() {
    showModal('<div class="delete-account"><h3>Delete Account</h3><p>Are you sure? This cannot be undone.</p><button class="btn danger" onclick="deleteAccount()">Delete My Account</button></div>');
}

function deleteAccount() {
    var users = Storage.get('users') || [];
    users = users.filter(function(u) { return u.id !== currentUser.id; });
    Storage.set('users', users);
    
    var chats = Storage.get('chats') || [];
    chats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) === -1; });
    Storage.set('chats', chats);
    
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.senderId !== currentUser.id; });
    Storage.set('messages', messages);
    
    localStorage.removeItem('currentUser');
    showToast('Account deleted', 'success');
    setTimeout(function() { location.reload(); }, 1000);
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
    
    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(function(toggle) {
        toggle.onclick = function() {
            var input = this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
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
    
    // Version History
    document.getElementById('version-history-btn').onclick = showVersionHistory;
    
    // Archived Chats
    document.getElementById('archived-chats-btn').onclick = toggleArchivedChats;
    
    // Search Messages
    document.getElementById('search-messages-btn').onclick = toggleMessageSearch;
    document.getElementById('close-message-search').onclick = closeMessageSearch;
    document.getElementById('message-search-input').oninput = searchMessages;
    
    // Starred Messages
    document.getElementById('starred-messages-btn').onclick = showStarredMessages;
    
    // Chat Options
    document.getElementById('chat-options-btn').onclick = showChatOptions;
    
    // Attach File
    document.getElementById('attach-file-btn').onclick = attachFile;
    
    // GIF
    document.getElementById('gif-btn').onclick = showGifPicker;
    
    // Voice Message
    document.getElementById('voice-btn').onclick = toggleVoiceMessage;
    
    // Emoji
    document.getElementById('emoji-btn').onclick = toggleEmojiPicker;
    
    // Create Group
    document.getElementById('create-group-btn').onclick = showCreateGroup;
    
    // Change Avatar
    document.getElementById('change-avatar-btn').onclick = changeAvatar;
    
    // Chat Wallpaper
    document.getElementById('chat-wallpaper-btn').onclick = showWallpaperPicker;
    
    // Change Password
    document.getElementById('change-password-btn').onclick = showChangePassword;
    
    // Blocked Users
    document.getElementById('blocked-users-btn').onclick = showBlockedUsers;
    
    // Export Data
    document.getElementById('export-data-btn').onclick = exportData;
    
    // Clear Cache
    document.getElementById('clear-cache-btn').onclick = clearCache;
    
    // Delete Account
    document.getElementById('delete-account-btn').onclick = confirmDeleteAccount;
    
    // Modal close
    document.getElementById('modal').onclick = function(e) {
        if (e.target.id === 'modal') closeModal();
    };
    
    // Initialize
    initAuth();
    initSettings();
});