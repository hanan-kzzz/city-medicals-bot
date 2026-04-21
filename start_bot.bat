@echo off
echo Starting WhatsApp Bot...
cd /d "C:\Users\hanan\OneDrive\ドキュメント\WhatsAppbots"
pm2 start ecosystem.config.js
echo Bot started successfully!
pause