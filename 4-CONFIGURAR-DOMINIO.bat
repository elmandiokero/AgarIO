@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Jaha.io - Configurar dominio propio

rem ------------------------------------------------------------------
rem  Jaha.io - Configura un dominio propio (ej. agario.alexlamasg.lat)
rem  con un tunel de Cloudflare. Hace el trabajo server\tools\dominio.js
rem  Opciones: --relogin (autorizar de nuevo), --desactivar (volver al
rem  link al azar de trycloudflare).
rem ------------------------------------------------------------------

if not exist "server\tools\dominio.js" goto sinarchivos
where node >nul 2>nul
if errorlevel 1 goto sinnode

node --disable-warning=ExperimentalWarning server\tools\dominio.js %*
echo.
pause
exit /b 0

:sinarchivos
echo.
echo  [X] No se encuentran los archivos del juego. Extrae el ZIP primero.
echo.
pause
exit /b 1

:sinnode
echo.
echo  [X] No se encontro Node.js. Primero hace doble clic en 1-INSTALAR.bat
echo.
pause
exit /b 1
