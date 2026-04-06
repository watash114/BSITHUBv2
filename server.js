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

// Parse JSON bodies
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// Helper function to make HTTPS requests
// ==========================================
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// ==========================================
// GIF Proxy API (Tenor)
// ==========================================
const TENOR_API_KEY = 'LIVDSRZULELA';

app.get('/api/gifs/trending', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const url = `https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=${limit}&media_filter=minimal`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('GIF trending error:', error.message);
        res.json({ results: [] });
    }
});

app.get('/api/gifs/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        if (!query.trim()) {
            return res.json({ results: [] });
        }
        const url = `https://g.tenor.com/v1/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&media_filter=minimal`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('GIF search error:', error.message);
        res.json({ results: [] });
    }
});

// ==========================================
// News API Proxy (NewsAPI.org)
// ==========================================
const NEWS_API_KEY = process.env.NEWS_API_KEY || '11d62a2481dd4d95965ce1fe86fb07d5';

app.get('/api/news', async (req, res) => {
    try {
        const category = req.query.category || 'general';
        const validCategories = ['general', 'technology', 'sports', 'entertainment', 'business', 'health', 'science'];
        const cat = validCategories.includes(category) ? category : 'general';
        const url = `https://newsapi.org/v2/top-headlines?country=us&category=${cat}&pageSize=10&apiKey=${NEWS_API_KEY}`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('News API error:', error.message);
        res.json({
            status: 'ok',
            articles: [
                { title: 'BSITHUB - Connect & Chat', description: 'Welcome to BSITHUB! Get your free API key from newsapi.org for real news feeds.', source: { name: 'BSITHUB' }, publishedAt: new Date().toISOString(), url: '#' },
                { title: 'Stay Connected', description: 'Chat with friends, share posts, and stay updated with the latest news.', source: { name: 'BSITHUB' }, publishedAt: new Date().toISOString(), url: '#' }
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
        const lat = parseFloat(req.query.lat) || 0;
        const lon = parseFloat(req.query.lon) || 0;
        if (lat === 0 && lon === 0) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`;
        const data = await fetchJSON(url);
        res.json(data);
    } catch (error) {
        console.error('Weather API error:', error.message);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

// ==========================================
// Health Check
// ==========================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// Socket.IO
// ==========================================
let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (userId) => {
        onlineUsers[userId] = {
            socketId: socket.id,
            joinedAt: new Date().toISOString()
        };
        console.log('User joined:', userId);
        io.emit('online-users', Object.keys(onlineUsers));
    });

    socket.on('message', (data) => {
        if (data && data.chatId) {
            io.to(data.chatId).emit('message', data);
        }
    });

    socket.on('join-chat', (chatId) => {
        if (chatId) {
            socket.join(chatId);
            console.log('User joined chat:', chatId);
        }
    });

    socket.on('leave-chat', (chatId) => {
        if (chatId) {
            socket.leave(chatId);
            console.log('User left chat:', chatId);
        }
    });

    socket.on('typing', (data) => {
        if (data && data.chatId && data.userId) {
            socket.to(data.chatId).emit('typing', { userId: data.userId, chatId: data.chatId });
        }
    });

    socket.on('disconnect', () => {
        for (let userId in onlineUsers) {
            if (onlineUsers[userId].socketId === socket.id) {
                delete onlineUsers[userId];
                console.log('User disconnected:', userId);
            }
        }
        io.emit('online-users', Object.keys(onlineUsers));
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`BSITHUB server running on port ${PORT}`);
    console.log(`News API: ${NEWS_API_KEY !== 'demo' ? 'Configured' : 'Not configured'}`);
    console.log(`Weather API: ${WEATHER_API_KEY !== 'demo' ? 'Configured' : 'Not configured'}`);
});
