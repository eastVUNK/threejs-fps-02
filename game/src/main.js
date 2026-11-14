// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. Shooting is a raycast from the camera:
// walls stop bullets, bot bodies take 34, heads take 68 (2x). A round ends
// when the Slate bot dies, the player dies, or the 100 s timer runs out.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { ROUND_TIME, WIN_ROUNDS, createGameState, startRound, awardKill, awardRoundWin } from './game.js';

const FIXED_STEP = 1 / 60;
const BOT_COUNT = 1;
const BODY_DAMAGE = 34;
const HEAD_DAMAGE = 68;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world.colliders, world.slateSpawn, BOT_COUNT, random);
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world.colliders, world.emberSpawn);
const input = createInput(renderer.domElement, onLockChange);
const game = createGameState();

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const tracerGeometry = new THREE.BufferGeometry();
tracerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
tracer.frustumCulled = false;
scene.add(tracer);
let tracerLife = 0;

const body = player.state;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setHealth(body.health);
hud.setScore(0, 0);
hud.setMoney(game.money);
hud.setTimer(ROUND_TIME);
hud.onPlay(() => {
  if (shot) return;
  if (game.phase === 'matchEnd') resetMatch();
  else if (game.phase !== 'playing') beginRound();
  input.requestLock();
});

function beginRound() {
  player.reset(world.emberSpawn);
  bots.reset(world.slateSpawn);
  weapon.refill();
  startRound(game);
  hud.hideOverlay();
  hud.hideBanner();
  hud.setHealth(body.health);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(game.money);
  hud.setTimer(game.timer);
  hud.feedLine(`Round ${game.round} — eliminate the Slate squad.`);
}

function resetMatch() {
  game.round = 1;
  game.emberRounds = 0;
  game.slateRounds = 0;
  game.money = 800;
  game.kills = 0;
  beginRound();
}

function endRound(emberWon, reason) {
  if (game.phase !== 'playing') return;
  game.phase = 'roundEnd';
  if (emberWon) {
    game.emberRounds += 1;
    awardRoundWin(game);
    hud.showBanner('EMBER TAKES THE ROUND', reason);
    hud.feedLine(`Ember wins round ${game.round} — ${reason}`);
  } else {
    game.slateRounds += 1;
    hud.showBanner('SLATE TAKES THE ROUND', reason);
    hud.feedLine(`Slate wins round ${game.round} — ${reason}`);
  }
  hud.setScore(game.emberRounds, game.slateRounds);
  hud.setMoney(game.money);
  if (document.pointerLockElement) document.exitPointerLock();
  if (game.emberRounds >= WIN_ROUNDS || game.slateRounds >= WIN_ROUNDS) {
    game.phase = 'matchEnd';
    const winner = game.emberRounds >= WIN_ROUNDS ? 'EMBER' : 'SLATE';
    hud.showOverlay('end', `${game.emberRounds} – ${game.slateRounds} · ${winner} takes the match`);
  } else {
    game.round += 1;
    hud.showOverlay('end', `${game.emberRounds} – ${game.slateRounds}`);
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    if (game.phase !== 'playing') beginRound();
    hud.hideOverlay();
  } else if (game.phase === 'playing') {
    hud.showOverlay('paused', `${game.emberRounds} – ${game.slateRounds}`);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function showTracer(from, to) {
  const positions = tracerGeometry.attributes.position.array;
  positions[0] = from.x;
  positions[1] = from.y;
  positions[2] = from.z;
  positions[3] = to.x;
  positions[4] = to.y;
  positions[5] = to.z;
  tracerGeometry.attributes.position.needsUpdate = true;
  tracerMaterial.opacity = 0.85;
  tracerLife = 0.07;
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    if (weapon.state.mag === 0) weapon.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : camera.position.clone().add(direction.clone().multiplyScalar(60));
  showTracer(camera.position, end);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const killed = bots.damage(bot, hit.object.userData.part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE);
    hud.hitMarker(killed);
    if (killed) {
      awardKill(game);
      hud.setMoney(game.money);
      hud.feedLine('You eliminated a Slate bot. +$100');
      if (bots.aliveCount() === 0) endRound(true, 'Slate squad eliminated.');
    }
  }
  weapon.pullTrigger();
  player.recoil(0.008 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function onBotShot(bot, damage) {
  if (game.phase !== 'playing' || damage === 0) return;
  const tracerFrom = bot.position.clone();
  tracerFrom.y += 1.5;
  showTracer(tracerFrom, camera.position);
  const health = player.damage(damage);
  hud.setHealth(health);
  if (health <= 0) endRound(false, 'You were eliminated.');
}

function step(dt) {
  if (game.phase === 'playing') {
    game.timer -= dt;
    hud.setTimer(game.timer);
    if (game.timer <= 0) {
      endRound(false, 'Time expired — Slate holds the yard.');
      return;
    }
  }
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, body.position, world.shootables, onBotShot);
  if (tracerLife > 0) {
    tracerLife -= dt;
    if (tracerLife <= 0) tracerMaterial.opacity = 0;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    if (game.phase === 'playing') {
      if (input.state.firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) weapon.reload();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  beginRound();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play') {
    body.position.set(0, 0, 7.5);
    settle(20);
    aimAt(bots.aimPoint(0));
    shoot(0);
    settle(12);
  } else if (name === 'end') {
    body.position.set(0, 0, 7.5);
    settle(20);
    aimAt(bots.aimPoint(0));
    shoot(0);
    settle(8);
    shoot(0);
    settle(8);
    shoot(0);
    settle(20);
  } else {
    body.position.set(0.6, 0, 9.0);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.showOverlay('start', '0 – 0');
  }
  hud.setScore(game.emberRounds, game.slateRounds);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(body.health);
  hud.setTimer(game.timer);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
