// Slate and Ember bots: 5v5 team combat. Every bot is a capsule body with
// a head sphere, so the raycaster can tell headshots (2x) from body shots.
// Roles: Ember pushers move on the target site with the player, one Ember
// bot shadows the player and plants the bomb if the player dies, one holds
// mid; Slate bots hold angles at sites A and B, one roams mid, and after a
// plant they all converge on the bomb to defuse. Bots fight each other with
// the same burst-fire rules they use against the player, take cover behind
// crates, and turn toward gunfire they hear. Fallen bots stay visible,
// lying where they dropped.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, BOT_DAMAGE_SCALE } from './weapons.js';

const BOT_SPEED = 3.1;
const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.7;
const SIGHT_RANGE = 30;
const BURST_SHOTS = 3;
const BURST_INTERVAL = 0.12;

const EMBER_NAMES = ['Ash', 'Coal', 'Flint', 'Spark'];
const SLATE_NAMES = ['Rook', 'Haze', 'Vex', 'Moss', 'Dusk'];

const WAYPOINTS = [
  new THREE.Vector3(-9, 0, -6),
  new THREE.Vector3(-4, 0, 2),
  new THREE.Vector3(4, 0, -6),
  new THREE.Vector3(9, 0, 2),
  new THREE.Vector3(0, 0, -9),
  new THREE.Vector3(-11, 0, 6),
  new THREE.Vector3(11, 0, 6),
  new THREE.Vector3(0, 0, 4),
];

function makeBotMesh(scene, tint, visorColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.8, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1a18'), roughness: 0.85, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), darkMat);
  head.position.y = 1.62;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(visorColor) }));
  visor.position.set(0, 1.64, 0.21);
  group.add(body, head, visor);
  scene.add(group);
  return { group, body, head };
}

export function createBots(scene, colliders, emberSpawn, slateSpawn, random) {
  const ember = [];
  const slate = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const tmpDir = new THREE.Vector3();
  const tmpBox = new THREE.Box3();

  function collides(pos) {
    tmpBox.min.set(pos.x - BOT_RADIUS, pos.y, pos.z - BOT_RADIUS);
    tmpBox.max.set(pos.x + BOT_RADIUS, pos.y + BOT_HEIGHT, pos.z + BOT_RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (tmpBox.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  function makeBot(team, name, role, spawn, index) {
    const tint = team === 'ember' ? '#c85a1a' : PALETTE.slate;
    const visor = team === 'ember' ? PALETTE.accent : '#7fb2e5';
    const mesh = makeBotMesh(scene, tint, visor);
    const start = spawn.clone();
    start.x += (index - 2) * 2.2;
    mesh.group.position.copy(start);
    return {
      team, name, role, mesh,
      position: start,
      health: 100, armor: 0, alive: true,
      weaponDef: WEAPONS.carbine,
      waypoint: Math.floor(random() * WAYPOINTS.length),
      holdPos: null,
      seeTime: 0,
      burstLeft: 0,
      burstTimer: 0,
      cooldown: 1 + random(),
      yaw: team === 'ember' ? 0 : Math.PI,
      investigate: null,
      plantProgress: 0,
      defuseProgress: 0,
      target: null,
    };
  }

  for (let i = 0; i < 4; i += 1) {
    const role = i === 0 ? 'carrier-backup' : i === 3 ? 'holder' : 'pusher';
    ember.push(makeBot('ember', EMBER_NAMES[i], role, emberSpawn, i));
  }
  const slateRoles = ['hold-a', 'hold-a', 'hold-b', 'hold-b', 'roamer'];
  for (let i = 0; i < 5; i += 1) {
    slate.push(makeBot('slate', SLATE_NAMES[i], slateRoles[i], slateSpawn, i));
  }
  // Hold positions: A site west, B site east, mid for the Ember holder.
  ember[3].holdPos = new THREE.Vector3(0, 0, 2);
  slate[0].holdPos = new THREE.Vector3(-9, 0, -6);
  slate[1].holdPos = new THREE.Vector3(-12, 0, -4);
  slate[2].holdPos = new THREE.Vector3(9, 0, -6);
  slate[3].holdPos = new THREE.Vector3(12, 0, -4);

  const all = ember.concat(slate);

  function hasLineOfSight(from, to, shootables) {
    tmpDir.copy(to).sub(from);
    const distance = tmpDir.length();
    if (distance > SIGHT_RANGE) return false;
    tmpDir.normalize();
    const eye = from.clone();
    eye.y += 1.5;
    raycaster.set(eye, tmpDir);
    const hits = raycaster.intersectObjects(shootables, false);
    return hits.length === 0 || hits[0].distance > distance;
  }

  function moveToward(bot, target, dt, speed) {
    const dx = target.x - bot.position.x;
    const dz = target.z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) return true;
    const stepX = (dx / distance) * speed * dt;
    const stepZ = (dz / distance) * speed * dt;
    const next = bot.position.clone();
    next.x += stepX;
    if (!collides(next)) bot.position.x = next.x;
    next.x = bot.position.x;
    next.z += stepZ;
    if (!collides(next)) bot.position.z = next.z;
    bot.yaw = Math.atan2(dx, dz);
    bot.mesh.group.rotation.y = bot.yaw;
    bot.mesh.group.position.copy(bot.position);
    return false;
  }

  function findTarget(bot, ctx) {
    // Nearest visible enemy: the player (for Slate) or a Slate bot (for Ember).
    let best = null;
    let bestDist = Infinity;
    const consider = (pos, ref, kind) => {
      const dist = bot.position.distanceTo(pos);
      if (dist >= bestDist || dist > SIGHT_RANGE) return;
      const chest = pos.clone();
      chest.y += 1.2;
      if (!hasLineOfSight(bot.position, chest, ctx.shootables)) return;
      best = { ref, kind, pos: pos.clone(), dist };
      bestDist = dist;
    };
    if (bot.team === 'slate') {
      if (ctx.playerAlive) consider(ctx.playerPos, 'player', 'player');
      for (const mate of ember) if (mate.alive) consider(mate.position, mate, 'bot');
    } else {
      for (const foe of slate) if (foe.alive) consider(foe.position, foe, 'bot');
    }
    return best;
  }

  return {
    ember,
    slate,
    all,
    aliveCount(team) {
      const list = team === 'ember' ? ember : slate;
      return list.filter((bot) => bot.alive).length;
    },
    hitMeshes(team) {
      const meshes = [];
      const list = team === 'ember' ? ember : slate;
      for (const bot of list) {
        if (!bot.alive) continue;
        bot.mesh.body.userData.bot = bot;
        bot.mesh.body.userData.part = 'body';
        bot.mesh.head.userData.bot = bot;
        bot.mesh.head.userData.part = 'head';
        meshes.push(bot.mesh.body, bot.mesh.head);
      }
      return meshes;
    },
    aimPoint(team, index) {
      const list = team === 'ember' ? ember : slate;
      const bot = list[index % list.length];
      const point = bot.position.clone();
      point.y += 1.5;
      return point;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      // Armor absorbs half the damage while it lasts.
      let remaining = amount;
      if (bot.armor > 0) {
        const absorbed = Math.min(bot.armor, remaining * 0.5);
        bot.armor -= absorbed;
        remaining -= absorbed;
      }
      bot.health -= remaining;
      bot.defuseProgress = 0;
      if (bot.health <= 0) {
        bot.alive = false;
        bot.health = 0;
        bot.mesh.group.rotation.z = (bot.team === 'ember' ? 1 : -1) * Math.PI / 2;
        bot.mesh.group.position.y = 0.3;
        return true;
      }
      return false;
    },
    hearShot(pos) {
      for (const bot of all) {
        if (!bot.alive) continue;
        if (bot.position.distanceTo(pos) < 22) bot.investigate = pos.clone();
      }
    },
    reset(round) {
      for (const list of [ember, slate]) {
        for (let i = 0; i < list.length; i += 1) {
          const bot = list[i];
          const spawn = bot.team === 'ember' ? emberSpawn : slateSpawn;
          bot.health = 100;
          bot.alive = true;
          bot.armor = round >= 2 && i < 3 ? 50 : 0;
          bot.weaponDef = round >= 3 && i === 0 ? WEAPONS.marksman : round >= 2 && i < 3 ? WEAPONS.longshot : WEAPONS.carbine;
          bot.mesh.group.visible = true;
          bot.mesh.group.rotation.set(0, bot.team === 'ember' ? 0 : Math.PI, 0);
          bot.position.copy(spawn);
          bot.position.x += (i - 2) * 2.2;
          bot.mesh.group.position.copy(bot.position);
          bot.waypoint = Math.floor(random() * WAYPOINTS.length);
          bot.seeTime = 0;
          bot.burstLeft = 0;
          bot.cooldown = 1 + random();
          bot.investigate = null;
          bot.plantProgress = 0;
          bot.defuseProgress = 0;
          bot.target = null;
        }
      }
    },
    step(dt, ctx, cb) {
      for (const bot of all) {
        if (!bot.alive) continue;

        // --- Bomb duties first: carrier plants, defenders defuse. ---
        if (ctx.bombStatus === 'planted' && bot.team === 'slate') {
          const distToBomb = bot.position.distanceTo(ctx.bombPos);
          if (distToBomb < 1.5) {
            bot.defuseProgress += dt;
            bot.mesh.group.rotation.y = Math.atan2(ctx.bombPos.x - bot.position.x, ctx.bombPos.z - bot.position.z);
            if (bot.defuseProgress >= 5) cb.onDefuseComplete(bot);
            continue;
          }
          moveToward(bot, ctx.bombPos, dt, BOT_SPEED);
          continue;
        }
        if (ctx.bombCarrier === bot && ctx.bombStatus === 'carried') {
          const site = ctx.targetSitePos;
          const distToSite = bot.position.distanceTo(site);
          if (distToSite < 2.5) {
            bot.plantProgress += dt;
            if (bot.plantProgress >= 4) cb.onPlantComplete(bot);
            continue;
          }
          moveToward(bot, site, dt, BOT_SPEED);
          continue;
        }

        // --- Combat: nearest visible enemy wins attention. ---
        const target = findTarget(bot, ctx);
        bot.target = target;
        if (target) {
          bot.seeTime += dt;
          const dx = target.pos.x - bot.position.x;
          const dz = target.pos.z - bot.position.z;
          bot.yaw = Math.atan2(dx, dz);
          bot.mesh.group.rotation.y = bot.yaw;
          bot.cooldown -= dt;
          if (bot.cooldown <= 0 && bot.burstLeft === 0) {
            bot.burstLeft = BURST_SHOTS;
            bot.burstTimer = 0;
            bot.cooldown = 0.9 + random() * 0.9;
          }
          if (bot.burstLeft > 0) {
            bot.burstTimer -= dt;
            if (bot.burstTimer <= 0) {
              bot.burstTimer = BURST_INTERVAL;
              bot.burstLeft -= 1;
              const hitChance = Math.max(0.1, Math.min(0.7, 0.5 - target.dist * 0.01 + bot.seeTime * 0.04));
              const hit = random() < hitChance;
              const damage = hit ? Math.round(bot.weaponDef.damage * BOT_DAMAGE_SCALE) : 0;
              cb.onBotShot(bot, target, damage);
            }
          }
          continue;
        }
        bot.seeTime = 0;

        // --- Movement: role orders, then investigate gunfire, then patrol. ---
        if (bot.investigate) {
          if (moveToward(bot, bot.investigate, dt, BOT_SPEED)) bot.investigate = null;
          continue;
        }
        if (bot.team === 'ember' && (bot.role === 'pusher' || bot.role === 'carrier-backup')) {
          if (bot.role === 'carrier-backup' && ctx.playerAlive) {
            // Shadow the player at ~4 m so the carrier is never far away.
            const distToPlayer = bot.position.distanceTo(ctx.playerPos);
            if (distToPlayer > 4.5) moveToward(bot, ctx.playerPos, dt, BOT_SPEED);
            continue;
          }
          moveToward(bot, ctx.targetSitePos, dt, BOT_SPEED);
          continue;
        }
        if (bot.holdPos) {
          const distToHold = bot.position.distanceTo(bot.holdPos);
          if (distToHold > 3) {
            moveToward(bot, bot.holdPos, dt, BOT_SPEED);
          } else {
            // Hold the angle: slow strafe, scan the lane.
            bot.yaw += Math.sin(performance.now() / 2400 + bot.position.x) * 0.002;
            bot.mesh.group.rotation.y = bot.yaw;
          }
          continue;
        }
        const targetWaypoint = WAYPOINTS[bot.waypoint];
        if (moveToward(bot, targetWaypoint, dt, BOT_SPEED)) {
          bot.waypoint = (bot.waypoint + 1 + Math.floor(random() * (WAYPOINTS.length - 1))) % WAYPOINTS.length;
        }
      }
    },
  };
}
