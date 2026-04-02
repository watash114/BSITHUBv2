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
    
    // Modal close
    document.getElementById('modal').onclick = function(e) {
        if (e.target.id === 'modal') closeModal();
    };
    
    // Initialize
    initAuth();
    initSettings();
});