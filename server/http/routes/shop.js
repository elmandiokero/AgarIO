// Tienda de skins: listar, comprar y equipar.
import { Router } from 'express';
import { HttpError, str, authOptional, authRequired } from '../middleware.js';
import { SKINS, SKIN_MAP } from '../../../shared/catalog/skins.js';
import { levelFromXp } from '../../../shared/formulas.js';

export function shopRoutes({ repos, sessions, progression }) {
  const r = Router();

  function shopFor(user) {
    const owned = user ? new Set(repos.getSkins(user.id).map((s) => s.skin_id)) : new Set();
    const level = user ? levelFromXp(user.xp) : 1;
    return SKINS.map((s) => {
      const isOwned = !!s.free || owned.has(s.id);
      let lockedReason = null;
      let canBuy = false;
      if (!isOwned) {
        if (s.price) {
          if (!user) lockedReason = 'Creá una cuenta para comprar';
          else if (s.minLevel && level < s.minLevel) lockedReason = `Requiere nivel ${s.minLevel}`;
          else if (user.coins < s.price) lockedReason = 'Te faltan guaraníes';
          else canBuy = true;
        } else if (s.level) lockedReason = `Se desbloquea en el nivel ${s.level}`;
        else if (s.achievement) lockedReason = 'Se gana con un logro';
      }
      return { ...s, owned: isOwned, equipped: user ? user.equipped_skin === s.id : false, canBuy, lockedReason };
    });
  }

  r.get('/shop', authOptional(sessions), (req, res) => {
    res.json({ coins: req.user ? req.user.coins : 0, level: req.user ? levelFromXp(req.user.xp) : 1, equipped: req.user?.equipped_skin ?? null, skins: shopFor(req.user) });
  });

  r.post('/shop/buy', authRequired(sessions), (req, res) => {
    const skinId = str(req.body, 'skinId', { min: 1, max: 40 });
    const skin = SKIN_MAP[skinId];
    if (!skin) throw new HttpError(404, 'Esa skin no existe.', 'notfound');
    if (!skin.price) throw new HttpError(400, 'Esa skin no se vende en la tienda.', 'notforsale');
    const user = req.user;
    const result = repos.tx(() => {
      if (skin.free || repos.hasSkin(user.id, skinId)) throw new HttpError(409, 'Ya tenés esa skin.', 'owned');
      const level = levelFromXp(repos.getUser(user.id).xp);
      if (skin.minLevel && level < skin.minLevel) throw new HttpError(403, `Necesitás nivel ${skin.minLevel}.`, 'level');
      if (!repos.spendCoins(user.id, skin.price, 'compra', skinId)) throw new HttpError(402, 'Te faltan guaraníes. ¡A jugar!', 'coins');
      repos.grantSkin(user.id, skinId, 'shop');
      return true;
    });
    const achievements = progression ? progression.checkProfile(user.id) : [];
    const fresh = repos.getUser(user.id);
    res.json({ ok: result, coins: fresh.coins, skins: shopFor(fresh), achievements });
  });

  r.post('/skins/equip', authRequired(sessions), (req, res) => {
    const skinId = typeof req.body?.skinId === 'string' ? req.body.skinId : '';
    if (skinId !== '') {
      const skin = SKIN_MAP[skinId];
      if (!skin) throw new HttpError(404, 'Esa skin no existe.', 'notfound');
      if (!skin.free && !repos.hasSkin(req.user.id, skinId)) throw new HttpError(403, 'Todavía no tenés esa skin.', 'locked');
    }
    repos.setEquipped(req.user.id, skinId);
    res.json({ ok: true, equipped: skinId });
  });

  return r;
}
