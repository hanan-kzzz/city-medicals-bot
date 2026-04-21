const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, 'orders.json');

// Configuration
const CONFIG = {
    USER: 'admin',
    PASS: process.env.DASHBOARD_PASSWORD || 'admin123'
};

// Middleware
app.use(express.json());

const authMiddleware = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === CONFIG.USER && password === CONFIG.PASS) return next();
    return res.status(401).json({ error: 'Unauthorized' });
};

// Serve static files
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'public/style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'public/app.js')));
app.use('/prescriptions', express.static(path.join(__dirname, 'public/prescriptions')));

// Orders API
app.get('/api/orders', authMiddleware, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Bot Control API
app.get('/api/bot/status', authMiddleware, (req, res) => {
    exec('pm2 jlist', (err, stdout) => {
        if (err) return res.status(500).json({ status: 'OFFLINE', error: err.message });
        try {
            const list = JSON.parse(stdout);
            const bot = list.find(p => p.name === 'whatsapp-bot');
            if (bot) {
                res.json({
                    status: bot.pm2_env.status === 'online' ? 'ONLINE' : 'STOPPED',
                    uptime: bot.pm2_env.pm_uptime,
                    memory: bot.monit.memory,
                    cpu: bot.monit.cpu
                });
            } else {
                res.json({ status: 'NOT_FOUND' });
            }
        } catch (e) {
            res.status(500).json({ status: 'ERROR' });
        }
    });
});

app.post('/api/bot/start', authMiddleware, (req, res) => {
    // We try to restart if it exists, or start if it doesn't
    exec('pm2 restart whatsapp-bot', (err) => {
        if (err) {
            // If restart fails, it might not be in the list, so we start it using the config
            exec('pm2 start ecosystem.config.js --only whatsapp-bot', (err2) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({ success: true, message: 'Bot started' });
            });
        } else {
            res.json({ success: true, message: 'Bot restarted' });
        }
    });
});

app.post('/api/bot/stop', authMiddleware, (req, res) => {
    exec('pm2 stop whatsapp-bot', (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Bot stopped' });
    });
});

// Proxy: Complete order (Sends to bot on port 3005)
app.post('/api/orders/:id/complete', authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        const auth = req.headers.authorization;
        const response = await fetch(`http://localhost:3005/api/orders/${id}/complete`, {
            method: 'POST',
            headers: { 'Authorization': auth }
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(503).json({ error: 'Bot is currently OFFLINE. Please start it to complete orders.' });
    }
});

// Proxy: Bot Status Detail (QR Code etc.)
app.get('/api/status', authMiddleware, async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/bot/state');
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.json({ status: 'OFFLINE' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Dashboard server running at http://localhost:${port}`);
});
