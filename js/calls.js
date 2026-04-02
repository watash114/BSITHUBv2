// ==========================================
// Call Signaling for BSITHUB
// Simple localStorage-based signaling
// ==========================================

const CallSignaling = {
    userId: null,
    peerId: null,
    pollingInterval: null,
    onIncomingCall: null,
    lastSignalTime: 0,

    // Register this user
    register: function(uid, pid) {
        this.userId = uid;
        this.peerId = pid;
        this.updateOnlineStatus();
        this.startPolling();
        console.log('Call signaling registered for:', uid);
    },

    // Get online users from localStorage
    getOnlineUsers: function() {
        try {
            return JSON.parse(localStorage.getItem('bsithub_online') || '{}');
        } catch (e) {
            return {};
        }
    },

    // Update online status
    updateOnlineStatus: function() {
        if (!this.userId) return;
        try {
            var users = this.getOnlineUsers();
            users[this.userId] = {
                peerId: this.peerId,
                time: Date.now()
            };
            localStorage.setItem('bsithub_online', JSON.stringify(users));
        } catch (e) {}
    },

    // Get peer ID for a user
    getPeerId: function(uid) {
        try {
            var users = this.getOnlineUsers();
            if (users[uid] && (Date.now() - users[uid].time < 30000)) {
                return users[uid].peerId;
            }
        } catch (e) {}
        return null;
    },

    // Send a call
    sendCall: function(targetUid, callerUid, callerPid, isVideo) {
        try {
            var signal = {
                type: 'call',
                from: callerUid,
                peerId: callerPid,
                to: targetUid,
                video: isVideo,
                time: Date.now()
            };
            
            var calls = JSON.parse(localStorage.getItem('bsithub_calls') || '{}');
            if (!calls[targetUid]) calls[targetUid] = [];
            calls[targetUid].push(signal);
            localStorage.setItem('bsithub_calls', JSON.stringify(calls));
            
            // Try broadcast channel
            try {
                var bc = new BroadcastChannel('bsithub');
                bc.postMessage(signal);
                bc.close();
            } catch (e) {}
            
            console.log('Call signal sent to:', targetUid);
            return true;
        } catch (e) {
            console.error('Failed to send call signal:', e);
            return false;
        }
    },

    // Start polling for incoming calls
    startPolling: function() {
        var self = this;
        
        // Listen to broadcast channel
        try {
            var bc = new BroadcastChannel('bsithub');
            bc.onmessage = function(event) {
                var signal = event.data;
                if (signal.to === self.userId && signal.time > self.lastSignalTime) {
                    self.lastSignalTime = signal.time;
                    if (self.onIncomingCall) {
                        self.onIncomingCall(signal);
                    }
                }
            };
        } catch (e) {}
        
        // Poll localStorage
        this.pollingInterval = setInterval(function() {
            try {
                var calls = JSON.parse(localStorage.getItem('bsithub_calls') || '{}');
                var myCalls = calls[self.userId] || [];
                
                myCalls.forEach(function(call) {
                    if (call.time > self.lastSignalTime) {
                        self.lastSignalTime = call.time;
                        if (self.onIncomingCall) {
                            self.onIncomingCall(call);
                        }
                    }
                });
                
                // Clear processed calls
                if (myCalls.length > 0) {
                    calls[self.userId] = [];
                    localStorage.setItem('bsithub_calls', JSON.stringify(calls));
                }
                
                // Update our status
                self.updateOnlineStatus();
            } catch (e) {}
        }, 500);
    },

    // Stop
    stop: function() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.userId) {
            try {
                var users = this.getOnlineUsers();
                delete users[this.userId];
                localStorage.setItem('bsithub_online', JSON.stringify(users));
            } catch (e) {}
        }
    }
};