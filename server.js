const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// GIF Proxy API
// ==========================================
const TENOR_API_KEY = 'LIVDSRZULELA';

// Helper function to make HTTPS requests
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// GET /api/gifs/trending
app.get('/api/gifs/trending', async (req, res) => {
    try {
        const limit = req.query.limit || 20;
        const url = `https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=${limit}&media_filter=minimal`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('GIF trending error:', error);
        res.status(500).json({ error: 'Failed to fetch trending GIFs' });
    }
});

// GET /api/gifs/search?q=query
app.get('/api/gifs/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = req.query.limit || 20;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter required' });
        }
        const url = `https://g.tenor.com/v1/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&media_filter=minimal`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('GIF search error:', error);
        res.status(500).json({ error: 'Failed to search GIFs' });
    }
});

// ==========================================
// News API Proxy (NewsAPI.org)
// ==========================================
const NEWS_API_KEY = process.env.NEWS_API_KEY || '11d62a2481dd4d95965ce1fe86fb07d5';

app.get('/api/news', async (req, res) => {
    try {
        const category = req.query.category || 'general';
        const url = `https://newsapi.org/v2/top-headlines?country=us&category=${category}&apiKey=${NEWS_API_KEY}`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('News error:', error);
        // Return demo news on error
        res.json({
            articles: [
                { title: 'Welcome to BSITHUB News', description: 'Configure your NewsAPI key for real news', source: { name: 'BSITHUB' }, publishedAt: new Date().toISOString() }
            ]
        });
    }
});

// ==========================================
// Weather API Proxy (OpenWeatherMap)
// ==========================================
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '8c39f0a7ef12b456f83fa19d7a1f83bd';

app.get('/api/weather', async (req, res) => {
    try {
        const lat = req.query.lat || 0;
        const lon = req.query.lon || 0;
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('Weather error:', error);
        res.status(500).json({ error: 'Failed to fetch weather' });
    }
});

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
