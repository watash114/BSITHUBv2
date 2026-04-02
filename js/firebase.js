// ==========================================
// Firebase Real-time Messaging for BSITHUB
// ==========================================

// Firebase Configuration
var firebaseConfig = {
    apiKey: "AIzaSyDqCLKvwD3j9z_EQCzHrtcGXOpYgXPm3yw",
    authDomain: "bsithub-1974a.firebaseapp.com",
    databaseURL: "https://bsithub-1974a-default-rtdb.firebaseio.com",
    projectId: "bsithub-1974a",
    storageBucket: "bsithub-1974a.firebasestorage.app",
    messagingSenderId: "790480652401",
    appId: "1:790480652401:web:38e18646da4869c3da73d0"
};

// Initialize Firebase
var firebaseApp = null;
var firebaseDb = null;
var firebaseInitialized = false;

function initFirebaseMessaging() {
    if (firebaseInitialized) return;
    
    if (typeof firebase === 'undefined') {
        console.warn('Firebase SDK not loaded');
        return;
    }
    
    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        firebaseDb = firebase.database();
        firebaseInitialized = true;
        console.log('Firebase initialized for messaging');
    } catch (e) {
        console.warn('Firebase initialization failed:', e);
    }
}

// ==========================================
// Sync Messages to Firebase
// ==========================================

function syncMessageToFirebase(message) {
    if (!firebaseDb || !message) return;
    
    var messageRef = firebaseDb.ref('messages/' + message.chatId + '/' + message.id);
    messageRef.set(message).catch(function(err) {
        console.error('Error syncing message:', err);
    });
}

// ==========================================
// Listen for Messages from Firebase
// ==========================================

var firebaseListeners = {};

function listenForMessages(chatId, callback) {
    if (!firebaseDb) return;
    
    // Remove existing listener for this chat
    if (firebaseListeners[chatId]) {
        firebaseListeners[chatId].off();
    }
    
    var messagesRef = firebaseDb.ref('messages/' + chatId);
    
    firebaseListeners[chatId] = messagesRef;
    
    messagesRef.on('value', function(snapshot) {
        var messages = snapshot.val();
        if (messages) {
            var messagesArray = Object.values(messages);
            messagesArray.sort(function(a, b) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            });
            
            // Update localStorage with Firebase messages
            var localMessages = Storage.get('messages') || [];
            
            messagesArray.forEach(function(fbMsg) {
                var existingIndex = localMessages.findIndex(function(m) { return m.id === fbMsg.id; });
                if (existingIndex === -1) {
                    localMessages.push(fbMsg);
                } else {
                    localMessages[existingIndex] = fbMsg;
                }
            });
            
            Storage.set('messages', localMessages);
            
            if (callback) {
                callback(messagesArray);
            }
        }
    });
}

function stopListeningForMessages(chatId) {
    if (firebaseListeners[chatId]) {
        firebaseListeners[chatId].off();
        delete firebaseListeners[chatId];
    }
}

// ==========================================
// User Presence
// ==========================================

function setUserOnlineFirebase(userId) {
    if (!firebaseDb) return;
    
    var userRef = firebaseDb.ref('online/' + userId);
    userRef.set({
        online: true,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
    
    userRef.onDisconnect().update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function setUserOfflineFirebase(userId) {
    if (!firebaseDb) return;
    
    var userRef = firebaseDb.ref('online/' + userId);
    userRef.update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

function listenForUserStatus(userId, callback) {
    if (!firebaseDb) return;
    
    firebaseDb.ref('online/' + userId).on('value', function(snapshot) {
        var status = snapshot.val();
        callback(status || { online: false });
    });
}

// ==========================================
// Typing Indicator via Firebase
// ==========================================

function sendTypingIndicatorFirebase(chatId, userId) {
    if (!firebaseDb) return;
    
    firebaseDb.ref('typing/' + chatId).set({
        userId: userId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    // Auto-clear after 3 seconds
    setTimeout(function() {
        firebaseDb.ref('typing/' + chatId).remove();
    }, 3000);
}

function listenForTypingIndicator(chatId, currentUserId, callback) {
    if (!firebaseDb) return;
    
    firebaseDb.ref('typing/' + chatId).on('value', function(snapshot) {
        var typing = snapshot.val();
        if (typing && typing.userId !== currentUserId) {
            callback(typing);
        }
    });
}

// ==========================================
// Initialize Firebase on Load
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    initFirebaseMessaging();
});
