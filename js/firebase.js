// ==========================================
// Firebase Real-time Signaling for BSITHUB
// ==========================================

// Firebase Configuration (Public demo project)
var firebaseConfig = {
    apiKey: "AIzaSyDemo_BSITHUB_Key_123456789",
    authDomain: "bsithub-demo.firebaseapp.com",
    databaseURL: "https://bsithub-demo-default-rtdb.firebaseio.com",
    projectId: "bsithub-demo",
    storageBucket: "bsithub-demo.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase
var firebaseApp = null;
var firebaseDb = null;
var firebaseInitialized = false;

function initFirebase() {
    if (firebaseInitialized) return;
    
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseDb = firebase.database();
        firebaseInitialized = true;
        console.log('Firebase initialized');
    } catch (e) {
        console.warn('Firebase initialization failed, using fallback:', e);
        // Use localStorage fallback
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
        var onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        onlineUsers[userId] = {
            online: true,
            peerId: peerId,
            lastSeen: Date.now()
        };
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
        return;
    }
    
    var userRef = firebaseDb.ref('presence/' + userId);
    
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
        var onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        if (onlineUsers[userId]) {
            onlineUsers[userId].online = false;
            onlineUsers[userId].lastSeen = Date.now();
        }
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
        return;
    }
    
    var userRef = firebaseDb.ref('presence/' + userId);
    userRef.update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function getUserPresence(userId, callback) {
    if (!firebaseDb) {
        var onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        callback(onlineUsers[userId] || { online: false, peerId: null });
        return;
    }
    
    firebaseDb.ref('presence/' + userId).on('value', function(snapshot) {
        var data = snapshot.val();
        callback(data || { online: false, peerId: null });
    });
}

function getAllOnlineUsers(callback) {
    if (!firebaseDb) {
        var onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
        callback(onlineUsers);
        return;
    }
    
    firebaseDb.ref('presence').on('value', function(snapshot) {
        callback(snapshot.val() || {});
    });
}

// ==========================================
// Call Signaling
// ==========================================

function sendCallSignal(callerId, targetId, signalData) {
    if (!firebaseDb) {
        // Store in localStorage for same-browser testing
        var signals = JSON.parse(localStorage.getItem('callSignals') || '{}');
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
    setTimeout(function() {
        firebaseDb.ref('calls/' + targetId).remove();
    }, 30000);
}

function listenForIncomingCalls(userId, callback) {
    if (!firebaseDb) {
        // Poll localStorage for signals
        setInterval(function() {
            var signals = JSON.parse(localStorage.getItem('callSignals') || '{}');
            if (signals[userId]) {
                var signal = signals[userId];
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
    
    firebaseDb.ref('calls/' + userId).on('value', function(snapshot) {
        var data = snapshot.val();
        if (data) {
            callback(data);
            // Clear the signal after processing
            firebaseDb.ref('calls/' + userId).remove();
        }
    });
}

function acceptCallSignal(targetId, callerId) {
    if (!firebaseDb) {
        var signals = JSON.parse(localStorage.getItem('callAccepted') || '{}');
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
        var signals = JSON.parse(localStorage.getItem('callDeclined') || '{}');
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
    
    setTimeout(function() {
        firebaseDb.ref('callResponses/' + callerId).remove();
    }, 5000);
}

function listenForCallResponse(callerId, callback) {
    if (!firebaseDb) {
        // Poll localStorage
        var checkResponse = function() {
            var accepted = JSON.parse(localStorage.getItem('callAccepted') || '{}');
            var declined = JSON.parse(localStorage.getItem('callDeclined') || '{}');
            
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
        
        var interval = setInterval(checkResponse, 500);
        return function() { clearInterval(interval); };
    }
    
    firebaseDb.ref('callResponses/' + callerId).on('value', function(snapshot) {
        var data = snapshot.val();
        if (data) {
            callback(data);
        }
    });
    
    return function() {
        firebaseDb.ref('callResponses/' + callerId).off();
    };
}

// ==========================================
// Initialize on load
// ==========================================

// Initialize Firebase when the script loads
document.addEventListener('DOMContentLoaded', initFirebase);
