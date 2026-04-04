// Socket.IO client for real-time presence
let socket = null;
let currentUserId = null;

function initSocket(userId) {
    currentUserId = userId;
    
    // Connect to Socket.IO server
    socket = io();
    
    // Join with user ID
    socket.emit('join', userId);
    
    // Listen for online users updates
    socket.on('online-users', (onlineUserIds) => {
        console.log('Online users:', onlineUserIds);
        window.onlineUsers = onlineUserIds;
        
        // Update UI
        updateOnlineStatus(onlineUserIds);
    });
    
    // Listen for new messages
    socket.on('message', (data) => {
        console.log('New message:', data);
        // Handle new message
    });
    
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
        socket.disconnect();
    }
}
