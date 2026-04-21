const { Client } = require('whatsapp-web.js');
const express = require('express');
const app = express();

// Simple monitoring endpoint
app.get('/status', (req, res) => {
    const status = {
        bot_running: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
    };
    res.json(status);
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`📊 Monitoring server running on port ${PORT}`);
});