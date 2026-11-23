@echo off
title Physics Project Book — 3D Lab Server
cd /d "%~dp0"
echo.
echo  =========================================================
echo    PHYSICS PROJECT BOOK - Interactive 3D Lab Server
echo  =========================================================
echo.
echo    PC Browser:     http://localhost:5173/
node -e "const os=require('os');const n=os.networkInterfaces();for(const[k,v]of Object.entries(n)){for(const a of v||[]){if(a.family==='IPv4'&&!a.internal&&!a.address.startsWith('169.254.')){console.log('    Phone ('+k+'): http://'+a.address+':5173/')}}}"
echo.
echo    Make sure your phone is on the same Wi-Fi network.
echo    Press Ctrl+C to stop the server.
echo  =========================================================
echo.
npm run start
pause
