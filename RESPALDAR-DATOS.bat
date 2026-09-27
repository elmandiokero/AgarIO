@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Jaha.io - Respaldar datos

rem ------------------------------------------------------------------
rem  Jaha.io - Crea una copia de seguridad de la base de datos
rem  (cuentas, monedas, skins, logros) en data\backups\
rem ------------------------------------------------------------------

if not exist "package.json" goto sinarchivos

where node >nul 2>nul
if errorlevel 1 goto sinnode

echo.
echo  Creando una copia de seguridad de los datos del juego...
echo.
call npm run backup
if errorlevel 1 goto fallo

echo.
echo  [OK] Respaldo creado en la carpeta data\backups
echo       (dentro de la carpeta del juego).
echo       Consejo: de vez en cuando copia esa carpeta a un pendrive o a la nube.
echo.
if exist "data\backups\" start "" "data\backups"
pause
exit /b 0

:fallo
echo.
echo  [X] No se pudo crear el respaldo. Lee el mensaje de arriba.
echo.
pause
exit /b 1

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
echo      Primero hace doble clic en 1-INSTALAR.bat.
echo.
pause
exit /b 1
