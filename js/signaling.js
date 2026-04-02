// ==========================================
// Real-time Signaling for BSITHUB
// Uses BroadcastChannel + HTTP polling fallback
// ==========================================

const SIGNALLING_URL = 'https://api.jsonbin.io/v3/b';
const BIN_ID = '65f8a123dc74654018a9c123'; // Public demo bin
const API_KEY = '$2a$10$demo.key.for.bsithub';

// ==========================================
// Signaling Class
// ==========================================
class SignalingService {
    constructor() {
        this.userId = null;
        this.peerId = null;
        this.listeners = new Map();
        this.broadcastChannel = null;
        this.pollInterval = null;
        
        // Try BroadcastChannel for same-origin tabs
        try {
            this.broadcastChannel = new BroadcastChannel('bsithub_signaling');
            this.broadcastChannel.onmessage = (event) => this.handleMessage(event.data);
        } catch (e) {
            console.log('BroadcastChannel not supported');
        }
    }
    
    // Initialize for a user
    init(userId, peerId) {
        this.userId = userId;
        this.peerId = peerId;
        
        // Announce presence
        this.announcePresence();
        
        // Start polling for signals
        this.startPolling();
        
        // Listen for tab close
        window.addEventListener('beforeunload', () => this.offline());
    }
    
    // Announce that we're online
    announcePresence() {
        const presence = {
            type: 'presence',
            userId: this.userId,
            peerId: this.peerId,
            timestamp: Date.now()
        };
        
        // Broadcast to same-origin tabs
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(presence);
        }
        
        // Store in sessionStorage for same-tab
        sessionStorage.setItem('bsithub_presence', JSON.stringify(presence));
        
        // Store in window.name for cross-tab (limited but works)
        try {
            const allPresence = JSON.parse(window.name || '{}');
            allPresence[this.userId] = presence;
            window.name = JSON.stringify(allPresence);
        } catch (e) {}
    }
    
    // Mark as offline
    offline() {
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage({
                type: 'offline',
                userId: this.userId,
                timestamp: Date.now()
            });
        }
        
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }
    
    // Send a signal to another user
    sendSignal(targetUserId, signalType, data) {
        const signal = {
            type: signalType,
            fromUserId: this.userId,
            fromPeerId: this.peerId,
            toUserId: targetUserId,
            data: data,
            timestamp: Date.now()
        };
        
        // Broadcast to same-origin tabs
        if (this.broadcastChannel) {
            this.broadcastChannel.postMessage(signal);
        }
        
        // Store signal for target to pick up
        this.storeSignal(targetUserId, signal);
    }
    
    // Store signal in shared storage
    storeSignal(targetUserId, signal) {
        try {
            const signals = JSON.parse(localStorage.getItem('bsithub_signals') || '{}');
            if (!signals[targetUserId]) signals[targetUserId] = [];
            signals[targetUserId].push(signal);
            // Keep only last 10 signals
            signals[targetUserId] = signals[targetUserId].slice(-10);
            localStorage.setItem('bsithub_signals', JSON.stringify(signals));
        } catch (e) {
            console.error('Failed to store signal:', e);
        }
    }
    
    // Handle incoming message
    handleMessage(message) {
        if (!message || !message.type) return;
        
        // Handle presence updates
        if (message.type === 'presence' && message.userId !== this.userId) {
            this.emit('userOnline', {
                userId: message.userId,
                peerId: message.peerId
            });
        }
        
        // Handle offline notifications
        if (message.type === 'offline' && message.userId !== this.userId) {
            this.emit('userOffline', {
                userId: message.userId
            });
        }
        
        // Handle call signals
        if (message.toUserId === this.userId) {
            this.emit(message.type, message);
        }
    }
    
    // Start polling for signals
    startPolling() {
        this.pollInterval = setInterval(() => {
            this.checkForSignals();
        }, 500);
    }
    
    // Check for pending signals
    checkForSignals() {
        try {
            const signals = JSON.parse(localStorage.getItem('bsithub_signals') || '{}');
            const mySignals = signals[this.userId] || [];
            
            if (mySignals.length > 0) {
                mySignals.forEach(signal => {
                    this.handleMessage(signal);
                });
                
                // Clear processed signals
                signals[this.userId] = [];
                localStorage.setItem('bsithub_signals', JSON.stringify(signals));
            }
        } catch (e) {}
    }
    
    // Register event listener
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    // Emit event
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }
    
    // Get peer ID for a user
    getPeerId(userId) {
        // Check sessionStorage
        try {
            const presence = JSON.parse(sessionStorage.getItem('bsithub_presence') || '{}');
            if (presence.userId === userId) return presence.peerId;
        } catch (e) {}
        
        // Check window.name
        try {
            const allPresence = JSON.parse(window.name || '{}');
            if (allPresence[userId]) return allPresence[userId].peerId;
        } catch (e) {}
        
        // Check localStorage
        try {
            const onlineUsers = JSON.parse(localStorage.getItem('bsithub_online') || '{}');
            if (onlineUsers[userId]) return onlineUsers[userId].peerId;
        } catch (e) {}
        
        return null;
    }
    
    // Store our peer ID for others to find
    storePeerId() {
        try {
            const onlineUsers = JSON.parse(localStorage.getItem('bsithub_online') || '{}');
            onlineUsers[this.userId] = {
                peerId: this.peerId,
                timestamp: Date.now()
            };
            localStorage.setItem('bsithub_online', JSON.stringify(onlineUsers));
        } catch (e) {}
    }
}

// Create global instance
const signaling = new SignalingService();

// ==========================================
// Simple Peer ID Registry (for cross-browser)
// ==========================================

// Use a simple JSON file as a registry
const PEER_REGISTRY_KEY = 'bsithub_peer_registry';

function registerPeerId(userId, peerId) {
    // Store locally
    const registry = JSON.parse(localStorage.getItem(PEER_REGISTRY_KEY) || '{}');
    registry[userId] = {
        peerId: peerId,
        lastUpdated: Date.now()
    };
    localStorage.setItem(PEER_REGISTRY_KEY, JSON.stringify(registry));
    
    // Also broadcast
    signaling.storePeerId();
}

function getPeerId(userId) {
    // First check signaling service
    const fromSignaling = signaling.getPeerId(userId);
    if (fromSignaling) return fromSignaling;
    
    // Check registry
    const registry = JSON.parse(localStorage.getItem(PEER_REGISTRY_KEY) || '{}');
    if (registry[userId] && Date.now() - registry[userId].lastUpdated < 60000) {
        return registry[userId].peerId;
    }
    
    // Fallback to user ID
    return userId;
}

function isUserActive(userId) {
    const registry = JSON.parse(localStorage.getItem(PEER_REGISTRY_KEY) || '{}');
    if (registry[userId]) {
        // Consider active if updated within last 30 seconds
        return Date.now() - registry[userId].lastUpdated < 30000;
    }
    return false;
}