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
            if (!firebaseDb) { 
                console.log('Firebase not ready, retrying send...');
                setTimeout(trySend, 1000); 
                return; 
            }
            console.log('Sending message to Firebase:', msg.id, msg.chatId);
            firebaseDb.ref('messages/' + msg.chatId + '/' + msg.id).set(msg)
                .then(function() {
                    console.log('Message sent to Firebase successfully!');
                    resolve();
                })
                .catch(function(err) {
                    console.error('Firebase send error:', err);
                    reject(err);
                });
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
            if (!firebaseDb) { 
                console.log('Firebase not ready for loadChatMessages, retrying...');
                setTimeout(tryLoad, 1000); 
                return; 
            }
            console.log('Loading messages from Firebase for chat:', chatId);
            firebaseDb.ref('messages/' + chatId).once('value').then(function(snap) {
                var msgs = [];
                if (snap.val()) { 
                    snap.forEach(function(c) { msgs.push(c.val()); }); 
                    console.log('Loaded', msgs.length, 'messages from Firebase');
                } else {
                    console.log('No messages found in Firebase for chat:', chatId);
                }
                msgs.sort(function(a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
                resolve(msgs);
            }).catch(function(err) {
                console.error('Error loading messages:', err);
                resolve([]);
            });
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

// ==========================================
// User Data Sync
// ==========================================
function syncUserToFirebase(user) {
    if (!user) return;
    function trySync() {
        if (!firebaseDb) { setTimeout(trySync, 1000); return; }
        // Only sync public info (no password)
        var userData = {
            id: user.id,
            name: user.name,
            username: user.username,
            avatar: user.avatar || null
        };
        firebaseDb.ref('users/' + user.id).set(userData);
        console.log('User synced to Firebase:', user.username);
    }
    trySync();
}

function fetchUserFromFirebase(userId) {
    return new Promise(function(resolve) {
        function tryFetch() {
            if (!firebaseDb) { setTimeout(tryFetch, 1000); return; }
            firebaseDb.ref('users/' + userId).once('value').then(function(snap) {
                var user = snap.val();
                if (user) {
                    // Add to local storage
                    var localUsers = Storage.get('users') || [];
                    var existingIndex = localUsers.findIndex(function(u) { return u.id === userId; });
                    if (existingIndex === -1) {
                        localUsers.push(user);
                    } else {
                        localUsers[existingIndex] = Object.assign({}, localUsers[existingIndex], user);
                    }
                    Storage.set('users', localUsers);
                    console.log('Fetched user from Firebase:', user.username);
                }
                resolve(user);
            }).catch(function() { resolve(null); });
        }
        tryFetch();
    });
}

function syncAllUsersToFirebase() {
    var users = Storage.get('users') || [];
    users.forEach(function(user) {
        syncUserToFirebase(user);
    });
}

console.log('Firebase module loaded');
