const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ffmpeg = require('ffmpeg-static');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, 'orders.json');

// Configuration
const CONFIG = {
    USER: 'admin',
    PASS: process.env.DASHBOARD_PASSWORD || 'admin123'
};

// Initialize WhatsApp Client
const authPath = path.resolve(process.cwd(), 'whatsapp-bot-auth');
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authPath,
        clientId: 'medical-shop-bot'
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014559843-alpha.html',
    },
    puppeteer: {
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // This helps a lot with memory
            '--disable-gpu'
        ]
    }
});

let qrCodeData = null;
let botStatus = 'INITIALIZING';

client.on('qr', (qr) => {
    qrCodeData = qr;
    botStatus = 'AWAITING_SCAN';
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('✅ WhatsApp bot is READY!');
    qrCodeData = null;
    botStatus = 'ONLINE';
});

client.on('authenticated', () => {
    console.log('✅ Authenticated');
    botStatus = 'AUTHENTICATED';
});

client.on('auth_failure', () => {
    botStatus = 'AUTH_FAILED';
});

client.on('disconnected', () => {
    botStatus = 'DISCONNECTED';
});

// Start WhatsApp
client.initialize();

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

// Bot Status API for Dashboard
app.get('/api/bot/state', authMiddleware, (req, res) => {
    res.json({
        state: botStatus,
        qr: qrCodeData
    });
});

// Helper for sending messages
app.post('/api/orders/:id/complete', authMiddleware, async (req, res) => {
    try {
        const orderId = req.params.id;
        const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        const order = data.orders.find(o => o.id == orderId);

        if (order) {
            order.status = 'COMPLETED';
            fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));

            if (botStatus === 'ONLINE') {
                const patientId = order.contact.includes('@c.us') ? order.contact : `${order.contact}@c.us`;
                const msg = `✅ *ORDER COMPLETED*\nDear *${order.name}*, your order is ready! 🏥`;
                await client.sendMessage(patientId, msg);
            }
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Unified Server running at http://localhost:${port}`);
});
