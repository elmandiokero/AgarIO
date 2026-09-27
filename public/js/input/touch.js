// Controles táctiles: joystick (flotante o fijo) + botones Dividir / Expulsar. Multi-toque con Pointer Events.
export function setupTouchInput(app) {
  const controls = document.getElementById('touch-controls');
  const zone = document.getElementById('joy-zone');
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joy-knob');
  const btnSplit = document.getElementById('btn-split');
  const btnEject = document.getElementById('btn-eject');

  app.joy = { active: false, vx: 0, vy: 0 };
  let joyPointer = null;
  let origin = { x: 0, y: 0 };

  const enableTouch = () => {
    if (app.touchMode) return;
    app.touchMode = true;
    document.body.classList.add('touch');
    controls.hidden = false;
    app.onTouchModeChanged?.();
  };
  if (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window) enableTouch();
  window.addEventListener('touchstart', enableTouch, { once: true, passive: true });

  const radius = () => joy.offsetWidth / 2 || 65;

  function fixedOrigin() {
    const r = joy.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function placeJoystick(x, y) {
    joy.style.left = `${x}px`;
    joy.style.top = `${y}px`;
  }

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  zone.addEventListener('pointerdown', (ev) => {
    if (joyPointer !== null) return;
    ev.preventDefault();
    app.sfx?.unlock();
    joyPointer = ev.pointerId;
    zone.setPointerCapture?.(ev.pointerId);
    if (app.settings.joystickMode === 'fixed') {
      origin = fixedOrigin();
    } else {
      origin = { x: ev.clientX, y: ev.clientY };
      placeJoystick(ev.clientX, ev.clientY);
    }
    joy.classList.add('active');
    app.joy.active = true;
    move(ev);
  });

  function move(ev) {
    if (ev.pointerId !== joyPointer) return;
    const R = radius();
    let dx = ev.clientX - origin.x;
    let dy = ev.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob(dx, dy);
    app.joy.vx = dx / R;
    app.joy.vy = dy / R;
  }

  function end(ev) {
    if (ev.pointerId !== joyPointer) return;
    joyPointer = null;
    app.joy.active = false;
    app.joy.vx = 0;
    app.joy.vy = 0;
    setKnob(0, 0);
    joy.classList.remove('active');
    if (app.settings.joystickMode !== 'fixed') {
      joy.style.left = '';
      joy.style.top = '';
    }
  }

  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);

  const vibrate = (ms) => {
    if (app.settings.vibration && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* ignorar */
      }
    }
  };

  btnSplit.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    btnSplit.classList.add('pressed');
    app.split();
    vibrate(15);
  });
  const releaseSplit = () => btnSplit.classList.remove('pressed');
  btnSplit.addEventListener('pointerup', releaseSplit);
  btnSplit.addEventListener('pointercancel', releaseSplit);
  btnSplit.addEventListener('pointerleave', releaseSplit);

  let ejectPointer = null;
  btnEject.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    if (ejectPointer !== null) return;
    ejectPointer = ev.pointerId;
    btnEject.setPointerCapture?.(ev.pointerId);
    btnEject.classList.add('pressed');
    app.eject(true);
    vibrate(8);
  });
  const stopEject = (ev) => {
    if (ev.pointerId !== ejectPointer) return;
    ejectPointer = null;
    btnEject.classList.remove('pressed');
    app.eject(false);
  };
  btnEject.addEventListener('pointerup', stopEject);
  btnEject.addEventListener('pointercancel', stopEject);
  btnEject.addEventListener('lostpointercapture', stopEject);

  for (const b of [btnSplit, btnEject]) b.addEventListener('contextmenu', (e) => e.preventDefault());
}
