// Slate bots: capsule bodies with a head sphere, so the raycaster can tell
// headshots (2x damage) from body shots. Each bot wanders between waypoints
// on its lane; when it has line of sight to the player inside 26 m it stops,
// aims with error that shrinks the longer it sees you, and fires bursts.
// Bots use the same axis-separated collision as the player, at walking speed.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_SPEED = 3.1;
const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.7;
const SIGHT_RANGE = 26;
const BURST_SHOTS = 3;
const BURST_INTERVAL = 0.12;
const DAMAGE = 9;

const WAYPOINTS = [
  new THREE.Vector3(-9, 0, -6),
  new THREE.Vector3(-4, 0, 2),
  new THREE.Vector3(4, 0, -6),
  new THREE.Vector3(9, 0, 2),
  new THREE.Vector3(0, 0, -9),
  new THREE.Vector3(-11, 0, 6),
  new THREE.Vector3(11, 0, 6),
];

function makeBotMesh(scene, tint) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.8, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1a18'), roughness: 0.85, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 10), bodyMat);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), darkMat);
  head.position.y = 1.62;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }));
  visor.position.set(0, 1.64, 0.21);
  group.add(body, head, visor);
  scene.add(group);
  return { group, body, head };
}

export function createBots(scene, colliders, spawn, count, random) {
  const bots = [];
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

  for (let i = 0; i < count; i += 1) {
    const mesh = makeBotMesh(scene, PALETTE.slate);
    const start = spawn.clone();
    start.x += (i - (count - 1) / 2) * 2.4;
    mesh.group.position.copy(start);
    bots.push({
      mesh,
      position: start,
      health: 100,
      alive: true,
      waypoint: Math.floor(random() * WAYPOINTS.length),
      seeTime: 0,
      burstLeft: 0,
      burstTimer: 0,
      cooldown: 1 + random(),
      yaw: Math.PI,
    });
  }

  function hasLineOfSight(bot, playerPos, shootables) {
    tmpDir.copy(playerPos).sub(bot.position);
    tmpDir.y += 1.4;
    const distance = tmpDir.length();
    if (distance > SIGHT_RANGE) return false;
    tmpDir.normalize();
    const eye = bot.position.clone();
    eye.y += 1.5;
    raycaster.set(eye, tmpDir);
    const hits = raycaster.intersectObjects(shootables, false);
    // A wall between bot and player blocks the shot; the player body is not
    // in shootables, so the first hit must be beyond the player to see them.
    return hits.length === 0 || hits[0].distance > distance;
  }

  return {
    bots,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.mesh.body.userData.bot = bot;
        bot.mesh.body.userData.part = 'body';
        bot.mesh.head.userData.bot = bot;
        bot.mesh.head.userData.part = 'head';
        meshes.push(bot.mesh.body, bot.mesh.head);
      }
      return meshes;
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      const point = bot.position.clone();
      point.y += 1.5;
      return point;
    },
    damage(bot, amount) {
      bot.health -= amount;
      if (bot.health <= 0 && bot.alive) {
        bot.alive = false;
        bot.mesh.group.visible = false;
        return true;
      }
      return false;
    },
    reset(spawnPoint) {
      for (let i = 0; i < bots.length; i += 1) {
        const bot = bots[i];
        bot.health = 100;
        bot.alive = true;
        bot.mesh.group.visible = true;
        bot.position.copy(spawnPoint);
        bot.position.x += (i - (bots.length - 1) / 2) * 2.4;
        bot.mesh.group.position.copy(bot.position);
        bot.waypoint = Math.floor(random() * WAYPOINTS.length);
        bot.seeTime = 0;
        bot.burstLeft = 0;
        bot.cooldown = 1 + random();
      }
    },
    step(dt, playerPos, shootables, onBotShot) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const sees = hasLineOfSight(bot, playerPos, shootables);
        bot.seeTime = sees ? bot.seeTime + dt : 0;

        if (sees) {
          // Face the player and fire bursts; aim error shrinks with seeTime.
          const dx = playerPos.x - bot.position.x;
          const dz = playerPos.z - bot.position.z;
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
              const error = Math.max(0.02, 0.11 - bot.seeTime * 0.03);
              const hit = random() > error * 4;
              onBotShot(bot, hit ? DAMAGE : 0);
            }
          }
        } else {
          // Wander: walk to the current waypoint, pick the next on arrival.
          const target = WAYPOINTS[bot.waypoint];
          const dx = target.x - bot.position.x;
          const dz = target.z - bot.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.6) {
            bot.waypoint = (bot.waypoint + 1 + Math.floor(random() * (WAYPOINTS.length - 1))) % WAYPOINTS.length;
          } else {
            const stepX = (dx / distance) * BOT_SPEED * dt;
            const stepZ = (dz / distance) * BOT_SPEED * dt;
            const next = bot.position.clone();
            next.x += stepX;
            if (!collides(next)) bot.position.x = next.x;
            next.x = bot.position.x;
            next.z += stepZ;
            if (!collides(next)) bot.position.z = next.z;
            bot.yaw = Math.atan2(dx, dz);
            bot.mesh.group.rotation.y = bot.yaw;
          }
          bot.mesh.group.position.copy(bot.position);
        }
        bot.mesh.group.position.copy(bot.position);
      }
    },
  };
}
