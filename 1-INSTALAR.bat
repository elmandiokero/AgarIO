@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Jaha.io - Instalador

rem ------------------------------------------------------------------
rem  Jaha.io - Paso 1: instala todo lo necesario (Node.js, piezas del
rem  juego, cloudflared) y ofrece abrir el firewall.
rem  Hace el trabajo scripts\windows\instalar.ps1
rem ------------------------------------------------------------------

if not exist "scripts\windows\instalar.ps1" goto sinarchivos

set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PSEXE%" set "PSEXE=powershell"

"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\instalar.ps1"
if errorlevel 1 goto fallo

echo.
pause
exit /b 0

:fallo
echo.
echo  La instalacion no termino bien. Lee los mensajes de arriba,
echo  corregi lo que dice y volve a abrir 1-INSTALAR.bat.
echo.
pause
exit /b 1

:sinarchivos
echo.
echo  [X] No se encuentran los archivos del juego.
echo      Si abriste esto desde adentro del ZIP, primero hace clic derecho
echo      sobre el ZIP, elegi "Extraer todo" y abri 1-INSTALAR.bat desde
echo      la carpeta extraida.
echo.
pause
exit /b 1
