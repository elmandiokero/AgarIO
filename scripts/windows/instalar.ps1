# =====================================================================
#  Jaha.io - Instalador para Windows 11
#  Lo ejecuta 1-INSTALAR.bat (doble clic). No hace falta abrirlo a mano.
#
#  IMPORTANTE para quien edite este archivo:
#   - Debe quedar en ASCII puro (sin tildes ni enie), porque Windows
#     PowerShell 5.1 lee mal los archivos UTF-8 sin BOM.
#   - Debe ser compatible con Windows PowerShell 5.1: nada de '??',
#     '&&' / '||' entre comandos, ni operador ternario.
# =====================================================================

$ErrorActionPreference = 'Continue'

$NodeMinimo     = [version]'22.13.0'
$CloudflaredUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
$StoreUrl       = 'ms-windows-store://pdp/?productid=9NBLGGH4NNS1'

# Este script vive en scripts\windows, la raiz del repo esta dos niveles arriba.
$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).ProviderPath
Set-Location -LiteralPath $Root

try { $Host.UI.RawUI.WindowTitle = 'Jaha.io - Instalador' } catch { }

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

# Recarga el PATH desde el registro (Maquina + Usuario), para ver
# programas recien instalados sin cerrar la ventana.
function Update-RutaSesion {
    $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = [string]$maquina + ';' + [string]$usuario
    # Por las dudas: si Node quedo instalado pero el PATH todavia no lo tiene.
    if ($env:ProgramFiles) {
        $dirNode = Join-Path $env:ProgramFiles 'nodejs'
        $hayNode = Get-Command node -ErrorAction SilentlyContinue
        if ((-not $hayNode) -and (Test-Path -LiteralPath (Join-Path $dirNode 'node.exe'))) {
            $env:Path = $dirNode + ';' + $env:Path
        }
    }
}

# Devuelve la version de Node.js instalada como [version], o $null.
function Get-VersionNode {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $null }
    try {
        $salida = & node -v 2>$null
        if ($null -eq $salida) { return $null }
        $texto = ([string]($salida | Select-Object -First 1)).Trim()
        if ($texto -match '^v?(\d+)\.(\d+)\.(\d+)') {
            return [version]($Matches[1] + '.' + $Matches[2] + '.' + $Matches[3])
        }
    } catch { }
    return $null
}

# Busca cloudflared en los mismos lugares que el servidor.
function Find-Cloudflared {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Path }
    $lugares = @()
    $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    if ($pf86) { $lugares += (Join-Path $pf86 'cloudflared\cloudflared.exe') }
    if ($env:ProgramFiles) { $lugares += (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe') }
    $lugares += (Join-Path $Root 'tools\cloudflared.exe')
    foreach ($lugar in $lugares) {
        if (Test-Path -LiteralPath $lugar) { return $lugar }
    }
    return $null
}

# Descarga cloudflared.exe directo de GitHub a tools\cloudflared.exe.
# (Se descarga primero a la carpeta TEMP y se copia con .NET, porque en
# PowerShell 5.1 -OutFile falla si la ruta tiene corchetes [ ].)
function Save-CloudflaredDirecto {
    $carpeta  = Join-Path $Root 'tools'
    $destino  = Join-Path $carpeta 'cloudflared.exe'
    $temporal = Join-Path ([System.IO.Path]::GetTempPath()) 'jaha-cloudflared.exe.descarga'
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        [System.IO.Directory]::CreateDirectory($carpeta) | Out-Null
        if (Test-Path -LiteralPath $temporal) { Remove-Item -LiteralPath $temporal -Force }
        Invoke-WebRequest -Uri $CloudflaredUrl -OutFile $temporal -UseBasicParsing -ErrorAction Stop
        $tamano = (Get-Item -LiteralPath $temporal).Length
        if ($tamano -lt 1000000) {
            throw ('el archivo descargado es muy chico (' + $tamano + ' bytes)')
        }
        [System.IO.File]::Copy($temporal, $destino, $true)
        Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
        try { Unblock-File -LiteralPath $destino } catch { }
        return $true
    } catch {
        Write-Falla ('No se pudo descargar cloudflared: ' + $_.Exception.Message)
        if (Test-Path -LiteralPath $temporal) {
            Remove-Item -LiteralPath $temporal -Force -ErrorAction SilentlyContinue
        }
        return $false
    }
}

function Show-FaltaWinget {
    Write-Falla 'No se encontro "winget" (el instalador de programas de Windows).'
    Write-Info 'Instala o actualiza la aplicacion "Instalador de aplicacion"'
    Write-Info '(en ingles "App Installer") desde la Microsoft Store:'
    Write-Info ('    ' + $StoreUrl)
    Write-Info 'Cuando termine, cerra esta ventana y volve a abrir 1-INSTALAR.bat.'
    Write-Host ''
    Read-Host '   Presiona Enter para abrir la Microsoft Store' | Out-Null
    try {
        Start-Process $StoreUrl
    } catch {
        Write-Aviso 'No se pudo abrir la Store. Abrila a mano y busca "Instalador de aplicacion".'
    }
}

# ---------------------------------------------------------------------
#  Banner
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '  ======================================================' -ForegroundColor Magenta
Write-Host '                 Jaha.io - Instalador' -ForegroundColor Magenta
Write-Host "      Mba'eichapa! Vamos a preparar tu PC para jugar." -ForegroundColor Magenta
Write-Host '  ======================================================' -ForegroundColor Magenta
Write-Info ('Carpeta del juego: ' + $Root)

if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json'))) {
    Write-Host ''
    Write-Falla 'No se encuentran los archivos del juego (falta package.json).'
    Write-Info 'Si descargaste el ZIP, primero hace clic derecho sobre el ZIP,'
    Write-Info 'elegi "Extraer todo" y abri 1-INSTALAR.bat desde la carpeta extraida.'
    exit 1
}

# ---------------------------------------------------------------------
#  Paso 1: winget
# ---------------------------------------------------------------------
Write-Paso 'Paso 1 de 6: Verificando winget (instalador de programas de Windows)...'
$HayWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
if ($HayWinget) {
    Write-Ok 'winget esta disponible.'
} else {
    $versionPrevia = Get-VersionNode
    if ($versionPrevia -and ($versionPrevia -ge $NodeMinimo)) {
        # Node ya esta bien instalado: se puede seguir sin winget.
        Write-Aviso 'No se encontro winget, pero Node.js ya esta instalado. Seguimos igual.'
    } else {
        Show-FaltaWinget
        exit 1
    }
}

# ---------------------------------------------------------------------
#  Paso 2: Node.js
# ---------------------------------------------------------------------
Write-Paso 'Paso 2 de 6: Verificando Node.js...'
$versionNode = Get-VersionNode
if ($versionNode -and ($versionNode -ge $NodeMinimo)) {
    Write-Ok ('Node.js ' + $versionNode + ' ya esta instalado.')
} else {
    if ($versionNode) {
        Write-Aviso ('Tenes Node.js ' + $versionNode + ', pero el juego necesita 22.13 o mas nuevo. Lo vamos a actualizar.')
    } else {
        Write-Info 'Node.js no esta instalado. Lo vamos a instalar (version LTS).'
    }
    Write-Info 'Si Windows pregunta si permitis que la aplicacion haga cambios, responde "Si".'
    Write-Host ''
    & winget install -e --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements
    $codigoWinget = $LASTEXITCODE
    Update-RutaSesion
    $versionNode = Get-VersionNode
    if (-not $versionNode) {
        Write-Host ''
        Write-Falla 'Node.js todavia no aparece en esta ventana.'
        if ($codigoWinget -ne 0) { Write-Info ('(winget termino con el codigo ' + $codigoWinget + ')') }
        Write-Info 'Cerra esta ventana y volve a abrir 1-INSTALAR.bat.'
        Write-Info 'Si sigue igual, reinicia la PC y proba de nuevo.'
        exit 1
    }
    if ($versionNode -lt $NodeMinimo) {
        Write-Host ''
        Write-Falla ('Se encontro Node.js ' + $versionNode + ', pero hace falta 22.13 o mas nuevo.')
        Write-Info 'Cerra esta ventana, reinicia la PC y volve a abrir 1-INSTALAR.bat.'
        Write-Info 'Si sigue igual, desinstala el Node.js viejo desde'
        Write-Info '"Configuracion > Aplicaciones > Aplicaciones instaladas" y proba de nuevo.'
        exit 1
    }
    Write-Ok ('Node.js ' + $versionNode + ' instalado.')
}

# ---------------------------------------------------------------------
#  Paso 3: dependencias (npm install)
# ---------------------------------------------------------------------
Write-Paso 'Paso 3 de 6: Instalando las piezas del juego (npm install)...'
Write-Info 'Esto puede tardar uno o dos minutos. Paciencia...'
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Falla 'No se encontro npm (viene junto con Node.js).'
    Write-Info 'Cerra esta ventana, reinicia la PC y volve a abrir 1-INSTALAR.bat.'
    exit 1
}
& npm.cmd install --omit=dev --no-audit --no-fund
$codigoNpm = $LASTEXITCODE
if ($codigoNpm -ne 0) {
    Write-Host ''
    Write-Falla ('npm install fallo (codigo ' + $codigoNpm + ').')
    Write-Info 'Revisa tu conexion a Internet y volve a abrir 1-INSTALAR.bat.'
    Write-Info 'Si la carpeta del juego esta dentro de OneDrive, movela a otra'
    Write-Info '(por ejemplo C:\Jaha.io) y proba de nuevo.'
    exit 1
}
Write-Ok 'Piezas del juego instaladas.'

# ---------------------------------------------------------------------
#  Paso 4: cloudflared (tunel para jugar por Internet)
# ---------------------------------------------------------------------
Write-Paso 'Paso 4 de 6: Verificando cloudflared (para jugar por Internet)...'
$rutaCloudflared = Find-Cloudflared
if ($rutaCloudflared) {
    Write-Ok ('cloudflared ya esta instalado: ' + $rutaCloudflared)
} else {
    if ($HayWinget) {
        Write-Info 'Instalando cloudflared con winget...'
        Write-Host ''
        & winget install -e --id Cloudflare.cloudflared --source winget --accept-source-agreements --accept-package-agreements
        $codigoWinget = $LASTEXITCODE
        Update-RutaSesion
        $rutaCloudflared = Find-Cloudflared
        if ((-not $rutaCloudflared) -and ($codigoWinget -ne 0)) {
            Write-Aviso ('winget no pudo instalar cloudflared (codigo ' + $codigoWinget + ').')
        }
    }
    if (-not $rutaCloudflared) {
        Write-Info 'Descargando cloudflared directamente desde GitHub...'
        if (Save-CloudflaredDirecto) { $rutaCloudflared = Find-Cloudflared }
    }
    if ($rutaCloudflared) {
        Write-Ok ('cloudflared instalado: ' + $rutaCloudflared)
    } else {
        Write-Aviso 'No se pudo instalar cloudflared.'
        Write-Info 'El juego igual funciona en tu red WiFi (3-INICIAR-SOLO-WIFI.bat),'
        Write-Info 'pero NO se va a poder jugar por Internet hasta instalar cloudflared.'
        Write-Info 'Podes volver a abrir 1-INSTALAR.bat mas tarde para intentarlo de nuevo.'
    }
}

# Un config.yml viejo de cloudflared hace fallar el tunel rapido del juego.
if ($env:USERPROFILE) {
    $dirConfigCf = Join-Path $env:USERPROFILE '.cloudflared'
    foreach ($nombreCf in @('config.yml', 'config.yaml')) {
        $archivoCf = Join-Path $dirConfigCf $nombreCf
        if (Test-Path -LiteralPath $archivoCf) {
            Write-Host ''
            Write-Aviso ('Se encontro el archivo ' + $archivoCf)
            Write-Info 'Es de un tunel de Cloudflare configurado antes y hace que el tunel'
            Write-Info 'del juego falle (no aparece el link para jugar por Internet).'
            Write-Info ('Solucion: renombrarlo, por ejemplo a ' + $nombreCf + '.bak')
            if (Read-SiNo 'Queres que lo renombre ahora?' $false) {
                $nuevoNombre = $nombreCf + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
                try {
                    Rename-Item -LiteralPath $archivoCf -NewName $nuevoNombre -ErrorAction Stop
                    Write-Ok ('Renombrado a ' + $nuevoNombre)
                } catch {
                    Write-Falla ('No se pudo renombrar: ' + $_.Exception.Message)
                }
            } else {
                Write-Info 'Ok, no se toco. Si el link de Internet no aparece, renombralo a mano.'
            }
        }
    }
}

# ---------------------------------------------------------------------
#  Paso 5: config.json
# ---------------------------------------------------------------------
Write-Paso 'Paso 5 de 6: Preparando la configuracion (config.json)...'
$archivoConfig  = Join-Path $Root 'config.json'
$archivoEjemplo = Join-Path $Root 'config.example.json'
if (Test-Path -LiteralPath $archivoConfig) {
    Write-Ok 'config.json ya existe (no se toca).'
} elseif (Test-Path -LiteralPath $archivoEjemplo) {
    try {
        [System.IO.File]::Copy($archivoEjemplo, $archivoConfig, $false)
        Write-Ok 'config.json creado a partir de config.example.json.'
    } catch {
        Write-Aviso ('No se pudo crear config.json: ' + $_.Exception.Message)
        Write-Info 'No pasa nada: el servidor lo crea solo la primera vez que arranca.'
    }
} else {
    Write-Aviso 'No se encontro config.example.json. El servidor va a crear la configuracion al arrancar.'
}

# ---------------------------------------------------------------------
#  Paso 6: firewall de Windows
# ---------------------------------------------------------------------
Write-Paso 'Paso 6 de 6: Firewall de Windows'
Write-Info 'Para que tus amigos en la misma red WiFi puedan entrar al juego,'
Write-Info 'hay que abrir el puerto del juego en el firewall de Windows.'
Write-Info 'Windows te va a pedir permiso de administrador.'
$scriptFirewall = Join-Path $PSScriptRoot 'firewall.ps1'
if (Read-SiNo 'Queres abrir el firewall ahora?' $true) {
    $exePowershell = Join-Path $PSHOME 'powershell.exe'
    if (-not (Test-Path -LiteralPath $exePowershell)) { $exePowershell = 'powershell.exe' }
    $argumentos = '-NoProfile -ExecutionPolicy Bypass -File "' + $scriptFirewall + '"'
    try {
        Start-Process -FilePath $exePowershell -Verb RunAs -Wait -ArgumentList $argumentos -ErrorAction Stop
        Write-Ok 'Firewall revisado (mira los mensajes que aparecieron en la otra ventana).'
    } catch {
        Write-Aviso 'No se pudo abrir el firewall (quizas se respondio "No" al permiso de administrador).'
        Write-Info 'Podes hacerlo despues con doble clic en ABRIR-FIREWALL.bat.'
    }
} else {
    Write-Info 'Ok. Podes hacerlo despues con doble clic en ABRIR-FIREWALL.bat.'
}

# ---------------------------------------------------------------------
#  Fin
# ---------------------------------------------------------------------
Write-Host ''
Write-Host '  ======================================================' -ForegroundColor Green
Write-Host '    Listo! Jaha! La instalacion termino.' -ForegroundColor Green
Write-Host ''
if ($rutaCloudflared) {
    Write-Host '    Ahora abri 2-INICIAR.bat para jugar con amigos por Internet'
    Write-Host '    (aparece un link y un codigo QR para compartir).'
    Write-Host ''
    Write-Host '    Si todos estan en la misma red WiFi, tambien podes usar'
    Write-Host '    3-INICIAR-SOLO-WIFI.bat.'
} else {
    Write-Host '    Ahora abri 3-INICIAR-SOLO-WIFI.bat para jugar en tu red WiFi.'
    Write-Host '    (Para jugar por Internet hace falta cloudflared: volve a'
    Write-Host '    abrir 1-INSTALAR.bat mas tarde.)'
}
Write-Host ''
Write-Host '    Consejo: mientras juegan, que la PC no se suspenda.'
Write-Host '    Aguyje!'
Write-Host '  ======================================================' -ForegroundColor Green
exit 0
