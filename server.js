const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store online users
let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User joins with ID
    socket.on('join', (userId) => {
        onlineUsers[userId] = socket.id;
        console.log('User joined:', userId);
        
        // Send updated list to everyone
        io.emit('online-users', Object.keys(onlineUsers));
    });

    // User sends a message
    socket.on('message', (data) => {
        // Broadcast to all users in the chat
        io.to(data.chatId).emit('message', data);
    });

    // User joins a chat room
    socket.on('join-chat', (chatId) => {
        socket.join(chatId);
        console.log('User joined chat:', chatId);
    });

    // User leaves a chat room
    socket.on('leave-chat', (chatId) => {
        socket.leave(chatId);
        console.log('User left chat:', chatId);
    });

    // Disconnect
    socket.on('disconnect', () => {
        for (let userId in onlineUsers) {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
                console.log('User disconnected:', userId);
            }
        }
        
        // Send updated list to everyone
        io.emit('online-users', Object.keys(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
