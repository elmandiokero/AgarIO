# Plan: "Jaha.io" — agar.io multijugador con temática paraguaya

## Contexto
El repo `elmandiokero/AgarIO` está vacío (rama `claude/loving-babbage-5c8gxm`, sin commits). Se pide un juego tipo
agar.io alojado en una PC Windows 11, jugable en navegador y celular, con cuentas, stats persistentes, skins,
logros, ajustes y bots, con temática paraguaya. Yo lo construyo y lo pruebo en este entorno cloud y lo subo a la rama.
En tu PC lo instalás con doble clic (`1-INSTALAR.bat`) porque desde acá no puedo tocar tu Windows.

Decisiones confirmadas:
- **Conexión:** misma WiFi/LAN **+ Internet por túnel gratuito de Cloudflare** (sin abrir puertos del router).
- **Bots:** **siempre juntos** con las personas. Hay una cantidad fija configurable y reaparecen al morir.
- **Skins:** **tienda con ₲ guaraníes** (moneda ficticia) **+ desbloqueo por nivel y logros**.
- **Modos:** **Clásico (todos vs todos)** + **Batalla real** (zona que se achica). Cada modo es una sala en el mismo servidor.

Idioma: español con frases en jopara ("Mba'éichapa", "¡Jaha!", "Aguyje", "¡Iporã!"). Nombre "Jaha.io" (se puede cambiar en `config.json`).

## Tecnologías (sin módulos nativos, para que `npm install` nunca falle en Windows)
| | Elección | Por qué |
|---|---|---|
| Servidor | Node.js (≥22.13; en tu PC se instala Node 24 LTS vía winget) | |
| HTTP | Express 5 | |
| Tiempo real | `ws` (WebSocket nativo), binario para snapshots e inputs | Menos datos en celulares. El túnel de Cloudflare soporta WebSocket. |
| Base de datos | `node:sqlite` incorporado en Node (archivo `data/jaha.db`, WAL), detrás de `server/db/repos.js` | |
| Contraseñas / sesiones | `crypto.scrypt` y tokens aleatorios (se guarda el hash en la DB) | |
| QR | `qrcode` (JS puro) | Para invitar escaneando el QR. |
| Cliente | ES modules puros + Canvas 2D, **sin paso de compilación** | PWA instalable ("Agregar a inicio"). |
| Tests | `node:test` y smoke test con Playwright (Chromium ya disponible en `/opt/pw-browsers`) | |

- Dependencias: solo `express`, `ws` y `qrcode`.
- El aviso `ExperimentalWarning` de sqlite se silencia con `--disable-warning=ExperimentalWarning` y además con un filtro de `process.emitWarning` + `import()` dinámico de `node:sqlite`.

## Estructura de archivos
```
package.json  config.example.json  README.md (guía en español)  .gitignore  .gitattributes (*.bat/*.ps1 → CRLF)
1-INSTALAR.bat  2-INICIAR.bat (servidor+túnel)  3-INICIAR-SOLO-WIFI.bat  ABRIR-FIREWALL.bat  RESPALDAR-DATOS.bat
scripts/windows/  instalar.ps1  firewall.ps1   (ASCII puro, compatibles con PowerShell 5.1)
scripts/dev/      render-icons.mjs  loadtest.mjs
server/
  index.js  create-server.js  config.js  tunnel.js
  util/     quiet-sqlite-warning, clock, rng (seedable), log, rate-limit, client-ip, lan
  db/       database.js  migrations.js  repos.js
  auth/     passwords.js  sessions.js
  progress/ rewards.js  achievements.js  progression.js     (lógica pura + 1 transacción por partida)
  http/     app.js  middleware.js  routes/{auth,profile,shop,leaderboard,info}.js
  net/      ws-server.js  connection.js
  game/     room-manager, room (loop de paso fijo), ffa-room, br-room, world, physics, grid (hash espacial),
            entities, player, zone, netsync (diff por visibilidad), chat
  game/bots/ brain.js  profiles.js  names.js
  tools/    admin-cli.js (reset-password, grant-coins, set-admin, backup)
shared/   (lo usan el servidor y el navegador)
  constants.js  formulas.js  codec.js  sanitize.js  settings-schema.js  catalog/{skins,achievements}.js
public/
  index.html  manifest.webmanifest  sw.js  favicon.svg  icons/  css/style.css  skins/*.svg
  js/ main, api, net, state (interpolación), audio (WebAudio sintetizado), settings-store, i18n
  js/render/ renderer, skins, text-cache, minimap
  js/input/  desktop (mouse, Espacio=dividir, W=expulsar, Enter=chat), touch (joystick + botones)
  js/ui/     menu, hud, screens (muerte/podio/espectador), shop, achievements, settings, leaderboard, auth, invite (URLs+QR)
tests/unit  tests/integration  tests/e2e/smoke.mjs  tests/helpers
```

## Mecánicas del juego (valores en `config.json` y `shared/formulas.js`)

**Loop y mundo**
- Simulación a 40 Hz con acumulador de paso fijo, porque los timers de Windows tienen ~15.6 ms de resolución.
- Snapshots a 20 Hz, con interpolación en el cliente (~100 ms de retraso).
- Mapa de 6000² en Clásico y 4500² en BR.
- `r = 10·√masa`. La velocidad se calcula como `600·m^-0.22`.
- El zoom depende del tamaño. El área visible es igual para todos; el cliente solo manda su proporción de pantalla.

**Comer y moverse**
- Comer requiere `mA ≥ 1.25·mB` y `dist ≤ rA − 0.4·rB`.
- Dividir: hasta 16 células, masa mínima 36, con impulso proporcional al tamaño.
- Fusión después de `15 s + 0.012 s·m` (máximo 45 s).
- Expulsar: cuesta 16 de masa, el pellet tiene 13 y el tiro es continuo mientras se mantiene W.

**Cactus / tuna (virus)**
- Masa 100. Las células menores a 133 se esconden debajo.
- Las mayores explotan en varios pedazos.
- Si lo alimentás 7 veces, dispara un cactus nuevo.

**Decaimiento y límites**
- Arriba de 100 de masa se pierde 0.2 %/s. Los bots grandes decaen más rápido para que no dominen.
- La masa máxima por célula es 22500.

**Aparición y muerte**
- Aparecés lejos de las células grandes.
- La comida son "chipitas" de colores (rojo/blanco/azul y dorado chipa).
- Si te desconectás, tus células quedan 20 s y podés retomar el control al volver.

## Bots (siempre presentes)
- Hay slots fijos por sala (Clásico 12, BR 12, configurable). Al morir, reaparecen en 2–5 s.
- Máquina de estados: **HUIR** de amenazas → **ZONA** (BR) → **CAZAR** presas más chicas (con división-ataque) → **COMER** comida, esquivando cactus.
- Tres personalidades: *tranqui* (50 %), *normal* (35 %) y *capo* (15 %). Varían en tiempo de reacción, visión y agresividad.
- Nombres paraguayos (~40): "Karai Pedro", "Ña Chuchi", "Tío Beto", "Kalé", "Chipera de Itá", "Mbarete", "Carpincho Loco", "Mandi'o", "Sopa Fría"…
- Usan skins del catálogo, para mostrar la tienda. La etiqueta "BOT" es opcional.

## Batalla real
- **Ciclo:** `LOBBY` (20 s cuando hay ≥1 persona en cola) → `CUENTA ATRÁS` (5 s, "3, 2, 1 ¡Jaha!") → `JUGANDO` → `FIN` (podio top 3, 12 s) → `LOBBY`, con re-encolado automático.
- **Zona:** 5 fases de espera + achique. El círculo siguiente se ve de antemano y siempre queda dentro del actual.
- **Daño afuera de la zona:** crece por fase, de 1 %·m+1 hasta 10 %·m+6 por segundo. La ronda dura ~4–7 min.
- Los bots participan y pueden ganar.
- **Llegar tarde o morir:** si llegás tarde, ves la ronda como espectador y entrás en la próxima. Si te eliminan, ves tu puesto y los premios se guardan en ese momento.
- **Final de ronda:** termina cuando queda 1. Si no queda ninguna persona viva, se acelera el final. A los 7 min gana la mayor masa.

## Progresión, tienda y logros
**Premios**
- Se calculan en el servidor por vida (Clásico) o por ronda (BR), mínimo 15 s jugados.
- XP = masa máxima/8 + kills + tiempo + bonus por ranking o puesto en BR (tope 1500).
- **₲ = XP × 10.**

**Niveles**
- XP total para el nivel L: `50·L·(L−1)` (máximo nivel 50).
- Cada nivel da un bonus de ₲ y puede desbloquear skins.

**Skins** (SVG originales, sin logos de clubes ni marcas)
| Cómo se consigue | Skins |
|---|---|
| Gratis | bandera, pelota, chipa, color liso |
| Tienda | mandioca, sopa paraguaya, mate, tereré/guampa, mburucuyá, lapacho, sombrero pirí, tatú, carpincho, yacaré |
| Tienda + nivel mínimo | ñandutí, arpa, pájaro campana, jaguareté, Itaipú |
| Por nivel (mitología guaraní) | Pombero, Jasy Jateré, Kurupí, Luisón, Ao Ao, Moñái, Mbói Tu'i, Teju Jagua |
| Por logro | chipa dorada, tuna en flor, corona karai, estrella, guarania |

**Logros (20)**

| Logro | Condición |
|---|---|
| Primer bocado | comer una célula de un jugador |
| Mbarete | llegar a 1000 de masa |
| Tuicha | llegar a 5000 de masa |
| Karai Guasu | llegar a 10000 de masa |
| Cazador | 10 kills en una vida |
| Dividir y conquistar | kill dentro de 1 s de tu división |
| Sobreviviente | sobrevivir 10 min |
| Número uno | ser #1 del ranking en Clásico |
| Venganza | comerte a quien te comió |
| Campeón | ganar una BR |
| Podio | quedar top 3 en BR |
| Chipero | 1000 chipitas en total |
| Chipero guasu | 10000 chipitas en total |
| Tuna poty | explotar 25 cactus |
| Jaguareté | 100 kills en total |
| Tereré rupa | jugar 10 partidas |
| Vicio | jugar 100 partidas |
| Ahorrista | juntar ₲ 100.000 |
| Coleccionista | tener 10 skins |
| Noctámbulo | jugar entre 00:00 y 05:00 |

- Algunos logros dan ₲ o una skin.
- Se notifican en vivo con "¡Iporã!".

**Invitados**
- Juegan sin cuenta, con skins gratis y ajustes guardados en el navegador.
- Al morir ven "Hubieras ganado +XP y ₲ — ¡Registrate!".

**Ajustes**
- Mostrar masa, nombres, skins, grilla, minimapa, chat, FPS y etiqueta BOT.
- Tema oscuro, claro o "tierra colorada". Calidad auto, alta, media o baja.
- Volumen y vibración.
- Joystick: lado izquierdo o derecho, flotante o fijo. Tamaño de botones.
- Se guardan en la cuenta, o en el navegador si sos invitado.

## Base de datos (`node:sqlite`)
| Tabla | Contenido |
|---|---|
| `users` | username único, display_name, pass_hash, is_admin, banned, xp, coins, equipped_skin, fechas |
| `sessions` | token_hash, user_id, expiración deslizante de 90 días |
| `stats` | partidas (clásico/BR), muertes, tiempo vivo, vida más larga, masa máxima, masa total, chipitas, células/jugadores/bots comidos, cactus explotados, divisiones, expulsiones, veces #1, mejor ranking, victorias BR, top 3 BR, mejor puesto BR, XP y ₲ ganados |
| `matches` | historial por partida (últimas 100 por usuario) |
| `user_skins` | skins de cada usuario |
| `user_achievements` | logros desbloqueados |
| `user_settings` | ajustes en JSON validado |
| `coin_ledger` | auditoría de compras y premios |

- Las versiones de la base se manejan con `PRAGMA user_version`.
- Comprar una skin es una sola transacción: `UPDATE … SET coins = coins − precio WHERE coins ≥ precio`.

## Protocolo de red
- **Endpoint:** `/ws`. El cliente usa `wss` automáticamente cuando entra por el túnel https.
- **Mensajes de control (JSON):** `hello` (token/resume, versión), `join {mode, name, skin, aspect}`, respawn, leave, espectar, chat, ping.
- **Del servidor (JSON):** `welcome`, `rooms`, `joined`, `lb` (2 Hz), `chat`, `feed`, `dead`, `ach`, `levelup`, `br`, `elim`.
- **Binario del cliente:** MOVE (9 bytes), SPLIT, EJECT_ON/OFF.
- **Snapshot binario (20 Hz):**
  - Contiene la cámara, la zona BR, los jugadores nuevos en vista y los diffs de entidades (agregadas/actualizadas/removidas, esta última con quién la comió, para la animación).
  - La comida nunca se re-envía.
  - Si el buffer del socket supera 128 KB, se salta el frame sin romper el diff.
  - Son ~20 KB/s por celular.

## REST API
| Área | Endpoints |
|---|---|
| Cuenta | `POST /api/auth/register`, `/login`, `/logout`, `/password` |
| Perfil | `GET /api/me`, `/api/stats/:username`, `/api/matches` |
| Ajustes | `GET/PUT /api/settings` |
| Tienda | `GET /api/shop`, `POST /api/shop/buy`, `POST /api/skins/equip` |
| Ranking | `GET /api/leaderboard?by=max_mass\|kills\|br_wins\|xp\|time` (incluye tu posición) |
| Servidor | `GET /api/server-info` (URLs LAN/pública + estado de salas), `/api/qr.svg`, `/api/health` |

- **Admin:** los usuarios listados en `config.admins` usan comandos de chat (`/bots N`, `/br start`, `/kick`, `/mute`, `/anuncio`, `/perf`).
- **CLI:** `npm run admin -- …` para resetear contraseña, dar ₲, hacer admin o respaldar.

## Seguridad básica (servidor hobby)
**Límites y validación**
- Todo input se valida con tipos, largos y rangos; los números se acotan.
- WebSocket: `maxPayload` de 4 KB y rate limit por conexión.
- Chat: 1 mensaje cada 1.2 s. Máximo 6 conexiones por IP y 150 en total.
- La IP real detrás del túnel sale de `CF-Connecting-IP`, solo si la conexión viene de loopback.

**Nombres y chat**
- Se sanean: se permiten ñ, acentos y g̃; se eliminan caracteres invisibles y "zalgo".
- Filtro de malas palabras (incluye leetspeak).
- Se dibujan con `fillText`/`textContent`, nunca con innerHTML.

**Autoridad del servidor y cabeceras**
- El servidor calcula todos los premios y valida que tengas la skin.
- CSP estricto y cabeceras de seguridad.

## Scripts de Windows
**`1-INSTALAR.bat`**
1. Verifica winget.
2. Instala Node LTS si falta y refresca el PATH.
3. Corre `npm install`.
4. Instala cloudflared vía winget. Si falla, lo descarga a `tools\`.
5. Crea `config.json`.
6. Ofrece abrir el firewall.

**`ABRIR-FIREWALL.bat`**
- Se auto-eleva a administrador y crea la regla TCP del puerto (3000).
- Si tu red WiFi está como "Pública", lo detecta y ofrece cambiarla a "Privada".

**`2-INICIAR.bat`**
- Levanta el servidor y el túnel, y se reinicia solo si se cae.
- Muestra las URL de localhost, LAN y pública con **código QR** en la consola.
- En el menú del juego está "Invitar amigos" con los mismos QR.
- La URL pública cambia en cada inicio.
- Si la red bloquea QUIC, hay una opción `tunnel.protocol: "http2"`.

**`RESPALDAR-DATOS.bat`**
- Copia la base de datos a `data/backups/` (VACUUM INTO).

El **README** en español explica los pasos, cómo jugar desde el celular, que la PC no se suspenda y la solución de problemas.

## Fases de implementación (cada una termina jugable o testeada; commit por fase)
1. **Base:** package.json, configuración, servidor Express, banner con IP LAN + QR, tests conectados.
2. **Simulación:** fórmulas, grilla espacial, mundo (comer, dividir, expulsar, fusionar, cactus, decaimiento, aparición), con tests unitarios.
3. **Red y cliente mínimo:** codec binario, WebSocket, netsync, sala Clásico, render en Canvas con interpolación. → **Primer hito jugable**.
4. **Clásico completo:** IA de bots, ranking en vivo, minimapa, chat, kill feed, pantalla de muerte, espectador, reconexión, sonidos.
5. **Celular:** joystick y botones multitáctiles, HUD responsivo, PWA, íconos, calidad automática.
6. **Cuentas:** DB, login/registro, progresión, stats, historial, ranking global, vista previa de premios para invitados.
7. **Tienda, logros y ajustes:** catálogo, SVG de skins, tienda y equipar, desbloqueos, notificaciones en vivo, ajustes sincronizados.
8. **Batalla real:** zona, ciclo de ronda, cola, espectador, podio, premios y logros BR, bots que respetan la zona.
9. **Windows:** scripts de instalación, inicio y firewall, túnel integrado, admin CLI, respaldo, README.
10. **Pulido:** comandos de admin, prueba de carga (objetivo: tick < 5 ms con 40 bots + 20 clientes) y balance final.

## Verificación
**Tests unitarios (`npm test`, RNG con semilla y reloj inyectado)**
- Fórmulas y niveles.
- Grilla contra fuerza bruta.
- Reglas del mundo: umbral de comer 1.25, división, fusión, conservación de masa al explotar un cactus, alimentar cactus, decaimiento, auto-split.
- Zona: el siguiente círculo siempre queda dentro, en 1000 semillas.
- Ciclo de BR, puestos y desempates.
- Comportamiento de bots.
- Ida y vuelta del codec, con ñ y g̃.
- Diff de netsync.
- Premios y logros.
- Saneamiento de nombres y chat.

**Tests de integración**
- DB en memoria: migraciones, compra sin saldo que hace rollback, borrado en cascada.
- API con `fetch`: registro, login, errores 401/409/429, comprar, equipar, ajustes, ranking.
- WebSocket: invitado → join → snapshot decodificado → MOVE mueve la célula; frame gigante cierra el socket; spam de chat limitado; con token las stats se guardan; resume funciona.

**E2E (`npm run test:e2e`, Chromium headless)**
- Escritorio: jugar Clásico, mover, dividir y ver bots en el ranking.
- Registrarse, recargar y seguir logueado.
- Pestañas de tienda, logros, ajustes y ranking; el ajuste se guarda.
- Celular (Pixel 7, touch): el joystick mueve y el botón divide.
- Dos jugadores se ven entre sí.
- Una ronda BR corta llega al podio.
- Falla ante cualquier `pageerror` o `console.error`.
- Guarda capturas en `test-artifacts/`, que te voy a enviar.

**Chequeo manual en tu PC (lo hacés vos)**
1. Instalar, abrir el firewall e iniciar.
2. Celular en la misma WiFi con el QR de LAN.
3. Celular con datos móviles con el QR público.
4. Jugar una BR con amigos.
5. Comprobar que las stats y los ₲ persisten tras reiniciar.
6. Hacer un respaldo.

**Entrega:** commits por fase en `claude/loving-babbage-5c8gxm` y push. No se crea PR salvo que lo pidas.
