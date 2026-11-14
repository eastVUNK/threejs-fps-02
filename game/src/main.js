// EMBERLINE boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. 5v5: the player plus four Ember bots against
// five Slate bots on Foundry Yard, first to 5 rounds. Rounds are won by
// elimination, by detonating the planted bomb, or (for Slate) by defusal or
// by the timer running out before a plant. Between rounds is a buy phase:
// round money buys rifles, armor and grenades. Shooting is a raycast from
// the camera: walls stop bullets, bot bodies take weapon damage, heads take
// 2x. Bots fight each other with burst fire, hold angles, push the target
// site, and turn toward gunfire.
// ?shot=start|buy|play|plant|end with &seed=N sets up a deterministic frame
// for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, ARMOR_PRICE, ARMOR_POINTS, GRENADE_PRICE, GRENADE_MAX } from './weapons.js';
import { createBots } from './bots.js';
import { createObjective, SITES } from './objective.js';
import { createGrenades } from './grenade.js';
import { createHud } from './hud.js';
import {
  ROUND_TIME, WIN_ROUNDS, PLANT_TIME,
  createGameState, startBuyPhase, startRound, awardKill, awardRoundWin, awardRoundLoss, awardPlant,
} from './game.js';

const FIXED_STEP = 1 / 60;

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
const bots = createBots(scene, world.colliders, world.emberSpawn, world.slateSpawn, random);
const objective = createObjective(scene);
const grenades = createGrenades(scene, world.colliders);
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
let lastBombText = '';

hud.setAmmo(weapon.state.mag, weapon.state.reserve);
hud.setHealth(body.health, body.armor);
hud.setScore(0, 0);
hud.setAlive(5, 5);
hud.setMoney(game.money);
hud.setGrenades(0);
hud.setTimer(ROUND_TIME);
hud.setBomb(`BOMB: CARRYING → ${game.targetSite}`);
hud.onPlay(() => {
  if (shot) return;
  if (game.phase === 'matchEnd') resetMatch();
  else if (game.phase === 'roundEnd' || game.phase === 'lobby') beginBuyPhase();
  else if (game.phase === 'playing') input.requestLock();
});
function startPlaying() {
  startRound(game);
  hud.hideBuyMenu();
  hud.hideOverlay();
  hud.feedLine(`Round ${game.round} — eliminate Slate or plant at site ${game.targetSite}.`);
  if (!shot) input.requestLock();
}

hud.onBuyStart(() => {
  if (shot) return;
  if (game.phase === 'buy') startPlaying();
});

function targetSiteForRound(round) {
  return round % 2 === 1 ? 'A' : 'B';
}

function beginBuyPhase() {
  game.targetSite = targetSiteForRound(game.round);
  player.reset(world.emberSpawn);
  bots.reset(game.round);
  objective.reset(game.targetSite);
  weapon.equip(WEAPONS[game.weaponId]);
  startBuyPhase(game);
  hud.hideOverlay();
  hud.hideBanner();
  hud.setChannel(null, null);
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setMoney(game.money);
  hud.setGrenades(game.grenades);
  hud.setScore(game.emberRounds, game.slateRounds);
  hud.setAlive(5, 5);
  hud.setTimer(ROUND_TIME);
  hud.showBuyMenu(game.money, game.weaponId, game.grenades);
  hud.feedLine(`Round ${game.round} — buy phase. Plant at site ${game.targetSite}.`);
  lastBombText = '';
}

function resetMatch() {
  game.round = 1;
  game.emberRounds = 0;
  game.slateRounds = 0;
  game.money = 800;
  game.kills = 0;
  game.grenades = 0;
  game.weaponId = 'carbine';
  beginBuyPhase();
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
    awardRoundLoss(game);
    hud.showBanner('SLATE TAKES THE ROUND', reason);
    hud.feedLine(`Slate wins round ${game.round} — ${reason}`);
  }
  objective.cancelPlant();
  objective.cancelDefuse();
  hud.setChannel(null, null);
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

function checkEliminationWin() {
  if (game.phase !== 'playing') return;
  const slateAlive = bots.aliveCount('slate');
  const emberAlive = bots.aliveCount('ember') + (body.health > 0 ? 1 : 0);
  if (slateAlive === 0) {
    endRound(true, objective.state.status === 'planted' ? 'Slate squad eliminated after the plant.' : 'Slate squad eliminated.');
  } else if (emberAlive === 0) {
    // With the bomb planted the fuse still decides; otherwise Slate wins.
    if (objective.state.status !== 'planted') endRound(false, 'Ember squad eliminated.');
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
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

function bombStatusText() {
  const status = objective.state.status;
  if (status === 'planted') return `BOMB PLANTED — ${Math.max(0, Math.ceil(objective.state.fuseLeft))}s`;
  if (status === 'planting') return 'PLANTING…';
  if (status === 'detonated') return 'BOMB DETONATED';
  if (status === 'defused') return 'BOMB DEFUSED';
  const carrier = objective.state.carrier;
  const who = carrier === 'player' ? 'CARRYING' : carrier ? `${carrier.name.toUpperCase()} CARRYING` : 'BOMB LOST';
  return `BOMB: ${who} → ${objective.state.site}`;
}

function refreshBombHud() {
  const text = bombStatusText();
  if (text !== lastBombText) {
    hud.setBomb(text);
    lastBombText = text;
  }
}

function transferCarrier() {
  // The player died: the first living Ember bot picks the bomb up.
  const backup = bots.ember.find((bot) => bot.alive);
  objective.state.carrier = backup ?? null;
  if (backup) hud.feedLine(`${backup.name} picked up the bomb.`);
  else hud.feedLine('The bomb is lost — no carrier left.');
}

function onPlantComplete(byBot) {
  objective.plant();
  if (byBot === 'player') {
    awardPlant(game);
    hud.setMoney(game.money);
    hud.feedLine('Bomb planted at site ' + objective.state.site + '. +$150');
  } else {
    hud.feedLine(`${byBot.name} planted the bomb at site ${objective.state.site}.`);
  }
  hud.setChannel(null, null);
}

function onDefuseComplete(bot) {
  objective.defuse();
  hud.feedLine(`${bot.name} defused the bomb.`);
  endRound(false, 'Bomb defused.');
}

function onBotShot(shooter, target, damage) {
  if (game.phase !== 'playing') return;
  const from = shooter.position.clone();
  from.y += 1.5;
  const to = target.pos.clone();
  to.y += 1.2;
  showTracer(from, to);
  bots.hearShot(shooter.position);
  if (damage === 0) return;
  if (target.kind === 'player') {
    const health = player.damage(damage);
    hud.setHealth(health, body.armor);
    if (health <= 0) {
      hud.feedLine(`${shooter.name} eliminated you.`);
      transferCarrier();
      checkEliminationWin();
    }
  } else {
    const victim = target.ref;
    const killed = bots.damage(victim, damage);
    if (killed) {
      hud.feedLine(`${shooter.name} eliminated ${victim.name}.`);
      if (victim.team === 'slate' && shooter.team === 'ember') {
        // Teammate kill: no money, but the feed shows the squad fighting.
      }
      checkEliminationWin();
    }
  }
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
  const targets = world.shootables.concat(bots.hitMeshes('slate'));
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : camera.position.clone().add(direction.clone().multiplyScalar(60));
  showTracer(camera.position, end);
  bots.hearShot(body.position);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const def = weapon.state.def;
    const killed = bots.damage(bot, hit.object.userData.part === 'head' ? def.damage * def.headMult : def.damage);
    hud.hitMarker(killed);
    if (killed) {
      awardKill(game);
      hud.setMoney(game.money);
      hud.feedLine(`You eliminated ${bot.name}. +$100`);
      checkEliminationWin();
    }
  }
  weapon.pullTrigger();
  player.recoil(weapon.state.def.recoil + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function throwGrenade() {
  if (game.grenades <= 0) return;
  game.grenades -= 1;
  hud.setGrenades(game.grenades);
  camera.getWorldDirection(direction);
  const from = camera.position.clone().add(direction.clone().multiplyScalar(0.4));
  from.y -= 0.1;
  grenades.throwGrenade(from, direction.clone());
  hud.feedLine('Frag out.');
}

function onExplode(pos, radius, maxDamage, minDamage) {
  // Area damage with falloff, to both teams and to the player.
  for (const bot of bots.all) {
    if (!bot.alive) continue;
    const dist = bot.position.distanceTo(pos);
    if (dist > radius) continue;
    const damage = Math.round(minDamage + (maxDamage - minDamage) * (1 - dist / radius));
    const killed = bots.damage(bot, damage);
    if (killed) {
      hud.feedLine(`${bot.name} was caught in the blast.`);
      checkEliminationWin();
    }
  }
  const playerDist = body.position.distanceTo(pos);
  if (playerDist <= radius && body.health > 0) {
    const damage = Math.round(minDamage + (maxDamage - minDamage) * (1 - playerDist / radius));
    const health = player.damage(damage);
    hud.setHealth(health, body.armor);
    camera.getWorldDirection(direction);
    const toBlast = pos.clone().sub(camera.position).normalize();
    const facing = direction.dot(toBlast);
    if (playerDist < 12 && facing > 0.2) hud.flashScreen(1 - playerDist / 12);
    if (health <= 0) {
      hud.feedLine('You were caught in the blast.');
      transferCarrier();
      checkEliminationWin();
    }
  }
}

function buyWithKey(code) {
  const money = game.money;
  if (code === 'Digit1') {
    game.weaponId = 'carbine';
    weapon.equip(WEAPONS.carbine);
  } else if (code === 'Digit2' && game.weaponId !== 'longshot' && money >= WEAPONS.longshot.price) {
    game.money -= WEAPONS.longshot.price;
    game.weaponId = 'longshot';
    weapon.equip(WEAPONS.longshot);
  } else if (code === 'Digit3' && game.weaponId !== 'marksman' && money >= WEAPONS.marksman.price) {
    game.money -= WEAPONS.marksman.price;
    game.weaponId = 'marksman';
    weapon.equip(WEAPONS.marksman);
  } else if (code === 'Digit4' && body.armor < ARMOR_POINTS && money >= ARMOR_PRICE) {
    game.money -= ARMOR_PRICE;
    player.setArmor(ARMOR_POINTS);
  } else if (code === 'Digit5' && game.grenades < GRENADE_MAX && money >= GRENADE_PRICE) {
    game.money -= GRENADE_PRICE;
    game.grenades += 1;
  } else {
    return;
  }
  hud.setMoney(game.money);
  hud.setGrenades(game.grenades);
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.showBuyMenu(game.money, game.weaponId, game.grenades);
}

function step(dt) {
  if (game.phase === 'buy') {
    game.buyTimer -= dt;
    hud.setTimer(game.buyTimer);
    if (game.buyTimer <= 0) {
      startPlaying();
    }
    return;
  }
  if (game.phase !== 'playing') return;

  if (objective.state.status === 'planted') {
    objective.step(dt);
    hud.setTimer(objective.state.fuseLeft);
    if (objective.state.fuseLeft <= 0) {
      objective.detonate();
      endRound(true, 'Bomb detonated.');
      return;
    }
  } else {
    game.timer -= dt;
    hud.setTimer(game.timer);
    if (game.timer <= 0) {
      endRound(false, 'Time expired — Slate holds the yard.');
      return;
    }
  }

  // Planting: hold E near the target site while carrying the bomb.
  const bomb = objective.state;
  if ((bomb.status === 'carried' || bomb.status === 'planting') && bomb.carrier === 'player' && body.health > 0) {
    const site = SITES[bomb.site];
    const nearSite = body.position.distanceTo(site) < 2.5;
    if (nearSite && input.state.keys.has('KeyE')) {
      if (bomb.status === 'carried') objective.beginPlant();
      bomb.plantProgress += dt / PLANT_TIME;
      hud.setChannel('PLANTING…', Math.min(1, bomb.plantProgress));
      if (bomb.plantProgress >= 1) onPlantComplete('player');
    } else if (bomb.status === 'planting') {
      objective.cancelPlant();
      hud.setChannel(null, null);
    }
  } else if (bomb.status === 'planting' && bomb.carrier !== 'player') {
    hud.setChannel('PLANTING…', Math.min(1, bomb.plantProgress));
  }

  player.step(dt, input.state.keys);
  weapon.step(dt);
  // A dead bot carrier drops the bomb to the next living Ember bot.
  if (bomb.carrier && bomb.carrier !== 'player' && !bomb.carrier.alive) {
    bomb.plantProgress = 0;
    transferCarrier();
  }
  bots.step(dt, {
    playerPos: body.position,
    playerAlive: body.health > 0,
    shootables: world.shootables,
    targetSitePos: SITES[game.targetSite],
    bombStatus: objective.state.status,
    bombPos: SITES[objective.state.site],
    bombCarrier: objective.state.carrier,
  }, { onBotShot, onPlantComplete, onDefuseComplete });
  // Mirror a bot carrier's plant channel and a Slate defuse channel to the HUD.
  if (bomb.status === 'planting' && bomb.carrier && bomb.carrier !== 'player') {
    bomb.plantProgress = Math.min(1, bomb.carrier.plantProgress / 4);
    hud.setChannel('PLANTING…', bomb.plantProgress);
  }
  if (bomb.status === 'planted') {
    const defuser = bots.slate.find((bot) => bot.alive && bot.defuseProgress > 0);
    if (defuser) hud.setChannel('DEFUSING…', Math.min(1, defuser.defuseProgress / 5));
    else if (bomb.status === 'planted') hud.setChannel(null, null);
  }
  grenades.step(dt, onExplode);
  refreshBombHud();
  hud.setAlive(bots.aliveCount('ember') + (body.health > 0 ? 1 : 0), bots.aliveCount('slate'));
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
    if (game.phase === 'buy') {
      for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
        if (input.takePressed(code)) buyWithKey(code);
      }
      if (input.takePressed('Enter')) {
        startPlaying();
      }
    }
    if (game.phase === 'playing' && body.health > 0) {
      if (input.state.firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
      if (input.state.keys.has('KeyR')) weapon.reload();
      if (input.takePressed('KeyG')) throwGrenade();
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
  if (name === 'buy') {
    beginBuyPhase();
    body.position.set(0, 0, 9.0);
    body.yaw = 0;
    body.pitch = 0;
    syncCamera();
  } else if (name === 'start') {
    body.position.set(0.6, 0, 9.0);
    settle(0);
    aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.showOverlay('start', '0 – 0');
  } else {
    beginBuyPhase();
    startPlaying();
    if (name === 'plant') {
      const site = SITES.A;
      body.position.set(site.x + 3.5, 0, site.z + 5.0);
      settle(15);
      objective.beginPlant();
      objective.state.plantProgress = 0.55;
      hud.setChannel('PLANTING…', 0.55);
      aimAt(new THREE.Vector3(site.x, 1.0, site.z));
    } else if (name === 'play') {
      body.position.set(0, 0, 7.5);
      settle(30);
      aimAt(bots.aimPoint('slate', 0));
      shoot(0);
      settle(10);
    } else if (name === 'end') {
      body.position.set(0, 0, 7.5);
      settle(20);
      for (const bot of bots.slate) bots.damage(bot, 999);
      checkEliminationWin();
      settle(15);
      hud.hideOverlay();
      aimAt(new THREE.Vector3(0, 1.6, -6));
    }
  }
  hud.setScore(game.emberRounds, game.slateRounds);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setHealth(body.health, body.armor);
  hud.setAlive(bots.aliveCount('ember') + (body.health > 0 ? 1 : 0), bots.aliveCount('slate'));
  hud.setMoney(game.money);
  hud.setGrenades(game.grenades);
  refreshBombHud();
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
