// Socket.IO client for real-time presence
let socket = null;
let currentUserId = null;
let socketConnected = false;

function initSocket(userId) {
    currentUserId = userId;
    console.log('initSocket called with userId:', userId);
    
    // Check if io is available
    if (typeof io === 'undefined') {
        console.log('Socket.IO not loaded - using Firebase for real-time');
        return null;
    }
    
    console.log('Socket.IO available, attempting connection...');
    
    try {
        // Connect to Socket.IO server with timeout
        socket = io({
            timeout: 5000,
            reconnection: true,
            reconnectionAttempts: 3,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });
        
        // Log connection events
        socket.on('connect', () => {
            console.log('Socket.IO connected!');
            socketConnected = true;
            
            // Join with user ID
            socket.emit('join', userId);
            console.log('Join event sent with userId:', userId);
        });
        
        socket.on('connect_error', (error) => {
            console.warn('Socket.IO connection failed - using Firebase fallback:', error.message);
            socketConnected = false;
        });
        
        socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
            socketConnected = false;
        });
        
        // Listen for online users updates
        socket.on('online-users', (onlineUserIds) => {
            if (onlineUserIds && onlineUserIds.length > 0) {
                console.log('Online users received:', onlineUserIds);
                window.onlineUsers = onlineUserIds;
                updateOnlineStatus(onlineUserIds);
            }
        });
        
        // Listen for new messages
        socket.on('message', (data) => {
            console.log('New message:', data);
        });
        
    } catch (error) {
        console.warn('Socket.IO initialization failed:', error.message);
        socket = null;
    }
    
    return socket;
}

function updateOnlineStatus(onlineUserIds) {
    // Update chat list with online indicators
    document.querySelectorAll('.chat-item').forEach(function(item) {
        var userId = item.dataset.userId;
        if (userId) {
            var isOnline = onlineUserIds.includes(userId);
            var avatarWrapper = item.querySelector('.chat-item-avatar-wrapper');
            
            if (avatarWrapper) {
                var existingIndicator = avatarWrapper.querySelector('.online-indicator');
                if (isOnline) {
                    if (!existingIndicator) {
                        var indicator = document.createElement('div');
                        indicator.className = 'online-indicator online';
                        avatarWrapper.appendChild(indicator);
                    } else {
                        existingIndicator.className = 'online-indicator online';
                    }
                } else {
                    if (existingIndicator) {
                        existingIndicator.className = 'online-indicator offline';
                    } else {
                        var indicator = document.createElement('div');
                        indicator.className = 'online-indicator offline';
                        avatarWrapper.appendChild(indicator);
                    }
                }
            }
        }
    });
}

function disconnectSocket() {
    if (socket) {
        try {
            socket.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
        socketConnected = false;
    }
}

function isSocketConnected() {
    return socketConnected && socket && socket.connected;
}
