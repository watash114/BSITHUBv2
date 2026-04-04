// ==========================================
// BSITHUB v2.5.0 - Main Application
// ==========================================
const APP_VERSION = '2.5.0';

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

// ==========================================
// Real-time Messaging (Cross-tab sync)
// ==========================================
let realtimeInterval = null;
let lastMessageCount = 0;

function initRealtime() {
    // Listen for storage events from other tabs
    window.addEventListener('storage', function(e) {
        if (e.key === 'messages') {
            handleNewMessages();
        }
        if (e.key === 'typingIndicator') {
            handleTypingIndicator();
        }
        if (e.key === 'onlineUsers') {
            updateOnlineStatus();
        }
        if (e.key === 'chats') {
            loadChats();
        }
    });
    
    // Poll for updates every 2 seconds (backup)
    realtimeInterval = setInterval(function() {
        handleNewMessages();
        handleTypingIndicator();
    }, 2000);
    
    // Listen for chats from Firebase (groups created by other users)
    if (typeof listenForChats === 'function' && currentUser) {
        listenForChats(function() {
            loadChats();
            loadGroups();
        });
    }
    
    // Periodically fetch messages from Firebase for all chats (backup sync)
    if (currentUser) {
        setInterval(function() {
            if (typeof fetchAllMessagesFromFirebase === 'function') {
                fetchAllMessagesFromFirebase();
            }
        }, 5000);
    }
}

function handleNewMessages() {
    if (!currentUser || !activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
    
    if (chatMessages.length !== lastMessageCount) {
        lastMessageCount = chatMessages.length;
        renderMessages(activeChat.id);
        updateChatList();
    }
}

function updateChatList() {
    if (currentUser) {
        loadChats();
    }
}

function handleTypingIndicator() {
    if (!currentUser || !activeChat) return;
    
    var typingData = Storage.get('typingIndicator') || {};
    var chatTyping = typingData[activeChat.id];
    
    if (chatTyping && chatTyping.userId !== currentUser.id) {
        var users = Storage.get('users') || [];
        var typingUser = users.find(function(u) { return u.id === chatTyping.userId; });
        
        if (typingUser && Date.now() - chatTyping.timestamp < 3000) {
            document.getElementById('typing-indicator').style.display = 'flex';
            document.getElementById('typing-indicator').querySelector('span').textContent = typingUser.name + ' is typing';
        } else {
            document.getElementById('typing-indicator').style.display = 'none';
        }
    } else {
        document.getElementById('typing-indicator').style.display = 'none';
    }
}

function sendTypingIndicator() {
    if (!currentUser || !activeChat) return;
    
    // Send via Firebase for cross-browser/device
    if (typeof sendTypingStatus === 'function') {
        sendTypingStatus(activeChat.id, currentUser.id, true);
    }
    
    // Also set in localStorage for same-browser
    var typingData = Storage.get('typingIndicator') || {};
    typingData[activeChat.id] = {
        userId: currentUser.id,
        timestamp: Date.now()
    };
    Storage.set('typingIndicator', typingData);
}

function updateOnlineStatus() {
    if (!currentUser || !currentUser.id) return;
    
    // Update current user's online status in Firebase
    if (firebaseDb) {
        firebaseDb.ref('online/' + currentUser.id).set({
            online: true,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Set up disconnect handler when user closes browser
        firebaseDb.ref('online/' + currentUser.id).onDisconnect().set({
            online: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

function setUserOffline() {
    if (!currentUser) return;
    
    // Set offline in Firebase
    if (typeof setUserOfflineFirebase === 'function') {
        setUserOfflineFirebase(currentUser.id);
    }
    
    var onlineUsers = Storage.get('onlineUsers') || {};
    delete onlineUsers[currentUser.id];
    Storage.set('onlineUsers', onlineUsers);
}

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
    if (!date) return 'N/A';
    
    var d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) {
        // Try to parse as ISO string
        d = new Date(date);
        if (isNaN(d.getTime())) {
            return 'N/A';
        }
    }
    
    // Get current date for relative formatting
    var now = new Date();
    var diff = now - d;
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var months = Math.floor(days / 30);
    var years = Math.floor(days / 365);
    
    // Full date format
    var fullDate = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    if (days === 0) {
        return 'Today';
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return days + ' days ago';
    } else if (days < 30) {
        var weeks = Math.floor(days / 7);
        return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago';
    } else if (days < 365) {
        return fullDate + ' (' + months + ' month' + (months > 1 ? 's' : '') + ' ago)';
    } else {
        return fullDate + ' (' + years + ' year' + (years > 1 ? 's' : '') + ' ago)';
    }
}

// Format time
function formatTime(date) {
    if (!date) return '';
    
    var d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format last seen
function formatLastSeen(date) {
    if (!date) return '';
    
    var d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    var now = new Date();
    var diff = now - d;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    
    if (seconds < 60) {
        return 'last seen just now';
    } else if (minutes < 60) {
        return 'last seen ' + minutes + 'm ago';
    } else if (hours < 24) {
        return 'last seen ' + hours + 'h ago';
    } else if (days < 7) {
        return 'last seen ' + days + 'd ago';
    } else {
        return 'last seen ' + d.toLocaleDateString();
    }
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

function getFileIcon(fileName) {
    var ext = fileName.split('.').pop().toLowerCase();
    var icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'ppt': 'fa-file-powerpoint',
        'pptx': 'fa-file-powerpoint',
        'zip': 'fa-file-archive',
        'rar': 'fa-file-archive',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'mp3': 'fa-file-audio',
        'wav': 'fa-file-audio',
        'mp4': 'fa-file-video',
        'avi': 'fa-file-video',
        'mov': 'fa-file-video'
    };
    return icons[ext] || 'fa-file';
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
    const users = Storage.get('users') || [];
    
    // Ensure admin user always exists with correct password
    const adminIndex = users.findIndex(u => u.id === 'admin1');
    const adminData = { id: 'admin1', name: 'Admin User', username: 'admin', email: 'admin@bsithub.com', password: hashPassword('admin123'), role: 'admin', status: 'active', bio: 'System Administrator', phone: '+1234567890', location: 'New York', createdAt: '2024-01-01T00:00:00.000Z', avatar: null, blockedUsers: [] };
    if (adminIndex === -1) {
        users.push(adminData);
    } else {
        users[adminIndex].password = adminData.password;
        users[adminIndex].role = 'admin';
        users[adminIndex].status = 'active';
    }
    Storage.set('users', users);
    
    // Ensure default users exist
    const defaultUsers = [
        { id: 'user1', name: 'John Doe', username: 'johndoe', email: 'john@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'Software Developer', phone: '+1234567891', location: 'San Francisco', createdAt: '2024-02-15T00:00:00.000Z', avatar: null, cover: null, blockedUsers: [] },
        { id: 'user2', name: 'Jane Smith', username: 'janesmith', email: 'jane@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'UX Designer', phone: '+1234567892', location: 'Los Angeles', createdAt: '2024-03-01T00:00:00.000Z', avatar: null, cover: null, blockedUsers: [] }
    ];
    
    defaultUsers.forEach(user => {
        if (!users.some(u => u.id === user.id)) {
            users.push(user);
        }
    });
    Storage.set('users', users);
    
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
    
    // Sync admin user to Firebase
    const adminUser = users.find(u => u.id === 'admin1');
    if (adminUser && typeof syncUserToFirebase === 'function') {
        syncUserToFirebase(adminUser);
    }
}

// ==========================================
// Global State
// ==========================================
let currentUser = null;
let activeChat = null;
let pinnedChatsView = false;
let currentReplyTo = null;

// ==========================================
// Authentication
// ==========================================
async function login(email, password) {
    console.log('Login attempt:', email);

    // Admin login - preserve existing data
    if (email === 'admin@bsithub.com' && password === 'admin123') {
        var users = Storage.get('users') || [];
        var adminIdx = users.findIndex(function(u) { return u.id === 'admin1'; });
        var defaultAdmin = { id: 'admin1', name: 'Admin User', username: 'admin', email: 'admin@bsithub.com', password: 'admin123', role: 'admin', status: 'active', bio: 'System Administrator', phone: '+1234567890', location: 'New York', createdAt: '2024-01-01T00:00:00.000Z', avatar: null, cover: null, blockedUsers: [] };
        if (adminIdx === -1) {
            users.push(defaultAdmin);
        } else {
            // Merge defaults with existing data - preserve avatar, cover, bio, etc.
            users[adminIdx] = Object.assign({}, defaultAdmin, users[adminIdx], { password: 'admin123', role: 'admin', status: 'active' });
        }
        Storage.set('users', users);
        currentUser = users[adminIdx !== -1 ? adminIdx : users.length - 1];
        Storage.set('currentUser', { id: 'admin1' });
        console.log('Admin login successful');
        return { success: true };
    }

    // Regular users
    var users = Storage.get('users') || [];
    var hashedPassword = hashPassword(password);
    var user = users.find(function(u) { return u.email === email && u.password === hashedPassword; });
    
    if (user) {
        if (user.status === 'banned') return { success: false, message: 'Your account has been banned' };
        currentUser = user;
        Storage.set('currentUser', { id: user.id });
        console.log('Login successful');
        return { success: true };
    }

    return { success: false, message: 'Invalid email or password' };
}

function socialLogin(provider) {
    // Prevent multiple clicks
    if (window.socialLoginInProgress) {
        showToast('Please wait...', 'info');
        return;
    }
    
    window.socialLoginInProgress = true;
    
    // Initialize Firebase if not already done
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        initFirebase();
    }
    
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        showToast('Firebase not ready. Please refresh.', 'error');
        window.socialLoginInProgress = false;
        return;
    }
    
    // Check if Auth is available
    if (!firebase.auth) {
        showToast('Firebase Auth not loaded. Please refresh.', 'error');
        window.socialLoginInProgress = false;
        return;
    }
    
    var auth = firebase.auth();
    var providerObj;
    
    switch(provider) {
        case 'google':
            providerObj = new firebase.auth.GoogleAuthProvider();
            break;
        case 'facebook':
            providerObj = new firebase.auth.FacebookAuthProvider();
            break;
        case 'github':
            providerObj = new firebase.auth.GithubAuthProvider();
            break;
        default:
            showToast('Unknown provider', 'error');
            window.socialLoginInProgress = false;
            return;
    }
    
    // Close any existing popups first
    auth.signOut().catch(function() {});
    
    setTimeout(function() {
        auth.signInWithRedirect(providerObj);
    }, 500);
}

async function register(name, username, email, password) {
    const users = Storage.get('users') || [];
    if (users.find(function(u) { return u.email === email; })) return { success: false, message: 'Email already registered' };
    if (users.find(function(u) { return u.username === username; })) return { success: false, message: 'Username already taken' };
    
    // Store pending user data
    window.pendingUser = {
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
        cover: null,
        blockedUsers: []
    };

    // Also save to Supabase database
    if (DB.isReady()) {
        var dbResult = await DB.signUp(email, password, { name: name, username: username });
        if (dbResult.success && dbResult.user) {
            window.pendingUser.id = dbResult.user.id;
            window.pendingUser.dbSynced = true;
        }
    }
    
    // Generate verification code
    window.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Show verification modal
    showVerificationModal();
    
    return { success: true, requiresVerification: true };
}

function showVerificationModal() {
    var modal = document.getElementById('verification-modal');
    var codeDisplay = document.getElementById('verification-code-display');
    
    // Show code for demo (in real app, this would be sent via email)
    codeDisplay.innerHTML = '<div class="demo-code"><small>Your verification code (demo):</small><strong>' + window.verificationCode + '</strong></div>';
    
    modal.style.display = 'flex';
    
    // Focus first input
    setTimeout(function() {
        document.querySelector('.code-input[data-index="0"]').focus();
    }, 100);
}

function setupCodeInputs() {
    var inputs = document.querySelectorAll('.code-input');
    inputs.forEach(function(input, index) {
        input.addEventListener('input', function(e) {
            var value = e.target.value;
            if (value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        });
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                inputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            var paste = (e.clipboardData || window.clipboardData).getData('text');
            var chars = paste.replace(/\D/g, '').split('').slice(0, 6);
            chars.forEach(function(char, i) {
                if (inputs[i]) {
                    inputs[i].value = char;
                }
            });
            if (chars.length > 0) {
                inputs[Math.min(chars.length, inputs.length - 1)].focus();
            }
        });
    });
}

function verifyCode() {
    var inputs = document.querySelectorAll('.code-input');
    var enteredCode = '';
    inputs.forEach(function(input) {
        enteredCode += input.value;
    });
    
    if (enteredCode.length !== 6) {
        showToast('Please enter all 6 digits', 'error');
        return;
    }
    
    if (enteredCode === window.verificationCode) {
        // Code is correct - complete registration
        var users = Storage.get('users') || [];
        users.push(window.pendingUser);
        Storage.set('users', users);
        currentUser = window.pendingUser;
        Storage.set('currentUser', { id: window.pendingUser.id });
        
        // Clean up
        window.pendingUser = null;
        window.verificationCode = null;
        
        addLog('info', 'New user registered: ' + currentUser.username);
        
        // Hide modal
        document.getElementById('verification-modal').style.display = 'none';
        
        showToast('Email verified! Welcome to BSITHUB!', 'success');
        showApp();
    } else {
        showToast('Invalid verification code', 'error');
        // Clear inputs
        inputs.forEach(function(input) {
            input.value = '';
        });
        inputs[0].focus();
    }
}

function resendCode() {
    window.verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    var codeDisplay = document.getElementById('verification-code-display');
    codeDisplay.innerHTML = '<div class="demo-code"><small>New code (demo):</small><strong>' + window.verificationCode + '</strong></div>';
    showToast('New code generated!', 'info');
}

function cancelVerification() {
    window.pendingUser = null;
    window.verificationCode = null;
    document.getElementById('verification-modal').style.display = 'none';
    
    // Clear inputs
    var inputs = document.querySelectorAll('.code-input');
    inputs.forEach(function(input) {
        input.value = '';
    });
}

async function logout() {
    setUserOffline();
    if (realtimeInterval) {
        clearInterval(realtimeInterval);
    }
    await DB.signOut();
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
    console.log('showApp called, currentUser:', currentUser);
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('app-page').classList.add('active');
    
    // Initialize Firebase
    initFirebase();
    
    initializeApp();
    
    // Initialize Socket.IO for real-time presence
    if (currentUser && typeof initSocket === 'function') {
        initSocket(currentUser.id);
    }
    
    // Set user online (wait for Firebase to be ready)
    if (currentUser) {
        setTimeout(function() {
            if (typeof goOnline === 'function') {
                goOnline(currentUser.id);
            }
            // Also update online status
            if (typeof updateOnlineStatus === 'function') {
                updateOnlineStatus();
            }
        }, 1500);
    }
    
    // Sync current user to Firebase
    if (currentUser && typeof syncUserToFirebase === 'function') {
        syncUserToFirebase(currentUser);
    }
    
    // Force sync all chats and messages to Firebase on login
    setTimeout(function() {
        console.log('=== SYNCING ALL DATA TO FIREBASE ===');
        
        // Sync all users
        if (typeof syncAllUsersToFirebase === 'function') {
            syncAllUsersToFirebase();
        }
        
        // Sync all chats
        var chats = Storage.get('chats') || [];
        chats.forEach(function(chat) {
            if (typeof syncChat === 'function') {
                console.log('Syncing chat:', chat.id);
                syncChat(chat);
            }
        });
        
        // Sync all messages
        var messages = Storage.get('messages') || [];
        messages.forEach(function(msg) {
            if (typeof sendMsgToFirebase === 'function') {
                sendMsgToFirebase(msg);
            }
        });
        
        // Fetch all users from chats
        chats.forEach(function(chat) {
            chat.participants.forEach(function(userId) {
                if (userId !== currentUser.id && typeof fetchUserFromFirebase === 'function') {
                    fetchUserFromFirebase(userId);
                }
            });
        });
        
        console.log('=== SYNC COMPLETE ===');
        
        // Reload chats after fetching users
        setTimeout(function() {
            loadChats();
            loadGroups();
        }, 2000);
    }, 2000);
    
    // Listen for new chats from other users
    if (currentUser && typeof listenNewChats === 'function') {
        listenNewChats(currentUser.id, function(chat) {
            console.log('New chat received:', chat.id);
            var chats = Storage.get('chats') || [];
            var exists = chats.find(function(c) { return c.id === chat.id; });
            if (!exists) {
                chats.push(chat);
                Storage.set('chats', chats);
                loadChats();
                loadGroups();
                showToast('New chat: ' + (chat.groupName || 'Chat'), 'info');
            }
        });
    }
    
    // Sync current user info to Firebase
    if (currentUser && typeof syncUserToFirebase === 'function') {
        syncUserToFirebase(currentUser);
    }
    
    // Load chats from Firebase and listen for new chats
    if (currentUser && typeof loadUserChatsFromFirebase === 'function') {
        loadUserChatsFromFirebase(currentUser.id).then(function(fbChats) {
            if (fbChats && fbChats.length > 0) {
                var localChats = Storage.get('chats') || [];
                
                fbChats.forEach(function(fbChat) {
                    var existingIndex = localChats.findIndex(function(c) { return c.id === fbChat.id; });
                    if (existingIndex === -1) {
                        localChats.push(fbChat);
                    }
                });
                
                Storage.set('chats', localChats);
                loadChats();
                loadGroups();
            }
        });
        
        // Listen for new chats from other users
        if (typeof listenNewChats === 'function') {
            listenNewChats(currentUser.id, function(chat) {
                var localChats = Storage.get('chats') || [];
                var existingIndex = localChats.findIndex(function(c) { return c.id === chat.id; });
                
                if (existingIndex === -1) {
                    localChats.push(chat);
                    Storage.set('chats', localChats);
                    loadChats();
                    loadGroups();
                    showToast('New chat!', 'info');
                }
            });
        }
        
        // POLLING BACKUP - fetch chats every 5 seconds
        setInterval(function() {
            if (typeof getUserChats === 'function') {
                getUserChats(currentUser.id).then(function(chatIds) {
                    // Fetch full chat data for each chat
                    chatIds.forEach(function(chatId) {
                        if (firebaseDb) {
                            firebaseDb.ref('chats/' + chatId).once('value').then(function(snap) {
                                if (snap.val()) {
                                    var localChats = Storage.get('chats') || [];
                                    var idx = localChats.findIndex(function(c) { return c.id === chatId; });
                                    if (idx === -1) {
                                        localChats.push(snap.val());
                                        Storage.set('chats', localChats);
                                        loadChats();
                                        loadGroups();
                                    }
                                }
                            });
                        }
                    });
                });
            }
        }, 5000);
    }
    
    // Fetch all messages and user data from Firebase
    if (currentUser && typeof fetchAllMessagesFromFirebase === 'function') {
        // Delay slightly to ensure Firebase is ready
        setTimeout(function() {
            fetchAllMessagesFromFirebase();
            
            // Also fetch all users from Firebase
            if (typeof fetchUsersFromFirebase === 'function') {
                var chats = Storage.get('chats') || [];
                var userChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
                var allParticipantIds = [];
                userChats.forEach(function(chat) {
                    chat.participants.forEach(function(pId) {
                        if (allParticipantIds.indexOf(pId) === -1) {
                            allParticipantIds.push(pId);
                        }
                    });
                });
                
                fetchUsersFromFirebase(allParticipantIds, function() {
                    loadChats();
                    loadGroups();
                });
            } else {
                loadChats();
                loadGroups();
            }
        }, 1000);
    }
}

async function initAuth() {
    // Check Supabase session first
    if (DB.isReady()) {
        var session = await DB.getSession();
        if (session && session.user) {
            console.log('Supabase session found:', session.user.email);
            var dbUser = await DB.getProfile(session.user.id);
            if (dbUser) {
                var existingUser = Storage.get('users')?.find(function(u) { return u.id === dbUser.id; });
                var localUser = {
                    id: dbUser.id,
                    name: dbUser.name,
                    username: dbUser.username,
                    email: dbUser.email,
                    password: 'supabase_auth',
                    role: dbUser.role || 'user',
                    status: dbUser.status || 'active',
                    bio: dbUser.bio || '',
                    phone: dbUser.phone || '',
                    location: dbUser.location || '',
                    createdAt: dbUser.created_at,
                    avatar: dbUser.avatar || (existingUser ? existingUser.avatar : null),
                    cover: existingUser ? existingUser.cover : null,
                    blockedUsers: dbUser.blocked_users || []
                };
                var users = Storage.get('users') || [];
                var idx = users.findIndex(function(u) { return u.id === localUser.id; });
                if (idx !== -1) users[idx] = localUser; else users.push(localUser);
                Storage.set('users', users);
                currentUser = localUser;
                Storage.set('currentUser', { id: localUser.id });
                showApp();
                return;
            }
        }
    }

    // Fallback to localStorage
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
    // Initial sync from Firebase
    syncAllUsersFromFirebase();
    
    // Periodic sync every 10 seconds to catch new users
    setInterval(function() {
        syncAllUsersFromFirebase();
    }, 10000);
    
    updateSidebar();
    applySettings();
    loadChats();
    loadProfile();
    initNavigation();
    
    // Listen for new chats from Firebase (global)
    if (firebaseDb) {
        firebaseDb.ref('userChats').on('child_added', function(snap) {
            var userId = snap.key;
            if (userId !== currentUser.id) {
                // Someone else created a chat - reload chats
                loadChats();
            }
        });
    }
    
    // Listen for all users being added (global sync)
    if (firebaseDb) {
        // Load deleted users list first
        var deletedUsers = {};
        firebaseDb.ref('deletedUsers').once('value', function(snap) {
            deletedUsers = snap.val() || {};
        });
        
        firebaseDb.ref('users').on('child_added', function(snap) {
            var user = snap.val();
            if (user && user.id !== currentUser.id && !deletedUsers[user.id]) {
                var users = Storage.get('users') || [];
                if (!users.find(function(u) { return u.id === user.id; })) {
                    users.push(user);
                    Storage.set('users', users);
                    console.log('User added from Firebase:', user.username);
                }
            }
        });
    }
    
    // Listen for online status changes (global)
    if (firebaseDb) {
        firebaseDb.ref('online').on('value', function(snap) {
            window.firebaseOnlineData = snap.val() || {};
            loadChats(); // Reload to show online/offline status
        });
    }
    
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
    
    // Update sidebar avatar
    var sidebarAvatar = document.getElementById('sidebar-avatar');
    if (currentUser.avatar) {
        sidebarAvatar.innerHTML = '<img src="' + currentUser.avatar + '" alt="Avatar">';
    } else {
        sidebarAvatar.innerHTML = '<i class="fas fa-user"></i>';
    }
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
            if (section === 'feed') { if (typeof initFeed === 'function') initFeed(); }
        };
    });
}

// ==========================================
// Groups
// ==========================================
function loadGroups() {
    var groupsContainer = document.getElementById('groups-container');
    if (!groupsContainer) return; // Groups section removed
    
    var chats = Storage.get('chats') || [];
    var myGroups = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && c.isGroup; });
    
    if (myGroups.length === 0) {
        groupsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No groups yet</p><p>Create a group to get started</p></div>';
        return;
    }
    
    var html = '';
    myGroups.forEach(function(group) {
        html += '<div class="group-card" data-chat-id="' + group.id + '" data-user-id="' + currentUser.id + '">';
        html += '<div class="group-avatar"><i class="fas fa-users"></i></div>';
        html += '<div class="group-name">' + (group.groupName || 'Group') + '</div>';
        html += '<div class="group-members">' + group.participants.length + ' members</div>';
        html += '</div>';
    });
    
    groupsContainer.innerHTML = html;
    
    // Use event delegation instead of inline onclick
    groupsContainer.addEventListener('click', function(e) {
        console.log('Group card clicked', e.target);
        var card = e.target.closest('.group-card');
        if (card) {
            console.log('Opening chat:', card.dataset.chatId, card.dataset.userId);
            openChat(card.dataset.chatId, card.dataset.userId);
        }
    });
}

// ==========================================
// Chats
// ==========================================
function loadChats() {
    if (!currentUser || !currentUser.id) return;
    
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
            chatUserId = chat.participants[0] || currentUser.id;
        } else {
            var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
            var otherUser = users.find(function(u) { return u.id === otherUserId; });
            if (otherUser) {
                chatName = otherUser.name;
                chatAvatar = otherUser.avatar ? '<img src="' + otherUser.avatar + '">' : otherUser.name.charAt(0).toUpperCase();
            } else {
                chatName = otherUserId ? otherUserId.substring(0, 8) : 'Unknown';
                chatAvatar = '?';
            }
            chatUserId = otherUserId || currentUser.id;
        }
        
        // Check online status
        var isOnline = false;
        var lastSeenText = '';
        if (!chat.isGroup && otherUserId) {
            // Try to get from Firebase online data
            if (window.firebaseOnlineData && window.firebaseOnlineData[otherUserId]) {
                isOnline = window.firebaseOnlineData[otherUserId].online === true;
                if (window.firebaseOnlineData[otherUserId].lastSeen) {
                    lastSeenText = formatLastSeen(window.firebaseOnlineData[otherUserId].lastSeen);
                }
            }
        }
        
        html += '<div class="chat-item ' + (isActive ? 'active' : '') + (chat.pinned ? ' pinned' : '') + '" data-chat-id="' + chat.id + '" data-user-id="' + chatUserId + '">';
        html += '<div class="chat-item-avatar-wrapper">';
        html += '<div class="chat-item-avatar">' + chatAvatar + '</div>';
        // Always show indicator - green if online, gray if offline
        html += '<div class="online-indicator ' + (isOnline ? 'online' : 'offline') + '"></div>';
        html += '</div>';
        html += '<div class="chat-item-info">';
        html += '<div class="chat-item-name">' + chatName;
        if (lastSeenText) {
            html += '<span class="last-seen-text">' + lastSeenText + '</span>';
        }
        html += '</div>';
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
    
    // Update total unread badge in sidebar
    updateUnreadBadge();
}

function updateUnreadBadge() {
    var chats = Storage.get('chats') || [];
    var messages = Storage.get('messages') || [];
    
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && !c.archived; });
    
    var totalUnread = 0;
    myChats.forEach(function(chat) {
        var chatMessages = messages.filter(function(m) { return m.chatId === chat.id; });
        var unreadCount = chatMessages.filter(function(m) { return !m.read && m.senderId !== currentUser.id; }).length;
        totalUnread += unreadCount;
    });
    
    var badge = document.getElementById('chat-badge');
    if (badge) {
        badge.textContent = totalUnread;
        badge.style.display = totalUnread > 0 ? 'inline' : 'none';
    }
}

function loadChatsWithUnread() {
    var chatList = document.getElementById('chat-list');
    var chats = Storage.get('chats') || [];
    var messages = Storage.get('messages') || [];
    var users = Storage.get('users') || [];
    
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1 && !c.archived; });
    
    var unreadChats = myChats.filter(function(chat) {
        var chatMessages = messages.filter(function(m) { return m.chatId === chat.id; });
        return chatMessages.some(function(m) { return !m.read && m.senderId !== currentUser.id; });
    });
    
    var html = '';
    unreadChats.forEach(function(chat) {
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
            chatUserId = chat.participants[0] || currentUser.id;
        } else {
            var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
            var otherUser = users.find(function(u) { return u.id === otherUserId; });
            if (otherUser) {
                chatName = otherUser.name;
                chatAvatar = otherUser.avatar ? '<img src="' + otherUser.avatar + '">' : otherUser.name.charAt(0).toUpperCase();
            } else {
                chatName = 'User ' + (otherUserId ? otherUserId.substring(0, 5) : 'Unknown');
                chatAvatar = '?';
            }
            chatUserId = otherUserId || currentUser.id;
        }
        
        html += '<div class="chat-item ' + (isActive ? 'active' : '') + (chat.pinned ? ' pinned' : '') + '" data-chat-id="' + chat.id + '" data-user-id="' + chatUserId + '">';
        html += '<div class="chat-item-avatar-wrapper"><div class="chat-item-avatar">' + chatAvatar + '</div></div>';
        html += '<div class="chat-item-info"><div class="chat-item-name">' + chatName + '</div>';
        html += '<div class="chat-item-message">' + (lastMessage ? escapeHtml(lastMessage.text).substring(0, 30) : 'No messages yet') + '</div></div>';
        html += '<div class="chat-item-meta"><div class="chat-item-time">' + (lastMessage ? formatTime(lastMessage.timestamp) : '') + '</div>';
        if (unreadCount > 0) html += '<span class="chat-item-badge">' + unreadCount + '</span>';
        html += '</div></div>';
    });
    
    if (html === '') {
        html = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No unread chats</p></div>';
    }
    
    chatList.innerHTML = html;
    
    chatList.querySelectorAll('.chat-item').forEach(function(item) {
        item.onclick = function() {
            openChat(item.dataset.chatId, item.dataset.userId);
        };
    });
}

function openChat(chatId, userId) {
    console.log('openChat called:', chatId, userId);
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    console.log('Found chat:', chat);
    if (!chat) {
        showToast('Chat not found', 'error');
        return;
    }
    
    activeChat = { id: chatId, userId: userId };
    
    // Switch to chats section if not already there
    document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.querySelectorAll('.content-section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('chats-section').classList.add('active');
    var chatsNavItem = document.querySelector('.nav-item[data-section="chats"]');
    if (chatsNavItem) chatsNavItem.classList.add('active');
    
    document.getElementById('chat-placeholder').style.display = 'none';
    document.getElementById('chat-active').style.display = 'flex';
    
    if (chat.isGroup) {
        document.getElementById('chat-user-name').textContent = chat.groupName || 'Group';
        document.getElementById('chat-user-status').textContent = chat.participants.length + ' members';
    } else {
        var users = Storage.get('users') || [];
        var otherUser = users.find(function(u) { return u.id === userId; });
        
        if (otherUser) {
            document.getElementById('chat-user-name').textContent = otherUser.name;
            
            // Check actual online status from Firebase
            var isOnline = false;
            var lastSeenText = '';
            if (window.firebaseOnlineData && window.firebaseOnlineData[userId]) {
                isOnline = window.firebaseOnlineData[userId].online === true;
                if (window.firebaseOnlineData[userId].lastSeen) {
                    lastSeenText = formatLastSeen(window.firebaseOnlineData[userId].lastSeen);
                }
            }
            
            if (isOnline) {
                document.getElementById('chat-user-status').textContent = 'Online';
            } else if (lastSeenText) {
                document.getElementById('chat-user-status').textContent = lastSeenText;
            } else {
                document.getElementById('chat-user-status').textContent = 'Offline';
            }
        } else {
            document.getElementById('chat-user-name').textContent = 'Chat';
            document.getElementById('chat-user-status').textContent = '';
        }
    }
    
    // Apply wallpaper
    var wallpaper = chat.wallpaper || (Storage.get('settings') || {}).wallpaper || 'none';
    document.getElementById('chat-wallpaper').style.background = wallpaper;
    
    // Render current messages
    renderMessages(chatId);
    
    // Load messages from Firebase and start listening
    if (typeof loadChatMessages === 'function') {
        loadChatMessages(chatId).then(function(fbMessages) {
            console.log('Loaded', fbMessages.length, 'messages from Firebase');
            
            // Merge with local messages
            var localMessages = Storage.get('messages') || [];
            fbMessages.forEach(function(fbMsg) {
                var idx = localMessages.findIndex(function(m) { return m.id === fbMsg.id; });
                if (idx === -1) {
                    localMessages.push(fbMsg);
                }
            });
            Storage.set('messages', localMessages);
            renderMessages(chatId);
            loadChats();
        });
    }
    
    // Listen for NEW messages in real-time
    if (typeof listenChat === 'function') {
        listenChat(chatId, function(msg) {
            var localMessages = Storage.get('messages') || [];
            var idx = localMessages.findIndex(function(m) { return m.id === msg.id; });
            
            if (idx === -1) {
                // NEW MESSAGE!
                localMessages.push(msg);
                Storage.set('messages', localMessages);
                
                // Play sound if not our message
                if (msg.senderId !== currentUser.id) {
                    playReceiveSound();
                }
                
                renderMessages(chatId);
                loadChats();
            } else {
                // Update existing
                localMessages[idx] = msg;
                Storage.set('messages', localMessages);
                renderMessages(chatId);
            }
        });
    }
    
    // POLLING BACKUP - fetch messages every 1 second (in case listener fails)
    if (window.chatPollInterval) {
        clearInterval(window.chatPollInterval);
    }
    window.chatPollInterval = setInterval(function() {
        if (activeChat && activeChat.id === chatId && typeof loadChatMessages === 'function') {
            console.log('Polling for messages...');
            loadChatMessages(chatId).then(function(fbMessages) {
                if (fbMessages && fbMessages.length > 0) {
                    var localMessages = Storage.get('messages') || [];
                    var changed = false;
                    
                    fbMessages.forEach(function(fbMsg) {
                        var idx = localMessages.findIndex(function(m) { return m.id === fbMsg.id; });
                        if (idx === -1) {
                            localMessages.push(fbMsg);
                            changed = true;
                            // Play sound for new messages from others
                            if (fbMsg.senderId !== currentUser.id) {
                                playReceiveSound();
                            }
                        }
                    });
                    
                    if (changed) {
                        Storage.set('messages', localMessages);
                        renderMessages(chatId);
                        loadChats();
                    }
                }
            });
        }
    }, 2000);
    
    // Listen for typing
    if (typeof listenTyping === 'function') {
        listenTyping(chatId, currentUser.id, function(uid) {
            var users = Storage.get('users') || [];
            var typingUser = users.find(function(u) { return u.id === uid; });
            if (typingUser) {
                document.getElementById('typing-indicator').style.display = 'flex';
                document.getElementById('typing-indicator').querySelector('span').textContent = typingUser.name + ' is typing';
                setTimeout(function() {
                    document.getElementById('typing-indicator').style.display = 'none';
                }, 3000);
            }
        });
    }
    
    // Mark chat as active in sidebar
    document.querySelectorAll('.chat-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.chatId === chatId) item.classList.add('active');
    });
}

// ==========================================
// Render Messages
// ==========================================
function renderMessages(chatId) {
    var messages = Storage.get('messages') || [];
    var users = Storage.get('users') || [];
    var messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    var chatMessages = messages.filter(function(m) { return m.chatId === chatId; });
    
    // Mark as read
    chatMessages.forEach(function(msg) {
        if (!msg.read && msg.senderId !== currentUser.id) {
            msg.read = true;
            msg.status = 'read';
        }
    });
    Storage.set('messages', messages);
    
    // Update unread badge
    updateUnreadBadge();
    
    var html = '';
    var lastDate = null;
    
    chatMessages.forEach(function(msg) {
        var isSent = msg.senderId === currentUser.id;
        
        // Add date separator
        var dateStr = formatDateSeparator(msg.timestamp);
        if (dateStr !== lastDate) {
            html += '<div class="date-separator"><span>' + dateStr + '</span></div>';
            lastDate = dateStr;
        }
        
        html += '<div class="message ' + (isSent ? 'sent' : 'received') + (msg.pinned ? ' pinned' : '') + '" data-message-id="' + msg.id + '">';
        html += '<div class="message-bubble">';
        
        // Show pinned badge
        if (msg.pinned) {
            html += '<div class="pinned-badge"><i class="fas fa-thumbtack"></i> Pinned</div>';
        }
        
        // Show reply quote if replying to a message
        if (msg.replyTo) {
            html += '<div class="message-reply-quote" onclick="scrollToMessage(\'' + msg.replyTo.id + '\')">';
            html += '<span class="reply-quote-sender">' + escapeHtml(msg.replyTo.senderName || 'Unknown') + '</span>';
            html += '<span class="reply-quote-text">' + escapeHtml(msg.replyTo.text ? msg.replyTo.text.substring(0, 80) + (msg.replyTo.text.length > 80 ? '...' : '') : '') + '</span>';
            html += '</div>';
        }
        
        // Check for GIF or large emoji
        if (msg.gifUrl) {
            html += '<div class="message-gif"><img src="' + msg.gifUrl + '" alt="GIF" class="gif-image"></div>';
        }
        // Check for emoji message (large display)
        else if (msg.isEmoji) {
            html += '<div class="message-emoji-large">' + msg.text + '</div>';
        }
        // Check for image
        else if (msg.fileData && msg.fileType && msg.fileType.startsWith('image/')) {
            html += '<div class="message-media"><img src="' + msg.fileData + '" alt="Image" onclick="viewImage(this.src)"></div>';
        }
        // Check for video
        else if (msg.fileData && msg.fileType && msg.fileType.startsWith('video/')) {
            html += '<div class="message-video"><video controls src="' + msg.fileData + '"></video></div>';
        }
        // Check for audio file
        else if (msg.fileData && msg.fileType && msg.fileType.startsWith('audio/')) {
            html += '<div class="message-audio"><audio controls src="' + msg.fileData + '"></audio></div>';
        }
        // Check for voice message (audioData field)
        else if (msg.audioData) {
            html += '<div class="message-voice"><div class="voice-icon"><i class="fas fa-microphone"></i></div><audio controls src="' + msg.audioData + '"></audio></div>';
        }
        // Check for file
        else if (msg.fileData) {
            var fileIcon = getFileIcon(msg.fileName || '');
            html += '<div class="message-file">';
            html += '<a href="' + msg.fileData + '" download="' + (msg.fileName || 'file') + '">';
            html += '<i class="fas ' + fileIcon + '"></i>';
            html += '<span class="file-name">' + escapeHtml(msg.fileName || 'file') + '</span>';
            html += '</a></div>';
        }
        // Regular text
        else {
            html += '<div class="message-text">' + escapeHtml(msg.text) + '</div>';
        }
        
        // Reactions
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            html += '<div class="message-reactions" onclick="showReactionDetails(\'' + msg.id + '\')">';
            
            // Group reactions by emoji
            var reactionGroups = {};
            Object.entries(msg.reactions).forEach(function(entry) {
                var userId = entry[0];
                var emoji = entry[1];
                if (!reactionGroups[emoji]) {
                    reactionGroups[emoji] = [];
                }
                reactionGroups[emoji].push(userId);
            });
            
            // Display each emoji with count
            Object.entries(reactionGroups).forEach(function(entry) {
                var emoji = entry[0];
                var userIds = entry[1];
                html += '<span class="reaction-badge" title="Click to see who reacted">' + emoji + ' ' + userIds.length + '</span>';
            });
            
            html += '</div>';
        }
        
        // Show edited indicator
        if (msg.edited) {
            html += '<span class="message-edited">(edited)</span>';
        }
        
        html += '<div class="message-footer">';
        html += '<span class="message-time">' + formatTime(msg.timestamp) + '</span>';
        if (isSent) {
            var statusClass = msg.status === 'read' ? ' read' : '';
            html += '<span class="message-status' + statusClass + '">' + (msg.status === 'read' ? '✓✓' : '✓') + '</span>';
        }
        html += '</div>';
        
        // Check if message can be edited (only text messages)
        var canEdit = isSent && !msg.gifUrl && !msg.fileData && !msg.audioData;
        
        // Action buttons
        html += '<div class="message-actions">';
        html += '<button class="message-action-btn" onclick="replyToMessage(\'' + msg.id + '\')" title="Reply"><i class="fas fa-reply"></i></button>';
        html += '<button class="message-action-btn" onclick="showReactionPicker(\'' + msg.id + '\')" title="React">😀</button>';
        html += '<button class="message-action-btn" onclick="forwardMessage(\'' + msg.id + '\')" title="Forward"><i class="fas fa-share"></i></button>';
        html += '<button class="message-action-btn ' + (msg.pinned ? 'pin-message-btn' : '') + '" onclick="pinMessage(\'' + msg.id + '\')" title="' + (msg.pinned ? 'Unpin' : 'Pin') + '"><i class="fas fa-thumbtack"></i></button>';
        if (canEdit) {
            html += '<button class="message-action-btn" onclick="editMessage(\'' + msg.id + '\')" title="Edit"><i class="fas fa-edit"></i></button>';
        }
        if (isSent) {
            html += '<button class="message-action-btn" onclick="deleteMessage(\'' + msg.id + '\')" title="Delete"><i class="fas fa-trash"></i></button>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    
    messagesContainer.innerHTML = html;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function viewImage(src) {
    showModal('<div class="image-viewer"><img src="' + src + '" style="max-width:100%;max-height:80vh;"></div>');
}

function scrollToMessage(messageId) {
    var msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
    if (msgEl) {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgEl.classList.add('highlight-message');
        setTimeout(function() {
            msgEl.classList.remove('highlight-message');
        }, 2000);
    }
}

function getFileIcon(fileName) {
    var ext = fileName.split('.').pop().toLowerCase();
    var icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'ppt': 'fa-file-powerpoint',
        'pptx': 'fa-file-powerpoint',
        'zip': 'fa-file-archive',
        'rar': 'fa-file-archive',
        'txt': 'fa-file-alt',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image',
        'mp3': 'fa-file-audio',
        'wav': 'fa-file-audio',
        'mp4': 'fa-file-video',
        'avi': 'fa-file-video'
    };
    return icons[ext] || 'fa-file';
}

function showReactionPicker(messageId) {
    var reactions = ['❤️', '👍', '👎', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯', '🤔', '👏', '🙏', '💪', '✨', '😎'];
    var html = '<div class="reaction-picker">';
    reactions.forEach(function(emoji) {
        html += '<button class="reaction-option" onclick="addReaction(\'' + messageId + '\', \'' + emoji + '\')">' + emoji + '</button>';
    });
    html += '</div>';
    
    var messageEl = document.querySelector('[data-message-id="' + messageId + '"]');
    if (messageEl) {
        var existingPicker = messageEl.querySelector('.reaction-picker');
        if (existingPicker) {
            existingPicker.remove();
        } else {
            document.querySelectorAll('.reaction-picker').forEach(function(p) { p.remove(); });
            var pickerDiv = document.createElement('div');
            pickerDiv.innerHTML = html;
            messageEl.querySelector('.message-bubble').appendChild(pickerDiv.firstElementChild);
        }
    }
}

function addReaction(messageId, emoji) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    
    if (message) {
        if (!message.reactions) message.reactions = {};
        message.reactions[currentUser.id] = emoji;
        Storage.set('messages', messages);
        
        // Sync to Firebase
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(message);
        }
        
        if (activeChat) {
            renderMessages(activeChat.id);
        }
        showToast('Reacted with ' + emoji, 'info');
    }
}

function showReactionDetails(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message || !message.reactions || Object.keys(message.reactions).length === 0) {
        showToast('No reactions yet', 'info');
        return;
    }
    
    var users = Storage.get('users') || [];
    
    // Group reactions by emoji
    var reactionGroups = {};
    Object.entries(message.reactions).forEach(function(entry) {
        var userId = entry[0];
        var emoji = entry[1];
        if (!reactionGroups[emoji]) {
            reactionGroups[emoji] = [];
        }
        reactionGroups[emoji].push(userId);
    });
    
    var html = '<div class="reaction-details"><h3>Reactions</h3>';
    
    Object.entries(reactionGroups).forEach(function(entry) {
        var emoji = entry[0];
        var userIds = entry[1];
        
        html += '<div class="reaction-group">';
        html += '<div class="reaction-emoji">' + emoji + '</div>';
        html += '<div class="reaction-users">';
        
        userIds.forEach(function(userId) {
            var user = users.find(function(u) { return u.id === userId; });
            if (user) {
                var avatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
                html += '<div class="reaction-user">';
                html += '<div class="reaction-user-avatar">' + avatar + '</div>';
                html += '<span class="reaction-user-name">' + escapeHtml(user.name) + '</span>';
                html += '</div>';
            }
        });
        
        html += '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    showModal(html);
}

function clearReplyPreview() {
    currentReplyTo = null;
    var preview = document.getElementById('reply-preview');
    if (preview) preview.style.display = 'none';
}

function replyToMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    var users = Storage.get('users') || [];
    var sender = users.find(function(u) { return u.id === message.senderId; });
    
    currentReplyTo = {
        id: message.id,
        senderId: message.senderId,
        senderName: sender ? sender.name : 'Unknown',
        text: message.text || (message.gifUrl ? '[GIF]' : message.fileData ? '[File]' : message.audioData ? '[Voice]' : '')
    };
    
    // Show reply preview
    var preview = document.getElementById('reply-preview');
    var replyTo = document.getElementById('reply-to');
    var replyText = document.getElementById('reply-text');
    
    replyTo.textContent = currentReplyTo.senderName;
    replyText.textContent = currentReplyTo.text.substring(0, 100) + (currentReplyTo.text.length > 100 ? '...' : '');
    preview.style.display = 'flex';
    
    // Focus input
    document.getElementById('chat-input').focus();
}

function editMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    // Can't edit GIFs, files, or audio
    if (message.gifUrl || message.fileData || message.audioData) {
        showToast('Cannot edit this message type', 'error');
        return;
    }
    
    var html = '<div class="edit-message-modal"><h3>Edit Message</h3>';
    html += '<textarea id="edit-message-input" rows="3">' + escapeHtml(message.text) + '</textarea>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="closeModal()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveEditedMessage(\'' + messageId + '\')">Save</button>';
    html += '</div></div>';
    showModal(html);
    
    // Focus the input
    setTimeout(function() {
        document.getElementById('edit-message-input').focus();
    }, 100);
}

function saveEditedMessage(messageId) {
    var newText = document.getElementById('edit-message-input').value.trim();
    if (!newText) {
        showToast('Message cannot be empty', 'error');
        return;
    }
    
    var messages = Storage.get('messages') || [];
    var messageIndex = messages.findIndex(function(m) { return m.id === messageId; });
    if (messageIndex === -1) return;
    
    messages[messageIndex].text = newText;
    messages[messageIndex].edited = true;
    Storage.set('messages', messages);
    
    // Sync to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(messages[messageIndex]);
    }
    
    closeModal();
    if (activeChat) {
        renderMessages(activeChat.id);
    }
    showToast('Message edited', 'success');
}

function deleteMessage(messageId) {
    showModal('<div class="delete-confirm"><h3>Delete Message?</h3><p>This will delete the message for everyone.</p><div class="modal-buttons"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="confirmDeleteMessage(\'' + messageId + '\')">Delete</button></div></div>');
}

function confirmDeleteMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var chatId = null;
    
    messages = messages.filter(function(m) {
        if (m.id === messageId) {
            chatId = m.chatId;
            return false;
        }
        return true;
    });
    
    Storage.set('messages', messages);
    
    // Sync deletion to Firebase (store a "deleted" message)
    if (typeof sendMsgToFirebase === 'function' && chatId) {
        var deletedMessage = {
            id: messageId,
            chatId: chatId,
            deleted: true
        };
        sendMsgToFirebase(deletedMessage);
    }
    
    closeModal();
    if (activeChat) {
        renderMessages(activeChat.id);
        loadChats();
    }
    showToast('Message deleted', 'success');
}

function forwardMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    var chats = Storage.get('chats') || [];
    var users = Storage.get('users') || [];
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
    
    if (myChats.length === 0) {
        showToast('No chats to forward to', 'info');
        return;
    }
    
    var html = '<div class="forward-modal"><h3>Forward Message</h3>';
    html += '<div class="forward-preview"><p>' + escapeHtml(message.text.substring(0, 100)) + '</p></div>';
    html += '<div class="forward-chats">';
    
    myChats.forEach(function(chat) {
        if (chat.id === activeChat.id) return; // Skip current chat
        
        var chatName = '';
        if (chat.isGroup) {
            chatName = chat.groupName || 'Group';
        } else {
            var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
            var otherUser = users.find(function(u) { return u.id === otherUserId; });
            chatName = otherUser ? otherUser.name : 'Chat';
        }
        
        html += '<div class="forward-chat-item" onclick="confirmForward(\'' + messageId + '\', \'' + chat.id + '\')">';
        html += '<i class="fas fa-' + (chat.isGroup ? 'users' : 'user') + '"></i>';
        html += '<span>' + escapeHtml(chatName) + '</span>';
        html += '</div>';
    });
    
    html += '</div></div>';
    showModal(html);
}

function confirmForward(messageId, toChatId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    var newMessage = {
        id: generateId(),
        chatId: toChatId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: message.text,
        fileData: message.fileData || null,
        fileName: message.fileName || null,
        fileType: message.fileType || null,
        gifUrl: message.gifUrl || null,
        audioData: message.audioData || null,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: true
    };
    
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    // Sync to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage);
    }
    
    closeModal();
    showToast('Message forwarded', 'success');
    loadChats();
}

function handleMentionInput(input) {
    var text = input.value;
    var cursorPos = input.selectionStart;
    var textBeforeCursor = text.substring(0, cursorPos);
    var mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
        var query = mentionMatch[1];
        var users = Storage.get('users') || [];
        var filteredUsers = users.filter(function(u) {
            return u.id !== currentUser.id && 
                   (u.username.toLowerCase().startsWith(query.toLowerCase()) ||
                    u.name.toLowerCase().startsWith(query.toLowerCase()));
        }).slice(0, 5);
        
        if (filteredUsers.length > 0) {
            showMentionsDropdown(filteredUsers, mentionMatch[0].length);
        } else {
            hideMentionsDropdown();
        }
    } else {
        hideMentionsDropdown();
    }
}

function showMentionsDropdown(users, mentionLength) {
    var dropdown = document.getElementById('mentions-dropdown');
    var input = document.getElementById('message-input');
    if (!dropdown || !input) return;
    
    var html = '';
    users.forEach(function(user) {
        html += '<div class="mention-item" onclick="selectMention(\'' + user.username + '\', ' + mentionLength + ')">';
        html += '<span class="mention-name">' + user.name + '</span>';
        html += '<span class="mention-username">@' + user.username + '</span>';
        html += '</div>';
    });
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function selectMention(username, mentionLength) {
    var input = document.getElementById('message-input');
    if (!input) return;
    
    var text = input.value;
    var cursorPos = input.selectionStart;
    var textBeforeCursor = text.substring(0, cursorPos);
    var atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
        var newText = text.substring(0, atIndex) + '@' + username + ' ' + text.substring(cursorPos);
        input.value = newText;
        var newCursorPos = atIndex + username.length + 2;
        input.setSelectionRange(newCursorPos, newCursorPos);
    }
    
    hideMentionsDropdown();
    input.focus();
}

function hideMentionsDropdown() {
    var dropdown = document.getElementById('mentions-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// ==========================================
// File & Media Functions
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
    
    // Update new profile fields
    document.getElementById('profile-email').textContent = currentUser.email || '-';
    document.getElementById('profile-phone').textContent = currentUser.phone || '-';
    document.getElementById('profile-location').textContent = currentUser.location || '-';
    
    // Load cover photo
    if (currentUser.cover) {
        updateProfileCover(currentUser.cover);
    }
    
    // Display avatar if exists
    var profileAvatar = document.getElementById('profile-avatar');
    if (currentUser.avatar) {
        profileAvatar.innerHTML = '<img src="' + currentUser.avatar + '" alt="Avatar">' +
            '<button class="btn-icon edit-avatar" title="Change Avatar" id="change-avatar-btn">' +
            '<i class="fas fa-camera"></i></button>' +
            '<input type="file" id="avatar-input" style="display: none;" accept="image/*">';
    } else {
        profileAvatar.innerHTML = '<i class="fas fa-user"></i>' +
            '<button class="btn-icon edit-avatar" title="Change Avatar" id="change-avatar-btn">' +
            '<i class="fas fa-camera"></i></button>' +
            '<input type="file" id="avatar-input" style="display: none;" accept="image/*">';
    }
    
    // Re-attach avatar event listeners
    setTimeout(function() {
        var avatarBtn = document.getElementById('change-avatar-btn');
        var avatarInput = document.getElementById('avatar-input');
        if (avatarBtn) avatarBtn.onclick = changeAvatar;
        if (avatarInput) avatarInput.addEventListener('change', handleAvatarUpload);
    }, 100);
    
    var chats = Storage.get('chats') || [];
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
    document.getElementById('profile-chats').textContent = myChats.length;
    document.getElementById('profile-friends').textContent = (Storage.get('users') || []).length - 1;
    document.getElementById('profile-joined').textContent = formatDate(currentUser.createdAt);
    
    // Update messages count
    var messages = Storage.get('messages') || [];
    var myMessages = messages.filter(function(m) { return m.senderId === currentUser.id; });
    document.getElementById('profile-messages').textContent = myMessages.length;
    
    // Update last seen
    var now = new Date();
    document.getElementById('profile-last-seen').textContent = 'Last seen just now';
}

function closeEditProfile() {
    document.getElementById('profile-edit-form').style.display = 'none';
    document.getElementById('profile-card').style.display = 'block';
    document.querySelector('.profile-container').classList.remove('editing');
}

function changePassword() {
    showToast('Change password feature coming soon!', 'info');
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
    
    // Sync updated profile to Firebase
    if (typeof syncUserToFirebase === 'function') {
        syncUserToFirebase(currentUser);
    }
    
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
    var chats = Storage.get('chats') || [];
    
    // Update stats with animation
    animateCounter('total-users', users.length);
    animateCounter('total-messages', messages.length);
    animateCounter('active-users', users.filter(function(u) { return (u.status || 'active') === 'active'; }).length);
    animateCounter('banned-users', users.filter(function(u) { return u.status === 'banned'; }).length);
    animateCounter('total-chats', chats.length);
    animateCounter('total-groups', chats.filter(function(c) { return c.isGroup; }).length);
    
    // Load online users from Firebase
    loadOnlineUsers();
    
    renderAdminUsersTable(users);
    renderRecentActivity();
}

function loadOnlineUsers() {
    if (!firebaseDb) return;
    
    // Use once() for single load instead of on() to avoid performance issues
    firebaseDb.ref('online').once('value', function(snapshot) {
        var onlineData = snapshot.val() || {};
        var onlineUsers = [];
        
        Object.keys(onlineData).forEach(function(userId) {
            if (onlineData[userId].online === true && userId !== currentUser.id) {
                onlineUsers.push(userId);
            }
        });
        
        // Update online count
        var countEl = document.getElementById('online-users-count');
        if (countEl) countEl.textContent = onlineUsers.length;
        
        // Render online users list
        var listEl = document.getElementById('online-users-list');
        if (!listEl) return;
        
        if (onlineUsers.length === 0) {
            listEl.innerHTML = '<p class="no-online">No users online</p>';
            return;
        }
        
        // Get users from Firebase
        firebaseDb.ref('users').once('value', function(usersSnap) {
            var firebaseUsers = usersSnap.val() || {};
            var users = Storage.get('users') || [];
            
            // Merge Firebase users into local storage
            Object.keys(firebaseUsers).forEach(function(firebaseUserId) {
                if (!users.find(function(u) { return u.id === firebaseUserId; })) {
                    users.push(firebaseUsers[firebaseUserId]);
                }
            });
            
            var html = '';
            
            onlineUsers.forEach(function(userId) {
                var user = users.find(function(u) { return u.id === userId; });
                if (!user) {
                    user = firebaseUsers[userId];
                }
                if (user) {
                    html += '<div class="online-user-item">';
                    html += '<div class="online-user-avatar">' + (user.avatar ? '<img src="' + user.avatar + '">' : '<i class="fas fa-user"></i>') + '</div>';
                    html += '<div class="online-user-info">';
                    html += '<span class="online-user-name">' + (user.name || 'Unknown') + '</span>';
                    html += '<span class="online-user-username">@' + (user.username || 'unknown') + '</span>';
                    html += '</div>';
                    html += '<span class="online-badge"><i class="fas fa-circle"></i> Online</span>';
                    html += '</div>';
                }
            });
            
            listEl.innerHTML = html || '<p class="no-online">No users online</p>';
        });
    });
}

function animateCounter(elementId, target) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var current = parseInt(el.textContent) || 0;
    var increment = Math.ceil((target - current) / 20);
    var timer = setInterval(function() {
        current += increment;
        if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
            current = target;
            clearInterval(timer);
        }
        el.textContent = current;
    }, 30);
}

function renderAdminUsersTable(users) {
    var tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = users.map(function(user) {
        var status = user.status || 'active';
        var role = user.role || 'user';
        var avatar = user.avatar ? '<img src="' + user.avatar + '" class="table-avatar">' : '<div class="table-avatar-placeholder">' + (user.name || '?').charAt(0).toUpperCase() + '</div>';
        
        var actions = '';
        if (user.id !== currentUser.id) {
            actions = '<div class="action-buttons">';
            actions += '<button class="btn btn-small ' + (status === 'banned' ? 'btn-success' : 'btn-warning') + '" onclick="toggleUserBan(\'' + user.id + '\')" title="' + (status === 'banned' ? 'Unban' : 'Ban') + '">';
            actions += '<i class="fas fa-' + (status === 'banned' ? 'unlock' : 'ban') + '"></i>';
            actions += '</button>';
            actions += '<button class="btn btn-small btn-danger" onclick="deleteUser(\'' + user.id + '\')" title="Delete">';
            actions += '<i class="fas fa-trash"></i>';
            actions += '</button>';
            actions += '<button class="btn btn-small" onclick="viewUserDetails(\'' + user.id + '\')" title="View Details">';
            actions += '<i class="fas fa-eye"></i>';
            actions += '</button>';
            actions += '</div>';
        } else {
            actions = '<span class="you-label">You</span>';
        }
        
        return '<tr class="user-row" data-user-id="' + user.id + '">' +
            '<td><div class="user-cell">' + avatar + '<div class="user-info-cell"><strong>' + escapeHtml(user.name || 'Unknown') + '</strong><small>@' + escapeHtml(user.username || 'unknown') + '</small></div></div></td>' +
            '<td>' + escapeHtml(user.email || 'N/A') + '</td>' +
            '<td><span class="role-badge ' + role + '">' + role + '</span></td>' +
            '<td><span class="status-badge ' + status + '">' + status + '</span></td>' +
            '<td>' + formatDate(user.createdAt) + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
    }).join('');
}

function renderRecentActivity() {
    var container = document.getElementById('recent-activity');
    if (!container) return;
    
    var messages = Storage.get('messages') || [];
    var users = Storage.get('users') || [];
    
    // Get last 10 messages
    var recentMessages = messages.slice(-10).reverse();
    
    if (recentMessages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
        return;
    }
    
    var html = '';
    recentMessages.forEach(function(msg) {
        var sender = users.find(function(u) { return u.id === msg.senderId; });
        var senderName = sender ? sender.name : 'Unknown';
        html += '<div class="activity-item">';
        html += '<i class="fas fa-comment"></i>';
        html += '<div class="activity-info">';
        html += '<strong>' + escapeHtml(senderName) + '</strong>';
        html += '<span>' + escapeHtml(msg.text.substring(0, 50)) + (msg.text.length > 50 ? '...' : '') + '</span>';
        html += '</div>';
        html += '<small>' + formatTime(msg.timestamp) + '</small>';
        html += '</div>';
    });
    
    container.innerHTML = html;
}

function toggleUserBan(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === userId; });
    if (user) {
        user.status = user.status === 'banned' ? 'active' : 'banned';
        Storage.set('users', users);
        addLog('warning', (user.status === 'banned' ? 'Banned' : 'Unbanned') + ' user: ' + (user.username || user.name));
        loadAdminData();
        showToast('User ' + (user.status === 'banned' ? 'banned' : 'unbanned'), 'success');
    }
}

function deleteUser(userId) {
    showModal('<div class="delete-user-confirm"><h3>Delete User?</h3><p>This will permanently delete the user and all their messages.</p><div class="modal-buttons"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmDeleteUser(\'' + userId + '\')">Delete</button></div></div>');
}

function confirmDeleteUser(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === userId; });
    
    // Remove user
    users = users.filter(function(u) { return u.id !== userId; });
    Storage.set('users', users);
    
    // Remove user from Firebase and mark as deleted
    if (firebaseDb) {
        firebaseDb.ref('users/' + userId).remove();
        firebaseDb.ref('online/' + userId).remove();
        firebaseDb.ref('deletedUsers/' + userId).set(true);
    }
    
    // Remove user's messages
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.senderId !== userId; });
    Storage.set('messages', messages);
    
    // Remove user from chats
    var chats = Storage.get('chats') || [];
    chats.forEach(function(chat) {
        chat.participants = chat.participants.filter(function(p) { return p !== userId; });
    });
    chats = chats.filter(function(c) { return c.participants.length > 0; });
    Storage.set('chats', chats);
    
    addLog('error', 'Deleted user: ' + (user ? user.username : userId));
    closeModal();
    loadAdminData();
    showToast('User deleted', 'success');
}

function viewUserDetails(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === userId; });
    if (!user) return;
    
    var messages = Storage.get('messages') || [];
    var userMessages = messages.filter(function(m) { return m.senderId === userId; });
    var chats = Storage.get('chats') || [];
    var userChats = chats.filter(function(c) { return c.participants.indexOf(userId) !== -1; });
    var posts = Storage.get('posts') || [];
    var userPosts = posts.filter(function(p) { return p.userId === userId; });
    
    var avatarHtml = user.avatar
        ? '<img src="' + escapeHtml(user.avatar) + '" alt="">'
        : '<span class="profile-initial">' + (user.name || '?').charAt(0).toUpperCase() + '</span>';
    
    var coverHtml = user.cover
        ? '<img class="profile-cover-img" src="' + escapeHtml(user.cover) + '" alt="">'
        : '<div class="profile-cover-gradient"></div>';

    var roleBadge = user.role === 'admin'
        ? '<span class="badge-inline badge-admin"><i class="fas fa-shield-alt"></i> Admin</span>'
        : '<span class="badge-inline badge-user"><i class="fas fa-user"></i> User</span>';

    var statusBadge = user.status === 'banned'
        ? '<span class="badge-inline badge-banned"><i class="fas fa-ban"></i> Banned</span>'
        : '<span class="badge-inline badge-active"><i class="fas fa-circle"></i> Active</span>';

    var isOwner = currentUser && userId === currentUser.id;
    var isBlocked = currentUser && currentUser.blockedUsers && currentUser.blockedUsers.indexOf(userId) !== -1;

    var html = '<div class="user-profile-modal">';
    html += '<div class="user-cover">' + coverHtml + '</div>';
    html += '<div class="user-avatar-section"><div class="user-avatar-large">' + avatarHtml + '</div></div>';
    html += '<div class="user-identity">';
    html += '<h3>' + escapeHtml(user.name || 'Unknown') + '</h3>';
    html += '<p class="user-handle">@' + escapeHtml(user.username || 'unknown') + '</p>';
    html += '<div class="user-badges">' + roleBadge + statusBadge + '</div>';
    html += '</div>';

    if (user.bio) {
        html += '<div class="user-bio">' + escapeHtml(user.bio) + '</div>';
    }

    html += '<div class="user-stats-row">';
    html += '<div class="user-stat"><strong>' + userMessages.length + '</strong><span>Messages</span></div>';
    html += '<div class="user-stat"><strong>' + userChats.length + '</strong><span>Chats</span></div>';
    html += '<div class="user-stat"><strong>' + userPosts.length + '</strong><span>Posts</span></div>';
    html += '</div>';

    html += '<div class="user-info-grid">';
    if (user.email) html += '<div class="info-item"><i class="fas fa-envelope"></i><span>' + escapeHtml(user.email) + '</span></div>';
    if (user.phone) html += '<div class="info-item"><i class="fas fa-phone"></i><span>' + escapeHtml(user.phone) + '</span></div>';
    if (user.location) html += '<div class="info-item"><i class="fas fa-map-marker-alt"></i><span>' + escapeHtml(user.location) + '</span></div>';
    html += '<div class="info-item"><i class="fas fa-calendar-alt"></i><span>Joined ' + formatDate(user.createdAt) + '</span></div>';
    html += '</div>';

    if (!isOwner) {
        html += '<div class="user-actions">';
        html += '<button class="btn btn-primary user-action-btn" onclick="closeModal(); startChatWith(\'' + userId + '\')"><i class="fas fa-comment"></i> Message</button>';
        if (isBlocked) {
            html += '<button class="btn btn-outline user-action-btn" onclick="unblockUserFromModal(\'' + userId + '\')"><i class="fas fa-unlock"></i> Unblock</button>';
        } else {
            html += '<button class="btn btn-outline user-action-btn danger-outline" onclick="blockUserFromModal(\'' + userId + '\')"><i class="fas fa-ban"></i> Block</button>';
        }
        html += '</div>';
    }

    html += '</div>';
    showModal(html);
}

function startChatWith(userId) {
    var chats = Storage.get('chats') || [];
    var existing = chats.find(function(c) { return !c.isGroup && c.participants.indexOf(currentUser.id) !== -1 && c.participants.indexOf(userId) !== -1; });
    if (existing) {
        openChat(existing.id);
    } else {
        var newChat = { id: generateId(), participants: [currentUser.id, userId], createdAt: new Date().toISOString(), pinned: false, muted: false, archived: false, isGroup: false };
        chats.push(newChat);
        Storage.set('chats', chats);
        openChat(newChat.id);
        loadChats();
    }
}

function blockUserFromModal(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === currentUser.id; });
    if (!user) return;
    if (!user.blockedUsers) user.blockedUsers = [];
    if (user.blockedUsers.indexOf(userId) === -1) {
        user.blockedUsers.push(userId);
        currentUser.blockedUsers = user.blockedUsers;
        Storage.set('users', users);
        showToast('User blocked', 'info');
        closeModal();
    }
}

function unblockUserFromModal(userId) {
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.id === currentUser.id; });
    if (!user || !user.blockedUsers) return;
    user.blockedUsers = user.blockedUsers.filter(function(id) { return id !== userId; });
    currentUser.blockedUsers = user.blockedUsers;
    Storage.set('users', users);
    showToast('User unblocked', 'success');
    closeModal();
}

function searchAdminUsers(query) {
    var users = Storage.get('users') || [];
    var filtered = users.filter(function(u) {
        return u.name.toLowerCase().includes(query.toLowerCase()) ||
               u.email.toLowerCase().includes(query.toLowerCase()) ||
               u.username.toLowerCase().includes(query.toLowerCase());
    });
    renderAdminUsersTable(filtered);
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
    
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    
    var html = '<div class="chat-options-modal">';
    html += '<div class="chat-options-header">';
    html += '<h3><i class="fas fa-cog"></i> Chat Options</h3>';
    html += '</div>';
    html += '<div class="chat-options-list">';
    
    // Group-specific options
    if (chat && chat.isGroup) {
        html += '<div class="option-item" onclick="showGroupInfo()">';
        html += '<i class="fas fa-users"></i>';
        html += '<span>Group Info</span>';
        html += '<i class="fas fa-chevron-right"></i>';
        html += '</div>';
        html += '<div class="option-item" onclick="leaveGroup()">';
        html += '<i class="fas fa-sign-out-alt" style="color: #ff4d4d;"></i>';
        html += '<span style="color: #ff4d4d;">Leave Group</span>';
        html += '<i class="fas fa-chevron-right"></i>';
        html += '</div>';
        html += '<div class="option-divider"></div>';
    }
    
    // Notification toggle
    var isMuted = chat && chat.muted;
    html += '<div class="option-item" onclick="toggleMuteChat()">';
    html += '<i class="fas fa-bell' + (isMuted ? '-slash' : '') + '"></i>';
    html += '<span>' + (isMuted ? 'Unmute' : 'Mute') + ' Notifications</span>';
    html += '<div class="option-toggle ' + (isMuted ? 'active' : '') + '"></div>';
    html += '</div>';
    
    // Pin toggle
    var isPinned = chat && chat.pinned;
    html += '<div class="option-item" onclick="togglePinChat()">';
    html += '<i class="fas fa-thumbtack"></i>';
    html += '<span>' + (isPinned ? 'Unpin' : 'Pin') + ' Chat</span>';
    html += '<div class="option-toggle ' + (isPinned ? 'active' : '') + '"></div>';
    html += '</div>';
    
    html += '<div class="option-divider"></div>';
    
    // Wallpaper
    html += '<div class="option-item" onclick="showWallpaperPicker()">';
    html += '<i class="fas fa-palette"></i>';
    html += '<span>Chat Wallpaper</span>';
    html += '<i class="fas fa-chevron-right"></i>';
    html += '</div>';
    
    // Archive
    html += '<div class="option-item" onclick="archiveChat()">';
    html += '<i class="fas fa-archive"></i>';
    html += '<span>Archive Chat</span>';
    html += '<i class="fas fa-chevron-right"></i>';
    html += '</div>';
    
    // Clear history
    html += '<div class="option-item" onclick="clearChatHistory()">';
    html += '<i class="fas fa-eraser"></i>';
    html += '<span>Clear Chat History</span>';
    html += '<i class="fas fa-chevron-right"></i>';
    html += '</div>';
    
    html += '<div class="option-divider"></div>';
    
    // Delete
    html += '<div class="option-item danger" onclick="deleteChat()">';
    html += '<i class="fas fa-trash"></i>';
    html += '<span>Delete Chat</span>';
    html += '<i class="fas fa-chevron-right"></i>';
    html += '</div>';
    
    html += '</div></div>';
    showModal(html);
}

function leaveGroup() {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup) {
        showToast('Not a group chat', 'error');
        return;
    }
    
    showModal('<div class="leave-group-confirm"><h3>Leave Group?</h3><p>You will no longer receive messages from this group.</p><div class="modal-buttons"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="confirmLeaveGroup()">Leave Group</button></div></div>');
}

function confirmLeaveGroup() {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var chat = chats[chatIndex];
    
    // Remove current user from participants
    chat.participants = chat.participants.filter(function(id) { return id !== currentUser.id; });
    
    // If no participants left, delete the chat entirely
    if (chat.participants.length === 0) {
        chats.splice(chatIndex, 1);
    } else {
        // If admin left, make first remaining participant the admin
        if (chat.admin === currentUser.id) {
            chat.admin = chat.participants[0];
        }
        chats[chatIndex] = chat;
    }
    
    Storage.set('chats', chats);
    
    // Sync to Firebase
    if (typeof syncChat === 'function' && chat.participants.length > 0) {
        syncChat(chat);
    }
    
    // Clear active chat
    activeChat = null;
    document.getElementById('chat-placeholder').style.display = 'block';
    document.getElementById('chat-active').style.display = 'none';
    
    closeModal();
    loadChats();
    loadGroups();
    showToast('You left the group', 'success');
}

function showGroupInfo() {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup) return;
    
    var users = Storage.get('users') || [];
    
    // If no admin is set, make the current user the admin
    if (!chat.admin) {
        chat.admin = currentUser.id;
        // Save the updated chat
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === chat.id; });
        if (chatIndex !== -1) {
            chats[chatIndex] = chat;
            Storage.set('chats', chats);
            // Sync to Firebase
            if (typeof syncChat === 'function') {
                syncChat(chat);
            }
        }
    }
    
    var isAdmin = chat.admin === currentUser.id;
    
    console.log('Group:', chat.groupName, '| Admin ID:', chat.admin, '| Your ID:', currentUser.id, '| isAdmin:', isAdmin);
    
    var html = '<div class="group-info"><h3>' + escapeHtml(chat.groupName || 'Group') + '</h3>';
    html += '<p>' + chat.participants.length + ' members</p>';
    
    // Show Add Members button for all members
    html += '<button class="btn btn-primary" onclick="showAddMembers()"><i class="fas fa-user-plus"></i> Add Members</button>';
    
    html += '<div class="group-members-list">';
    
    chat.participants.forEach(function(userId) {
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) {
            // Try to fetch from Firebase
            if (typeof fetchUserFromFirebase === 'function') {
                fetchUserFromFirebase(userId);
            }
            html += '<div class="group-member">';
            html += '<div class="member-avatar">?</div>';
            html += '<div class="member-info">';
            html += '<span class="member-name">' + userId.substring(0, 8) + '</span>';
            html += '<span class="member-username">@unknown</span>';
            html += '</div>';
            html += '</div>';
            return;
        }
        
        var avatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
        var isGroupAdmin = chat.admin === userId;
        
        html += '<div class="group-member">';
        html += '<div class="member-avatar">' + avatar + '</div>';
        html += '<div class="member-info">';
        html += '<span class="member-name">' + escapeHtml(user.name);
        if (isGroupAdmin) html += ' <span class="admin-badge">Admin</span>';
        if (userId === currentUser.id) html += ' <span class="you-badge">You</span>';
        html += '</span>';
        html += '<span class="member-username">@' + escapeHtml(user.username) + '</span>';
        html += '</div>';
        
        // Kick button - show for everyone except yourself (for testing)
        if (userId !== currentUser.id) {
            html += '<button class="btn btn-small danger" onclick="kickMember(\'' + userId + '\')"><i class="fas fa-user-minus"></i> Kick</button>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    html += '<button class="btn" onclick="closeModal()">Close</button>';
    html += '</div>';
    showModal(html);
}

function showAddMembers() {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup) return;
    
    var users = Storage.get('users') || [];
    
    // Filter out users already in the group
    var availableUsers = users.filter(function(u) {
        return chat.participants.indexOf(u.id) === -1 && u.id !== currentUser.id;
    });
    
    if (availableUsers.length === 0) {
        showToast('No users available to add', 'info');
        return;
    }
    
    var html = '<div class="add-members-modal"><h3>Add Members</h3>';
    html += '<div class="available-users-list">';
    
    availableUsers.forEach(function(user) {
        var avatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
        html += '<div class="available-user" onclick="addMemberToGroup(\'' + user.id + '\')">';
        html += '<div class="user-avatar-small">' + avatar + '</div>';
        html += '<div class="user-details">';
        html += '<span class="user-name">' + escapeHtml(user.name) + '</span>';
        html += '<span class="user-username">@' + escapeHtml(user.username) + '</span>';
        html += '</div>';
        html += '<i class="fas fa-plus-circle add-icon"></i>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<button class="btn" onclick="showGroupInfo()">Back</button>';
    html += '</div>';
    showModal(html);
}

function addMemberToGroup(userId) {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var chat = chats[chatIndex];
    if (!chat.isGroup || chat.admin !== currentUser.id) {
        showToast('Only admin can add members', 'error');
        return;
    }
    
    if (chat.participants.indexOf(userId) !== -1) {
        showToast('User already in group', 'info');
        return;
    }
    
    // Add member to participants
    chat.participants.push(userId);
    chats[chatIndex] = chat;
    Storage.set('chats', chats);
    
    // Sync to Firebase
    if (typeof syncChat === 'function') {
        syncChat(chat);
    }
    
    showToast('Member added!', 'success');
    
    // Refresh group info
    showGroupInfo();
}

function kickMember(userId) {
    if (!activeChat) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var chat = chats[chatIndex];
    if (!chat.isGroup) {
        showToast('Not a group chat', 'error');
        return;
    }
    
    // Can't kick yourself
    if (userId === currentUser.id) {
        showToast('Cannot kick yourself', 'error');
        return;
    }
    
    // Remove member from participants
    chat.participants = chat.participants.filter(function(id) { return id !== userId; });
    chats[chatIndex] = chat;
    Storage.set('chats', chats);
    
    // Sync to Firebase
    if (typeof syncChat === 'function') {
        syncChat(chat);
    }
    
    closeModal();
    showToast('Member removed from group', 'success');
    
    // Show updated group info
    showGroupInfo();
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
        document.getElementById('chat-placeholder').style.display = 'block';
        document.getElementById('chat-active').style.display = 'none';
        loadChats();
        showToast('Chat archived', 'success');
    }
}

function clearChatHistory() {
    if (!activeChat) return;
    
    // Clear from localStorage
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.chatId !== activeChat.id; });
    Storage.set('messages', messages);
    
    // Clear from Firebase
    if (firebaseDb) {
        firebaseDb.ref('messages/' + activeChat.id).remove()
            .then(function() {
                console.log('Messages deleted from Firebase');
            })
            .catch(function(err) {
                console.error('Error deleting from Firebase:', err);
            });
    }
    
    closeModal();
    renderMessages(activeChat.id);
    loadChats();
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
    
    // Also delete from Firebase
    if (firebaseDb) {
        firebaseDb.ref('chats/' + activeChat.id).remove();
        firebaseDb.ref('messages/' + activeChat.id).remove();
        firebaseDb.ref('userChats/' + currentUser.id + '/' + activeChat.id).remove();
    }
    
    closeModal();
    activeChat = null;
    document.getElementById('chat-placeholder').style.display = 'block';
    document.getElementById('chat-active').style.display = 'none';
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
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.xls,.xlsx,.ppt,.pptx';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (file) {
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showToast('File too large. Max 10MB allowed.', 'error');
                return;
            }
            
            var reader = new FileReader();
            reader.onload = function(event) {
                sendFileMessage(file, event.target.result);
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
    
    var picker = document.getElementById('gif-picker');
    var isVisible = picker.style.display !== 'none';
    picker.style.display = isVisible ? 'none' : 'flex';
    
    if (!isVisible) {
        populateGifPicker('trending');
        document.getElementById('gif-search').value = '';
    }
    
    document.getElementById('emoji-picker').style.display = 'none';
}

function searchGifs(query) {
    if (!query.trim()) {
        populateGifPicker('trending');
        return;
    }
    
    var grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    
    // Use Giphy API (public beta key for limited use)
    var apiKey = 'dc6zaTOxFJmzC'; // Giphy public beta key
    var url = 'https://api.giphy.com/v1/gifs/search?q=' + encodeURIComponent(query) + '&api_key=' + apiKey + '&limit=24&rating=g';
    
    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            grid.innerHTML = '';
            if (data.data && data.data.length > 0) {
                data.data.forEach(function(gif) {
                    var item = document.createElement('div');
                    item.className = 'gif-item';
                    var img = document.createElement('img');
                    img.src = gif.images.fixed_height.url;
                    img.alt = gif.title || 'GIF';
                    item.appendChild(img);
                    item.onclick = function() {
                        sendGif(gif.images.fixed_height.url);
                    };
                    grid.appendChild(item);
                });
            } else {
                grid.innerHTML = '<div class="gif-no-results">No GIFs found. Try a different search.</div>';
            }
        })
        .catch(function() {
            // Fallback to default GIFs
            populateGifPicker('trending');
        });
}

function populateGifPicker(type) {
    var grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Loading GIFs...</div>';
    
    // Use Tenor API for GIFs
    var apiKey = 'LIVDSRZULELA';
    var url = 'https://g.tenor.com/v1/trending?key=' + apiKey + '&limit=16&media_filter=minimal';
    
    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            grid.innerHTML = '';
            if (data.results && data.results.length > 0) {
                data.results.forEach(function(gif) {
                    var gifUrl = gif.media[0].tinygif.url;
                    var item = document.createElement('div');
                    item.className = 'gif-item';
                    var img = document.createElement('img');
                    img.src = gifUrl;
                    img.alt = 'GIF';
                    img.loading = 'lazy';
                    item.appendChild(img);
                    item.onclick = function() {
                        sendGif(gifUrl);
                    };
                    grid.appendChild(item);
                });
            } else {
                grid.innerHTML = '<div class="gif-no-results">No GIFs available</div>';
            }
        })
        .catch(function(error) {
            console.error('GIF fetch error:', error);
            grid.innerHTML = '<div class="gif-no-results">Could not load GIFs</div>';
        });
}

function searchGifs(query) {
    if (!query.trim()) {
        populateGifPicker();
        return;
    }
    
    var grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    
    var apiKey = 'LIVDSRZULELA';
    var url = 'https://g.tenor.com/v1/search?q=' + encodeURIComponent(query) + '&key=' + apiKey + '&limit=16&media_filter=minimal';
    
    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            grid.innerHTML = '';
            if (data.results && data.results.length > 0) {
                data.results.forEach(function(gif) {
                    var gifUrl = gif.media[0].tinygif.url;
                    var item = document.createElement('div');
                    item.className = 'gif-item';
                    var img = document.createElement('img');
                    img.src = gifUrl;
                    img.alt = 'GIF';
                    img.loading = 'lazy';
                    item.appendChild(img);
                    item.onclick = function() {
                        sendGif(gifUrl);
                    };
                    grid.appendChild(item);
                });
            } else {
                grid.innerHTML = '<div class="gif-no-results">No GIFs found</div>';
            }
        })
        .catch(function(error) {
            grid.innerHTML = '<div class="gif-no-results">Search failed</div>';
        });
}

function sendMessage(text) {
    if (!activeChat || !text.trim()) return;
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: currentReplyTo,
        forwarded: false
    };
    
    // Save to local storage
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    // Clear reply preview
    clearReplyPreview();
    
    // Update UI immediately
    renderMessages(activeChat.id);
    loadChats();
    
    // Send to Firebase (async)
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage)
            .then(function() {
                console.log('Message sent to Firebase!');
                newMessage.status = 'delivered';
                Storage.set('messages', messages);
                renderMessages(activeChat.id);
            })
            .catch(function(err) {
                console.error('Failed to send to Firebase:', err);
            });
    }
    
    // Play send sound
    playSendSound();
}

function playSendSound() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create a pleasant "swoosh" sound
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
        
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
}

function playReceiveSound() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create a gentle "ding" sound
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

function sendFileMessage(file, fileData) {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: '📎 ' + file.name,
        fileData: fileData,
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
    
    // Save locally
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    // Update UI
    renderMessages(activeChat.id);
    loadChats();
    
    // Send to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage).then(function() {
            newMessage.status = 'delivered';
            Storage.set('messages', messages);
            renderMessages(activeChat.id);
        });
    }
    
    showToast('File sent!', 'success');
}

function sendFile(fileData, fileName, fileType) {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: fileType.startsWith('image/') ? '📷 Photo' : '📎 ' + fileName,
        fileData: fileData,
        fileName: fileName,
        fileType: fileType,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: currentReplyTo,
        forwarded: false
    };
    
    // Save to local storage
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    // Clear reply preview
    clearReplyPreview();
    
    // Update UI
    renderMessages(activeChat.id);
    loadChats();
    
    // Send to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage).then(function() {
            newMessage.status = 'delivered';
            Storage.set('messages', messages);
            renderMessages(activeChat.id);
        });
    }
    
    showToast('File sent!', 'success');
}

function sendGif(gifUrl) {
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: 'GIF',
        gifUrl: gifUrl,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    
    // Save locally
    messages.push(newMessage);
    Storage.set('messages', messages);
    
    // Update UI
    document.getElementById('gif-picker').style.display = 'none';
    renderMessages(activeChat.id);
    loadChats();
    
    // Send to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage).then(function() {
            newMessage.status = 'delivered';
            Storage.set('messages', messages);
            renderMessages(activeChat.id);
        });
    }
    
    showToast('GIF sent!', 'success');
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
    
    showModal('<div class="voice-message"><h3>Voice Message</h3><div class="voice-recording-ui"><div class="voice-wave" id="voice-wave"></div><p id="recording-status">Click to start recording</p><p id="recording-time" style="display:none;">00:00</p></div><button class="btn btn-primary voice-record-btn" id="record-btn" onclick="startRecording()"><i class="fas fa-microphone"></i> Record</button></div>');
}

var recordingTimer = null;
var recordingSeconds = 0;

function startRecording() {
    // Enhanced audio constraints for better quality
    var constraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1
        }
    };
    
    navigator.mediaDevices.getUserMedia(constraints)
        .then(function(stream) {
            // Use webm with opus codec for better quality
            var options = { mimeType: 'audio/webm;codecs=opus' };
            
            // Fallback if opus not supported
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'audio/webm' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'audio/mp4' };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        options = {};
                    }
                }
            }
            
            var mediaRecorder = new MediaRecorder(stream, options);
            var audioChunks = [];
            
            // Start timer
            recordingSeconds = 0;
            var timeDisplay = document.getElementById('recording-time');
            var statusDisplay = document.getElementById('recording-status');
            timeDisplay.style.display = 'block';
            statusDisplay.textContent = 'Recording...';
            
            recordingTimer = setInterval(function() {
                recordingSeconds++;
                var mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
                var secs = (recordingSeconds % 60).toString().padStart(2, '0');
                timeDisplay.textContent = mins + ':' + secs;
            }, 1000);
            
            mediaRecorder.ondataavailable = function(e) {
                if (e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };
            
            mediaRecorder.onstop = function() {
                // Clear timer
                clearInterval(recordingTimer);
                
                var audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
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
                    
                    // Save to local storage
                    messages.push(newMessage);
                    Storage.set('messages', messages);
                    
                    // Send to Firebase for real-time delivery
                    if (typeof sendMsgToFirebase === 'function') {
                        sendMsgToFirebase(newMessage).then(function() {
                            newMessage.status = 'delivered';
                            Storage.set('messages', messages);
                            renderMessages(activeChat.id);
                        });
                    }
                    
                    closeModal();
                    renderMessages(activeChat.id);
                    loadChats();
                    showToast('Voice message sent!', 'success');
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(function(track) { track.stop(); });
            };
            
            // Start recording with timeslice for better chunks
            mediaRecorder.start(100);
            
            var recordBtn = document.getElementById('record-btn');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
            recordBtn.classList.add('recording');
            recordBtn.onclick = function() {
                mediaRecorder.stop();
            };
        })
        .catch(function(err) {
            console.error('Microphone error:', err);
            showToast('Microphone access denied', 'error');
        });
}

function toggleEmojiPicker() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var picker = document.getElementById('emoji-picker');
    var isVisible = picker.style.display !== 'none';
    picker.style.display = isVisible ? 'none' : 'flex';
    
    if (!isVisible) {
        populateEmojiPicker('smileys');
        initEmojiCategories();
    }
    
    document.getElementById('gif-picker').style.display = 'none';
}

function populateEmojiPicker(category) {
    var list = document.getElementById('emoji-list');
    var emojis = {
        smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
        hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️'],
        thumbs: ['👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄'],
        animals: ['🐱', '🐶', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄'],
        food: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥖', '🥨', '🧀', '🥗', '🥙', '🥪', '🌮', '🌯', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟']
    };
    
    var emojiList = emojis[category] || emojis.smileys;
    list.innerHTML = '';
    
    emojiList.forEach(function(emoji) {
        var item = document.createElement('div');
        item.className = 'emoji-item';
        item.textContent = emoji;
        item.onclick = function() {
            insertEmoji(emoji);
        };
        list.appendChild(item);
    });
}

function initEmojiCategories() {
    document.querySelectorAll('.emoji-category').forEach(function(btn) {
        btn.onclick = function() {
            document.querySelectorAll('.emoji-category').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            populateEmojiPicker(this.dataset.category);
        };
    });
}

function insertEmoji(emoji) {
    var input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
    document.getElementById('emoji-picker').style.display = 'none';
}

// ==========================================
// Group Functions
// ==========================================
function showCreateGroup() {
    var users = Storage.get('users') || [];
    var otherUsers = users.filter(function(u) { return u.id !== currentUser.id; });
    
    if (otherUsers.length === 0) {
        showToast('No users available to create a group', 'info');
        return;
    }
    
    var html = '<div class="create-group-modal">';
    html += '<div class="create-group-header">';
    html += '<h3><i class="fas fa-users"></i> Create New Group</h3>';
    html += '</div>';
    
    // Group name input
    html += '<div class="create-group-input">';
    html += '<input type="text" id="group-name-input" placeholder="Enter group name..." maxlength="50">';
    html += '</div>';
    
    // Search users
    html += '<div class="create-group-search">';
    html += '<i class="fas fa-search"></i>';
    html += '<input type="text" id="search-users-input" placeholder="Search users..." oninput="filterUsers(this.value)">';
    html += '</div>';
    
    // Selected count
    html += '<div class="selected-count"><span id="selected-count">0</span> selected</div>';
    
    // User list
    html += '<div class="create-group-users" id="user-selection-list">';
    otherUsers.forEach(function(user) {
        var avatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
        html += '<div class="user-select-item" data-user-name="' + user.name.toLowerCase() + '">';
        html += '<div class="user-select-avatar">' + avatar + '</div>';
        html += '<div class="user-select-info">';
        html += '<span class="user-select-name">' + escapeHtml(user.name) + '</span>';
        html += '<span class="user-select-username">@' + escapeHtml(user.username) + '</span>';
        html += '</div>';
        html += '<label class="user-select-checkbox">';
        html += '<input type="checkbox" value="' + user.id + '" onchange="updateSelectedCount()">';
        html += '<span class="checkmark"></span>';
        html += '</label>';
        html += '</div>';
    });
    html += '</div>';
    
    // Create button
    html += '<button class="btn btn-primary create-group-btn" onclick="createGroup()"><i class="fas fa-check"></i> Create Group</button>';
    html += '</div>';
    showModal(html);
}

function filterUsers(query) {
    var items = document.querySelectorAll('.user-select-item');
    query = query.toLowerCase();
    items.forEach(function(item) {
        var name = item.dataset.userName;
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function updateSelectedCount() {
    var checked = document.querySelectorAll('#modal input[type="checkbox"]:checked');
    document.getElementById('selected-count').textContent = checked.length;
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
        admin: currentUser.id, // Creator is admin
        createdAt: new Date().toISOString(),
        pinned: false,
        muted: false,
        archived: false,
        isGroup: true,
        groupName: name,
        wallpaper: 'none'
    };
    chats.push(newChat);
    Storage.set('chats', chats);
    
    // Sync group to Firebase so all participants can see it
    if (typeof syncChat === 'function') {
        syncChat(newChat);
    }
    
    closeModal();
    loadChats();
    showToast('Group created!', 'success');
}

// ==========================================
// Profile Functions
// ==========================================
function changeAvatar() {
    var input = document.getElementById('avatar-input');
    if (input) {
        input.click();
    }
}

function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large. Max 5MB allowed.', 'error');
        return;
    }
    
    var reader = new FileReader();
    reader.onload = function(e) {
        var avatarData = e.target.result;
        
        // Update user data
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].avatar = avatarData;
            Storage.set('users', users);
            currentUser.avatar = avatarData;
            
            // Update all avatar displays
            updateAvatarDisplay(avatarData);
            
            // Sync updated avatar to Firebase
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(currentUser);
            }
            
            showToast('Avatar updated!', 'success');
        }
    };
    reader.readAsDataURL(file);
}

function updateAvatarDisplay(avatarData) {
    // Update profile avatar
    var profileAvatar = document.getElementById('profile-avatar');
    if (profileAvatar) {
        profileAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">' +
            '<button class="btn-icon edit-avatar" title="Change Avatar" id="change-avatar-btn">' +
            '<i class="fas fa-camera"></i></button>' +
            '<input type="file" id="avatar-input" style="display: none;" accept="image/*">';
        
        // Re-attach event listeners
        var btn = document.getElementById('change-avatar-btn');
        var input = document.getElementById('avatar-input');
        if (btn) btn.onclick = changeAvatar;
        if (input) input.addEventListener('change', handleAvatarUpload);
    }
    
    // Update sidebar avatar
    var sidebarAvatar = document.getElementById('sidebar-avatar');
    if (sidebarAvatar) {
        sidebarAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
    }
    
    // Update header avatar
    var headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) {
        headerAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
    }
}

// Cover Upload Functions
function handleCoverUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large. Max 5MB allowed.', 'error');
        return;
    }
    
    var reader = new FileReader();
    reader.onload = function(e) {
        var coverData = e.target.result;
        
        // Save cover to user data
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].cover = coverData;
            Storage.set('users', users);
            currentUser.cover = coverData;
            
            // Update profile cover display
            updateProfileCover(coverData);
            
            // Sync to Firebase
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(currentUser);
            }
            
            showToast('Cover photo updated!', 'success');
        }
    };
    reader.readAsDataURL(file);
}

function updateProfileCover(coverData) {
    var coverElement = document.getElementById('profile-cover');
    if (coverElement && coverData) {
        // Remove existing image if any
        var existingImg = coverElement.querySelector('.profile-cover-image');
        if (existingImg) {
            existingImg.remove();
        }
        
        // Create new image element
        var img = document.createElement('img');
        img.src = coverData;
        img.className = 'profile-cover-image';
        img.alt = 'Cover Photo';
        
        // Insert at beginning of cover element
        coverElement.insertBefore(img, coverElement.firstChild);
    }
}

function loadSavedCover() {
    var coverData = Storage.get('users')?.find(function(u) { return u.id === currentUser?.id; })?.cover;
    if (coverData) {
        updateProfileCover(coverData);
    }
}

// ==========================================
// Settings Functions
// ==========================================
function showWallpaperPicker() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var wallpapers = [
        'none',
        '#f5f5f5', '#e8f5e9', '#fff3e0', '#e3f2fd', '#fce4ec', '#f3e5f5',
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)'
    ];
    
    var html = '<div class="wallpaper-picker"><h3>Chat Wallpaper</h3><div class="wallpaper-options">';
    wallpapers.forEach(function(w) {
        html += '<div class="wallpaper-option" style="background:' + w + '" onclick="setWallpaper(\'' + w.replace(/'/g, "\\'") + '\')"></div>';
    });
    html += '</div></div>';
    showModal(html);
}

function setWallpaper(color) {
    document.getElementById('chat-wallpaper').style.background = color;
    
    // Save to current chat if active
    if (activeChat) {
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.id === activeChat.id; });
        if (chat) {
            chat.wallpaper = color;
            Storage.set('chats', chats);
            
            // Sync to Firebase
            if (typeof syncChat === 'function') {
                syncChat(chat);
            }
        }
    }
    
    closeModal();
    showToast('Wallpaper changed', 'success');
}

function showChangePassword() {
    var html = '<div class="change-password-modal">';
    html += '<div class="modal-header">';
    html += '<h3>Change Password</h3>';
    html += '<button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label for="current-password">Current Password</label>';
    html += '<input type="password" id="current-password" placeholder="Enter current password">';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label for="new-password">New Password</label>';
    html += '<input type="password" id="new-password" placeholder="Enter new password">';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label for="confirm-new-password">Confirm New Password</label>';
    html += '<input type="password" id="confirm-new-password" placeholder="Confirm new password">';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="changePassword()">Update Password</button>';
    html += '</div>';
    showModal(html);
    setTimeout(function() {
        var el = document.getElementById('current-password');
        if (el) el.focus();
    }, 100);
}

function changePassword() {
    var currentEl = document.getElementById('current-password');
    var newPassEl = document.getElementById('new-password');
    var confirmEl = document.getElementById('confirm-new-password');
    
    if (!currentEl || !newPassEl || !confirmEl) {
        showToast('Please try again', 'error');
        return;
    }
    
    var current = currentEl.value;
    var newPass = newPassEl.value;
    var confirm = confirmEl.value;
    
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

function updatePasswordStrength(password) {
    var strengthEl = document.getElementById('password-strength');
    if (!strengthEl) return;
    
    var strength = 0;
    var feedback = [];
    
    if (password.length >= 6) {
        strength++;
        feedback.push('6+ chars');
    }
    if (password.length >= 10) {
        strength++;
    }
    if (/[A-Z]/.test(password)) {
        strength++;
        feedback.push('uppercase');
    }
    if (/[0-9]/.test(password)) {
        strength++;
        feedback.push('numbers');
    }
    if (/[^A-Za-z0-9]/.test(password)) {
        strength++;
        feedback.push('symbols');
    }
    
    var colors = ['#ff4d4d', '#ff944d', '#ffd54d', '#90EE90', '#4CAF50'];
    var labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    
    strengthEl.innerHTML = '<div class="password-strength-bar"><div class="password-strength-fill" style="width:' + (strength * 20) + '%; background:' + colors[strength - 1] + '"></div></div>';
    strengthEl.innerHTML += '<span class="password-strength-label" style="color:' + colors[strength - 1] + '">' + (labels[strength - 1] || '') + '</span>';
}

function clearCache() {
    localStorage.clear();
    showToast('Cache cleared', 'success');
    setTimeout(function() { location.reload(); }, 1000);
}

function confirmDeleteAccount() {
    showModal('<div class="delete-account"><h3>Delete Account</h3><p>Are you sure? This cannot be undone.</p><button class="btn danger" onclick="deleteAccount()">Delete My Account</button></div>');
}

function showNewChat() {
    console.log('showNewChat function STARTED');
    
    // Show loading first
    showModal('<div class="new-chat-modal"><div class="new-chat-header"><h3>Loading users...</h3></div></div>');
    
    console.log('showNewChat called, firebaseDb:', !!firebaseDb, 'currentUser:', currentUser ? currentUser.id : 'null');
    
    // Fetch users directly from Firebase
    if (!firebaseDb) {
        console.error('Firebase not initialized!');
        showToast('Firebase not ready', 'error');
        return;
    }
    
    firebaseDb.ref('users').once('value').then(function(snapshot) {
        var firebaseUsers = snapshot.val() || {};
        console.log('Firebase users snapshot:', firebaseUsers);
        console.log('Number of users:', Object.keys(firebaseUsers).length);
        
        var allUsers = Object.values(firebaseUsers);
        
        // Show all users except current user
        var otherUsers = allUsers.filter(function(u) { 
            return u.id !== currentUser.id; 
        });
        
        console.log('Other users:', otherUsers);
        
        if (otherUsers.length === 0) {
            showToast('No other users found', 'info');
            return;
        }
        
        var html = '<div class="new-chat-modal">';
        html += '<div class="new-chat-header">';
        html += '<h3><i class="fas fa-comment-dots"></i> New Chat</h3>';
        html += '</div>';
        html += '<div class="new-chat-search">';
        html += '<i class="fas fa-search"></i>';
        html += '<input type="text" id="search-new-chat" placeholder="Search users..." oninput="filterNewChatUsers(this.value)">';
        html += '</div>';
        html += '<div class="new-chat-users">';
        otherUsers.forEach(function(user) {
            var avatar = user.avatar ? '<img src="' + user.avatar + '">' : (user.name ? user.name.charAt(0).toUpperCase() : '?');
            html += '<div class="new-chat-item" onclick="createNewChat(\'' + user.id + '\')" data-user-name="' + (user.name || '').toLowerCase() + '">';
            html += '<div class="new-chat-avatar">' + avatar + '</div>';
            html += '<div class="new-chat-info">';
            html += '<span class="new-chat-name">' + (user.name || user.email || 'Unknown User') + '</span>';
            html += '<span class="new-chat-username">@' + (user.username || (user.email ? user.email.split('@')[0] : 'unknown')) + '</span>';
            html += '</div>';
            html += '<i class="fas fa-chevron-right"></i>';
            html += '</div>';
        });
        html += '</div></div>';
        showModal(html);
        
        setTimeout(function() {
            document.getElementById('search-new-chat').focus();
        }, 100);
    }).catch(function(err) {
        console.error('Error fetching users:', err);
        showToast('Error loading users', 'error');
    });
}

function filterNewChatUsers(query) {
    var items = document.querySelectorAll('.new-chat-item');
    query = query.toLowerCase();
    items.forEach(function(item) {
        var name = item.dataset.userName;
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function createNewChat(userId) {
    // Check if chat already exists
    var chats = Storage.get('chats') || [];
    var existingChat = chats.find(function(c) {
        return !c.isGroup && c.participants.indexOf(currentUser.id) !== -1 && c.participants.indexOf(userId) !== -1;
    });
    
    if (existingChat) {
        closeModal();
        loadChats();
        openChat(existingChat.id, userId);
        return;
    }
    
    // Create new chat
    var newChat = {
        id: generateId(),
        participants: [currentUser.id, userId],
        createdAt: new Date().toISOString(),
        pinned: false,
        muted: false,
        archived: false,
        isGroup: false
    };
    
    // Save locally
    chats.push(newChat);
    Storage.set('chats', chats);
    
    // Sync to Firebase
    if (typeof syncChat === 'function') {
        syncChat(newChat);
    }
    
    closeModal();
    loadChats();
    openChat(newChat.id, userId);
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

function showForgotPassword() {
    var html = '<div class="forgot-password-modal">';
    html += '<div class="forgot-icon"><i class="fas fa-key"></i></div>';
    html += '<h3>Reset Password</h3>';
    html += '<p>Enter your email to receive a verification code</p>';
    html += '<div class="forgot-form">';
    html += '<div class="forgot-input">';
    html += '<i class="fas fa-envelope"></i>';
    html += '<input type="email" id="reset-email" placeholder="Your email">';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="sendResetCode()"><i class="fas fa-paper-plane"></i> Send Code</button>';
    html += '<button class="btn-text" onclick="closeModal()">Cancel</button>';
    html += '</div></div>';
    showModal(html);
}

var resetVerificationCode = null;
var resetUserEmail = null;

function sendResetCode() {
    var email = document.getElementById('reset-email').value;
    if (!email) {
        showToast('Please enter your email', 'error');
        return;
    }
    
    var users = Storage.get('users') || [];
    var user = users.find(function(u) { return u.email === email; });
    
    if (!user) {
        showToast('Email not found', 'error');
        return;
    }
    
    // Generate verification code
    resetVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    resetUserEmail = email;
    
    // Try to send email (may not work due to Cloudflare routing)
    if (typeof emailjs !== 'undefined') {
        var templateParams = {
            email: email,
            passcode: resetVerificationCode,
            to_email: email,
            to_name: user.name,
            verification_code: resetVerificationCode,
            code: resetVerificationCode,
            name: user.name
        };
        
        emailjs.send('service_32be10s', 'template_600032u', templateParams)
            .then(function(response) {
                console.log('EmailJS success:', response);
            })
            .catch(function(error) {
                console.error('EmailJS error:', error);
            });
    }
    
    // Always show code on screen (since email delivery is unreliable)
    showToast('Verification code generated', 'info');
    showVerificationInput(email, true);
}

function showVerificationInput(email, showDemoCode) {
    var html = '<div class="forgot-password-modal">';
    html += '<div class="forgot-icon"><i class="fas fa-envelope-open-text"></i></div>';
    html += '<h3>Enter Verification Code</h3>';
    html += '<p>We sent a code to ' + email + '</p>';
    
    if (showDemoCode) {
        html += '<div class="demo-code"><small>Demo code:</small><strong>' + resetVerificationCode + '</strong></div>';
    }
    
    html += '<div class="code-inputs">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="0">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="1">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="2">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="3">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="4">';
    html += '<input type="text" maxlength="1" class="code-input" data-index="5">';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="verifyResetCode()"><i class="fas fa-check"></i> Verify</button>';
    html += '<div class="back-link">';
    html += '<button class="btn-back" onclick="showForgotPassword()"><i class="fas fa-arrow-left"></i> Back to email</button>';
    html += '</div>';
    html += '</div>';
    showModal(html);
    
    // Setup code inputs
    setTimeout(function() {
        var inputs = document.querySelectorAll('.code-input');
        inputs.forEach(function(input, index) {
            input.addEventListener('input', function(e) {
                if (e.target.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
        });
        inputs[0].focus();
    }, 100);
}

function verifyResetCode() {
    var inputs = document.querySelectorAll('.code-input');
    var enteredCode = '';
    inputs.forEach(function(input) {
        enteredCode += input.value;
    });
    
    if (enteredCode.length !== 6) {
        showToast('Please enter all 6 digits', 'error');
        return;
    }
    
    if (enteredCode !== resetVerificationCode) {
        showToast('Invalid code', 'error');
        inputs.forEach(function(input) { input.value = ''; });
        inputs[0].focus();
        return;
    }
    
    // Show password reset form
    var html = '<div class="forgot-password-modal">';
    html += '<div class="forgot-icon"><i class="fas fa-lock"></i></div>';
    html += '<h3>Create New Password</h3>';
    html += '<p>Enter your new password</p>';
    html += '<div class="forgot-form">';
    html += '<div class="forgot-input">';
    html += '<i class="fas fa-lock"></i>';
    html += '<input type="password" id="reset-new-password" placeholder="New password">';
    html += '</div>';
    html += '<div class="forgot-input">';
    html += '<i class="fas fa-lock"></i>';
    html += '<input type="password" id="reset-confirm-password" placeholder="Confirm new password">';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="resetUserPassword()"><i class="fas fa-check"></i> Reset Password</button>';
    html += '<button class="btn-text" onclick="closeModal()">Cancel</button>';
    html += '</div></div>';
    showModal(html);
}

function resetUserPassword() {
    var newPassword = document.getElementById('reset-new-password').value;
    var confirmPassword = document.getElementById('reset-confirm-password').value;
    
    if (!newPassword || !confirmPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    var users = Storage.get('users') || [];
    var userIndex = users.findIndex(function(u) { return u.email === resetUserEmail; });
    
    if (userIndex === -1) {
        showToast('User not found', 'error');
        return;
    }
    
    // Update password
    users[userIndex].password = hashPassword(newPassword);
    Storage.set('users', users);
    
    // Clean up
    resetVerificationCode = null;
    resetUserEmail = null;
    
    closeModal();
    showToast('Password reset successfully!', 'success');
}

function sendPasswordReset() {
    var email = document.getElementById('reset-email').value;
    var newPassword = document.getElementById('reset-new-password').value;
    var confirmPassword = document.getElementById('reset-confirm-password').value;
    
    if (!email || !newPassword || !confirmPassword) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    var users = Storage.get('users') || [];
    var userIndex = users.findIndex(function(u) { return u.email === email; });
    
    if (userIndex === -1) {
        showToast('Email not found', 'error');
        return;
    }
    
    // Update password
    users[userIndex].password = hashPassword(newPassword);
    Storage.set('users', users);
    
    closeModal();
    showToast('Password reset successfully! You can now login.', 'success');
}

function showTermsOfService() {
    var html = '<div class="terms-of-service"><h3>Terms of Service</h3>';
    html += '<div style="max-height: 300px; overflow-y: auto; text-align: left;">';
    html += '<h4>1. Acceptance of Terms</h4>';
    html += '<p>By using BSITHUB, you agree to these terms.</p>';
    html += '<h4>2. Use of Service</h4>';
    html += '<p>You must be respectful to other users. Harassment and abuse are prohibited.</p>';
    html += '<h4>3. Privacy</h4>';
    html += '<p>Your data is stored locally on your device and on Firebase servers for messaging.</p>';
    html += '<h4>4. Account Termination</h4>';
    html += '<p>We reserve the right to terminate accounts that violate these terms.</p>';
    html += '<h4>5. Changes to Terms</h4>';
    html += '<p>We may update these terms at any time. Continued use constitutes acceptance.</p>';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="closeModal()">Close</button>';
    html += '</div>';
    showModal(html);
}

// ==========================================
// Video Calling (Jitsi Meet - Free, No API)
// ==========================================
var jitsiApi = null;
var isVideoCallActive = false;
var callTimer = null;
var callSeconds = 0;
var localStream = null;
var peerConnection = null;

function startVideoCall() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    if (isVideoCallActive) {
        showToast('Already in a call', 'info');
        return;
    }
    
    showModal('<div class="video-call-setup"><h3><i class="fas fa-video"></i> Video Call</h3><p>Start a video call using Jitsi (free)</p><button class="btn btn-primary" onclick="initVideoCall()"><i class="fas fa-phone"></i> Start Call</button><button class="btn" onclick="closeModal()">Cancel</button></div>');
}

function initVideoCall() {
    closeModal();
    
    // Generate unique room name
    var roomName = 'bsithub-' + activeChat.id + '-' + Date.now();
    
    // Show Jitsi container
    showJitsiContainer(roomName);
    
    // Wait for container to render
    setTimeout(function() {
        var domain = 'meet.jitsi.si';
        var options = {
            roomName: roomName,
            width: '100%',
            height: '100%',
            parentNode: document.getElementById('jitsi-container'),
            userInfo: {
                displayName: currentUser.name
            },
            configOverwrite: {
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                prejoinPageEnabled: false
            },
            interfaceConfigOverwrite: {
                TOOLBAR_BUTTONS: [
                    'microphone', 'camera', 'closedcaptions', 'desktop',
                    'fullscreen', 'fodeviceselection', 'hangup', 'profile',
                    'chat', 'recording', 'livestreaming', 'etherpad',
                    'sharedvideo', 'settings', 'raisehand', 'videoquality',
                    'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
                    'tileview', 'videobackgroundblur', 'download', 'help',
                    'mute-everyone', 'security'
                ],
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false
            }
        };
        
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        
        // Handle ready event
        jitsiApi.addEventListener('videoConferenceJoined', function() {
            console.log('Joined video conference');
            document.getElementById('call-status').textContent = 'Connected';
            startCallTimer();
        });
        
        // Handle participant joined
        jitsiApi.addEventListener('participantJoined', function(data) {
            console.log('Participant joined:', data);
            updateParticipantCount();
        });
        
        // Handle participant left
        jitsiApi.addEventListener('participantLeft', function(data) {
            console.log('Participant left:', data);
            updateParticipantCount();
        });
        
        // Handle leave
        jitsiApi.addEventListener('readyToClose', function() {
            endVideoCall();
        });
        
        isVideoCallActive = true;
        
    }, 500);
}

function showJitsiContainer(roomName) {
    var html = '<div class="video-call-overlay" id="video-call-overlay">';
    html += '<div class="video-call-content" style="padding:0;">';
    html += '<div id="jitsi-container" style="width:100%;height:calc(100% - 60px);"></div>';
    html += '<div class="call-info" style="background:rgba(0,0,0,0.5);padding:10px;">';
    html += '<p id="call-status">Connecting...</p>';
    html += '<p id="call-id-display" style="font-size:12px;cursor:pointer;" onclick="copyCallId(\'' + roomName + '\')">Room: ' + roomName + ' (click to copy)</p>';
    html += '<p id="call-timer">00:00</p>';
    html += '</div>';
    html += '<div class="call-controls" style="position:absolute;bottom:60px;right:20px;background:rgba(0,0,0,0.5);border-radius:25px;padding:10px;">';
    html += '<button class="call-btn call-end" onclick="endVideoCall()" style="width:40px;height:40px;"><i class="fas fa-phone-slash"></i></button>';
    html += '</div>';
    html += '</div></div>';
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function copyCallId(roomName) {
    navigator.clipboard.writeText(roomName);
    showToast('Room name copied! Share with others to join.', 'success');
}

function startCallTimer() {
    callSeconds = 0;
    callTimer = setInterval(function() {
        callSeconds++;
        var mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
        var secs = (callSeconds % 60).toString().padStart(2, '0');
        var timer = document.getElementById('call-timer');
        if (timer) timer.textContent = mins + ':' + secs;
    }, 1000);
}

function updateParticipantCount() {
    if (jitsiApi) {
        var count = jitsiApi.getNumberOfParticipants();
        var status = document.getElementById('call-status');
        if (status) status.textContent = count + ' participant(s)';
    }
}

function endVideoCall() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    isVideoCallActive = false;
    callSeconds = 0;
    
    var overlay = document.getElementById('video-call-overlay');
    if (overlay) overlay.remove();
    
    showToast('Call ended', 'info');
}

function startVideoCall() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    if (isVideoCallActive) {
        showToast('Already in a call', 'info');
        return;
    }
    
    showModal('<div class="video-call-setup"><h3><i class="fas fa-video"></i> Video Call</h3><p>Start a video call using Jitsi (free)</p><button class="btn btn-primary" onclick="initVideoCall()"><i class="fas fa-phone"></i> Start Call</button><button class="btn" onclick="closeModal()">Cancel</button></div>');
}

async function initVideoCall() {
    closeModal();
    
    // Force release any existing camera
    if (window.currentStream) {
        window.currentStream.getTracks().forEach(track => track.stop());
        window.currentStream = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    try {
        // Enumerate devices first
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log("Available devices:", devices);
        
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioDevices = devices.filter(d => d.kind === 'audioinput');
        
        console.log("Video devices:", videoDevices.length, "Audio devices:", audioDevices.length);
        
        // If no video devices, go straight to audio-only
        if (videoDevices.length === 0) {
            console.log("No camera found, using audio-only");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            
            localStream = stream;
            window.currentStream = stream;
            showVideoCallUI();
            
            const localVideo = document.getElementById("local-video-element");
            if (localVideo) localVideo.style.display = "none";
            
            console.log("Audio-only call initialized");
            return;
        }
        
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: true
        });

        localStream = stream;
        window.currentStream = stream;
        console.log("Calling showVideoCallUI...");
        showVideoCallUI();
        console.log("showVideoCallUI called, waiting for DOM...");
        
        setTimeout(() => {
            console.log("In setTimeout");
            const localVideo = document.getElementById("local-video-element");
            console.log("Local video element:", localVideo);
            if (localVideo) {
                localVideo.srcObject = stream;
                console.log("Video srcObject set");
            } else {
                console.error("Local video element not found!");
                // Try alternate ID
                const altVideo = document.querySelector('#video-call-overlay video');
                console.log("Alt video element:", altVideo);
                if (altVideo) {
                    altVideo.srcObject = stream;
                    console.log("Video set on alt element");
                }
            }
        }, 200);

        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });

        console.log("Video call initialized");
    } catch (err) {
        console.error("Video call error:", err);
        
        // Fallback to audio-only
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            
            localStream = stream;
            window.currentStream = stream;
            showVideoCallUI();
            
            const localVideo = document.getElementById("local-video-element");
            if (localVideo) localVideo.style.display = "none";
            
            console.log("Audio-only call initialized (fallback)");
        } catch (audioErr) {
            console.error("Audio error:", audioErr);
            showToast('No camera or microphone available', 'error');
        }
    }
}

async function joinCall() {
    var callId = document.getElementById('join-call-id').value;
    if (!callId) {
        showToast('Please enter a Meeting ID', 'error');
        return;
    }
    
    closeModal();
    
    try {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localStream = stream;
        window.currentStream = stream;
        showVideoCallUI();
        
        const localVideo = document.getElementById("local-video-element");
        localVideo.srcObject = stream;

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        console.log("Joined call");
    } catch (err) {
        console.error("Join call error:", err);
    }
}

function showJoinCallModal() {
    showModal('<div class="video-call-setup"><h3><i class="fas fa-video"></i> Join Video Call</h3><p>Enter the Meeting ID to join</p><div class="forgot-input"><i class="fas fa-key"></i><input type="text" id="join-call-id" placeholder="Enter Meeting ID"></div><button class="btn btn-primary" onclick="joinCall()"><i class="fas fa-sign-in-alt"></i> Join Call</button><button class="btn" onclick="closeModal()">Cancel</button></div>');
}

function showVideoCallUI() {
    var html = '<div class="video-call-overlay" id="video-call-overlay">';
    html += '<div class="video-call-content">';
    html += '<div class="video-grid">';
    html += '<div class="video-participant local">';
    html += '<video id="local-video-element" autoplay muted playsinline></video>';
    html += '<span class="participant-name">' + currentUser.name + ' (You)</span>';
    html += '</div>';
    html += '<div class="video-participant remote">';
    html += '<video id="remote-video-element" autoplay playsinline></video>';
    html += '<div class="remote-placeholder" id="remote-placeholder"><i class="fas fa-user"></i><span>Waiting for other person...</span></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="call-info">';
    html += '<p id="call-status">Connecting...</p>';
    html += '<p id="call-id-display" style="font-size:12px;cursor:pointer;" onclick="copyCallId()">Click to copy Meeting ID</p>';
    html += '<p id="call-timer">00:00</p>';
    html += '</div>';
    html += '<div class="call-controls">';
    html += '<button class="call-btn" id="toggle-mic" onclick="toggleMic()"><i class="fas fa-microphone"></i></button>';
    html += '<button class="call-btn" id="toggle-camera" onclick="toggleCamera()"><i class="fas fa-video"></i></button>';
    html += '<button class="call-btn call-end" onclick="endVideoCall()"><i class="fas fa-phone-slash"></i></button>';
    html += '</div></div></div>';
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function copyCallId() {
    if (currentCallId) {
        navigator.clipboard.writeText(currentCallId);
        showToast('Meeting ID copied!', 'success');
    }
}

function toggleMic() {
    if (!localStream) return;
    var audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;
        var btn = document.getElementById('toggle-mic');
        btn.classList.toggle('disabled', isMuted);
    }
}

function toggleCamera() {
    if (!localStream) return;
    var videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isCameraOff = !videoTrack.enabled;
        var btn = document.getElementById('toggle-camera');
        btn.classList.toggle('disabled', isCameraOff);
    }
}

function endVideoCall() {
    // Stop tracks
    if (localStream) {
        localStream.getTracks().forEach(function(track) { track.stop(); });
        localStream = null;
    }
    
    // Stop window stream
    if (window.currentStream) {
        window.currentStream.getTracks().forEach(function(track) { track.stop(); });
        window.currentStream = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Clean up Firebase
    if (firebaseDb && currentCallId) {
        firebaseDb.ref('calls/' + currentCallId).remove();
    }
    
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
    
    isVideoCallActive = false;
    isMuted = false;
    isCameraOff = false;
    callSeconds = 0;
    currentCallId = null;
    
    var overlay = document.getElementById('video-call-overlay');
    if (overlay) overlay.remove();
    
    showToast('Call ended', 'info');
}

// ==========================================
// Quick Actions Menu
// ==========================================
function showQuickActions() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var html = '<div class="quick-actions-menu">';
    html += '<h3>Quick Actions</h3>';
    html += '<div class="quick-actions-grid">';
    
    html += '<button class="quick-action-btn" onclick="shareLocation()">';
    html += '<i class="fas fa-map-marker-alt"></i>';
    html += '<span>Share Location</span>';
    html += '</button>';
    
    html += '<button class="quick-action-btn" onclick="sendQuickReply(\'👍\')">';
    html += '<i class="fas fa-thumbs-up"></i>';
    html += '<span>Quick Like</span>';
    html += '</button>';
    
    html += '<button class="quick-action-btn" onclick="sendQuickReply(\'👋\')">';
    html += '<i class="fas fa-hand-paper"></i>';
    html += '<span>Quick Wave</span>';
    html += '</button>';
    
    html += '<button class="quick-action-btn" onclick="sendQuickReply(\'❤️\')">';
    html += '<i class="fas fa-heart"></i>';
    html += '<span>Quick Heart</span>';
    html += '</button>';
    
    html += '<button class="quick-action-btn" onclick="sendQuickReply(\'😂\')">';
    html += '<i class="fas fa-laugh"></i>';
    html += '<span>Quick Laugh</span>';
    html += '</button>';
    
    html += '<button class="quick-action-btn" onclick="sendQuickReply(\'🔥\')">';
    html += '<i class="fas fa-fire"></i>';
    html += '<span>Quick Fire</span>';
    html += '</button>';
    
    html += '</div>';
    html += '</div>';
    showModal(html);
}

function shareLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(function(position) {
        var lat = position.coords.latitude;
        var lng = position.coords.longitude;
        var mapUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
        
        var messages = Storage.get('messages') || [];
        var newMessage = {
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: '📍 Shared location: ' + mapUrl,
            location: { lat: lat, lng: lng },
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
        
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(newMessage);
        }
        
        closeModal();
        renderMessages(activeChat.id);
        loadChats();
        showToast('Location shared!', 'success');
    }, function(err) {
        showToast('Could not get location', 'error');
    });
}

function sendQuickReply(emoji) {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: emoji,
        isEmoji: true,
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
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(newMessage);
    }
    
    closeModal();
    renderMessages(activeChat.id);
    loadChats();
}

function playConnectedSound() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
}

// ==========================================
// Event Listeners
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    initializeDefaultData();
    
    // Initialize Firebase immediately
    initFirebase();
    
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
        toggle.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
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
            return false;
        };
    });
    
    // Forgot Password
    document.getElementById('forgot-password-link').onclick = function(e) {
        e.preventDefault();
        showForgotPassword();
    };
    
    // Terms of Service link
    document.querySelectorAll('a[href="#"]').forEach(function(link) {
        if (link.textContent.includes('Terms of Service')) {
            link.onclick = function(e) {
                e.preventDefault();
                showTermsOfService();
            };
        }
    });
    
    // Login form
    document.getElementById('login-form').onsubmit = async function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Login form submitted');
        var email = document.getElementById('login-email').value;
        var password = document.getElementById('login-password').value;
        console.log('Email:', email);
        
        // Handle remember me
        var rememberMe = document.getElementById('remember-me');
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem('rememberedEmail', email);
        } else {
            localStorage.removeItem('rememberedEmail');
        }
        
        // Show loading state
        var submitBtn = this.querySelector('button[type="submit"]');
        var originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitBtn.disabled = true;
        
        var result = await login(email, password);
        console.log('Login result:', result);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            showToast('Welcome back!', 'success');
            showApp();
        } else {
            document.getElementById('login-error').textContent = result.message;
            document.getElementById('login-error').style.display = 'block';
        }
        return false;
    };
    
    // Load remembered email
    var savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
        document.getElementById('login-email').value = savedEmail;
        var rememberMe = document.getElementById('remember-me');
        if (rememberMe) rememberMe.checked = true;
    }
    
    // Password strength meter
    document.getElementById('register-password').addEventListener('input', function(e) {
        updatePasswordStrength(e.target.value);
    });
    
    // Register form
    document.getElementById('register-form').onsubmit = async function(e) {
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

        // Show loading state
        var submitBtn = this.querySelector('button[type="submit"]');
        var originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        submitBtn.disabled = true;

        var result = await register(name, username, email, password);

        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;

        if (result.success) {
            if (result.requiresVerification) {
                showToast('Verification code sent!', 'info');
            } else {
                showToast('Account created!', 'success');
                showApp();
            }
        } else {
            document.getElementById('register-error').textContent = result.message;
            document.getElementById('register-error').style.display = 'block';
        }
    };
    
    // Setup code inputs for verification
    setupCodeInputs();
    
    // Chat actions
    var newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.onclick = function() {
            console.log('New Chat button clicked!');
            showNewChat();
        };
    } else {
        console.error('new-chat-btn not found!');
    }
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
    
    document.getElementById('message-input').oninput = function() {
        sendTypingIndicator();
        handleMentionInput(this);
    };
    
    document.getElementById('message-input').onkeydown = function(e) {
        if (e.key === 'Escape') {
            hideMentionsDropdown();
        }
    };
    
    // Image/file upload
    document.getElementById('image-btn').onclick = function() {
        document.getElementById('file-input').click();
    };
    
    document.getElementById('file-input').onchange = function(e) {
        var file = e.target.files[0];
        if (file && activeChat) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                showToast('File too large (max 10MB)', 'error');
                return;
            }
            
            var reader = new FileReader();
            reader.onload = function(event) {
                var fileData = event.target.result;
                sendFile(fileData, file.name, file.type);
            };
            reader.readAsDataURL(file);
        }
        this.value = ''; // Reset
    };
    
    // Chat tabs (All, Pinned, Unread)
    document.querySelectorAll('.chat-tab').forEach(function(tab) {
        tab.onclick = function() {
            document.querySelectorAll('.chat-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            
            var tabType = this.dataset.tab;
            pinnedChatsView = (tabType === 'pinned');
            
            // For unread tab, we need to filter differently
            if (tabType === 'unread') {
                // Load chats with unread messages
                loadChatsWithUnread();
            } else {
                loadChats();
            }
        };
    });
    
    // Chat search
    document.getElementById('chat-search').addEventListener('input', function(e) {
        var query = e.target.value.toLowerCase();
        var chatItems = document.querySelectorAll('.chat-item');
        
        chatItems.forEach(function(item) {
            var name = item.querySelector('.chat-item-name').textContent.toLowerCase();
            var message = item.querySelector('.chat-item-message').textContent.toLowerCase();
            if (name.includes(query) || message.includes(query)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    });
    
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
        document.getElementById('profile-edit-form').style.display = 'none';
        document.getElementById('profile-card').style.display = 'block';
        document.querySelector('.profile-container').classList.remove('editing');
    };
    
    // Logout
    document.getElementById('logout-btn').onclick = logout;
    
    // Version History
    document.getElementById('version-history-btn').onclick = showVersionHistory;
    
    // Version panel close
    document.getElementById('close-version-panel').onclick = function() {
        document.getElementById('version-panel').classList.remove('active');
    };
    
    // Archived Chats
    document.getElementById('archived-chats-btn').onclick = toggleArchivedChats;
    
    // Search Messages
    document.getElementById('search-messages-btn').onclick = toggleMessageSearch;
    document.getElementById('close-message-search').onclick = closeMessageSearch;
    document.getElementById('message-search-input').oninput = searchMessages;
    
    // Starred Messages
    document.getElementById('starred-messages-btn').onclick = showStarredMessages;
    
    // Quick Actions
    document.getElementById('quick-actions-btn').onclick = showQuickActions;
    
    // Video Call (temporarily disabled)
    document.getElementById('video-call-btn').onclick = function() {
        showToast('Video calling temporarily unavailable', 'info');
    };
    
    // Chat Options
    document.getElementById('chat-options-btn').onclick = showChatOptions;
    
    // Cancel reply
    document.getElementById('cancel-reply').onclick = function() {
        document.getElementById('reply-preview').style.display = 'none';
        currentReplyTo = null;
    };
    
    // Attach File
    document.getElementById('attach-file-btn').onclick = attachFile;
    
    // GIF
    document.getElementById('gif-btn').onclick = showGifPicker;
    document.getElementById('gif-search').addEventListener('input', function(e) {
        searchGifs(e.target.value);
    });
    
    // Voice Message
    document.getElementById('voice-btn').onclick = toggleVoiceMessage;
    
    // Emoji
    document.getElementById('emoji-btn').onclick = toggleEmojiPicker;
    
    // Create Group
    document.getElementById('create-group-btn').onclick = showCreateGroup;
    
    // Change Avatar
    document.getElementById('change-avatar-btn').onclick = changeAvatar;
    document.getElementById('avatar-input').addEventListener('change', handleAvatarUpload);
    
    // Edit Profile
    document.getElementById('edit-profile-btn').onclick = function() {
        document.getElementById('profile-card').style.display = 'none';
        document.getElementById('profile-edit-form').style.display = 'block';
        document.querySelector('.profile-container').classList.add('editing');
    };
    
    // Change Cover
    document.getElementById('change-cover-btn').onclick = function() {
        document.getElementById('cover-input').click();
    };
    document.getElementById('cover-input').addEventListener('change', handleCoverUpload);
    
    // Load saved cover
    loadSavedCover();
    
    // Chat Wallpaper
    document.getElementById('chat-wallpaper-btn').onclick = showWallpaperPicker;
    
    // Change Password
    document.getElementById('change-password-btn').onclick = showChangePassword;
    
    // Admin user search
    document.getElementById('admin-user-search').addEventListener('input', function(e) {
        searchAdminUsers(e.target.value);
    });
    
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
    
    // Handle social login redirect
    if (typeof auth !== 'undefined' && auth.getRedirectResult) {
        auth.getRedirectResult().then(function(result) {
            if (result && result.user) {
                var user = result.user;
                console.log('Social login success:', user.displayName);
                
                // Check if user exists in our system
                var users = Storage.get('users') || [];
                var existingUser = users.find(function(u) { return u.email === user.email; });
                
                if (existingUser) {
                    currentUser = existingUser;
                    Storage.set('currentUser', { id: existingUser.id });
                    showToast('Welcome back, ' + user.displayName + '!', 'success');
                    showApp();
                } else {
                    var newUser = {
                        id: generateId(),
                        name: user.displayName || 'User',
                        username: user.email ? user.email.split('@')[0] : 'user' + Date.now(),
                        email: user.email,
                        password: null,
                        role: 'user',
                        status: 'active',
                        bio: '',
                        phone: user.phoneNumber || '',
                        location: '',
                        createdAt: new Date().toISOString(),
                        avatar: user.photoURL,
                        blockedUsers: [],
                        socialProvider: 'google'
                    };
                    
                    users.push(newUser);
                    Storage.set('users', users);
                    currentUser = newUser;
                    Storage.set('currentUser', { id: newUser.id });
                    
                    if (typeof syncUserToFirebase === 'function') {
                        syncUserToFirebase(newUser);
                    }
                    
                    showToast('Welcome to BSITHUB, ' + user.displayName + '!', 'success');
                    showApp();
                }
            }
        }).catch(function(error) {
            console.log('No redirect result or error:', error);
        });
    }
    
    // Initialize
    initAuth();
    initSettings();
    initRealtime();
    
    // Initialize Firebase after a delay (wait for async SDK to load)
    setTimeout(function() {
        if (typeof initFirebaseMessaging === 'function') {
            initFirebaseMessaging();
        }
    }, 2000);
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('Service Worker registered:', registration.scope);
            })
            .catch(function(error) {
                console.log('Service Worker registration failed:', error);
            });
    }
    
    // ==========================================
    // Enhanced Features - Auto Logout
    // ==========================================
    var autoLogoutTimer = null;
    var autoLogoutWarningShown = false;
    var AUTO_LOGOUT_TIME = 15 * 60 * 1000; // 15 minutes
    var AUTO_LOGOUT_WARNING = 14 * 60 * 1000; // 14 minutes (1 min warning)
    
    function resetAutoLogoutTimer() {
        if (!currentUser) return;
        
        clearTimeout(autoLogoutTimer);
        autoLogoutWarningShown = false;
        
        // Remove warning if exists
        var warning = document.querySelector('.auto-logout-warning');
        if (warning) warning.remove();
        
        autoLogoutTimer = setTimeout(function() {
            showAutoLogoutWarning();
        }, AUTO_LOGOUT_WARNING);
    }
    
    function showAutoLogoutWarning() {
        if (autoLogoutWarningShown) return;
        autoLogoutWarningShown = true;
        
        var warning = document.createElement('div');
        warning.className = 'auto-logout-warning';
        warning.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>You will be logged out in 1 minute due to inactivity</span> <button onclick="resetAutoLogoutTimer()">Stay Active</button>';
        document.body.appendChild(warning);
        
        // Auto logout after 1 more minute
        setTimeout(function() {
            if (autoLogoutWarningShown) {
                logout();
            }
        }, 60000);
    }
    
    // Track user activity
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(event) {
        document.addEventListener(event, function() {
            if (currentUser) resetAutoLogoutTimer();
        }, { passive: true });
    });
    
    // ==========================================
    // Enhanced Features - Unread Badge
    // ==========================================
    function updateChatUnreadBadge(chatId, count) {
        var chatItem = document.querySelector('[data-chat-id="' + chatId + '"]');
        if (!chatItem) return;
        
        var badge = chatItem.querySelector('.chat-unread-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-unread-badge';
                chatItem.appendChild(badge);
            }
            badge.textContent = count > 99 ? '99+' : count;
        } else if (badge) {
            badge.remove();
        }
    }
    
    // ==========================================
    // Enhanced Features - Pin Message
    // ==========================================
    window.pinMessage = function(messageId) {
        var messages = Storage.get('messages') || [];
        var msgIndex = messages.findIndex(function(m) { return m.id === messageId; });
        
        if (msgIndex !== -1) {
            messages[msgIndex].pinned = !messages[msgIndex].pinned;
            Storage.set('messages', messages);
            
            if (typeof sendMsgToFirebase === 'function') {
                sendMsgToFirebase(messages[msgIndex]);
            }
            
            if (activeChat) {
                renderMessages(activeChat.id);
            }
            
            showToast(messages[msgIndex].pinned ? 'Message pinned' : 'Message unpinned', 'success');
        }
    };
    
    window.showPinnedMessages = function() {
        if (!activeChat) return;
        
        var messages = Storage.get('messages') || [];
        var pinned = messages.filter(function(m) { return m.chatId === activeChat.id && m.pinned; });
        
        if (pinned.length === 0) {
            showToast('No pinned messages', 'info');
            return;
        }
        
        var html = '<div class="pinned-messages-list"><h3><i class="fas fa-thumbtack"></i> Pinned Messages</h3>';
        pinned.forEach(function(msg) {
            html += '<div class="pinned-msg-item" onclick="scrollToMessage(\'' + msg.id + '\')">';
            html += '<p>' + escapeHtml(msg.text || '[Media]') + '</p>';
            html += '<small>' + formatTime(msg.timestamp) + '</small>';
            html += '</div>';
        });
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Enhanced Features - Mute Chat
    // ==========================================
    window.toggleMuteChat = function() {
        if (!activeChat) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        
        if (chatIndex !== -1) {
            chats[chatIndex].muted = !chats[chatIndex].muted;
            Storage.set('chats', chats);
            activeChat = chats[chatIndex];
            
            showToast(chats[chatIndex].muted ? 'Chat muted' : 'Chat unmuted', 'success');
            loadChats();
        }
    };
    
    // ==========================================
    // Enhanced Features - Chat Themes
    // ==========================================
    var chatThemes = ['default', 'ocean', 'sunset', 'forest', 'rose', 'midnight', 'lavender', 'gold'];
    
    window.showChatThemePicker = function() {
        if (!activeChat) return;
        
        var currentTheme = activeChat.theme || 'default';
        var html = '<div class="chat-theme-picker"><h3>Chat Theme</h3><div class="chat-themes">';
        
        chatThemes.forEach(function(theme) {
            html += '<div class="chat-theme-option theme-' + theme + (theme === currentTheme ? ' active' : '') + '" onclick="setChatTheme(\'' + theme + '\')"></div>';
        });
        
        html += '</div></div>';
        showModal(html);
    };
    
    window.setChatTheme = function(theme) {
        if (!activeChat) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        
        if (chatIndex !== -1) {
            chats[chatIndex].theme = theme;
            Storage.set('chats', chats);
            activeChat = chats[chatIndex];
            
            // Apply theme to wallpaper
            var wallpaper = document.getElementById('chat-wallpaper');
            wallpaper.className = 'chat-wallpaper';
            if (theme !== 'default') {
                wallpaper.classList.add('theme-' + theme);
            }
            
            closeModal();
            showToast('Theme updated', 'success');
        }
    };
    
    // ==========================================
    // Enhanced Features - Export Chat
    // ==========================================
    window.showExportOptions = function() {
        if (!activeChat) return;
        
        var html = '<div class="export-options">';
        html += '<h3>Export Chat</h3>';
        html += '<div class="export-option" onclick="exportChatAsText()"><i class="fas fa-file-alt"></i><div class="export-option-info"><div class="export-option-title">Plain Text</div><div class="export-option-desc">Export as .txt file</div></div></div>';
        html += '<div class="export-option" onclick="exportChatAsJSON()"><i class="fas fa-file-code"></i><div class="export-option-info"><div class="export-option-title">JSON</div><div class="export-option-desc">Export as .json file (includes all data)</div></div></div>';
        html += '<div class="export-option" onclick="exportChatAsHTML()"><i class="fas fa-file-export"></i><div class="export-option-info"><div class="export-option-title">HTML</div><div class="export-option-desc">Export as .html file (viewable in browser)</div></div></div>';
        html += '</div>';
        showModal(html);
    };
    
    window.exportChatAsText = function() {
        var messages = Storage.get('messages') || [];
        var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
        var users = Storage.get('users') || [];
        
        var text = 'Chat Export - ' + (activeChat.name || 'Direct Chat') + '\n';
        text += 'Exported: ' + new Date().toLocaleString() + '\n\n';
        
        chatMessages.forEach(function(msg) {
            var sender = users.find(function(u) { return u.id === msg.senderId; });
            text += '[' + formatTime(msg.timestamp) + '] ' + (sender ? sender.name : 'Unknown') + ': ' + (msg.text || '[Media]') + '\n';
        });
        
        downloadFile(activeChat.name + '.txt', text, 'text/plain');
        closeModal();
        showToast('Chat exported as text', 'success');
    };
    
    window.exportChatAsJSON = function() {
        var messages = Storage.get('messages') || [];
        var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
        
        var data = {
            chat: activeChat,
            messages: chatMessages,
            exportedAt: new Date().toISOString()
        };
        
        downloadFile(activeChat.name + '.json', JSON.stringify(data, null, 2), 'application/json');
        closeModal();
        showToast('Chat exported as JSON', 'success');
    };
    
    window.exportChatAsHTML = function() {
        var messages = Storage.get('messages') || [];
        var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
        var users = Storage.get('users') || [];
        
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (activeChat.name || 'Chat') + '</title>';
        html += '<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px}.message{margin:10px 0;padding:10px;border-radius:8px}.sent{background:#6366f1;color:white;margin-left:auto;max-width:70%}.received{background:#f1f5f9;max-width:70%}.time{font-size:11px;opacity:0.7}</style></head>';
        html += '<body><h1>' + (activeChat.name || 'Chat') + '</h1><p>Exported: ' + new Date().toLocaleString() + '</p>';
        
        chatMessages.forEach(function(msg) {
            var sender = users.find(function(u) { return u.id === msg.senderId; });
            var isSent = msg.senderId === currentUser.id;
            html += '<div class="message ' + (isSent ? 'sent' : 'received') + '"><strong>' + (sender ? sender.name : 'Unknown') + ':</strong> ' + (msg.text || '[Media]') + '<div class="time">' + formatTime(msg.timestamp) + '</div></div>';
        });
        
        html += '</body></html>';
        downloadFile(activeChat.name + '.html', html, 'text/html');
        closeModal();
        showToast('Chat exported as HTML', 'success');
    };
    
    function downloadFile(filename, content, type) {
        var blob = new Blob([content], { type: type });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // ==========================================
    // Enhanced Features - Clear Chat
    // ==========================================
    window.confirmClearChat = function() {
        if (!activeChat) return;
        
        var html = '<div class="clear-chat-confirm">';
        html += '<i class="fas fa-trash-alt"></i>';
        html += '<h3>Clear Chat?</h3>';
        html += '<p>This will delete all messages in this chat. This action cannot be undone.</p>';
        html += '<div class="modal-buttons">';
        html += '<button class="btn" onclick="closeModal()">Cancel</button>';
        html += '<button class="btn btn-danger" onclick="clearChat()">Clear Chat</button>';
        html += '</div></div>';
        showModal(html);
    };
    
    window.clearChat = function() {
        if (!activeChat) return;
        
        var messages = Storage.get('messages') || [];
        messages = messages.filter(function(m) { return m.chatId !== activeChat.id; });
        Storage.set('messages', messages);
        
        // Sync to Firebase
        if (firebaseDb) {
            firebaseDb.ref('chats/' + activeChat.id + '/messages').remove();
        }
        
        closeModal();
        renderMessages(activeChat.id);
        showToast('Chat cleared', 'success');
    };
    
    // ==========================================
    // Enhanced Features - Long Press for Quick Reactions
    // ==========================================
    var longPressTimer = null;
    
    document.addEventListener('mousedown', function(e) {
        var msg = e.target.closest('.message');
        if (!msg) return;
        
        longPressTimer = setTimeout(function() {
            showQuickReactions(msg, e);
        }, 500);
    });
    
    document.addEventListener('mouseup', function() {
        clearTimeout(longPressTimer);
    });
    
    document.addEventListener('mouseleave', function() {
        clearTimeout(longPressTimer);
    });
    
    document.addEventListener('touchstart', function(e) {
        var msg = e.target.closest('.message');
        if (!msg) return;
        
        longPressTimer = setTimeout(function() {
            showQuickReactions(msg, e.touches[0]);
        }, 500);
    }, { passive: true });
    
    document.addEventListener('touchend', function() {
        clearTimeout(longPressTimer);
    });
    
    function showQuickReactions(msgEl, event) {
        // Remove existing quick reactions
        var existing = document.querySelector('.quick-reactions');
        if (existing) existing.remove();
        
        var messageId = msgEl.dataset.messageId;
        var quickEmojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
        
        var html = '<div class="quick-reactions">';
        quickEmojis.forEach(function(emoji) {
            html += '<span class="quick-reaction" onclick="addReaction(\'' + messageId + '\', \'' + emoji + '\'); this.parentElement.remove();">' + emoji + '</span>';
        });
        html += '</div>';
        
        msgEl.querySelector('.message-bubble').insertAdjacentHTML('beforeend', html);
        
        // Play haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }
    
    // ==========================================
    // Enhanced Features - Double Tap to Like
    // ==========================================
    var lastTapTime = 0;
    var lastTapTarget = null;
    
    document.addEventListener('touchend', function(e) {
        var msg = e.target.closest('.message');
        if (!msg) return;
        
        var now = Date.now();
        if (now - lastTapTime < 300 && lastTapTarget === msg) {
            // Double tap detected
            addReaction(msg.dataset.messageId, '❤️');
            lastTapTime = 0;
            lastTapTarget = null;
        } else {
            lastTapTime = now;
            lastTapTarget = msg;
        }
    });
    
    // ==========================================
    // Enhanced Features - Session Management
    // ==========================================
    window.showSessionManagement = function() {
        var sessionId = Storage.get('sessionId') || generateId();
        if (!Storage.get('sessionId')) {
            Storage.set('sessionId', sessionId);
        }
        
        var html = '<div class="session-list">';
        html += '<h3>Active Sessions</h3>';
        
        // Current session
        html += '<div class="session-item current">';
        html += '<div class="session-icon"><i class="fas fa-desktop"></i></div>';
        html += '<div class="session-info"><div class="session-device">This Device</div><div class="session-details">' + navigator.userAgent.substring(0, 50) + '...</div></div>';
        html += '<span class="session-current-badge">Current</span>';
        html += '</div>';
        
        // Add revoke all button
        html += '<button class="btn btn-danger" onclick="revokeAllSessions()" style="margin-top: 16px; width: 100%;">Sign Out All Other Devices</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.revokeAllSessions = function() {
        showToast('All other sessions signed out', 'success');
        closeModal();
    };
    
    // ==========================================
    // Message Features - Copy, Spoiler, Self-Destruct, Translate
    // ==========================================
    
    window.copyMessageText = function(messageId) {
        var messages = Storage.get('messages') || [];
        var msg = messages.find(function(m) { return m.id === messageId; });
        if (!msg || !msg.text) return;
        
        navigator.clipboard.writeText(msg.text).then(function() {
            var notif = document.createElement('div');
            notif.className = 'copy-notification';
            notif.textContent = 'Message copied!';
            document.body.appendChild(notif);
            setTimeout(function() { notif.remove(); }, 2000);
        });
    };
    
    window.toggleSpoiler = function(el) {
        el.classList.toggle('revealed');
    };
    
    window.translateMessage = function(messageId, targetLang) {
        targetLang = targetLang || 'en';
        var messages = Storage.get('messages') || [];
        var msg = messages.find(function(m) { return m.id === messageId; });
        if (!msg || !msg.text) return;
        
        // Simple mock translation (in production, use a translation API)
        var translations = {
            'es': '¡Hola! ¿Cómo estás?',
            'fr': 'Bonjour! Comment allez-vous?',
            'de': 'Hallo! Wie geht es Ihnen?',
            'ja': 'こんにちは！お元気ですか？'
        };
        
        var translated = translations[targetLang] || msg.text;
        
        var msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
        if (msgEl) {
            var existing = msgEl.querySelector('.translated-text');
            if (existing) {
                existing.remove();
            } else {
                var transEl = document.createElement('div');
                transEl.className = 'translated-text';
                transEl.textContent = '🌐 ' + translated;
                msgEl.querySelector('.message-text').appendChild(transEl);
            }
        }
    };
    
    // ==========================================
    // Chat Folders
    // ==========================================
    var chatFolders = [
        { id: 'all', name: 'All', icon: 'inbox' },
        { id: 'personal', name: 'Personal', icon: 'user' },
        { id: 'work', name: 'Work', icon: 'briefcase' },
        { id: 'groups', name: 'Groups', icon: 'users' },
        { id: 'archived', name: 'Archived', icon: 'archive' }
    ];
    
    var currentFolder = 'all';
    
    window.renderChatFolders = function() {
        var container = document.querySelector('.chat-folders');
        if (!container) return;
        
        var html = '';
        chatFolders.forEach(function(folder) {
            var count = getChatCountByFolder(folder.id);
            html += '<button class="chat-folder' + (currentFolder === folder.id ? ' active' : '') + '" onclick="selectFolder(\'' + folder.id + '\')">';
            html += '<i class="fas fa-' + folder.icon + '"></i> ' + folder.name;
            if (count > 0) {
                html += '<span class="folder-count">' + count + '</span>';
            }
            html += '</button>';
        });
        container.innerHTML = html;
    };
    
    window.selectFolder = function(folderId) {
        currentFolder = folderId;
        renderChatFolders();
        loadChats();
    };
    
    function getChatCountByFolder(folderId) {
        var chats = Storage.get('chats') || [];
        if (folderId === 'all') return chats.filter(function(c) { return !c.archived; }).length;
        if (folderId === 'archived') return chats.filter(function(c) { return c.archived; }).length;
        if (folderId === 'groups') return chats.filter(function(c) { return c.type === 'group' && !c.archived; }).length;
        return chats.filter(function(c) { return c.folder === folderId && !c.archived; }).length;
    }
    
    // ==========================================
    // Chat Backup/Restore
    // ==========================================
    window.backupChats = function() {
        var data = {
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            users: Storage.get('users') || [],
            chats: Storage.get('chats') || [],
            messages: Storage.get('messages') || [],
            settings: {
                theme: document.body.getAttribute('data-theme'),
                currentUser: currentUser
            }
        };
        
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bsithub-backup-' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Backup created successfully', 'success');
    };
    
    window.restoreChats = function(event) {
        var file = event.target.files[0];
        if (!file) return;
        
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (data.users) Storage.set('users', data.users);
                if (data.chats) Storage.set('chats', data.chats);
                if (data.messages) Storage.set('messages', data.messages);
                
                showToast('Backup restored! Refreshing...', 'success');
                setTimeout(function() { location.reload(); }, 1500);
            } catch (err) {
                showToast('Invalid backup file', 'error');
            }
        };
        reader.readAsText(file);
    };
    
    // ==========================================
    // Priority/Pinned Chats
    // ==========================================
    window.togglePinChat = function(chatId) {
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
        
        if (chatIndex !== -1) {
            chats[chatIndex].pinned = !chats[chatIndex].pinned;
            Storage.set('chats', chats);
            loadChats();
            showToast(chats[chatIndex].pinned ? 'Chat pinned' : 'Chat unpinned', 'success');
        }
    };
    
    // ==========================================
    // Slow Mode
    // ==========================================
    window.setSlowMode = function(seconds) {
        if (!activeChat) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        
        if (chatIndex !== -1) {
            chats[chatIndex].slowMode = seconds;
            Storage.set('chats', chats);
            activeChat = chats[chatIndex];
            showToast(seconds > 0 ? 'Slow mode: ' + seconds + 's between messages' : 'Slow mode disabled', 'success');
            closeModal();
        }
    };
    
    window.showSlowModeOptions = function() {
        if (!activeChat) return;
        
        var html = '<div class="slow-mode-options"><h3>Slow Mode</h3>';
        html += '<p>Limit how often members can send messages</p>';
        html += '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px;">';
        html += '<button class="btn ' + (!activeChat.slowMode ? 'btn-primary' : '') + '" onclick="setSlowMode(0)">Off</button>';
        html += '<button class="btn ' + (activeChat.slowMode === 10 ? 'btn-primary' : '') + '" onclick="setSlowMode(10)">10 seconds</button>';
        html += '<button class="btn ' + (activeChat.slowMode === 30 ? 'btn-primary' : '') + '" onclick="setSlowMode(30)">30 seconds</button>';
        html += '<button class="btn ' + (activeChat.slowMode === 60 ? 'btn-primary' : '') + '" onclick="setSlowMode(60)">1 minute</button>';
        html += '<button class="btn ' + (activeChat.slowMode === 300 ? 'btn-primary' : '') + '" onclick="setSlowMode(300)">5 minutes</button>';
        html += '</div></div>';
        showModal(html);
    };
    
    // ==========================================
    // Read-Only Mode
    // ==========================================
    window.toggleReadOnly = function() {
        if (!activeChat) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        
        if (chatIndex !== -1) {
            chats[chatIndex].readOnly = !chats[chatIndex].readOnly;
            Storage.set('chats', chats);
            activeChat = chats[chatIndex];
            showToast(chats[chatIndex].readOnly ? 'Chat set to read-only' : 'Chat unlocked', 'success');
        }
    };
    
    // ==========================================
    // Custom Status
    // ==========================================
    var statusOptions = [
        { emoji: '🟢', text: 'Online', color: '#22c55e' },
        { emoji: '🟡', text: 'Away', color: '#f59e0b' },
        { emoji: '🔴', text: 'Busy', color: '#ef4444' },
        { emoji: '💤', text: 'Sleeping', color: '#8b5cf6' },
        { emoji: '🎮', text: 'Gaming', color: '#3b82f6' },
        { emoji: '📚', text: 'Studying', color: '#10b981' },
        { emoji: '💼', text: 'Working', color: '#6366f1' },
        { emoji: '🎵', text: 'Listening to music', color: '#ec4899' }
    ];
    
    window.showCustomStatusPicker = function() {
        var currentStatus = Storage.get('customStatus') || statusOptions[0];
        
        var html = '<div class="status-picker"><h3>Set Status</h3>';
        html += '<div class="status-options">';
        
        statusOptions.forEach(function(status, i) {
            html += '<div class="status-option' + (currentStatus.text === status.text ? ' selected' : '') + '" onclick="setCustomStatus(' + i + ')">';
            html += status.emoji + ' ' + status.text;
            html += '</div>';
        });
        
        html += '</div>';
        html += '<div style="margin-top: 16px;">';
        html += '<input type="text" id="custom-status-text" placeholder="Or type a custom status..." class="form-input" value="' + (currentStatus.customText || '') + '">';
        html += '<button class="btn btn-primary" style="margin-top: 8px; width: 100%;" onclick="setCustomStatusText()">Save Custom Status</button>';
        html += '</div></div>';
        showModal(html);
    };
    
    window.setCustomStatus = function(index) {
        var status = statusOptions[index];
        Storage.set('customStatus', status);
        updateStatusDisplay();
        closeModal();
        showToast('Status updated to ' + status.text, 'success');
    };
    
    window.setCustomStatusText = function() {
        var text = document.getElementById('custom-status-text').value.trim();
        if (!text) return;
        
        var status = { emoji: '💬', text: text, customText: text };
        Storage.set('customStatus', status);
        updateStatusDisplay();
        closeModal();
        showToast('Custom status set', 'success');
    };
    
    function updateStatusDisplay() {
        var status = Storage.get('customStatus') || statusOptions[0];
        var el = document.querySelector('.custom-status');
        if (el) {
            el.innerHTML = '<span class="status-emoji">' + status.emoji + '</span> ' + status.text;
        }
    }
    
    // ==========================================
    // User Notes
    // ==========================================
    window.showUserNotes = function(userId) {
        var notes = Storage.get('userNotes') || {};
        var note = notes[userId] || '';
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        
        var html = '<div class="user-notes"><h3>Notes about ' + (user ? user.name : 'User') + '</h3>';
        html += '<textarea id="user-note-input" placeholder="Add private notes about this user...">' + note + '</textarea>';
        html += '<button class="btn btn-primary" style="margin-top: 12px; width: 100%;" onclick="saveUserNotes(\'' + userId + '\')">Save Notes</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.saveUserNotes = function(userId) {
        var note = document.getElementById('user-note-input').value;
        var notes = Storage.get('userNotes') || {};
        notes[userId] = note;
        Storage.set('userNotes', notes);
        closeModal();
        showToast('Notes saved', 'success');
    };
    
    // ==========================================
    // Custom Nicknames
    // ==========================================
    window.showNicknameEditor = function(userId) {
        var nicknames = Storage.get('nicknames') || {};
        var nickname = nicknames[userId] || '';
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        
        var html = '<div class="nickname-editor"><h3>Set Nickname</h3>';
        html += '<p>Original name: ' + (user ? user.name : 'Unknown') + '</p>';
        html += '<input type="text" id="nickname-input" placeholder="Enter nickname..." class="form-input" value="' + nickname + '">';
        html += '<button class="btn btn-primary" style="margin-top: 12px; width: 100%;" onclick="saveNickname(\'' + userId + '\')">Save</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.saveNickname = function(userId) {
        var nickname = document.getElementById('nickname-input').value.trim();
        var nicknames = Storage.get('nicknames') || {};
        if (nickname) {
            nicknames[userId] = nickname;
        } else {
            delete nicknames[userId];
        }
        Storage.set('nicknames', nicknames);
        closeModal();
        loadChats();
        showToast('Nickname updated', 'success');
    };
    
    window.getDisplayName = function(userId) {
        var nicknames = Storage.get('nicknames') || {};
        if (nicknames[userId]) return nicknames[userId];
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        return user ? user.name : 'Unknown';
    };
    
    // ==========================================
    // Activity Log
    // ==========================================
    window.showActivityLog = function() {
        var logs = Storage.get('activityLog') || [];
        
        var html = '<div class="activity-log"><h3>Activity Log</h3>';
        
        if (logs.length === 0) {
            html += '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No activity yet</p>';
        } else {
            logs.slice(0, 50).forEach(function(log) {
                html += '<div class="activity-item">';
                html += '<div class="activity-icon"><i class="fas fa-' + getActivityIcon(log.action) + '"></i></div>';
                html += '<div class="activity-info">';
                html += '<div class="activity-action">' + log.description + '</div>';
                html += '<div class="activity-time">' + formatTimeAgo(log.timestamp) + '</div>';
                html += '</div></div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    function getActivityIcon(action) {
        var icons = {
            'login': 'sign-in-alt',
            'logout': 'sign-out-alt',
            'message': 'comment',
            'chat': 'comments',
            'profile': 'user',
            'settings': 'cog'
        };
        return icons[action] || 'circle';
    }
    
    function formatTimeAgo(timestamp) {
        var diff = Date.now() - new Date(timestamp).getTime();
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + ' min ago';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + ' hours ago';
        var days = Math.floor(hours / 24);
        return days + ' days ago';
    }
    
    window.logActivity = function(action, description) {
        var logs = Storage.get('activityLog') || [];
        logs.unshift({
            action: action,
            description: description,
            timestamp: new Date().toISOString()
        });
        if (logs.length > 100) logs = logs.slice(0, 100);
        Storage.set('activityLog', logs);
    };
    
    // ==========================================
    // Quick Replies / Templates
    // ==========================================
    var quickReplies = [
        '👋 Hi there!',
        '👍 Sounds good!',
        '😊 Thanks!',
        '🙏 Sorry, can\'t talk now',
        '📞 Call me later',
        '🎉 Congratulations!',
        '💪 Let\'s do this!',
        '🤔 Let me think about it'
    ];
    
    window.renderQuickReplies = function() {
        var container = document.querySelector('.quick-replies');
        if (!container) return;
        
        var html = '';
        quickReplies.forEach(function(reply) {
            html += '<button class="quick-reply-btn" onclick="sendQuickReply(\'' + escapeHtml(reply) + '\')">' + reply + '</button>';
        });
        container.innerHTML = html;
    };
    
    window.sendQuickReply = function(text) {
        if (!activeChat) return;
        document.getElementById('chat-input').value = text;
        document.getElementById('chat-input').focus();
    };
    
    // ==========================================
    // Font Size Control
    // ==========================================
    var fontSizes = [12, 13, 14, 15, 16, 18, 20];
    var currentFontSizeIndex = 2; // Default 14px
    
    window.changeFontSize = function(direction) {
        currentFontSizeIndex = Math.max(0, Math.min(fontSizes.length - 1, currentFontSizeIndex + direction));
        var size = fontSizes[currentFontSizeIndex];
        document.documentElement.style.setProperty('--message-font-size', size + 'px');
        Storage.set('fontSize', size);
        updateFontSizeDisplay();
    };
    
    function updateFontSizeDisplay() {
        var display = document.querySelector('.font-size-display');
        if (display) {
            display.textContent = fontSizes[currentFontSizeIndex] + 'px';
        }
    }
    
    // ==========================================
    // Compact Mode Toggle
    // ==========================================
    window.toggleCompactMode = function() {
        var messagesContainer = document.querySelector('.chat-messages');
        if (messagesContainer) {
            messagesContainer.classList.toggle('compact-mode');
            Storage.set('compactMode', messagesContainer.classList.contains('compact-mode'));
            showToast(messagesContainer.classList.contains('compact-mode') ? 'Compact mode on' : 'Compact mode off', 'success');
        }
    };
    
    // ==========================================
    // Polls
    // ==========================================
    window.showCreatePoll = function() {
        if (!activeChat) return;
        
        var html = '<div class="create-poll"><h3>Create Poll</h3>';
        html += '<input type="text" id="poll-question" placeholder="Ask a question..." class="form-input">';
        html += '<div id="poll-options">';
        html += '<input type="text" class="poll-option-input form-input" placeholder="Option 1">';
        html += '<input type="text" class="poll-option-input form-input" placeholder="Option 2">';
        html += '</div>';
        html += '<button class="btn btn-secondary" onclick="addPollOption()" style="margin: 8px 0;"><i class="fas fa-plus"></i> Add Option</button>';
        html += '<button class="btn btn-primary" onclick="createPoll()" style="width: 100%;">Create Poll</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.addPollOption = function() {
        var container = document.getElementById('poll-options');
        var count = container.querySelectorAll('input').length + 1;
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'poll-option-input form-input';
        input.placeholder = 'Option ' + count;
        container.appendChild(input);
    };
    
    window.createPoll = function() {
        var question = document.getElementById('poll-question').value.trim();
        var optionInputs = document.querySelectorAll('.poll-option-input');
        var options = [];
        
        optionInputs.forEach(function(input) {
            if (input.value.trim()) {
                options.push({ text: input.value.trim(), votes: 0, voters: [] });
            }
        });
        
        if (!question || options.length < 2) {
            showToast('Please enter a question and at least 2 options', 'error');
            return;
        }
        
        var poll = {
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            question: question,
            options: options,
            totalVotes: 0,
            timestamp: new Date().toISOString()
        };
        
        var messages = Storage.get('messages') || [];
        messages.push({
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: '📊 Poll: ' + question,
            poll: poll,
            timestamp: new Date().toISOString(),
            read: false,
            status: 'sent',
            reactions: {},
            edited: false,
            starred: false,
            replyTo: null,
            forwarded: false
        });
        Storage.set('messages', messages);
        
        closeModal();
        renderMessages(activeChat.id);
        showToast('Poll created', 'success');
    };
    
    window.votePoll = function(pollId, optionIndex) {
        var messages = Storage.get('messages') || [];
        var msg = messages.find(function(m) { return m.poll && m.poll.id === pollId; });
        
        if (msg && msg.poll) {
            var poll = msg.poll;
            if (poll.options[optionIndex].voters.includes(currentUser.id)) {
                // Unvote
                poll.options[optionIndex].votes--;
                poll.options[optionIndex].voters = poll.options[optionIndex].voters.filter(function(v) { return v !== currentUser.id; });
                poll.totalVotes--;
            } else {
                // Remove previous vote
                poll.options.forEach(function(opt, i) {
                    if (opt.voters.includes(currentUser.id)) {
                        opt.votes--;
                        opt.voters = opt.voters.filter(function(v) { return v !== currentUser.id; });
                        poll.totalVotes--;
                    }
                });
                // Add new vote
                poll.options[optionIndex].votes++;
                poll.options[optionIndex].voters.push(currentUser.id);
                poll.totalVotes++;
            }
            
            Storage.set('messages', messages);
            renderMessages(activeChat.id);
        }
    };
    
    // ==========================================
    // Location Sharing
    // ==========================================
    window.shareLocation = function() {
        if (!navigator.geolocation) {
            showToast('Geolocation not supported', 'error');
            return;
        }
        
        navigator.geolocation.getCurrentPosition(function(position) {
            var location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                name: 'Shared Location'
            };
            
            var messages = Storage.get('messages') || [];
            messages.push({
                id: generateId(),
                chatId: activeChat.id,
                senderId: currentUser.id,
                senderName: currentUser.name,
                text: '📍 Location shared',
                location: location,
                timestamp: new Date().toISOString(),
                read: false,
                status: 'sent',
                reactions: {},
                edited: false,
                starred: false,
                replyTo: null,
                forwarded: false
            });
            Storage.set('messages', messages);
            
            renderMessages(activeChat.id);
            showToast('Location shared', 'success');
        }, function() {
            showToast('Could not get location', 'error');
        });
    };
    
    window.openLocation = function(lat, lng) {
        window.open('https://www.google.com/maps?q=' + lat + ',' + lng, '_blank');
    };
    
    // ==========================================
    // Contact Sharing
    // ==========================================
    window.showShareContact = function() {
        if (!activeChat) return;
        
        var users = Storage.get('users') || [];
        var html = '<div class="share-contact"><h3>Share Contact</h3>';
        
        users.forEach(function(user) {
            if (user.id !== currentUser.id) {
                var avatar = user.avatar ? '<img src="' + user.avatar + '">' : (user.name || '?').charAt(0).toUpperCase();
                html += '<div class="contact-card" onclick="shareContact(\'' + user.id + '\')">';
                html += '<div class="contact-avatar">' + avatar + '</div>';
                html += '<div class="contact-info"><h4>' + escapeHtml(user.name) + '</h4><p>' + escapeHtml(user.email) + '</p></div>';
                html += '<button class="contact-add-btn">Share</button>';
                html += '</div>';
            }
        });
        
        html += '</div>';
        showModal(html);
    };
    
    window.shareContact = function(userId) {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) return;
        
        var messages = Storage.get('messages') || [];
        messages.push({
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: '👤 Contact shared',
            contact: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
            timestamp: new Date().toISOString(),
            read: false,
            status: 'sent',
            reactions: {},
            edited: false,
            starred: false,
            replyTo: null,
            forwarded: false
        });
        Storage.set('messages', messages);
        
        closeModal();
        renderMessages(activeChat.id);
        showToast('Contact shared', 'success');
    };
    
    window.addSharedContact = function(userId) {
        showToast('Contact added to your list', 'success');
    };
    
    // ==========================================
    // Games (Tic-Tac-Toe)
    // ==========================================
    window.showGame = function() {
        if (!activeChat) return;
        
        var html = '<div class="game-container"><h3 class="game-title">Tic-Tac-Toe</h3>';
        html += '<div class="game-grid" id="game-grid">';
        for (var i = 0; i < 9; i++) {
            html += '<button class="game-cell" onclick="makeMove(' + i + ')"></button>';
        }
        html += '</div>';
        html += '<div class="game-status" id="game-status">Your turn (X)</div>';
        html += '<button class="btn btn-secondary" onclick="resetGame()" style="margin-top: 12px;">New Game</button>';
        html += '</div>';
        showModal(html);
    };
    
    var gameState = Array(9).fill('');
    var currentPlayer = 'X';
    
    window.makeMove = function(index) {
        if (gameState[index] !== '') return;
        
        gameState[index] = currentPlayer;
        var cells = document.querySelectorAll('.game-cell');
        cells[index].textContent = currentPlayer;
        cells[index].classList.add(currentPlayer.toLowerCase());
        
        if (checkWinner()) {
            document.getElementById('game-status').textContent = currentPlayer + ' wins!';
            return;
        }
        
        if (gameState.every(function(cell) { return cell !== ''; })) {
            document.getElementById('game-status').textContent = 'Draw!';
            return;
        }
        
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        document.getElementById('game-status').textContent = 'Turn: ' + currentPlayer;
    };
    
    function checkWinner() {
        var lines = [
            [0,1,2], [3,4,5], [6,7,8],
            [0,3,6], [1,4,7], [2,5,8],
            [0,4,8], [2,4,6]
        ];
        return lines.some(function(line) {
            return gameState[line[0]] !== '' &&
                   gameState[line[0]] === gameState[line[1]] &&
                   gameState[line[1]] === gameState[line[2]];
        });
    }
    
    window.resetGame = function() {
        gameState = Array(9).fill('');
        currentPlayer = 'X';
        document.querySelectorAll('.game-cell').forEach(function(cell) {
            cell.textContent = '';
            cell.classList.remove('x', 'o');
        });
        document.getElementById('game-status').textContent = 'Your turn (X)';
    };
    
    // ==========================================
    // Stories
    // ==========================================
    var STORY_BG_COLORS = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        'linear-gradient(135deg, #2b5876 0%, #4e4376 100%)',
        'linear-gradient(135deg, #0c3483 0%, #a2b6df 50%, #6b8cce 100%)'
    ];
    var selectedStoryBg = STORY_BG_COLORS[0];

    window.showAddStory = function() {
        var html = '<div class="story-creator">';
        html += '<h3>Create Story</h3>';
        html += '<div class="story-creator-options">';
        html += '<div class="story-option-card" onclick="addImageStory()">';
        html += '<div class="story-option-icon image-icon"><i class="fas fa-image"></i></div>';
        html += '<div class="story-option-info"><strong>Photo</strong><span>Share a photo from your gallery</span></div>';
        html += '<i class="fas fa-chevron-right story-option-arrow"></i>';
        html += '</div>';
        html += '<div class="story-option-card" onclick="addTextStory()">';
        html += '<div class="story-option-icon text-icon"><i class="fas fa-font"></i></div>';
        html += '<div class="story-option-info"><strong>Text</strong><span>Share what\'s on your mind</span></div>';
        html += '<i class="fas fa-chevron-right story-option-arrow"></i>';
        html += '</div>';
        html += '</div></div>';
        showModal(html);
    };

    window.addTextStory = function() {
        selectedStoryBg = STORY_BG_COLORS[Math.floor(Math.random() * STORY_BG_COLORS.length)];
        var html = '<div class="text-story-creator">';
        html += '<div class="text-story-preview" id="story-bg-preview" style="background:' + selectedStoryBg + ';">';
        html += '<textarea id="story-text" placeholder="Type something..." maxlength="200" rows="3"></textarea>';
        html += '</div>';
        html += '<div class="story-bg-picker">';
        STORY_BG_COLORS.forEach(function(bg, i) {
            html += '<button class="bg-swatch' + (i === 0 ? ' active' : '') + '" style="background:' + bg + ';" data-bg="' + bg + '" onclick="pickStoryBg(this)"></button>';
        });
        html += '</div>';
        html += '<button class="btn btn-primary btn-share-story" onclick="publishTextStory()"><i class="fas fa-paper-plane"></i> Share Story</button>';
        html += '</div>';
        showModal(html);
        var ta = document.getElementById('story-text');
        if (ta) ta.focus();
    };

    window.pickStoryBg = function(el) {
        document.querySelectorAll('.bg-swatch').forEach(function(s) { s.classList.remove('active'); });
        el.classList.add('active');
        selectedStoryBg = el.dataset.bg;
        var preview = document.getElementById('story-bg-preview');
        if (preview) preview.style.background = selectedStoryBg;
    };

    window.publishTextStory = function() {
        var text = document.getElementById('story-text').value.trim();
        if (!text) { showToast('Write something first', 'error'); return; }

        var stories = Storage.get('stories') || [];
        stories.unshift({
            id: generateId(),
            userId: currentUser.id,
            type: 'text',
            content: text,
            bg: selectedStoryBg,
            timestamp: new Date().toISOString(),
            views: []
        });
        Storage.set('stories', stories);

        closeModal();
        showToast('Story posted!', 'success');
        if (typeof renderStories === 'function') renderStories();
    };

    window.addImageStory = function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) { showToast('Image too large. Max 10MB.', 'error'); return; }

            var reader = new FileReader();
            reader.onload = function(event) {
                var imgData = event.target.result;
                // Show preview
                var html = '<div class="image-story-creator">';
                html += '<div class="image-story-preview"><img src="' + imgData + '" alt="Preview"></div>';
                html += '<button class="btn btn-primary btn-share-story" onclick="publishImageStory(\'' + imgData.replace(/'/g, "\\'") + '\')"><i class="fas fa-paper-plane"></i> Share Story</button>';
                html += '</div>';
                showModal(html);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    window.publishImageStory = function(imgData) {
        var stories = Storage.get('stories') || [];
        stories.unshift({
            id: generateId(),
            userId: currentUser.id,
            type: 'image',
            content: imgData,
            timestamp: new Date().toISOString(),
            views: []
        });
        Storage.set('stories', stories);
        closeModal();
        showToast('Story posted!', 'success');
        if (typeof renderStories === 'function') renderStories();
    };

    window.viewStory = function(storyId) {
        var stories = Storage.get('stories') || [];
        var story = stories.find(function(s) { return s.id === storyId; });
        if (!story) return;

        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === story.userId; });
        var avatarSrc = (user && user.avatar) ? user.avatar : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%236366f1" width="100" height="100" rx="50"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="white">' + (user ? user.name.charAt(0) : '?') + '</text></svg>';

        var bgStyle = story.type === 'text' ? 'background:' + (story.bg || STORY_BG_COLORS[0]) + ';' : '';
        var isOwner = currentUser && story.userId === currentUser.id;

        var html = '<div class="story-viewer">';
        html += '<div class="story-progress"><div class="story-progress-bar"><div class="story-progress-fill" id="story-progress-fill"></div></div></div>';
        html += '<div class="story-header">';
        html += '<img class="story-avatar" src="' + avatarSrc + '">';
        html += '<div class="story-user-info"><div class="story-username">' + (user ? escapeHtml(user.name) : 'Unknown') + '</div><div class="story-time">' + getTimeAgo(story.timestamp) + '</div></div>';
        if (isOwner) html += '<button class="story-delete" onclick="deleteStory(\'' + story.id + '\')"><i class="fas fa-trash"></i></button>';
        html += '<button class="story-close" onclick="closeStoryViewer()"><i class="fas fa-times"></i></button>';
        html += '</div>';
        html += '<div class="story-content" style="' + bgStyle + '">';
        if (story.type === 'text') {
            html += '<div class="story-text">' + escapeHtml(story.content) + '</div>';
        } else {
            html += '<img src="' + story.content + '">';
        }
        html += '</div></div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var fill = document.getElementById('story-progress-fill');
        if (fill) {
            requestAnimationFrame(function() {
                fill.style.transition = 'width 5s linear';
                fill.style.width = '100%';
            });
        }

        setTimeout(function() { closeStoryViewer(); }, 5000);

        if (currentUser && !story.views.includes(currentUser.id)) {
            story.views.push(currentUser.id);
            Storage.set('stories', stories);
            if (typeof renderStories === 'function') renderStories();
        }
    };

    window.deleteStory = function(storyId) {
        var stories = Storage.get('stories') || [];
        stories = stories.filter(function(s) { return s.id !== storyId; });
        Storage.set('stories', stories);
        closeStoryViewer();
        showToast('Story deleted', 'info');
        if (typeof renderStories === 'function') renderStories();
    };

    window.closeStoryViewer = function() {
        var viewers = document.querySelectorAll('.story-viewer');
        viewers.forEach(function(v) { v.remove(); });
    };
    
    // ==========================================
    // User Analytics
    // ==========================================
    window.showUserAnalytics = function() {
        var messages = Storage.get('messages') || [];
        var myMessages = messages.filter(function(m) { return m.senderId === currentUser.id; });
        var chats = Storage.get('chats') || [];
        var users = Storage.get('users') || [];
        
        // Calculate stats
        var totalMessages = myMessages.length;
        var totalChats = chats.filter(function(c) { return c.participants.includes(currentUser.id); }).length;
        var totalFriends = users.length - 1;
        
        // Messages per day (last 7 days)
        var dailyData = [];
        for (var i = 6; i >= 0; i--) {
            var date = new Date();
            date.setDate(date.getDate() - i);
            var dayStr = date.toISOString().slice(0, 10);
            var dayMessages = myMessages.filter(function(m) { return m.timestamp.slice(0, 10) === dayStr; }).length;
            dailyData.push({ label: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()], value: dayMessages });
        }
        
        var maxDaily = Math.max.apply(null, dailyData.map(function(d) { return d.value; })) || 1;
        
        var html = '<div class="user-analytics"><h3>Your Analytics</h3>';
        html += '<div class="analytics-grid">';
        html += '<div class="analytics-card"><div class="analytics-value">' + totalMessages + '</div><div class="analytics-label">Messages Sent</div></div>';
        html += '<div class="analytics-card"><div class="analytics-value">' + totalChats + '</div><div class="analytics-label">Active Chats</div></div>';
        html += '<div class="analytics-card"><div class="analytics-value">' + totalFriends + '</div><div class="analytics-label">Friends</div></div>';
        html += '<div class="analytics-card"><div class="analytics-value">' + (Storage.get('stories') || []).filter(function(s) { return s.userId === currentUser.id; }).length + '</div><div class="analytics-label">Stories</div></div>';
        html += '<div class="analytics-chart">';
        dailyData.forEach(function(d) {
            html += '<div class="chart-bar" style="height: ' + ((d.value / maxDaily) * 100) + '%" data-label="' + d.label + '"></div>';
        });
        html += '</div>';
        html += '</div></div>';
        showModal(html);
    };
    
    // ==========================================
    // Bulk Actions
    // ==========================================
    var bulkMode = false;
    var selectedMessages = [];
    
    window.toggleBulkMode = function() {
        bulkMode = !bulkMode;
        selectedMessages = [];
        
        if (bulkMode) {
            showToast('Bulk select mode on - tap messages to select', 'info');
        } else {
            showToast('Bulk select mode off', 'info');
        }
        
        renderMessages(activeChat ? activeChat.id : null);
    };
    
    window.toggleMessageSelection = function(messageId) {
        if (!bulkMode) return;
        
        var index = selectedMessages.indexOf(messageId);
        if (index === -1) {
            selectedMessages.push(messageId);
        } else {
            selectedMessages.splice(index, 1);
        }
        
        var msgEl = document.querySelector('[data-message-id="' + messageId + '"]');
        if (msgEl) {
            msgEl.classList.toggle('selected', selectedMessages.includes(messageId));
        }
        
        updateBulkActionsBar();
    };
    
    function updateBulkActionsBar() {
        var existing = document.querySelector('.bulk-actions-bar');
        if (existing) existing.remove();
        
        if (selectedMessages.length > 0) {
            var html = '<div class="bulk-actions-bar">';
            html += '<span class="bulk-count">' + selectedMessages.length + ' selected</span>';
            html += '<div class="bulk-buttons">';
            html += '<button class="bulk-btn" onclick="bulkForward()"><i class="fas fa-share"></i> Forward</button>';
            html += '<button class="bulk-btn" onclick="bulkStar()"><i class="fas fa-star"></i> Star</button>';
            html += '<button class="bulk-btn danger" onclick="bulkDelete()"><i class="fas fa-trash"></i> Delete</button>';
            html += '</div></div>';
            
            document.querySelector('.chat-input-area').insertAdjacentHTML('beforebegin', html);
        }
    }
    
    window.bulkDelete = function() {
        if (selectedMessages.length === 0) return;
        
        var messages = Storage.get('messages') || [];
        messages = messages.filter(function(m) { return !selectedMessages.includes(m.id); });
        Storage.set('messages', messages);
        
        showToast(selectedMessages.length + ' messages deleted', 'success');
        selectedMessages = [];
        bulkMode = false;
        updateBulkActionsBar();
        renderMessages(activeChat.id);
    };
    
    window.bulkForward = function() {
        showToast('Select a chat to forward to', 'info');
    };
    
    window.bulkStar = function() {
        var messages = Storage.get('messages') || [];
        selectedMessages.forEach(function(id) {
            var msg = messages.find(function(m) { return m.id === id; });
            if (msg) msg.starred = true;
        });
        Storage.set('messages', messages);
        showToast(selectedMessages.length + ' messages starred', 'success');
        selectedMessages = [];
        renderMessages(activeChat.id);
    };
    
    // ==========================================
    // Moderation Queue
    // ==========================================
    window.showModerationQueue = function() {
        var reports = Storage.get('reports') || [];
        
        var html = '<div class="mod-queue"><h3><i class="fas fa-shield-alt"></i> Moderation Queue</h3>';
        
        if (reports.length === 0) {
            html += '<p style="text-align: center; color: var(--text-muted); padding: 40px;">No reports to review</p>';
        } else {
            reports.forEach(function(report) {
                html += '<div class="mod-item' + (report.resolved ? ' resolved' : '') + '">';
                html += '<div class="mod-header"><span class="mod-reason">' + report.reason + '</span><span class="mod-date">' + formatTimeAgo(report.timestamp) + '</span></div>';
                html += '<div class="mod-message">' + escapeHtml(report.messageText || 'No message') + '</div>';
                if (!report.resolved) {
                    html += '<div class="mod-actions">';
                    html += '<button class="btn btn-small" onclick="dismissReport(\'' + report.id + '\')">Dismiss</button>';
                    html += '<button class="btn btn-small btn-danger" onclick="actionReport(\'' + report.id + '\')">Take Action</button>';
                    html += '</div>';
                } else {
                    html += '<span style="color: var(--secondary); font-size: 12px;">✓ Resolved</span>';
                }
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    window.dismissReport = function(reportId) {
        var reports = Storage.get('reports') || [];
        var report = reports.find(function(r) { return r.id === reportId; });
        if (report) {
            report.resolved = true;
            Storage.set('reports', reports);
            showModerationQueue();
            showToast('Report dismissed', 'success');
        }
    };
    
    window.actionReport = function(reportId) {
        var reports = Storage.get('reports') || [];
        var report = reports.find(function(r) { return r.id === reportId; });
        if (report) {
            report.resolved = true;
            Storage.set('reports', reports);
            showModerationQueue();
            showToast('Action taken on report', 'success');
        }
    };
    
    window.reportMessage = function(messageId) {
        var messages = Storage.get('messages') || [];
        var msg = messages.find(function(m) { return m.id === messageId; });
        
        var reasons = ['Spam', 'Harassment', 'Inappropriate content', 'Scam', 'Other'];
        var html = '<div class="report-modal"><h3>Report Message</h3>';
        reasons.forEach(function(reason) {
            html += '<button class="btn" style="width: 100%; margin-bottom: 8px;" onclick="submitReport(\'' + messageId + '\', \'' + reason + '\')">' + reason + '</button>';
        });
        html += '</div>';
        showModal(html);
    };
    
    window.submitReport = function(messageId, reason) {
        var reports = Storage.get('reports') || [];
        reports.push({
            id: generateId(),
            messageId: messageId,
            messageText: (Storage.get('messages') || []).find(function(m) { return m.id === messageId; })?.text || '',
            reason: reason,
            reporterId: currentUser.id,
            timestamp: new Date().toISOString(),
            resolved: false
        });
        Storage.set('reports', reports);
        closeModal();
        showToast('Report submitted', 'success');
    };
    
    // ==========================================
    // Global Announcement
    // ==========================================
    window.sendAnnouncement = function() {
        var html = '<div class="announcement-modal"><h3>Send Announcement</h3>';
        html += '<textarea id="announcement-text" placeholder="Write your announcement..." class="form-input" rows="4"></textarea>';
        html += '<button class="btn btn-primary" style="width: 100%; margin-top: 12px;" onclick="broadcastAnnouncement()">Send to All Users</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.broadcastAnnouncement = function() {
        var text = document.getElementById('announcement-text').value.trim();
        if (!text) return;
        
        Storage.set('announcement', { text: text, timestamp: new Date().toISOString() });
        closeModal();
        showToast('Announcement sent to all users', 'success');
    };
    
    // Check for announcements on load
    function checkAnnouncement() {
        var announcement = Storage.get('announcement');
        if (announcement && announcement.timestamp) {
            var annTime = new Date(announcement.timestamp).getTime();
            var now = Date.now();
            // Show if less than 24 hours old
            if (now - annTime < 24 * 60 * 60 * 1000) {
                showAnnouncementBanner(announcement.text);
            }
        }
    }
    
    function showAnnouncementBanner(text) {
        if (document.querySelector('.announcement-banner')) return;
        
        var html = '<div class="announcement-banner">';
        html += '<i class="fas fa-bullhorn announcement-icon"></i>';
        html += '<span class="announcement-text">' + escapeHtml(text) + '</span>';
        html += '<button class="announcement-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>';
        html += '</div>';
        
        document.querySelector('.chat-header').insertAdjacentHTML('afterbegin', html);
    }
    
    // ==========================================
    // Notification Sound Picker
    // ==========================================
    var notificationSounds = [
        { id: 'default', name: 'Default', icon: 'bell' },
        { id: 'chime', name: 'Chime', icon: 'music' },
        { id: 'pop', name: 'Pop', icon: 'circle' },
        { id: 'ding', name: 'Ding', icon: 'bell-concierge' },
        { id: 'none', name: 'None', icon: 'volume-mute' }
    ];
    
    window.showNotificationSoundPicker = function() {
        var current = Storage.get('notificationSound') || 'default';
        
        var html = '<div class="sound-picker"><h3>Notification Sound</h3>';
        notificationSounds.forEach(function(sound) {
            html += '<div class="sound-option' + (current === sound.id ? ' selected' : '') + '" onclick="setNotificationSound(\'' + sound.id + '\')">';
            html += '<i class="fas fa-' + sound.icon + '"></i>';
            html += '<span>' + sound.name + '</span>';
            html += '</div>';
        });
        html += '</div>';
        showModal(html);
    };
    
    window.setNotificationSound = function(soundId) {
        Storage.set('notificationSound', soundId);
        
        // Play test sound
        if (soundId !== 'none') {
            playTestSound(soundId);
        }
        
        showToast('Notification sound updated', 'success');
        setTimeout(function() { closeModal(); }, 500);
    };
    
    function playTestSound(soundId) {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            var sounds = {
                'default': { freq: 800, type: 'sine' },
                'chime': { freq: 1200, type: 'sine' },
                'pop': { freq: 600, type: 'square' },
                'ding': { freq: 1000, type: 'triangle' }
            };
            
            var s = sounds[soundId] || sounds['default'];
            osc.type = s.type;
            osc.frequency.setValueAtTime(s.freq, ctx.currentTime);
            
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        } catch(e) {}
    }
    
    // ==========================================
    // Initialize Enhanced Features
    // ==========================================
    function initEnhancedFeatures() {
        // Render chat folders
        renderChatFolders();
        
        // Render quick replies
        renderQuickReplies();
        
        // Apply saved font size
        var savedSize = Storage.get('fontSize');
        if (savedSize) {
            document.documentElement.style.setProperty('--message-font-size', savedSize + 'px');
            currentFontSizeIndex = fontSizes.indexOf(savedSize);
            if (currentFontSizeIndex === -1) currentFontSizeIndex = 2;
        }
        
        // Apply compact mode
        if (Storage.get('compactMode')) {
            var mc = document.querySelector('.chat-messages');
            if (mc) mc.classList.add('compact-mode');
        }
        
        // Update status display
        updateStatusDisplay();
        
        // Check announcements
        checkAnnouncement();
        
        // Initialize auto-logout timer
        if (currentUser) resetAutoLogoutTimer();
    }
    
    // Run initialization after a short delay
    setTimeout(initEnhancedFeatures, 1000);
    
    // ==========================================
    // Update Message Actions with Pin
    // ==========================================
    var originalRenderMessages = renderMessages;
    
    // Enhanced action buttons are already added in the main renderMessages function
    // Just need to ensure pin button is included in message actions
    
    // ==========================================
    // Feed / Postings
    // ==========================================
    var feedPostImageData = null;
    var currentCommentsPostId = null;
    var selectedFeeling = null;
    var reactionsPopupPostId = null;
    var reactionsPopupTimer = null;

    var REACTION_EMOJIS = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡' };
    var REACTION_LABELS = { like: 'Like', love: 'Love', haha: 'Haha', wow: 'Wow', sad: 'Sad', angry: 'Angry' };

    function initFeed() {
        var composerTrigger = document.getElementById('composer-trigger');
        var composerExpanded = document.getElementById('composer-expanded');
        var postContent = document.getElementById('post-content');
        var postSubmitBtn = document.getElementById('post-submit-btn');
        var postImageBtn = document.getElementById('post-image-btn');
        var postImageInput = document.getElementById('post-image-input');
        var removeImageBtn = document.getElementById('remove-composer-image');
        var closeComposer = document.getElementById('close-composer');
        var postFeelingBtn = document.getElementById('post-feeling-btn');
        var composerActionPhoto = document.getElementById('composer-action-photo');
        var composerActionFeeling = document.getElementById('composer-action-feeling');
        var emptyCreatePost = document.getElementById('empty-create-post');
        var storyAdd = document.getElementById('story-add');

        if (!composerTrigger) return;

        function openComposer() {
            composerTrigger.style.display = 'none';
            var quickActions = composerTrigger.parentElement.querySelector('.composer-quick-actions');
            var divider = composerTrigger.parentElement.querySelector('.composer-divider');
            if (quickActions) quickActions.style.display = 'none';
            if (divider) divider.style.display = 'none';
            composerExpanded.style.display = 'block';
            postContent.focus();
            updateComposerAvatars();
            updateComposerUsername();
        }

        function closeComposerFn() {
            composerExpanded.style.display = 'none';
            composerTrigger.style.display = 'flex';
            var quickActions = composerTrigger.parentElement.querySelector('.composer-quick-actions');
            var divider = composerTrigger.parentElement.querySelector('.composer-divider');
            if (quickActions) quickActions.style.display = 'flex';
            if (divider) divider.style.display = 'block';
            document.getElementById('composer-feeling-bar').style.display = 'none';
            selectedFeeling = null;
        }

        composerTrigger.onclick = openComposer;
        if (storyAdd) storyAdd.onclick = showAddStory;
        if (emptyCreatePost) emptyCreatePost.onclick = openComposer;
        if (composerActionPhoto) composerActionPhoto.onclick = function() { openComposer(); postImageInput.click(); };
        if (composerActionFeeling) composerActionFeeling.onclick = function() { openComposer(); document.getElementById('composer-feeling-bar').style.display = 'flex'; };
        if (closeComposer) closeComposer.onclick = closeComposerFn;

        // Character counter
        postContent.oninput = function() {
            var len = postContent.value.length;
            var counter = document.getElementById('char-count');
            var counterWrap = document.getElementById('composer-char-counter');
            if (counter && counterWrap) {
                counter.textContent = len;
                counterWrap.classList.toggle('visible', len > 0);
                counterWrap.classList.toggle('warning', len > 4500);
                counterWrap.classList.toggle('danger', len > 4900);
            }
            postSubmitBtn.disabled = !postContent.value.trim() && !feedPostImageData;
        };

        postImageBtn.onclick = function() { postImageInput.click(); };

        postImageInput.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                feedPostImageData = ev.target.result;
                document.getElementById('composer-preview-img').src = feedPostImageData;
                document.getElementById('composer-attachment-preview').style.display = 'block';
                postSubmitBtn.disabled = false;
            };
            reader.readAsDataURL(file);
            postImageInput.value = '';
        };

        if (removeImageBtn) {
            removeImageBtn.onclick = function() {
                feedPostImageData = null;
                document.getElementById('composer-attachment-preview').style.display = 'none';
                postSubmitBtn.disabled = !postContent.value.trim();
            };
        }

        // Feeling buttons
        if (postFeelingBtn) {
            postFeelingBtn.onclick = function() {
                var bar = document.getElementById('composer-feeling-bar');
                bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
            };
        }

        document.querySelectorAll('.feeling-option').forEach(function(btn) {
            btn.onclick = function() {
                document.querySelectorAll('.feeling-option').forEach(function(b) { b.classList.remove('selected'); });
                this.classList.add('selected');
                selectedFeeling = this.dataset.feeling;
            };
        });

        postSubmitBtn.onclick = function() {
            var content = postContent.value.trim();
            if (selectedFeeling) {
                content = (content ? content + '\n' : '') + 'Feeling ' + selectedFeeling;
            }
            if (!content && !feedPostImageData) return;
            createPost(content, feedPostImageData);
        };

        // Lightbox
        var lightboxOverlay = document.getElementById('lightbox-overlay');
        var lightboxClose = document.getElementById('lightbox-close');
        if (lightboxOverlay) {
            lightboxOverlay.onclick = function(e) {
                if (e.target === lightboxOverlay || e.target === lightboxClose) {
                    lightboxOverlay.style.display = 'none';
                }
            };
        }
        if (lightboxClose) {
            lightboxClose.onclick = function() { lightboxOverlay.style.display = 'none'; };
        }

        // Share modal
        var shareModalOverlay = document.getElementById('share-modal-overlay');
        var shareModalClose = document.getElementById('share-modal-close');
        if (shareModalOverlay) {
            shareModalOverlay.onclick = function(e) {
                if (e.target === shareModalOverlay) shareModalOverlay.style.display = 'none';
            };
        }
        if (shareModalClose) {
            shareModalClose.onclick = function() { shareModalOverlay.style.display = 'none'; };
        }
        var shareCopyLink = document.getElementById('share-copy-link');
        if (shareCopyLink) {
            shareCopyLink.onclick = function() {
                var postId = shareModalOverlay.dataset.postId;
                var url = window.location.origin + window.location.pathname + '?post=' + postId;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url).then(function() {
                        showToast('Link copied!', 'success');
                    });
                } else {
                    showToast('Link copied!', 'success');
                }
                shareModalOverlay.style.display = 'none';
            };
        }
        var shareNative = document.getElementById('share-native');
        if (shareNative) {
            shareNative.onclick = function() {
                var postId = shareModalOverlay.dataset.postId;
                var posts = Storage.get('posts') || [];
                var post = posts.find(function(p) { return p.id === postId; });
                if (post && navigator.share) {
                    navigator.share({
                        title: 'BSITHUB Post',
                        text: post.content || 'Check out this post!',
                        url: window.location.href
                    }).catch(function() {});
                }
                shareModalOverlay.style.display = 'none';
            };
        }

        // Reactions popup
        document.querySelectorAll('.reactions-popup .reaction-btn').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var reaction = this.dataset.reaction;
                if (reactionsPopupPostId) {
                    applyReaction(reactionsPopupPostId, reaction);
                }
                hideReactionsPopup();
            };
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.reactions-popup') && !e.target.closest('.like-btn')) {
                hideReactionsPopup();
            }
        });

        renderStories();
        loadFeed();
    }

    function renderStories() {
        var bar = document.getElementById('stories-bar');
        if (!bar) return;

        // Clean expired stories (older than 24h)
        var stories = Storage.get('stories') || [];
        var now = Date.now();
        stories = stories.filter(function(s) { return now - new Date(s.timestamp).getTime() < 24 * 60 * 60 * 1000; });
        Storage.set('stories', stories);

        // Get unique users who have active stories
        var storyUsers = {};
        stories.forEach(function(s) {
            if (!storyUsers[s.userId]) storyUsers[s.userId] = { userId: s.userId, stories: [], hasUnviewed: false };
            storyUsers[s.userId].stories.push(s);
            if (currentUser && !s.views.includes(currentUser.id)) {
                storyUsers[s.userId].hasUnviewed = true;
            }
        });

        var users = Storage.get('users') || [];
        var html = '';

        // Current user's "add story" button (or view own story)
        var myStoryData = currentUser ? storyUsers[currentUser.id] : null;
        if (myStoryData) {
            var myAvatar = currentUser.avatar ? '<img src="' + escapeHtml(currentUser.avatar) + '" alt="">' : '<i class="fas fa-user"></i>';
            html += '<div class="story-item has-story' + (myStoryData.hasUnviewed ? ' unviewed' : '') + '" onclick="viewStory(\'' + myStoryData.stories[myStoryData.stories.length - 1].id + '\')">';
            html += '<div class="story-ring"><div class="story-thumb">' + myAvatar + '</div></div>';
            html += '<span>Your Story</span>';
            html += '</div>';
        } else {
            html += '<div class="story-add" id="story-add" onclick="showAddStory()">';
            html += '<div class="story-add-icon"><i class="fas fa-plus"></i></div>';
            html += '<span>Your Story</span>';
            html += '</div>';
        }

        // Other users' stories
        Object.keys(storyUsers).forEach(function(uid) {
            if (uid === (currentUser ? currentUser.id : '')) return;
            var data = storyUsers[uid];
            var user = users.find(function(u) { return u.id === uid; });
            if (!user) return;
            var avatar = user.avatar ? '<img src="' + escapeHtml(user.avatar) + '" alt="">' : '<span class="story-initial">' + user.name.charAt(0).toUpperCase() + '</span>';
            html += '<div class="story-item' + (data.hasUnviewed ? ' unviewed' : ' viewed') + '" onclick="viewStory(\'' + data.stories[data.stories.length - 1].id + '\')">';
            html += '<div class="story-ring"><div class="story-thumb">' + avatar + '</div></div>';
            html += '<span>' + escapeHtml(user.name.split(' ')[0]) + '</span>';
            html += '</div>';
        });

        bar.innerHTML = html;
    }

    function showReactionsPopup(btnEl, postId) {
        var popup = document.getElementById('reactions-popup');
        if (!popup) return;
        reactionsPopupPostId = postId;
        var rect = btnEl.getBoundingClientRect();
        popup.style.display = 'flex';
        popup.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        popup.style.left = Math.max(8, Math.min(rect.left - 60, window.innerWidth - 280)) + 'px';
        popup.style.top = 'auto';
    }

    function hideReactionsPopup() {
        var popup = document.getElementById('reactions-popup');
        if (popup) popup.style.display = 'none';
        reactionsPopupPostId = null;
    }

    function applyReaction(postId, reaction) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !currentUser) return;
        if (!post.reactions) post.reactions = {};
        if (post.reactions[currentUser.id] === reaction) {
            delete post.reactions[currentUser.id];
        } else {
            post.reactions[currentUser.id] = reaction;
        }
        // Sync old likes format
        if (post.likes) delete post.likes;
        Storage.set('posts', posts);
        renderFeed();
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/reactions').set(post.reactions); }
    }

    function getReactionSummary(reactions) {
        if (!reactions) return {};
        var counts = {};
        Object.values(reactions).forEach(function(r) {
            counts[r] = (counts[r] || 0) + 1;
        });
        return counts;
    }

    function getTotalReactions(reactions) {
        if (!reactions) return 0;
        return Object.keys(reactions).length;
    }

    function getTopReactions(reactions) {
        var counts = getReactionSummary(reactions);
        var sorted = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
        return sorted.slice(0, 3);
    }

    function updateComposerAvatars() {
        var avatars = ['composer-avatar', 'composer-avatar-2'];
        avatars.forEach(function(id) {
            var avatar = document.getElementById(id);
            if (!avatar || !currentUser) return;
            if (currentUser.avatar) {
                avatar.innerHTML = '<img src="' + escapeHtml(currentUser.avatar) + '" alt="Avatar">';
            } else {
                avatar.innerHTML = '<i class="fas fa-user"></i>';
            }
        });
    }

    function updateComposerUsername() {
        var el = document.getElementById('composer-username');
        if (el && currentUser) {
            el.textContent = currentUser.name || currentUser.username || 'User';
        }
    }

    function createPost(content, imageData) {
        if (!currentUser) return;
        var post = {
            id: generateId(),
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username,
            userAvatar: currentUser.avatar || null,
            content: content || '',
            imageUrl: imageData || null,
            visibility: 'public',
            likes: {},
            comments: [],
            shares: 0,
            createdAt: new Date().toISOString()
        };
        var posts = Storage.get('posts') || [];
        posts.unshift(post);
        Storage.set('posts', posts);
        if (DB.isReady()) { DB.createPost(post); }

        // Reset composer
        document.getElementById('post-content').value = '';
        feedPostImageData = null;
        selectedFeeling = null;
        document.getElementById('composer-attachment-preview').style.display = 'none';
        document.getElementById('composer-feeling-bar').style.display = 'none';
        document.getElementById('composer-expanded').style.display = 'none';
        document.getElementById('composer-trigger').style.display = 'flex';
        var quickActions = document.querySelector('.composer-quick-actions');
        var divider = document.querySelector('.composer-divider');
        if (quickActions) quickActions.style.display = 'flex';
        if (divider) divider.style.display = 'block';
        document.getElementById('post-submit-btn').disabled = true;
        document.querySelectorAll('.feeling-option').forEach(function(b) { b.classList.remove('selected'); });

        renderFeed();
        if (firebaseDb) { firebaseDb.ref('posts/' + post.id).set(post); }
        showToast('Posting published!', 'success');
    }

    function loadFeed() {
        renderFeed();
        if (DB.isReady()) {
            DB.getPosts(50, 0).then(function(dbPosts) {
                if (dbPosts && dbPosts.length > 0) {
                    var mapped = dbPosts.map(function(p) {
                        return { id: p.id, userId: p.user_id, userName: p.user_name, userAvatar: p.user_avatar, content: p.content, imageUrl: p.image_url, visibility: p.visibility, likes: {}, comments: [], createdAt: p.created_at };
                    });
                    var localPosts = Storage.get('posts') || [];
                    var merged = mergePosts(localPosts, mapped);
                    Storage.set('posts', merged);
                    renderFeed();
                }
            });
        }
        if (firebaseDb) {
            firebaseDb.ref('posts').orderByChild('createdAt').limitToLast(50).on('value', function(snapshot) {
                var fbPosts = [];
                snapshot.forEach(function(child) { var p = child.val(); if (p) fbPosts.push(p); });
                fbPosts.reverse();
                var localPosts = Storage.get('posts') || [];
                var merged = mergePosts(localPosts, fbPosts);
                Storage.set('posts', merged);
                renderFeed();
            });
        }
    }

    function mergePosts(local, remote) {
        var map = {};
        local.forEach(function(p) { map[p.id] = p; });
        remote.forEach(function(p) { if (!map[p.id]) map[p.id] = p; });
        var result = Object.values(map);
        result.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
        return result;
    }

    function renderFeed() {
        var feedList = document.getElementById('feed-list');
        var feedEmpty = document.getElementById('feed-empty');
        var feedLoading = document.getElementById('feed-loading');
        if (!feedList) return;
        var posts = Storage.get('posts') || [];
        feedLoading.style.display = 'none';
        if (posts.length === 0) {
            feedList.innerHTML = '';
            feedEmpty.style.display = 'block';
            return;
        }
        feedEmpty.style.display = 'none';
        var html = '';
        posts.forEach(function(post) { html += renderPostCard(post); });
        feedList.innerHTML = html;
        bindPostEvents();
    }

    function renderPostCard(post) {
        var isOwner = currentUser && post.userId === currentUser.id;
        var timeAgo = getTimeAgo(post.createdAt);
        var totalReactions = getTotalReactions(post.reactions || post.likes);
        var commentCount = post.comments ? post.comments.length : 0;
        var shareCount = post.shares || 0;
        var myReaction = currentUser && post.reactions ? post.reactions[currentUser.id] : null;
        var isLiked = !!myReaction;
        var topReactions = getTopReactions(post.reactions || post.likes);
        var avatarHtml;
        if (post.userAvatar) {
            avatarHtml = '<div class="post-avatar"><img src="' + escapeHtml(post.userAvatar) + '" alt="Avatar"></div>';
        } else {
            var initial = (post.userName || 'U').charAt(0).toUpperCase();
            avatarHtml = '<div class="post-avatar">' + initial + '</div>';
        }

        var privacyIcon = 'fa-globe-americas';
        if (post.visibility === 'friends') privacyIcon = 'fa-user-friends';
        if (post.visibility === 'private') privacyIcon = 'fa-lock';

        var html = '<div class="post-card" data-post-id="' + post.id + '">';
        html += '<div class="post-header">';
        html += avatarHtml;
        html += '<div class="post-user-info">';
        html += '<div class="post-user-name">' + escapeHtml(post.userName || 'User') + '</div>';
        html += '<div class="post-meta"><i class="fas ' + privacyIcon + '"></i> ' + timeAgo + '</div>';
        html += '</div>';
        if (isOwner) {
            html += '<div style="position:relative;">';
            html += '<button class="post-menu-btn" data-post-id="' + post.id + '"><i class="fas fa-ellipsis-h"></i></button>';
            html += '<div class="post-context-menu" id="menu-' + post.id + '" style="display:none;">';
            html += '<button class="edit-post-btn" data-post-id="' + post.id + '"><i class="fas fa-pencil-alt"></i> Edit Post</button>';
            html += '<button class="delete-post-btn danger" data-post-id="' + post.id + '"><i class="fas fa-trash"></i> Delete Post</button>';
            html += '</div></div>';
        } else {
            html += '<div style="position:relative;">';
            html += '<button class="post-menu-btn" data-post-id="' + post.id + '"><i class="fas fa-ellipsis-h"></i></button>';
            html += '<div class="post-context-menu" id="menu-' + post.id + '" style="display:none;">';
            html += '<button onclick="showToast(\'Post reported\',\'info\')"><i class="fas fa-flag"></i> Report Post</button>';
            html += '</div></div>';
        }
        html += '</div>';

        // Body
        html += '<div class="post-body">';
        if (post.content) html += '<div class="post-text">' + escapeHtml(post.content) + '</div>';
        if (post.imageUrl) html += '<div class="post-image"><img src="' + post.imageUrl + '" alt="Post image" onclick="openLightbox(this.src)"></div>';
        html += '</div>';

        // Stats row
        if (totalReactions > 0 || commentCount > 0 || shareCount > 0) {
            html += '<div class="post-stats">';
            html += '<div class="post-stats-left">';
            if (totalReactions > 0) {
                html += '<div class="reaction-icons">';
                topReactions.forEach(function(r) {
                    html += '<span>' + (REACTION_EMOJIS[r] || '👍') + '</span>';
                });
                html += '</div>';
                html += '<span>' + totalReactions + '</span>';
            }
            html += '</div>';
            html += '<div class="post-stats-right">';
            if (commentCount > 0) html += '<span data-toggle-comments="' + post.id + '">' + commentCount + ' comment' + (commentCount !== 1 ? 's' : '') + '</span>';
            if (shareCount > 0) html += '<span>' + shareCount + ' share' + (shareCount !== 1 ? 's' : '') + '</span>';
            html += '</div>';
            html += '</div>';
        }

        // Actions bar
        html += '<div class="post-actions-bar">';
        var likeLabel = myReaction ? (REACTION_EMOJIS[myReaction] + ' ' + REACTION_LABELS[myReaction]) : '<i class="fas fa-thumbs-up"></i> Like';
        var likeExtraClass = isLiked ? ' liked' : '';
        html += '<button class="post-action-btn like-btn' + likeExtraClass + '" data-post-id="' + post.id + '">';
        html += likeLabel;
        html += '</button>';
        html += '<button class="post-action-btn comment-btn" data-post-id="' + post.id + '">';
        html += '<i class="fas fa-comment"></i> Comment';
        html += '</button>';
        html += '<button class="post-action-btn share-btn" data-post-id="' + post.id + '">';
        html += '<i class="fas fa-share"></i> Share';
        html += '</button>';
        html += '</div>';

        // Comments section
        html += '<div class="post-comments-section" id="comments-' + post.id + '" style="display:none;">';
        var commentAvatarHtml;
        if (currentUser && currentUser.avatar) {
            commentAvatarHtml = '<div class="comment-avatar"><img src="' + escapeHtml(currentUser.avatar) + '" alt=""></div>';
        } else {
            commentAvatarHtml = '<div class="comment-avatar"><i class="fas fa-user" style="font-size:12px;"></i></div>';
        }
        html += '<div class="comment-input-row">';
        html += commentAvatarHtml;
        html += '<div class="comment-input-wrapper">';
        html += '<input type="text" class="comment-text-input" data-post-id="' + post.id + '" placeholder="Write a comment...">';
        html += '<button class="comment-submit-btn" data-post-id="' + post.id + '"><i class="fas fa-paper-plane"></i></button>';
        html += '</div></div>';
        html += '<div class="comments-list" id="comments-list-' + post.id + '">';
        if (post.comments && post.comments.length > 0) {
            var visibleComments = post.comments.slice(-3);
            if (post.comments.length > 3) html += '<button class="view-more-comments" data-post-id="' + post.id + '">View ' + (post.comments.length - 3) + ' more comments</button>';
            visibleComments.forEach(function(c) { html += renderComment(c, post.id); });
        }
        html += '</div></div></div>';
        return html;
    }

    function renderComment(comment, postId) {
        var cAvatarHtml;
        if (comment.userAvatar) {
            cAvatarHtml = '<div class="comment-avatar"><img src="' + escapeHtml(comment.userAvatar) + '" alt=""></div>';
        } else {
            var initial = (comment.userName || 'U').charAt(0).toUpperCase();
            cAvatarHtml = '<div class="comment-avatar">' + initial + '</div>';
        }
        var isLikedComment = comment.likedBy && currentUser && comment.likedBy[currentUser.id];
        var likeCountComment = comment.likedBy ? Object.keys(comment.likedBy).length : 0;

        var html = '<div class="comment-item">';
        html += cAvatarHtml;
        html += '<div>';
        html += '<div class="comment-bubble">';
        html += '<div class="comment-author">' + escapeHtml(comment.userName || 'User') + '</div>';
        html += '<div class="comment-text">' + escapeHtml(comment.content) + '</div>';
        html += '</div>';
        html += '<div class="comment-actions-row">';
        html += '<button class="comment-action-link' + (isLikedComment ? ' liked' : '') + '" data-comment-like="' + comment.id + '" data-post-id="' + postId + '">Like' + (likeCountComment > 0 ? ' (' + likeCountComment + ')' : '') + '</button>';
        html += '<button class="comment-action-link" data-comment-reply="' + comment.id + '" data-post-id="' + postId + '">Reply</button>';
        html += '<span class="comment-action-link">' + getTimeAgo(comment.createdAt) + '</span>';
        html += '</div></div></div>';
        return html;
    }

    function openLightbox(src) {
        var overlay = document.getElementById('lightbox-overlay');
        var img = document.getElementById('lightbox-img');
        if (overlay && img) {
            img.src = src;
            overlay.style.display = 'flex';
        }
    }
    window.openLightbox = openLightbox;

    function bindPostEvents() {
        // Like with hold for reactions
        document.querySelectorAll('.like-btn').forEach(function(btn) {
            var postId = btn.dataset.postId;
            var holdTimer = null;
            var didHold = false;

            btn.onmousedown = btn.ontouchstart = function(e) {
                didHold = false;
                holdTimer = setTimeout(function() {
                    didHold = true;
                    showReactionsPopup(btn, postId);
                }, 500);
            };

            btn.onmouseup = btn.onmouseleave = btn.ontouchend = function(e) {
                clearTimeout(holdTimer);
                if (!didHold) {
                    toggleLike(postId);
                    btn.classList.add('like-animate');
                    setTimeout(function() { btn.classList.remove('like-animate'); }, 400);
                }
            };
        });

        document.querySelectorAll('.comment-btn').forEach(function(btn) {
            btn.onclick = function() {
                var section = document.getElementById('comments-' + this.dataset.postId);
                if (section) {
                    var isVisible = section.style.display !== 'none';
                    section.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) { var input = section.querySelector('.comment-text-input'); if (input) input.focus(); }
                }
            };
        });
        document.querySelectorAll('.share-btn').forEach(function(btn) {
            btn.onclick = function() { openShareModal(this.dataset.postId); };
        });
        document.querySelectorAll('[data-toggle-comments]').forEach(function(el) {
            el.onclick = function() {
                var section = document.getElementById('comments-' + this.dataset.toggleComments);
                if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
            };
        });
        document.querySelectorAll('.comment-text-input').forEach(function(input) {
            var postId = input.dataset.postId;
            var submitBtn = document.querySelector('.comment-submit-btn[data-post-id="' + postId + '"]');
            input.oninput = function() { if (submitBtn) submitBtn.classList.toggle('active', !!input.value.trim()); };
            input.onkeydown = function(e) {
                if (e.key === 'Enter' && input.value.trim()) {
                    submitComment(postId, input.value.trim());
                    input.value = '';
                    if (submitBtn) submitBtn.classList.remove('active');
                }
            };
            if (submitBtn) {
                submitBtn.onclick = function() {
                    if (input.value.trim()) {
                        submitComment(postId, input.value.trim());
                        input.value = '';
                        submitBtn.classList.remove('active');
                    }
                };
            }
        });
        document.querySelectorAll('.comment-action-link[data-comment-like]').forEach(function(btn) {
            btn.onclick = function() {
                toggleCommentLike(this.dataset.postId, this.dataset.commentLike);
            };
        });
        document.querySelectorAll('.post-menu-btn').forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var postId = this.dataset.postId;
                document.querySelectorAll('.post-context-menu').forEach(function(m) { if (m.id !== 'menu-' + postId) m.style.display = 'none'; });
                var menu = document.getElementById('menu-' + postId);
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            };
        });
        document.querySelectorAll('.delete-post-btn').forEach(function(btn) {
            btn.onclick = function() { deletePost(this.dataset.postId); };
        });
        document.querySelectorAll('.edit-post-btn').forEach(function(btn) {
            btn.onclick = function() { editPost(this.dataset.postId); };
        });
        document.querySelectorAll('.view-more-comments').forEach(function(btn) {
            btn.onclick = function() { showAllComments(this.dataset.postId); };
        });
        document.querySelectorAll('.post-image img').forEach(function(img) {
            img.style.cursor = 'zoom-in';
        });
        document.addEventListener('click', function closeMenus(e) {
            if (!e.target.closest('.post-menu-btn') && !e.target.closest('.post-context-menu')) {
                document.querySelectorAll('.post-context-menu').forEach(function(m) { m.style.display = 'none'; });
            }
        });
    }

    function openShareModal(postId) {
        var overlay = document.getElementById('share-modal-overlay');
        if (overlay) {
            overlay.dataset.postId = postId;
            overlay.style.display = 'flex';
        }
    }

    function toggleLike(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !currentUser) return;
        if (!post.reactions) post.reactions = {};
        if (post.reactions[currentUser.id]) {
            delete post.reactions[currentUser.id];
        } else {
            post.reactions[currentUser.id] = 'like';
        }
        if (post.likes) delete post.likes;
        Storage.set('posts', posts);
        renderFeed();
        if (DB.isReady()) { DB.toggleLike(postId, currentUser.id); }
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/reactions').set(post.reactions); }
    }

    function submitComment(postId, content) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !currentUser) return;
        if (!post.comments) post.comments = [];
        var comment = { id: generateId(), userId: currentUser.id, userName: currentUser.name || currentUser.username, userAvatar: currentUser.avatar || null, content: content, createdAt: new Date().toISOString() };
        post.comments.push(comment);
        Storage.set('posts', posts);
        currentCommentsPostId = postId;
        renderFeed();
        var section = document.getElementById('comments-' + postId);
        if (section) section.style.display = 'block';
        if (DB.isReady()) { DB.addComment(postId, comment.userId, comment.userName, comment.userAvatar, comment.content); }
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/comments').set(post.comments); }
    }

    function showAllComments(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !post.comments) return;
        var list = document.getElementById('comments-list-' + postId);
        if (!list) return;
        var html = '';
        post.comments.forEach(function(c) { html += renderComment(c); });
        list.innerHTML = html;
    }

    function sharePost(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post) return;

        post.shares = (post.shares || 0) + 1;
        Storage.set('posts', posts);
        renderFeed();

        // Try native share
        if (navigator.share) {
            navigator.share({
                title: 'BSITHUB Post',
                text: post.content || 'Check out this post!',
                url: window.location.href
            }).catch(function() {});
        } else {
            showToast('Post shared!', 'success');
        }

        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/shares').set(post.shares); }
    }

    function toggleCommentLike(postId, commentId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !post.comments || !currentUser) return;

        var comment = post.comments.find(function(c) { return c.id === commentId; });
        if (!comment) return;

        if (!comment.likedBy) comment.likedBy = {};

        if (comment.likedBy[currentUser.id]) {
            delete comment.likedBy[currentUser.id];
        } else {
            comment.likedBy[currentUser.id] = true;
        }

        Storage.set('posts', posts);
        renderFeed();

        // Keep comments section open
        var section = document.getElementById('comments-' + postId);
        if (section) section.style.display = 'block';

        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/comments').set(post.comments); }
    }

    function editPost(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !currentUser || post.userId !== currentUser.id) return;

        // Close context menu
        document.querySelectorAll('.post-context-menu').forEach(function(m) { m.style.display = 'none'; });

        // Inline editing
        var postCard = document.querySelector('.post-card[data-post-id="' + postId + '"]');
        if (!postCard) return;
        var bodyEl = postCard.querySelector('.post-body');
        if (!bodyEl) return;

        var currentContent = post.content || '';
        bodyEl.innerHTML = '<div class="inline-edit-wrapper"><textarea class="inline-edit-textarea" id="inline-edit-' + postId + '" maxlength="5000">' + escapeHtml(currentContent) + '</textarea><div class="inline-edit-actions"><button class="btn btn-sm btn-outline" onclick="cancelEdit(\'' + postId + '\')">Cancel</button><button class="btn btn-sm btn-primary" onclick="saveEdit(\'' + postId + '\')">Save</button></div></div>';
        var textarea = document.getElementById('inline-edit-' + postId);
        if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    }

    function cancelEdit(postId) {
        renderFeed();
    }
    window.cancelEdit = cancelEdit;

    function saveEdit(postId) {
        var textarea = document.getElementById('inline-edit-' + postId);
        if (!textarea) return;
        var newContent = textarea.value.trim();
        if (!newContent) {
            showToast('Post cannot be empty', 'error');
            return;
        }
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post) return;
        post.content = newContent;
        Storage.set('posts', posts);
        renderFeed();
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/content').set(post.content); }
        if (DB.isReady()) { DB.updatePost(postId, { content: newContent }); }
        showToast('Post updated!', 'success');
    }
    window.saveEdit = saveEdit;

    function deletePost(postId) {
        if (!confirm('Delete this post?')) return;
        var posts = Storage.get('posts') || [];
        posts = posts.filter(function(p) { return p.id !== postId; });
        Storage.set('posts', posts);
        renderFeed();
        if (DB.isReady() && currentUser) { DB.deletePost(postId, currentUser.id); }
        if (firebaseDb) { firebaseDb.ref('posts/' + postId).remove(); }
        showToast('Posting deleted', 'info');
    }

    function getTimeAgo(dateStr) {
        var now = new Date();
        var date = new Date(dateStr);
        var diffMs = now - date;
        var diffSec = Math.floor(diffMs / 1000);
        var diffMin = Math.floor(diffSec / 60);
        var diffHr = Math.floor(diffMin / 60);
        var diffDay = Math.floor(diffHr / 24);
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return diffMin + 'm ago';
        if (diffHr < 24) return diffHr + 'h ago';
        if (diffDay < 7) return diffDay + 'd ago';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Init feed when nav is clicked
    var feedNav = document.querySelector('.nav-item[data-section="feed"]');
    if (feedNav) {
        feedNav.addEventListener('click', function() { setTimeout(initFeed, 100); });
    }
    if (currentUser) { setTimeout(initFeed, 1500); }
});