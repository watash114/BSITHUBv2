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
    
    if (days === 0) {
        return 'Today';
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return days + ' days ago';
    } else if (days < 30) {
        var weeks = Math.floor(days / 7);
        return weeks + ' week' + (weeks > 1 ? 's' : '') + ' ago';
    } else {
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
    
    // Ensure admin user always exists
    const adminExists = users.some(u => u.id === 'admin1');
    if (!adminExists) {
        users.push({ id: 'admin1', name: 'Admin User', username: 'admin', email: 'admin@bsithub.com', password: hashPassword('admin123'), role: 'admin', status: 'active', bio: 'System Administrator', phone: '+1234567890', location: 'New York', createdAt: '2024-01-01T00:00:00.000Z', avatar: null, blockedUsers: [] });
        Storage.set('users', users);
    }
    
    // Ensure default users exist
    const defaultUsers = [
        { id: 'user1', name: 'John Doe', username: 'johndoe', email: 'john@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'Software Developer', phone: '+1234567891', location: 'San Francisco', createdAt: '2024-02-15T00:00:00.000Z', avatar: null, blockedUsers: [] },
        { id: 'user2', name: 'Jane Smith', username: 'janesmith', email: 'jane@example.com', password: hashPassword('password123'), role: 'user', status: 'active', bio: 'UX Designer', phone: '+1234567892', location: 'Los Angeles', createdAt: '2024-03-01T00:00:00.000Z', avatar: null, blockedUsers: [] }
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
function login(email, password) {
    const users = Storage.get('users') || [];
    const hashedPassword = hashPassword(password);
    
    // Debug: Check what's happening
    console.log('Login attempt:', email);
    console.log('Password hash:', hashedPassword);
    console.log('Available users:', users.map(u => ({ email: u.email, hasPassword: !!u.password })));
    
    const user = users.find(function(u) { return u.email === email && u.password === hashedPassword; });
    
    if (!user) {
        // Check if email exists but password is wrong
        const emailExists = users.find(function(u) { return u.email === email; });
        if (emailExists) {
            console.log('Email found but password mismatch. Expected:', emailExists.password, 'Got:', hashedPassword);
        }
        return { success: false, message: 'Invalid email or password' };
    }
    if (user.status === 'banned') return { success: false, message: 'Your account has been banned' };
    
    currentUser = user;
    Storage.set('currentUser', { id: user.id });
    addLog('info', 'User ' + user.username + ' logged in');
    return { success: true };
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

function register(name, username, email, password) {
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
        blockedUsers: []
    };
    
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

function logout() {
    setUserOffline();
    if (realtimeInterval) {
        clearInterval(realtimeInterval);
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
        firebaseDb.ref('users').on('child_added', function(snap) {
            var user = snap.val();
            if (user && user.id !== currentUser.id) {
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
    chatMessages.forEach(function(msg) {
        var isSent = msg.senderId === currentUser.id;
        html += '<div class="message ' + (isSent ? 'sent' : 'received') + '" data-message-id="' + msg.id + '">';
        html += '<div class="message-bubble">';
        
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
        html += '<button class="message-action-btn" onclick="showReactionPicker(\'' + msg.id + '\')" title="React">😀</button>';
        html += '<button class="message-action-btn" onclick="forwardMessage(\'' + msg.id + '\')" title="Forward"><i class="fas fa-share"></i></button>';
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
    var reactions = ['❤️', '👍', '😂', '😮', '😢', '😡'];
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
        profileAvatar.innerHTML = '<img src="' + currentUser.avatar + '" alt="Avatar"><button class="btn-icon edit-avatar" title="Change Avatar" id="change-avatar-btn"><i class="fas fa-camera"></i></button><input type="file" id="avatar-input" style="display: none;" accept="image/*">';
    } else {
        profileAvatar.innerHTML = '<i class="fas fa-user"></i><button class="btn-icon edit-avatar" title="Change Avatar" id="change-avatar-btn"><i class="fas fa-camera"></i></button><input type="file" id="avatar-input" style="display: none;" accept="image/*">';
    }
    
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
    
    // Remove user from Firebase
    if (firebaseDb) {
        firebaseDb.ref('users/' + userId).remove();
        firebaseDb.ref('online/' + userId).remove();
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
    
    var avatar = user.avatar ? '<img src="' + user.avatar + '">' : (user.name || '?').charAt(0).toUpperCase();
    
    var html = '<div class="user-details-modal">';
    html += '<div class="user-details-header">';
    html += '<div class="user-details-avatar">' + avatar + '</div>';
    html += '<div class="user-details-info">';
    html += '<h3>' + escapeHtml(user.name || 'Unknown') + '</h3>';
    html += '<p>@' + escapeHtml(user.username || 'unknown') + '</p>';
    html += '</div></div>';
    
    html += '<div class="user-details-stats">';
    html += '<div class="stat-item"><span class="stat-value">' + userMessages.length + '</span><span class="stat-label">Messages</span></div>';
    html += '<div class="stat-item"><span class="stat-value">' + userChats.length + '</span><span class="stat-label">Chats</span></div>';
    html += '<div class="stat-item"><span class="stat-value">' + (user.role || 'user') + '</span><span class="stat-label">Role</span></div>';
    html += '<div class="stat-item"><span class="stat-value">' + (user.status || 'active') + '</span><span class="stat-label">Status</span></div>';
    html += '</div>';
    
    html += '<div class="user-details-info-list">';
    html += '<div class="info-row"><span>Email:</span><span>' + escapeHtml(user.email || 'N/A') + '</span></div>';
    html += '<div class="info-row"><span>Phone:</span><span>' + escapeHtml(user.phone || 'N/A') + '</span></div>';
    html += '<div class="info-row"><span>Location:</span><span>' + escapeHtml(user.location || 'N/A') + '</span></div>';
    html += '<div class="info-row"><span>Joined:</span><span>' + formatDate(user.createdAt) + '</span></div>';
    html += '</div>';
    
    if (user.bio) {
        html += '<div class="user-details-bio"><strong>Bio:</strong><p>' + escapeHtml(user.bio) + '</p></div>';
    }
    
    html += '<button class="btn" onclick="closeModal()">Close</button>';
    html += '</div>';
    showModal(html);
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
    document.getElementById('avatar-input').click();
}

function handleAvatarUpload(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
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
            
            // Update profile avatar display
            var profileAvatar = document.getElementById('profile-avatar');
            profileAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
            
            // Update sidebar avatar
            var sidebarAvatar = document.getElementById('sidebar-avatar');
            sidebarAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
            
            // Sync updated avatar to Firebase
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(currentUser);
            }
            
            showToast('Avatar updated!', 'success');
        }
    };
    reader.readAsDataURL(file);
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
    document.getElementById('login-form').onsubmit = function(e) {
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
        
        var result = login(email, password);
        console.log('Login result:', result);
        
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
            if (result.requiresVerification) {
                // Show verification modal
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
        if (file) {
            if (file.type.startsWith('image/')) {
                // For images, use FileReader to get base64
                var reader = new FileReader();
                reader.onload = function(event) {
                    var imageData = event.target.result;
                    sendMessage('[Image] ' + imageData);
                };
                reader.readAsDataURL(file);
            } else {
                // For other files, just send the filename
                sendMessage('[File] ' + file.name);
            }
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
        document.getElementById('profile-edit-form').style.display = 'block';
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
});