// ==========================================
// Firebase Real-time Signaling for BSITHUB
// ==========================================

// Firebase Configuration (Real BSITHUB Project)
const firebaseConfig = {
    apiKey: "AIzaSyDqCLKvwD3j9z_EQCzHrtcGXOpYgXPm3yw",
    authDomain: "bsithub-1974a.firebaseapp.com",
    databaseURL: "https://bsithub-1974a-default-rtdb.firebaseio.com",
    projectId: "bsithub-1974a",
    storageBucket: "bsithub-1974a.firebasestorage.app",
    messagingSenderId: "790480652401",
    appId: "1:790480652401:web:38e18646da4869c3da73d0",
    measurementId: "G-CNH08S3H7V"
};

// Initialize Firebase
let firebaseApp = null;
let firebaseDb = null;
let firebaseInitialized = false;

function initFirebase() {
    if (firebaseInitialized) return;
    
    // Check if Firebase SDK is loaded
    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded, using localStorage fallback');
        useLocalFallback();
        return;
    }
    
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseDb = firebase.database();
        firebaseInitialized = true;
        console.log('Firebase initialized successfully');
    } catch (e) {
        console.warn('Firebase initialization failed, using fallback:', e);
        useLocalFallback();
    }
}

// Fallback for when Firebase is not available
function useLocalFallback() {
    console.log('Using localStorage fallback for signaling');
}

// ==========================================
// User Presence System
// ==========================================

function setUserPresenceOnline(userId, peerId) {
    if (!firebaseDb) {
        // Fallback to localStorage
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        onlineUsers[userId] = {
            online: true,
            peerId: peerId,
            lastSeen: Date.now()
        };
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
        return;
    }
    
    const userRef = firebaseDb.ref('presence/' + userId);
    
    // Set user as online
    userRef.set({
        online: true,
        peerId: peerId,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Handle disconnection
    userRef.onDisconnect().update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function setUserPresenceOffline(userId) {
    if (!firebaseDb) {
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        if (onlineUsers[userId]) {
            onlineUsers[userId].online = false;
            onlineUsers[userId].lastSeen = Date.now();
        }
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
        return;
    }
    
    const userRef = firebaseDb.ref('presence/' + userId);
    userRef.update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function getUserPresence(userId, callback) {
    if (!firebaseDb) {
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        callback(onlineUsers[userId] || { online: false, peerId: null });
        return;
    }
    
    firebaseDb.ref('presence/' + userId).on('value', (snapshot) => {
        const data = snapshot.val();
        callback(data || { online: false, peerId: null });
    });
}

function getAllOnlineUsers(callback) {
    if (!firebaseDb) {
        const onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        callback(onlineUsers);
        return;
    }
    
    firebaseDb.ref('presence').on('value', (snapshot) => {
        callback(snapshot.val() || {});
    });
}

// ==========================================
// Call Signaling
// ==========================================

function sendCallSignal(callerId, targetId, signalData) {
    if (!firebaseDb) {
        // Store in localStorage for same-browser testing
        const signals = JSON.parse(localStorage.getItem('callSignals') || '{}');
        signals[targetId] = {
            callerId: callerId,
            data: signalData,
            timestamp: Date.now()
        };
        localStorage.setItem('callSignals', JSON.stringify(signals));
        return;
    }
    
    firebaseDb.ref('calls/' + targetId).set({
        callerId: callerId,
        data: signalData,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Auto-delete after 30 seconds
    setTimeout(() => {
        firebaseDb.ref('calls/' + targetId).remove();
    }, 30000);
}

function listenForIncomingCalls(userId, callback) {
    if (!firebaseDb) {
        // Poll localStorage for signals
        setInterval(() => {
            const signals = JSON.parse(localStorage.getItem('callSignals') || '{}');
            if (signals[userId]) {
                const signal = signals[userId];
                // Only process if signal is recent (within 30 seconds)
                if (Date.now() - signal.timestamp < 30000) {
                    callback(signal);
                    delete signals[userId];
                    localStorage.setItem('callSignals', JSON.stringify(signals));
                }
            }
        }, 1000);
        return;
    }
    
    firebaseDb.ref('calls/' + userId).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            callback(data);
            // Clear the signal after processing
            firebaseDb.ref('calls/' + userId).remove();
        }
    });
}

function acceptCallSignal(targetId, callerId) {
    if (!firebaseDb) {
        const signals = JSON.parse(localStorage.getItem('callAccepted') || '{}');
        signals[callerId] = {
            targetId: targetId,
            timestamp: Date.now()
        };
        localStorage.setItem('callAccepted', JSON.stringify(signals));
        return;
    }
    
    firebaseDb.ref('callResponses/' + callerId).set({
        targetId: targetId,
        accepted: true,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

function declineCallSignal(targetId, callerId) {
    if (!firebaseDb) {
        const signals = JSON.parse(localStorage.getItem('callDeclined') || '{}');
        signals[callerId] = {
            targetId: targetId,
            timestamp: Date.now()
        };
        localStorage.setItem('callDeclined', JSON.stringify(signals));
        return;
    }
    
    firebaseDb.ref('callResponses/' + callerId).set({
        targetId: targetId,
        accepted: false,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    setTimeout(() => {
        firebaseDb.ref('callResponses/' + callerId).remove();
    }, 5000);
}

function listenForCallResponse(callerId, callback) {
    if (!firebaseDb) {
        // Poll localStorage
        const checkResponse = () => {
            const accepted = JSON.parse(localStorage.getItem('callAccepted') || '{}');
            const declined = JSON.parse(localStorage.getItem('callDeclined') || '{}');
            
            if (accepted[callerId]) {
                callback({ accepted: true });
                delete accepted[callerId];
                localStorage.setItem('callAccepted', JSON.stringify(accepted));
            } else if (declined[callerId]) {
                callback({ accepted: false });
                delete declined[callerId];
                localStorage.setItem('callDeclined', JSON.stringify(declined));
            }
        };
        
        const interval = setInterval(checkResponse, 500);
        return () => clearInterval(interval);
    }
    
    firebaseDb.ref('callResponses/' + callerId).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            callback(data);
        }
    });
    
    return () => {
        firebaseDb.ref('callResponses/' + callerId).off();
    };
}

// ==========================================
// Initialize on load
// ==========================================

// Initialize Firebase when the script loads
document.addEventListener('DOMContentLoaded', initFirebase);
