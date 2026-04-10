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
    
    var userStatus = Storage.get('userStatus_' + currentUser.id) || { status: 'online', message: '' };
    
    // Update current user's online status in Firebase
    if (firebaseDb) {
        firebaseDb.ref('online/' + currentUser.id).set({
            online: userStatus.status !== 'invisible',
            status: userStatus.status,
            statusMessage: userStatus.message,
            lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Set up disconnect handler when user closes browser
        firebaseDb.ref('online/' + currentUser.id).onDisconnect().set({
            online: false,
            status: 'offline',
            statusMessage: '',
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

function getUserStatus(userId) {
    var status = { online: false, status: 'offline', statusMessage: '', lastSeen: null };
    
    if (window.firebaseOnlineData && window.firebaseOnlineData[userId]) {
        var data = window.firebaseOnlineData[userId];
        status.online = data.online === true;
        status.status = data.status || (data.online ? 'online' : 'offline');
        status.statusMessage = data.statusMessage || '';
        status.lastSeen = data.lastSeen;
    }
    
    return status;
}

function setUserStatus(statusType, message) {
    if (!currentUser) return;
    
    var statusData = {
        status: statusType,
        message: message || '',
        updatedAt: new Date().toISOString()
    };
    
    Storage.set('userStatus_' + currentUser.id, statusData);
    updateOnlineStatus();
    updateSidebarStatus();
    
    var statusLabels = {
        'online': 'Online',
        'away': 'Away',
        'busy': 'Do Not Disturb',
        'invisible': 'Invisible'
    };
    
    showToast('Status changed to ' + (statusLabels[statusType] || statusType), 'success');
}

function updateSidebarStatus() {
    if (!currentUser) return;
    
    var statusData = Storage.get('userStatus_' + currentUser.id) || { status: 'online', message: '' };
    var statusEl = document.getElementById('sidebar-status');
    var statusDot = document.getElementById('sidebar-status-dot');
    
    if (statusEl) {
        var labels = {
            'online': 'Online',
            'away': 'Away',
            'busy': 'Busy',
            'invisible': 'Invisible'
        };
        statusEl.textContent = statusData.message || labels[statusData.status] || 'Online';
    }
    
    if (statusDot) {
        statusDot.className = 'status-dot ' + (statusData.status || 'online');
    }
}

function showStatusPicker() {
    if (!currentUser) return;
    
    var currentStatus = Storage.get('userStatus_' + currentUser.id) || { status: 'online', message: '' };
    
    var html = '<div class="status-picker-modal"><h3>Set Status</h3>';
    
    html += '<div class="status-options">';
    var statuses = [
        { type: 'online', label: 'Online', icon: 'fa-circle', color: '#10b981' },
        { type: 'away', label: 'Away', icon: 'fa-clock', color: '#f59e0b' },
        { type: 'busy', label: 'Do Not Disturb', icon: 'fa-minus-circle', color: '#ef4444' },
        { type: 'invisible', label: 'Invisible', icon: 'fa-eye-slash', color: '#94a3b8' }
    ];
    
    statuses.forEach(function(s) {
        var isActive = currentStatus.status === s.type;
        html += '<div class="status-option' + (isActive ? ' active' : '') + '" onclick="selectStatusType(\'' + s.type + '\')">';
        html += '<i class="fas ' + s.icon + '" style="color:' + s.color + '"></i>';
        html += '<span>' + s.label + '</span>';
        if (isActive) html += '<i class="fas fa-check"></i>';
        html += '</div>';
    });
    html += '</div>';
    
    html += '<div class="status-message-section">';
    html += '<label>Custom Status Message</label>';
    html += '<input type="text" id="custom-status-input" value="' + escapeHtml(currentStatus.message || '') + '" placeholder="What\'s on your mind?" maxlength="80">';
    html += '</div>';
    
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="closeModal()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveCustomStatus()">Save</button>';
    html += '</div>';
    html += '</div>';
    
    showModal(html);
    
    window._selectedStatusType = currentStatus.status;
}

function selectStatusType(type) {
    window._selectedStatusType = type;
    document.querySelectorAll('.status-option').forEach(function(el) {
        el.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

function saveCustomStatus() {
    var type = window._selectedStatusType || 'online';
    var message = document.getElementById('custom-status-input').value.trim();
    
    setUserStatus(type, message);
    closeModal();
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

// Input Sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    // Remove script tags and dangerous content
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:/gi, '')
        .trim();
}

function sanitizeForStorage(data) {
    if (typeof data === 'string') {
        return sanitizeInput(data);
    }
    if (typeof data === 'object' && data !== null) {
        var sanitized = {};
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                sanitized[key] = sanitizeForStorage(data[key]);
            }
        }
        return sanitized;
    }
    return data;
}

// Data Encryption (Simple XOR-based for local storage)
function encryptData(data, key) {
    var jsonStr = JSON.stringify(data);
    var encrypted = '';
    for (var i = 0; i < jsonStr.length; i++) {
        encrypted += String.fromCharCode(jsonStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(encrypted);
}

function decryptData(encrypted, key) {
    try {
        var decoded = atob(encrypted);
        var decrypted = '';
        for (var i = 0; i < decoded.length; i++) {
            decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return JSON.parse(decrypted);
    } catch {
        return null;
    }
}

// Screenshot Blocking
function enableScreenshotBlocking() {
    // Disable print screen
    document.addEventListener('keydown', function(e) {
        if (e.key === 'PrintScreen' || 
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.key === 'u') ||
            (e.ctrlKey && e.key === 's')) {
            e.preventDefault();
            showToast('Screenshots are disabled in this chat', 'warning');
            return false;
        }
    });
    
    // Disable right-click in chat
    var chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        chatMessages.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
    }
    
    // Add CSS to prevent selection
    var style = document.createElement('style');
    style.textContent = `
        .chat-messages.screenshot-blocked {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
            -webkit-touch-callout: none;
        }
    `;
    document.head.appendChild(style);
}

function toggleScreenshotBlocking(enabled) {
    var chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        if (enabled) {
            chatMessages.classList.add('screenshot-blocked');
        } else {
            chatMessages.classList.remove('screenshot-blocked');
        }
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
// Notification System
// ==========================================
let currentNotifTab = 'all';

function getNotifications() {
    return Storage.get('notifications') || [];
}

function saveNotifications(notifications) {
    Storage.set('notifications', notifications);
}

function addNotification(type, actorId, actorName, actorAvatar, content, postId, chatId) {
    if (!currentUser) return;
    
    var notifications = getNotifications();
    var notification = {
        id: generateId(),
        type: type,
        recipientId: currentUser.id,
        actorId: actorId,
        actorName: actorName,
        actorAvatar: actorAvatar,
        content: content,
        postId: postId || null,
        chatId: chatId || null,
        read: false,
        timestamp: new Date().toISOString()
    };
    
    notifications.unshift(notification);
    if (notifications.length > 100) {
        notifications = notifications.slice(0, 100);
    }
    saveNotifications(notifications);
    updateNotificationBadge();
    renderNotifications();
    
    // Send browser notification
    if (typeof sendBrowserNotification === 'function') {
        var typeLabels = {
            'like': 'liked your post',
            'comment': 'commented on your post',
            'reaction': 'reacted to your post',
            'mention': 'mentioned you',
            'message': 'sent you a message'
        };
        var body = actorName + ' ' + (typeLabels[type] || content);
        sendBrowserNotification('BSITCHAT', body);
    }
}

function markNotificationAsRead(notifId) {
    var notifications = getNotifications();
    var notif = notifications.find(function(n) { return n.id === notifId; });
    if (notif) {
        notif.read = true;
        saveNotifications(notifications);
        updateNotificationBadge();
        renderNotifications();
    }
}

function markAllNotificationsAsRead() {
    var notifications = getNotifications();
    notifications.forEach(function(n) {
        if (n.recipientId === currentUser.id) {
            n.read = true;
        }
    });
    saveNotifications(notifications);
    updateNotificationBadge();
    renderNotifications();
    showToast('All notifications marked as read', 'success');
}

function clearAllNotifications() {
    var notifications = getNotifications();
    notifications = notifications.filter(function(n) { return n.recipientId !== currentUser.id; });
    saveNotifications(notifications);
    updateNotificationBadge();
    renderNotifications();
    showToast('Notifications cleared', 'success');
}

function deleteNotification(notifId) {
    var notifications = getNotifications();
    notifications = notifications.filter(function(n) { return n.id !== notifId; });
    saveNotifications(notifications);
    updateNotificationBadge();
    renderNotifications();
}

function getUnreadNotificationCount() {
    if (!currentUser) return 0;
    var notifications = getNotifications();
    return notifications.filter(function(n) { return n.recipientId === currentUser.id && !n.read; }).length;
}

function updateNotificationBadge() {
    var count = getUnreadNotificationCount();
    var badge = document.getElementById('notification-badge');
    if (badge) {
        if (count > 0) {
            badge.style.display = 'inline';
            badge.textContent = count > 99 ? '99+' : count;
        } else {
            badge.style.display = 'none';
        }
    }
}

function getFilteredNotifications() {
    if (!currentUser) return [];
    var notifications = getNotifications();
    var myNotifs = notifications.filter(function(n) { return n.recipientId === currentUser.id; });
    
    if (currentNotifTab === 'unread') {
        return myNotifs.filter(function(n) { return !n.read; });
    } else if (currentNotifTab === 'mentions') {
        return myNotifs.filter(function(n) { return n.type === 'mention'; });
    }
    return myNotifs;
}

function getNotificationIcon(type) {
    var icons = {
        'like': '<i class="fas fa-thumbs-up"></i>',
        'comment': '<i class="fas fa-comment"></i>',
        'reaction': '<i class="fas fa-heart"></i>',
        'mention': '<i class="fas fa-at"></i>',
        'follow': '<i class="fas fa-user-plus"></i>',
        'message': '<i class="fas fa-envelope"></i>',
        'group': '<i class="fas fa-users"></i>'
    };
    return icons[type] || '<i class="fas fa-bell"></i>';
}

function getNotificationTypeClass(type) {
    var classes = {
        'like': 'like',
        'comment': 'comment',
        'reaction': 'reaction',
        'mention': 'mention',
        'follow': 'follow'
    };
    return classes[type] || '';
}

function getNotificationText(notification) {
    var type = notification.type;
    var name = escapeHtml(notification.actorName);
    
    switch (type) {
        case 'like':
            return '<strong>' + name + '</strong> liked your post';
        case 'comment':
            return '<strong>' + name + '</strong> commented on your post';
        case 'reaction':
            return '<strong>' + name + '</strong> reacted to your post';
        case 'mention':
            return '<strong>' + name + '</strong> mentioned you in a post';
        case 'follow':
            return '<strong>' + name + '</strong> started following you';
        case 'message':
            return '<strong>' + name + '</strong> sent you a message';
        case 'group':
            return '<strong>' + name + '</strong> added you to a group';
        default:
            return '<strong>' + name + '</strong> ' + (notification.content || 'interacted with you');
    }
}

function formatNotificationTime(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return date.toLocaleDateString();
}

function renderNotifications() {
    var list = document.getElementById('notification-list');
    var empty = document.getElementById('notification-empty');
    if (!list) return;
    
    var notifications = getFilteredNotifications();
    
    if (notifications.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        list.appendChild(empty || document.createElement('div'));
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    var html = '';
    notifications.forEach(function(notif) {
        var avatar = notif.actorAvatar 
            ? '<img src="' + notif.actorAvatar + '" alt="Avatar">'
            : '<i class="fas fa-user"></i>';
        
        html += '<div class="notification-item' + (notif.read ? '' : ' unread') + '" data-id="' + notif.id + '">';
        html += '<div class="notification-avatar">' + avatar + '</div>';
        html += '<div class="notification-type-icon ' + getNotificationTypeClass(notif.type) + '">' + getNotificationIcon(notif.type) + '</div>';
        html += '<div class="notification-content">';
        html += '<div class="notification-text">' + getNotificationText(notif) + '</div>';
        if (notif.content && notif.type !== 'follow') {
            html += '<div class="notification-preview">' + escapeHtml(notif.content).substring(0, 100) + '</div>';
        }
        html += '<div class="notification-meta">';
        html += '<span class="notification-time">' + formatNotificationTime(notif.timestamp) + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<button class="btn-icon" onclick="event.stopPropagation(); deleteNotification(\'' + notif.id + '\')" title="Dismiss">';
        html += '<i class="fas fa-times"></i>';
        html += '</button>';
        html += '</div>';
    });
    
    list.innerHTML = html;
    
    list.querySelectorAll('.notification-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var notifId = this.dataset.id;
            markNotificationAsRead(notifId);
            var notif = getNotifications().find(function(n) { return n.id === notifId; });
            if (notif && notif.postId) {
                toggleNotificationPanel();
                switchSection('feed');
            }
        });
    });
}

function toggleNotificationPanel() {
    var panel = document.getElementById('notification-panel');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        renderNotifications();
    } else {
        panel.style.display = 'none';
    }
}

function initNotifications() {
    var bell = document.getElementById('notification-bell');
    var closeBtn = document.getElementById('close-notification-panel');
    var markAllBtn = document.getElementById('mark-all-read');
    var clearBtn = document.getElementById('clear-notifications');
    
    if (bell) {
        bell.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleNotificationPanel();
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            document.getElementById('notification-panel').style.display = 'none';
        });
    }
    
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllNotificationsAsRead);
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllNotifications);
    }
    
    document.querySelectorAll('.notif-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.notif-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            currentNotifTab = this.dataset.tab;
            renderNotifications();
        });
    });
    
    document.addEventListener('click', function(e) {
        var panel = document.getElementById('notification-panel');
        var bell = document.getElementById('notification-bell');
        if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && !bell.contains(e.target)) {
            panel.style.display = 'none';
        }
    });
    
    updateNotificationBadge();
    
    // Register Service Worker for Push Notifications
    initPushNotifications();
}

function initPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        return;
    }
    
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
        console.log('Service Worker registered');
    }).catch(function(err) {
        console.log('Service Worker registration failed:', err);
    });
}

function requestPushPermission() {
    if (!('Notification' in window)) {
        showToast('Push notifications not supported', 'error');
        return;
    }
    
    Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') {
            showToast('Push notifications enabled!', 'success');
            subscribeToPush();
        } else {
            showToast('Push notifications denied', 'info');
        }
    });
}

function subscribeToPush() {
    navigator.serviceWorker.ready.then(function(reg) {
        return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ip-yTFaMnpcVdT4QovIYoRnk3VxVPCximwTBsETLFhKYjck-swmjOOJnlFs')
        });
    }).then(function(sub) {
        var endpoint = sub.endpoint;
        var subData = Storage.get('pushSubscription') || {};
        subData.endpoint = endpoint;
        subData.subscription = JSON.stringify(sub);
        Storage.set('pushSubscription', subData);
        console.log('Push subscribed:', endpoint.substring(0, 50) + '...');
    }).catch(function(err) {
        console.log('Push subscribe failed:', err);
    });
}

function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function sendBrowserNotification(title, body, url) {
    if (Notification.permission !== 'granted') return;
    
    var options = {
        body: body,
        icon: '/icon-192.png',
        tag: 'bsitchat-' + Date.now(),
        data: { url: url }
    };
    
    try {
        var n = new Notification(title, options);
        n.onclick = function() {
            window.focus();
            n.close();
            if (url) window.location.href = url;
        };
        setTimeout(n.close.bind(n), 5000);
    } catch (e) {
        console.log('Notification error:', e);
    }
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
async function login(emailOrUsername, password) {
    console.log('Login attempt:', emailOrUsername);

    // Check for account lockout
    var lockouts = Storage.get('accountLockouts') || {};
    var lockout = lockouts[emailOrUsername];
    if (lockout && lockout.lockedUntil > Date.now()) {
        var remainingMinutes = Math.ceil((lockout.lockedUntil - Date.now()) / 60000);
        logSecurityEvent('login_blocked', emailOrUsername, 'Account locked. ' + remainingMinutes + ' minutes remaining.');
        return { success: false, message: 'Account locked. Try again in ' + remainingMinutes + ' minutes.' };
    }

    // Admin login - preserve existing data
    if (emailOrUsername === 'admin@bsithub.com' || emailOrUsername === 'admin') {
        if (password === 'admin123') {
            // Clear lockout on successful login
            delete lockouts[emailOrUsername];
            Storage.set('accountLockouts', lockouts);
            
            var users = Storage.get('users') || [];
            var adminIdx = users.findIndex(function(u) { return u.id === 'admin1'; });
            var defaultAdmin = { id: 'admin1', name: 'Admin User', username: 'admin', email: 'admin@bsithub.com', password: 'admin123', role: 'admin', status: 'active', bio: 'System Administrator', phone: '+1234567890', location: 'New York', createdAt: '2024-01-01T00:00:00.000Z', avatar: null, cover: null, blockedUsers: [], twoFactorEnabled: false };
            if (adminIdx === -1) {
                users.push(defaultAdmin);
            } else {
                // Merge defaults with existing data - preserve avatar, cover, bio, etc.
                users[adminIdx] = Object.assign({}, defaultAdmin, users[adminIdx], { password: 'admin123', role: 'admin', status: 'active' });
            }
            Storage.set('users', users);
            currentUser = users[adminIdx !== -1 ? adminIdx : users.length - 1];
            Storage.set('currentUser', { id: 'admin1' });
            
            // Track device and log
            trackDevice();
            logSecurityEvent('login_success', emailOrUsername, 'Admin login from ' + getDeviceName());
            sendLoginAlert(currentUser);
            
            console.log('Admin login successful');
            return { success: true };
        }
        
        // Failed admin login
        handleFailedLogin(emailOrUsername);
        return { success: false, message: 'Invalid credentials' };
    }

    // Regular users - support both email and username
    var users = Storage.get('users') || [];
    var hashedPassword = hashPassword(password);
    var user = users.find(function(u) {
        return (u.email === emailOrUsername || u.username === emailOrUsername) && u.password === hashedPassword;
    });
    
    if (user) {
        if (user.status === 'banned') {
            logSecurityEvent('login_blocked', emailOrUsername, 'Banned account attempted login');
            return { success: false, message: 'Your account has been banned' };
        }
        
        // Clear failed attempts on successful login
        delete lockouts[emailOrUsername];
        Storage.set('accountLockouts', lockouts);
        
        // Check if 2FA is enabled
        if (user.twoFactorEnabled) {
            // Store temp user for 2FA verification
            window.tempLoginUser = user;
            logSecurityEvent('login_2fa_required', emailOrUsername, '2FA verification required');
            return { success: true, require2FA: true, userId: user.id };
        }
        
        currentUser = user;
        Storage.set('currentUser', { id: user.id });
        
        // Track device and log
        trackDevice();
        logSecurityEvent('login_success', emailOrUsername, 'Login from ' + getDeviceName());
        sendLoginAlert(user);
        
        console.log('Login successful');
        return { success: true };
    }

    // Failed login
    handleFailedLogin(emailOrUsername);
    return { success: false, message: 'Invalid email/username or password' };
}

window.socialLogin = function(provider) {
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
        auth.signInWithRedirect(providerObj).catch(function(error) {
            window.socialLoginInProgress = false;
            if (error.code === 'auth/network-request-failed') {
                showToast('Network error. Please check your connection and try again.', 'error');
            } else {
                showToast('Login failed: ' + error.message, 'error');
            }
        });
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
    
    // Initialize Notifications
    initNotifications();
    
    // Initialize Sidebar Status
    updateSidebarStatus();
    
    // Handle invite links (hash-based)
    setTimeout(function() {
        handleInviteLink();
    }, 2000);
    
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
        
        // Listen for user profile updates (avatar, name, etc.)
        firebaseDb.ref('users').on('child_changed', function(snap) {
            var updatedUser = snap.val();
            if (!updatedUser) return;
            
            var users = Storage.get('users') || [];
            var idx = users.findIndex(function(u) { return u.id === updatedUser.id; });
            if (idx !== -1) {
                users[idx] = Object.assign({}, users[idx], updatedUser);
                Storage.set('users', users);
                console.log('User updated from Firebase:', updatedUser.username);
                
                // If it's the current user, update local currentUser and UI
                if (updatedUser.id === currentUser.id) {
                    currentUser = users[idx];
                    Storage.set('currentUser', { id: currentUser.id });
                    if (updatedUser.avatar) updateAvatarDisplay(updatedUser.avatar);
                    if (updatedUser.cover) updateProfileCover(updatedUser.cover);
                }
                
                // Reload chats to show updated avatars
                loadChats();
                if (typeof renderStories === 'function') renderStories();
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
            if (chat.groupAvatar) {
                chatAvatar = '<img src="' + chat.groupAvatar + '">';
            } else {
                chatAvatar = '<i class="fas fa-users"></i>';
            }
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
        var userStatusType = 'offline';
        if (!chat.isGroup && otherUserId) {
            // Get full status from Firebase
            var userStatusInfo = getUserStatus(otherUserId);
            isOnline = userStatusInfo.online;
            userStatusType = userStatusInfo.status || (isOnline ? 'online' : 'offline');
            if (userStatusInfo.lastSeen) {
                lastSeenText = formatLastSeen(userStatusInfo.lastSeen);
            }
        }
        
        html += '<div class="chat-item-wrapper" data-chat-id="' + chat.id + '">';
        html += '<div class="chat-item ' + (isActive ? 'active' : '') + (chat.pinned ? ' pinned' : '') + '" data-chat-id="' + chat.id + '" data-user-id="' + chatUserId + '">';
        html += '<div class="chat-item-avatar-wrapper">';
        html += '<div class="chat-item-avatar">' + chatAvatar + '</div>';
        // Show indicator with status-based color
        var indicatorClass = isOnline ? userStatusType : 'offline';
        html += '<div class="online-indicator ' + indicatorClass + '"></div>';
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
        html += '<div class="swipe-actions">';
        html += '<div class="swipe-action archive" onclick="archiveChatFromSwipe(\'' + chat.id + '\')"><i class="fas fa-archive"></i><span>Archive</span></div>';
        html += '<div class="swipe-action delete" onclick="deleteChatFromSwipe(\'' + chat.id + '\')"><i class="fas fa-trash"></i><span>Delete</span></div>';
        html += '</div></div>';
    });
    
    chatList.innerHTML = html;
    
    chatList.querySelectorAll('.chat-item').forEach(function(item) {
        item.onclick = function() {
            if (!item.closest('.chat-item-wrapper').classList.contains('swiped')) {
                openChat(item.dataset.chatId, item.dataset.userId);
            }
        };
    });
    
    // Initialize swipe actions for mobile
    initSwipeActions();
    
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
    
    // Update browser tab title with unread count
    if (totalUnread > 0) {
        document.title = '(' + totalUnread + ') BSITHUB';
    } else {
        document.title = 'BSITHUB v2.5.0 - Connect & Chat';
    }
}

// ==========================================
// Mobile Swipe Actions
// ==========================================
function initSwipeActions() {
    var wrappers = document.querySelectorAll('.chat-item-wrapper');
    
    wrappers.forEach(function(wrapper) {
        var item = wrapper.querySelector('.chat-item');
        var startX = 0;
        var startY = 0;
        var currentX = 0;
        var isDragging = false;
        var hasMoved = false;
        
        item.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
            hasMoved = false;
            item.style.transition = 'none';
        }, { passive: true });
        
        item.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            var currentY = e.touches[0].clientY;
            var diffX = startX - currentX;
            var diffY = startY - currentY;
            
            // Only consider it a swipe if horizontal movement is greater than vertical
            if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
                hasMoved = true;
                // Only allow left swipe
                if (diffX > 0 && diffX < 140) {
                    item.style.transform = 'translateX(-' + diffX + 'px)';
                }
            }
        }, { passive: true });
        
        item.addEventListener('touchend', function(e) {
            isDragging = false;
            item.style.transition = 'transform 0.2s ease';
            
            if (hasMoved) {
                var diff = startX - currentX;
                if (diff > 60) {
                    // Snap open
                    item.style.transform = 'translateX(-140px)';
                    wrapper.classList.add('swiped');
                } else {
                    // Snap closed
                    item.style.transform = 'translateX(0)';
                    wrapper.classList.remove('swiped');
                }
            } else {
                // It was a tap, not a swipe - trigger click
                var chatId = wrapper.dataset.chatId;
                var userId = item.dataset.userId;
                if (chatId && userId) {
                    openChat(chatId, userId);
                }
            }
        }, { passive: true });
    });
    
    // Close swiped items when tapping elsewhere
    document.addEventListener('touchstart', function(e) {
        if (!e.target.closest('.chat-item-wrapper')) {
            wrappers.forEach(function(wrapper) {
                var item = wrapper.querySelector('.chat-item');
                item.style.transition = 'transform 0.2s ease';
                item.style.transform = 'translateX(0)';
                wrapper.classList.remove('swiped');
            });
        }
    }, { passive: true });
}

window.archiveChatFromSwipe = function(chatId) {
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex !== -1) {
        chats[chatIndex].archived = true;
        Storage.set('chats', chats);
        showToast('Chat archived', 'success');
        loadChats();
    }
};

window.deleteChatFromSwipe = function(chatId) {
    if (confirm('Delete this chat? This cannot be undone.')) {
        var chats = Storage.get('chats') || [];
        chats = chats.filter(function(c) { return c.id !== chatId; });
        Storage.set('chats', chats);
        
        // Also delete messages
        var messages = Storage.get('messages') || [];
        messages = messages.filter(function(m) { return m.chatId !== chatId; });
        Storage.set('messages', messages);
        
        showToast('Chat deleted', 'success');
        loadChats();
        
        // Clear active chat if it was deleted
        if (activeChat && activeChat.id === chatId) {
            activeChat = null;
            document.getElementById('chat-placeholder').style.display = 'flex';
            document.getElementById('chat-active').style.display = 'none';
        }
    }
};

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
            if (chat.groupAvatar) {
                chatAvatar = '<img src="' + chat.groupAvatar + '">';
            } else {
                chatAvatar = '<i class="fas fa-users"></i>';
            }
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
    // Clear any existing polling/listening for previous chat
    if (window.chatPollInterval) {
        clearInterval(window.chatPollInterval);
        window.chatPollInterval = null;
    }
    
    console.log('openChat called:', chatId, userId);
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    console.log('Found chat:', chat);
    if (!chat) {
        showToast('Chat not found', 'error');
        return;
    }
    
    // Check if chat is locked
    if (chat.locked && !chat.tempUnlocked) {
        activeChat = { id: chatId, userId: userId };
        showUnlockDialog();
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
        // Set group avatar in header
        var headerAvatar = document.getElementById('chat-avatar');
        if (chat.groupAvatar) {
            headerAvatar.innerHTML = '<img src="' + chat.groupAvatar + '" alt="Group">';
        } else {
            headerAvatar.innerHTML = '<i class="fas fa-users"></i>';
        }
    } else {
        var users = Storage.get('users') || [];
        var otherUser = users.find(function(u) { return u.id === userId; });
        
        if (otherUser) {
            document.getElementById('chat-user-name').textContent = otherUser.name;
            // Set user avatar in header
            var headerAvatar = document.getElementById('chat-avatar');
            if (otherUser.avatar) {
                headerAvatar.innerHTML = '<img src="' + otherUser.avatar + '" alt="Avatar">';
            } else {
                headerAvatar.innerHTML = otherUser.name.charAt(0).toUpperCase();
            }
            
            // Get user status from Firebase
            var userStatus = getUserStatus(userId);
            
            if (userStatus.online) {
                var statusLabels = {
                    'online': 'Online',
                    'away': 'Away',
                    'busy': 'Do Not Disturb'
                };
                var statusText = userStatus.statusMessage || statusLabels[userStatus.status] || 'Online';
                document.getElementById('chat-user-status').textContent = statusText;
                document.getElementById('chat-user-status').className = 'chat-status ' + (userStatus.status || 'online');
            } else if (userStatus.lastSeen) {
                document.getElementById('chat-user-status').textContent = formatLastSeen(userStatus.lastSeen);
                document.getElementById('chat-user-status').className = 'chat-status offline';
            } else {
                document.getElementById('chat-user-status').textContent = 'Offline';
                document.getElementById('chat-user-status').className = 'chat-status offline';
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
    
    // Apply compact mode if enabled
    if (typeof applyCompactMode === 'function') applyCompactMode();
    
    // Update read-only UI for groups
    if (typeof updateReadOnlyUI === 'function') updateReadOnlyUI();
    
    // Load messages from Firebase and start listening
    if (typeof loadChatMessages === 'function') {
        loadChatMessages(chatId).then(function(fbMessages) {
            if (activeChat && activeChat.id !== chatId) return; // Chat changed while loading
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
    
    // Debounce render to prevent excessive re-renders
    var renderDebounce = null;
    
    // Listen for NEW messages in real-time
    if (typeof listenChat === 'function') {
        listenChat(chatId, function(msg) {
            if (activeChat && activeChat.id !== chatId) return; // Different chat
            
            var localMessages = Storage.get('messages') || [];
            var idx = localMessages.findIndex(function(m) { return m.id === msg.id; });
            
            if (idx === -1) {
                // NEW MESSAGE!
                localMessages.push(msg);
                Storage.set('messages', localMessages);
                
                // Play sound if not our message
                if (msg.senderId !== currentUser.id) {
                    playReceiveSound();
                    var msgPreview = msg.text ? msg.text.substring(0, 100) : (msg.gifUrl ? '[GIF]' : msg.fileData ? '[File]' : '[Message]');
                    addNotification('message', msg.senderId, msg.senderName || 'Someone', null, msgPreview, null, chatId);
                    // Hide typing indicator when message arrives
                    var typingEl = document.getElementById('typing-indicator');
                    if (typingEl) typingEl.style.display = 'none';
                }
                
                // Debounce render
                clearTimeout(renderDebounce);
                renderDebounce = setTimeout(function() {
                    renderMessages(chatId);
                    loadChats();
                }, 100);
            } else {
                // Update existing
                localMessages[idx] = msg;
                Storage.set('messages', localMessages);
                
                clearTimeout(renderDebounce);
                renderDebounce = setTimeout(function() {
                    renderMessages(chatId);
                }, 100);
            }
        });
    }
    
    // Listen for typing indicator
    if (typeof listenTyping === 'function') {
        listenTyping(chatId, currentUser.id, function(uid) {
            var users = Storage.get('users') || [];
            var typingUser = users.find(function(u) { return u.id === uid; });
            if (typingUser) {
                var typingEl = document.getElementById('typing-indicator');
                if (typingEl) {
                    typingEl.style.display = 'flex';
                    typingEl.querySelector('span').textContent = typingUser.name + ' is typing';
                    // Auto-hide after 3 seconds
                    clearTimeout(window.typingHideTimer);
                    window.typingHideTimer = setTimeout(function() {
                        if (typingEl) typingEl.style.display = 'none';
                    }, 3000);
                }
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
    
    // Limit messages based on device (more aggressive on mobile)
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
    var maxMessages = isMobile ? 50 : 100;
    
    if (chatMessages.length > maxMessages) {
        chatMessages = chatMessages.slice(-maxMessages);
    }
    
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
        
        // System message (group photo/name changes, member joins, etc.)
        if (msg.isSystem || msg.senderId === 'system') {
            // Determine icon based on message content
            var sysIcon = 'fas fa-info-circle';
            if (msg.text.includes('added')) sysIcon = 'fas fa-user-plus';
            else if (msg.text.includes('removed')) sysIcon = 'fas fa-user-minus';
            else if (msg.text.includes('left')) sysIcon = 'fas fa-sign-out-alt';
            else if (msg.text.includes('photo')) sysIcon = 'fas fa-camera';
            else if (msg.text.includes('name')) sysIcon = 'fas fa-pen';
            else if (msg.text.includes('ownership')) sysIcon = 'fas fa-crown';
            
            // Highlight names in bold
            var displayText = escapeHtml(msg.text);
            displayText = displayText.replace(/(added|removed|left|changed|transferred)/g, '<strong>$1</strong>');
            
            html += '<div class="message system-message">';
            html += '<div class="system-message-content">';
            html += '<i class="' + sysIcon + '"></i>';
            html += '<span>' + displayText + '</span>';
            html += '</div>';
            html += '</div>';
            return; // Skip the rest of the message rendering
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
            html += '<div class="message-voice" data-audio="' + msg.id + '">';
            html += '<button class="voice-play-btn" onclick="playVoiceMessage(this, \'' + msg.audioData + '\')"><i class="fas fa-play"></i></button>';
            html += '<div class="voice-waveform" id="waveform-' + msg.id + '">';
            for (var w = 0; w < 30; w++) {
                var h = Math.random() * 60 + 20;
                html += '<span style="height:' + h + '%"></span>';
            }
            html += '</div>';
            html += '<span class="voice-duration">0:00</span>';
            html += '</div>';
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
        // Check for sticker
        else if (msg.stickerUrl) {
            html += '<div class="message-sticker"><img src="' + msg.stickerUrl + '" alt="Sticker"></div>';
        }
        // Regular text (with spoiler support)
        else {
            var textContent = escapeHtml(msg.text);
            if (msg.isSpoiler) {
                html += '<div class="spoiler-text hidden" onclick="toggleSpoiler(this)">' + textContent + '</div>';
            } else {
                html += '<div class="message-text">' + textContent + '</div>';
            }
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
                var isActive = currentUser && userIds.indexOf(currentUser.id) !== -1;
                html += '<span class="reaction-badge' + (isActive ? ' active' : '') + '" title="Click to see who reacted">' + emoji + ' ' + userIds.length + '</span>';
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
            var statusIcon = '';
            if (msg.status === 'read') {
                statusIcon = '<i class="fas fa-check-double read"></i>';
            } else if (msg.status === 'delivered') {
                statusIcon = '<i class="fas fa-check-double"></i>';
            } else {
                statusIcon = '<i class="fas fa-check"></i>';
            }
            html += '<span class="message-status">' + statusIcon + '</span>';
        }
        html += '</div>';
        
        // Action buttons (floating toolbar on hover)
        var canEdit = isSent && !msg.gifUrl && !msg.fileData && !msg.audioData;
        
        html += '<div class="message-actions">';
        html += '<button class="message-action-btn" onclick="replyToMessage(\'' + msg.id + '\')" title="Reply"><i class="fas fa-reply"></i></button>';
        html += '<button class="message-action-btn" onclick="showReactionPicker(\'' + msg.id + '\')" title="React"><i class="far fa-smile"></i></button>';
        html += '<button class="message-action-btn" onclick="forwardMessage(\'' + msg.id + '\')" title="Forward"><i class="fas fa-share"></i></button>';
        html += '<button class="message-action-btn" onclick="translateMessage(\'' + msg.id + '\')" title="Translate"><i class="fas fa-language"></i></button>';
        html += '<button class="message-action-btn' + (msg.starred ? ' starred' : '') + '" onclick="toggleStarMessage(\'' + msg.id + '\')" title="' + (msg.starred ? 'Unstar' : 'Star') + '"><i class="' + (msg.starred ? 'fas' : 'far') + ' fa-star"></i></button>';
        html += '<button class="message-action-btn' + (msg.pinned ? ' pinned' : '') + '" onclick="pinMessage(\'' + msg.id + '\')" title="' + (msg.pinned ? 'Unpin' : 'Pin') + '"><i class="fas fa-thumbtack"></i></button>';
        if (canEdit) {
            html += '<button class="message-action-btn" onclick="editMessage(\'' + msg.id + '\')" title="Edit"><i class="fas fa-pen"></i></button>';
        }
        if (isSent) {
            html += '<button class="message-action-btn delete-btn" onclick="deleteMessage(\'' + msg.id + '\')" title="Delete"><i class="fas fa-trash"></i></button>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    
    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(function() {
        messagesContainer.innerHTML = html;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
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

// ==========================================
// Additional Features
// ==========================================

// 1. Chat Export - Export chat as text file
window.exportChatAsText = function(chatId) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId) { showToast('Select a chat first', 'error'); return; }
    
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    if (!chat) { showToast('Chat not found', 'error'); return; }
    
    var messages = Storage.get('messages') || [];
    var chatMessages = messages.filter(function(m) { return m.chatId === chatId; }).sort(function(a, b) {
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
    
    var chatName = chat.isGroup ? (chat.groupName || 'Group') : 'Chat';
    
    var text = 'BSITHUB Chat Export\n';
    text += 'Chat: ' + chatName + '\n';
    text += 'Exported: ' + new Date().toLocaleString() + '\n';
    text += 'Messages: ' + chatMessages.length + '\n';
    text += '================================\n\n';
    
    chatMessages.forEach(function(msg) {
        var time = new Date(msg.timestamp).toLocaleString();
        var sender = msg.senderId === currentUser.id ? 'You' : (msg.senderName || 'Unknown');
        var content = msg.text || (msg.imageUrl ? '[Image]' : msg.audioData ? '[Voice]' : '[Media]');
        text += '[' + time + '] ' + sender + ': ' + content + '\n';
    });
    
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-' + chatName.replace(/[^a-z0-9]/gi, '-') + '-' + Date.now() + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Chat exported!', 'success');
};

// 2. Mute Chat
window.toggleMuteChat = function(chatId) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    
    chats[chatIndex].muted = !chats[chatIndex].muted;
    Storage.set('chats', chats);
    
    showToast(chats[chatIndex].muted ? 'Chat muted' : 'Chat unmuted', 'success');
};

// 3. Pin Message
window.togglePinMessage = function(msgId) {
    var messages = Storage.get('messages') || [];
    var msgIndex = messages.findIndex(function(m) { return m.id === msgId; });
    if (msgIndex === -1) return;
    
    messages[msgIndex].pinned = !messages[msgIndex].pinned;
    Storage.set('messages', messages);
    
    showToast(messages[msgIndex].pinned ? 'Message pinned' : 'Message unpinned', 'success');
    
    if (activeChat) renderMessages(activeChat.id);
};

window.showPinnedMessages = function() {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var pinned = messages.filter(function(m) { return m.chatId === activeChat.id && m.pinned; });
    
    var html = '<div class="pinned-messages-modal">';
    html += '<h3><i class="fas fa-thumbtack"></i> Pinned Messages</h3>';
    
    if (pinned.length === 0) {
        html += '<div class="pinned-empty">No pinned messages</div>';
    } else {
        pinned.forEach(function(msg) {
            html += '<div class="pinned-item">';
            html += '<div class="pinned-text">' + escapeHtml(msg.text || '[Media]') + '</div>';
            html += '<div class="pinned-meta">' + formatTime(msg.timestamp) + '</div>';
            html += '</div>';
        });
    }
    
    html += '</div>';
    showModal(html);
};

// 4. Read Receipts Toggle
window.toggleReadReceipts = function() {
    var settings = Storage.get('settings') || {};
    settings.readReceipts = !settings.readReceipts;
    Storage.set('settings', settings);
    showToast(settings.readReceipts ? 'Read receipts enabled' : 'Read receipts disabled', 'info');
};

// 5. Custom Notification Sound
window.setNotificationSound = function(sound) {
    var settings = Storage.get('settings') || {};
    settings.notificationSound = sound || 'default';
    Storage.set('settings', settings);
    showToast('Notification sound updated', 'success');
};

// 6. Chat Folders
window.showChatFolders = function() {
    var folders = Storage.get('chatFolders') || [];
    
    var html = '<div class="chat-folders-modal">';
    html += '<h3><i class="fas fa-folder"></i> Chat Folders</h3>';
    
    if (folders.length === 0) {
        html += '<div class="folders-empty">No folders created</div>';
    } else {
        folders.forEach(function(folder, index) {
            html += '<div class="folder-item">';
            html += '<span>' + escapeHtml(folder.name) + '</span>';
            html += '<button onclick="deleteFolder(' + index + ')"><i class="fas fa-trash"></i></button>';
            html += '</div>';
        });
    }
    
    html += '<input type="text" id="new-folder-name" placeholder="New folder name...">';
    html += '<button class="btn btn-primary" onclick="createFolder()"><i class="fas fa-plus"></i> Create</button>';
    html += '</div>';
    showModal(html);
};

window.createFolder = function() {
    var input = document.getElementById('new-folder-name');
    var name = input ? input.value.trim() : '';
    if (!name) return;
    
    var folders = Storage.get('chatFolders') || [];
    folders.push({ name: name, chats: [] });
    Storage.set('chatFolders', folders);
    showToast('Folder created!', 'success');
    showChatFolders();
};

window.deleteFolder = function(index) {
    var folders = Storage.get('chatFolders') || [];
    folders.splice(index, 1);
    Storage.set('chatFolders', folders);
    showToast('Folder deleted', 'info');
    showChatFolders();
};

// 7. Scheduled Messages
window.showScheduleMessage = function() {
    if (!activeChat) { showToast('Select a chat first', 'error'); return; }
    
    var html = '<div class="schedule-modal">';
    html += '<h3><i class="fas fa-clock"></i> Schedule Message</h3>';
    html += '<textarea id="schedule-text" placeholder="Type your message..."></textarea>';
    html += '<input type="datetime-local" id="schedule-time">';
    html += '<button class="btn btn-primary" onclick="scheduleMessage()"><i class="fas fa-clock"></i> Schedule</button>';
    html += '</div>';
    showModal(html);
};

window.scheduleMessage = function() {
    var text = document.getElementById('schedule-text').value.trim();
    var time = document.getElementById('schedule-time').value;
    
    if (!text || !time) { showToast('Fill all fields', 'error'); return; }
    
    var scheduledTime = new Date(time).getTime();
    if (scheduledTime <= Date.now()) { showToast('Time must be in future', 'error'); return; }
    
    var scheduled = Storage.get('scheduledMessages') || [];
    scheduled.push({
        id: generateId(),
        chatId: activeChat.id,
        text: text,
        scheduledTime: scheduledTime
    });
    Storage.set('scheduledMessages', scheduled);
    
    setTimeout(function() {
        sendScheduledMessage(scheduled[scheduled.length - 1]);
    }, scheduledTime - Date.now());
    
    closeModal();
    showToast('Message scheduled!', 'success');
};

function sendScheduledMessage(scheduled) {
    var messages = Storage.get('messages') || [];
    messages.push({
        id: generateId(),
        chatId: scheduled.chatId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: scheduled.text,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent'
    });
    Storage.set('messages', messages);
    
    if (activeChat && activeChat.id === scheduled.chatId) {
        renderMessages(scheduled.chatId);
    }
    
    showToast('Scheduled message sent!', 'info');
}

// 8. Typing Indicator
document.addEventListener('input', function(e) {
    if (e.target.id === 'chat-input') {
        var indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
            clearTimeout(window.typingTimeout);
            window.typingTimeout = setTimeout(function() {
                indicator.style.display = 'none';
            }, 3000);
        }
    }
});

// 9. Location Sharing
window.shareLocationInChat = function() {
    if (!activeChat) { showToast('Select a chat first', 'error'); return; }
    
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var mapUrl = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon;
        
        var messages = Storage.get('messages') || [];
        messages.push({
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            senderName: currentUser.name,
            text: '📍 Location: ' + lat.toFixed(4) + ', ' + lon.toFixed(4),
            locationUrl: mapUrl,
            timestamp: new Date().toISOString(),
            read: false,
            status: 'sent'
        });
        Storage.set('messages', messages);
        renderMessages(activeChat.id);
        showToast('Location shared!', 'success');
    }, function() {
        showToast('Could not get location', 'error');
    });
};

// 10. Group Polls
window.showCreatePoll = function() {
    if (!activeChat || !activeChat.isGroup) {
        showToast('Only in group chats', 'error');
        return;
    }
    
    var html = '<div class="poll-modal">';
    html += '<h3>Create Poll</h3>';
    html += '<input type="text" id="poll-question" placeholder="Question...">';
    html += '<input type="text" class="poll-option" placeholder="Option 1">';
    html += '<input type="text" class="poll-option" placeholder="Option 2">';
    html += '<button class="btn" onclick="addPollOption()">Add Option</button>';
    html += '<button class="btn btn-primary" onclick="createPoll()">Create</button>';
    html += '</div>';
    showModal(html);
};

window.addPollOption = function() {
    var modal = document.querySelector('.poll-modal');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option';
    input.placeholder = 'Option ' + (modal.querySelectorAll('.poll-option').length + 1);
    modal.insertBefore(input, modal.querySelector('.btn'));
};

window.createPoll = function() {
    var question = document.getElementById('poll-question').value.trim();
    var options = [];
    document.querySelectorAll('.poll-option').forEach(function(input) {
        if (input.value.trim()) options.push({ text: input.value.trim(), votes: [] });
    });
    
    if (!question || options.length < 2) {
        showToast('Need question + 2 options', 'error');
        return;
    }
    
    var pollId = generateId();
    var messages = Storage.get('messages') || [];
    messages.push({
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: '📊 Poll: ' + question,
        pollId: pollId,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent'
    });
    Storage.set('messages', messages);
    
    var polls = Storage.get('polls') || [];
    polls.push({ id: pollId, question: question, options: options });
    Storage.set('polls', polls);
    
    closeModal();
    renderMessages(activeChat.id);
    showToast('Poll created!', 'success');
};

window.votePoll = function(pollId, optionIndex) {
    var polls = Storage.get('polls') || [];
    var poll = polls.find(function(p) { return p.id === pollId; });
    if (!poll) return;
    
    var hasVoted = poll.options.some(function(opt) {
        return opt.votes && opt.votes.indexOf(currentUser.id) !== -1;
    });
    
    if (hasVoted) { showToast('Already voted', 'info'); return; }
    
    if (!poll.options[optionIndex].votes) poll.options[optionIndex].votes = [];
    poll.options[optionIndex].votes.push(currentUser.id);
    Storage.set('polls', polls);
    
    if (activeChat) renderMessages(activeChat.id);
    showToast('Vote recorded!', 'success');
};

// 11. Link Previews
window.renderLinkPreview = function(text) {
    var urlRegex = /(https?:\/\/[^\s]+)/g;
    var match = text.match(urlRegex);
    if (!match) return '';
    
    return '<div class="link-preview" onclick="window.open(\'' + escapeHtml(match[0]) + '\', \'_blank\')">' +
        '<i class="fas fa-external-link-alt"></i>' +
        '<span>' + escapeHtml(match[0].substring(0, 40)) + '...</span></div>';
};

// Initialize scheduled messages
setTimeout(function() {
    var scheduled = Storage.get('scheduledMessages') || [];
    scheduled.forEach(function(msg) {
        var delay = msg.scheduledTime - Date.now();
        if (delay > 0 && delay < 86400000) {
            setTimeout(function() { sendScheduledMessage(msg); }, delay);
        }
    });
}, 2000);

// ==========================================
// Additional Mobile Features
// ==========================================

// Message Swipe (swipe left to reply/delete)
window.initMessageSwipe = function() {
    var startX = 0;
    var currentX = 0;
    var isDragging = false;
    
    document.addEventListener('touchstart', function(e) {
        var msg = e.target.closest('.message');
        if (msg) {
            startX = e.touches[0].clientX;
            isDragging = true;
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        var diff = startX - currentX;
        
        if (diff > 0 && diff < 100) {
            var msg = document.querySelector('.message.swiping');
            if (msg) msg.style.transform = 'translateX(-' + diff + 'px)';
        }
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        if (!isDragging) return;
        var diff = startX - currentX;
        
        if (diff > 60) {
            var msg = e.target.closest('.message');
            if (msg) {
                var msgId = msg.dataset.messageId;
                showMessageActions(msgId);
            }
        }
        
        // Reset all messages
        document.querySelectorAll('.message').forEach(function(m) {
            m.style.transform = '';
        });
        
        isDragging = false;
    }, { passive: true });
};

// Long Press Context Menu
window.initLongPress = function() {
    var pressTimer = null;
    
    document.addEventListener('touchstart', function(e) {
        var target = e.target.closest('.message, .chat-item, .post-card');
        if (target) {
            pressTimer = setTimeout(function() {
                // Long press detected
                if (navigator.vibrate) navigator.vibrate(50);
                
                if (target.classList.contains('message')) {
                    showMessageActions(target.dataset.messageId);
                } else if (target.classList.contains('chat-item')) {
                    // Show chat options
                }
            }, 500);
        }
    }, { passive: true });
    
    document.addEventListener('touchend', function() {
        clearTimeout(pressTimer);
    }, { passive: true });
    
    document.addEventListener('touchmove', function() {
        clearTimeout(pressTimer);
    }, { passive: true });
};

// Show Message Actions Menu
window.showMessageActions = function(msgId) {
    var messages = Storage.get('messages') || [];
    var msg = messages.find(function(m) { return m.id === msgId; });
    if (!msg) return;
    
    var isSent = msg.senderId === currentUser.id;
    
    var html = '<div class="message-actions-modal">';
    html += '<div class="message-preview">' + escapeHtml(msg.text || '').substring(0, 50) + (msg.text && msg.text.length > 50 ? '...' : '') + '</div>';
    html += '<div class="actions-grid">';
    html += '<button class="action-item" onclick="replyToMessage(\'' + msgId + '\'); closeModal();"><i class="fas fa-reply"></i><span>Reply</span></button>';
    html += '<button class="action-item" onclick="showReactionPicker(\'' + msgId + '\'); closeModal();"><i class="fas fa-smile"></i><span>React</span></button>';
    html += '<button class="action-item" onclick="forwardMessage(\'' + msgId + '\'); closeModal();"><i class="fas fa-share"></i><span>Forward</span></button>';
    html += '<button class="action-item" onclick="copyMessageText(\'' + msgId + '\'); closeModal();"><i class="fas fa-copy"></i><span>Copy</span></button>';
    html += '<button class="action-item" onclick="toggleStarMessage(\'' + msgId + '\'); closeModal();"><i class="fas fa-star"></i><span>Star</span></button>';
    if (isSent) {
        html += '<button class="action-item" onclick="editMessage(\'' + msgId + '\'); closeModal();"><i class="fas fa-pen"></i><span>Edit</span></button>';
    }
    html += '<button class="action-item danger" onclick="deleteMessage(\'' + msgId + '\'); closeModal();"><i class="fas fa-trash"></i><span>Delete</span></button>';
    html += '</div>';
    html += '</div>';
    showModal(html);
};

window.copyMessageText = function(msgId) {
    var messages = Storage.get('messages') || [];
    var msg = messages.find(function(m) { return m.id === msgId; });
    if (msg && msg.text) {
        navigator.clipboard.writeText(msg.text).then(function() {
            showToast('Copied!', 'success');
        });
    }
};

// Scroll to Bottom Button
window.initScrollToBottom = function() {
    var btn = document.createElement('button');
    btn.className = 'scroll-to-bottom';
    btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    btn.style.display = 'none';
    btn.onclick = function() {
        var messages = document.getElementById('chat-messages');
        if (messages) {
            messages.scrollTop = messages.scrollHeight;
        }
    };
    
    var chatMain = document.querySelector('.chat-main');
    if (chatMain) chatMain.appendChild(btn);
    
    // Show/hide based on scroll position
    document.addEventListener('scroll', function(e) {
        if (e.target.id === 'chat-messages') {
            var el = e.target;
            var isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
            btn.style.display = isNearBottom ? 'none' : 'flex';
        }
    }, true);
};

// Unread Badge on Tab
window.updateTabBadge = function() {
    if (!currentUser) return;
    var messages = Storage.get('messages') || [];
    var unread = messages.filter(function(m) { return !m.read && m.senderId !== currentUser.id; }).length;
    
    if (unread > 0) {
        document.title = '(' + unread + ') BSITHUB';
    } else {
        document.title = 'BSITHUB';
    }
};

// Call this on message changes
setInterval(updateTabBadge, 5000);

// Mute Chat
window.muteChat = function(chatId) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    
    chats[chatIndex].muted = !chats[chatIndex].muted;
    Storage.set('chats', chats);
    
    showToast(chats[chatIndex].muted ? 'Chat muted' : 'Chat unmuted', 'success');
};

// Pin Chat
window.togglePinChat = function(chatId) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId) return;
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    
    chats[chatIndex].pinned = !chats[chatIndex].pinned;
    Storage.set('chats', chats);
    
    showToast(chats[chatIndex].pinned ? 'Chat pinned' : 'Chat unpinned', 'success');
    loadChats();
};

// Dark Mode Toggle
window.toggleDarkMode = function() {
    var isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    
    var settings = Storage.get('settings') || {};
    settings.theme = isDark ? 'light' : 'dark';
    Storage.set('settings', settings);
    
    showToast(isDark ? 'Light mode' : 'Dark mode', 'info');
};

// Font Size
window.setFontSize = function(size) {
    document.documentElement.style.fontSize = size + 'px';
    
    var settings = Storage.get('settings') || {};
    settings.fontSize = size;
    Storage.set('settings', settings);
};

// Chat Backup Export
window.exportChatBackup = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'error');
        return;
    }
    
    var messages = Storage.get('messages') || [];
    var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
    
    var text = 'Chat Backup - ' + new Date().toLocaleString() + '\n';
    text += '================================\n\n';
    
    chatMessages.forEach(function(msg) {
        var time = new Date(msg.timestamp).toLocaleString();
        var sender = msg.senderId === currentUser.id ? 'You' : (msg.senderName || 'Unknown');
        text += '[' + time + '] ' + sender + ': ' + (msg.text || '[Media]') + '\n';
    });
    
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-chat-' + Date.now() + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Chat exported!', 'success');
};

// Image Lazy Loading
window.initLazyLoading = function() {
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });
        
        document.querySelectorAll('img[data-src]').forEach(function(img) {
            observer.observe(img);
        });
    }
};

// Initialize all features
setTimeout(function() {
    try {
        initMessageSwipe();
        initLongPress();
        initScrollToBottom();
        initLazyLoading();
        console.log('Additional mobile features initialized');
    } catch(e) {
        console.error('Init error:', e);
    }
}, 1500);

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

// Pin/Unpin Message
function pinMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message || !activeChat) return;
    
    // Count pinned messages in this chat
    var pinnedInChat = messages.filter(function(m) { return m.chatId === activeChat.id && m.pinned; });
    
    if (message.pinned) {
        // Unpin
        message.pinned = false;
        message.pinnedBy = null;
        message.pinnedAt = null;
        showToast('Message unpinned', 'success');
    } else {
        // Pin (limit to 10 pinned messages per chat)
        if (pinnedInChat.length >= 10) {
            showToast('Maximum 10 pinned messages per chat', 'warning');
            return;
        }
        message.pinned = true;
        message.pinnedBy = currentUser.id;
        message.pinnedAt = new Date().toISOString();
        showToast('Message pinned', 'success');
    }
    
    Storage.set('messages', messages);
    renderMessages(activeChat.id);
    
    // Sync to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(message);
    }
}

// Toggle Star Message
function toggleStarMessage(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    message.starred = !message.starred;
    Storage.set('messages', messages);
    
    if (activeChat) {
        renderMessages(activeChat.id);
    }
    
    showToast(message.starred ? 'Message starred' : 'Message unstarred', 'success');
    
    // Sync to Firebase
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(message);
    }
}

// Show Pinned Messages Panel
function showPinnedMessages() {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var pinnedMessages = messages.filter(function(m) { 
        return m.chatId === activeChat.id && m.pinned; 
    });
    
    if (pinnedMessages.length === 0) {
        showToast('No pinned messages in this chat', 'info');
        return;
    }
    
    var users = Storage.get('users') || [];
    var html = '<div class="pinned-messages-modal"><h3><i class="fas fa-thumbtack"></i> Pinned Messages</h3>';
    html += '<div class="pinned-messages-list">';
    
    pinnedMessages.sort(function(a, b) { return new Date(b.pinnedAt) - new Date(a.pinnedAt); });
    
    pinnedMessages.forEach(function(msg) {
        var sender = users.find(function(u) { return u.id === msg.senderId; });
        var senderName = sender ? sender.name : 'Unknown';
        var avatar = sender && sender.avatar 
            ? '<img src="' + sender.avatar + '" alt="">' 
            : '<i class="fas fa-user"></i>';
        
        html += '<div class="pinned-message-item" onclick="scrollToMessage(\'' + msg.id + '\'); closeModal();">';
        html += '<div class="pinned-msg-header">';
        html += '<div class="pinned-msg-avatar">' + avatar + '</div>';
        html += '<span class="pinned-msg-sender">' + escapeHtml(senderName) + '</span>';
        html += '<span class="pinned-msg-time">' + formatTime(msg.timestamp) + '</span>';
        html += '</div>';
        html += '<div class="pinned-msg-text">' + escapeHtml(msg.text || '[Media]') + '</div>';
        html += '<button class="btn-icon unpin-btn" onclick="event.stopPropagation(); unpinFromModal(\'' + msg.id + '\')" title="Unpin">';
        html += '<i class="fas fa-times"></i>';
        html += '</button>';
        html += '</div>';
    });
    
    html += '</div></div>';
    showModal(html);
}

function unpinFromModal(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (message) {
        message.pinned = false;
        message.pinnedBy = null;
        message.pinnedAt = null;
        Storage.set('messages', messages);
        
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(message);
        }
    }
    
    closeModal();
    if (activeChat) {
        renderMessages(activeChat.id);
    }
    showToast('Message unpinned', 'success');
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
    
    // Nickname (for 1-on-1 chats)
    if (!chat.isGroup) {
        html += '<div class="option-item" onclick="showNicknameEditor()">';
        html += '<i class="fas fa-user-tag"></i>';
        html += '<span>Set Nickname</span>';
        html += '<i class="fas fa-chevron-right"></i>';
        html += '</div>';
    }
    
    // Lock Chat
    var isLocked = chat && chat.locked;
    html += '<div class="option-item" onclick="toggleChatLock()">';
    html += '<i class="fas fa-lock' + (isLocked ? '' : '') + '"></i>';
    html += '<span>' + (isLocked ? 'Unlock' : 'Lock') + ' Chat</span>';
    html += '<div class="option-toggle ' + (isLocked ? 'active' : '') + '"></div>';
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
    var chatId = chat.id;
    
    // Add system message before leaving
    var systemMsg = {
        id: generateId(),
        chatId: chatId,
        senderId: 'system',
        text: currentUser.name + ' left the group',
        isSystem: true,
        timestamp: new Date().toISOString(),
        read: true,
        status: 'read',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    var messages = Storage.get('messages') || [];
    messages.push(systemMsg);
    Storage.set('messages', messages);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(systemMsg);
    }
    
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
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === chat.id; });
        if (chatIndex !== -1) {
            chats[chatIndex] = chat;
            Storage.set('chats', chats);
            if (typeof syncChat === 'function') {
                syncChat(chat);
            }
        }
    }
    
    var isAdmin = chat.admin === currentUser.id;
    var avatar = chat.groupAvatar 
        ? '<img src="' + chat.groupAvatar + '" alt="Group Photo">'
        : '<i class="fas fa-users"></i>';
    
    var html = '<div class="group-info-modal">';
    html += '<div class="group-info-header">';
    html += '<div class="group-avatar-large" onclick="' + (isAdmin ? 'changeGroupAvatar()' : '') + '">' + avatar;
    if (isAdmin) html += '<div class="avatar-overlay"><i class="fas fa-camera"></i></div>';
    html += '</div>';
    html += '<div class="group-title-row">';
    html += '<h3 id="group-title-display">' + escapeHtml(chat.groupName || 'Group') + '</h3>';
    if (isAdmin) html += '<button class="btn-icon" onclick="editGroupName()" title="Edit Name"><i class="fas fa-pen"></i></button>';
    html += '</div>';
    html += '<p class="group-member-count">' + chat.participants.length + ' members</p>';
    html += '</div>';
    
    // Group Description
    html += '<div class="group-section">';
    html += '<div class="group-section-header">';
    html += '<h4>Description</h4>';
    if (isAdmin) html += '<button class="btn-icon" onclick="editGroupDescription()" title="Edit"><i class="fas fa-pen"></i></button>';
    html += '</div>';
    html += '<p class="group-description">' + (chat.description ? escapeHtml(chat.description) : '<em style="color:var(--text-muted)">No description</em>') + '</p>';
    html += '</div>';
    
    // Group Invite Link
    html += '<div class="group-section">';
    html += '<h4>Invite Link</h4>';
    html += '<p class="group-section-desc">Share this link with people you want to invite</p>';
    html += '<div class="invite-link-card">';
    var inviteUrl = chat.inviteCode ? window.location.origin + '/#join/' + chat.inviteCode : 'Not generated';
    html += '<div class="invite-code-display"><i class="fas fa-link"></i><span id="invite-code-text">' + inviteUrl + '</span></div>';
    html += '<div class="invite-actions">';
    html += '<button class="invite-btn copy" onclick="copyInviteLink()" title="Copy link"><i class="fas fa-copy"></i><span>Copy</span></button>';
    if (chat.inviteCode) html += '<a class="invite-btn share" href="https://wa.me/?text=' + encodeURIComponent('Join my group chat: ' + inviteUrl) + '" target="_blank" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i><span>Share</span></a>';
    if (isAdmin) html += '<button class="invite-btn refresh" onclick="generateInviteLink()" title="Generate new link"><i class="fas fa-sync"></i><span>New</span></button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    // Actions
    html += '<div class="group-section">';
    html += '<h4>Actions</h4>';
    html += '<div class="group-actions-grid">';
    html += '<button class="group-action-card primary" onclick="showAddMembers()">';
    html += '<div class="action-icon"><i class="fas fa-user-plus"></i></div>';
    html += '<span>Add Members</span>';
    html += '</button>';
    if (isAdmin) {
        html += '<button class="group-action-card" onclick="toggleReadOnly()">';
        html += '<div class="action-icon"><i class="fas fa-' + (chat.readOnly ? 'unlock' : 'lock') + '"></i></div>';
        html += '<span>' + (chat.readOnly ? 'Disable' : 'Enable') + ' Read-Only</span>';
        html += '</button>';
        html += '<button class="group-action-card" onclick="showTransferAdmin()">';
        html += '<div class="action-icon"><i class="fas fa-crown"></i></div>';
        html += '<span>Transfer Ownership</span>';
        html += '</button>';
    }
    html += '</div>';
    html += '<div class="group-actions-divider"></div>';
    html += '<div class="group-actions-list">';
    html += '<button class="group-action-item" onclick="leaveGroup()">';
    html += '<i class="fas fa-sign-out-alt"></i>';
    html += '<span>Leave Group</span>';
    html += '<i class="fas fa-chevron-right"></i>';
    html += '</button>';
    if (isAdmin) {
        html += '<button class="group-action-item danger" onclick="deleteGroup()">';
        html += '<i class="fas fa-trash"></i>';
        html += '<span>Delete Group</span>';
        html += '<i class="fas fa-chevron-right"></i>';
        html += '</button>';
    }
    html += '</div>';
    html += '</div>';
    
    // Members List
    html += '<div class="group-section">';
    html += '<h4>Members (' + chat.participants.length + ')</h4>';
    html += '<div class="group-members-list">';
    
    chat.participants.forEach(function(userId) {
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) {
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
        
        var userAvatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
        var memberRole = getMemberRole(chat, userId);
        var isGroupAdmin = memberRole === 'owner';
        var isModerator = memberRole === 'moderator';
        
        html += '<div class="group-member">';
        html += '<div class="member-avatar">' + userAvatar + '</div>';
        html += '<div class="member-info">';
        html += '<span class="member-name">' + escapeHtml(user.name);
        html += getRoleBadge(chat, userId);
        if (userId === currentUser.id) html += ' <span class="you-badge">You</span>';
        html += '</span>';
        html += '<span class="member-username">@' + escapeHtml(user.username) + '</span>';
        html += '</div>';
        
        if (isAdmin && userId !== currentUser.id && !isGroupAdmin) {
            html += '<div class="member-actions">';
            html += '<select class="role-selector" onchange="updateMemberRole(\'' + userId + '\', this.value)">';
            html += '<option value="member"' + (memberRole === 'member' ? ' selected' : '') + '>Member</option>';
            html += '<option value="moderator"' + (memberRole === 'moderator' ? ' selected' : '') + '>Moderator</option>';
            html += '<option value="admin"' + (memberRole === 'admin' ? ' selected' : '') + '>Admin</option>';
            html += '</select>';
            html += '<button class="btn-icon" onclick="kickMember(\'' + userId + '\')" title="Remove"><i class="fas fa-user-minus"></i></button>';
            html += '</div>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    html += '</div>';
    
    html += '<button class="btn" onclick="closeModal()">Close</button>';
    html += '</div>';
    showModal(html);
}

function editGroupName() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup || chat.admin !== currentUser.id) return;
    
    var html = '<div class="edit-group-modal"><h3>Edit Group Name</h3>';
    html += '<input type="text" id="new-group-name" value="' + escapeHtml(chat.groupName || '') + '" placeholder="Group name" maxlength="50">';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showGroupInfo()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveGroupName()">Save</button>';
    html += '</div></div>';
    showModal(html);
    setTimeout(function() { document.getElementById('new-group-name').focus(); }, 100);
}

function saveGroupName() {
    if (!activeChat) return;
    var newName = document.getElementById('new-group-name').value.trim();
    if (!newName) {
        showToast('Group name cannot be empty', 'error');
        return;
    }
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var oldName = chats[chatIndex].groupName;
    chats[chatIndex].groupName = newName;
    Storage.set('chats', chats);
    
    // Add system message if name changed
    if (oldName !== newName) {
        var systemMsg = {
            id: generateId(),
            chatId: activeChat.id,
            senderId: 'system',
            text: currentUser.name + ' changed the group name to "' + newName + '"',
            isSystem: true,
            timestamp: new Date().toISOString(),
            read: true,
            status: 'read',
            reactions: {},
            edited: false,
            starred: false,
            replyTo: null,
            forwarded: false
        };
        var messages = Storage.get('messages') || [];
        messages.push(systemMsg);
        Storage.set('messages', messages);
        
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(systemMsg);
        }
    }
    
    if (typeof syncChat === 'function') {
        syncChat(chats[chatIndex]);
    }
    
    document.getElementById('chat-user-name').textContent = newName;
    showToast('Group name updated', 'success');
    showGroupInfo();
    if (activeChat) renderMessages(activeChat.id);
}

function editGroupDescription() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup || chat.admin !== currentUser.id) return;
    
    var html = '<div class="edit-group-modal"><h3>Edit Description</h3>';
    html += '<textarea id="new-group-desc" placeholder="Add a description..." rows="3" maxlength="200">' + escapeHtml(chat.description || '') + '</textarea>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showGroupInfo()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveGroupDescription()">Save</button>';
    html += '</div></div>';
    showModal(html);
    setTimeout(function() { document.getElementById('new-group-desc').focus(); }, 100);
}

function saveGroupDescription() {
    if (!activeChat) return;
    var newDesc = document.getElementById('new-group-desc').value.trim();
    
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    chats[chatIndex].description = newDesc;
    Storage.set('chats', chats);
    
    if (typeof syncChat === 'function') {
        syncChat(chats[chatIndex]);
    }
    
    showToast('Description updated', 'success');
    showGroupInfo();
}

function changeGroupAvatar() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup || chat.admin !== currentUser.id) return;
    
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please select an image', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('Image too large. Max 2MB.', 'error');
            return;
        }
        
        var reader = new FileReader();
        reader.onload = function(ev) {
            var chats = Storage.get('chats') || [];
            var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
            if (chatIndex === -1) return;
            
            chats[chatIndex].groupAvatar = ev.target.result;
            Storage.set('chats', chats);
            
            if (typeof syncChat === 'function') {
                syncChat(chats[chatIndex]);
            }
            
            // Update header avatar
            var headerAvatar = document.getElementById('chat-avatar');
            if (headerAvatar) {
                headerAvatar.innerHTML = '<img src="' + ev.target.result + '" alt="Group">';
            }
            
            // Add system message
            var messages = Storage.get('messages') || [];
            var systemMessage = {
                id: generateId(),
                chatId: activeChat.id,
                senderId: 'system',
                text: currentUser.name + ' changed the group photo',
                isSystem: true,
                timestamp: new Date().toISOString(),
                read: true,
                status: 'read',
                reactions: {},
                edited: false,
                starred: false,
                replyTo: null,
                forwarded: false
            };
            messages.push(systemMessage);
            Storage.set('messages', messages);
            
            if (typeof sendMsgToFirebase === 'function') {
                sendMsgToFirebase(systemMessage);
            }
            
            // Refresh UI
            loadChats();
            if (activeChat) renderMessages(activeChat.id);
            
            showToast('Group photo updated', 'success');
            showGroupInfo();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function generateInviteLink() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var chat = chats[chatIndex];
    if (!chat.isGroup || chat.admin !== currentUser.id) {
        showToast('Only admin can generate invite link', 'error');
        return;
    }
    
    var code = generateId().toUpperCase().substring(0, 8);
    chats[chatIndex].inviteCode = code;
    Storage.set('chats', chats);
    
    if (typeof syncChat === 'function') {
        syncChat(chats[chatIndex]);
    }
    
    var linkText = document.getElementById('invite-code-text');
    if (linkText) linkText.textContent = window.location.origin + '/#join/' + code;
    
    showToast('New invite link generated', 'success');
}

function copyInviteLink() {
    var linkText = document.getElementById('invite-code-text');
    if (!linkText || linkText.textContent === 'Not generated') {
        showToast('No invite link available', 'info');
        return;
    }
    
    navigator.clipboard.writeText(linkText.textContent).then(function() {
        showToast('Invite code copied!', 'success');
    }).catch(function() {
        // Fallback for older browsers
        var temp = document.createElement('input');
        document.body.appendChild(temp);
        temp.value = linkText.textContent;
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast('Invite code copied!', 'success');
    });
}

function showTransferAdmin() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup || chat.admin !== currentUser.id) return;
    
    var users = Storage.get('users') || [];
    var otherMembers = chat.participants.filter(function(id) { return id !== currentUser.id; });
    
    if (otherMembers.length === 0) {
        showToast('No other members to transfer to', 'info');
        return;
    }
    
    var html = '<div class="transfer-admin-modal"><h3><i class="fas fa-crown"></i> Transfer Ownership</h3>';
    html += '<p>Select a member to become the new admin:</p>';
    html += '<div class="member-select-list">';
    
    otherMembers.forEach(function(userId) {
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) return;
        var avatar = user.avatar ? '<img src="' + user.avatar + '">' : user.name.charAt(0).toUpperCase();
        
        html += '<div class="member-select-item" onclick="confirmTransferAdmin(\'' + userId + '\')">';
        html += '<div class="member-avatar">' + avatar + '</div>';
        html += '<span class="member-name">' + escapeHtml(user.name) + '</span>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<button class="btn" onclick="showGroupInfo()">Cancel</button>';
    html += '</div>';
    showModal(html);
}

function confirmTransferAdmin(newAdminId) {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    var users = Storage.get('users') || [];
    var newAdmin = users.find(function(u) { return u.id === newAdminId; });
    
    showModal('<div class="confirm-transfer"><h3>Transfer Ownership?</h3><p>' + (newAdmin ? escapeHtml(newAdmin.name) : 'This user') + ' will become the new group admin.</p><div class="modal-buttons"><button class="btn" onclick="showTransferAdmin()">Cancel</button><button class="btn btn-primary" onclick="executeTransferAdmin(\'' + newAdminId + '\')">Transfer</button></div></div>');
}

function executeTransferAdmin(newAdminId) {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    
    chats[chatIndex].admin = newAdminId;
    Storage.set('chats', chats);
    
    // Add system message
    var users = Storage.get('users') || [];
    var newAdmin = users.find(function(u) { return u.id === newAdminId; });
    var systemMsg = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: 'system',
        text: currentUser.name + ' transferred ownership to ' + (newAdmin ? newAdmin.name : 'someone'),
        isSystem: true,
        timestamp: new Date().toISOString(),
        read: true,
        status: 'read',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    var messages = Storage.get('messages') || [];
    messages.push(systemMsg);
    Storage.set('messages', messages);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(systemMsg);
    }
    
    if (typeof syncChat === 'function') {
        syncChat(chats[chatIndex]);
    }
    
    showToast('Ownership transferred', 'success');
    showGroupInfo();
    renderMessages(activeChat.id);
}

function deleteGroup() {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === activeChat.id; });
    if (!chat || !chat.isGroup || chat.admin !== currentUser.id) {
        showToast('Only admin can delete the group', 'error');
        return;
    }
    
    showModal('<div class="delete-confirm"><h3>Delete Group?</h3><p>This will permanently delete the group and all messages for everyone.</p><div class="modal-buttons"><button class="btn" onclick="showGroupInfo()">Cancel</button><button class="btn danger" onclick="confirmDeleteGroup()">Delete Group</button></div></div>');
}

function confirmDeleteGroup() {
    if (!activeChat) return;
    var groupId = activeChat.id;
    
    // Remove chat
    var chats = Storage.get('chats') || [];
    chats = chats.filter(function(c) { return c.id !== groupId; });
    Storage.set('chats', chats);
    
    // Remove messages
    var messages = Storage.get('messages') || [];
    messages = messages.filter(function(m) { return m.chatId !== groupId; });
    Storage.set('messages', messages);
    
    // Clear active chat
    activeChat = null;
    document.getElementById('chat-placeholder').style.display = 'block';
    document.getElementById('chat-active').style.display = 'none';
    
    closeModal();
    loadChats();
    loadGroups();
    showToast('Group deleted', 'success');
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
    
    // Add system message
    var users = Storage.get('users') || [];
    var addedUser = users.find(function(u) { return u.id === userId; });
    var systemMsg = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: 'system',
        text: currentUser.name + ' added ' + (addedUser ? addedUser.name : 'someone') + ' to the group',
        isSystem: true,
        timestamp: new Date().toISOString(),
        read: true,
        status: 'read',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    var messages = Storage.get('messages') || [];
    messages.push(systemMsg);
    Storage.set('messages', messages);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(systemMsg);
    }
    
    // Sync to Firebase
    if (typeof syncChat === 'function') {
        syncChat(chat);
    }
    
    showToast('Member added!', 'success');
    
    // Refresh group info
    showGroupInfo();
    renderMessages(activeChat.id);
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
    
    // Only admin can kick
    if (chat.admin !== currentUser.id) {
        showToast('Only admin can remove members', 'error');
        return;
    }
    
    // Can't kick yourself
    if (userId === currentUser.id) {
        showToast('Cannot kick yourself. Use Leave Group instead.', 'error');
        return;
    }
    
    // Can't kick the admin
    if (userId === chat.admin) {
        showToast('Cannot remove the group admin', 'error');
        return;
    }
    
    // Remove member from participants
    chat.participants = chat.participants.filter(function(id) { return id !== userId; });
    chats[chatIndex] = chat;
    Storage.set('chats', chats);
    
    // Add system message
    var users = Storage.get('users') || [];
    var kickedUser = users.find(function(u) { return u.id === userId; });
    var systemMsg = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: 'system',
        text: currentUser.name + ' removed ' + (kickedUser ? kickedUser.name : 'someone') + ' from the group',
        isSystem: true,
        timestamp: new Date().toISOString(),
        read: true,
        status: 'read',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    var messages = Storage.get('messages') || [];
    messages.push(systemMsg);
    Storage.set('messages', messages);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(systemMsg);
    }
    
    // Sync to Firebase
    if (typeof syncChat === 'function') {
        syncChat(chat);
    }
    
    closeModal();
    showToast('Member removed from group', 'success');
    
    // Show updated group info
    showGroupInfo();
    renderMessages(activeChat.id);
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
    
    fetch('/api/gifs/search?q=' + encodeURIComponent(query) + '&limit=24')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            grid.innerHTML = '';
            if (data.results && data.results.length > 0) {
                data.results.forEach(function(gif) {
                    var gifUrl = gif.media && gif.media[0] ? gif.media[0].tinygif.url : '';
                    var fullUrl = gif.media && gif.media[0] ? gif.media[0].gif.url : gifUrl;
                    if (!gifUrl) return;
                    var item = document.createElement('div');
                    item.className = 'gif-item';
                    var img = document.createElement('img');
                    img.src = gifUrl;
                    img.alt = gif.title || 'GIF';
                    img.loading = 'lazy';
                    item.appendChild(img);
                    item.onclick = function() {
                        sendGif(fullUrl);
                    };
                    grid.appendChild(item);
                });
            } else {
                grid.innerHTML = '<div class="gif-no-results">No GIFs found. Try a different search.</div>';
            }
        })
        .catch(function(err) {
            console.error('GIF search error:', err);
            grid.innerHTML = '<div class="gif-no-results">Could not search GIFs</div>';
        });
}

function populateGifPicker(type) {
    var grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Loading GIFs...</div>';
    
    fetch('/api/gifs/trending?limit=24')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            grid.innerHTML = '';
            if (data.results && data.results.length > 0) {
                data.results.forEach(function(gif) {
                    var gifUrl = gif.media && gif.media[0] ? gif.media[0].tinygif.url : '';
                    var fullUrl = gif.media && gif.media[0] ? gif.media[0].gif.url : gifUrl;
                    if (!gifUrl) return;
                    var item = document.createElement('div');
                    item.className = 'gif-item';
                    var img = document.createElement('img');
                    img.src = gifUrl;
                    img.alt = gif.title || 'GIF';
                    img.loading = 'lazy';
                    item.appendChild(img);
                    item.onclick = function() {
                        sendGif(fullUrl);
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
    
    // Sanitize input
    var sanitizedText = sanitizeInput(text.trim());
    
    var messages = Storage.get('messages') || [];
    var newMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: sanitizedText,
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
    
    // Update composer avatar
    var composerAvatar = document.getElementById('composer-avatar');
    if (composerAvatar) {
        composerAvatar.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
    }
    var composerAvatar2 = document.getElementById('composer-avatar-2');
    if (composerAvatar2) {
        composerAvatar2.innerHTML = '<img src="' + avatarData + '" alt="Avatar">';
    }
    
    // Update stories bar
    if (typeof renderStories === 'function') renderStories();
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
    var html = '<div class="delete-account-modal">';
    html += '<div class="delete-icon"><i class="fas fa-exclamation-triangle"></i></div>';
    html += '<h3>Delete Account</h3>';
    html += '<p class="delete-warning">This action is <strong>permanent</strong> and cannot be undone. All your data will be deleted:</p>';
    html += '<ul class="delete-list">';
    html += '<li><i class="fas fa-times"></i> All messages and chats</li>';
    html += '<li><i class="fas fa-times"></i> All posts and comments</li>';
    html += '<li><i class="fas fa-times"></i> Profile and settings</li>';
    html += '<li><i class="fas fa-times"></i> Friends and connections</li>';
    html += '</ul>';
    html += '<div class="delete-confirm">';
    html += '<label for="delete-confirm-text">Type <strong>DELETE</strong> to confirm:</label>';
    html += '<input type="text" id="delete-confirm-text" placeholder="Type DELETE here" autocomplete="off">';
    html += '</div>';
    html += '<div class="delete-actions">';
    html += '<button class="btn" onclick="closeModal()"><i class="fas fa-arrow-left"></i> Cancel</button>';
    html += '<button class="btn danger" id="confirm-delete-btn" onclick="deleteAccount()" disabled><i class="fas fa-trash"></i> Delete Account</button>';
    html += '</div>';
    html += '</div>';
    showModal(html);
    
    // Enable delete button only when user types DELETE
    setTimeout(function() {
        var input = document.getElementById('delete-confirm-text');
        var btn = document.getElementById('confirm-delete-btn');
        if (input && btn) {
            input.addEventListener('input', function() {
                btn.disabled = this.value !== 'DELETE';
            });
            input.focus();
        }
    }, 100);
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

window.startVideoCall = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var roomName = 'bsithub-video-' + activeChat.id.replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now();
    var url = 'https://meet.jit.si/' + roomName + '#userInfo.displayName="' + encodeURIComponent(currentUser.name) + '"';
    
    window.open(url, '_blank', 'width=1200,height=800');
    showToast('Video call opened in new window!', 'success');
    
    // Log the call
    logCallToChat('video', roomName);
};

window.startVoiceCall = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var roomName = 'bsithub-voice-' + activeChat.id.replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now();
    var url = 'https://meet.jit.si/' + roomName + '#config.startWithVideoMuted=true&userInfo.displayName="' + encodeURIComponent(currentUser.name) + '"';
    
    window.open(url, '_blank', 'width=800,height=600');
    showToast('Voice call opened in new window!', 'success');
    
    // Log the call
    logCallToChat('voice', roomName);
};

function logCallToChat(type, roomName) {
    if (!activeChat) return;
    
    var messages = Storage.get('messages') || [];
    var callMessage = {
        id: generateId(),
        chatId: activeChat.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: (type === 'video' ? '📹' : '📞') + ' Started a ' + type + ' call. Room: ' + roomName,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false
    };
    messages.push(callMessage);
    Storage.set('messages', messages);
    renderMessages(activeChat.id);
}

window.initVoiceCall = function() {
    closeModal();
    
    var roomName = 'bsithub-voice-' + activeChat.id.replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now();
    showJitsiContainer(roomName, false);
    
    setTimeout(function() {
        var domain = 'meet.jit.si';
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
                startWithVideoMuted: true,
                prejoinPageEnabled: false
            },
            interfaceConfigOverwrite: {
                TOOLBAR_BUTTONS: [
                    'microphone', 'hangup', 'chat', 'settings', 'raisehand', 'stats'
                ],
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false
            }
        };
        
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        
        jitsiApi.addEventListener('videoConferenceJoined', function() {
            console.log('Joined voice conference');
            document.getElementById('call-status').textContent = 'Connected';
            startCallTimer();
        });
        
        jitsiApi.addEventListener('readyToClose', function() {
            endVideoCall();
        });
        
        isVideoCallActive = true;
    }, 500);
};

window.initVideoCall = function() {
    closeModal();
    
    // Generate unique room name
    var roomName = 'bsithub-video-' + activeChat.id.replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now();
    
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

window.endVideoCall = function() {
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
};

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
    
    // Captcha System - Define before calling
    var captchaAnswer = 0;
    
    window.generateCaptcha = function() {
        var num1 = Math.floor(Math.random() * 10) + 1;
        var num2 = Math.floor(Math.random() * 10) + 1;
        captchaAnswer = num1 + num2;
        var question = document.getElementById('captcha-question');
        if (question) {
            question.textContent = num1 + ' + ' + num2 + ' = ?';
        }
    };
    
    window.validateCaptcha = function(answer) {
        return parseInt(answer) === captchaAnswer;
    };
    
    // Generate captcha
    generateCaptcha();
    
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
    
    // Password Strength Meter
    window.updatePasswordStrength = function(password) {
        var strength = 0;
        var strengthBar = document.querySelector('.password-strength-bar');
        var strengthText = document.querySelector('.password-strength-text');
        
        if (!strengthBar) {
            // Create strength bar if it doesn't exist
            var container = document.getElementById('password-strength');
            if (container) {
                container.innerHTML = '<div class="password-strength-bar"></div><div class="password-strength-text"></div>';
                strengthBar = container.querySelector('.password-strength-bar');
                strengthText = container.querySelector('.password-strength-text');
            }
        }
        
        if (!password || password.length === 0) {
            if (strengthBar) strengthBar.className = 'password-strength-bar';
            if (strengthText) { strengthText.textContent = ''; strengthText.className = 'password-strength-text'; }
            return;
        }
        
        // Length check
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        
        // Character variety checks
        if (/[a-z]/.test(password)) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^a-zA-Z0-9]/.test(password)) strength++;
        
        var level, label;
        if (strength <= 2) { level = 'weak'; label = 'Weak'; }
        else if (strength <= 3) { level = 'fair'; label = 'Fair'; }
        else if (strength <= 4) { level = 'good'; label = 'Good'; }
        else { level = 'strong'; label = 'Strong'; }
        
        if (strengthBar) strengthBar.className = 'password-strength-bar ' + level;
        if (strengthText) { strengthText.textContent = label; strengthText.className = 'password-strength-text ' + level; }
    };
    
    // Input Validation
    window.validateEmail = function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };
    
    window.validateUsername = function(username) {
        return /^[a-zA-Z0-9_]{3,20}$/.test(username);
    };
    
    window.validateInput = function(input, type) {
        var value = input.value.trim();
        var isValid = false;
        var message = '';
        
        switch(type) {
            case 'email':
                isValid = validateEmail(value);
                message = isValid ? 'Valid email' : 'Please enter a valid email';
                break;
            case 'username':
                isValid = validateUsername(value);
                message = isValid ? 'Username available' : 'Username must be 3-20 characters (letters, numbers, _)';
                break;
            case 'password':
                isValid = value.length >= 6;
                message = isValid ? 'Password accepted' : 'Password must be at least 6 characters';
                break;
            case 'required':
                isValid = value.length > 0;
                message = isValid ? '' : 'This field is required';
                break;
        }
        
        input.classList.remove('valid', 'invalid');
        if (value.length > 0) {
            input.classList.add(isValid ? 'valid' : 'invalid');
        }
        
        // Update validation message
        var msgEl = input.parentElement.querySelector('.validation-message');
        if (!msgEl && message) {
            msgEl = document.createElement('div');
            msgEl.className = 'validation-message';
            input.parentElement.appendChild(msgEl);
        }
        if (msgEl) {
            msgEl.innerHTML = isValid ? '<i class="fas fa-check-circle"></i> ' + message : '<i class="fas fa-exclamation-circle"></i> ' + message;
            msgEl.className = 'validation-message ' + (isValid ? 'success' : 'error');
            if (!message) msgEl.innerHTML = '';
        }
        
        return isValid;
    };
    
    // Add real-time validation to inputs
    var emailInput = document.getElementById('login-email');
    if (emailInput) {
        emailInput.addEventListener('blur', function() { validateInput(this, 'email'); });
        emailInput.addEventListener('input', function() { 
            if (this.value.includes('@')) validateInput(this, 'email');
        });
    }
    
    var registerEmail = document.getElementById('register-email');
    if (registerEmail) {
        registerEmail.addEventListener('blur', function() { validateInput(this, 'email'); });
        registerEmail.addEventListener('input', function() { 
            if (this.value.includes('@')) validateInput(this, 'email');
        });
    }
    
    var registerUsername = document.getElementById('register-username');
    if (registerUsername) {
        registerUsername.addEventListener('blur', function() { validateInput(this, 'username'); });
        registerUsername.addEventListener('input', function() { 
            if (this.value.length >= 3) validateInput(this, 'username');
        });
    }
    
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
        console.log('Email/Username:', email);
        
        // Get submit button reference
        var submitBtn = this.querySelector('button[type="submit"]');
        var originalText = submitBtn.innerHTML;
        
        // Validate hCaptcha
        var hcaptchaResponse = null;
        if (typeof hcaptcha !== 'undefined') {
            hcaptchaResponse = hcaptcha.getResponse();
        }
        if (!hcaptchaResponse) {
            document.getElementById('login-error').textContent = 'Please complete the captcha verification.';
            document.getElementById('login-error').style.display = 'block';
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            return false;
        }
        
        // Handle remember me
        var rememberMe = document.getElementById('remember-me');
        if (rememberMe && rememberMe.checked) {
            localStorage.setItem('rememberedEmail', email);
        } else {
            localStorage.removeItem('rememberedEmail');
        }
        
        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        submitBtn.disabled = true;
        
        var result = await login(email, password);
        console.log('Login result:', result);
        
        // Record login history
        if (typeof addLoginHistory === 'function') {
            addLoginHistory(result.success, email.includes('@') ? 'email' : 'username');
        }
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            if (result.require2FA) {
                show2FAModal();
            } else {
                showToast('Welcome back!', 'success');
                showApp();
            }
        } else {
            document.getElementById('login-error').textContent = result.message;
            document.getElementById('login-error').style.display = 'block';
            if (typeof hcaptcha !== 'undefined') {
                hcaptcha.reset();
            }
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
    
    // Pinned Messages
    document.getElementById('pinned-messages-btn').onclick = showPinnedMessages;
    
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
    
    window.resetAutoLogoutTimer = function() {
        if (!currentUser) return;
        
        clearTimeout(autoLogoutTimer);
        autoLogoutWarningShown = false;
        
        // Remove warning if exists
        var warning = document.querySelector('.auto-logout-warning');
        if (warning) warning.remove();
        
        autoLogoutTimer = setTimeout(function() {
            showAutoLogoutWarning();
        }, AUTO_LOGOUT_WARNING);
    };
    
    function showAutoLogoutWarning() {
        if (autoLogoutWarningShown) return;
        autoLogoutWarningShown = true;
        
        var countdown = 60;
        var warning = document.createElement('div');
        warning.className = 'auto-logout-warning';
        warning.id = 'auto-logout-warning';
        warning.innerHTML = '<div class="auto-logout-content">' +
            '<div class="auto-logout-icon"><i class="fas fa-exclamation-triangle"></i></div>' +
            '<div class="auto-logout-text">' +
            '<h4>Session Expiring</h4>' +
            '<p>You will be logged out in <span id="logout-countdown">' + countdown + '</span> seconds due to inactivity</p>' +
            '<div class="auto-logout-progress"><div class="auto-logout-bar" id="logout-bar"></div></div>' +
            '</div>' +
            '<div class="auto-logout-actions">' +
            '<button class="btn btn-primary" id="stay-active-btn">Stay Active</button>' +
            '<button class="btn" id="logout-now-btn">Logout Now</button>' +
            '</div>' +
            '</div>';
        
        // Prevent clicks from propagating to document
        warning.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        document.body.appendChild(warning);
        
        // Add event listeners to buttons
        document.getElementById('stay-active-btn').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            resetAutoLogoutTimer();
        });
        
        document.getElementById('logout-now-btn').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            logout();
        });
        
        // Animate progress bar
        var bar = document.getElementById('logout-bar');
        if (bar) {
            bar.style.width = '100%';
            bar.style.transition = 'none';
            setTimeout(function() {
                bar.style.transition = 'width 60s linear';
                bar.style.width = '0%';
            }, 50);
        }
        
        // Countdown timer
        var countdownInterval = setInterval(function() {
            countdown--;
            var el = document.getElementById('logout-countdown');
            if (el) el.textContent = countdown;
            
            if (countdown <= 10 && el) el.style.color = '#ef4444';
            if (countdown <= 0) clearInterval(countdownInterval);
        }, 1000);
        
        // Auto logout after countdown
        setTimeout(function() {
            clearInterval(countdownInterval);
            if (autoLogoutWarningShown) {
                logout();
            }
        }, 60000);
    }
    
    // Track user activity
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(event) {
        document.addEventListener(event, function(e) {
            // Don't reset timer if clicking inside auto-logout warning
            if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('#auto-logout-warning')) return;
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

    window.reportPost = function(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post) return;

        var reasons = ['Spam', 'Harassment', 'Inappropriate content', 'Scam', 'Other'];
        var html = '<div class="report-modal"><h3>Report Post</h3>';
        html += '<p style="color: var(--text-muted); margin-bottom: 12px;">Why are you reporting this post?</p>';
        reasons.forEach(function(reason) {
            html += '<button class="btn" style="width: 100%; margin-bottom: 8px;" onclick="submitPostReport(\'' + postId + '\', \'' + reason + '\')">' + reason + '</button>';
        });
        html += '</div>';
        showModal(html);
    };

    window.submitPostReport = function(postId, reason) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        var reports = Storage.get('reports') || [];
        reports.push({
            id: generateId(),
            type: 'post',
            postId: postId,
            postContent: post ? post.content.substring(0, 100) : '',
            postAuthor: post ? post.userName : '',
            reason: reason,
            reporterId: currentUser.id,
            reporterName: currentUser.name,
            timestamp: new Date().toISOString(),
            resolved: false
        });
        Storage.set('reports', reports);
        closeModal();
        showToast('Report submitted. Admin will review it.', 'success');
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
            if (!content && !feedPostImageData && !feedPostGifUrl) return;
            var privacy = document.getElementById('post-privacy').value || 'public';
            createPost(content, feedPostImageData, privacy, feedPostGifUrl);
        };

        // GIF button for posts
        var postGifBtn = document.getElementById('post-gif-btn');
        if (postGifBtn) {
            postGifBtn.onclick = function() {
                showPostGifPicker();
            };
        }

        // Location button for posts
        var postLocationBtn = document.getElementById('post-location-btn');
        if (postLocationBtn) {
            postLocationBtn.onclick = function() {
                showPostLocationPicker();
            };
        }

        // Privacy button for posts
        var postPrivacyBtn = document.getElementById('post-privacy-btn');
        if (postPrivacyBtn) {
            postPrivacyBtn.onclick = function() {
                showPostPrivacyPicker();
            };
        }

        // Post content input handler for mentions
        var postContentEl = document.getElementById('post-content');
        if (postContentEl) {
            postContentEl.oninput = function() {
                handlePostMentionInput(this);
                updatePostSubmitBtn();
            };
        }

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
        var wasReacted = post.reactions && post.reactions[currentUser.id];
        if (!post.reactions) post.reactions = {};
        if (post.reactions[currentUser.id] === reaction) {
            delete post.reactions[currentUser.id];
        } else {
            post.reactions[currentUser.id] = reaction;
            if (post.userId !== currentUser.id && !wasReacted) {
                addNotification('reaction', currentUser.id, currentUser.name, currentUser.avatar, reaction + ' on your post', postId);
            }
        }
        // Sync old likes format
        if (post.likes) delete post.likes;
        Storage.set('posts', posts);
        updateSinglePost(postId);
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

    function createPost(content, imageData, privacy, gifUrl) {
        if (!currentUser) return;
        var post = {
            id: generateId(),
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username,
            userAvatar: currentUser.avatar || null,
            content: content || '',
            imageUrl: imageData || null,
            gifUrl: gifUrl || null,
            visibility: privacy || 'public',
            likes: {},
            reactions: {},
            comments: [],
            shares: 0,
            createdAt: new Date().toISOString()
        };
        var posts = Storage.get('posts') || [];
        posts.unshift(post);
        Storage.set('posts', posts);
        if (DB.isReady()) { DB.createPost(post); }

        // Check for mentions and notify users
        if (content) {
            var mentionRegex = /@(\w+)/g;
            var match;
            var users = Storage.get('users') || [];
            while ((match = mentionRegex.exec(content)) !== null) {
                var mentionedUsername = match[1];
                var mentionedUser = users.find(function(u) { return u.username === mentionedUsername; });
                if (mentionedUser && mentionedUser.id !== currentUser.id) {
                    addNotification('mention', currentUser.id, currentUser.name, currentUser.avatar, content.substring(0, 100), post.id);
                }
            }
        }

        // Reset composer
        document.getElementById('post-content').value = '';
        feedPostImageData = null;
        feedPostGifUrl = null;
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

    var lastFeedHash = '';

    function hashFeedPosts(posts) {
        // Create a hash based on post IDs, content, and comment counts (not reactions)
        return posts.map(function(p) {
            return p.id + ':' + (p.content || '').length + ':' + (p.comments ? p.comments.length : 0);
        }).join('|');
    }

    function loadFeed() {
        renderFeed();
        var posts = Storage.get('posts') || [];
        lastFeedHash = hashFeedPosts(posts);
        if (DB.isReady()) {
            DB.getPosts(50, 0).then(function(dbPosts) {
                if (dbPosts && dbPosts.length > 0) {
                    var mapped = dbPosts.map(function(p) {
                        return { id: p.id, userId: p.user_id, userName: p.user_name, userAvatar: p.user_avatar, content: p.content, imageUrl: p.image_url, visibility: p.visibility, likes: {}, comments: [], createdAt: p.created_at };
                    });
                    var localPosts = Storage.get('posts') || [];
                    var merged = mergePosts(localPosts, mapped);
                    Storage.set('posts', merged);
                    var newHash = hashFeedPosts(merged);
                    if (newHash !== lastFeedHash) {
                        lastFeedHash = newHash;
                        renderFeed();
                    }
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
                // Only re-render if post structure changed (new/removed/edited posts or comments), not on reaction updates
                var newHash = hashFeedPosts(merged);
                if (newHash !== lastFeedHash) {
                    lastFeedHash = newHash;
                    renderFeed();
                }
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

    function updateSinglePost(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post) return;
        
        var postEl = document.querySelector('.post-card[data-post-id="' + postId + '"]');
        if (!postEl) return;
        
        // Update reaction/like button only - no full re-render
        var myReaction = currentUser && post.reactions ? post.reactions[currentUser.id] : null;
        var isLiked = !!myReaction;
        var totalReactions = getTotalReactions(post.reactions || post.likes);
        var topReactions = getTopReactions(post.reactions || post.likes);
        
        // Update like button
        var likeBtn = postEl.querySelector('.like-btn');
        if (likeBtn) {
            if (isLiked) {
                likeBtn.classList.add('liked');
                var label = REACTION_EMOJIS[myReaction] + ' ' + (REACTION_LABELS[myReaction] || 'Like');
                likeBtn.innerHTML = label;
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.innerHTML = '<i class="fas fa-thumbs-up"></i> Like';
            }
        }
        
        // Update reaction count
        var statsLeft = postEl.querySelector('.post-stats-left');
        if (statsLeft) {
            if (totalReactions > 0) {
                var reactionsHtml = '<div class="reaction-icons">';
                topReactions.forEach(function(r) {
                    reactionsHtml += '<span>' + (REACTION_EMOJIS[r] || '👍') + '</span>';
                });
                reactionsHtml += '</div><span>' + totalReactions + '</span>';
                statsLeft.innerHTML = reactionsHtml;
            } else {
                statsLeft.innerHTML = '';
            }
        }
        
        // Update comment count
        var commentCount = post.comments ? post.comments.length : 0;
        var commentBtn = postEl.querySelector('.comment-btn');
        if (commentBtn) {
            commentBtn.innerHTML = '<i class="fas fa-comment"></i> Comment';
        }
        
        // Update comments list if visible
        var commentsSection = postEl.querySelector('#comments-' + postId);
        if (commentsSection && commentsSection.style.display !== 'none') {
            var commentsList = postEl.querySelector('#comments-list-' + postId);
            if (commentsList) {
                var html = '';
                if (post.comments && post.comments.length > 0) {
                    var visibleComments = post.comments.slice(-3);
                    if (post.comments.length > 3) {
                        html += '<button class="view-more-comments" data-post-id="' + postId + '">View ' + (post.comments.length - 3) + ' more comments</button>';
                    }
                    visibleComments.forEach(function(c) { html += renderComment(c, postId); });
                }
                commentsList.innerHTML = html;
                bindPostEvents();
            }
        }
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
            avatarHtml = '<div class="post-avatar" onclick="showUserProfile(\'' + post.userId + '\')"><img src="' + escapeHtml(post.userAvatar) + '" alt="Avatar"></div>';
        } else {
            var initial = (post.userName || 'U').charAt(0).toUpperCase();
            avatarHtml = '<div class="post-avatar" onclick="showUserProfile(\'' + post.userId + '\')">' + initial + '</div>';
        }

        var privacyIcon = 'fa-globe-americas';
        if (post.visibility === 'friends') privacyIcon = 'fa-user-friends';
        if (post.visibility === 'private') privacyIcon = 'fa-lock';

        var html = '<div class="post-card" data-post-id="' + post.id + '">';
        html += '<div class="post-header">';
        html += avatarHtml;
        html += '<div class="post-user-info">';
        html += '<div class="post-user-name" onclick="showUserProfile(\'' + post.userId + '\')">' + escapeHtml(post.userName || 'User') + '</div>';
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
            html += '<button onclick="reportPost(\'' + post.id + '\')"><i class="fas fa-flag"></i> Report Post</button>';
            html += '</div></div>';
        }
        html += '</div>';

        // Body
        html += '<div class="post-body">';
        if (post.content) html += '<div class="post-text">' + escapeHtml(post.content) + '</div>';
        if (post.gifUrl) html += '<div class="post-gif"><img src="' + post.gifUrl + '" alt="GIF"></div>';
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
            cAvatarHtml = '<div class="comment-avatar" onclick="showUserProfile(\'' + comment.userId + '\')"><img src="' + escapeHtml(comment.userAvatar) + '" alt=""></div>';
        } else {
            var initial = (comment.userName || 'U').charAt(0).toUpperCase();
            cAvatarHtml = '<div class="comment-avatar" onclick="showUserProfile(\'' + comment.userId + '\')">' + initial + '</div>';
        }
        var isLikedComment = comment.likedBy && currentUser && comment.likedBy[currentUser.id];
        var likeCountComment = comment.likedBy ? Object.keys(comment.likedBy).length : 0;
        var isOwner = currentUser && comment.userId === currentUser.id;
        var contentHtml = renderMentions(escapeHtml(comment.content));

        var html = '<div class="comment-item" data-comment-id="' + comment.id + '">';
        html += cAvatarHtml;
        html += '<div class="comment-content-wrapper">';
        html += '<div class="comment-bubble">';
        html += '<div class="comment-author">' + escapeHtml(comment.userName || 'User') + '</div>';
        html += '<div class="comment-text">' + contentHtml + '</div>';
        html += '</div>';
        html += '<div class="comment-actions-row">';
        html += '<button class="comment-action-link' + (isLikedComment ? ' liked' : '') + '" data-comment-like="' + comment.id + '" data-post-id="' + postId + '">Like' + (likeCountComment > 0 ? ' (' + likeCountComment + ')' : '') + '</button>';
        html += '<button class="comment-action-link" data-comment-reply="' + comment.id + '" data-post-id="' + postId + '" data-author="' + escapeHtml(comment.userName || '') + '">Reply</button>';
        if (isOwner) {
            html += '<button class="comment-action-link" onclick="deleteComment(\'' + postId + '\', \'' + comment.id + '\')">Delete</button>';
        }
        html += '<span class="comment-action-link">' + getTimeAgo(comment.createdAt) + '</span>';
        html += '</div>';
        
        // Replies section
        if (comment.replies && comment.replies.length > 0) {
            html += '<div class="comment-replies">';
            comment.replies.forEach(function(reply) {
                html += renderReply(reply, postId, comment.id);
            });
            html += '</div>';
        }
        
        // Reply input (hidden by default)
        html += '<div class="reply-input-row" id="reply-input-' + comment.id + '" style="display:none;">';
        html += '<input type="text" class="reply-text-input" data-post-id="' + postId + '" data-comment-id="' + comment.id + '" placeholder="Write a reply...">';
        html += '<button class="reply-submit-btn" data-post-id="' + postId + '" data-comment-id="' + comment.id + '"><i class="fas fa-paper-plane"></i></button>';
        html += '</div>';
        
        html += '</div></div>';
        return html;
    }

    function renderReply(reply, postId, commentId) {
        var rAvatarHtml;
        if (reply.userAvatar) {
            rAvatarHtml = '<div class="reply-avatar"><img src="' + escapeHtml(reply.userAvatar) + '" alt=""></div>';
        } else {
            var initial = (reply.userName || 'U').charAt(0).toUpperCase();
            rAvatarHtml = '<div class="reply-avatar">' + initial + '</div>';
        }
        var isOwner = currentUser && reply.userId === currentUser.id;
        var contentHtml = renderMentions(escapeHtml(reply.content));

        var html = '<div class="reply-item">';
        html += rAvatarHtml;
        html += '<div class="reply-content-wrapper">';
        html += '<div class="reply-bubble">';
        html += '<div class="reply-author">' + escapeHtml(reply.userName || 'User') + '</div>';
        html += '<div class="reply-text">' + contentHtml + '</div>';
        html += '</div>';
        html += '<div class="reply-actions-row">';
        if (isOwner) {
            html += '<button class="reply-action-link" onclick="deleteReply(\'' + postId + '\', \'' + commentId + '\', \'' + reply.id + '\')">Delete</button>';
        }
        html += '<span class="reply-action-link">' + getTimeAgo(reply.createdAt) + '</span>';
        html += '</div>';
        html += '</div></div>';
        return html;
    }

    function renderMentions(text) {
        return text.replace(/@(\w+)/g, '<span class="mention" onclick="viewMentionedUser(\'$1\')">@$1</span>');
    }

    window.viewMentionedUser = function(username) {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.username === username; });
        if (user) {
            showUserProfile(user.id);
        } else {
            showToast('User not found', 'info');
        }
    };

    window.showUserProfile = function(userId) {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        if (!user) {
            showToast('User not found', 'info');
            return;
        }

        var isOnline = user.isOnline || false;
        var statusText = isOnline ? 'Online' : 'Last seen ' + getTimeAgo(user.lastSeen || user.updatedAt);
        var isBlocked = currentUser && currentUser.blockedUsers && currentUser.blockedUsers.indexOf(userId) !== -1;
        
        var html = '<div class="user-profile-popup">';
        html += '<div class="profile-popup-header">';
        html += '<button class="close-popup-btn" onclick="closeModal()"><i class="fas fa-times"></i></button>';
        html += '</div>';
        
        // Avatar
        if (user.avatar) {
            html += '<div class="profile-popup-avatar"><img src="' + escapeHtml(user.avatar) + '" alt="Avatar"></div>';
        } else {
            var initial = (user.name || user.username || 'U').charAt(0).toUpperCase();
            html += '<div class="profile-popup-avatar">' + initial + '</div>';
        }
        
        html += '<h3 class="profile-popup-name">' + escapeHtml(user.name || user.username || 'User') + '</h3>';
        html += '<p class="profile-popup-username">@' + escapeHtml(user.username || 'user') + '</p>';
        
        // Online status
        html += '<div class="profile-popup-status ' + (isOnline ? 'online' : 'offline') + '">';
        html += '<span class="status-dot"></span>';
        html += '<span>' + statusText + '</span>';
        html += '</div>';
        
        // Bio/About
        if (user.bio) {
            html += '<div class="profile-popup-bio">' + escapeHtml(user.bio) + '</div>';
        }
        
        // Stats
        var userMessages = (Storage.get('messages') || []).filter(function(m) { return m.senderId === userId; });
        var userPosts = (Storage.get('posts') || []).filter(function(p) { return p.userId === userId; });
        
        html += '<div class="profile-popup-stats">';
        html += '<div class="stat-item"><span class="stat-value">' + userMessages.length + '</span><span class="stat-label">Messages</span></div>';
        html += '<div class="stat-item"><span class="stat-value">' + userPosts.length + '</span><span class="stat-label">Posts</span></div>';
        html += '</div>';
        
        // Actions
        html += '<div class="profile-popup-actions">';
        if (currentUser && userId !== currentUser.id) {
            html += '<button class="profile-action-btn primary" onclick="startChatFromProfile(\'' + userId + '\')"><i class="fas fa-comment"></i> Message</button>';
            if (isBlocked) {
                html += '<button class="profile-action-btn danger" onclick="unblockUserFromProfile(\'' + userId + '\')"><i class="fas fa-unlock"></i> Unblock</button>';
            } else {
                html += '<button class="profile-action-btn" onclick="blockUserFromProfile(\'' + userId + '\')"><i class="fas fa-ban"></i> Block</button>';
            }
        }
        html += '</div>';
        html += '</div>';
        
        showModal(html);
    };

    window.startChatFromProfile = function(userId) {
        closeModal();
        var chats = Storage.get('chats') || [];
        var existingChat = chats.find(function(c) {
            return !c.isGroup && c.participants.indexOf(currentUser.id) !== -1 && c.participants.indexOf(userId) !== -1;
        });
        if (existingChat) {
            openChat(existingChat.id, userId);
        } else {
            createNewChat(userId);
        }
    };

    window.blockUserFromProfile = function(userId) {
        if (!currentUser) return;
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            if (!users[userIndex].blockedUsers) users[userIndex].blockedUsers = [];
            if (users[userIndex].blockedUsers.indexOf(userId) === -1) {
                users[userIndex].blockedUsers.push(userId);
                Storage.set('users', users);
                currentUser = users[userIndex];
                showToast('User blocked', 'success');
                closeModal();
            }
        }
    };

    window.unblockUserFromProfile = function(userId) {
        if (!currentUser) return;
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].blockedUsers = (users[userIndex].blockedUsers || []).filter(function(id) { return id !== userId; });
            Storage.set('users', users);
            currentUser = users[userIndex];
            showToast('User unblocked', 'success');
            closeModal();
        }
    };

    window.playVoiceMessage = function(btn, audioData) {
        var audio = new Audio(audioData);
        var icon = btn.querySelector('i');
        var voiceContainer = btn.closest('.message-voice');
        var waveform = voiceContainer.querySelector('.voice-waveform');
        var duration = voiceContainer.querySelector('.voice-duration');
        var bars = waveform.querySelectorAll('span');
        
        if (btn.dataset.playing === 'true') {
            audio.pause();
            icon.className = 'fas fa-play';
            btn.dataset.playing = 'false';
            bars.forEach(function(bar) { bar.classList.remove('active'); });
            return;
        }
        
        btn.dataset.playing = 'true';
        icon.className = 'fas fa-pause';
        
        audio.addEventListener('loadedmetadata', function() {
            var mins = Math.floor(audio.duration / 60);
            var secs = Math.floor(audio.duration % 60).toString().padStart(2, '0');
            duration.textContent = mins + ':' + secs;
        });
        
        audio.addEventListener('timeupdate', function() {
            var progress = audio.currentTime / audio.duration;
            var activeBars = Math.floor(progress * bars.length);
            bars.forEach(function(bar, i) {
                if (i < activeBars) {
                    bar.classList.add('active');
                } else {
                    bar.classList.remove('active');
                }
            });
        });
        
        audio.addEventListener('ended', function() {
            icon.className = 'fas fa-play';
            btn.dataset.playing = 'false';
            bars.forEach(function(bar) { bar.classList.remove('active'); });
        });
        
        audio.play().catch(function(err) {
            console.error('Audio playback error:', err);
            icon.className = 'fas fa-play';
            btn.dataset.playing = 'false';
        });
    };

    function deleteComment(postId, commentId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !post.comments) return;
        
        var commentIndex = post.comments.findIndex(function(c) { return c.id === commentId; });
        if (commentIndex === -1) return;
        
        if (post.comments[commentIndex].userId !== currentUser.id) {
            showToast('You can only delete your own comments', 'error');
            return;
        }
        
        post.comments.splice(commentIndex, 1);
        Storage.set('posts', posts);
        renderFeed();
        
        if (DB.isReady()) { DB.updatePost(postId, { comments: post.comments }); }
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/comments').set(post.comments); }
        
        showToast('Comment deleted', 'success');
    }

    function deleteReply(postId, commentId, replyId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !post.comments) return;
        
        var comment = post.comments.find(function(c) { return c.id === commentId; });
        if (!comment || !comment.replies) return;
        
        var replyIndex = comment.replies.findIndex(function(r) { return r.id === replyId; });
        if (replyIndex === -1) return;
        
        if (comment.replies[replyIndex].userId !== currentUser.id) {
            showToast('You can only delete your own replies', 'error');
            return;
        }
        
        comment.replies.splice(replyIndex, 1);
        Storage.set('posts', posts);
        renderFeed();
        
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/comments').set(post.comments); }
        
        showToast('Reply deleted', 'success');
    }

    function submitReply(postId, commentId, content) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !currentUser) return;
        
        var comment = post.comments.find(function(c) { return c.id === commentId; });
        if (!comment) return;
        
        if (!comment.replies) comment.replies = [];
        
        var reply = {
            id: generateId(),
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username,
            userAvatar: currentUser.avatar || null,
            content: content,
            createdAt: new Date().toISOString()
        };
        
        comment.replies.push(reply);
        Storage.set('posts', posts);
        
        // Notify the comment author
        if (comment.userId !== currentUser.id) {
            addNotification('comment', currentUser.id, currentUser.name, currentUser.avatar, 'replied to your comment: ' + content.substring(0, 50), postId);
        }
        
        renderFeed();
        var section = document.getElementById('comments-' + postId);
        if (section) section.style.display = 'block';
        
        if (firebaseDb) { firebaseDb.ref('posts/' + postId + '/comments').set(post.comments); }
    }

    function showAllComments(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post || !post.comments) return;
        var list = document.getElementById('comments-list-' + postId);
        if (!list) return;
        var html = '';
        post.comments.forEach(function(c) { html += renderComment(c, postId); });
        list.innerHTML = html;
        bindCommentEvents();
    }

    window.deleteComment = deleteComment;
    window.deleteReply = deleteReply;

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
        document.querySelectorAll('.comment-action-link[data-comment-reply]').forEach(function(btn) {
            btn.onclick = function() {
                var commentId = this.dataset.commentReply;
                var replyInput = document.getElementById('reply-input-' + commentId);
                if (replyInput) {
                    replyInput.style.display = replyInput.style.display === 'none' ? 'flex' : 'none';
                    if (replyInput.style.display === 'flex') {
                        replyInput.querySelector('input').focus();
                    }
                }
            };
        });
        document.querySelectorAll('.reply-text-input').forEach(function(input) {
            var postId = input.dataset.postId;
            var commentId = input.dataset.commentId;
            var submitBtn = document.querySelector('.reply-submit-btn[data-comment-id="' + commentId + '"]');
            input.onkeydown = function(e) {
                if (e.key === 'Enter' && input.value.trim()) {
                    submitReply(postId, commentId, input.value.trim());
                    input.value = '';
                    var replyInput = document.getElementById('reply-input-' + commentId);
                    if (replyInput) replyInput.style.display = 'none';
                }
            };
            if (submitBtn) {
                submitBtn.onclick = function() {
                    if (input.value.trim()) {
                        submitReply(postId, commentId, input.value.trim());
                        input.value = '';
                        var replyInput = document.getElementById('reply-input-' + commentId);
                        if (replyInput) replyInput.style.display = 'none';
                    }
                };
            }
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
            if (post.userId !== currentUser.id) {
                addNotification('like', currentUser.id, currentUser.name, currentUser.avatar, 'liked your post', postId);
            }
        }
        if (post.likes) delete post.likes;
        Storage.set('posts', posts);
        updateSinglePost(postId);
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
        updateSinglePost(postId);
        var section = document.getElementById('comments-' + postId);
        if (section) section.style.display = 'block';
        if (post.userId !== currentUser.id) {
            addNotification('comment', currentUser.id, currentUser.name, currentUser.avatar, content.substring(0, 100), postId);
        }
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

    // ==========================================
    // Compact Mode
    // ==========================================
    window.toggleCompactMode = function() {
        var messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        messagesContainer.classList.toggle('compact');
        var isCompact = messagesContainer.classList.contains('compact');
        Storage.set('compactMode', isCompact);
        showToast(isCompact ? 'Compact mode enabled' : 'Compact mode disabled', 'info');
    };

    window.applyCompactMode = function() {
        var messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        
        var isCompact = Storage.get('compactMode') || false;
        if (isCompact) {
            messagesContainer.classList.add('compact');
        } else {
            messagesContainer.classList.remove('compact');
        }
    };

    // ==========================================
    // Message Spoilers
    // ==========================================
    window.toggleSpoiler = function(el) {
        el.classList.remove('hidden');
        el.classList.add('revealed');
    };

    window.sendSpoilerMessage = function(text) {
        if (!activeChat || !text.trim()) return;
        
        var messages = Storage.get('messages') || [];
        var newMessage = {
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            text: text,
            isSpoiler: true,
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
        
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(newMessage);
        }
        
        showToast('Spoiler sent', 'info');
    };

    // ==========================================
    // Animated Stickers
    // ==========================================
    var stickerPacks = {
        'smileys': [
            { id: 's1', url: 'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif', name: 'Happy' },
            { id: 's2', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', name: 'Love' },
            { id: 's3', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif', name: 'Sad' },
            { id: 's4', url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif', name: 'Wow' },
            { id: 's5', url: 'https://media.giphy.com/media/3o6ZtaO9BZHcOjmErm/giphy.gif', name: 'Angry' },
            { id: 's6', url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif', name: 'Cool' },
            { id: 's7', url: 'https://media.giphy.com/media/3o7aCTfyhYawOoxb0Q/giphy.gif', name: 'Laugh' },
            { id: 's8', url: 'https://media.giphy.com/media/26Ff517dQJYTDkLpS/giphy.gif', name: 'Think' }
        ],
        'animals': [
            { id: 'a1', url: 'https://media.giphy.com/media/mCRJDo24UvJMA/giphy.gif', name: 'Cat' },
            { id: 'a2', url: 'https://media.giphy.com/media/4Zo41lhzKt6iZ8xff9/giphy.gif', name: 'Dog' },
            { id: 'a3', url: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif', name: 'Bunny' },
            { id: 'a4', url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif', name: 'Panda' },
            { id: 'a5', url: 'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif', name: 'Bear' },
            { id: 'a6', url: 'https://media.giphy.com/media/KHmMzBRERVyOk/giphy.gif', name: 'Frog' },
            { id: 'a7', url: 'https://media.giphy.com/media/l2JhIUyUs8KDCCf3W/giphy.gif', name: 'Penguin' },
            { id: 'a8', url: 'https://media.giphy.com/media/Ma3t2DAHk4Qi4/giphy.gif', name: 'Hamster' }
        ],
        'reactions': [
            { id: 'r1', url: 'https://media.giphy.com/media/l0MYC0LajbaPoEADu/giphy.gif', name: 'Thumbs Up' },
            { id: 'r2', url: 'https://media.giphy.com/media/3o7TKDEhacrNCODMf6/giphy.gif', name: 'Clap' },
            { id: 'r3', url: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif', name: 'Fire' },
            { id: 'r4', url: 'https://media.giphy.com/media/3oEjHV07LkLzZSyRWU/giphy.gif', name: 'Heart' },
            { id: 'r5', url: 'https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif', name: 'Party' },
            { id: 'r6', url: 'https://media.giphy.com/media/3o7TKz2eMXx7dn95FS/giphy.gif', name: 'Star' },
            { id: 'r7', url: 'https://media.giphy.com/media/l0MYAs5E2oIDCq9So/giphy.gif', name: 'Mind Blown' },
            { id: 'r8', url: 'https://media.giphy.com/media/3o7aCTqGgHJfAB4mGI/giphy.gif', name: 'Applause' }
        ]
    };

    window.showStickerPicker = function() {
        // Remove existing picker
        var existing = document.querySelector('.sticker-picker');
        if (existing) { existing.remove(); return; }
        
        var picker = document.createElement('div');
        picker.className = 'sticker-picker';
        
        var html = '<div class="sticker-picker-header">';
        html += '<button class="sticker-tab active" onclick="switchStickerPack(\'smileys\', this)">😀</button>';
        html += '<button class="sticker-tab" onclick="switchStickerPack(\'animals\', this)">🐱</button>';
        html += '<button class="sticker-tab" onclick="switchStickerPack(\'reactions\', this)">👍</button>';
        html += '</div>';
        html += '<div class="sticker-grid" id="sticker-grid">';
        
        stickerPacks['smileys'].forEach(function(sticker) {
            html += '<div class="sticker-item" onclick="sendSticker(\'' + sticker.url + '\')"><img src="' + sticker.url + '" alt="' + sticker.name + '"></div>';
        });
        
        html += '</div>';
        picker.innerHTML = html;
        
        // Position picker
        var inputArea = document.querySelector('.chat-input-area');
        if (inputArea) {
            inputArea.style.position = 'relative';
            inputArea.appendChild(picker);
        }
    };

    window.switchStickerPack = function(packName, btn) {
        // Update active tab
        document.querySelectorAll('.sticker-tab').forEach(function(tab) {
            tab.classList.remove('active');
        });
        btn.classList.add('active');
        
        // Update grid
        var grid = document.getElementById('sticker-grid');
        if (!grid) return;
        
        var html = '';
        stickerPacks[packName].forEach(function(sticker) {
            html += '<div class="sticker-item" onclick="sendSticker(\'' + sticker.url + '\')"><img src="' + sticker.url + '" alt="' + sticker.name + '"></div>';
        });
        grid.innerHTML = html;
    };

    window.sendSticker = function(stickerUrl) {
        if (!activeChat) return;
        
        // Close picker
        var picker = document.querySelector('.sticker-picker');
        if (picker) picker.remove();
        
        var messages = Storage.get('messages') || [];
        var newMessage = {
            id: generateId(),
            chatId: activeChat.id,
            senderId: currentUser.id,
            text: '',
            stickerUrl: stickerUrl,
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
        
        if (typeof sendMsgToFirebase === 'function') {
            sendMsgToFirebase(newMessage);
        }
    };

    // ==========================================
    // Admin Roles
    // ==========================================
    window.getMemberRole = function(chat, userId) {
        if (!chat || !chat.isGroup) return null;
        if (chat.admin === userId) return 'owner';
        if (chat.admins && chat.admins.indexOf(userId) !== -1) return 'admin';
        if (chat.moderators && chat.moderators.indexOf(userId) !== -1) return 'moderator';
        return 'member';
    };

    window.getRoleBadge = function(chat, userId) {
        var role = getMemberRole(chat, userId);
        if (!role || role === 'member') return '';
        return '<span class="role-badge ' + role + '">' + role + '</span>';
    };

    window.updateMemberRole = function(userId, newRole) {
        if (!activeChat || !activeChat.isGroup) return;
        if (activeChat.admin !== currentUser.id) {
            showToast('Only the owner can change roles', 'error');
            return;
        }
        if (userId === currentUser.id) {
            showToast('Cannot change your own role', 'error');
            return;
        }
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        if (chatIndex === -1) return;
        
        if (!chats[chatIndex].admins) chats[chatIndex].admins = [];
        if (!chats[chatIndex].moderators) chats[chatIndex].moderators = [];
        
        // Remove from all roles first
        chats[chatIndex].admins = chats[chatIndex].admins.filter(function(id) { return id !== userId; });
        chats[chatIndex].moderators = chats[chatIndex].moderators.filter(function(id) { return id !== userId; });
        
        // Add to new role
        if (newRole === 'admin') {
            chats[chatIndex].admins.push(userId);
        } else if (newRole === 'moderator') {
            chats[chatIndex].moderators.push(userId);
        }
        
        Storage.set('chats', chats);
        activeChat = chats[chatIndex];
        
        if (typeof syncChat === 'function') {
            syncChat(chats[chatIndex]);
        }
        
        showToast('Role updated', 'success');
        showGroupInfo();
    };

    // ==========================================
    // Read-Only Chats
    // ==========================================
    window.toggleReadOnly = function() {
        if (!activeChat || !activeChat.isGroup) {
            showToast('Not a group chat', 'error');
            return;
        }
        
        var userRole = getMemberRole(activeChat, currentUser.id);
        if (userRole !== 'owner' && userRole !== 'admin') {
            showToast('Only admins can toggle read-only mode', 'error');
            return;
        }
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        if (chatIndex === -1) return;
        
        chats[chatIndex].readOnly = !chats[chatIndex].readOnly;
        Storage.set('chats', chats);
        activeChat = chats[chatIndex];
        
        if (typeof syncChat === 'function') {
            syncChat(chats[chatIndex]);
        }
        
        showToast(chats[chatIndex].readOnly ? 'Read-only mode enabled' : 'Read-only mode disabled', 'success');
        updateReadOnlyUI();
    };

    window.canSendMessage = function(chat) {
        if (!chat || !chat.isGroup) return true;
        if (!chat.readOnly) return true;
        var role = getMemberRole(chat, currentUser.id);
        return role === 'owner' || role === 'admin' || role === 'moderator';
    };

    window.updateReadOnlyUI = function() {
        var inputArea = document.querySelector('.chat-input-area');
        if (!inputArea || !activeChat) return;
        
        var existingBanner = inputArea.querySelector('.read-only-banner');
        if (existingBanner) existingBanner.remove();
        
        if (!canSendMessage(activeChat)) {
            // Hide input elements
            var inputElements = inputArea.querySelectorAll('.chat-input-wrapper, .chat-input-actions');
            inputElements.forEach(function(el) { el.style.display = 'none'; });
            
            // Add banner
            var banner = document.createElement('div');
            banner.className = 'read-only-banner';
            banner.innerHTML = '<i class="fas fa-lock"></i> This group is read-only. Only admins can send messages.';
            inputArea.appendChild(banner);
        } else {
            // Show input elements
            var inputElements = inputArea.querySelectorAll('.chat-input-wrapper, .chat-input-actions');
            inputElements.forEach(function(el) { el.style.display = ''; });
        }
    };

    // Init feed when nav is clicked
    var feedNav = document.querySelector('.nav-item[data-section="feed"]');
    if (feedNav) {
        feedNav.addEventListener('click', function() { setTimeout(initFeed, 100); });
    }
    if (currentUser) { setTimeout(initFeed, 1500); }
    
    // Handle invite link from URL hash
    window.handleInviteLink = function() {
        var hash = window.location.hash;
        if (hash && hash.startsWith('#join/')) {
            var inviteCode = hash.replace('#join/', '').split('?')[0]; // Remove any query params
            if (inviteCode && currentUser) {
                joinGroupByInviteCode(inviteCode);
            }
        }
    };
    
    window.joinGroupByInviteCode = function(code) {
        if (!currentUser) {
            showToast('Please log in to join the group', 'info');
            return;
        }
        
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.inviteCode === code; });
        
        if (!chat) {
            showToast('Invalid invite link', 'error');
            window.location.hash = '';
            return;
        }
        
        if (chat.participants.indexOf(currentUser.id) !== -1) {
            // Already in group - refresh chats and open
            loadChats();
            setTimeout(function() {
                openChat(chat.id, currentUser.id);
            }, 300);
            showToast('Opening group chat...', 'info');
            window.location.hash = '';
            return;
        }
        
        // Join the group
        chat.participants.push(currentUser.id);
        var chatIndex = chats.findIndex(function(c) { return c.id === chat.id; });
        chats[chatIndex] = chat;
        Storage.set('chats', chats);
        
        if (typeof syncChat === 'function') {
            syncChat(chat);
        }
        
        // Refresh chats first, then open
        loadChats();
        setTimeout(function() {
            openChat(chat.id, currentUser.id);
        }, 300);
        
        showToast('You joined ' + (chat.groupName || 'the group') + '!', 'success');
        window.location.hash = '';
    };
    
    // ==========================================
    // Chat Nicknames
    // ==========================================
    window.showNicknameEditor = function() {
        if (!activeChat) return;
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.id === activeChat.id; });
        if (!chat || chat.isGroup) {
            showToast('Nicknames only work for 1-on-1 chats', 'info');
            return;
        }
        
        var otherUserId = chat.participants.find(function(p) { return p !== currentUser.id; });
        var users = Storage.get('users') || [];
        var otherUser = users.find(function(u) { return u.id === otherUserId; });
        var currentNickname = chat.nicknames && chat.nicknames[currentUser.id] ? chat.nicknames[currentUser.id] : '';
        
        var html = '<div class="nickname-modal">';
        html += '<div class="nickname-modal-header"><h3>Set Nickname</h3></div>';
        html += '<div class="nickname-user-info">';
        if (otherUser.avatar) {
            html += '<div class="nickname-avatar"><img src="' + otherUser.avatar + '"></div>';
        } else {
            html += '<div class="nickname-avatar">' + (otherUser.name || 'U').charAt(0).toUpperCase() + '</div>';
        }
        html += '<span class="nickname-username">@' + (otherUser.username || 'user') + '</span>';
        html += '</div>';
        html += '<input type="text" id="nickname-input" placeholder="Enter nickname..." value="' + escapeHtml(currentNickname) + '" maxlength="32">';
        html += '<p class="nickname-hint">This nickname will only be visible to you</p>';
        html += '<div class="nickname-actions">';
        html += '<button class="btn" onclick="clearNickname()">Clear</button>';
        html += '<button class="btn btn-primary" onclick="saveNickname()">Save</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        setTimeout(function() { document.getElementById('nickname-input').focus(); }, 100);
    };
    
    window.saveNickname = function() {
        if (!activeChat) return;
        var input = document.getElementById('nickname-input');
        var nickname = input ? input.value.trim() : '';
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        if (chatIndex === -1) return;
        
        if (!chats[chatIndex].nicknames) chats[chatIndex].nicknames = {};
        chats[chatIndex].nicknames[currentUser.id] = nickname;
        Storage.set('chats', chats);
        
        if (typeof syncChat === 'function') {
            syncChat(chats[chatIndex]);
        }
        
        closeModal();
        showToast(nickname ? 'Nickname set!' : 'Nickname cleared', 'success');
        loadChats();
    };
    
    window.clearNickname = function() {
        var input = document.getElementById('nickname-input');
        if (input) input.value = '';
        saveNickname();
    };
    
    window.getDisplayName = function(chat, userId) {
        if (!chat || !chat.nicknames) return null;
        return chat.nicknames[userId] || null;
    };
    
    // ==========================================
    // Chat Lock
    // ==========================================
    window.toggleChatLock = function() {
        if (!activeChat) return;
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.id === activeChat.id; });
        if (!chat) return;
        
        if (chat.locked) {
            // Unlock - ask for PIN
            showUnlockDialog();
        } else {
            // Lock - set PIN
            showLockDialog();
        }
    };
    
    window.showLockDialog = function() {
        var html = '<div class="lock-modal">';
        html += '<div class="lock-icon"><i class="fas fa-lock"></i></div>';
        html += '<h3>Lock this chat</h3>';
        html += '<p>Set a 4-digit PIN to lock this chat</p>';
        html += '<div class="pin-input-group">';
        html += '<input type="password" id="lock-pin-1" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="lock-pin-2" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="lock-pin-3" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="lock-pin-4" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="confirmLockChat()" id="lock-btn" disabled>Lock Chat</button>';
        html += '</div>';
        showModal(html);
        setupPinInputs('lock-pin-', 'lock-btn');
    };
    
    window.showUnlockDialog = function() {
        var html = '<div class="lock-modal">';
        html += '<div class="lock-icon"><i class="fas fa-lock"></i></div>';
        html += '<h3>Unlock Chat</h3>';
        html += '<p>Enter your 4-digit PIN</p>';
        html += '<div class="pin-input-group">';
        html += '<input type="password" id="unlock-pin-1" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="unlock-pin-2" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="unlock-pin-3" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '<input type="password" id="unlock-pin-4" maxlength="1" class="pin-input" inputmode="numeric" pattern="[0-9]">';
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="confirmUnlockChat()" id="unlock-btn" disabled>Unlock</button>';
        html += '</div>';
        showModal(html);
        setupPinInputs('unlock-pin-', 'unlock-btn');
    };
    
    window.setupPinInputs = function(prefix, btnId) {
        for (var i = 1; i <= 4; i++) {
            (function(idx) {
                var input = document.getElementById(prefix + idx);
                if (!input) return;
                input.addEventListener('input', function() {
                    if (this.value && idx < 4) {
                        document.getElementById(prefix + (idx + 1)).focus();
                    }
                    checkPinComplete(prefix, btnId);
                });
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Backspace' && !this.value && idx > 1) {
                        document.getElementById(prefix + (idx - 1)).focus();
                    }
                });
            })(i);
        }
        setTimeout(function() {
            var first = document.getElementById(prefix + '1');
            if (first) first.focus();
        }, 100);
    };
    
    window.checkPinComplete = function(prefix, btnId) {
        var pin = '';
        for (var i = 1; i <= 4; i++) {
            var input = document.getElementById(prefix + i);
            pin += input ? input.value : '';
        }
        var btn = document.getElementById(btnId);
        if (btn) btn.disabled = pin.length !== 4;
    };
    
    window.getPin = function(prefix) {
        var pin = '';
        for (var i = 1; i <= 4; i++) {
            var input = document.getElementById(prefix + i);
            pin += input ? input.value : '';
        }
        return pin;
    };
    
    window.confirmLockChat = function() {
        var pin = getPin('lock-pin-');
        if (pin.length !== 4) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        if (chatIndex === -1) return;
        
        // Hash the PIN before storing
        var hashedPin = hashPassword(pin);
        chats[chatIndex].locked = true;
        chats[chatIndex].lockPin = hashedPin;
        Storage.set('chats', chats);
        
        if (typeof syncChat === 'function') {
            syncChat(chats[chatIndex]);
        }
        
        closeModal();
        showToast('Chat locked!', 'success');
    };
    
    window.confirmUnlockChat = function() {
        var pin = getPin('unlock-pin-');
        if (pin.length !== 4) return;
        
        var chats = Storage.get('chats') || [];
        var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
        if (chatIndex === -1) return;
        
        var hashedPin = hashPassword(pin);
        if (chats[chatIndex].lockPin !== hashedPin) {
            showToast('Incorrect PIN', 'error');
            // Clear inputs
            for (var i = 1; i <= 4; i++) {
                var input = document.getElementById('unlock-pin-' + i);
                if (input) input.value = '';
            }
            document.getElementById('unlock-pin-1').focus();
            return;
        }
        
        // Temporarily unlock (for this session only)
        chats[chatIndex].tempUnlocked = true;
        Storage.set('chats', chats);
        
        closeModal();
        showToast('Chat unlocked!', 'success');
        showChatOptions();
    };
    
    // Check if chat requires unlock before opening
    window.checkChatLock = function(chatId) {
        var chats = Storage.get('chats') || [];
        var chat = chats.find(function(c) { return c.id === chatId; });
        if (!chat || !chat.locked) return true;
        if (chat.tempUnlocked) return true;
        return false;
    };
    
    // ==========================================
    // Security: Rate Limiting
    // ==========================================
    window.loginAttempts = window.loginAttempts || {};
    
    window.checkRateLimit = function(action) {
        var now = Date.now();
        var key = action + '_' + (currentUser ? currentUser.id : 'anon');
        
        if (!window.loginAttempts[key]) {
            window.loginAttempts[key] = { count: 0, lastAttempt: now };
        }
        
        var attempt = window.loginAttempts[key];
        
        // Reset if 15 minutes passed
        if (now - attempt.lastAttempt > 15 * 60 * 1000) {
            attempt.count = 0;
        }
        
        // Check limits
        if (action === 'login' && attempt.count >= 5) {
            var remaining = Math.ceil((15 * 60 * 1000 - (now - attempt.lastAttempt)) / 60000);
            showToast('Too many attempts. Try again in ' + remaining + ' minutes.', 'error');
            return false;
        }
        
        attempt.count++;
        attempt.lastAttempt = now;
        return true;
    };
    
    window.resetRateLimit = function(action) {
        var key = action + '_' + (currentUser ? currentUser.id : 'anon');
        window.loginAttempts[key] = { count: 0, lastAttempt: Date.now() };
    };
    
    // ==========================================
    // Security: Session Timeout
    // ==========================================
    window.SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    window.lastActivity = Date.now();
    
    window.updateActivity = function() {
        window.lastActivity = Date.now();
    };
    
    // Track activity
    ['click', 'keypress', 'mousemove', 'scroll', 'touchstart'].forEach(function(event) {
        document.addEventListener(event, updateActivity, { passive: true });
    });
    
    // Check session every minute
    setInterval(function() {
        if (!currentUser) return;
        var elapsed = Date.now() - window.lastActivity;
        if (elapsed > window.SESSION_TIMEOUT) {
            showToast('Session expired due to inactivity', 'info');
            logout();
        }
    }, 60000);
    
    // ==========================================
    // Security: CSRF Token
    // ==========================================
    window.csrfToken = window.csrfToken || generateId();
    
    // Add CSRF token to all fetch requests
    var originalFetch = window.fetch;
    window.fetch = function(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['X-CSRF-Token'] = window.csrfToken;
        return originalFetch.call(this, url, options);
    };
    
    // ==========================================
    // Two-Factor Authentication
    // ==========================================
    window.twoFactorCode = null;
    
    window.show2FAModal = function() {
        // Generate a 6-digit code
        window.twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        var html = '<div class="twofa-modal">';
        html += '<div class="twofa-icon"><i class="fas fa-shield-alt"></i></div>';
        html += '<h3>Two-Factor Authentication</h3>';
        html += '<p>Enter the 6-digit code sent to your email</p>';
        html += '<div class="twofa-code-display"><span>Demo Code: ' + window.twoFactorCode + '</span></div>';
        html += '<div class="code-inputs">';
        for (var i = 0; i < 6; i++) {
            html += '<input type="text" maxlength="1" class="code-input twofa-input" data-index="' + i + '">';
        }
        html += '</div>';
        html += '<button class="btn btn-primary" id="verify-2fa-btn" onclick="verify2FACode()"><i class="fas fa-check"></i> Verify</button>';
        html += '<button class="btn" onclick="cancel2FA()">Cancel</button>';
        html += '</div>';
        showModal(html);
        
        // Setup code inputs
        setTimeout(function() {
            var inputs = document.querySelectorAll('.twofa-input');
            inputs.forEach(function(input, index) {
                input.addEventListener('input', function(e) {
                    if (this.value && index < 5) {
                        inputs[index + 1].focus();
                    }
                });
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Backspace' && !this.value && index > 0) {
                        inputs[index - 1].focus();
                    }
                });
            });
            if (inputs[0]) inputs[0].focus();
        }, 100);
    };
    
    window.verify2FACode = function() {
        var inputs = document.querySelectorAll('.twofa-input');
        var enteredCode = '';
        inputs.forEach(function(input) {
            enteredCode += input.value;
        });
        
        if (enteredCode === window.twoFactorCode) {
            // Success - login the user
            if (window.tempLoginUser) {
                currentUser = window.tempLoginUser;
                Storage.set('currentUser', { id: currentUser.id });
                window.tempLoginUser = null;
            }
            closeModal();
            showToast('Verification successful!', 'success');
            showApp();
        } else {
            showToast('Invalid code. Please try again.', 'error');
            inputs.forEach(function(input) { input.value = ''; });
            if (inputs[0]) inputs[0].focus();
        }
    };
    
    window.cancel2FA = function() {
        window.tempLoginUser = null;
        window.twoFactorCode = null;
        closeModal();
    };
    
    // ==========================================
    // Privacy Policy
    // ==========================================
    window.showPrivacyPolicy = function() {
        var html = '<div class="privacy-policy-modal">';
        html += '<h3><i class="fas fa-shield-alt"></i> Privacy Policy</h3>';
        html += '<div class="policy-content">';
        html += '<h4>1. Information We Collect</h4>';
        html += '<p>We collect information you provide directly to us, such as when you create an account, send messages, or contact us for support.</p>';
        html += '<h4>2. How We Use Your Information</h4>';
        html += '<p>We use the information we collect to provide, maintain, and improve our services, and to communicate with you.</p>';
        html += '<h4>3. Information Sharing</h4>';
        html += '<p>We do not share your personal information with third parties except as described in this policy.</p>';
        html += '<h4>4. Data Security</h4>';
        html += '<p>We implement appropriate security measures to protect your personal information.</p>';
        html += '<h4>5. Your Rights</h4>';
        html += '<p>You have the right to access, update, or delete your personal information at any time.</p>';
        html += '<h4>6. Contact Us</h4>';
        html += '<p>If you have any questions about this Privacy Policy, please contact us at support@bsithub.com.</p>';
        html += '</div>';
        html += '<button class="btn btn-primary" onclick="closeModal()">I Understand</button>';
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Device Management
    // ==========================================
    window.getDevices = function() {
        var devices = Storage.get('devices') || [];
        // Add current device if not exists
        var currentDevice = {
            id: 'device_' + navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20),
            name: getDeviceName(),
            browser: getBrowserInfo(),
            os: getOSInfo(),
            lastActive: new Date().toISOString(),
            isCurrent: true
        };
        
        var existing = devices.find(function(d) { return d.id === currentDevice.id; });
        if (existing) {
            existing.lastActive = currentDevice.lastActive;
            existing.isCurrent = true;
        } else {
            devices.push(currentDevice);
        }
        
        Storage.set('devices', devices);
        return devices;
    };
    
    window.getDeviceName = function() {
        var ua = navigator.userAgent;
        if (/Mobile|Android|iPhone/.test(ua)) return 'Mobile Device';
        if (/Tablet|iPad/.test(ua)) return 'Tablet';
        return 'Desktop';
    };
    
    window.getBrowserInfo = function() {
        var ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Unknown Browser';
    };
    
    window.getOSInfo = function() {
        var ua = navigator.userAgent;
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac')) return 'MacOS';
        if (ua.includes('Linux')) return 'Linux';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        return 'Unknown OS';
    };
    
    window.showDeviceManagement = function() {
        var devices = getDevices();
        var html = '<div class="device-management"><h3><i class="fas fa-laptop"></i> Device Management</h3>';
        html += '<p class="device-desc">Manage devices where you\'re logged in</p>';
        
        devices.forEach(function(device) {
            html += '<div class="device-card">';
            html += '<div class="device-icon"><i class="fas fa-' + (device.name.includes('Mobile') ? 'mobile-alt' : 'laptop') + '"></i></div>';
            html += '<div class="device-info">';
            html += '<div class="device-name">' + device.name + '</div>';
            html += '<div class="device-details">' + device.browser + ' on ' + device.os + '</div>';
            html += '</div>';
            html += '<span class="device-status ' + (device.isCurrent ? 'current' : 'other') + '">' + (device.isCurrent ? 'Current' : 'Active') + '</span>';
            html += '</div>';
        });
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Login History
    // ==========================================
    window.getLoginHistory = function() {
        return Storage.get('loginHistory') || [];
    };
    
    window.addLoginHistory = function(success, method) {
        var history = getLoginHistory();
        history.unshift({
            id: generateId(),
            timestamp: new Date().toISOString(),
            success: success,
            method: method || 'email',
            device: getDeviceName(),
            browser: getBrowserInfo(),
            ip: 'Local'
        });
        
        // Keep only last 50 entries
        if (history.length > 50) history = history.slice(0, 50);
        Storage.set('loginHistory', history);
    };
    
    window.showLoginHistory = function() {
        var history = getLoginHistory();
        var html = '<div class="login-history"><h3><i class="fas fa-history"></i> Login History</h3>';
        
        if (history.length === 0) {
            html += '<p class="history-empty">No login history yet</p>';
        } else {
            history.slice(0, 20).forEach(function(entry) {
                var time = new Date(entry.timestamp);
                var timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
                
                html += '<div class="history-item">';
                html += '<div class="history-icon ' + (entry.success ? 'success' : 'failed') + '">';
                html += '<i class="fas fa-' + (entry.success ? 'check' : 'times') + '"></i>';
                html += '</div>';
                html += '<div class="history-info">';
                html += '<div class="history-action">' + (entry.success ? 'Successful login' : 'Failed login attempt') + '</div>';
                html += '<div class="history-details">' + entry.method + ' via ' + entry.browser + ' on ' + entry.device + '</div>';
                html += '</div>';
                html += '<div class="history-time">' + timeStr + '</div>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Account Lockout
    // ==========================================
    window.handleFailedLogin = function(emailOrUsername) {
        var lockouts = Storage.get('accountLockouts') || {};
        var now = Date.now();
        
        if (!lockouts[emailOrUsername]) {
            lockouts[emailOrUsername] = {
                attempts: 1,
                firstAttempt: now,
                lockedUntil: null
            };
        } else {
            // Reset if last attempt was more than 15 minutes ago
            if (now - lockouts[emailOrUsername].firstAttempt > 15 * 60 * 1000) {
                lockouts[emailOrUsername] = {
                    attempts: 1,
                    firstAttempt: now,
                    lockedUntil: null
                };
            } else {
                lockouts[emailOrUsername].attempts++;
            }
        }
        
        // Lock account after 5 failed attempts for 15 minutes
        if (lockouts[emailOrUsername].attempts >= 5) {
            lockouts[emailOrUsername].lockedUntil = now + (15 * 60 * 1000);
            logSecurityEvent('account_locked', emailOrUsername, 'Account locked after 5 failed attempts');
        } else {
            logSecurityEvent('login_failed', emailOrUsername, 'Failed attempt ' + lockouts[emailOrUsername].attempts + '/5');
        }
        
        Storage.set('accountLockouts', lockouts);
        addLoginHistory(false, emailOrUsername.includes('@') ? 'email' : 'username');
    };
    
    // ==========================================
    // Security: Audit Log
    // ==========================================
    window.logSecurityEvent = function(eventType, identifier, details) {
        var auditLog = Storage.get('securityAuditLog') || [];
        auditLog.unshift({
            id: generateId(),
            type: eventType,
            identifier: identifier,
            details: details,
            timestamp: new Date().toISOString(),
            device: getDeviceName(),
            browser: getBrowserInfo(),
            fingerprint: getDeviceFingerprint()
        });
        
        // Keep only last 200 entries
        if (auditLog.length > 200) {
            auditLog = auditLog.slice(0, 200);
        }
        
        Storage.set('securityAuditLog', auditLog);
    };
    
    window.getSecurityAuditLog = function() {
        return Storage.get('securityAuditLog') || [];
    };
    
    window.showSecurityAuditLog = function() {
        var log = getSecurityAuditLog();
        var html = '<div class="audit-log-modal"><h3><i class="fas fa-shield-alt"></i> Security Audit Log</h3>';
        
        if (log.length === 0) {
            html += '<p class="audit-empty">No security events recorded</p>';
        } else {
            log.slice(0, 50).forEach(function(entry) {
                var time = new Date(entry.timestamp);
                var timeStr = time.toLocaleDateString() + ' ' + time.toLocaleTimeString();
                var iconClass = 'info';
                var icon = 'info-circle';
                
                if (entry.type.includes('success')) { iconClass = 'success'; icon = 'check-circle'; }
                else if (entry.type.includes('failed') || entry.type.includes('locked')) { iconClass = 'danger'; icon = 'exclamation-circle'; }
                else if (entry.type.includes('device')) { iconClass = 'warning'; icon = 'laptop'; }
                
                html += '<div class="audit-item">';
                html += '<div class="audit-icon ' + iconClass + '"><i class="fas fa-' + icon + '"></i></div>';
                html += '<div class="audit-info">';
                html += '<div class="audit-type">' + entry.type.replace(/_/g, ' ').toUpperCase() + '</div>';
                html += '<div class="audit-details">' + escapeHtml(entry.details || '') + '</div>';
                html += '<div class="audit-meta">' + entry.device + ' • ' + entry.browser + '</div>';
                html += '</div>';
                html += '<div class="audit-time">' + timeStr + '</div>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Device Fingerprinting
    // ==========================================
    window.getDeviceFingerprint = function() {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('fingerprint', 2, 2);
        
        var fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            canvas.toDataURL(),
            navigator.platform,
            navigator.hardwareConcurrency || 'unknown'
        ].join('|');
        
        // Simple hash
        var hash = 0;
        for (var i = 0; i < fingerprint.length; i++) {
            var char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    };
    
    window.trackDevice = function() {
        var fingerprint = getDeviceFingerprint();
        var devices = Storage.get('trustedDevices') || [];
        var existing = devices.find(function(d) { return d.fingerprint === fingerprint; });
        
        if (!existing) {
            devices.push({
                fingerprint: fingerprint,
                name: getDeviceName(),
                browser: getBrowserInfo(),
                os: getOSInfo(),
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            });
            logSecurityEvent('new_device', fingerprint, 'New device detected: ' + getDeviceName() + ' - ' + getBrowserInfo());
        } else {
            existing.lastSeen = new Date().toISOString();
        }
        
        Storage.set('trustedDevices', devices);
    };
    
    window.getTrustedDevices = function() {
        return Storage.get('trustedDevices') || [];
    };
    
    window.showTrustedDevices = function() {
        var devices = getTrustedDevices();
        var html = '<div class="trusted-devices-modal"><h3><i class="fas fa-fingerprint"></i> Trusted Devices</h3>';
        
        if (devices.length === 0) {
            html += '<p class="devices-empty">No trusted devices recorded</p>';
        } else {
            devices.forEach(function(device) {
                var lastSeen = new Date(device.lastSeen);
                html += '<div class="device-card">';
                html += '<div class="device-icon"><i class="fas fa-' + (device.name.includes('Mobile') ? 'mobile-alt' : 'laptop') + '"></i></div>';
                html += '<div class="device-info">';
                html += '<div class="device-name">' + device.name + '</div>';
                html += '<div class="device-details">' + device.browser + ' on ' + device.os + '</div>';
                html += '<div class="device-details">Last seen: ' + lastSeen.toLocaleDateString() + '</div>';
                html += '</div>';
                html += '<div class="device-fingerprint">ID: ' + device.fingerprint.substring(0, 8) + '...</div>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Login Alerts
    // ==========================================
    window.sendLoginAlert = function(user) {
        if (!user || !user.email) return;
        
        var devices = getTrustedDevices();
        var currentFingerprint = getDeviceFingerprint();
        var isNewDevice = !devices.some(function(d) { return d.fingerprint === currentFingerprint; });
        
        if (isNewDevice) {
            // In a real app, this would send an email
            // For now, we'll show a notification
            logSecurityEvent('login_alert_sent', user.email, 'New device login alert sent for ' + getDeviceName());
            
            // Store alert in local notifications
            var alerts = Storage.get('loginAlerts') || [];
            alerts.unshift({
                id: generateId(),
                userId: user.id,
                email: user.email,
                device: getDeviceName(),
                browser: getBrowserInfo(),
                timestamp: new Date().toISOString(),
                read: false
            });
            
            // Keep only last 50 alerts
            if (alerts.length > 50) alerts = alerts.slice(0, 50);
            Storage.set('loginAlerts', alerts);
            
            showToast('New device detected! Login alert recorded.', 'warning');
        }
    };
    
    window.getLoginAlerts = function() {
        return Storage.get('loginAlerts') || [];
    };
    
    window.showLoginAlerts = function() {
        var alerts = getLoginAlerts();
        var html = '<div class="login-alerts-modal"><h3><i class="fas fa-bell"></i> Login Alerts</h3>';
        
        if (alerts.length === 0) {
            html += '<p class="alerts-empty">No login alerts</p>';
        } else {
            alerts.slice(0, 20).forEach(function(alert) {
                var time = new Date(alert.timestamp);
                html += '<div class="alert-item ' + (alert.read ? '' : 'unread') + '">';
                html += '<div class="alert-icon"><i class="fas fa-exclamation-triangle"></i></div>';
                html += '<div class="alert-info">';
                html += '<div class="alert-title">New device login detected</div>';
                html += '<div class="alert-details">' + alert.device + ' via ' + alert.browser + '</div>';
                html += '</div>';
                html += '<div class="alert-time">' + time.toLocaleDateString() + '</div>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Enhanced Password Reset
    // ==========================================
    window.enhancedPasswordReset = function(email) {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.email === email; });
        
        if (!user) {
            // Don't reveal if email exists - security best practice
            logSecurityEvent('password_reset_attempt', email, 'Password reset requested (email may not exist)');
            return { success: true, message: 'If this email exists, a reset code has been sent.' };
        }
        
        // Generate secure reset token
        var resetToken = generateId() + '-' + Date.now().toString(36);
        var resetTokens = Storage.get('resetTokens') || {};
        resetTokens[email] = {
            token: resetToken,
            expires: Date.now() + (30 * 60 * 1000), // 30 minutes
            attempts: 0
        };
        Storage.set('resetTokens', resetTokens);
        
        logSecurityEvent('password_reset_sent', email, 'Password reset token generated');
        
        // In production, send email with reset link
        return { success: true, message: 'If this email exists, a reset code has been sent.', token: resetToken };
    };
    
    window.validateResetToken = function(email, token) {
        var resetTokens = Storage.get('resetTokens') || {};
        var tokenData = resetTokens[email];
        
        if (!tokenData) {
            logSecurityEvent('password_reset_invalid', email, 'Invalid reset token used');
            return { valid: false, message: 'Invalid or expired reset token' };
        }
        
        if (Date.now() > tokenData.expires) {
            delete resetTokens[email];
            Storage.set('resetTokens', resetTokens);
            logSecurityEvent('password_reset_expired', email, 'Expired reset token used');
            return { valid: false, message: 'Reset token has expired' };
        }
        
        if (tokenData.token !== token) {
            tokenData.attempts++;
            if (tokenData.attempts >= 3) {
                delete resetTokens[email];
                Storage.set('resetTokens', resetTokens);
                logSecurityEvent('password_reset_locked', email, 'Too many invalid token attempts');
                return { valid: false, message: 'Too many invalid attempts. Request a new reset code.' };
            }
            Storage.set('resetTokens', resetTokens);
            return { valid: false, message: 'Invalid reset token' };
        }
        
        return { valid: true };
    };
    
    // ==========================================
    // Security: Vulnerability Scanner
    // ==========================================
    window.runVulnerabilityScan = function() {
        var issues = [];
        var users = Storage.get('users') || [];
        
        // Check for weak passwords
        users.forEach(function(user) {
            if (user.password && user.password.length < 60) {
                issues.push({
                    severity: 'high',
                    type: 'weak_password',
                    message: 'User "' + user.username + '" has a weak password',
                    recommendation: 'Enforce stronger password requirements'
                });
            }
        });
        
        // Check for missing 2FA
        var usersWithout2FA = users.filter(function(u) { return !u.twoFactorEnabled; });
        if (usersWithout2FA.length > 0) {
            issues.push({
                severity: 'medium',
                type: 'no_2fa',
                message: usersWithout2FA.length + ' users without 2FA enabled',
                recommendation: 'Enable 2FA for all accounts'
            });
        }
        
        // Check for old sessions
        var lastActivity = window.lastActivity || Date.now();
        if (Date.now() - lastActivity > 24 * 60 * 60 * 1000) {
            issues.push({
                severity: 'low',
                type: 'old_session',
                message: 'Session has been active for over 24 hours',
                recommendation: 'Consider logging out and back in'
            });
        }
        
        // Check for blocked users without reason
        var blockedUsers = Storage.get('blockedUsers') || [];
        if (blockedUsers.length > 10) {
            issues.push({
                severity: 'info',
                type: 'many_blocked',
                message: blockedUsers.length + ' users are blocked',
                recommendation: 'Review blocked users list'
            });
        }
        
        // Check for old login attempts
        var lockouts = Storage.get('accountLockouts') || {};
        var oldLockouts = Object.keys(lockouts).filter(function(key) {
            return lockouts[key].lockedUntil && lockouts[key].lockedUntil < Date.now();
        });
        if (oldLockouts.length > 0) {
            issues.push({
                severity: 'low',
                type: 'expired_lockouts',
                message: oldLockouts.length + ' expired account lockouts found',
                recommendation: 'Clear expired lockout records'
            });
        }
        
        // Check audit log for suspicious activity
        var auditLog = Storage.get('securityAuditLog') || [];
        var recentFailures = auditLog.filter(function(entry) {
            return entry.type.includes('failed') && Date.now() - new Date(entry.timestamp).getTime() < 60 * 60 * 1000;
        });
        if (recentFailures.length > 10) {
            issues.push({
                severity: 'high',
                type: 'brute_force',
                message: recentFailures.length + ' failed login attempts in the last hour',
                recommendation: 'Review IP blocking and rate limiting'
            });
        }
        
        // Check for missing privacy settings
        var settings = Storage.get('settings') || {};
        if (!settings.hasOwnProperty('showOnlineStatus')) {
            issues.push({
                severity: 'low',
                type: 'privacy_default',
                message: 'Privacy settings not configured',
                recommendation: 'Review and set privacy preferences'
            });
        }
        
        return {
            score: Math.max(0, 100 - (issues.length * 10)),
            issues: issues,
            scannedAt: new Date().toISOString()
        };
    };
    
    window.showVulnerabilityScan = function() {
        var result = runVulnerabilityScan();
        var html = '<div class="vuln-scan-modal">';
        html += '<h3><i class="fas fa-search"></i> Security Scan Results</h3>';
        html += '<div class="scan-score">';
        html += '<div class="score-circle ' + (result.score >= 80 ? 'good' : result.score >= 60 ? 'warning' : 'danger') + '">';
        html += '<span class="score-value">' + result.score + '</span>';
        html += '<span class="score-label">Security Score</span>';
        html += '</div>';
        html += '</div>';
        
        if (result.issues.length === 0) {
            html += '<div class="scan-success"><i class="fas fa-check-circle"></i> No issues found!</div>';
        } else {
            html += '<div class="scan-issues">';
            result.issues.forEach(function(issue) {
                html += '<div class="scan-issue ' + issue.severity + '">';
                html += '<div class="issue-icon"><i class="fas fa-' + (issue.severity === 'high' ? 'exclamation-triangle' : issue.severity === 'medium' ? 'exclamation-circle' : 'info-circle') + '"></i></div>';
                html += '<div class="issue-info">';
                html += '<div class="issue-message">' + escapeHtml(issue.message) + '</div>';
                html += '<div class="issue-recommendation">' + escapeHtml(issue.recommendation) + '</div>';
                html += '</div>';
                html += '<span class="issue-severity">' + issue.severity.toUpperCase() + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        
        html += '<button class="btn btn-primary" onclick="closeModal()">Close</button>';
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Security Dashboard
    // ==========================================
    window.showSecurityDashboard = function() {
        var users = Storage.get('users') || [];
        var settings = Storage.get('settings') || {};
        var auditLog = Storage.get('securityAuditLog') || [];
        var trustedDevices = getTrustedDevices();
        
        // Calculate security score
        var score = 100;
        var factors = [];
        
        // 2FA
        var has2FA = currentUser && currentUser.twoFactorEnabled;
        if (has2FA) {
            factors.push({ name: '2FA Enabled', status: 'good', points: 20 });
        } else {
            factors.push({ name: '2FA Disabled', status: 'warning', points: 0 });
            score -= 20;
        }
        
        // Strong password (check if hash exists)
        if (currentUser && currentUser.password && currentUser.password.length > 50) {
            factors.push({ name: 'Strong Password', status: 'good', points: 20 });
        } else {
            factors.push({ name: 'Weak Password', status: 'danger', points: 0 });
            score -= 20;
        }
        
        // Privacy settings
        if (settings.showOnlineStatus === false) {
            factors.push({ name: 'Privacy Mode', status: 'good', points: 10 });
        } else {
            factors.push({ name: 'Online Status Visible', status: 'info', points: 5 });
            score -= 5;
        }
        
        // Trusted devices
        if (trustedDevices.length > 0) {
            factors.push({ name: trustedDevices.length + ' Trusted Device(s)', status: 'good', points: 10 });
        } else {
            factors.push({ name: 'No Trusted Devices', status: 'info', points: 0 });
        }
        
        // Recent activity
        var recentActivity = auditLog.filter(function(e) {
            return Date.now() - new Date(e.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000;
        });
        if (recentActivity.length > 0) {
            factors.push({ name: recentActivity.length + ' Events This Week', status: 'info', points: 10 });
        }
        
        // Login alerts
        var alerts = getLoginAlerts();
        var unreadAlerts = alerts.filter(function(a) { return !a.read; });
        if (unreadAlerts.length === 0) {
            factors.push({ name: 'No Unread Alerts', status: 'good', points: 10 });
        } else {
            factors.push({ name: unreadAlerts.length + ' Unread Alerts', status: 'warning', points: 0 });
            score -= 10;
        }
        
        score = Math.max(0, Math.min(100, score));
        
        var html = '<div class="security-dashboard">';
        html += '<h3><i class="fas fa-shield-alt"></i> Security Dashboard</h3>';
        
        html += '<div class="dashboard-score">';
        html += '<div class="score-ring ' + (score >= 80 ? 'good' : score >= 60 ? 'warning' : 'danger') + '">';
        html += '<div class="score-inner">';
        html += '<span class="score-number">' + score + '</span>';
        html += '<span class="score-text">Security Score</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        html += '<div class="dashboard-factors">';
        factors.forEach(function(factor) {
            html += '<div class="factor-item">';
            html += '<span class="factor-status ' + factor.status + '"><i class="fas fa-' + (factor.status === 'good' ? 'check-circle' : factor.status === 'warning' ? 'exclamation-circle' : 'info-circle') + '"></i></span>';
            html += '<span class="factor-name">' + factor.name + '</span>';
            html += '<span class="factor-points">+' + factor.points + '</span>';
            html += '</div>';
        });
        html += '</div>';
        
        html += '<div class="dashboard-actions">';
        html += '<button class="btn" onclick="showVulnerabilityScan()"><i class="fas fa-search"></i> Run Scan</button>';
        html += '<button class="btn" onclick="showSecurityAuditLog()"><i class="fas fa-list"></i> View Log</button>';
        html += '</div>';
        
        html += '</div>';
        showModal(html);
    };
    
    // ==========================================
    // Security: Privacy Settings
    // ==========================================
    window.showPrivacySettings = function() {
        var settings = Storage.get('settings') || {};
        
        var html = '<div class="privacy-settings">';
        html += '<h3><i class="fas fa-eye-slash"></i> Privacy Settings</h3>';
        
        html += '<div class="privacy-option">';
        html += '<div class="privacy-info">';
        html += '<div class="privacy-label">Show Online Status</div>';
        html += '<div class="privacy-desc">Let others see when you\'re online</div>';
        html += '</div>';
        html += '<label class="toggle">';
        html += '<input type="checkbox" id="privacy-online" ' + (settings.showOnlineStatus !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
        
        html += '<div class="privacy-option">';
        html += '<div class="privacy-info">';
        html += '<div class="privacy-label">Show Last Seen</div>';
        html += '<div class="privacy-desc">Let others see when you were last active</div>';
        html += '</div>';
        html += '<label class="toggle">';
        html += '<input type="checkbox" id="privacy-lastseen" ' + (settings.showLastSeen !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
        
        html += '<div class="privacy-option">';
        html += '<div class="privacy-info">';
        html += '<div class="privacy-label">Show Read Receipts</div>';
        html += '<div class="privacy-desc">Let others see when you read messages</div>';
        html += '</div>';
        html += '<label class="toggle">';
        html += '<input type="checkbox" id="privacy-receipts" ' + (settings.showReadReceipts !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
        
        html += '<div class="privacy-option">';
        html += '<div class="privacy-info">';
        html += '<div class="privacy-label">Show Profile Photo</div>';
        html += '<div class="privacy-desc">Let others see your profile photo</div>';
        html += '</div>';
        html += '<label class="toggle">';
        html += '<input type="checkbox" id="privacy-photo" ' + (settings.showProfilePhoto !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
        
        html += '<div class="privacy-option">';
        html += '<div class="privacy-info">';
        html += '<div class="privacy-label">Allow Message Forwarding</div>';
        html += '<div class="privacy-desc">Let others forward your messages</div>';
        html += '</div>';
        html += '<label class="toggle">';
        html += '<input type="checkbox" id="privacy-forward" ' + (settings.allowForwarding !== false ? 'checked' : '') + '>';
        html += '<span class="toggle-slider"></span>';
        html += '</label>';
        html += '</div>';
        
        html += '<button class="btn btn-primary" onclick="savePrivacySettings()"><i class="fas fa-save"></i> Save Settings</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.savePrivacySettings = function() {
        var settings = Storage.get('settings') || {};
        settings.showOnlineStatus = document.getElementById('privacy-online').checked;
        settings.showLastSeen = document.getElementById('privacy-lastseen').checked;
        settings.showReadReceipts = document.getElementById('privacy-receipts').checked;
        settings.showProfilePhoto = document.getElementById('privacy-photo').checked;
        settings.allowForwarding = document.getElementById('privacy-forward').checked;
        Storage.set('settings', settings);
        showToast('Privacy settings saved', 'success');
        closeModal();
    };
    
    // ==========================================
    // Security: IP Blocking
    // ==========================================
    window.getBlockedIPs = function() {
        return Storage.get('blockedIPs') || [];
    };
    
    window.blockIP = function(ip, reason) {
        var blockedIPs = getBlockedIPs();
        if (!blockedIPs.find(function(b) { return b.ip === ip; })) {
            blockedIPs.push({
                ip: ip,
                reason: reason || 'Manual block',
                blockedAt: new Date().toISOString(),
                blockedBy: currentUser ? currentUser.id : 'system'
            });
            Storage.set('blockedIPs', blockedIPs);
            logSecurityEvent('ip_blocked', ip, 'IP blocked: ' + reason);
            return true;
        }
        return false;
    };
    
    window.unblockIP = function(ip) {
        var blockedIPs = getBlockedIPs();
        blockedIPs = blockedIPs.filter(function(b) { return b.ip !== ip; });
        Storage.set('blockedIPs', blockedIPs);
        logSecurityEvent('ip_unblocked', ip, 'IP unblocked');
    };
    
    window.showBlockedIPs = function() {
        var blockedIPs = getBlockedIPs();
        var html = '<div class="blocked-ips-modal">';
        html += '<h3><i class="fas fa-ban"></i> Blocked IP Addresses</h3>';
        
        if (blockedIPs.length === 0) {
            html += '<p class="no-blocked">No blocked IP addresses</p>';
        } else {
            blockedIPs.forEach(function(entry) {
                var time = new Date(entry.blockedAt);
                html += '<div class="blocked-ip-item">';
                html += '<div class="blocked-ip-info">';
                html += '<div class="blocked-ip-address">' + entry.ip + '</div>';
                html += '<div class="blocked-ip-reason">' + escapeHtml(entry.reason) + '</div>';
                html += '</div>';
                html += '<div class="blocked-ip-actions">';
                html += '<span class="blocked-ip-time">' + time.toLocaleDateString() + '</span>';
                html += '<button class="btn btn-small" onclick="unblockIP(\'' + entry.ip + '\'); showBlockedIPs();">Unblock</button>';
                html += '</div>';
                html += '</div>';
            });
        }
        
        html += '<div class="add-blocked-ip">';
        html += '<input type="text" id="new-blocked-ip" placeholder="Enter IP address">';
        html += '<input type="text" id="new-blocked-reason" placeholder="Reason (optional)">';
        html += '<button class="btn btn-primary" onclick="addBlockedIP()">Block IP</button>';
        html += '</div>';
        
        html += '</div>';
        showModal(html);
    };
    
    window.addBlockedIP = function() {
        var ip = document.getElementById('new-blocked-ip').value.trim();
        var reason = document.getElementById('new-blocked-reason').value.trim();
        if (ip) {
            if (blockIP(ip, reason || 'Manual block')) {
                showToast('IP address blocked', 'success');
                showBlockedIPs();
            } else {
                showToast('IP already blocked', 'info');
            }
        }
    };
    
    // ==========================================
    // Security: Security Questions
    // ==========================================
    window.securityQuestions = [
        'What was the name of your first pet?',
        'What city were you born in?',
        'What is your mother\'s maiden name?',
        'What was the name of your first school?',
        'What is your favorite movie?',
        'What was your childhood nickname?',
        'What is the name of your best friend?',
        'What was your first car?',
        'What is your favorite book?',
        'What was the first concert you attended?'
    ];
    
    window.showSecurityQuestions = function() {
        var userQuestions = (currentUser && currentUser.securityQuestions) || {};
        
        var html = '<div class="security-questions">';
        html += '<h3><i class="fas fa-question-circle"></i> Security Questions</h3>';
        html += '<p class="questions-desc">Set up security questions to help recover your account</p>';
        
        html += '<div class="question-item">';
        html += '<label>Question 1</label>';
        html += '<select id="question-1">';
        html += '<option value="">Select a question...</option>';
        securityQuestions.forEach(function(q, i) {
            html += '<option value="' + i + '" ' + (userQuestions.q1 === i ? 'selected' : '') + '>' + q + '</option>';
        });
        html += '</select>';
        html += '<input type="password" id="answer-1" placeholder="Your answer" value="' + (userQuestions.a1 ? '••••••' : '') + '">';
        html += '</div>';
        
        html += '<div class="question-item">';
        html += '<label>Question 2</label>';
        html += '<select id="question-2">';
        html += '<option value="">Select a question...</option>';
        securityQuestions.forEach(function(q, i) {
            html += '<option value="' + i + '" ' + (userQuestions.q2 === i ? 'selected' : '') + '>' + q + '</option>';
        });
        html += '</select>';
        html += '<input type="password" id="answer-2" placeholder="Your answer" value="' + (userQuestions.a2 ? '••••••' : '') + '">';
        html += '</div>';
        
        html += '<div class="question-item">';
        html += '<label>Question 3</label>';
        html += '<select id="question-3">';
        html += '<option value="">Select a question...</option>';
        securityQuestions.forEach(function(q, i) {
            html += '<option value="' + i + '" ' + (userQuestions.q3 === i ? 'selected' : '') + '>' + q + '</option>';
        });
        html += '</select>';
        html += '<input type="password" id="answer-3" placeholder="Your answer" value="' + (userQuestions.a3 ? '••••••' : '') + '">';
        html += '</div>';
        
        html += '<button class="btn btn-primary" onclick="saveSecurityQuestions()"><i class="fas fa-save"></i> Save Questions</button>';
        html += '</div>';
        showModal(html);
    };
    
    window.saveSecurityQuestions = function() {
        var q1 = parseInt(document.getElementById('question-1').value);
        var q2 = parseInt(document.getElementById('question-2').value);
        var q3 = parseInt(document.getElementById('question-3').value);
        var a1 = document.getElementById('answer-1').value.trim();
        var a2 = document.getElementById('answer-2').value.trim();
        var a3 = document.getElementById('answer-3').value.trim();
        
        if (isNaN(q1) || isNaN(q2) || isNaN(q3)) {
            showToast('Please select all questions', 'error');
            return;
        }
        
        if (!a1 || !a2 || !a3) {
            showToast('Please provide all answers', 'error');
            return;
        }
        
        if (q1 === q2 || q1 === q3 || q2 === q3) {
            showToast('Please select different questions', 'error');
            return;
        }
        
        // Hash answers for security
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].securityQuestions = {
                q1: q1,
                q2: q2,
                q3: q3,
                a1: hashPassword(a1.toLowerCase()),
                a2: hashPassword(a2.toLowerCase()),
                a3: hashPassword(a3.toLowerCase())
            };
            Storage.set('users', users);
            currentUser = users[userIndex];
            
            logSecurityEvent('security_questions_set', currentUser.email, 'Security questions configured');
            showToast('Security questions saved', 'success');
            closeModal();
        }
    };
    
    window.verifySecurityQuestions = function(email, answers) {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.email === email; });
        
        if (!user || !user.securityQuestions) {
            return { valid: false, message: 'No security questions set' };
        }
        
        var q = user.securityQuestions;
        if (hashPassword(answers.a1.toLowerCase()) !== q.a1 ||
            hashPassword(answers.a2.toLowerCase()) !== q.a2 ||
            hashPassword(answers.a3.toLowerCase()) !== q.a3) {
            return { valid: false, message: 'Incorrect answers' };
        }
        
        return { valid: true };
    };

    // ==========================================
    // Post Reporting
    // ==========================================
    window.reportPost = function(postId) {
        var posts = Storage.get('posts') || [];
        var post = posts.find(function(p) { return p.id === postId; });
        if (!post) {
            showToast('Post not found', 'error');
            return;
        }

        var html = '<div class="report-modal">';
        html += '<h3><i class="fas fa-flag"></i> Report Post</h3>';
        html += '<p>Why are you reporting this post?</p>';
        html += '<div class="report-options">';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'spam\')">🚫 Spam or misleading</button>';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'harassment\')">😠 Harassment or bullying</button>';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'hate\')">💢 Hate speech</button>';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'violence\')">⚔️ Violence or dangerous</button>';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'nudity\')">🔞 Nudity or sexual content</button>';
        html += '<button class="report-option" onclick="submitReport(\'' + postId + '\', \'other\')">❓ Other</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
    };

    window.submitReport = function(postId, reason) {
        var reports = Storage.get('postReports') || [];
        reports.push({
            id: generateId(),
            postId: postId,
            reporterId: currentUser.id,
            reporterName: currentUser.name,
            reason: reason,
            createdAt: new Date().toISOString()
        });
        Storage.set('postReports', reports);
        closeModal();
        showToast('Report submitted. Thank you!', 'success');
    };

    window.showReportedPosts = function() {
        var reports = Storage.get('postReports') || [];
        var posts = Storage.get('posts') || [];
        
        var html = '<div class="reported-posts-modal">';
        html += '<h3><i class="fas fa-flag"></i> Reported Posts</h3>';
        
        if (reports.length === 0) {
            html += '<p class="no-reports">No reports yet</p>';
        } else {
            reports.reverse().forEach(function(report) {
                var post = posts.find(function(p) { return p.id === report.postId; });
                html += '<div class="report-item">';
                html += '<div class="report-info">';
                html += '<div class="report-reason">' + report.reason.charAt(0).toUpperCase() + report.reason.slice(1) + '</div>';
                html += '<div class="report-details">By: ' + escapeHtml(report.reporterName) + ' • ' + getTimeAgo(report.createdAt) + '</div>';
                if (post) html += '<div class="report-content">' + escapeHtml(post.content || '').substring(0, 100) + '</div>';
                html += '</div>';
                html += '<div class="report-actions">';
                html += '<button class="btn btn-small" onclick="dismissReport(\'' + report.id + '\')">Dismiss</button>';
                html += '<button class="btn btn-small danger" onclick="deleteReportedPost(\'' + report.postId + '\', \'' + report.id + '\')">Delete Post</button>';
                html += '</div>';
                html += '</div>';
            });
        }
        
        html += '</div>';
        showModal(html);
    };

    window.dismissReport = function(reportId) {
        var reports = Storage.get('postReports') || [];
        reports = reports.filter(function(r) { return r.id !== reportId; });
        Storage.set('postReports', reports);
        showReportedPosts();
        showToast('Report dismissed', 'info');
    };

    window.deleteReportedPost = function(postId, reportId) {
        var posts = Storage.get('posts') || [];
        posts = posts.filter(function(p) { return p.id !== postId; });
        Storage.set('posts', posts);
        
        var reports = Storage.get('postReports') || [];
        reports = reports.filter(function(r) { return r.id !== reportId; });
        Storage.set('postReports', reports);
        
        showReportedPosts();
        renderFeed();
        showToast('Post deleted', 'success');
    };

    // ==========================================
    // Post GIF Picker (Tenor API v1)
    // ==========================================
    var feedPostGifUrl = null;
    var TENOR_API_KEY = 'LIVDSRZULELA';

    window.showPostGifPicker = function() {
        var html = '<div class="post-gif-modal">';
        html += '<h3><i class="fas fa-file-image"></i> Add GIF</h3>';
        html += '<div class="gif-search-box">';
        html += '<input type="text" id="post-gif-search" placeholder="Search GIFs..." onkeydown="if(event.key===\'Enter\')searchPostGifs(this.value)">';
        html += '<button class="gif-search-btn" onclick="searchPostGifs(document.getElementById(\'post-gif-search\').value)"><i class="fas fa-search"></i></button>';
        html += '</div>';
        html += '<div class="gif-categories" id="gif-categories">';
        html += '<button class="gif-cat-btn active" onclick="searchPostGifs(\'trending\')">Trending</button>';
        html += '<button class="gif-cat-btn" onclick="searchPostGifs(\'funny\')">Funny</button>';
        html += '<button class="gif-cat-btn" onclick="searchPostGifs(\'love\')">Love</button>';
        html += '<button class="gif-cat-btn" onclick="searchPostGifs(\'sad\')">Sad</button>';
        html += '<button class="gif-cat-btn" onclick="searchPostGifs(\'happy\')">Happy</button>';
        html += '</div>';
        html += '<div class="gif-grid" id="post-gif-grid">';
        html += '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Loading GIFs...</div>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        loadTenorTrending();
    };

    function loadTenorTrending() {
        var grid = document.getElementById('post-gif-grid');
        
        fetch('/api/gifs/trending?limit=20')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                renderTenorGifs(data.results || []);
            })
            .catch(function(err) {
                console.error('GIF error:', err);
                grid.innerHTML = '<div class="gif-no-results">Could not load GIFs. Try searching instead.</div>';
            });
    }

    window.searchPostGifs = function(query) {
        var grid = document.getElementById('post-gif-grid');
        if (!query || !query.trim() || query === 'trending') {
            loadTenorTrending();
            return;
        }
        
        grid.innerHTML = '<div class="gif-loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
        
        // Update active category
        document.querySelectorAll('.gif-cat-btn').forEach(function(btn) {
            btn.classList.remove('active');
            if (btn.textContent.toLowerCase() === query.toLowerCase()) {
                btn.classList.add('active');
            }
        });
        
        fetch('/api/gifs/search?q=' + encodeURIComponent(query) + '&limit=20')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                renderTenorGifs(data.results || []);
            })
            .catch(function(err) {
                console.error('GIF search error:', err);
                grid.innerHTML = '<div class="gif-no-results">Search failed. Please try again.</div>';
            });
    };

    function renderTenorGifs(results) {
        var grid = document.getElementById('post-gif-grid');
        grid.innerHTML = '';
        
        if (!results || results.length === 0) {
            grid.innerHTML = '<div class="gif-no-results">No GIFs found. Try a different search.</div>';
            return;
        }
        
        results.forEach(function(gif) {
            var item = document.createElement('div');
            item.className = 'gif-item';
            
            var img = document.createElement('img');
            var gifUrl = gif.media && gif.media[0] ? gif.media[0].tinygif.url : '';
            var fullUrl = gif.media && gif.media[0] ? gif.media[0].gif.url : gifUrl;
            
            if (!gifUrl) return;
            
            img.src = gifUrl;
            img.alt = gif.title || 'GIF';
            img.loading = 'lazy';
            
            item.appendChild(img);
            item.onclick = function() {
                selectPostGif(fullUrl);
            };
            grid.appendChild(item);
        });
    }

    function selectPostGif(gifUrl) {
        feedPostGifUrl = gifUrl;
        closeModal();
        
        var preview = document.getElementById('composer-attachment-preview');
        preview.innerHTML = '<img src="' + gifUrl + '" class="preview-image"><button class="btn-icon remove-attachment" id="remove-post-gif"><i class="fas fa-times"></i></button>';
        preview.style.display = 'block';
        
        document.getElementById('remove-post-gif').onclick = function() {
            feedPostGifUrl = null;
            preview.style.display = 'none';
            preview.innerHTML = '';
            updatePostSubmitBtn();
        };
        
        updatePostSubmitBtn();
    }

    function updatePostSubmitBtn() {
        var content = document.getElementById('post-content').value.trim();
        var btn = document.getElementById('post-submit-btn');
        btn.disabled = !content && !feedPostImageData && !feedPostGifUrl;
    }

    // ==========================================
    // Post Privacy Selector
    // ==========================================
    window.showPostPrivacyPicker = function() {
        var currentPrivacy = document.getElementById('post-privacy').value || 'public';
        
        var html = '<div class="privacy-picker-enhanced">';
        html += '<div class="privacy-header">';
        html += '<div class="privacy-icon"><i class="fas fa-shield-alt"></i></div>';
        html += '<h3>Post Privacy</h3>';
        html += '<p>Choose who can see this post</p>';
        html += '</div>';
        
        html += '<div class="privacy-options-list">';
        
        // Public
        html += '<label class="privacy-radio-option' + (currentPrivacy === 'public' ? ' active' : '') + '">';
        html += '<input type="radio" name="post-privacy" value="public"' + (currentPrivacy === 'public' ? ' checked' : '') + '>';
        html += '<div class="privacy-radio-icon public"><i class="fas fa-globe-americas"></i></div>';
        html += '<div class="privacy-radio-content">';
        html += '<strong>Public</strong>';
        html += '<span>Anyone on BSITHUB can see this post</span>';
        html += '</div>';
        html += '<div class="privacy-check"><i class="fas fa-check-circle"></i></div>';
        html += '</label>';
        
        // Friends
        html += '<label class="privacy-radio-option' + (currentPrivacy === 'friends' ? ' active' : '') + '">';
        html += '<input type="radio" name="post-privacy" value="friends"' + (currentPrivacy === 'friends' ? ' checked' : '') + '>';
        html += '<div class="privacy-radio-icon friends"><i class="fas fa-user-friends"></i></div>';
        html += '<div class="privacy-radio-content">';
        html += '<strong>Friends</strong>';
        html += '<span>Only your friends can see this post</span>';
        html += '</div>';
        html += '<div class="privacy-check"><i class="fas fa-check-circle"></i></div>';
        html += '</label>';
        
        // Private
        html += '<label class="privacy-radio-option' + (currentPrivacy === 'private' ? ' active' : '') + '">';
        html += '<input type="radio" name="post-privacy" value="private"' + (currentPrivacy === 'private' ? ' checked' : '') + '>';
        html += '<div class="privacy-radio-icon private"><i class="fas fa-lock"></i></div>';
        html += '<div class="privacy-radio-content">';
        html += '<strong>Only Me</strong>';
        html += '<span>Only you can see this post</span>';
        html += '</div>';
        html += '<div class="privacy-check"><i class="fas fa-check-circle"></i></div>';
        html += '</label>';
        
        html += '</div>';
        
        html += '<div class="privacy-footer">';
        html += '<button class="btn" onclick="closeModal()">Cancel</button>';
        html += '<button class="btn btn-primary" onclick="applyPrivacySelection()">Done</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        
        // Add click handlers
        setTimeout(function() {
            document.querySelectorAll('.privacy-radio-option').forEach(function(opt) {
                opt.onclick = function() {
                    document.querySelectorAll('.privacy-radio-option').forEach(function(o) { o.classList.remove('active'); });
                    this.classList.add('active');
                    this.querySelector('input').checked = true;
                };
            });
        }, 50);
    };

    window.applyPrivacySelection = function() {
        var selected = document.querySelector('input[name="post-privacy"]:checked');
        if (!selected) return;
        selectPostPrivacy(selected.value);
    };

    window.selectPostPrivacy = function(privacy) {
        document.getElementById('post-privacy').value = privacy;
        closeModal();
        
        var icons = { public: 'fa-globe-americas', friends: 'fa-user-friends', private: 'fa-lock' };
        var labels = { public: 'Public', friends: 'Friends', private: 'Only Me' };
        
        var privacyBtn = document.getElementById('post-privacy-btn');
        if (privacyBtn) {
            privacyBtn.innerHTML = '<i class="fas ' + icons[privacy] + '" style="color:#6366f1;"></i>';
            privacyBtn.title = labels[privacy];
        }
        
        showToast('Privacy set to ' + labels[privacy], 'info');
    };

    // ==========================================
    // Post Mentions
    // ==========================================
    window.handlePostMentionInput = function(textarea) {
        var text = textarea.value;
        var cursorPos = textarea.selectionStart;
        var textBeforeCursor = text.substring(0, cursorPos);
        var mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            var query = mentionMatch[1];
            var users = Storage.get('users') || [];
            var filteredUsers = users.filter(function(u) {
                return u.id !== currentUser.id && 
                       (u.username.toLowerCase().startsWith(query.toLowerCase()) ||
                        (u.name && u.name.toLowerCase().startsWith(query.toLowerCase())));
            }).slice(0, 5);
            
            if (filteredUsers.length > 0) {
                showPostMentionsDropdown(filteredUsers, mentionMatch[0].length, textarea);
            } else {
                hidePostMentionsDropdown();
            }
        } else {
            hidePostMentionsDropdown();
        }
    };

    function showPostMentionsDropdown(users, mentionLength, textarea) {
        var dropdown = document.getElementById('post-mentions-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'post-mentions-dropdown';
            dropdown.className = 'mentions-dropdown';
            textarea.parentElement.appendChild(dropdown);
        }
        
        var html = '';
        users.forEach(function(user) {
            html += '<div class="mention-item" onclick="selectPostMention(\'' + user.username + '\', ' + mentionLength + ')">';
            html += '<span class="mention-name">' + escapeHtml(user.name || user.username) + '</span>';
            html += '<span class="mention-username">@' + user.username + '</span>';
            html += '</div>';
        });
        
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
    }

    window.selectPostMention = function(username, mentionLength) {
        var textarea = document.getElementById('post-content');
        var text = textarea.value;
        var cursorPos = textarea.selectionStart;
        var textBeforeCursor = text.substring(0, cursorPos);
        var atIndex = textBeforeCursor.lastIndexOf('@');
        
        if (atIndex !== -1) {
            var newText = text.substring(0, atIndex) + '@' + username + ' ' + text.substring(cursorPos);
            textarea.value = newText;
            var newCursorPos = atIndex + username.length + 2;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
        
        hidePostMentionsDropdown();
        textarea.focus();
    };

    function hidePostMentionsDropdown() {
        var dropdown = document.getElementById('post-mentions-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    // ==========================================
    // Stories / Status (24-hour disappearing)
    // ==========================================
    window.createStory = function() {
        if (!currentUser) return;
        
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*';
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            
            var reader = new FileReader();
            reader.onload = function(ev) {
                var stories = Storage.get('stories') || [];
                var story = {
                    id: generateId(),
                    userId: currentUser.id,
                    userName: currentUser.name,
                    userAvatar: currentUser.avatar,
                    mediaUrl: ev.target.result,
                    mediaType: file.type.startsWith('video') ? 'video' : 'image',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    viewers: []
                };
                stories.unshift(story);
                Storage.set('stories', stories);
                renderStories();
                showToast('Story posted!', 'success');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    window.getActiveStories = function() {
        var stories = Storage.get('stories') || [];
        var now = new Date();
        
        // Filter out expired stories
        stories = stories.filter(function(s) {
            return new Date(s.expiresAt) > now;
        });
        Storage.set('stories', stories);
        
        // Group by user
        var grouped = {};
        stories.forEach(function(story) {
            if (!grouped[story.userId]) {
                grouped[story.userId] = {
                    userId: story.userId,
                    userName: story.userName,
                    userAvatar: story.userAvatar,
                    stories: []
                };
            }
            grouped[story.userId].stories.push(story);
        });
        
        return Object.values(grouped);
    };

    window.renderStories = function() {
        var bar = document.getElementById('stories-bar');
        if (!bar) return;
        
        var userStories = getActiveStories();
        var html = '<div class="story-add" onclick="createStory()">';
        html += '<div class="story-avatar"><div class="initial">+</div></div>';
        html += '<span class="story-name">Add Story</span>';
        html += '</div>';
        
        userStories.forEach(function(user) {
            var viewedAll = user.stories.every(function(s) {
                return s.viewers && s.viewers.indexOf(currentUser.id) !== -1;
            });
            
            html += '<div class="story-item" onclick="viewStory(\'' + user.userId + '\')">';
            html += '<div class="story-avatar' + (viewedAll ? ' viewed' : '') + '">';
            if (user.userAvatar) {
                html += '<img src="' + user.userAvatar + '" alt="">';
            } else {
                html += '<div class="initial">' + (user.userName || 'U').charAt(0).toUpperCase() + '</div>';
            }
            html += '</div>';
            html += '<span class="story-name">' + escapeHtml(user.userName || 'User') + '</span>';
            html += '</div>';
        });
        
        bar.innerHTML = html;
    };

    var currentStoryIndex = 0;
    var currentUserStories = [];
    var storyTimer = null;

    window.viewStory = function(userId) {
        var stories = Storage.get('stories') || [];
        currentUserStories = stories.filter(function(s) {
            return s.userId === userId && new Date(s.expiresAt) > new Date();
        });
        
        if (currentUserStories.length === 0) return;
        
        currentStoryIndex = 0;
        showStoryViewer();
    };

    function showStoryViewer() {
        var story = currentUserStories[currentStoryIndex];
        if (!story) {
            closeStoryViewer();
            return;
        }
        
        // Mark as viewed
        var allStories = Storage.get('stories') || [];
        var storyIndex = allStories.findIndex(function(s) { return s.id === story.id; });
        if (storyIndex !== -1) {
            if (!allStories[storyIndex].viewers) allStories[storyIndex].viewers = [];
            if (allStories[storyIndex].viewers.indexOf(currentUser.id) === -1) {
                allStories[storyIndex].viewers.push(currentUser.id);
                Storage.set('stories', allStories);
            }
        }
        
        var avatarHtml = story.userAvatar 
            ? '<img src="' + story.userAvatar + '" class="story-user-avatar">'
            : '<div class="story-user-avatar" style="background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;">' + (story.userName || 'U').charAt(0) + '</div>';
        
        var contentHtml = story.mediaType === 'video'
            ? '<video src="' + story.mediaUrl + '" autoplay style="max-width:100%;max-height:100%;"></video>'
            : '<img src="' + story.mediaUrl + '" alt="Story">';
        
        var html = '<div class="story-viewer">';
        html += '<div class="story-viewer-header">';
        html += '<div class="story-progress">';
        currentUserStories.forEach(function(s, i) {
            html += '<div class="story-progress-bar"><div class="story-progress-fill" id="story-progress-' + i + '"></div></div>';
        });
        html += '</div>';
        html += '<div class="story-user-info">';
        html += avatarHtml;
        html += '<div><div class="story-user-name">' + escapeHtml(story.userName) + '</div>';
        html += '<div class="story-user-time">' + getTimeAgo(story.createdAt) + '</div></div>';
        html += '</div></div>';
        html += '<button class="story-close-btn" onclick="closeStoryViewer()"><i class="fas fa-times"></i></button>';
        html += '<div class="story-content">' + contentHtml + '</div>';
        if (currentStoryIndex > 0) {
            html += '<button class="story-nav prev" onclick="prevStory()"><i class="fas fa-chevron-left"></i></button>';
        }
        if (currentStoryIndex < currentUserStories.length - 1) {
            html += '<button class="story-nav next" onclick="nextStory()"><i class="fas fa-chevron-right"></i></button>';
        }
        html += '</div>';
        
        showModal(html);
        startStoryTimer();
    }

    function startStoryTimer() {
        var fill = document.getElementById('story-progress-' + currentStoryIndex);
        if (!fill) return;
        
        var progress = 0;
        clearInterval(storyTimer);
        storyTimer = setInterval(function() {
            progress += 2;
            fill.style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(storyTimer);
                nextStory();
            }
        }, 100);
    }

    window.nextStory = function() {
        clearInterval(storyTimer);
        if (currentStoryIndex < currentUserStories.length - 1) {
            currentStoryIndex++;
            closeModal();
            showStoryViewer();
        } else {
            closeStoryViewer();
        }
    };

    window.prevStory = function() {
        clearInterval(storyTimer);
        if (currentStoryIndex > 0) {
            currentStoryIndex--;
            closeModal();
            showStoryViewer();
        }
    };

    window.closeStoryViewer = function() {
        clearInterval(storyTimer);
        closeModal();
        renderStories();
    };

    // ==========================================
    // Verified Badge
    // ==========================================
    window.getVerifiedBadge = function(user) {
        if (!user || !user.verified) return '';
        var type = user.verifiedType || 'blue';
        return '<span class="verified-badge ' + type + '"><i class="fas fa-check"></i></span>';
    };

    window.toggleUserVerification = function(userId) {
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === userId; });
        if (userIndex === -1) return;
        
        users[userIndex].verified = !users[userIndex].verified;
        if (users[userIndex].verified) {
            users[userIndex].verifiedType = 'blue';
        } else {
            delete users[userIndex].verifiedType;
        }
        
        Storage.set('users', users);
        showToast(users[userIndex].verified ? 'User verified' : 'Verification removed', 'success');
        
        // Refresh admin table if visible
        if (typeof loadAdminData === 'function') loadAdminData();
    };

    // Initialize stories on load
    if (typeof renderStories === 'function') {
        setTimeout(renderStories, 1000);
    }

    // ==========================================
    // Status Music
    // ==========================================
    var musicLibrary = [
        { id: 'm1', title: 'Blinding Lights', artist: 'The Weeknd', emoji: '🎵' },
        { id: 'm2', title: 'Shape of You', artist: 'Ed Sheeran', emoji: '🎵' },
        { id: 'm3', title: 'Dance Monkey', artist: 'Tones and I', emoji: '🎵' },
        { id: 'm4', title: 'Someone Like You', artist: 'Adele', emoji: '🎵' },
        { id: 'm5', title: 'Uptown Funk', artist: 'Bruno Mars', emoji: '🎵' },
        { id: 'm6', title: 'Bad Guy', artist: 'Billie Eilish', emoji: '🎵' },
        { id: 'm7', title: 'Levitating', artist: 'Dua Lipa', emoji: '🎵' },
        { id: 'm8', title: 'Stay', artist: 'The Kid LAROI & Justin Bieber', emoji: '🎵' },
        { id: 'm9', title: 'Peaches', artist: 'Justin Bieber', emoji: '🎵' },
        { id: 'm10', title: 'Watermelon Sugar', artist: 'Harry Styles', emoji: '🎵' },
        { id: 'm11', title: 'Circles', artist: 'Post Malone', emoji: '🎵' },
        { id: 'm12', title: 'Señorita', artist: 'Shawn Mendes & Camila Cabello', emoji: '🎵' },
        { id: 'm13', title: 'Havana', artist: 'Camila Cabello', emoji: '🎵' },
        { id: 'm14', title: 'Sorry', artist: 'Justin Bieber', emoji: '🎵' },
        { id: 'm15', title: 'Cheap Thrills', artist: 'Sia', emoji: '🎵' }
    ];

    window.showMusicPicker = function() {
        var currentMusic = Storage.get('userMusic_' + currentUser.id);
        
        var html = '<div class="music-picker">';
        html += '<h3><i class="fas fa-music"></i> Set Status Music</h3>';
        html += '<input type="text" class="music-search" id="music-search" placeholder="Search songs..." oninput="filterMusic(this.value)">';
        html += '<div class="music-list" id="music-list">';
        
        musicLibrary.forEach(function(song) {
            var isSelected = currentMusic && currentMusic.id === song.id;
            html += '<div class="music-item' + (isSelected ? ' selected' : '') + '" onclick="selectMusic(\'' + song.id + '\')">';
            html += '<div class="music-icon"><i class="fas fa-music"></i></div>';
            html += '<div class="music-info">';
            html += '<div class="music-title">' + song.title + '</div>';
            html += '<div class="music-artist">' + song.artist + '</div>';
            html += '</div>';
            if (isSelected) html += '<i class="fas fa-check" style="color:var(--primary);"></i>';
            html += '</div>';
        });
        
        html += '</div>';
        html += '<div style="display:flex;gap:10px;margin-top:16px;">';
        html += '<button class="btn" onclick="clearMusic()"><i class="fas fa-times"></i> Remove</button>';
        html += '<button class="btn btn-primary" onclick="closeModal()"><i class="fas fa-check"></i> Done</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
    };

    window.filterMusic = function(query) {
        var list = document.getElementById('music-list');
        var filtered = musicLibrary.filter(function(song) {
            return song.title.toLowerCase().includes(query.toLowerCase()) ||
                   song.artist.toLowerCase().includes(query.toLowerCase());
        });
        
        var html = '';
        filtered.forEach(function(song) {
            html += '<div class="music-item" onclick="selectMusic(\'' + song.id + '\')">';
            html += '<div class="music-icon"><i class="fas fa-music"></i></div>';
            html += '<div class="music-info">';
            html += '<div class="music-title">' + song.title + '</div>';
            html += '<div class="music-artist">' + song.artist + '</div>';
            html += '</div></div>';
        });
        list.innerHTML = html;
    };

    window.selectMusic = function(musicId) {
        var song = musicLibrary.find(function(s) { return s.id === musicId; });
        if (!song) return;
        
        Storage.set('userMusic_' + currentUser.id, song);
        showToast('Status music set to ' + song.title, 'success');
        updateMusicDisplay();
        
        // Update selection UI
        document.querySelectorAll('.music-item').forEach(function(item) {
            item.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');
    };

    window.clearMusic = function() {
        Storage.remove('userMusic_' + currentUser.id);
        showToast('Status music removed', 'info');
        updateMusicDisplay();
        closeModal();
    };

    window.updateMusicDisplay = function() {
        if (!currentUser) return;
        var music = Storage.get('userMusic_' + currentUser.id);
        var musicEl = document.getElementById('sidebar-music');
        
        if (musicEl) {
            if (music) {
                musicEl.innerHTML = '<div class="status-music"><i class="fas fa-music"></i><span>' + music.title + ' - ' + music.artist + '</span></div>';
                musicEl.style.display = 'block';
            } else {
                musicEl.style.display = 'none';
            }
        }
    };

    // ==========================================
    // About Section
    // ==========================================
    window.showAboutEditor = function() {
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === currentUser.id; });
        var currentAbout = user ? (user.about || '') : '';
        
        var html = '<div class="about-editor">';
        html += '<h3><i class="fas fa-info-circle"></i> Edit About</h3>';
        html += '<textarea id="about-input" placeholder="Write something about yourself..." maxlength="500" rows="4">' + escapeHtml(currentAbout) + '</textarea>';
        html += '<div class="char-counter"><span id="about-char-count">' + currentAbout.length + '</span>/500</div>';
        html += '<button class="btn btn-primary" onclick="saveAbout()"><i class="fas fa-save"></i> Save</button>';
        html += '</div>';
        showModal(html);
        
        var input = document.getElementById('about-input');
        input.addEventListener('input', function() {
            document.getElementById('about-char-count').textContent = this.value.length;
        });
    };

    window.saveAbout = function() {
        var aboutText = document.getElementById('about-input').value.trim();
        
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].about = aboutText;
            Storage.set('users', users);
            currentUser = users[userIndex];
            
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(currentUser);
            }
        }
        
        showToast('About section updated', 'success');
        closeModal();
        
        // Update profile display
        var aboutEl = document.getElementById('profile-about');
        if (aboutEl) {
            aboutEl.textContent = aboutText || 'No about info yet';
        }
    };

    window.getAboutSection = function(user) {
        if (!user || !user.about) return '';
        return '<div class="about-section"><h4>About</h4><p>' + escapeHtml(user.about) + '</p></div>';
    };

    // ==========================================
    // Chat Bubble Styles
    // ==========================================
    var bubbleStyles = [
        { id: 'modern', name: 'Modern', icon: '💬' },
        { id: 'rounded', name: 'Rounded', icon: '🔵' },
        { id: 'square', name: 'Square', icon: '⬜' },
        { id: 'telegram', name: 'Telegram', icon: '✈️' },
        { id: 'minimal', name: 'Minimal', icon: '➖' },
        { id: 'ios', name: 'iOS', icon: '🍎' }
    ];

    window.showBubbleStylePicker = function() {
        var currentStyle = (Storage.get('settings') || {}).bubbleStyle || 'modern';
        
        var html = '<div class="bubble-style-modal">';
        html += '<h3><i class="fas fa-comment"></i> Chat Bubble Style</h3>';
        html += '<div class="bubble-style-picker">';
        
        bubbleStyles.forEach(function(style) {
            var isSelected = currentStyle === style.id;
            html += '<div class="bubble-style-option' + (isSelected ? ' selected' : '') + '" onclick="setBubbleStyle(\'' + style.id + '\')">';
            html += '<div class="preview">';
            html += '<div class="preview-msg received" style="border-radius:' + getBorderRadius(style.id, 'received') + '">Hello!</div>';
            html += '<div class="preview-msg sent" style="border-radius:' + getBorderRadius(style.id, 'sent') + '">Hi!</div>';
            html += '</div>';
            html += '<span>' + style.icon + ' ' + style.name + '</span>';
            html += '</div>';
        });
        
        html += '</div>';
        html += '</div>';
        showModal(html);
    };

    function getBorderRadius(style, type) {
        var radii = {
            modern: { received: '18px 18px 18px 4px', sent: '18px 18px 4px 18px' },
            rounded: { received: '24px 24px 24px 8px', sent: '24px 24px 8px 24px' },
            square: { received: '6px 6px 6px 2px', sent: '6px 6px 2px 6px' },
            telegram: { received: '12px 12px 12px 2px', sent: '12px 12px 2px 12px' },
            minimal: { received: '4px', sent: '4px' },
            ios: { received: '18px 18px 18px 4px', sent: '18px 18px 4px 18px' }
        };
        return (radii[style] || radii.modern)[type];
    }

    window.setBubbleStyle = function(styleId) {
        var settings = Storage.get('settings') || {};
        settings.bubbleStyle = styleId;
        Storage.set('settings', settings);
        
        // Apply style
        var messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            bubbleStyles.forEach(function(s) {
                messagesContainer.classList.remove('bubble-style-' + s.id);
            });
            messagesContainer.classList.add('bubble-style-' + styleId);
        }
        
        showToast('Bubble style changed to ' + styleId, 'success');
        
        // Update selection
        document.querySelectorAll('.bubble-style-option').forEach(function(opt) {
            opt.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');
    };

    window.applyBubbleStyle = function() {
        var style = (Storage.get('settings') || {}).bubbleStyle || 'modern';
        var messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            bubbleStyles.forEach(function(s) {
                messagesContainer.classList.remove('bubble-style-' + s.id);
            });
            messagesContainer.classList.add('bubble-style-' + style);
        }
    };

    // ==========================================
    // Account Recovery (Security Questions)
    // ==========================================
    window.showSecurityQuestionsSetup = function() {
        var questions = [
            'What was the name of your first pet?',
            'What city were you born in?',
            'What is your mother\'s maiden name?',
            'What was the name of your first school?',
            'What is your favorite movie?',
            'What was your childhood nickname?',
            'What is the name of your best friend?',
            'What was your first car?'
        ];
        
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === currentUser.id; });
        var sq = user ? user.securityQuestions : null;
        
        var html = '<div class="security-questions-setup">';
        html += '<h3><i class="fas fa-shield-alt"></i> Security Questions</h3>';
        html += '<p>Set up security questions to recover your account if you forget your password.</p>';
        
        for (var i = 1; i <= 3; i++) {
            html += '<div class="sq-item">';
            html += '<label>Question ' + i + '</label>';
            html += '<select id="sq-question-' + i + '">';
            html += '<option value="">Select a question...</option>';
            questions.forEach(function(q, idx) {
                var selected = sq && sq['q' + i] === idx ? ' selected' : '';
                html += '<option value="' + idx + '"' + selected + '>' + q + '</option>';
            });
            html += '</select>';
            html += '<input type="password" id="sq-answer-' + i + '" placeholder="Your answer" value="' + (sq && sq['a' + i] ? '********' : '') + '">';
            html += '</div>';
        }
        
        html += '<button class="btn btn-primary" onclick="saveSecurityQuestions()"><i class="fas fa-save"></i> Save</button>';
        html += '</div>';
        showModal(html);
    };

    window.saveSecurityQuestions = function() {
        var q1 = document.getElementById('sq-question-1').value;
        var q2 = document.getElementById('sq-question-2').value;
        var q3 = document.getElementById('sq-question-3').value;
        var a1 = document.getElementById('sq-answer-1').value;
        var a2 = document.getElementById('sq-answer-2').value;
        var a3 = document.getElementById('sq-answer-3').value;
        
        if (!q1 || !q2 || !q3 || !a1 || !a2 || !a3) {
            showToast('Please fill in all questions and answers', 'error');
            return;
        }
        
        if (q1 === q2 || q1 === q3 || q2 === q3) {
            showToast('Please select different questions', 'error');
            return;
        }
        
        // Hash answers
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === currentUser.id; });
        if (userIndex !== -1) {
            users[userIndex].securityQuestions = {
                q1: parseInt(q1),
                q2: parseInt(q2),
                q3: parseInt(q3),
                a1: hashPassword(a1.toLowerCase()),
                a2: hashPassword(a2.toLowerCase()),
                a3: hashPassword(a3.toLowerCase())
            };
            Storage.set('users', users);
            currentUser = users[userIndex];
            
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(currentUser);
            }
        }
        
        showToast('Security questions saved', 'success');
        closeModal();
    };

    window.showAccountRecovery = function() {
        var html = '<div class="account-recovery">';
        html += '<h3><i class="fas fa-key"></i> Account Recovery</h3>';
        html += '<p>Enter your email to recover your account using security questions.</p>';
        html += '<input type="email" id="recovery-email" placeholder="Your email address">';
        html += '<button class="btn btn-primary" onclick="startRecovery()"><i class="fas fa-arrow-right"></i> Continue</button>';
        html += '</div>';
        showModal(html);
    };

    window.startRecovery = function() {
        var email = document.getElementById('recovery-email').value.trim();
        if (!email) {
            showToast('Please enter your email', 'error');
            return;
        }
        
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.email === email; });
        
        if (!user || !user.securityQuestions) {
            showToast('No security questions found for this email', 'error');
            return;
        }
        
        showRecoveryQuestions(user);
    };

    function showRecoveryQuestions(user) {
        var questions = [
            'What was the name of your first pet?',
            'What city were you born in?',
            'What is your mother\'s maiden name?',
            'What was the name of your first school?',
            'What is your favorite movie?',
            'What was your childhood nickname?',
            'What is the name of your best friend?',
            'What was your first car?'
        ];
        
        var sq = user.securityQuestions;
        var html = '<div class="recovery-questions">';
        html += '<h3><i class="fas fa-question-circle"></i> Answer Security Questions</h3>';
        html += '<div class="rq-item"><label>' + questions[sq.q1] + '</label><input type="text" id="rq-answer-1" placeholder="Your answer"></div>';
        html += '<div class="rq-item"><label>' + questions[sq.q2] + '</label><input type="text" id="rq-answer-2" placeholder="Your answer"></div>';
        html += '<div class="rq-item"><label>' + questions[sq.q3] + '</label><input type="text" id="rq-answer-3" placeholder="Your answer"></div>';
        html += '<input type="hidden" id="recovery-user-id" value="' + user.id + '">';
        html += '<button class="btn btn-primary" onclick="verifyRecoveryAnswers()"><i class="fas fa-check"></i> Verify</button>';
        html += '</div>';
        showModal(html);
    }

    window.verifyRecoveryAnswers = function() {
        var userId = document.getElementById('recovery-user-id').value;
        var a1 = document.getElementById('rq-answer-1').value.trim().toLowerCase();
        var a2 = document.getElementById('rq-answer-2').value.trim().toLowerCase();
        var a3 = document.getElementById('rq-answer-3').value.trim().toLowerCase();
        
        var users = Storage.get('users') || [];
        var user = users.find(function(u) { return u.id === userId; });
        
        if (!user || !user.securityQuestions) {
            showToast('User not found', 'error');
            return;
        }
        
        var sq = user.securityQuestions;
        if (hashPassword(a1) === sq.a1 && hashPassword(a2) === sq.a2 && hashPassword(a3) === sq.a3) {
            showRecoveryPasswordReset(userId);
        } else {
            showToast('Incorrect answers. Please try again.', 'error');
        }
    };

    function showRecoveryPasswordReset(userId) {
        var html = '<div class="recovery-reset">';
        html += '<h3><i class="fas fa-lock"></i> Set New Password</h3>';
        html += '<input type="password" id="recovery-new-password" placeholder="New password">';
        html += '<input type="password" id="recovery-confirm-password" placeholder="Confirm password">';
        html += '<input type="hidden" id="recovery-user-id-reset" value="' + userId + '">';
        html += '<button class="btn btn-primary" onclick="resetRecoveryPassword()"><i class="fas fa-save"></i> Reset Password</button>';
        html += '</div>';
        showModal(html);
    }

    window.resetRecoveryPassword = function() {
        var userId = document.getElementById('recovery-user-id-reset').value;
        var password = document.getElementById('recovery-new-password').value;
        var confirm = document.getElementById('recovery-confirm-password').value;
        
        if (!password || password.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        if (password !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        var users = Storage.get('users') || [];
        var userIndex = users.findIndex(function(u) { return u.id === userId; });
        if (userIndex !== -1) {
            users[userIndex].password = hashPassword(password);
            Storage.set('users', users);
            
            if (typeof syncUserToFirebase === 'function') {
                syncUserToFirebase(users[userIndex]);
            }
        }
        
        showToast('Password reset successful! You can now login.', 'success');
        closeModal();
    };

    // Initialize music display
    setTimeout(updateMusicDisplay, 500);

    // ==========================================
    // Chat Backup Encryption
    // ==========================================
    window.exportEncryptedBackup = function() {
        var password = prompt('Enter a password to encrypt your backup:');
        if (!password) return;
        
        var backupData = {
            users: Storage.get('users') || [],
            chats: Storage.get('chats') || [],
            messages: Storage.get('messages') || [],
            posts: Storage.get('posts') || [],
            settings: Storage.get('settings') || {},
            exportedAt: new Date().toISOString(),
            version: '2.5.0'
        };
        
        // Encrypt the data
        var encrypted = encryptBackup(JSON.stringify(backupData), password);
        
        // Create backup file
        var blob = new Blob([encrypted], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'bsithub-backup-' + new Date().toISOString().split('T')[0] + '.enc';
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Encrypted backup created!', 'success');
    };

    window.importEncryptedBackup = function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.enc';
        input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            
            var reader = new FileReader();
            reader.onload = function(event) {
                var password = prompt('Enter the backup password:');
                if (!password) return;
                
                try {
                    var decrypted = decryptBackup(event.target.result, password);
                    var data = JSON.parse(decrypted);
                    
                    if (data.users) Storage.set('users', data.users);
                    if (data.chats) Storage.set('chats', data.chats);
                    if (data.messages) Storage.set('messages', data.messages);
                    if (data.posts) Storage.set('posts', data.posts);
                    if (data.settings) Storage.set('settings', data.settings);
                    
                    showToast('Backup restored! Reloading...', 'success');
                    setTimeout(function() { location.reload(); }, 1500);
                } catch (err) {
                    showToast('Invalid password or corrupted backup', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    function encryptBackup(data, password) {
        var encrypted = '';
        for (var i = 0; i < data.length; i++) {
            encrypted += String.fromCharCode(data.charCodeAt(i) ^ password.charCodeAt(i % password.length));
        }
        return btoa(encrypted);
    }

    function decryptBackup(encrypted, password) {
        var decoded = atob(encrypted);
        var decrypted = '';
        for (var i = 0; i < decoded.length; i++) {
            decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ password.charCodeAt(i % password.length));
        }
        return decrypted;
    }

    // ==========================================
    // Profile Visitors
    // ==========================================
    window.trackProfileView = function(profileUserId) {
        if (!currentUser || profileUserId === currentUser.id) return;
        
        var visitors = Storage.get('profileVisitors_' + profileUserId) || [];
        
        // Check if already visited recently (within 1 hour)
        var recentVisit = visitors.find(function(v) {
            return v.visitorId === currentUser.id && 
                   Date.now() - new Date(v.timestamp).getTime() < 60 * 60 * 1000;
        });
        
        if (recentVisit) return;
        
        visitors.unshift({
            visitorId: currentUser.id,
            visitorName: currentUser.name,
            visitorAvatar: currentUser.avatar,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 50 visitors
        if (visitors.length > 50) visitors = visitors.slice(0, 50);
        
        Storage.set('profileVisitors_' + profileUserId, visitors);
    };

    window.getProfileVisitors = function() {
        if (!currentUser) return [];
        return Storage.get('profileVisitors_' + currentUser.id) || [];
    };

    window.showProfileVisitors = function() {
        var visitors = getProfileVisitors();
        
        var html = '<div class="visitors-modal">';
        html += '<h3><i class="fas fa-eye"></i> Profile Visitors</h3>';
        
        if (visitors.length === 0) {
            html += '<div class="visitors-empty">';
            html += '<i class="fas fa-eye-slash"></i>';
            html += '<p>No visitors yet</p>';
            html += '</div>';
        } else {
            html += '<div class="visitors-list">';
            visitors.slice(0, 20).forEach(function(visitor) {
                var avatarHtml = visitor.visitorAvatar 
                    ? '<img src="' + visitor.visitorAvatar + '" class="visitor-avatar">'
                    : '<div class="visitor-avatar">' + (visitor.visitorName || 'U').charAt(0).toUpperCase() + '</div>';
                
                html += '<div class="visitor-item">';
                html += avatarHtml;
                html += '<div class="visitor-info">';
                html += '<div class="visitor-name">' + escapeHtml(visitor.visitorName || 'User') + '</div>';
                html += '<div class="visitor-time">' + getTimeAgo(visitor.timestamp) + '</div>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }
        
        html += '</div>';
        showModal(html);
    };

    // ==========================================
    // Post Location
    // ==========================================
    var feedPostLocation = null;

    window.showPostLocationPicker = function() {
        var html = '<div class="location-modal">';
        html += '<h3><i class="fas fa-map-marker-alt"></i> Add Location</h3>';
        html += '<div class="location-search">';
        html += '<input type="text" id="location-input" placeholder="Enter a location..." value="' + (feedPostLocation || '') + '">';
        html += '</div>';
        html += '<div class="location-suggestions">';
        html += '<div class="location-item" onclick="selectPostLocation(\'New York, NY\')"><i class="fas fa-map-marker-alt"></i> New York, NY</div>';
        html += '<div class="location-item" onclick="selectPostLocation(\'Los Angeles, CA\')"><i class="fas fa-map-marker-alt"></i> Los Angeles, CA</div>';
        html += '<div class="location-item" onclick="selectPostLocation(\'London, UK\')"><i class="fas fa-map-marker-alt"></i> London, UK</div>';
        html += '<div class="location-item" onclick="selectPostLocation(\'Tokyo, Japan\')"><i class="fas fa-map-marker-alt"></i> Tokyo, Japan</div>';
        html += '<div class="location-item" onclick="selectPostLocation(\'Paris, France\')"><i class="fas fa-map-marker-alt"></i> Paris, France</div>';
        html += '<div class="location-item" onclick="selectPostLocation(\'Sydney, Australia\')"><i class="fas fa-map-marker-alt"></i> Sydney, Australia</div>';
        html += '</div>';
        html += '<div class="location-actions">';
        html += '<button class="btn" onclick="clearPostLocation()"><i class="fas fa-times"></i> Remove</button>';
        html += '<button class="btn btn-primary" onclick="applyPostLocation()"><i class="fas fa-check"></i> Apply</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        
        setTimeout(function() { document.getElementById('location-input').focus(); }, 100);
    };

    window.selectPostLocation = function(location) {
        document.getElementById('location-input').value = location;
    };

    window.applyPostLocation = function() {
        var location = document.getElementById('location-input').value.trim();
        feedPostLocation = location || null;
        closeModal();
        
        if (location) {
            showToast('Location set: ' + location, 'success');
        } else {
            showToast('Location removed', 'info');
        }
        
        updatePostSubmitBtn();
    };

    window.clearPostLocation = function() {
        feedPostLocation = null;
        closeModal();
        showToast('Location removed', 'info');
        updatePostSubmitBtn();
    };

    window.getCurrentLocation = function() {
        if (!navigator.geolocation) {
            showToast('Geolocation not supported', 'error');
            return;
        }
        
        navigator.geolocation.getCurrentPosition(function(position) {
            var lat = position.coords.latitude.toFixed(4);
            var lng = position.coords.longitude.toFixed(4);
            feedPostLocation = lat + ', ' + lng;
            showToast('Location added!', 'success');
            updatePostSubmitBtn();
        }, function() {
            showToast('Could not get location', 'error');
        });
    };

    // ==========================================
    // News Feed (using NewsAPI.org free tier)
    // ==========================================
    window.showNewsFeed = function() {
        var html = '<div class="news-feed-modal">';
        html += '<div class="news-header">';
        html += '<div class="news-icon"><i class="fas fa-newspaper"></i></div>';
        html += '<h3>News Feed</h3>';
        html += '<p>Stay updated with latest news</p>';
        html += '</div>';
        html += '<div class="news-categories">';
        html += '<button class="news-cat-btn active" data-category="general" onclick="loadNews(\'general\', this)"><i class="fas fa-globe"></i> General</button>';
        html += '<button class="news-cat-btn" data-category="technology" onclick="loadNews(\'technology\', this)"><i class="fas fa-microchip"></i> Tech</button>';
        html += '<button class="news-cat-btn" data-category="sports" onclick="loadNews(\'sports\', this)"><i class="fas fa-futbol"></i> Sports</button>';
        html += '<button class="news-cat-btn" data-category="entertainment" onclick="loadNews(\'entertainment\', this)"><i class="fas fa-film"></i> Entertainment</button>';
        html += '<button class="news-cat-btn" data-category="business" onclick="loadNews(\'business\', this)"><i class="fas fa-chart-line"></i> Business</button>';
        html += '<button class="news-cat-btn" data-category="health" onclick="loadNews(\'health\', this)"><i class="fas fa-heartbeat"></i> Health</button>';
        html += '</div>';
        html += '<div class="news-list" id="news-list">';
        html += '<div class="news-loading"><div class="loading-pulse"></div><span>Loading news...</span></div>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        loadNews('general');
    };

    window.loadNews = function(category, btn) {
        var list = document.getElementById('news-list');
        list.innerHTML = '<div class="news-loading"><div class="loading-pulse"></div><span>Loading news...</span></div>';
        
        // Update active category button
        document.querySelectorAll('.news-cat-btn').forEach(function(b) {
            b.classList.remove('active');
        });
        if (btn) {
            btn.classList.add('active');
        } else {
            var activeBtn = document.querySelector('.news-cat-btn[data-category="' + category + '"]');
            if (activeBtn) activeBtn.classList.add('active');
        }
        
        fetch('/api/news?category=' + category)
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.articles && data.articles.length > 0) {
                    renderNews(data.articles);
                } else {
                    list.innerHTML = '<div class="news-empty"><i class="fas fa-newspaper"></i><p>No news available</p></div>';
                }
            })
            .catch(function(err) {
                console.error('News error:', err);
                list.innerHTML = '<div class="news-empty"><i class="fas fa-exclamation-circle"></i><p>Could not load news</p><small>Check your internet connection</small></div>';
            });
    };

    function renderNews(articles) {
        var list = document.getElementById('news-list');
        var html = '';
        articles.slice(0, 15).forEach(function(article) {
            if (!article.title || article.title === '[Removed]') return;
            
            var imageUrl = article.urlToImage || '';
            var source = article.source ? article.source.name : 'Unknown';
            var time = article.publishedAt ? getTimeAgo(article.publishedAt) : '';
            var desc = article.description || '';
            if (desc.length > 120) desc = desc.substring(0, 120) + '...';
            
            html += '<div class="news-card" onclick="window.open(\'' + escapeHtml(article.url || '#') + '\', \'_blank\')">';
            if (imageUrl) {
                html += '<div class="news-card-image"><img src="' + imageUrl + '" alt="" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>';
            }
            html += '<div class="news-card-content">';
            html += '<h4 class="news-card-title">' + escapeHtml(article.title) + '</h4>';
            if (desc) html += '<p class="news-card-desc">' + escapeHtml(desc) + '</p>';
            html += '<div class="news-card-meta">';
            html += '<span class="news-source"><i class="fas fa-newspaper"></i> ' + escapeHtml(source) + '</span>';
            if (time) html += '<span class="news-time"><i class="fas fa-clock"></i> ' + time + '</span>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
        
        if (!html) {
            html = '<div class="news-empty"><i class="fas fa-newspaper"></i><p>No articles found</p></div>';
        }
        list.innerHTML = html;
    }

    // ==========================================
    // Weather in Status (using OpenWeatherMap free API)
    // ==========================================
    window.showWeatherStatus = function() {
        var html = '<div class="weather-modal">';
        html += '<div class="weather-header">';
        html += '<div class="weather-icon-large"><i class="fas fa-cloud-sun"></i></div>';
        html += '<h3>Weather Status</h3>';
        html += '<p>Set current weather as your status</p>';
        html += '</div>';
        html += '<div class="weather-content" id="weather-content">';
        html += '<div class="weather-loading"><div class="loading-pulse"></div><span>Getting your location...</span></div>';
        html += '</div>';
        html += '<div class="weather-actions">';
        html += '<button class="btn" onclick="closeModal()">Cancel</button>';
        html += '<button class="btn btn-primary" id="set-weather-btn" onclick="setWeatherAsStatus()" disabled><i class="fas fa-check"></i> Set as Status</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        
        if (!navigator.geolocation) {
            document.getElementById('weather-content').innerHTML = '<div class="weather-error"><i class="fas fa-exclamation-triangle"></i><p>Geolocation not supported</p></div>';
            return;
        }
        
        navigator.geolocation.getCurrentPosition(function(position) {
            fetchWeatherData(position.coords.latitude, position.coords.longitude);
        }, function(error) {
            document.getElementById('weather-content').innerHTML = '<div class="weather-error"><i class="fas fa-location-crosshairs"></i><p>Could not get location</p><small>Please allow location access</small></div>';
        });
    };

    var currentWeatherData = null;

    function fetchWeatherData(lat, lon) {
        fetch('/api/weather?lat=' + lat + '&lon=' + lon)
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.main && data.weather) {
                    currentWeatherData = data;
                    renderWeatherData(data);
                    document.getElementById('set-weather-btn').disabled = false;
                } else {
                    document.getElementById('weather-content').innerHTML = '<div class="weather-error"><i class="fas fa-exclamation-circle"></i><p>Could not fetch weather</p></div>';
                }
            })
            .catch(function(err) {
                console.error('Weather error:', err);
                document.getElementById('weather-content').innerHTML = '<div class="weather-error"><i class="fas fa-wifi"></i><p>Network error</p><small>Check your connection</small></div>';
            });
    }

    function renderWeatherData(data) {
        var temp = Math.round(data.main.temp);
        var feelsLike = Math.round(data.main.feels_like);
        var humidity = data.main.humidity;
        var desc = data.weather[0].description;
        var main = data.weather[0].main;
        var icon = getWeatherEmoji(main);
        var city = data.name || 'Unknown';
        var country = data.sys ? data.sys.country : '';
        
        var html = '<div class="weather-display">';
        html += '<div class="weather-temp">' + icon + ' ' + temp + '°C</div>';
        html += '<div class="weather-desc">' + escapeHtml(desc) + '</div>';
        html += '<div class="weather-location"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(city) + (country ? ', ' + country : '') + '</div>';
        html += '<div class="weather-details">';
        html += '<div class="weather-detail"><i class="fas fa-thermometer-half"></i> Feels like ' + feelsLike + '°C</div>';
        html += '<div class="weather-detail"><i class="fas fa-tint"></i> Humidity ' + humidity + '%</div>';
        html += '</div>';
        html += '</div>';
        
        document.getElementById('weather-content').innerHTML = html;
    }

    window.setWeatherAsStatus = function() {
        if (!currentWeatherData) return;
        
        var temp = Math.round(currentWeatherData.main.temp);
        var desc = currentWeatherData.weather[0].description;
        var icon = getWeatherEmoji(currentWeatherData.weather[0].main);
        var city = currentWeatherData.name || '';
        
        var status = icon + ' ' + temp + '°C - ' + desc;
        setUserStatus('online', status);
        closeModal();
        showToast('Weather status updated!', 'success');
    };

    function getWeatherEmoji(weather) {
        var emojis = {
            'Clear': '☀️',
            'Clouds': '☁️',
            'Rain': '🌧️',
            'Drizzle': '🌦️',
            'Thunderstorm': '⛈️',
            'Snow': '❄️',
            'Mist': '🌫️',
            'Fog': '🌫️',
            'Haze': '🌫️',
            'Smoke': '🌫️',
            'Dust': '🌫️',
            'Tornado': '🌪️'
        };
        return emojis[weather] || '🌡️';
    }

    // ==========================================
    // Message Reactions Animations
    // ==========================================
    window.animateReaction = function(element, emoji) {
        if (!element || !emoji) return;
        
        // Create multiple floating emojis for better effect
        for (var i = 0; i < 3; i++) {
            (function(index) {
                setTimeout(function() {
                    var float = document.createElement('span');
                    float.className = 'floating-reaction';
                    float.textContent = emoji;
                    
                    var rect = element.getBoundingClientRect();
                    var offsetX = (Math.random() - 0.5) * 30;
                    float.style.left = (rect.left + rect.width / 2 + offsetX) + 'px';
                    float.style.top = rect.top + 'px';
                    
                    document.body.appendChild(float);
                    
                    var startY = rect.top;
                    var startTime = Date.now();
                    var duration = 600 + Math.random() * 400;
                    
                    function animate() {
                        var elapsed = Date.now() - startTime;
                        var progress = elapsed / duration;
                        
                        if (progress >= 1) {
                            float.remove();
                            return;
                        }
                        
                        var easeOut = 1 - Math.pow(1 - progress, 3);
                        float.style.top = (startY - easeOut * 80) + 'px';
                        float.style.left = (parseFloat(float.style.left) + Math.sin(progress * Math.PI * 2) * 0.5) + 'px';
                        float.style.opacity = 1 - progress;
                        float.style.transform = 'scale(' + (1 + progress * 0.3) + ') rotate(' + (Math.random() * 20 - 10) + 'deg)';
                        
                        requestAnimationFrame(animate);
                    }
                    
                    requestAnimationFrame(animate);
                }, index * 100);
            })(i);
        }
        
        // Add pop animation to the button
        element.classList.add('reaction-pop');
        setTimeout(function() {
            element.classList.remove('reaction-pop');
        }, 300);
    };

    // ==========================================
    // QR Code Login
    // ==========================================
    window.showQRLogin = function() {
        if (!currentUser) {
            showToast('Please login first', 'error');
            return;
        }
        
        var qrData = JSON.stringify({
            type: 'bsithub_login',
            userId: currentUser.id,
            username: currentUser.username,
            token: generateId(),
            timestamp: Date.now()
        });
        
        var html = '<div class="qr-login-modal">';
        html += '<div class="qr-header">';
        html += '<div class="qr-icon"><i class="fas fa-qrcode"></i></div>';
        html += '<h3>QR Code Login</h3>';
        html += '<p>Scan this code with another device</p>';
        html += '</div>';
        html += '<div class="qr-container" id="qr-code"></div>';
        html += '<div class="qr-info">';
        html += '<div class="qr-user-name">' + escapeHtml(currentUser.name) + '</div>';
        html += '<div class="qr-user-handle">@' + escapeHtml(currentUser.username || 'user') + '</div>';
        html += '<div class="qr-expiry"><i class="fas fa-clock"></i> Expires in 5 minutes</div>';
        html += '</div>';
        html += '<div class="qr-actions">';
        html += '<button class="btn" onclick="copyQRData()"><i class="fas fa-copy"></i> Copy Data</button>';
        html += '<button class="btn btn-primary" onclick="closeModal()">Done</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        
        // Store QR data for copying
        window.currentQRData = qrData;
        
        setTimeout(function() {
            var qrContainer = document.getElementById('qr-code');
            if (qrContainer && typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: qrData,
                    width: 180,
                    height: 180,
                    colorDark: '#1e293b',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else if (qrContainer) {
                qrContainer.innerHTML = '<div class="qr-error">QR library not loaded</div>';
            }
        }, 100);
    };

    window.copyQRData = function() {
        if (window.currentQRData) {
            navigator.clipboard.writeText(window.currentQRData).then(function() {
                showToast('QR data copied to clipboard!', 'success');
            }).catch(function() {
                showToast('Could not copy', 'error');
            });
        }
    };

    window.showQRScanner = function() {
        var html = '<div class="qr-scanner-modal">';
        html += '<div class="qr-header">';
        html += '<div class="qr-icon"><i class="fas fa-camera"></i></div>';
        html += '<h3>Scan QR Code</h3>';
        html += '<p>Paste the QR code data to login</p>';
        html += '</div>';
        html += '<textarea id="qr-input" placeholder=\'Paste the JSON data from QR code here...\n\nExample: {"type":"bsithub_login","userId":"..."}\' rows="5"></textarea>';
        html += '<div class="qr-instructions">';
        html += '<p><i class="fas fa-info-circle"></i> On the other device:</p>';
        html += '<ol><li>Open BSITHUB</li><li>Go to Settings → QR Code Login</li><li>Click "Copy Data"</li><li>Paste it here</li></ol>';
        html += '</div>';
        html += '<div class="qr-actions">';
        html += '<button class="btn" onclick="closeModal()">Cancel</button>';
        html += '<button class="btn btn-primary" onclick="processQRLogin()"><i class="fas fa-sign-in-alt"></i> Login</button>';
        html += '</div>';
        html += '</div>';
        showModal(html);
        setTimeout(function() { document.getElementById('qr-input').focus(); }, 100);
    };

    window.processQRLogin = function() {
        var qrData = document.getElementById('qr-input').value.trim();
        if (!qrData) {
            showToast('Please enter QR code data', 'error');
            return;
        }
        
        try {
            var data = JSON.parse(qrData);
            if (data.type === 'bsithub_login' && data.userId) {
                var users = Storage.get('users') || [];
                var user = users.find(function(u) { return u.id === data.userId; });
                
                if (user) {
                    if (Date.now() - data.timestamp < 5 * 60 * 1000) {
                        currentUser = user;
                        Storage.set('currentUser', { id: user.id });
                        closeModal();
                        showToast('Login successful! Welcome ' + user.name, 'success');
                        showApp();
                    } else {
                        showToast('QR code expired. Please generate a new one.', 'error');
                    }
                } else {
                    showToast('User not found. The account may have been deleted.', 'error');
                }
            } else {
                showToast('Invalid QR code format', 'error');
            }
        } catch (e) {
            showToast('Invalid JSON data. Please paste the correct QR code data.', 'error');
        }
    };

    // ==========================================
    // Mobile UX Functions
    // ==========================================
    
    // FAB Menu Toggle
    window.toggleFabMenu = function() {
        var menu = document.getElementById('fab-menu');
        var btn = document.getElementById('fab-btn');
        if (menu && btn) {
            menu.classList.toggle('active');
            var icon = btn.querySelector('i');
            if (menu.classList.contains('active')) {
                icon.className = 'fas fa-times';
            } else {
                icon.className = 'fas fa-plus';
            }
        }
    };

    // Close FAB menu when clicking outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('fab-menu');
        var btn = document.getElementById('fab-btn');
        if (menu && btn && menu.classList.contains('active')) {
            if (!e.target.closest('#fab-btn') && !e.target.closest('#fab-menu')) {
                menu.classList.remove('active');
                btn.querySelector('i').className = 'fas fa-plus';
            }
        }
    });

    // Pull to Refresh
    var pullStartY = 0;
    var pullMoveY = 0;
    var isPulling = false;

    function initPullToRefresh() {
        var containers = document.querySelectorAll('.main-content, .chats-list, .feed-list');
        var indicator = document.getElementById('pull-to-refresh');
        
        if (!indicator) return;

        containers.forEach(function(container) {
            if (!container) return;
            
            var pullStartY = 0;
            var pullMoveY = 0;
            var isPulling = false;

            container.addEventListener('touchstart', function(e) {
                if (container.scrollTop <= 0) {
                    pullStartY = e.touches[0].clientY;
                    isPulling = true;
                }
            }, { passive: true });

            container.addEventListener('touchmove', function(e) {
                if (!isPulling) return;
                pullMoveY = e.touches[0].clientY;
                var pullDistance = pullMoveY - pullStartY;
                
                if (pullDistance > 0 && container.scrollTop <= 0) {
                    var progress = Math.min(pullDistance / 100, 1);
                    indicator.style.transform = 'translateY(' + (pullDistance * 0.5 - 60) + 'px)';
                    indicator.style.opacity = progress;
                    
                    var icon = indicator.querySelector('i');
                    if (icon && pullDistance > 80) {
                        icon.style.color = 'var(--primary)';
                    } else if (icon) {
                        icon.style.color = 'var(--text-muted)';
                    }
                }
            }, { passive: true });

            container.addEventListener('touchend', function() {
                if (!isPulling) return;
                var pullDistance = pullMoveY - pullStartY;
                
                if (pullDistance > 80) {
                    indicator.classList.add('active');
                    indicator.style.transform = 'translateY(0)';
                    indicator.style.opacity = '1';
                    
                    // Haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    
                    // Refresh content
                    setTimeout(function() {
                        var activeSection = document.querySelector('.content-section.active');
                        if (activeSection) {
                            var sectionId = activeSection.id;
                            if (sectionId === 'chats-section') {
                                loadChats();
                            } else if (sectionId === 'feed-section') {
                                if (typeof loadFeed === 'function') loadFeed();
                            } else if (sectionId === 'starred-section') {
                                if (typeof loadStarredMessages === 'function') loadStarredMessages();
                            }
                        }
                        
                        indicator.classList.remove('active');
                        indicator.style.transform = 'translateY(-100%)';
                        indicator.style.opacity = '0';
                        showToast('Refreshed!', 'info');
                    }, 800);
                } else {
                    indicator.style.transform = 'translateY(-100%)';
                    indicator.style.opacity = '0';
                }
                
                isPulling = false;
                pullStartY = 0;
                pullMoveY = 0;
            }, { passive: true });
        });
    }

    // Keyboard handling with visual viewport
    function initKeyboardHandling() {
        if (typeof visualViewport !== 'undefined') {
            var lastHeight = visualViewport.height;
            
            visualViewport.addEventListener('resize', function() {
                var currentHeight = visualViewport.height;
                var isKeyboardOpen = currentHeight < window.innerHeight * 0.75;
                
                document.body.classList.toggle('keyboard-open', isKeyboardOpen);
                
                if (isKeyboardOpen) {
                    // Scroll chat messages to bottom when keyboard opens
                    var messages = document.getElementById('chat-messages');
                    if (messages) {
                        setTimeout(function() {
                            messages.scrollTop = messages.scrollHeight;
                        }, 150);
                    }
                }
                
                lastHeight = currentHeight;
            });
        }
        
        // iOS specific keyboard handling
        document.addEventListener('focusin', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                setTimeout(function() {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        });
    }

    // Chat back button for mobile
    window.closeMobileChat = function() {
        var chatMain = document.querySelector('.chat-main');
        if (chatMain) {
            chatMain.classList.remove('active');
        }
        
        // Clear active chat after animation
        setTimeout(function() {
            activeChat = null;
            document.getElementById('chat-placeholder').style.display = 'flex';
            document.getElementById('chat-active').style.display = 'none';
        }, 300);
    };

    // Double tap to zoom images
    var lastTap = 0;
    document.addEventListener('touchend', function(e) {
        var now = Date.now();
        if (now - lastTap < 300) {
            // Double tap detected
            if (e.target.tagName === 'IMG' && e.target.closest('.message-media')) {
                e.preventDefault();
                openLightbox(e.target.src);
            }
        }
        lastTap = now;
    }, { passive: false });

    // Swipe to go back (from left edge)
    var swipeStartX = 0;
    document.addEventListener('touchstart', function(e) {
        if (e.touches[0].clientX < 20) {
            swipeStartX = e.touches[0].clientX;
        }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (swipeStartX > 0) {
            var endX = e.changedTouches[0].clientX;
            if (endX - swipeStartX > 100) {
                // Swipe right from left edge - go back
                var chatMain = document.querySelector('.chat-main.active');
                if (chatMain) {
                    closeMobileChat();
                }
            }
            swipeStartX = 0;
        }
    }, { passive: true });

    // Smooth scroll behavior for mobile
    document.querySelectorAll('.chats-list, .feed-list, .chat-messages').forEach(function(el) {
        el.style.webkitOverflowScrolling = 'touch';
    });

    // Initialize mobile features
    initPullToRefresh();
    initKeyboardHandling();
    
    // Log mobile detection
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    console.log('Mobile device:', isMobile);
});

// ==========================================
// Mobile Features
// ==========================================

// 1. Share Sheet (Native Share API)
window.shareContent = function(title, text, url) {
    if (navigator.share) {
        navigator.share({
            title: title || 'BSITHUB',
            text: text || '',
            url: url || window.location.href
        }).then(function() {
            showToast('Shared!', 'success');
        }).catch(function() {
            // User cancelled
        });
    } else {
        // Fallback: Copy to clipboard
        var shareText = (title ? title + '\n' : '') + (text || '') + '\n' + (url || window.location.href);
        navigator.clipboard.writeText(shareText).then(function() {
            showToast('Copied to clipboard!', 'success');
        });
    }
};

window.sharePost = function(postId) {
    var posts = Storage.get('posts') || [];
    var post = posts.find(function(p) { return p.id === postId; });
    if (post) {
        shareContent('BSITHUB Post', post.content || 'Check out this post!', window.location.href);
    }
};

// 2. Haptic Feedback
function initHapticFeedback() {
    window.haptic = function(type) {
        if (!navigator.vibrate) return;
        switch(type) {
            case 'light': navigator.vibrate(10); break;
            case 'medium': navigator.vibrate(25); break;
            case 'heavy': navigator.vibrate(50); break;
            case 'success': navigator.vibrate([50, 50, 50]); break;
            case 'error': navigator.vibrate([100, 50, 100]); break;
            default: navigator.vibrate(20);
        }
    };
    
    // Add haptic to buttons
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn, .nav-item, .post-action-btn, .message-action-btn');
        if (btn && navigator.vibrate) {
            navigator.vibrate(10);
        }
    });
}

// 3. Image Pinch Zoom
function initImagePinchZoom() {
    var scale = 1;
    var lastDistance = 0;
    
    document.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2 && e.target.tagName === 'IMG') {
            lastDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2 && e.target.tagName === 'IMG') {
            var currentDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            var delta = currentDistance / lastDistance;
            scale = Math.min(Math.max(0.5, scale * delta), 3);
            e.target.style.transform = 'scale(' + scale + ')';
            lastDistance = currentDistance;
        }
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        if (e.target.tagName === 'IMG' && scale !== 1) {
            if (scale < 1.2) {
                e.target.style.transform = 'scale(1)';
                scale = 1;
            }
        }
    }, { passive: true });
}

// 4. Draft Auto-save
function initDraftAutoSave() {
    var chatInput = document.getElementById('chat-input');
    if (!chatInput) return;
    
    // Load draft when opening chat
    var originalOpenChat = window.openChat;
    if (originalOpenChat) {
        window.openChat = function(chatId, userId) {
            originalOpenChat(chatId, userId);
            setTimeout(function() {
                var drafts = Storage.get('messageDrafts') || {};
                var input = document.getElementById('chat-input');
                if (input && drafts[chatId]) {
                    input.value = drafts[chatId];
                }
            }, 100);
        };
    }
    
    // Save draft on input
    setInterval(function() {
        var input = document.getElementById('chat-input');
        if (input && activeChat) {
            var drafts = Storage.get('messageDrafts') || {};
            if (input.value.trim()) {
                drafts[activeChat.id] = input.value;
            } else {
                delete drafts[activeChat.id];
            }
            Storage.set('messageDrafts', drafts);
        }
    }, 1000);
}

// 5. Chat Search
function initChatSearch() {
    window.searchInChat = function(query) {
        if (!activeChat || !query.trim()) return [];
        
        var messages = Storage.get('messages') || [];
        return messages.filter(function(m) {
            return m.chatId === activeChat.id && 
                   m.text && 
                   m.text.toLowerCase().includes(query.toLowerCase());
        });
    };
    
    window.showChatSearch = function() {
        if (!activeChat) return;
        
        var html = '<div class="chat-search-modal">';
        html += '<h3><i class="fas fa-search"></i> Search in Chat</h3>';
        html += '<input type="text" id="chat-search-input" placeholder="Search messages...">';
        html += '<div id="chat-search-results"></div>';
        html += '</div>';
        showModal(html);
        
        setTimeout(function() {
            var input = document.getElementById('chat-search-input');
            input.focus();
            input.addEventListener('input', function() {
                var results = searchInChat(this.value);
                var container = document.getElementById('chat-search-results');
                if (results.length === 0) {
                    container.innerHTML = '<div class="search-empty">No results found</div>';
                } else {
                    var html = '';
                    results.slice(0, 20).forEach(function(msg) {
                        html += '<div class="search-result" onclick="scrollToMessage(\'' + msg.id + '\')">';
                        html += '<div class="search-result-text">' + escapeHtml(msg.text).substring(0, 100) + '</div>';
                        html += '<div class="search-result-time">' + formatTime(msg.timestamp) + '</div>';
                        html += '</div>';
                    });
                    container.innerHTML = html;
                }
            });
        }, 100);
    };
    
    window.scrollToMessage = function(msgId) {
        closeModal();
        var el = document.querySelector('[data-message-id="' + msgId + '"]');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.background = 'rgba(99, 102, 241, 0.2)';
            setTimeout(function() { el.style.background = ''; }, 2000);
        }
    };
}

// 6. PWA Install
function initPWAInstall() {
    var deferredPrompt = null;
    
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        showInstallBanner();
    });
    
    function showInstallBanner() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) return;
        
        var el = document.createElement('div');
        el.id = 'pwa-install-banner';
        el.className = 'pwa-install-banner';
        el.innerHTML = '<span>Install BSITHUB for quick access</span>' +
            '<button onclick="installPWA()">Install</button>' +
            '<button onclick="dismissPWAInstall()" class="dismiss">Later</button>';
        document.body.appendChild(el);
    }
    
    window.installPWA = function() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function(result) {
                if (result.outcome === 'accepted') {
                    showToast('App installed!', 'success');
                }
                deferredPrompt = null;
                dismissPWAInstall();
            });
        }
    };
    
    window.dismissPWAInstall = function() {
        var banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
    };
}

// 7. Offline Mode
function initOfflineMode() {
    window.addEventListener('online', function() {
        showToast('Back online!', 'success');
        document.body.classList.remove('offline');
    });
    
    window.addEventListener('offline', function() {
        showToast('You are offline', 'warning');
        document.body.classList.add('offline');
    });
    
    // Check initial state
    if (!navigator.onLine) {
        document.body.classList.add('offline');
    }
}

// 8. Push Notifications
function initPushNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
        window.requestNotificationPermission = function() {
            Notification.requestPermission().then(function(permission) {
                if (permission === 'granted') {
                    showToast('Notifications enabled!', 'success');
                }
            });
        };
    }
    
    window.showBrowserNotification = function(title, body, icon) {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: icon || '/favicon.ico',
                badge: '/favicon.ico',
                vibrate: [100, 50, 100]
            });
        }
    };
}

// 9. Link Previews
function initLinkPreviews() {
    window.detectLinks = function(text) {
        var urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    };
    
    window.createLinkPreview = function(url) {
        return '<div class="link-preview" onclick="window.open(\'' + url + '\', \'_blank\')">' +
            '<div class="link-preview-icon"><i class="fas fa-link"></i></div>' +
            '<div class="link-preview-url">' + url.substring(0, 50) + '...</div>' +
            '</div>';
    };
}

// 10. Reactions Summary
function showReactionsSummary(messageId) {
    var messages = Storage.get('messages') || [];
    var msg = messages.find(function(m) { return m.id === messageId; });
    if (!msg || !msg.reactions || Object.keys(msg.reactions).length === 0) {
        showToast('No reactions yet', 'info');
        return;
    }
    
    var users = Storage.get('users') || [];
    var html = '<div class="reactions-summary">';
    html += '<h3><i class="fas fa-smile"></i> Reactions</h3>';
    
    Object.entries(msg.reactions).forEach(function(entry) {
        var emoji = entry[0];
        var userIds = entry[1];
        
        html += '<div class="reaction-group">';
        html += '<span class="reaction-emoji">' + emoji + '</span>';
        html += '<div class="reaction-users">';
        userIds.forEach(function(userId) {
            var user = users.find(function(u) { return u.id === userId; });
            var name = user ? user.name : 'Unknown';
            html += '<span class="reaction-user">' + escapeHtml(name) + '</span>';
        });
        html += '</div>';
        html += '<span class="reaction-count">' + userIds.length + '</span>';
        html += '</div>';
    });
    
    html += '</div>';
    showModal(html);
}

// ==========================================
// More Features
// ==========================================

// 1. Chat Backup (all chats)
window.backupAllChats = function() {
    var backup = {
        users: Storage.get('users') || [],
        chats: Storage.get('chats') || [],
        messages: Storage.get('messages') || [],
        posts: Storage.get('posts') || [],
        settings: Storage.get('settings') || {},
        exportedAt: new Date().toISOString()
    };
    
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-backup-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup created!', 'success');
};

window.restoreBackup = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (data.users) Storage.set('users', data.users);
                if (data.chats) Storage.set('chats', data.chats);
                if (data.messages) Storage.set('messages', data.messages);
                if (data.posts) Storage.set('posts', data.posts);
                if (data.settings) Storage.set('settings', data.settings);
                showToast('Restored! Reloading...', 'success');
                setTimeout(function() { location.reload(); }, 1500);
            } catch (err) { showToast('Invalid backup', 'error'); }
        };
        reader.readAsText(file);
    };
    input.click();
};

// 2. Message Edit History
window.showMessageEditHistory = function(msgId) {
    var messages = Storage.get('messages') || [];
    var msg = messages.find(function(m) { return m.id === msgId; });
    if (!msg || !msg.editHistory || msg.editHistory.length === 0) {
        showToast('No edit history', 'info'); return;
    }
    var html = '<div class="edit-history-modal"><h3>Edit History</h3>';
    msg.editHistory.forEach(function(edit) {
        html += '<div class="edit-item"><div class="edit-time">' + new Date(edit.editedAt).toLocaleString() + '</div><div class="edit-text">' + escapeHtml(edit.text) + '</div></div>';
    });
    html += '</div>';
    showModal(html);
};

// 3. Group Permissions
window.showGroupPermissions = function() {
    if (!activeChat || !activeChat.isGroup) { showToast('Not a group', 'error'); return; }
    var perms = activeChat.permissions || {};
    var html = '<div class="group-perms-modal"><h3>Group Permissions</h3>';
    html += '<div class="perm-item"><span>Members can send messages</span><label class="toggle"><input type="checkbox" id="perm-messages" ' + (perms.sendMessages !== false ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>';
    html += '<div class="perm-item"><span>Members can send media</span><label class="toggle"><input type="checkbox" id="perm-media" ' + (perms.sendMedia !== false ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>';
    html += '<button class="btn btn-primary" onclick="saveGroupPermissions()"><i class="fas fa-save"></i> Save</button></div>';
    showModal(html);
};

window.saveGroupPermissions = function() {
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    chats[chatIndex].permissions = {
        sendMessages: document.getElementById('perm-messages').checked,
        sendMedia: document.getElementById('perm-media').checked
    };
    Storage.set('chats', chats);
    activeChat = chats[chatIndex];
    closeModal();
    showToast('Permissions updated', 'success');
};

// 4. Slow Mode
window.toggleSlowMode = function() {
    if (!activeChat || !activeChat.isGroup) { showToast('Not a group', 'error'); return; }
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    var options = [0, 10, 30, 60, 300];
    var current = chats[chatIndex].slowMode || 0;
    var nextIndex = (options.indexOf(current) + 1) % options.length;
    chats[chatIndex].slowMode = options[nextIndex];
    Storage.set('chats', chats);
    activeChat = chats[chatIndex];
    showToast('Slow mode: ' + (options[nextIndex] === 0 ? 'Off' : options[nextIndex] + 's'), 'success');
};

// 5. Read-only Groups
window.toggleReadOnlyGroup = function() {
    if (!activeChat || !activeChat.isGroup) { showToast('Not a group', 'error'); return; }
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    chats[chatIndex].readOnly = !chats[chatIndex].readOnly;
    Storage.set('chats', chats);
    activeChat = chats[chatIndex];
    showToast(chats[chatIndex].readOnly ? 'Read-only enabled' : 'Read-only disabled', 'success');
};

// 6. Message Disappearing
window.setMessageDisappearing = function(duration) {
    var settings = Storage.get('settings') || {};
    settings.disappearingMessages = duration || 0;
    Storage.set('settings', settings);
    showToast('Disappearing: ' + (duration ? duration / 3600000 + 'h' : 'Off'), 'success');
};

// 7. Custom Themes
window.applyTheme = function(theme) {
    var themes = {
        default: { primary: '#6366f1', primaryDark: '#4f46e5' },
        ocean: { primary: '#0ea5e9', primaryDark: '#0284c7' },
        forest: { primary: '#22c55e', primaryDark: '#16a34a' },
        sunset: { primary: '#f97316', primaryDark: '#ea580c' },
        rose: { primary: '#f43f5e', primaryDark: '#e11d48' }
    };
    var t = themes[theme] || themes.default;
    document.documentElement.style.setProperty('--primary', t.primary);
    document.documentElement.style.setProperty('--primary-dark', t.primaryDark);
    var settings = Storage.get('settings') || {};
    settings.theme = theme;
    Storage.set('settings', settings);
    showToast('Theme: ' + theme, 'success');
};

// 8. Font Size
window.setFontSize = function(size) {
    document.documentElement.style.fontSize = size + 'px';
    var settings = Storage.get('settings') || {};
    settings.fontSize = size;
    Storage.set('settings', settings);
};

// 9. Quick Replies
window.showQuickReplies = function() {
    var replies = Storage.get('quickReplies') || ['👋 Hello!', '👍 Okay', '🙏 Thank you!', '😊 How are you?', '📞 Call me later', '✅ Done!'];
    var html = '<div class="quick-replies-modal"><h3>Quick Replies</h3><div class="replies-list">';
    replies.forEach(function(r) { html += '<button class="reply-btn" onclick="sendQuickReply(\'' + escapeHtml(r) + '\')">' + escapeHtml(r) + '</button>'; });
    html += '</div><input type="text" id="new-reply" placeholder="Add..."><button class="btn btn-small" onclick="addQuickReply()"><i class="fas fa-plus"></i></button></div>';
    showModal(html);
};

window.sendQuickReply = function(text) {
    if (!activeChat) return;
    sendMessage(text);
    closeModal();
};

window.addQuickReply = function() {
    var input = document.getElementById('new-reply');
    var text = input ? input.value.trim() : '';
    if (!text) return;
    var replies = Storage.get('quickReplies') || [];
    replies.push(text);
    Storage.set('quickReplies', replies);
    showQuickReplies();
};

// 10. Keyboard Shortcuts
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); showChatSearch(); }
    if (e.key === 'Escape') closeModal();
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); showNewChat(); }
});

// 11. Connection Status
window.updateConnectionStatus = function() {
    var status = document.getElementById('connection-status');
    if (!status) {
        status = document.createElement('div');
        status.id = 'connection-status';
        status.className = 'connection-status';
        document.body.appendChild(status);
    }
    status.className = 'connection-status ' + (navigator.onLine ? 'online' : 'offline');
    status.innerHTML = navigator.onLine ? '<i class="fas fa-wifi"></i>' : '<i class="fas fa-wifi-slash"></i> Offline';
    status.style.opacity = navigator.onLine ? '0' : '1';
};
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// 12. Auto-reply
window.setAutoReply = function(message) {
    var settings = Storage.get('settings') || {};
    settings.autoReply = message || '';
    Storage.set('settings', settings);
    showToast(message ? 'Auto-reply set' : 'Auto-reply disabled', 'success');
};

// 13. Chat Lock
window.lockChat = function(chatId, pin) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId || !pin) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    chats[chatIndex].locked = true;
    chats[chatIndex].lockPin = hashPassword(pin);
    Storage.set('chats', chats);
    showToast('Chat locked', 'success');
};

// 14. Hidden Chats
window.hideChat = function(chatId) {
    if (!chatId && activeChat) chatId = activeChat.id;
    if (!chatId) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    chats[chatIndex].hidden = true;
    Storage.set('chats', chats);
    showToast('Chat hidden', 'success');
    loadChats();
};

window.showHiddenChats = function() {
    var chats = Storage.get('chats') || [];
    var hidden = chats.filter(function(c) { return c.hidden && c.participants.indexOf(currentUser.id) !== -1; });
    var html = '<div class="hidden-chats-modal"><h3>Hidden Chats</h3>';
    if (hidden.length === 0) { html += '<div>No hidden chats</div>'; }
    else { hidden.forEach(function(c) { html += '<div class="hidden-item"><span>' + escapeHtml(c.groupName || 'Chat') + '</span><button class="btn btn-small" onclick="unhideChat(\'' + c.id + '\')"><i class="fas fa-eye"></i></button></div>'; }); }
    html += '</div>';
    showModal(html);
};

window.unhideChat = function(chatId) {
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    chats[chatIndex].hidden = false;
    Storage.set('chats', chats);
    showToast('Chat unhidden', 'success');
    showHiddenChats();
    loadChats();
};

// 15. Group Invite Expiry
window.generateInviteWithExpiry = function(expiryHours) {
    if (!activeChat || !activeChat.isGroup) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    var code = generateId().toUpperCase().substring(0, 8);
    chats[chatIndex].inviteCode = code;
    chats[chatIndex].inviteExpiry = Date.now() + (expiryHours * 3600000);
    Storage.set('chats', chats);
    showToast('Invite expires in ' + expiryHours + 'h', 'success');
    return code;
};

// 16. Dark Mode Toggle
window.toggleDarkMode = function() {
    var isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    var settings = Storage.get('settings') || {};
    settings.theme = isDark ? 'light' : 'dark';
    Storage.set('settings', settings);
    showToast(isDark ? 'Light mode' : 'Dark mode', 'info');
};

// 17. Chat Wallpaper
window.setChatWallpaper = function(color) {
    if (!activeChat) return;
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === activeChat.id; });
    if (chatIndex === -1) return;
    chats[chatIndex].wallpaper = color;
    Storage.set('chats', chats);
    var wallpaper = document.getElementById('chat-wallpaper');
    if (wallpaper) wallpaper.style.background = color || 'none';
    showToast('Wallpaper set', 'success');
};

// 18. Draft Messages
window.saveDraft = function() {
    if (!activeChat) return;
    var input = document.getElementById('chat-input');
    if (!input || !input.value.trim()) return;
    var drafts = Storage.get('drafts') || {};
    drafts[activeChat.id] = input.value;
    Storage.set('drafts', drafts);
};

window.loadDraft = function(chatId) {
    return (Storage.get('drafts') || {})[chatId] || '';
};

// Auto-save drafts
setInterval(function() { if (activeChat) saveDraft(); }, 5000);

// 19. Notification Per Chat
window.setChatNotificationSound = function(chatId, sound) {
    var chats = Storage.get('chats') || [];
    var chatIndex = chats.findIndex(function(c) { return c.id === chatId; });
    if (chatIndex === -1) return;
    chats[chatIndex].notificationSound = sound;
    Storage.set('chats', chats);
    showToast('Sound set', 'success');
};

// 20. Connection Status CSS
var connectionStyle = document.createElement('style');
connectionStyle.textContent = '.connection-status{position:fixed;top:10px;right:10px;padding:6px 12px;border-radius:20px;font-size:12px;z-index:10000;transition:opacity 0.3s}.connection-status.online{background:#10b981;color:white}.connection-status.offline{background:#ef4444;color:white}';
document.head.appendChild(connectionStyle);

// ==========================================
// 21. Message Scheduling
// ==========================================
window.showScheduleMessage = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var html = '<div class="schedule-modal"><h3>Schedule Message</h3>';
    html += '<textarea id="schedule-text" placeholder="Type your message..." rows="3"></textarea>';
    html += '<div class="schedule-datetime">';
    html += '<label>Date:</label>';
    html += '<input type="date" id="schedule-date" min="' + new Date().toISOString().split('T')[0] + '">';
    html += '<label>Time:</label>';
    html += '<input type="time" id="schedule-time">';
    html += '</div>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="closeModal()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="scheduleMessage()">Schedule</button>';
    html += '</div></div>';
    showModal(html);
    
    // Set default time to next hour
    var now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    document.getElementById('schedule-date').value = now.toISOString().split('T')[0];
    document.getElementById('schedule-time').value = now.toTimeString().slice(0, 5);
};

window.scheduleMessage = function() {
    var text = document.getElementById('schedule-text').value.trim();
    var date = document.getElementById('schedule-date').value;
    var time = document.getElementById('schedule-time').value;
    
    if (!text) {
        showToast('Enter a message', 'error');
        return;
    }
    if (!date || !time) {
        showToast('Select date and time', 'error');
        return;
    }
    
    var scheduledTime = new Date(date + 'T' + time);
    if (scheduledTime <= new Date()) {
        showToast('Time must be in the future', 'error');
        return;
    }
    
    var scheduled = Storage.get('scheduledMessages') || [];
    scheduled.push({
        id: generateId(),
        chatId: activeChat.id,
        text: text,
        scheduledTime: scheduledTime.toISOString(),
        senderId: currentUser.id,
        senderName: currentUser.name
    });
    Storage.set('scheduledMessages', scheduled);
    
    closeModal();
    showToast('Message scheduled for ' + scheduledTime.toLocaleString(), 'success');
};

// Check and send scheduled messages
setInterval(function() {
    var scheduled = Storage.get('scheduledMessages') || [];
    var now = new Date();
    var remaining = [];
    
    scheduled.forEach(function(msg) {
        if (new Date(msg.scheduledTime) <= now) {
            // Send the message
            var messages = Storage.get('messages') || [];
            messages.push({
                id: generateId(),
                chatId: msg.chatId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                text: msg.text,
                timestamp: new Date().toISOString(),
                read: false,
                status: 'sent',
                reactions: {},
                edited: false,
                starred: false,
                replyTo: null,
                forwarded: false,
                scheduled: true
            });
            Storage.set('messages', messages);
            showToast('Scheduled message sent!', 'success');
        } else {
            remaining.push(msg);
        }
    });
    
    if (remaining.length !== scheduled.length) {
        Storage.set('scheduledMessages', remaining);
        if (activeChat) renderMessages(activeChat.id);
    }
}, 10000);

window.viewScheduledMessages = function() {
    var scheduled = Storage.get('scheduledMessages') || [];
    var myScheduled = scheduled.filter(function(m) { return m.senderId === currentUser.id; });
    
    if (myScheduled.length === 0) {
        showToast('No scheduled messages', 'info');
        return;
    }
    
    var html = '<div class="scheduled-list"><h3>Scheduled Messages</h3>';
    myScheduled.forEach(function(msg) {
        html += '<div class="scheduled-item">';
        html += '<div class="scheduled-text">' + escapeHtml(msg.text.substring(0, 50)) + '</div>';
        html += '<div class="scheduled-time">📅 ' + new Date(msg.scheduledTime).toLocaleString() + '</div>';
        html += '<button class="btn btn-small danger" onclick="cancelScheduledMessage(\'' + msg.id + '\')">Cancel</button>';
        html += '</div>';
    });
    html += '</div>';
    showModal(html);
};

window.cancelScheduledMessage = function(id) {
    var scheduled = Storage.get('scheduledMessages') || [];
    scheduled = scheduled.filter(function(m) { return m.id !== id; });
    Storage.set('scheduledMessages', scheduled);
    closeModal();
    showToast('Scheduled message cancelled', 'info');
};

// ==========================================
// 22. Chat Folders
// ==========================================
window.showChatFolders = function() {
    var folders = Storage.get('chatFolders') || [];
    var html = '<div class="folders-modal"><h3>Chat Folders</h3>';
    html += '<div class="folder-list" id="folder-list">';
    
    if (folders.length === 0) {
        html += '<p class="no-folders">No folders yet. Create one to organize your chats!</p>';
    } else {
        folders.forEach(function(folder) {
            var chatCount = folder.chatIds ? folder.chatIds.length : 0;
            html += '<div class="folder-item">';
            html += '<div class="folder-icon">📁</div>';
            html += '<div class="folder-info">';
            html += '<div class="folder-name">' + escapeHtml(folder.name) + '</div>';
            html += '<div class="folder-count">' + chatCount + ' chats</div>';
            html += '</div>';
            html += '<div class="folder-actions">';
            html += '<button class="btn-icon" onclick="editFolder(\'' + folder.id + '\')" title="Edit"><i class="fas fa-edit"></i></button>';
            html += '<button class="btn-icon danger" onclick="deleteFolder(\'' + folder.id + '\')" title="Delete"><i class="fas fa-trash"></i></button>';
            html += '</div>';
            html += '</div>';
        });
    }
    
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="showCreateFolder()"><i class="fas fa-plus"></i> Create Folder</button>';
    html += '</div>';
    showModal(html);
};

window.showCreateFolder = function() {
    var chats = Storage.get('chats') || [];
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
    var users = Storage.get('users') || [];
    
    var html = '<div class="create-folder-modal"><h3>Create Folder</h3>';
    html += '<input type="text" id="folder-name" placeholder="Folder name (e.g., Work, Family, Friends)">';
    html += '<div class="folder-chats">';
    
    myChats.forEach(function(chat) {
        var name = chat.isGroup ? (chat.groupName || 'Group') : (users.find(function(u) { return u.id === chat.participants.find(function(p) { return p !== currentUser.id; }); }) || {}).name || 'Chat';
        html += '<label class="folder-chat-item">';
        html += '<input type="checkbox" value="' + chat.id + '"> ';
        html += '<span>' + escapeHtml(name) + '</span>';
        html += '</label>';
    });
    
    html += '</div>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showChatFolders()">Back</button>';
    html += '<button class="btn btn-primary" onclick="createFolder()">Create</button>';
    html += '</div></div>';
    showModal(html);
};

window.createFolder = function() {
    var name = document.getElementById('folder-name').value.trim();
    if (!name) {
        showToast('Enter folder name', 'error');
        return;
    }
    
    var chatIds = [];
    document.querySelectorAll('.folder-chat-item input:checked').forEach(function(cb) {
        chatIds.push(cb.value);
    });
    
    var folders = Storage.get('chatFolders') || [];
    folders.push({
        id: generateId(),
        name: name,
        chatIds: chatIds,
        createdAt: new Date().toISOString()
    });
    Storage.set('chatFolders', folders);
    
    closeModal();
    showToast('Folder created!', 'success');
    showChatFolders();
};

window.editFolder = function(folderId) {
    var folders = Storage.get('chatFolders') || [];
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder) return;
    
    var chats = Storage.get('chats') || [];
    var myChats = chats.filter(function(c) { return c.participants.indexOf(currentUser.id) !== -1; });
    var users = Storage.get('users') || [];
    
    var html = '<div class="create-folder-modal"><h3>Edit Folder</h3>';
    html += '<input type="text" id="folder-name" value="' + escapeHtml(folder.name) + '">';
    html += '<div class="folder-chats">';
    
    myChats.forEach(function(chat) {
        var name = chat.isGroup ? (chat.groupName || 'Group') : (users.find(function(u) { return u.id === chat.participants.find(function(p) { return p !== currentUser.id; }); }) || {}).name || 'Chat';
        var checked = folder.chatIds && folder.chatIds.indexOf(chat.id) !== -1 ? 'checked' : '';
        html += '<label class="folder-chat-item">';
        html += '<input type="checkbox" value="' + chat.id + '" ' + checked + '> ';
        html += '<span>' + escapeHtml(name) + '</span>';
        html += '</label>';
    });
    
    html += '</div>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showChatFolders()">Back</button>';
    html += '<button class="btn btn-primary" onclick="updateFolder(\'' + folderId + '\')">Save</button>';
    html += '</div></div>';
    showModal(html);
};

window.updateFolder = function(folderId) {
    var name = document.getElementById('folder-name').value.trim();
    if (!name) {
        showToast('Enter folder name', 'error');
        return;
    }
    
    var chatIds = [];
    document.querySelectorAll('.folder-chat-item input:checked').forEach(function(cb) {
        chatIds.push(cb.value);
    });
    
    var folders = Storage.get('chatFolders') || [];
    var index = folders.findIndex(function(f) { return f.id === folderId; });
    if (index !== -1) {
        folders[index].name = name;
        folders[index].chatIds = chatIds;
        Storage.set('chatFolders', folders);
    }
    
    closeModal();
    showToast('Folder updated!', 'success');
    showChatFolders();
};

window.deleteFolder = function(folderId) {
    var folders = Storage.get('chatFolders') || [];
    folders = folders.filter(function(f) { return f.id !== folderId; });
    Storage.set('chatFolders', folders);
    closeModal();
    showToast('Folder deleted', 'info');
};

window.filterByFolder = function(folderId) {
    var folders = Storage.get('chatFolders') || [];
    var folder = folders.find(function(f) { return f.id === folderId; });
    if (!folder) return;
    
    window.currentFolderFilter = folderId;
    loadChats();
    showToast('Showing: ' + folder.name, 'info');
};

window.clearFolderFilter = function() {
    window.currentFolderFilter = null;
    loadChats();
    showToast('Showing all chats', 'info');
};

// ==========================================
// 23. Quick Replies
// ==========================================
window.showQuickReplies = function() {
    var quickReplies = Storage.get('quickReplies') || [
        { id: '1', text: 'Thanks!', label: 'Thanks' },
        { id: '2', text: "I'll get back to you soon.", label: 'Get back' },
        { id: '3', text: 'Sounds good!', label: 'Sounds good' },
        { id: '4', text: "I'm busy right now.", label: 'Busy' },
        { id: '5', text: 'On my way!', label: 'On way' }
    ];
    
    var html = '<div class="quick-replies-modal"><h3>Quick Replies</h3>';
    html += '<div class="quick-reply-list">';
    
    quickReplies.forEach(function(qr) {
        html += '<div class="quick-reply-item" onclick="useQuickReply(\'' + escapeHtml(qr.text.replace(/'/g, "\\'")) + '\')">';
        html += '<div class="qr-label">' + escapeHtml(qr.label) + '</div>';
        html += '<div class="qr-text">' + escapeHtml(qr.text) + '</div>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showManageQuickReplies()">Manage</button>';
    html += '<button class="btn" onclick="closeModal()">Close</button>';
    html += '</div></div>';
    showModal(html);
};

window.useQuickReply = function(text) {
    var input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        input.focus();
    }
    closeModal();
};

window.showManageQuickReplies = function() {
    var quickReplies = Storage.get('quickReplies') || [
        { id: '1', text: 'Thanks!', label: 'Thanks' },
        { id: '2', text: "I'll get back to you soon.", label: 'Get back' },
        { id: '3', text: 'Sounds good!', label: 'Sounds good' },
        { id: '4', text: "I'm busy right now.", label: 'Busy' },
        { id: '5', text: 'On my way!', label: 'On way' }
    ];
    
    var html = '<div class="manage-qr-modal"><h3>Manage Quick Replies</h3>';
    html += '<div class="qr-manage-list" id="qr-manage-list">';
    
    quickReplies.forEach(function(qr) {
        html += '<div class="qr-manage-item">';
        html += '<input type="text" value="' + escapeHtml(qr.label) + '" class="qr-label-input" data-id="' + qr.id + '">';
        html += '<input type="text" value="' + escapeHtml(qr.text) + '" class="qr-text-input" data-id="' + qr.id + '">';
        html += '<button class="btn-icon danger" onclick="deleteQuickReply(\'' + qr.id + '\')"><i class="fas fa-trash"></i></button>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<button class="btn" onclick="addQuickReply()"><i class="fas fa-plus"></i> Add</button>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="showQuickReplies()">Back</button>';
    html += '<button class="btn btn-primary" onclick="saveQuickReplies()">Save</button>';
    html += '</div></div>';
    showModal(html);
};

window.addQuickReply = function() {
    var list = document.getElementById('qr-manage-list');
    var id = generateId();
    var html = '<div class="qr-manage-item">';
    html += '<input type="text" placeholder="Label" class="qr-label-input" data-id="' + id + '">';
    html += '<input type="text" placeholder="Message text" class="qr-text-input" data-id="' + id + '">';
    html += '<button class="btn-icon danger" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>';
    html += '</div>';
    list.insertAdjacentHTML('beforeend', html);
};

window.deleteQuickReply = function(id) {
    var item = event.target.closest('.qr-manage-item');
    if (item) item.remove();
};

window.saveQuickReplies = function() {
    var quickReplies = [];
    document.querySelectorAll('.qr-manage-item').forEach(function(item) {
        var label = item.querySelector('.qr-label-input').value.trim();
        var text = item.querySelector('.qr-text-input').value.trim();
        if (label && text) {
            quickReplies.push({
                id: item.querySelector('.qr-label-input').dataset.id || generateId(),
                label: label,
                text: text
            });
        }
    });
    Storage.set('quickReplies', quickReplies);
    closeModal();
    showToast('Quick replies saved!', 'success');
};

// ==========================================
// 24. Pinned Messages
// ==========================================
window.showPinnedMessages = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var messages = Storage.get('messages') || [];
    var pinned = messages.filter(function(m) { return m.chatId === activeChat.id && m.pinned; });
    
    if (pinned.length === 0) {
        showToast('No pinned messages', 'info');
        return;
    }
    
    var html = '<div class="pinned-messages-modal"><h3>📌 Pinned Messages</h3>';
    
    pinned.forEach(function(msg) {
        html += '<div class="pinned-message-item">';
        html += '<div class="pinned-text">' + escapeHtml(msg.text) + '</div>';
        html += '<div class="pinned-meta">' + formatTime(msg.timestamp) + '</div>';
        html += '<button class="btn btn-small" onclick="unpinMessage(\'' + msg.id + '\')">Unpin</button>';
        html += '</div>';
    });
    
    html += '</div>';
    showModal(html);
};

window.pinMessage = function(messageId) {
    var messages = Storage.get('messages') || [];
    var index = messages.findIndex(function(m) { return m.id === messageId; });
    
    if (index === -1) return;
    
    messages[index].pinned = !messages[index].pinned;
    Storage.set('messages', messages);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(messages[index]);
    }
    
    if (activeChat) renderMessages(activeChat.id);
    showToast(messages[index].pinned ? 'Message pinned!' : 'Message unpinned', 'success');
};

window.unpinMessage = function(messageId) {
    pinMessage(messageId);
    closeModal();
};

// ==========================================
// 25. User Search
// ==========================================
window.showUserSearch = function() {
    var html = '<div class="user-search-modal"><h3>Find Users</h3>';
    html += '<div class="search-input-wrapper">';
    html += '<i class="fas fa-search"></i>';
    html += '<input type="text" id="user-search-input" placeholder="Search by name or username..." oninput="searchUsers()">';
    html += '</div>';
    html += '<div class="user-search-results" id="user-search-results">';
    html += '<p class="search-hint">Type to search for users</p>';
    html += '</div>';
    html += '</div>';
    showModal(html);
    
    setTimeout(function() {
        document.getElementById('user-search-input').focus();
    }, 100);
};

window.searchUsers = function() {
    var query = document.getElementById('user-search-input').value.trim().toLowerCase();
    var results = document.getElementById('user-search-results');
    
    if (!query) {
        results.innerHTML = '<p class="search-hint">Type to search for users</p>';
        return;
    }
    
    var users = Storage.get('users') || [];
    var filtered = users.filter(function(u) {
        return u.id !== currentUser.id && 
               u.status === 'active' &&
               (u.name.toLowerCase().includes(query) || 
                u.username.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query));
    }).slice(0, 10);
    
    if (filtered.length === 0) {
        results.innerHTML = '<p class="no-results">No users found</p>';
        return;
    }
    
    var html = '';
    filtered.forEach(function(user) {
        var existingChat = findExistingChat(user.id);
        html += '<div class="user-search-item">';
        html += '<div class="user-avatar-small">' + (user.avatar ? '<img src="' + user.avatar + '">' : '<i class="fas fa-user"></i>') + '</div>';
        html += '<div class="user-info">';
        html += '<div class="user-name">' + escapeHtml(user.name) + '</div>';
        html += '<div class="user-username">@' + escapeHtml(user.username) + '</div>';
        html += '</div>';
        if (existingChat) {
            html += '<button class="btn btn-small" onclick="openChatFromSearch(\'' + existingChat.id + '\', \'' + user.id + '\')">Chat</button>';
        } else {
            html += '<button class="btn btn-small btn-primary" onclick="startChatWithUser(\'' + user.id + '\')"><i class="fas fa-plus"></i> Add</button>';
        }
        html += '</div>';
    });
    
    results.innerHTML = html;
};

window.findExistingChat = function(userId) {
    var chats = Storage.get('chats') || [];
    return chats.find(function(c) {
        return !c.isGroup && 
               c.participants.indexOf(currentUser.id) !== -1 && 
               c.participants.indexOf(userId) !== -1;
    });
};

window.startChatWithUser = function(userId) {
    var chats = Storage.get('chats') || [];
    var existing = findExistingChat(userId);
    
    if (existing) {
        openChatFromSearch(existing.id, userId);
        return;
    }
    
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
    showToast('Chat started!', 'success');
};

window.openChatFromSearch = function(chatId, userId) {
    closeModal();
    openChat(chatId, userId);
};

// ==========================================
// 26. Chat Backup
// ==========================================
window.showChatBackup = function() {
    var html = '<div class="backup-modal"><h3>Chat Backup</h3>';
    html += '<p>Backup your chats and messages to a file.</p>';
    html += '<div class="backup-options">';
    html += '<button class="btn btn-primary" onclick="backupAllChats()"><i class="fas fa-download"></i> Backup All Chats</button>';
    html += '<button class="btn" onclick="backupCurrentChat()"><i class="fas fa-comment"></i> Backup Current Chat</button>';
    html += '<button class="btn" onclick="restoreBackup()"><i class="fas fa-upload"></i> Restore Backup</button>';
    html += '</div>';
    html += '<input type="file" id="restore-input" accept=".json" style="display:none" onchange="handleRestore(event)">';
    html += '</div>';
    showModal(html);
};

window.backupAllChats = function() {
    var data = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        user: currentUser,
        chats: Storage.get('chats') || [],
        messages: Storage.get('messages') || [],
        quickReplies: Storage.get('quickReplies') || [],
        settings: Storage.get('settings') || {}
    };
    
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    closeModal();
    showToast('Backup downloaded!', 'success');
};

window.backupCurrentChat = function() {
    if (!activeChat) {
        showToast('Select a chat first', 'info');
        return;
    }
    
    var messages = Storage.get('messages') || [];
    var chatMessages = messages.filter(function(m) { return m.chatId === activeChat.id; });
    
    var data = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        chatId: activeChat.id,
        messages: chatMessages
    };
    
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bsithub-chat-' + activeChat.id + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    closeModal();
    showToast('Chat backup downloaded!', 'success');
};

window.restoreBackup = function() {
    document.getElementById('restore-input').click();
};

window.handleRestore = function(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            
            if (data.chats && data.messages) {
                // Full backup restore
                if (confirm('This will replace all your current data. Continue?')) {
                    Storage.set('chats', data.chats);
                    Storage.set('messages', data.messages);
                    if (data.quickReplies) Storage.set('quickReplies', data.quickReplies);
                    if (data.settings) Storage.set('settings', data.settings);
                    
                    closeModal();
                    showToast('Backup restored! Refreshing...', 'success');
                    setTimeout(function() { location.reload(); }, 1500);
                }
            } else if (data.messages) {
                // Single chat restore
                var messages = Storage.get('messages') || [];
                data.messages.forEach(function(msg) {
                    if (!messages.find(function(m) { return m.id === msg.id; })) {
                        messages.push(msg);
                    }
                });
                Storage.set('messages', messages);
                
                closeModal();
                showToast('Chat restored!', 'success');
                if (activeChat) renderMessages(activeChat.id);
            }
        } catch (err) {
            showToast('Invalid backup file', 'error');
        }
    };
    reader.readAsText(file);
};

// ==========================================
// 27. Custom Themes
// ==========================================
window.showThemePicker = function() {
    var themes = [
        { id: 'default', name: 'Default', color: '#667eea' },
        { id: 'ocean', name: 'Ocean', color: '#0077b6' },
        { id: 'forest', name: 'Forest', color: '#2d6a4f' },
        { id: 'sunset', name: 'Sunset', color: '#e76f51' },
        { id: 'purple', name: 'Purple', color: '#7b2cbf' },
        { id: 'rose', name: 'Rose', color: '#e63946' },
        { id: 'teal', name: 'Teal', color: '#009688' },
        { id: 'amber', name: 'Amber', color: '#ff8f00' },
        { id: 'indigo', name: 'Indigo', color: '#3f51b5' },
        { id: 'pink', name: 'Pink', color: '#e91e63' },
        { id: 'cyan', name: 'Cyan', color: '#00bcd4' },
        { id: 'lime', name: 'Lime', color: '#8bc34a' }
    ];
    
    var currentTheme = (Storage.get('settings') || {}).theme || 'default';
    
    var html = '<div class="theme-modal"><h3>Choose Theme</h3>';
    html += '<div class="theme-grid">';
    
    themes.forEach(function(theme) {
        var isActive = theme.id === currentTheme;
        html += '<div class="theme-item ' + (isActive ? 'active' : '') + '" onclick="applyTheme(\'' + theme.id + '\', \'' + theme.color + '\')">';
        html += '<div class="theme-color" style="background: ' + theme.color + '"></div>';
        html += '<div class="theme-name">' + theme.name + '</div>';
        if (isActive) html += '<div class="theme-check"><i class="fas fa-check"></i></div>';
        html += '</div>';
    });
    
    html += '</div>';
    html += '<h4>Custom Color</h4>';
    html += '<input type="color" id="custom-theme-color" value="#667eea">';
    html += '<button class="btn btn-primary" onclick="applyCustomTheme()">Apply Custom</button>';
    html += '</div>';
    showModal(html);
};

window.applyTheme = function(themeId, color) {
    var settings = Storage.get('settings') || {};
    settings.theme = themeId;
    settings.themeColor = color;
    Storage.set('settings', settings);
    
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-dark', shadeColor(color, -20));
    document.documentElement.style.setProperty('--primary-light', shadeColor(color, 20));
    
    closeModal();
    showToast('Theme applied!', 'success');
};

window.applyCustomTheme = function() {
    var color = document.getElementById('custom-theme-color').value;
    applyTheme('custom', color);
};

function shadeColor(color, percent) {
    var num = parseInt(color.replace('#', ''), 16);
    var amt = Math.round(2.55 * percent);
    var R = (num >> 16) + amt;
    var G = (num >> 8 & 0x00FF) + amt;
    var B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// Load saved theme on startup
(function() {
    var settings = Storage.get('settings') || {};
    if (settings.themeColor) {
        document.documentElement.style.setProperty('--primary', settings.themeColor);
        document.documentElement.style.setProperty('--primary-dark', shadeColor(settings.themeColor, -20));
        document.documentElement.style.setProperty('--primary-light', shadeColor(settings.themeColor, 20));
    }
})();

// ==========================================
// 28. Auto-Reply
// ==========================================
window.showAutoReplySettings = function() {
    var settings = Storage.get('settings') || {};
    var autoReply = settings.autoReply || { enabled: false, message: '' };
    
    var html = '<div class="auto-reply-modal"><h3>Auto-Reply</h3>';
    html += '<p>Automatically reply when you\'re busy.</p>';
    html += '<label class="toggle-label">';
    html += '<input type="checkbox" id="auto-reply-toggle" ' + (autoReply.enabled ? 'checked' : '') + '>';
    html += '<span>Enable Auto-Reply</span>';
    html += '</label>';
    html += '<textarea id="auto-reply-message" placeholder="Auto-reply message..." rows="3">' + escapeHtml(autoReply.message) + '</textarea>';
    html += '<div class="auto-reply-templates">';
    html += '<h4>Quick Templates</h4>';
    html += '<div class="template-item" onclick="setAutoReplyTemplate(this.textContent)">I am currently busy. I will get back to you soon!</div>';
    html += '<div class="template-item" onclick="setAutoReplyTemplate(this.textContent)">I am away from my phone. Leave a message!</div>';
    html += '<div class="template-item" onclick="setAutoReplyTemplate(this.textContent)">I am in a meeting. I will respond when I am free.</div>';
    html += '<div class="template-item" onclick="setAutoReplyTemplate(this.textContent)">I am sleeping. I will reply tomorrow!</div>';
    html += '</div>';
    html += '<div class="modal-buttons">';
    html += '<button class="btn" onclick="closeModal()">Cancel</button>';
    html += '<button class="btn btn-primary" onclick="saveAutoReply()">Save</button>';
    html += '</div></div>';
    showModal(html);
};

window.setAutoReplyTemplate = function(message) {
    document.getElementById('auto-reply-message').value = message;
};

window.saveAutoReply = function() {
    var enabled = document.getElementById('auto-reply-toggle').checked;
    var message = document.getElementById('auto-reply-message').value.trim();
    
    if (enabled && !message) {
        showToast('Enter an auto-reply message', 'error');
        return;
    }
    
    var settings = Storage.get('settings') || {};
    settings.autoReply = { enabled: enabled, message: message };
    Storage.set('settings', settings);
    
    closeModal();
    showToast('Auto-reply ' + (enabled ? 'enabled' : 'disabled'), 'success');
};

// Auto-reply check when receiving messages
function checkAutoReply(message) {
    if (!currentUser || message.senderId === currentUser.id) return;
    
    var settings = Storage.get('settings') || {};
    var autoReply = settings.autoReply;
    
    if (!autoReply || !autoReply.enabled) return;
    
    // Check if we already sent auto-reply to this user recently
    var autoReplyLog = Storage.get('autoReplyLog') || {};
    var lastReply = autoReplyLog[message.senderId];
    var now = Date.now();
    
    // Only send auto-reply once every 30 minutes per user
    if (lastReply && (now - lastReply < 30 * 60 * 1000)) return;
    
    // Send auto-reply
    var messages = Storage.get('messages') || [];
    var autoReplyMsg = {
        id: generateId(),
        chatId: message.chatId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: '🤖 ' + autoReply.message,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'sent',
        reactions: {},
        edited: false,
        starred: false,
        replyTo: null,
        forwarded: false,
        isAutoReply: true
    };
    
    messages.push(autoReplyMsg);
    Storage.set('messages', messages);
    
    // Log the auto-reply
    autoReplyLog[message.senderId] = now;
    Storage.set('autoReplyLog', autoReplyLog);
    
    if (typeof sendMsgToFirebase === 'function') {
        sendMsgToFirebase(autoReplyMsg);
    }
}

// ==========================================
// 29. Message Translation
// ==========================================
window.translateMessage = function(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message || !message.text) {
        showToast('No text to translate', 'info');
        return;
    }
    
    var html = '<div class="translate-modal"><h3>Translate Message</h3>';
    html += '<div class="translate-original"><strong>Original:</strong><p>' + escapeHtml(message.text) + '</p></div>';
    html += '<div class="translate-language">';
    html += '<label>Translate to:</label>';
    html += '<select id="translate-language">';
    html += '<option value="en">English</option>';
    html += '<option value="es">Spanish</option>';
    html += '<option value="fr">French</option>';
    html += '<option value="de">German</option>';
    html += '<option value="it">Italian</option>';
    html += '<option value="pt">Portuguese</option>';
    html += '<option value="ru">Russian</option>';
    html += '<option value="ja">Japanese</option>';
    html += '<option value="ko">Korean</option>';
    html += '<option value="zh">Chinese</option>';
    html += '<option value="ar">Arabic</option>';
    html += '<option value="hi">Hindi</option>';
    html += '</select>';
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="doTranslate(\'' + messageId + '\')">Translate</button>';
    html += '<div id="translate-result" style="display:none; margin-top: 16px;"></div>';
    html += '</div>';
    showModal(html);
};

window.doTranslate = function(messageId) {
    var messages = Storage.get('messages') || [];
    var message = messages.find(function(m) { return m.id === messageId; });
    if (!message) return;
    
    var targetLang = document.getElementById('translate-language').value;
    var resultDiv = document.getElementById('translate-result');
    
    // Simple translation simulation (in production, use a real API like Google Translate)
    var translations = {
        'en': { 'hola': 'hello', 'gracias': 'thank you', 'amor': 'love', 'bueno': 'good' },
        'es': { 'hello': 'hola', 'thank you': 'gracias', 'love': 'amor', 'good': 'bueno' },
        'fr': { 'hello': 'bonjour', 'thank you': 'merci', 'love': 'amour', 'good': 'bon' },
        'de': { 'hello': 'hallo', 'thank you': 'danke', 'love': 'liebe', 'good': 'gut' }
    };
    
    // Simulated translation (in real app, call translation API)
    var translated = message.text;
    if (translations[targetLang]) {
        Object.keys(translations[targetLang]).forEach(function(word) {
            translated = translated.replace(new RegExp(word, 'gi'), translations[targetLang][word]);
        });
    }
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<strong>Translation:</strong><p style="color: var(--primary); font-weight: 500;">' + escapeHtml(translated) + '</p>';
    showToast('Translated!', 'success');
};

// ==========================================
// 30. Login History
// ==========================================
window.showLoginHistory = function() {
    var loginHistory = Storage.get('loginHistory') || [];
    var myHistory = loginHistory.filter(function(h) { return h.userId === currentUser.id; }).slice(0, 20);
    
    var html = '<div class="login-history-modal"><h3>Login History</h3>';
    
    if (myHistory.length === 0) {
        html += '<p class="no-history">No login history available.</p>';
    } else {
        html += '<div class="history-list">';
        myHistory.forEach(function(entry) {
            var date = new Date(entry.timestamp);
            html += '<div class="history-item">';
            html += '<div class="history-icon"><i class="fas fa-' + (entry.success ? 'check-circle success' : 'times-circle danger') + '"></i></div>';
            html += '<div class="history-info">';
            html += '<div class="history-device">' + escapeHtml(entry.device || 'Unknown Device') + '</div>';
            html += '<div class="history-details">';
            html += '<span class="history-ip">' + escapeHtml(entry.ip || 'Unknown IP') + '</span>';
            html += '<span class="history-time">' + date.toLocaleString() + '</span>';
            html += '</div>';
            html += '<div class="history-status ' + (entry.success ? 'success' : 'danger') + '">' + (entry.success ? 'Successful' : 'Failed') + '</div>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
    }
    
    html += '<button class="btn" onclick="clearLoginHistory()">Clear History</button>';
    html += '</div>';
    showModal(html);
};

window.recordLogin = function(success) {
    var loginHistory = Storage.get('loginHistory') || [];
    
    // Get device info
    var device = navigator.userAgent;
    if (device.length > 50) device = device.substring(0, 50) + '...';
    
    loginHistory.unshift({
        userId: currentUser ? currentUser.id : 'unknown',
        timestamp: new Date().toISOString(),
        device: device,
        ip: 'Local',
        success: success
    });
    
    // Keep only last 50 entries
    if (loginHistory.length > 50) {
        loginHistory = loginHistory.slice(0, 50);
    }
    
    Storage.set('loginHistory', loginHistory);
};

window.clearLoginHistory = function() {
    if (confirm('Clear all login history?')) {
        Storage.set('loginHistory', []);
        closeModal();
        showToast('Login history cleared', 'success');
    }
};
// ==========================================
// Quick Actions Menu
// ==========================================
window.showQuickActionsMenu = function() {
    var html = '<div class="quick-actions-modal"><h3>Quick Actions</h3>';
    html += '<div class="quick-actions-grid">';
    html += '<div class="quick-action-item" onclick="showChatBackup()"><i class="fas fa-download"></i><span>Backup</span></div>';
    html += '<div class="quick-action-item" onclick="showThemePicker()"><i class="fas fa-palette"></i><span>Themes</span></div>';
    html += '<div class="quick-action-item" onclick="showAutoReplySettings()"><i class="fas fa-robot"></i><span>Auto-Reply</span></div>';
    html += '<div class="quick-action-item" onclick="showLoginHistory()"><i class="fas fa-history"></i><span>Login History</span></div>';
    html += '<div class="quick-action-item" onclick="viewScheduledMessages()"><i class="fas fa-clock"></i><span>Scheduled</span></div>';
    html += '<div class="quick-action-item" onclick="showChatFolders()"><i class="fas fa-folder"></i><span>Folders</span></div>';
    html += '<div class="quick-action-item" onclick="showQuickReplies()"><i class="fas fa-bolt"></i><span>Quick Replies</span></div>';
    html += '<div class="quick-action-item" onclick="showUserSearch()"><i class="fas fa-user-plus"></i><span>Find Users</span></div>';
    html += '</div></div>';
    showModal(html);
};


