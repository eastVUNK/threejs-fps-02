// EMBERLINE arsenal: three rifles, armor and a frag grenade.
// Every weapon is data: damage, fire rate, magazine, spread, recoil. The
// buy menu (game.js) spends round money on them; bots buy by tier.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  carbine: {
    id: 'carbine', name: 'VK-9 Carbine', price: 0,
    damage: 34, headMult: 2, fireInterval: 1 / 9, mag: 30, reserve: 90,
    reloadTime: 1.6, spreadBase: 0.004, recoil: 0.008,
  },
  longshot: {
    id: 'longshot', name: 'VK-47 Longshot', price: 1500,
    damage: 45, headMult: 2, fireInterval: 1 / 7, mag: 25, reserve: 75,
    reloadTime: 1.9, spreadBase: 0.003, recoil: 0.011,
  },
  marksman: {
    id: 'marksman', name: 'VK-77 Marksman', price: 2600,
    damage: 80, headMult: 2, fireInterval: 1 / 2.2, mag: 10, reserve: 30,
    reloadTime: 2.4, spreadBase: 0.0015, recoil: 0.02,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 50;
export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2;

// Bot damage scale: a bot burst of 3 carbine hits would delete the player
// at full damage, so bots deal a fraction of the weapon's damage per hit.
export const BOT_DAMAGE_SCALE = 0.35;

export function createWeapon(camera, def = WEAPONS.carbine) {
  const state = {
    def,
    mag: def.mag, reserve: def.reserve,
    reloading: false, cooldown: 0, reloadLeft: 0, bloom: 0,
  };

  const gun = new THREE.Group();
  gun.scale.setScalar(0.65);
  gun.rotation.y = -0.12;
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a453e'), roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), bodyMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), accentMat);
  grip.position.set(0, -0.14, 0.12);
  gun.add(body, barrel, grip);
  gun.position.set(0.34, -0.3, -0.62);
  camera.add(gun);

  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0.34, -0.28, -1.15);
  camera.add(flash);

  return {
    state,
    ready() {
      return state.cooldown <= 0 && !state.reloading && state.mag > 0;
    },
    spread(groundSpeed) {
      // Standing still and firing slowly: near the base spread. Sprinting
      // and spraying: up to ~0.03 rad, so stopping to aim pays.
      return state.def.spreadBase + groundSpeed * 0.0045 + state.bloom;
    },
    takeRound() {
      if (!this.ready()) return false;
      state.mag -= 1;
      state.cooldown = state.def.fireInterval;
      state.bloom = Math.min(0.028, state.bloom + 0.006);
      flashMat.opacity = 0.9;
      return true;
    },
    pullTrigger() {
      gun.position.z = -0.56;
    },
    reload() {
      if (state.reloading || state.mag === state.def.mag || state.reserve === 0) return;
      state.reloading = true;
      state.reloadLeft = state.def.reloadTime;
    },
    refill() {
      state.mag = state.def.mag;
      state.reserve = state.def.reserve;
      state.reloading = false;
      state.bloom = 0;
    },
    equip(def) {
      state.def = def;
      this.refill();
    },
    step(dt) {
      if (state.cooldown > 0) state.cooldown -= dt;
      state.bloom = Math.max(0, state.bloom - dt * 0.05);
      flashMat.opacity = Math.max(0, flashMat.opacity - dt * 9);
      gun.position.z += (-0.62 - gun.position.z) * Math.min(1, dt * 14);
      if (state.reloading) {
        state.reloadLeft -= dt;
        if (state.reloadLeft <= 0) {
          const need = state.def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
          state.reloading = false;
        }
      }
    },
  };
}
