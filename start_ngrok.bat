@echo off
title Medical Shop Ngrok Tunnel
cls
echo ---------------------------------------------------
echo    WHTASAPP BOT NGROK PUBLIC ACCESS
echo ---------------------------------------------------
echo.
echo 1. Cleaning up previous connections...
taskkill /f /im ngrok.exe >nul 2>&1
echo.
echo 2. Authenticating Ngrok...
call ngrok config add-authtoken 3CeWzz58mp9bBefeMQKubCHnS5K_5G2D6oFchg9nkTnpBrCN1
echo.
echo 3. Starting Dashboard and Bot...
call pm2 start ecosystem.config.js
echo.
echo 4. Launching Secure Ngrok Tunnel...
echo.
echo ---------------------------------------------------
echo YOUR PUBLIC URL WILL APPEAR BELOW:
echo ---------------------------------------------------
echo.
ngrok http 3000 --domain=buddhism-implode-comrade.ngrok-free.dev
pause
