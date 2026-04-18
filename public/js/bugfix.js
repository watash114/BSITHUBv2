// ==========================================
// BSITHUB Bug Fix & Stability Patch
// Replaces all broken overrides
// ==========================================

(function() {
    'use strict';
    
    // Store the ORIGINAL functions before any override
    var _originalOpenChat = null;
    var _originalRenderMessages = null;
    var _originalMobileGoBack = null;
    
    // Wait for DOM and all scripts to load
    window.addEventListener('load', function() {
        
        // ==========================================
        // 0. Fix input element ID mismatch
        // ==========================================
        var msgInput = document.getElementById('message-input');
        if (msgInput && !document.getElementById('chat-input')) {
            // Create alias - JS uses chat-input, HTML has message-input
            msgInput.id = 'chat-input';
            msgInput.setAttribute('data-original-id', 'message-input');
        }
        
        // ==========================================
        // 1. Fix openChat - Single clean override
        // ==========================================
        _originalOpenChat = window.openChat;
        
        window.openChat = function(chatId, userId) {
            if (!chatId) return;
            
            try {
                // Call original openChat
                if (typeof _originalOpenChat === 'function') {
                    _originalOpenChat.call(window, chatId, userId);
                }
            } catch (e) {
                console.warn('openChat error:', e);
            }
            
            // Force display on mobile
            if (window.innerWidth <= 768) {
                setTimeout(function() {
                    forceShowChat(chatId, userId);
                }, 50);
            }
        };
        
        // ==========================================
        // 2. Fix page separation
        // ==========================================
        fixPageSeparation();
        
        // ==========================================
        // 3. Fix mobile back button
        // ==========================================
        _originalMobileGoBack = window.mobileGoBack;
        
        window.mobileGoBack = function() {
            document.body.classList.remove('chat-is-open');
            
            var chatSidebar = document.querySelector('.chat-sidebar');
            var chatActive = document.getElementById('chat-active');
            
            if (chatSidebar) chatSidebar.style.display = '';
            if (chatActive) chatActive.style.display = 'none';
            
            var mobileNav = document.getElementById('mobile-nav');
            if (mobileNav) mobileNav.style.display = '';
            
            var headerTitle = document.getElementById('mobile-header-title');
            if (headerTitle) headerTitle.textContent = 'Chats';
        };
        
        // ==========================================
        // 4. Fix chat item click handler
        // ==========================================
        fixChatItemClicks();
        
        // ==========================================
        // 5. Fix null reference errors
        // ==========================================
        fixNullErrors();
        
        // ==========================================
        // 6. Mobile: Tap message to show actions
        // ==========================================
        if (window.innerWidth <= 768) {
            document.addEventListener('click', function(e) {
                var msg = e.target.closest('.message');
                if (msg && !e.target.closest('.message-action-btn')) {
                    // Remove from all other messages
                    document.querySelectorAll('.message.show-actions').forEach(function(m) {
                        if (m !== msg) m.classList.remove('show-actions');
                    });
                    // Toggle on tapped message
                    msg.classList.toggle('show-actions');
                } else if (!e.target.closest('.message')) {
                    // Tap outside - hide all
                    document.querySelectorAll('.message.show-actions').forEach(function(m) {
                        m.classList.remove('show-actions');
                    });
                }
            });
        }
        
        console.log('BSITHUB Bug Fix Patch loaded');
    });
    
    // ==========================================
    // Force show chat on mobile
    // ==========================================
    function forceShowChat(chatId, userId) {
        var chatActive = document.getElementById('chat-active');
        var chatSidebar = document.querySelector('.chat-sidebar');
        var mobileNav = document.getElementById('mobile-nav');
        var headerTitle = document.getElementById('mobile-header-title');
        
        // Show chat
        if (chatActive) {
            chatActive.style.display = 'flex';
            chatActive.style.visibility = 'visible';
        }
        
        // Hide sidebar
        if (chatSidebar) {
            chatSidebar.style.display = 'none';
        }
        
        // Hide bottom nav
        if (mobileNav) {
            mobileNav.style.display = 'none';
        }
        
        // Add body class
        document.body.classList.add('chat-is-open');
        
        // Update header
        if (headerTitle) {
            var chats = Storage.get('chats') || [];
            var users = Storage.get('users') || [];
            var chat = chats.find(function(c) { return c.id === chatId; });
            
            if (chat) {
                if (chat.isGroup) {
                    headerTitle.textContent = chat.groupName || 'Group';
                } else {
                    var otherUser = users.find(function(u) { return u.id === userId; });
                    headerTitle.textContent = otherUser ? otherUser.name : 'Chat';
                }
            }
        }
        
        // Scroll messages to bottom
        var messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    // ==========================================
    // Fix page separation
    // ==========================================
    function fixPageSeparation() {
        // Don't override page visibility - let app.js handle it
        // Just ensure mobile nav visibility is correct
        if (window.innerWidth <= 768) {
            var savedUser = localStorage.getItem('currentUser');
            var mobileNav = document.getElementById('mobile-nav');
            var mobileHeader = document.getElementById('mobile-header');
            
            if (savedUser && savedUser !== 'null') {
                if (mobileNav) mobileNav.style.display = 'block';
                if (mobileHeader) mobileHeader.style.display = 'flex';
            } else {
                if (mobileNav) mobileNav.style.display = 'none';
                if (mobileHeader) mobileHeader.style.display = 'none';
            }
        }
    }
    
    // ==========================================
    // Fix chat item clicks
    // ==========================================
    function fixChatItemClicks() {
        // Remove any existing listeners by using a flag
        if (window._chatClickFixed) return;
        window._chatClickFixed = true;
        
        document.addEventListener('click', function(e) {
            var chatItem = e.target.closest('.chat-item');
            if (!chatItem) return;
            if (e.target.closest('.swipe-action') || e.target.closest('.swipe-actions')) return;
            
            var chatId = chatItem.dataset.chatId;
            var userId = chatItem.dataset.userId;
            
            if (chatId && typeof window.openChat === 'function') {
                e.preventDefault();
                e.stopPropagation();
                window.openChat(chatId, userId);
            }
        }, true);
    }
    
    // ==========================================
    // Fix null reference errors
    // ==========================================
    function fixNullErrors() {
        // Safe getElementById wrapper
        var _origGetById = document.getElementById.bind(document);
        
        // Wrap commonly accessed elements
        var safeElements = [
            'chat-placeholder', 'chat-active', 'chat-user-name',
            'chat-user-status', 'chat-avatar', 'chat-wallpaper',
            'chat-messages', 'mobile-header-title', 'mobile-nav',
            'mobile-header', 'typing-indicator'
        ];
        
        // Pre-check these elements exist
        safeElements.forEach(function(id) {
            var el = _origGetById(id);
            if (!el) {
                console.warn('Element not found: #' + id);
            }
        });
    }
    
})();

// ==========================================
// Fix input bar - ensure send button works
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    // Fix send button
    var sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.onclick = function() {
            var input = document.getElementById('message-input');
            if (input && input.value.trim()) {
                if (typeof sendMessage === 'function') {
                    sendMessage(input.value.trim());
                    input.value = '';
                }
            }
        };
    }
    
    // Fix enter key on message input
    var msgInput = document.getElementById('message-input');
    if (msgInput) {
        msgInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                var sendBtn = document.getElementById('send-btn');
                if (sendBtn) sendBtn.click();
            }
        });
        
        msgInput.addEventListener('input', function() {
            if (typeof sendTypingIndicator === 'function') sendTypingIndicator();
            if (typeof handleMentionInput === 'function') handleMentionInput(this);
        });
    }
    
    // More input options popup
    window.showMoreInputOptions = function() {
        var html = '<div style="padding:12px"><h4 style="margin-bottom:12px">More Options</h4>';
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
        html += '<button onclick="showQuickReplies();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-bolt" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Quick Reply</button>';
        html += '<button onclick="showScheduleMessage();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-clock" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Schedule</button>';
        html += '<button onclick="showPinnedMessages();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-thumbtack" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Pinned</button>';
        html += '<button onclick="shareLocation();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-map-marker-alt" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Location</button>';
        html += '<button onclick="showCreatePoll();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-poll" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Poll</button>';
        html += '<button onclick="showStickers();closeModal()" style="padding:12px;border:none;background:var(--bg-secondary);border-radius:10px;cursor:pointer"><i class="fas fa-sticky-note" style="display:block;font-size:20px;margin-bottom:6px;color:var(--primary)"></i>Stickers</button>';
        html += '</div></div>';
        if (typeof showModal === 'function') showModal(html);
    };
});
