@echo off
title Medical Shop Public Tunnel
echo ---------------------------------------------------
echo    WHTASAPP BOT PUBLIC ACCESS SETUP
echo ---------------------------------------------------
echo.
echo 1. Starting Dashboard and Bot...
pm2 start ecosystem.config.js
echo.
echo 2. Getting your Public IP (You might need this for the first visit)...
curl ifconfig.me
echo.
echo.
echo 3. Launching Tunnel for: medical-shop.loca.lt
echo Please wait...
lt --port 3000 --subdomain medical-shop
pause
