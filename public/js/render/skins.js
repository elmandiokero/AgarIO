// Carga y pre-renderiza las skins (SVG → canvas circular de 256px) para dibujarlas rápido.
import { skinUrl } from '/shared/catalog/skins.js';

const SIZE = 256;

export class SkinCache {
  constructor() {
    this.map = new Map(); // id → {canvas|null, loading}
  }

  /** Devuelve el canvas listo o null (y empieza a cargarlo). */
  get(id) {
    if (!id) return null;
    let entry = this.map.get(id);
    if (!entry) {
      entry = { canvas: null, failed: false };
      this.map.set(id, entry);
      this.load(id, entry);
    }
    return entry.canvas;
  }

  load(id, entry, url = skinUrl(id), clip = true) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = SIZE;
      c.height = SIZE;
      const ctx = c.getContext('2d');
      if (clip) {
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      entry.canvas = c;
    };
    img.onerror = () => {
      entry.failed = true;
    };
    img.src = url;
  }

  /** Imagen sin recorte circular (para el cactus). */
  getRaw(key, url) {
    let entry = this.map.get(key);
    if (!entry) {
      entry = { canvas: null, failed: false };
      this.map.set(key, entry);
      this.load(key, entry, url, false);
    }
    return entry.canvas;
  }
}
