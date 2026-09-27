@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Jaha.io - Solo WiFi/LAN

rem ------------------------------------------------------------------
rem  Jaha.io - Inicia el servidor SOLO para la red local (WiFi/LAN),
rem  sin tunel de Internet. Si el servidor se cae, se reinicia solo.
rem  Para apagarlo, cerrar esta ventana.
rem  Codigos de salida del servidor: 0 = cierre normal,
rem  78 = error de configuracion o puerto ocupado (no se reintenta).
rem ------------------------------------------------------------------

if not exist "server\index.js" goto sinarchivos

where node >nul 2>nul
if errorlevel 1 goto sinnode

node -e "var v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=13)?0:1)" >nul 2>nul
if errorlevel 1 goto nodeviejo

if exist "node_modules\" goto listo
echo.
echo  Instalando las piezas del juego por primera vez...
echo.
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto fallonpm

:listo
echo.
echo  ==============================================================
echo    Jaha.io - Mba'eichapa! Iniciando el servidor (solo WiFi/LAN)...
echo    Solo van a poder entrar los que esten conectados a tu misma
echo    red WiFi. Para jugar por Internet usa 2-INICIAR.bat.
echo.
echo    Para APAGAR el servidor, cerra esta ventana.
echo  ==============================================================
echo.

:loop
node --disable-warning=ExperimentalWarning server\index.js --no-tunnel
set "CODIGO=%errorlevel%"
if "%CODIGO%"=="0" goto fin
if "%CODIGO%"=="-1073741510" goto fin
if "%CODIGO%"=="78" goto errorconfig
echo.
echo  El servidor se cerro inesperadamente. Reiniciando en 3 segundos...
echo  (codigo de salida: %CODIGO%. Para apagarlo del todo, cerra esta ventana.)
echo.
timeout /t 3 /nobreak >nul
goto loop

:fin
echo.
echo  Servidor apagado. Aguyje! Hasta la proxima.
echo.
pause
exit /b 0

:errorconfig
echo.
echo  [X] El servidor no pudo arrancar. Lee el mensaje de arriba.
echo      Puede ser un error en config.json o que el puerto ya esta en uso.
echo      Fijate si el juego ya esta abierto en otra ventana.
echo.
pause
exit /b 78

:sinarchivos
echo.
echo  [X] No se encuentran los archivos del juego.
echo      Si abriste esto desde adentro del ZIP, primero hace clic derecho
echo      sobre el ZIP, elegi "Extraer todo" y usa la carpeta extraida.
echo.
pause
exit /b 1

:sinnode
echo.
echo  [X] No se encontro Node.js en esta PC.
echo      Primero hace doble clic en 1-INSTALAR.bat y despues volve a
echo      abrir este archivo.
echo.
pause
exit /b 1

:nodeviejo
echo.
echo  [X] Tu version de Node.js es muy vieja: el juego necesita 22.13 o mas nueva.
echo      Hace doble clic en 1-INSTALAR.bat para actualizarla.
echo.
pause
exit /b 1

:fallonpm
echo.
echo  [X] No se pudieron instalar las piezas del juego.
echo      Revisa tu conexion a Internet y volve a abrir 1-INSTALAR.bat.
echo.
pause
exit /b 1
