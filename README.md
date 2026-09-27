# 🇵🇾 Jaha.io — agar.io con sabor paraguayo

¡Mba'éichapa! **Jaha.io** es un juego multijugador tipo agar.io: sos una célula en un mapa lleno de **chipitas** 🥯, comés para crecer y te comés a los más chicos… ¡cuidado con los más grandes y con los **cactus** 🌵!

Corre en **tu PC con Windows 11** como servidor, y tus amigos juegan desde el **navegador de la PC o del celular**, en la misma WiFi o **por Internet** (sin configurar el router).

## ✨ Qué trae

| | |
|---|---|
| 🎮 **Modos** | **Clásico** (todos contra todos, sin fin) y **Batalla real** (rondas con zona que se achica; gana el último). |
| 🤖 **Bots** | Siempre hay bots jugando junto a las personas, con nombres paraguayos y 3 personalidades (tranqui, normal, capo). |
| 👤 **Cuentas** | Registro con usuario y contraseña. También se puede jugar como invitado. |
| 📊 **Estadísticas** | Partidas, masa máxima, jugadores comidos, tiempo jugado, victorias… e historial de partidas. |
| 🏆 **Ranking** | Ranking global por XP, masa máxima, kills, victorias en Batalla real, tiempo y chipitas. |
| ₲ **Guaraníes** | Moneda del juego (no es plata real): se gana jugando y se gasta en la tienda. |
| 🎨 **31 skins** | Bandera, chipa, tereré, mburucuyá, jaguareté, ñandutí, Itaipú… y mitología guaraní (Pombero, Kurupí, Luisõ, Teju Jagua…). Se compran con ₲, se desbloquean por nivel o con logros. |
| 🏅 **20 logros** | "Mbarete", "Karai Guasu", "Chipero guasu", "Tuna poty", "Venganza"… cada uno da ₲. |
| ⚙️ **Ajustes** | Temas (noche, día, tierra colorada), calidad, nombres, masa, minimapa, sonido, vibración, joystick izquierdo/derecho… |
| 📱 **Celular** | Joystick táctil, botones grandes, se puede "Agregar a inicio" como una app. |
| 💬 **Chat** | Con filtro de malas palabras y límite anti-spam. Los bots a veces te hablan en jopara. |

---

## 🚀 Instalación en Windows 11 (una sola vez)

1. **Descargá el proyecto**: en GitHub, botón verde **Code → Download ZIP**, y **extraé** el ZIP (clic derecho → *Extraer todo…*) en una carpeta, por ejemplo `Documentos\JahaIO`.
   > ⚠️ No lo ejecutes desde adentro del ZIP sin extraer.
2. Abrí la carpeta y hacé **doble clic en `1-INSTALAR.bat`**. Esto:
   - instala **Node.js** (el motor del servidor) si no lo tenés,
   - instala las dependencias del juego,
   - instala **cloudflared** (para jugar por Internet),
   - crea el archivo `config.json`,
   - y te ofrece **abrir el firewall** de Windows (decí que **sí**).
3. Si Windows muestra *"Windows protegió tu PC"* (SmartScreen): clic en **Más información → Ejecutar de todas formas**.
4. Si te pide cerrar y volver a abrir la ventana después de instalar Node.js, hacelo y volvé a ejecutar `1-INSTALAR.bat`.

## ▶️ Iniciar el servidor

| Archivo | Para qué |
|---|---|
| **`2-INICIAR.bat`** | Servidor + **link de Internet** (recomendado). |
| `3-INICIAR-SOLO-WIFI.bat` | Sólo para los que están en tu misma red WiFi. |
| `4-CONFIGURAR-DOMINIO.bat` | Usa tu dominio fijo **https://agario.alexlamasg.lat** en vez del link al azar (una sola vez). |
| `ABRIR-FIREWALL.bat` | Abre el puerto en el firewall (si tus amigos de la WiFi no pueden entrar). |
| `RESPALDAR-DATOS.bat` | Hace una copia de seguridad de las cuentas y estadísticas. |

Al iniciar vas a ver algo así:

```
  ████████████  Jaha.io v1.0.0  —  ¡Mba'éichapa! ¡Jaha!

  ➜ En esta PC:        http://localhost:3000
  ➜ En tu WiFi / red:  http://192.168.1.50:3000
  (código QR para escanear con el celular)

  🌎 Link para jugar por Internet (compartilo con tus amigos):
     https://algo-algo-algo.trycloudflare.com
  (otro código QR)
```

- **Vos** jugás desde la misma PC abriendo `http://localhost:3000`.
- **En tu casa (misma WiFi)**: que escaneen el **QR** o abran la dirección `http://192.168.…:3000`.
- **Por Internet (datos móviles, otra casa)**: compartí el link `https://….trycloudflare.com`.
- En el menú del juego está el botón **📲 Invitar** con los links y QR.

> 🔁 El link de Internet **cambia cada vez que reiniciás** el servidor. Mientras la ventana negra esté abierta, el juego funciona. **Cerrá la ventana (o Ctrl+C) para apagarlo** — las partidas en curso se guardan.

> 💤 Mientras hospedás, configurá Windows para que **la PC no se suspenda** (Configuración → Sistema → Inicio/apagado y suspensión).

## 🌐 Tu dominio propio: https://agario.alexlamasg.lat

En vez de un link al azar que cambia cada vez, el juego puede estar siempre en **https://agario.alexlamasg.lat**. Se usa un *túnel con nombre* de Cloudflare (gratis): no hay que abrir puertos del router y funciona aunque tu proveedor de Internet use CGNAT.

**Requisito:** el dominio `alexlamasg.lat` tiene que estar en tu cuenta de Cloudflare (ya lo está: sus DNS responden desde Cloudflare) y tenés que haber corrido `1-INSTALAR.bat`.

**Configuración (una sola vez, en la PC del juego):**

1. Doble clic en **`4-CONFIGURAR-DOMINIO.bat`**.
2. Te pregunta la dirección: apretá **Enter** para usar `agario.alexlamasg.lat`.
3. Te pregunta si tenés un token: apretá **Enter** (opción automática).
4. Se abre el navegador: **iniciá sesión en Cloudflare**, elegí **alexlamasg.lat** y tocá **Authorize**. Volvé a la ventana negra: sigue sola.
5. El script crea el túnel `jaha-io`, el registro DNS `agario` y guarda todo en `config.json`.
6. Abrí **`2-INICIAR.bat`**. Vas a ver:
   ```
   🌎 Link para jugar por Internet (compartilo con tus amigos):
      https://agario.alexlamasg.lat
      (link fijo: es siempre el mismo)
   ```

> ℹ️ El link funciona **mientras la PC y el servidor estén prendidos**. Si está apagado, Cloudflare muestra el error *1033* o *530*.
>
> 🔒 La credencial del túnel queda en `C:\Users\TU_USUARIO\.cloudflared\`: no compartas esa carpeta.
>
> ↩️ Para volver al link al azar: abrí una terminal en la carpeta del juego y ejecutá `4-CONFIGURAR-DOMINIO.bat --desactivar`.

<details>
<summary><b>Opción B: con un token del panel de Cloudflare</b></summary>

1. En [dash.cloudflare.com](https://dash.cloudflare.com) → **Zero Trust → Networks → Tunnels → Create a tunnel** → *Cloudflared* → nombre `jaha-io`.
2. Copiá el comando que muestra (`cloudflared.exe service install eyJ…`). **No hace falta ejecutarlo.**
3. En **Public Hostname**: Subdomain `agario`, Domain `alexlamasg.lat`, Service **HTTP** → `localhost:3000`. Guardá.
4. En la PC, doble clic en `4-CONFIGURAR-DOMINIO.bat`, Enter para el dominio y **pegá el token** (o el comando entero) cuando lo pida.
5. Abrí `2-INICIAR.bat`.
</details>

### 📱 Instalar en el celular como app
Abrí el link en el celular:
- **Android (Chrome)**: menú ⋮ → **Agregar a la pantalla principal** / **Instalar app**.
- **iPhone (Safari)**: botón compartir → **Agregar a inicio**.

(Con el link `https://` de Internet queda como app de pantalla completa.)

---

## 🎮 Cómo se juega

| En la PC | En el celular | Acción |
|---|---|---|
| Mouse | Joystick (mitad izquierda) | Moverse |
| **Espacio** | Botón rojo **Dividir** | Dividirte para atacar |
| **W** (mantener) | Botón azul **Expulsar** | Expulsar masa |
| **Enter** | 💬 | Chat |
| **Esc** | ☰ | Pausa / volver al menú |

- Para comerte a alguien tenés que ser **25 % más grande** y taparlo bastante.
- Los **cactus** 🌵 explotan a las células grandes en muchos pedacitos; los chicos se esconden debajo. Tirale masa 7 veces a un cactus y dispara uno nuevo.
- Mientras más grande, más lento. Tus células divididas se vuelven a juntar después de unos segundos.
- Al aparecer tenés **3 segundos de escudo** 🛡️.
- **Batalla real**: la zona segura se achica por fases. Afuera (zona roja) perdés masa cada segundo. El círculo blanco punteado es la próxima zona. ¡El último que queda gana!

### Premios
- Cada vida (o ronda) da **XP** y **₲** según tu masa máxima, kills, tiempo vivo y puesto.
- Subir de nivel da ₲ extra y desbloquea skins de **mitología guaraní**.
- Los invitados ven cuánto *hubieran* ganado: ¡creá una cuenta para guardarlo!

---

## 🔧 Configuración (`config.json`)

Se crea solo la primera vez (copia de `config.example.json`). Cambiás un valor, guardás y **reiniciás el servidor**.

| Opción | Qué hace | Por defecto |
|---|---|---|
| `title` | Nombre del juego | `Jaha.io` |
| `port` | Puerto | `3000` |
| `admins` | Lista de usuarios admin, ej. `["pedro"]` | `[]` |
| `tunnel.mode` | `quick` (link al azar), `named` (dominio propio) o `token` | `quick` |
| `tunnel.hostname` | Tu dominio para el juego | `agario.alexlamasg.lat` |
| `tunnel.protocol` | `auto` o `http2` (usá `http2` si el link de Internet no aparece) | `auto` |
| `chat.enabled` / `chat.badWords` | Chat y palabras extra a bloquear | `true` / `[]` |
| `progression.startingCoins` | ₲ de regalo al crear cuenta | `5000` |
| `ffa.bots` / `br.bots` | Cantidad de bots en cada modo | `12` / `12` |
| `ffa.world` / `br.world` | Tamaño del mapa | `6000` / `4500` |
| `ffa.food` / `ffa.viruses` | Chipitas y cactus | `1000` / `20` |
| `br.minHumans` | Personas necesarias para arrancar una ronda | `1` |
| `br.lobbySeconds` | Espera antes de arrancar | `20` |
| `br.maxRoundSeconds` | Duración máxima de una ronda | `420` |
| `bots.mix` | Proporción de bots tranqui/normal/capo | `0.5 / 0.35 / 0.15` |

## 🛡️ Administración

**Comandos de chat** (para usuarios en `admins`):

| Comando | Acción |
|---|---|
| `/bots 20` | Cambia la cantidad de bots de la sala |
| `/br start` · `/br stop` | Arranca ya / termina la ronda de Batalla real |
| `/kick nombre` | Saca a un jugador |
| `/mute nombre 10` | Silencia a alguien 10 minutos |
| `/anuncio texto` | Mensaje para todos |
| `/perf` | Rendimiento del servidor |

**Por consola** (abrí una terminal en la carpeta del juego):

```
npm run admin -- usuarios
npm run admin -- reset-password USUARIO CLAVE_NUEVA
npm run admin -- dar-gs USUARIO 50000
npm run admin -- admin USUARIO si
npm run admin -- ban USUARIO
npm run backup
```

Los datos (cuentas, estadísticas, skins) se guardan en `data\jaha.db`. Los respaldos van a `data\backups\` (se guardan los últimos 30).

---

## 🆘 Problemas comunes

| Problema | Solución |
|---|---|
| Mis amigos de la WiFi no pueden entrar | Ejecutá `ABRIR-FIREWALL.bat`. Si tu red WiFi figura como **Pública**, el script ofrece cambiarla a **Privada**. Revisá que usen la dirección `192.168…` y no `localhost`. |
| Windows preguntó si permitir "Node.js" y puse Cancelar | Ejecutá `ABRIR-FIREWALL.bat`: detecta y ofrece borrar esa regla de bloqueo. |
| "El puerto 3000 ya está en uso" | Ya tenés el servidor abierto en otra ventana, o cambiá `port` en `config.json`. |
| No aparece el link de Internet | Esperá unos segundos. Si no sale, poné `"tunnel": { "protocol": "http2" }` en `config.json`. Si existe `C:\Users\TU_USUARIO\.cloudflared\config.yml`, renombralo. Volvé a correr `1-INSTALAR.bat` si falta cloudflared. |
| El link de Internet dejó de andar | El link al azar cambia en cada reinicio: compartí el nuevo, o usá tu dominio fijo con `4-CONFIGURAR-DOMINIO.bat`. |
| `agario.alexlamasg.lat` muestra error 1033 o 530 | El servidor está apagado: abrí `2-INICIAR.bat` en la PC. |
| "No se pudo crear el registro DNS" | Autorizaste otro dominio en Cloudflare. Ejecutá `4-CONFIGURAR-DOMINIO.bat --relogin` y elegí `alexlamasg.lat`. |
| En el celular se ve chiquito o vertical | Girá el celular (horizontal) y usá "Agregar a inicio" para pantalla completa. |
| Va lento en un celular viejo | Ajustes → Calidad gráfica → **Baja**. |
| Me olvidé la contraseña | El admin la cambia con `npm run admin -- reset-password USUARIO CLAVE`. |
| Quiero empezar de cero | Cerrá el servidor y borrá la carpeta `data` (¡se pierden todas las cuentas!). |

---

## 👩‍💻 Para desarrolladores

- **Servidor**: Node.js (≥ 22.13) + Express 5 + `ws`. Simulación autoritativa a 40 Hz con paso fijo, hash espacial, snapshots binarios a 20 Hz con diferencias por jugador (sólo lo que ve cada uno) e interpolación en el cliente.
- **Base de datos**: `node:sqlite` (incluido en Node, sin módulos nativos que compilar).
- **Cliente**: módulos ES + Canvas 2D, sin paso de compilación. `shared/` lo usan servidor y navegador.
- **Sin dependencias pesadas**: sólo `express`, `ws` y `qrcode`.

```
npm install
npm start                # servidor en http://localhost:3000
npm run start:tunnel     # + link de Internet (necesita cloudflared)
npm run dev              # reinicia al cambiar archivos
npm test                 # pruebas unitarias e integración (node:test)
npm run test:e2e         # prueba de punta a punta con Chromium (necesita Playwright)
npm run loadtest -- --clients 20 --seconds 30
```

```
server/            servidor (index.js, create-server.js, config.js, tunnel.js)
  game/            mundo, salas (Clásico / Batalla real), bots, zona, netsync, chat
  db/ auth/        base de datos, cuentas y sesiones
  progress/        premios, logros y progresión
  http/ net/       API REST y WebSocket
  tools/           administración por consola
shared/            constantes, fórmulas, codec binario, saneamiento, catálogos
public/            cliente (index.html, css, js, skins SVG, íconos, PWA)
scripts/windows/   instalador y firewall (PowerShell)
tests/             unit, integration, e2e
docs/PLAN.md       plan de trabajo
```

Hecho con ❤️ en Paraguay. **¡Jaha!** 🧉
