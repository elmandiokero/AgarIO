// Cliente de la API REST.
import { storageGet, storageSet } from './settings-store.js';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const api = {
  token: storageGet('jaha.token'),

  setToken(t) {
    this.token = t || null;
    storageSet('jaha.token', t || null);
  },

  async req(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError('No hay conexión con el servidor.', 0, 'network');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new ApiError(data?.error || `Error ${res.status}`, res.status, data?.code);
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b = {}) { return this.req('POST', p, b); },
  put(p, b = {}) { return this.req('PUT', p, b); },
};
