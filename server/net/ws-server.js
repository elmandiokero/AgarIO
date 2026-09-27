// Servidor WebSocket: handshake, límites, y despacho de mensajes a las salas.
import { WebSocketServer } from 'ws';
import { Connection } from './connection.js';
import { clientIp } from '../util/client-ip.js';
import { decodeInput } from '../../shared/codec.js';
import { PROTOCOL_VERSION, CLIENT_MSGS } from '../../shared/constants.js';
import { cleanName, createWordFilter } from '../../shared/sanitize.js';
import { levelFromXp, clamp } from '../../shared/formulas.js';
import { SKIN_MAP } from '../../shared/catalog/skins.js';
import { GlobalChat } from './global-chat.js';

const MAX_JSON = 1024;

export function connUser(u) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    is_admin: !!u.is_admin,
    xp: u.xp,
    coins: u.coins,
    level: levelFromXp(u.xp),
    equipped_skin: u.equipped_skin,
  };
}

export function createWsServer({ server, config, sessions, repos, rooms, log, clock }) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, perMessageDeflate: false });
  // ws re-emite los errores del servidor HTTP (ej. puerto ocupado): los maneja index.js
  wss.on('error', () => {});
  const conns = new Set();
  const perIp = new Map();
  const nameFilter = createWordFilter(config.chat.badWords);
  const broadcastAll = (json) => {
    for (const c of conns) if (c.helloed) c.sendRaw(json);
  };
  const globalChat = new GlobalChat({
    config,
    repos,
    clock,
    broadcast: broadcastAll,
    onAdminCommand: (conn, cmd, args, reply) => rooms.adminCommand(conn.room, conn, cmd, args, reply),
  });
  rooms.announce = (text) => globalChat.announce(text);
  let lastOnline = -1;
  const onlineCount = () => {
    let n = 0;
    for (const c of conns) if (c.helloed) n++;
    return n;
  };

  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, username: u.username, displayName: u.display_name, level: u.level, isAdmin: u.is_admin, equippedSkin: u.equipped_skin };
  }

  function validSkin(conn, skin) {
    if (skin === '' || skin == null) return '';
    if (typeof skin !== 'string' || !SKIN_MAP[skin]) return null;
    if (SKIN_MAP[skin].free) return skin;
    if (conn.user && repos && repos.hasSkin(conn.user.id, skin)) return skin;
    return null;
  }

  function resolveName(conn, raw) {
    if (conn.user) return conn.user.display_name;
    let name = cleanName(raw);
    if (!name) return 'Anónimo';
    if (nameFilter.test(name)) return 'Anónimo';
    if (repos && repos.isNameTaken(name)) return { error: 'Ese nombre es de una cuenta registrada. Iniciá sesión o elegí otro.' };
    return name;
  }

  function handleJson(conn, msg) {
    switch (msg.t) {
      case 'hello': {
        if (conn.helloed) return;
        conn.helloed = true;
        clearTimeout(conn.helloTimer);
        if (msg.v !== PROTOCOL_VERSION) {
          conn.sendJson({ t: 'err', code: 'version', msg: 'Hay una versión nueva del juego. Actualizá la página.' });
          conn.close(4002, 'version');
          return;
        }
        let tokenInvalid = false;
        if (msg.token && sessions) {
          const u = sessions.resolve(msg.token);
          if (u) conn.user = connUser(u);
          else tokenInvalid = true;
        }
        conn.sendJson({
          t: 'welcome',
          v: PROTOCOL_VERSION,
          user: publicUser(conn.user),
          tokenInvalid,
          rooms: rooms.summary(),
          title: config.title,
          online: onlineCount(),
          chat: config.chat.enabled,
        });
        if (config.chat.enabled) conn.sendJson(globalChat.historyMessage());
        if (typeof msg.resume === 'string') {
          let ok = false;
          for (const r of Object.values(rooms.rooms)) {
            if (r.tryResume(conn, msg.resume)) {
              ok = true;
              break;
            }
          }
          if (!ok) conn.sendJson({ t: 'resume', ok: false });
        }
        return;
      }
      case 'auth': {
        // Iniciar / cerrar sesión sin reconectar (aplica desde la próxima partida)
        if (msg.token === null || msg.token === undefined) {
          conn.user = null;
        } else if (typeof msg.token === 'string' && sessions) {
          const u = sessions.resolve(msg.token);
          conn.user = u ? connUser(u) : null;
        }
        if (conn.player && conn.room && !conn.player.alive) conn.room.refreshIdentity(conn.player);
        conn.sendJson({ t: 'authed', user: publicUser(conn.user) });
        return;
      }
      case 'join': {
        const room = rooms.get(msg.mode);
        if (!room) return conn.sendJson({ t: 'err', code: 'mode', msg: 'Ese modo no está disponible.' });
        const nowJ = clock.now();
        if (nowJ - (conn.lastJoinAt || 0) < 1500) return; // anti-spam de entrar y salir
        if (conn.user && repos) {
          const fresh = repos.getUser(conn.user.id);
          if (!fresh || fresh.banned) return conn.close(4003, 'banned');
          conn.user = connUser(fresh);
        }
        const name = resolveName(conn, msg.name);
        if (typeof name === 'object') return conn.sendJson({ t: 'err', code: 'name', msg: name.error });
        const skin = validSkin(conn, msg.skin);
        if (skin === null) return conn.sendJson({ t: 'err', code: 'skin', msg: 'No tenés esa skin todavía.' });
        if (typeof msg.aspect === 'number' && Number.isFinite(msg.aspect)) conn.aspect = clamp(msg.aspect, 0.45, 2.4);
        if (conn.room) conn.room.leave(conn);
        conn.lastJoinAt = nowJ;
        room.join(conn, { name, skin });
        return;
      }
      case 'respawn': {
        if (!conn.room) return;
        const opts = {};
        if (msg.skin !== undefined) {
          const skin = validSkin(conn, msg.skin);
          if (skin !== null) opts.skin = skin;
        }
        if (!conn.user && typeof msg.name === 'string') {
          const name = resolveName(conn, msg.name);
          if (typeof name === 'string') opts.name = name;
        }
        conn.room.respawn(conn, opts);
        return;
      }
      case 'leave':
        if (conn.room) conn.room.leave(conn);
        conn.sendJson({ t: 'left', rooms: rooms.summary() });
        return;
      case 'spectate':
        if (conn.room) conn.room.spectate(conn, typeof msg.pid === 'number' ? msg.pid : null);
        return;
      case 'spectate_next':
        if (conn.room) conn.room.spectateNext(conn);
        return;
      case 'view':
        if (typeof msg.aspect === 'number' && Number.isFinite(msg.aspect)) conn.aspect = clamp(msg.aspect, 0.45, 2.4);
        return;
      case 'chat':
        if (conn.room && typeof msg.text === 'string') conn.room.handleChat(conn, msg.text);
        return;
      case 'gchat':
        globalChat.handle(conn, msg);
        return;
      case 'ping':
        conn.sendJson({ t: 'pong', c: typeof msg.c === 'number' ? msg.c : 0, s: clock.now() });
        return;
      case 'rooms':
        conn.sendJson({ t: 'rooms', rooms: rooms.summary() });
        return;
      default:
        return;
    }
  }

  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    const count = perIp.get(ip) || 0;
    if (conns.size >= config.limits.maxConnections || count >= config.limits.maxPerIp) {
      ws.close(1013, 'lleno');
      return;
    }
    const conn = new Connection(ws, ip);
    conns.add(conn);
    perIp.set(ip, count + 1);
    conn.helloTimer = setTimeout(() => {
      if (!conn.helloed) conn.close(4000, 'hello');
    }, 5000);

    ws.on('pong', () => {
      conn.alive = true;
    });

    ws.on('message', (data, isBinary) => {
      const now = clock.now();
      if (!conn.bucket.take(1, now)) {
        if (conn.overflowSince === null) conn.overflowSince = now;
        else if (now - conn.overflowSince > 3000) conn.close(1008, 'spam');
        return;
      }
      conn.overflowSince = null;
      try {
        if (isBinary) {
          if (!conn.room) return;
          const input = decodeInput(data);
          if (input) conn.room.onInput(conn, input);
          return;
        }
        if (data.length > MAX_JSON) return;
        let msg;
        try {
          msg = JSON.parse(data.toString('utf8'));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string' || !CLIENT_MSGS.includes(msg.t)) return;
        if (!conn.helloed && msg.t !== 'hello') return;
        handleJson(conn, msg);
      } catch (err) {
        log?.error('Error procesando mensaje:', err.stack || err.message);
      }
    });

    ws.on('close', () => {
      clearTimeout(conn.helloTimer);
      conns.delete(conn);
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      if (conn.room) {
        try {
          conn.room.disconnect(conn);
        } catch (err) {
          log?.error('Error al desconectar:', err.message);
        }
      }
    });

    ws.on('error', () => {});
  });

  // Latidos: detectar conexiones muertas
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      try {
        c.ws.ping();
      } catch {
        /* ignorar */
      }
    }
  }, 15_000);
  heartbeat.unref?.();

  // Estado de salas para los que están en el menú + cantidad de conectados para todos
  const menuTicker = setInterval(() => {
    let summary = null;
    for (const c of conns) {
      if (c.room || !c.helloed) continue;
      summary ??= JSON.stringify({ t: 'rooms', rooms: rooms.summary() });
      c.sendRaw(summary);
    }
    const n = onlineCount();
    if (n !== lastOnline) {
      lastOnline = n;
      broadcastAll(JSON.stringify({ t: 'online', n }));
    }
  }, 2000);
  menuTicker.unref?.();

  return {
    wss,
    conns,
    globalChat,
    close() {
      clearInterval(heartbeat);
      clearInterval(menuTicker);
      for (const c of conns) c.close(1001, 'apagando');
      wss.close();
    },
  };
}
