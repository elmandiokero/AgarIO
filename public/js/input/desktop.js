// Mouse y teclado: el mouse apunta, Espacio divide, W expulsa masa, Enter abre el chat, Esc pausa.
export function setupDesktopInput(app) {
  const canvas = document.getElementById('game');
  app.pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };

  const onMove = (ev) => {
    if (ev.pointerType === 'touch') return;
    app.pointer.x = ev.clientX;
    app.pointer.y = ev.clientY;
    app.pointer.active = true;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onMove, { passive: true });

  const typing = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  };

  let ejecting = false;
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (app.chatOpen) app.closeChat();
      else if (app.isModalOpen()) app.closeModal();
      else if (app.inRoom) app.togglePause();
      return;
    }
    if (typing()) return;
    if (!app.inRoom) {
      if (ev.key === 'Enter' && app.canPlayFromKeyboard()) {
        ev.preventDefault();
        app.play();
      }
      return;
    }
    switch (ev.code) {
      case 'Space':
        ev.preventDefault();
        app.split();
        break;
      case 'KeyW':
        if (!ejecting) {
          ejecting = true;
          app.eject(true);
        }
        break;
      case 'Enter':
        ev.preventDefault();
        app.openChat();
        break;
      default:
        break;
    }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.code === 'KeyW' && ejecting) {
      ejecting = false;
      app.eject(false);
    }
  });
  window.addEventListener('blur', () => {
    if (ejecting) {
      ejecting = false;
      app.eject(false);
    }
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
}
