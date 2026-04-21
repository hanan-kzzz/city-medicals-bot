module.exports = {
    apps: [{
        name: 'dashboard-server',
        script: 'server.js',
        instances: 1,
        autorestart: true,
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        }
    },
    {
        name: 'whatsapp-bot',
        script: 'bot.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '450M',
        restart_delay: 10000,
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        time: true
    }]
};