// The Ember rifle: a first-person view model, 30-round magazine, 90 reserve.
// Spread punishes firing on the move and firing fast: base spread, plus a
// term for ground speed, plus bloom that grows per shot and decays at rest.
// Fire rate 9/s, reload 1.6 s. Tracer is a fading line from muzzle to hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAG = 30;
const RESERVE = 90;
const FIRE_INTERVAL = 1 / 9;
const RELOAD_TIME = 1.6;

export function createWeapon(camera) {
  const state = { mag: MAG, reserve: RESERVE, reloading: false, cooldown: 0, reloadLeft: 0, bloom: 0 };
  let muzzleFlash = null;

  const gun = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23211e'), roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), bodyMat);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), bodyMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), accentMat);
  grip.position.set(0, -0.14, 0.12);
  gun.add(body, barrel, grip);
  gun.position.set(0.26, -0.24, -0.5);
  camera.add(gun);

  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), flashMat);
  flash.rotation.x = -Math.PI / 2;
  flash.position.set(0.26, -0.22, -1.0);
  camera.add(flash);
  muzzleFlash = flashMat;

  return {
    state,
    ready() {
      return state.cooldown <= 0 && !state.reloading && state.mag > 0;
    },
    spread(groundSpeed) {
      // Standing still and firing slowly: ~0.004 rad. Sprinting: ~0.03.
      return 0.004 + groundSpeed * 0.0045 + state.bloom;
    },
    takeRound() {
      if (!this.ready()) return false;
      state.mag -= 1;
      state.cooldown = FIRE_INTERVAL;
      state.bloom = Math.min(0.028, state.bloom + 0.006);
      muzzleFlash.opacity = 0.9;
      return true;
    },
    pullTrigger() {
      // View-model kick: tiny, recovers in step().
      gun.position.z = -0.44;
    },
    reload() {
      if (state.reloading || state.mag === MAG || state.reserve === 0) return;
      state.reloading = true;
      state.reloadLeft = RELOAD_TIME;
    },
    refill() {
      state.mag = MAG;
      state.reserve = RESERVE;
      state.reloading = false;
      state.bloom = 0;
    },
    step(dt) {
      if (state.cooldown > 0) state.cooldown -= dt;
      state.bloom = Math.max(0, state.bloom - dt * 0.05);
      muzzleFlash.opacity = Math.max(0, muzzleFlash.opacity - dt * 9);
      gun.position.z += (-0.5 - gun.position.z) * Math.min(1, dt * 14);
      if (state.reloading) {
        state.reloadLeft -= dt;
        if (state.reloadLeft <= 0) {
          const need = MAG - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
          state.reloading = false;
        }
      }
    },
  };
}
