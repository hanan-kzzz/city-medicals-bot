const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const express = require('express');
require('dotenv').config();
const ffmpeg = require('ffmpeg-static');

// Set FFMPEG_PATH to ensure whatsapp-web.js can find it for voice message conversion
if (ffmpeg) {
    process.env.FFMPEG_PATH = ffmpeg;
    console.log('✅ FFMPEG path set successfully');
} else {
    console.warn('⚠️ ffmpeg-static path not found. Voice messages might fail.');
}

// Setup for Order Storage
const ORDERS_FILE = path.join(__dirname, 'orders.json');

if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: [] }, null, 2));
}

function saveOrder(order) {
    try {
        const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        data.orders.push({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            status: 'PENDING',
            ...order
        });
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error saving order to JSON:', err);
    }
}


const app = express();
const port = 3005; // Different port to avoid conflict with dashboard server
const authPath = process.env.WA_AUTH_PATH || path.resolve(process.env.LOCALAPPDATA || process.cwd(), 'whatsapp-bot-auth');

// Initialize the client
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
            '--disable-extensions',
            '--disable-gpu',
            '--no-first-run'
        ]
    }
});

// Bot configuration
const CONFIG = {
    STAFF_GROUP_ID: process.env.STAFF_GROUP_ID || '',
    AUTHORIZED_CUSTOMERS: process.env.AUTHORIZED_CUSTOMERS ?
        process.env.AUTHORIZED_CUSTOMERS.split(',').map(n => n.trim()) : [],
    DASHBOARD_USER: 'admin',
    DASHBOARD_PASS: process.env.DASHBOARD_PASSWORD || 'admin123'
};

// In-memory state management (will reset on bot restart)
// In a production environment, use a database like MongoDB
const userStates = {};

let qrCodeData = null;

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrCodeData = qr; // Store QR string
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp bot authenticated successfully!');
    qrCodeData = null; // Clear QR after login
    console.log('🔄 Proceeding to ready state...');
});

client.on('loading_screen', (percent, message) => {
    console.log(`🔄 Loading screen: ${percent}% - ${message}`);
});

client.on('auth_failure', message => {
    console.error('❌ Authentication failure:', message);
});

client.on('change_state', state => {
    console.log('🔁 Client state changed:', state);
});

client.on('ready', () => {
    console.log('🚀 WhatsApp bot is ready and listening for messages!');
    console.log('📊 Current configuration:');
    console.log(`   STAFF_GROUP_ID: ${CONFIG.STAFF_GROUP_ID || 'NOT SET'}
   AUTHORIZED_CUSTOMERS: ${CONFIG.AUTHORIZED_CUSTOMERS.length > 0 ? CONFIG.AUTHORIZED_CUSTOMERS.join(', ') : 'ALL CUSTOMERS ALLOWED'}
   BOT_API_PORT: ${port}`);
    console.log('💬 Bot is now ready to receive and process messages!');
    if (!CONFIG.STAFF_GROUP_ID) {
        console.warn('WARNING: STAFF_GROUP_ID is not set in .env file.');
        console.warn('Add the bot to your staff group and type "!groupid" to find the ID.');
    } else {
        console.log(`Forwarding orders to group: ${CONFIG.STAFF_GROUP_ID}`);
    }

    // Schedule daily confirmation message at 10:00 AM
    scheduleDailyConfirmation();
});

// Function to schedule daily confirmation message
function scheduleDailyConfirmation() {
    // Check every minute if it's 10:00 AM
    setInterval(async () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Check if it's 10:00 AM
        if (currentHour === 10 && currentMinute === 0) {
            try {
                if (CONFIG.STAFF_GROUP_ID) {
                    const confirmationMessage = `✨ *SYSTEM STATUS: ONLINE* ✨\n\n` +
                        `🏥 *City Medicals Bot* is working properly!\n` +
                        `📅 *Date:* ${now.toLocaleDateString()}\n` +
                        `🕐 *Time:* ${now.toLocaleTimeString()}\n\n` +
                        `The WhatsApp ordering system is ready to receive prescriptions.`;

                    await client.sendMessage(CONFIG.STAFF_GROUP_ID, confirmationMessage);
                    console.log('Daily confirmation message sent to staff group at 10:00 AM');
                } else {
                    console.warn('Cannot send daily confirmation: STAFF_GROUP_ID is not configured.');
                }
            } catch (error) {
                console.error('Error sending daily confirmation message:', error);
            }
        }
    }, 60000); // Check every 60 seconds (1 minute)

    console.log('Daily confirmation scheduler started - will send message at 10:00 AM daily');
}

client.on('message', async (message) => {
    console.log('📨 Message received! Processing...');
    try {
        let chat;
        try {
            chat = await message.getChat();
        } catch (chatErr) {
            console.error('⚠️ Could not get chat object:', chatErr.message);
            // Fallback for private chats if getChat fails
            chat = { 
                isGroup: false, 
                id: { _serialized: message.from },
                sendMessage: (text, opts) => client.sendMessage(message.from, text, opts)
            };
        }

        let senderName = 'Unknown';
        let contactNumber = message.author || message.from;

        try {
            const contact = await message.getContact();
            senderName = contact.pushname || contact.number;
            contactNumber = contact.number;
        } catch (contactError) {
            console.log('Could not get contact info, using fallback:', contactError.message);
        }

        // Command to get Group ID
        if (message.body === '!groupid') {
            if (chat.isGroup) {
                await message.reply(`This group's ID is: *${chat.id._serialized}*`);
                console.log(`Group ID requested: ${chat.id._serialized}`);
            } else {
                await message.reply("The !groupid command only works inside groups.");
            }
            return;
        }

        // Ignore messages from the staff group itself
        if (chat.isGroup && chat.id._serialized === CONFIG.STAFF_GROUP_ID) {
            return;
        }

        // Process messages from private chats (customers)
        if (!chat.isGroup) {
            // Check authorization if restricted
            if (CONFIG.AUTHORIZED_CUSTOMERS.length > 0 &&
                !CONFIG.AUTHORIZED_CUSTOMERS.includes(contactNumber)) {
                await message.reply('Sorry, this bot is restricted to authorized customers only.');
                return;
            }

            // Initialize user state if it doesn't exist
            if (!userStates[contactNumber]) {
                userStates[contactNumber] = { step: 'AWAITING_NAME' };
                await message.reply("🌟 *HEALTHCARE AT YOUR FINGERTIPS* 🌟\n\nWelcome to *City Medicals*! 🏥\n\nWe provide a seamless way to order your medicines. To get started, please tell us your *Full Name*:\n\nനിങ്ങളുടെ *പൂർണ്ണമായ പേര്* ദയവായി രേഖപ്പെടുത്തുക:");

                // Handle Welcome Voice Message
                let voiceFilePath = path.join(__dirname, 'welcome.mp3');
                if (!fs.existsSync(voiceFilePath)) {
                    voiceFilePath = path.join(__dirname, 'welcome.wav');
                }

                if (fs.existsSync(voiceFilePath)) {
                    console.log(`🎙️ Attempting to send welcome voice message: ${voiceFilePath}`);
                    
                    // Small delay helps with file injection to prevent "t: t" error
                    setTimeout(async () => {
                        try {
                            const media = MessageMedia.fromFilePath(voiceFilePath);
                            await client.sendMessage(message.from, media, { 
                                sendAudioAsVoice: true,
                                mimetype: voiceFilePath.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav'
                            });
                            console.log('✅ Welcome voice message sent successfully');
                        } catch (err) {
                            console.error('❌ Error sending welcome voice message:', err);
                            // Fallback: Try sending as regular audio if voice fails
                            try {
                                console.log('🔄 Attempting fallback: sending as regular audio...');
                                const media = MessageMedia.fromFilePath(voiceFilePath);
                                await client.sendMessage(message.from, media);
                                console.log('✅ Sent as regular audio (fallback)');
                            } catch (fallbackErr) {
                                console.error('❌ Fallback also failed:', fallbackErr);
                            }
                        }
                    }, 1500); 
                } else {

                    console.log('ℹ️ No welcome voice message file found (welcome.wav or welcome.mp3)');
                }
                return;

            }

            // Handle the name inquiry step
            if (userStates[contactNumber].step === 'AWAITING_NAME') {
                const capturedName = message.body;
                const timestamp = new Date().toLocaleString();

                userStates[contactNumber].name = capturedName;
                userStates[contactNumber].step = 'AWAITING_ORDER';

                let replyText = `✨ *REGISTRATION SUCCESSFUL* ✨\n`;
                replyText += `━━━━━━━━━━━━━━━━━━━━\n`;
                replyText += `👤 *Customer:* ${capturedName}\n`;
                replyText += `📱 *Phone:* +${contactNumber}\n`;
                replyText += `⏰ *Time:* ${timestamp}\n`;
                replyText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                replyText += `Thank you for choosing us! 🙏\n\n`;
                replyText += `Please share your *Prescription Image* or type your *Order Details* below. Our pharmacists will review it immediately. 💊📝\n\n`;
                replyText += `നന്ദി! നിങ്ങളുടെ *പ്രിസ്ക്രിപ്ഷൻ ചിത്രം* അയക്കുകയോ അല്ലെങ്കിൽ *ഓർഡർ വിവരങ്ങൾ* താഴെ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യാം. 💊📝`;

                await message.reply(replyText);
                return;
            }

            // If we are here, we have the name and are receiving the order
            const capturedName = userStates[contactNumber].name || senderName;

            // Handle greetings from returning users
            const greetings = ['hi', 'hello', 'hey', 'halo', 'hy', 'hlo', 'hye', 'ഹായ്', 'ഹലോ', 'ഹായ്'];
            const userMsg = (message.body || '').toLowerCase().trim();
            
            // Check if the message starts with or is exactly a greeting
            const isGreeting = greetings.includes(userMsg) || greetings.some(g => userMsg === g);
            
            if (message.body && isGreeting) {
                // Find last order for this user to offer a repeat
                let lastOrderText = '';
                try {
                    const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
                    const userHistory = (data.orders || []).filter(o => o.contact === contactNumber);
                    if (userHistory.length > 0) {
                        const lastOrder = userHistory[userHistory.length - 1];
                        lastOrderText = `\n\n🕒 *Last Order:* _${lastOrder.notes || (lastOrder.image ? 'Prescription Image' : 'Medical Order')}_`;
                    }
                } catch (e) { console.error('History Lookup Error:', e); }

                let welcomeBack = `Welcome back, *${capturedName}*! 👋\n`;
                welcomeBack += `━━━━━━━━━━━━━━━━━━━━\n`;
                welcomeBack += `How can we help you today?${lastOrderText}\n\n`;
                welcomeBack += `✅ Share a *New Prescription Image*\n`;
                welcomeBack += `✅ Type your *Order Details* below\n`;
                welcomeBack += `━━━━━━━━━━━━━━━━━━━━\n`;
                welcomeBack += `നിങ്ങളുടെ *പ്രിസ്ക്രിപ്ഷൻ* അല്ലെങ്കിൽ *ഓർഡർ വിവരങ്ങൾ* അയക്കുക. 💊`;
                
                await message.reply(welcomeBack);
                return; // ‼️ STOP HERE - No order will be received
            }

            console.log(`Forwarding message from ${capturedName} (${contactNumber})`);

            // Prepare order notification
            const timestamp = new Date().toLocaleString();
            let notificationText = `🏥 *INCOMING MEDICAL ORDER* 🏥\n`;
            notificationText += `━━━━━━━━━━━━━━━━━━━━\n`;
            notificationText += `👤 *Patient:* ${capturedName}\n`;
            notificationText += `📞 *Contact:* https://wa.me/${contactNumber}\n`;
            notificationText += `🕙 *Received:* ${timestamp}\n`;
            notificationText += `────────────────────\n`;

            if (message.body) {
                notificationText += `📝 *Notes:* \n${message.body}\n`;
            } else {
                notificationText += `📝 *Notes:* _Media Attachment_\n`;
            }
            notificationText += `━━━━━━━━━━━━━━━━━━━━`;

            // Forward text notification
            if (CONFIG.STAFF_GROUP_ID) {
                await client.sendMessage(CONFIG.STAFF_GROUP_ID, notificationText);

                // Save to Database
                saveOrder({
                    name: capturedName,
                    contact: contactNumber,
                    notes: message.body,
                    hasMedia: message.hasMedia
                });

                // Forward media if present
                if (message.hasMedia) {
                    const media = await message.downloadMedia();
                    if (media) {
                        // Save image for dashboard visibility
                        const fileName = `order_${Date.now()}.${media.mimetype.split('/')[1]}`;
                        const filePath = path.join(__dirname, 'public', 'prescriptions', fileName);
                        fs.writeFileSync(filePath, media.data, 'base64');
                        
                        // Update the last order in JSON with the image path
                        try {
                            const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
                            const lastOrder = data.orders[data.orders.length - 1];
                            if (lastOrder && lastOrder.contact === contactNumber) {
                                lastOrder.image = `/prescriptions/${fileName}`;
                                fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
                            }
                        } catch (e) { console.error('DB Update Error:', e); }

                        await client.sendMessage(CONFIG.STAFF_GROUP_ID, media, {
                            caption: `Attachment from ${capturedName}`
                        });
                    }
                }

                // Confirm to customer
                await message.reply("✅ *ORDER RECEIVED*\n\nYour request has been successfully forwarded to our medical team. A staff member will verify the availability and get back to you with the bill shortly.\n\nThank you for your patience! 🙏✨");

                // Warning if no media is present
                if (!message.hasMedia) {
                    const warningText = `⚠️ *IMPORTANT REMINDER* ⚠️\n\nPlease ensure you have shared a clear *Prescription Image* if available. For most medications, a valid prescription is required for verification.\n\n` +
                                      `⚠️ *പ്രധാന അറിയിപ്പ്* ⚠️\n\nകൃത്യത ഉറപ്പാക്കുന്നതിനായി നിങ്ങളുടെ *പ്രിസ്ക്രിപ്ഷൻ ചിത്രം* കൂടി അയക്കുക. മരുന്നുകൾ നൽകുന്നതിന് സാധുവായ പ്രിസ്ക്രിപ്ഷൻ ആവശ്യമാണ്.`;
                    
                    // Small delay for better UX
                    setTimeout(async () => {
                        await client.sendMessage(message.from, warningText);
                    }, 2000);
                }
            } else {
                console.error('Cannot forward: STAFF_GROUP_ID is not configured.');
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out:', reason);
    console.error(`🚨 BOT DISCONNECTED: ${reason}`);
    console.error('Bot will attempt to reconnect automatically...');

    // Attempt to reconnect after 30 seconds
    setTimeout(() => {
        console.log('Attempting to reconnect...');
        client.initialize();
    }, 30000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// Advanced Authentication Middleware
const authMiddleware = (req, res, next) => {
    // 1. Check for Basic Auth header (sent by our JavaScript app.js)
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const isAuthorized = login === CONFIG.DASHBOARD_USER && password === CONFIG.DASHBOARD_PASS;

    if (isAuthorized) {
        return next();
    }

    // 2. If not authorized, send 401
    return res.status(401).json({ error: 'Unauthorized Access' });
};

// API for current state (used by dashboard to get QR)
app.get('/api/bot/state', (req, res) => {
    res.json({
        qr: qrCodeData,
        status: qrCodeData ? 'AWAITING_QR' : 'CONNECTED'
    });
});

// API for the dashboard (Protected)
app.get('/api/orders', authMiddleware, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read orders' });
    }
});

// API: Mark as complete (Protected)
app.post('/api/orders/:id/complete', authMiddleware, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const data = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        const order = data.orders.find(o => o.id === orderId);
        if (order) {
            order.status = 'COMPLETED';
            fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));

            // Send notification to patient
            try {
                const patientId = order.contact.includes('@c.us') ? order.contact : `${order.contact}@c.us`;
                const completionMessage = `✅ *ORDER COMPLETED*\n\n` +
                                         `Dear *${order.name || 'Customer'}*,\n` +
                                         `Your order (ID: ${orderId}) has been successfully processed and is now completed. 🏥✨\n\n` +
                                         `Thank you for choosing our Medical Service! 🙏\n\n` +
                                         `നിങ്ങളുടെ ഓർഡർ പൂർത്തിയായിരിക്കുന്നു. ഞങ്ങളുടെ സേവനം തിരഞ്ഞെടുത്തതിന് നന്ദി! 🙏`;
                
                await client.sendMessage(patientId, completionMessage);
                console.log(`✅ Completion notification sent to patient: ${patientId}`);
            } catch (waError) {
                console.error('❌ Failed to send completion message via WhatsApp:', waError.message);
            }

            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (err) {
        console.error('Error completing order:', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Health check endpoint
app.get('/health-check', (req, res) => {
    res.send('WhatsApp Bot is running! 🚀');
});

app.listen(port, () => {
    console.log(`Bot internal API running on port ${port}`);
});


console.log('Initializing WhatsApp bot...');
client.initialize();
