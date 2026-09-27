# =====================================================================
#  Jaha.io - Abrir el firewall de Windows para jugar en la red WiFi/LAN
#  Lo ejecutan ABRIR-FIREWALL.bat y el instalador. Se auto-eleva a
#  administrador si hace falta.
#
#  Uso opcional:  firewall.ps1 -Port 3000
#
#  IMPORTANTE para quien edite este archivo:
#   - Debe quedar en ASCII puro (sin tildes ni enie), porque Windows
#     PowerShell 5.1 lee mal los archivos UTF-8 sin BOM.
#   - Debe ser compatible con Windows PowerShell 5.1: nada de '??',
#     '&&' / '||' entre comandos, ni operador ternario.
# =====================================================================

param(
    [int]$Port = 0
)

$ErrorActionPreference = 'Continue'

# Este script vive en scripts\windows, la raiz del repo esta dos niveles arriba.
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).ProviderPath

try { $Host.UI.RawUI.WindowTitle = 'Jaha.io - Firewall' } catch { }

# ---------------------------------------------------------------------
#  Funciones de ayuda
# ---------------------------------------------------------------------
function Write-Paso([string]$Texto) {
    Write-Host ''
    Write-Host ('>> ' + $Texto) -ForegroundColor Cyan
}
function Write-Ok([string]$Texto)    { Write-Host ('   [OK] ' + $Texto) -ForegroundColor Green }
function Write-Aviso([string]$Texto) { Write-Host ('   [!]  ' + $Texto) -ForegroundColor Yellow }
function Write-Falla([string]$Texto) { Write-Host ('   [X]  ' + $Texto) -ForegroundColor Red }
function Write-Info([string]$Texto)  { Write-Host ('        ' + $Texto) }

function Read-SiNo([string]$Pregunta, [bool]$PorDefecto) {
    if ($PorDefecto) { $sufijo = '(S/n)' } else { $sufijo = '(s/N)' }
    $respuesta = Read-Host ('   ' + $Pregunta + ' ' + $sufijo)
    if ($null -eq $respuesta) { return $PorDefecto }
    $respuesta = $respuesta.Trim().ToLower()
    if ($respuesta -eq '') { return $PorDefecto }
    if ($respuesta.StartsWith('s') -or $respuesta.StartsWith('y')) { return $true }
    return $false
}

function Wait-Cerrar {
    Write-Host ''
    Read-Host '   Presiona Enter para cerrar' | Out-Null
}

# ---------------------------------------------------------------------
#  Auto-elevacion: si no somos administrador, nos volvemos a abrir
#  como administrador (Windows muestra el cartel de permiso) y salimos.
# ---------------------------------------------------------------------
$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
$esAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $esAdmin) {
    Write-Host ''
    Write-Host '   Pidiendo permiso de administrador para abrir el firewall...'
    Write-Host '   Si Windows pregunta si permitis cambios, responde "Si".'
    $exePowershell = Join-Path $PSHOME 'powershell.exe'
    if (-not (Test-Path -LiteralPath $exePowershell)) { $exePowershell = 'powershell.exe' }
    $argumentos = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    if ($Port -gt 0) { $argumentos = $argumentos + ' -Port ' + $Port }
    try {
        Start-Process -FilePath $exePowershell -Verb RunAs -ArgumentList $argumentos -ErrorAction Stop
    } catch {
        Write-Host ''
        Write-Falla 'No se obtuvo el permiso de administrador.'
        Write-Info 'Volve a abrir ABRIR-FIREWALL.bat y responde "Si" cuando Windows pregunte.'
        Wait-Cerrar
        exit 1
    }
    exit 0
}

# ---------------------------------------------------------------------
#  Banner
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '  ======================================================' -ForegroundColor Magenta
Write-Host '             Jaha.io - Abrir el firewall' -ForegroundColor Magenta
Write-Host '  ======================================================' -ForegroundColor Magenta

# ---------------------------------------------------------------------
#  Puerto: -Port, o "port" de config.json, o 3000
# ---------------------------------------------------------------------
if ($Port -le 0) {
    $Port = 3000
    $archivoConfig = Join-Path $Root 'config.json'
    if (-not (Test-Path -LiteralPath $archivoConfig)) {
        $archivoConfig = Join-Path $Root 'config.example.json'
    }
    if (Test-Path -LiteralPath $archivoConfig) {
        try {
            $config = (Get-Content -LiteralPath $archivoConfig -Raw -Encoding UTF8) | ConvertFrom-Json
            if ($config -and $config.port) { $Port = [int]$config.port }
        } catch {
            Write-Aviso ('No se pudo leer ' + $archivoConfig + '. Se usa el puerto 3000.')
            $Port = 3000
        }
    }
}
if (($Port -lt 1) -or ($Port -gt 65535)) {
    Write-Aviso ('El puerto ' + $Port + ' no es valido. Se usa el puerto 3000.')
    $Port = 3000
}

# ---------------------------------------------------------------------
#  1) Regla de entrada para el puerto del juego
# ---------------------------------------------------------------------
Write-Paso ('Abriendo el puerto TCP ' + $Port + ' en el firewall de Windows...')
$nombreRegla = 'Jaha.io TCP ' + $Port
$regla = Get-NetFirewallRule -DisplayName $nombreRegla -ErrorAction SilentlyContinue
if ($regla) {
    try { $regla | Enable-NetFirewallRule -ErrorAction Stop } catch { }
    Write-Ok ('La regla "' + $nombreRegla + '" ya existia. Esta activada.')
} else {
    try {
        New-NetFirewallRule -DisplayName $nombreRegla -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private,Domain -ErrorAction Stop | Out-Null
        Write-Ok ('Regla creada: "' + $nombreRegla + '" (redes Privadas y de Dominio).')
    } catch {
        Write-Falla ('No se pudo crear la regla: ' + $_.Exception.Message)
        Write-Info 'Verifica que el servicio "Firewall de Windows Defender" este funcionando.'
    }
}

# ---------------------------------------------------------------------
#  2) Bloqueos viejos de Node.js (se crean si alguna vez se eligio
#     "Cancelar" en el cartel de Windows Defender). Un bloqueo le gana
#     a cualquier regla de permitir.
# ---------------------------------------------------------------------
Write-Paso 'Buscando bloqueos viejos de Node.js en el firewall...'
$bloqueos = @(Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue |
    Where-Object { ($_.DisplayName -match 'node') -and ([string]$_.Enabled -eq 'True') })
if ($bloqueos.Count -gt 0) {
    Write-Aviso ('Hay ' + $bloqueos.Count + ' regla(s) que BLOQUEAN a Node.js:')
    foreach ($bloqueo in $bloqueos) {
        Write-Info ('- ' + $bloqueo.DisplayName + '  (perfil: ' + [string]$bloqueo.Profile + ')')
    }
    Write-Info 'Seguramente se crearon cuando Windows pregunto y se eligio "Cancelar".'
    Write-Info 'Esas reglas impiden que otros equipos se conecten al juego.'
    if (Read-SiNo 'Queres borrarlas?' $true) {
        try {
            $bloqueos | Remove-NetFirewallRule -ErrorAction Stop
            Write-Ok 'Bloqueos borrados.'
        } catch {
            Write-Falla ('No se pudieron borrar: ' + $_.Exception.Message)
        }
    } else {
        Write-Info 'Ok, no se borraron.'
    }
} else {
    Write-Ok 'No hay bloqueos de Node.js.'
}

# ---------------------------------------------------------------------
#  3) Tipo de red: en redes "Publica" Windows bloquea el juego en LAN
# ---------------------------------------------------------------------
Write-Paso 'Revisando el tipo de red (Privada o Publica)...'
$perfiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
if ($perfiles.Count -eq 0) {
    Write-Aviso 'No se detecto ninguna red conectada. Conectate a tu WiFi y volve a abrir ABRIR-FIREWALL.bat.'
}
foreach ($perfil in $perfiles) {
    $categoria   = [string]$perfil.NetworkCategory
    $descripcion = '"' + [string]$perfil.Name + '" (' + [string]$perfil.InterfaceAlias + ')'
    if ($categoria -eq 'Public') {
        Write-Host ''
        Write-Aviso ('La red ' + $descripcion + ' esta marcada como "Publica".')
        Write-Info 'En las redes "Publica" Windows bloquea las conexiones de otros equipos,'
        Write-Info 'asi que tus amigos en la misma WiFi NO van a poder entrar al juego.'
        Write-Info 'Si es la red de tu casa (una red de confianza), conviene cambiarla a "Privada".'
        if (Read-SiNo ('Cambiar la red "' + [string]$perfil.Name + '" a Privada?') $true) {
            try {
                Set-NetConnectionProfile -InterfaceIndex $perfil.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
                Write-Ok ('La red ' + $descripcion + ' ahora es Privada.')
            } catch {
                Write-Falla ('No se pudo cambiar: ' + $_.Exception.Message)
                Write-Info 'Podes cambiarlo a mano: Configuracion > Red e Internet > Wi-Fi (o Ethernet)'
                Write-Info '> tu red > Tipo de perfil de red > Privada.'
            }
        } else {
            Write-Info 'Ok, no se cambio. En esa red solo van a poder jugar por Internet (2-INICIAR.bat).'
        }
    } elseif ($categoria -eq 'Private') {
        Write-Ok ('La red ' + $descripcion + ' es Privada.')
    } else {
        Write-Ok ('La red ' + $descripcion + ' es de Dominio.')
    }
}

# ---------------------------------------------------------------------
#  Recordatorios
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '  ------------------------------------------------------' -ForegroundColor Cyan
Write-Host '   IMPORTANTE: la primera vez que inicies el servidor, Windows' -ForegroundColor Cyan
Write-Host '   Defender puede preguntar si permitis "Node.js JavaScript Runtime".' -ForegroundColor Cyan
Write-Host '   Marca "Redes privadas" y hace clic en "Permitir acceso".' -ForegroundColor Cyan
Write-Host ''
Write-Host '   Si tenes un antivirus con firewall propio (Avast, ESET, Kaspersky...),' -ForegroundColor Cyan
Write-Host '   tambien tenes que permitir Node.js en ese antivirus.' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------------' -ForegroundColor Cyan

Wait-Cerrar
exit 0
