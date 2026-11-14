// Keyboard + mouse input. Pointer lock owns the mouse: movement deltas are
// consumed once per frame by the game loop (takeLook), so no look input is
// ever applied twice. Firing is held mouse button; R reloads. Single-press
// actions (grenade, buy keys, start) go through takePressed(code), which
// answers each keydown once.
export function createInput(canvas, onLockChange) {
  const state = { keys: new Set(), firing: false };
  const pressed = new Set();
  let lookX = 0;
  let lookY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    state.keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (document.pointerLockElement !== canvas) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (event.button === 0 && document.pointerLockElement === canvas) state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }
  function onLock() {
    onLockChange(document.pointerLockElement === canvas);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    takeLook() {
      const look = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return look;
    },
    takePressed(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
  };
}
