@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Jaha.io - Abrir firewall

rem ------------------------------------------------------------------
rem  Jaha.io - Abre el puerto del juego en el firewall de Windows y
rem  revisa que la red WiFi este como "Privada".
rem  Hace el trabajo scripts\windows\firewall.ps1, que se abre solo
rem  como administrador en otra ventana (Windows pide permiso).
rem ------------------------------------------------------------------

if not exist "scripts\windows\firewall.ps1" goto sinarchivos

set "PSEXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PSEXE%" set "PSEXE=powershell"

"%PSEXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\firewall.ps1"
exit /b %errorlevel%

:sinarchivos
echo.
echo  [X] No se encuentran los archivos del juego.
echo      Si abriste esto desde adentro del ZIP, primero hace clic derecho
echo      sobre el ZIP, elegi "Extraer todo" y usa la carpeta extraida.
echo.
pause
exit /b 1
