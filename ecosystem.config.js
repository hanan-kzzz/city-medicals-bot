module.exports = {
    apps: [{
        name: 'whatsapp-bot',
        script: 'bot.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true
    },
    {
        name: 'bot-monitor',
        script: 'monitor.js',
        instances: 1,
        autorestart: true,
        watch: false,
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/monitor-err.log',
        out_file: './logs/monitor-out.log',
        log_file: './logs/monitor-combined.log',
        time: true
    }]
};