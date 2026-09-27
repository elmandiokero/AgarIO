// Arma todo el servidor (base de datos, salas, HTTP, WebSocket). Lo usan index.js y los tests.
import http from 'node:http';
import path from 'node:path';
import { openDatabase } from './db/database.js';
import { createRepos } from './db/repos.js';
import { createSessionService } from './auth/sessions.js';
import { createProgression } from './progress/progression.js';
import { RoomManager } from './game/room-manager.js';
import { createApp } from './http/app.js';
import { createWsServer } from './net/ws-server.js';
import { lanAddresses } from './util/lan.js';
import { systemClock } from './util/clock.js';

export async function createGameServer({ config, clock = systemClock, dbPath = null, seed = null, log = null, version = '1.0.0' }) {
  const db = await openDatabase(dbPath ?? path.join(config.dataDir, 'jaha.db'));
  const repos = createRepos(db);
  repos.syncAdmins(config.admins);
  const sessions = createSessionService(repos, clock);
  const progression = createProgression(repos, config, clock);
  let ws = null;
  const rooms = new RoomManager({ config, clock, progression, log, seed, getConnections: () => (ws ? ws.conns : []) });

  let port = config.port;
  let publicUrl = null;
  const getUrls = () => ({
    lan: lanAddresses()
      .filter((a) => !a.virtual)
      .map((a) => `http://${a.address}:${port}`),
    publicUrl,
  });

  const app = createApp({ config, repos, sessions, progression, rooms, getUrls, version, log });
  const httpServer = http.createServer(app);
  httpServer.keepAliveTimeout = 65_000;
  ws = createWsServer({ server: httpServer, config, sessions, repos, rooms, log, clock });

  return {
    db,
    repos,
    sessions,
    progression,
    rooms,
    app,
    httpServer,
    ws,
    getUrls,
    setPublicUrl(u) {
      publicUrl = u;
    },
    get port() {
      return port;
    },
    listen(p = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        httpServer.once('error', onError);
        httpServer.listen(p, host, () => {
          httpServer.off('error', onError);
          port = httpServer.address().port;
          rooms.start();
          resolve(port);
        });
      });
    },
    async close() {
      rooms.shutdown();
      ws.close();
      await new Promise((r) => httpServer.close(() => r()));
      httpServer.closeAllConnections?.();
      try {
        db.close();
      } catch {
        /* ya cerrada */
      }
    },
  };
}
