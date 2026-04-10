// ==========================================
// Mobile Navigation - FIXED
// ==========================================
var mobileCurrentSection = 'chats';
var mobileInChat = false;

window.mobileNavigate = function(section) {
    // Update mobile nav items
    document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.section === section) {
            item.classList.add('active');
        }
    });
    
    // Update sidebar nav items
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.section === section) {
            item.classList.add('active');
        }
    });
    
    // Hide all content sections
    document.querySelectorAll('.content-section').forEach(function(sec) {
        sec.classList.remove('active');
    });
    
    // Show the selected section
    var targetSection = document.getElementById(section + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Handle special cases
    if (section === 'chats') {
        var chatSidebar = document.querySelector('.chat-sidebar');
        if (chatSidebar) chatSidebar.style.display = 'flex';
    }
    
    // Hide chat main if visible
    var chatMain = document.getElementById('chat-main');
    if (chatMain) chatMain.classList.remove('active-mobile');
    mobileInChat = false;
    
    // Update header title
    var titles = {
        'chats': 'Chats',
        'groups': 'Groups',
        'starred': 'Starred',
        'feed': 'Postings',
        'profile': 'Profile',
        'settings': 'Settings',
        'admin': 'Admin'
    };
    document.getElementById('mobile-header-title').textContent = titles[section] || 'BSITHUB';
    
    mobileCurrentSection = section;
    
    // Load section content
    if (section === 'groups' && typeof loadGroups === 'function') {
        loadGroups();
    } else if (section === 'starred' && typeof loadStarred === 'function') {
        loadStarred();
    } else if (section === 'feed' && typeof loadFeed === 'function') {
        loadFeed();
    } else if (section === 'profile' && typeof loadProfile === 'function') {
        loadProfile();
    } else if (section === 'admin' && typeof loadAdminData === 'function') {
        loadAdminData();
    }
};

window.mobileOpenChat = function(chatId, userId) {
    mobileInChat = true;
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(function(sec) {
        sec.classList.remove('active');
    });
    
    // Show chats section
    var chatsSection = document.getElementById('chats-section');
    if (chatsSection) chatsSection.classList.add('active');
    
    // Hide chat sidebar on mobile
    var chatSidebar = document.querySelector('.chat-sidebar');
    if (chatSidebar) chatSidebar.style.display = 'none';
    
    // Show chat main
    var chatMain = document.getElementById('chat-main');
    if (chatMain) {
        chatMain.style.display = 'flex';
        chatMain.classList.add('active-mobile');
    }
    
    // Update header
    var users = Storage.get('users') || [];
    var chats = Storage.get('chats') || [];
    var chat = chats.find(function(c) { return c.id === chatId; });
    
    if (chat) {
        if (chat.isGroup) {
            document.getElementById('mobile-header-title').textContent = chat.groupName || 'Group';
        } else {
            var otherUser = users.find(function(u) { return u.id === userId; });
            document.getElementById('mobile-header-title').textContent = otherUser ? otherUser.name : 'Chat';
        }
    }
    
    // Open the chat
    if (typeof originalOpenChat === 'function') {
        originalOpenChat(chatId, userId);
    }
};

window.mobileGoBack = function() {
    if (mobileInChat) {
        // Go back to chat list
        mobileInChat = false;
        
        var chatSidebar = document.querySelector('.chat-sidebar');
        if (chatSidebar) chatSidebar.style.display = 'flex';
        
        var chatMain = document.getElementById('chat-main');
        if (chatMain) {
            chatMain.style.display = 'none';
            chatMain.classList.remove('active-mobile');
        }
        
        document.getElementById('mobile-header-title').textContent = 'Chats';
        
        // Update nav
        document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
            item.classList.remove('active');
            if (item.dataset.section === 'chats') item.classList.add('active');
        });
        
        document.querySelectorAll('.nav-item').forEach(function(item) {
            item.classList.remove('active');
            if (item.dataset.section === 'chats') item.classList.add('active');
        });
    } else {
        // Go to chats section
        mobileNavigate('chats');
    }
};

// Store original openChat
var originalOpenChat = window.openChat;

// Override openChat for mobile
window.openChat = function(chatId, userId) {
    if (window.innerWidth <= 768) {
        mobileOpenChat(chatId, userId);
    } else if (originalOpenChat) {
        originalOpenChat(chatId, userId);
    }
};

// Initialize mobile navigation
document.addEventListener('DOMContentLoaded', function() {
    // Set up mobile nav click handlers
    document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            var section = this.dataset.section;
            if (section) {
                mobileNavigate(section);
            }
        });
    });
    
    // Set up sidebar nav click handlers for mobile
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            var section = this.dataset.section;
            if (section && window.innerWidth <= 768) {
                mobileNavigate(section);
            }
        });
    });
});

// Handle orientation change
window.addEventListener('orientationchange', function() {
    setTimeout(function() {
        window.scrollTo(0, 0);
        if (window.innerWidth > 768) {
            // Reset to desktop view
            var chatSidebar = document.querySelector('.chat-sidebar');
            if (chatSidebar) chatSidebar.style.display = 'flex';
            
            var chatMain = document.getElementById('chat-main');
            if (chatMain) {
                chatMain.style.display = '';
                chatMain.classList.remove('active-mobile');
            }
        }
    }, 100);
});

// Handle resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        // Desktop view
        var chatSidebar = document.querySelector('.chat-sidebar');
        if (chatSidebar) chatSidebar.style.display = 'flex';
        
        var chatMain = document.getElementById('chat-main');
        if (chatMain) {
            chatMain.style.display = '';
            chatMain.classList.remove('active-mobile');
        }
    }
});
