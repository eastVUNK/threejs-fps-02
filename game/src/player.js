// The player body: first-person movement with acceleration, crouching and
// axis-separated AABB collision against the world's Box3 colliders.
// Stopping to aim pays: spread (in weapon.js) reads groundSpeed().
// One reusable temp vector; nothing is allocated per step.
import * as THREE from 'three';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.38;
const HEIGHT = 1.7;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;

export function createPlayer(colliders, spawn) {
  const state = {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    health: 100,
    armor: 0,
    onGround: true,
  };
  const tmp = new THREE.Vector3();

  function collides(pos) {
    const min = tmp.set(pos.x - RADIUS, pos.y, pos.z - RADIUS);
    const max = new THREE.Vector3(pos.x + RADIUS, pos.y + HEIGHT, pos.z + RADIUS);
    const box = new THREE.Box3(min, max);
    for (let i = 0; i < colliders.length; i += 1) {
      if (box.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  function moveAxis(dx, dz) {
    const next = state.position.clone();
    next.x += dx;
    if (!collides(next)) state.position.x = next.x;
    next.x = state.position.x;
    next.z += dz;
    if (!collides(next)) state.position.z = next.z;
  }

  return {
    state,
    look(dx, dy) {
      state.yaw -= dx * 0.0022;
      state.pitch -= dy * 0.0022;
      const limit = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    recoil(pitchKick, yawKick) {
      state.pitch += pitchKick;
      state.yaw += yawKick;
      const limit = Math.PI / 2 - 0.01;
      state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    step(dt, keys) {
      state.crouched = keys.has('ControlLeft') || keys.has('ControlRight');
      const speed = state.crouched ? CROUCH_SPEED : WALK_SPEED;
      const targetEye = state.crouched ? EYE_CROUCH : EYE_STAND;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

      let forward = 0;
      let strafe = 0;
      if (keys.has('KeyW')) forward += 1;
      if (keys.has('KeyS')) forward -= 1;
      if (keys.has('KeyD')) strafe += 1;
      if (keys.has('KeyA')) strafe -= 1;
      const length = Math.hypot(forward, strafe) || 1;
      forward /= length;
      strafe /= length;

      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      const wishX = (-sin * forward + cos * strafe) * speed;
      const wishZ = (-cos * forward - sin * strafe) * speed;

      state.velocity.x += (wishX - state.velocity.x) * Math.min(1, (ACCEL / speed) * dt);
      state.velocity.z += (wishZ - state.velocity.z) * Math.min(1, (ACCEL / speed) * dt);
      moveAxis(state.velocity.x * dt, state.velocity.z * dt);

      // Jump: only from the ground, small hop, gravity pulls back down.
      if (keys.has('Space') && state.onGround) {
        state.velocity.y = 5.4;
        state.onGround = false;
      }
      if (!state.onGround) {
        state.velocity.y -= 14 * dt;
        state.position.y += state.velocity.y * dt;
        if (state.position.y <= 0) {
          state.position.y = 0;
          state.velocity.y = 0;
          state.onGround = true;
        }
      }
    },
    damage(amount) {
      // Armor absorbs half the damage while it lasts.
      let remaining = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, remaining * 0.5);
        state.armor -= absorbed;
        remaining -= absorbed;
      }
      state.health = Math.max(0, state.health - remaining);
      return state.health;
    },
    reset(spawnPoint) {
      state.position.copy(spawnPoint);
      state.velocity.set(0, 0, 0);
      state.yaw = 0;
      state.pitch = 0;
      state.health = 100;
      state.onGround = true;
    },
    setArmor(points) {
      state.armor = points;
    },
  };
}
