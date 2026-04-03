// Firebase Real-time Messaging for BSITHUB

var firebaseConfig = {
    apiKey: "AIzaSyDqCLKvwD3j9z_EQCzHrtcGXOpYgXPm3yw",
    authDomain: "bsithub-1974a.firebaseapp.com",
    databaseURL: "https://bsithub-1974a-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bsithub-1974a",
    storageBucket: "bsithub-1974a.firebasestorage.app",
    messagingSenderId: "790480652401",
    appId: "1:790480652401:web:38e18646da4869c3da73d0"
};

var firebaseApp = null;
var firebaseDb = null;
var firebaseInitialized = false;
var activeListeners = {};

function initFirebase() {
    if (firebaseInitialized) return true;
    try {
        if (typeof firebase === 'undefined' || typeof firebase.database !== 'function') {
            setTimeout(initFirebase, 500);
            return false;
        }
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }
        firebaseDb = firebase.database();
        firebaseInitialized = true;
        console.log('Firebase initialized!');
        return true;
    } catch (e) {
        console.error('Firebase error:', e);
        setTimeout(initFirebase, 1000);
        return false;
    }
}

function sendMsgToFirebase(msg) {
    return new Promise(function(resolve, reject) {
        function trySend() {
            if (!firebaseDb) { setTimeout(trySend, 1000); return; }
            firebaseDb.ref('messages/' + msg.chatId + '/' + msg.id).set(msg).then(resolve).catch(reject);
        }
        trySend();
    });
}

function listenChat(chatId, onNewMessage) {
    function tryListen() {
        if (!firebaseDb) { setTimeout(tryListen, 1000); return; }
        if (activeListeners[chatId]) { activeListeners[chatId].off(); }
        var ref = firebaseDb.ref('messages/' + chatId);
        activeListeners[chatId] = ref;
        ref.on('child_added', function(snapshot) {
            var msg = snapshot.val();
            if (msg) { console.log('New msg:', msg.text); onNewMessage(msg); }
        });
        ref.on('child_changed', function(snapshot) {
            var msg = snapshot.val();
            if (msg) { onNewMessage(msg); }
        });
        console.log('Listening:', chatId);
    }
    tryListen();
}

function stopListenChat(chatId) {
    if (activeListeners[chatId]) { activeListeners[chatId].off(); delete activeListeners[chatId]; }
}

function loadChatMessages(chatId) {
    return new Promise(function(resolve) {
        function tryLoad() {
            if (!firebaseDb) { setTimeout(tryLoad, 1000); return; }
            firebaseDb.ref('messages/' + chatId).once('value').then(function(snap) {
                var msgs = [];
                if (snap.val()) { snap.forEach(function(c) { msgs.push(c.val()); }); }
                msgs.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                resolve(msgs);
            }).catch(function() { resolve([]); });
        }
        tryLoad();
    });
}

function syncChat(chat) {
    if (!chat) return;
    function trySync() {
        if (!firebaseDb) { setTimeout(trySync, 1000); return; }
        firebaseDb.ref('chats/' + chat.id).set(chat);
        chat.participants.forEach(function(userId) {
            firebaseDb.ref('userChats/' + userId + '/' + chat.id).set({ id: chat.id, addedAt: new Date().toISOString() });
        });
        console.log('Chat synced:', chat.id);
    }
    trySync();
}

function getUserChats(userId) {
    return new Promise(function(resolve) {
        function tryLoad() {
            if (!firebaseDb) { setTimeout(tryLoad, 1000); return; }
            firebaseDb.ref('userChats/' + userId).once('value').then(function(snap) {
                var chatIds = [];
                if (snap.val()) { Object.keys(snap.val()).forEach(function(id) { chatIds.push(id); }); }
                resolve(chatIds);
            }).catch(function() { resolve([]); });
        }
        tryLoad();
    });
}

function listenNewChats(userId, onNewChat) {
    function tryListen() {
        if (!firebaseDb) { setTimeout(tryListen, 1000); return; }
        firebaseDb.ref('userChats/' + userId).on('child_added', function(snap) {
            var chatRef = snap.val();
            if (chatRef) {
                firebaseDb.ref('chats/' + chatRef.id).once('value').then(function(chatSnap) {
                    if (chatSnap.val()) { onNewChat(chatSnap.val()); }
                });
            }
        });
    }
    tryListen();
}

function setTyping(chatId, userId, isTyping) {
    function trySet() {
        if (!firebaseDb) { setTimeout(trySet, 1000); return; }
        if (isTyping) {
            firebaseDb.ref('typing/' + chatId + '/' + userId).set(true);
            setTimeout(function() { firebaseDb.ref('typing/' + chatId + '/' + userId).remove(); }, 3000);
        } else {
            firebaseDb.ref('typing/' + chatId + '/' + userId).remove();
        }
    }
    trySet();
}

function listenTyping(chatId, myUserId, callback) {
    function tryListen() {
        if (!firebaseDb) { setTimeout(tryListen, 1000); return; }
        firebaseDb.ref('typing/' + chatId).on('value', function(snap) {
            var typing = snap.val();
            if (typing) { Object.keys(typing).forEach(function(uid) { if (uid !== myUserId) { callback(uid); } }); }
        });
    }
    tryListen();
}

function goOnline(userId) {
    function tryGo() {
        if (!firebaseDb) { setTimeout(tryGo, 1000); return; }
        firebaseDb.ref('online/' + userId).set({ online: true, ts: firebase.database.ServerValue.TIMESTAMP });
        firebaseDb.ref('online/' + userId).onDisconnect().set({ online: false, ts: firebase.database.ServerValue.TIMESTAMP });
    }
    tryGo();
}

function goOffline(userId) {
    function tryGo() {
        if (!firebaseDb) { setTimeout(tryGo, 1000); return; }
        firebaseDb.ref('online/' + userId).set({ online: false, ts: firebase.database.ServerValue.TIMESTAMP });
    }
    tryGo();
}

console.log('Firebase module loaded');
