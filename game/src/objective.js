// The bomb objective. Two plant sites, A (west) and B (east), marked in the
// world with glowing pads and floating letters. The carrier (the player, or
// an Ember bot if the player dies) holds E near a site for 3 s to plant;
// the 40 s fuse then runs, and a Slate bot channels 5 s at the bomb to
// defuse. The state machine lives here; the visuals (pads, letters, bomb
// mesh with its blinking light) are built here too.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: new THREE.Vector3(-11, 0, -8),
  B: new THREE.Vector3(11, 0, -8),
};

function makeLetterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 1.6, 1);
  return sprite;
}

export function createObjective(scene) {
  const state = {
    status: 'carried', // carried | planting | planted | detonated | defused
    site: 'A',
    carrier: 'player', // 'player' | bot object | null
    plantProgress: 0,
    fuseLeft: 0,
    defuseProgress: 0,
    defuser: null,
  };

  const siteMeshes = {};
  for (const [name, pos] of Object.entries(SITES)) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.35, roughness: 0.6 }),
    );
    pad.position.set(pos.x, 0.04, pos.z);
    pad.receiveShadow = true;
    const letter = makeLetterSprite(name, '#ff7a1a');
    letter.position.set(pos.x, 3.2, pos.z);
    scene.add(pad, letter);
    siteMeshes[name] = { pad, letter };
  }

  const bomb = new THREE.Group();
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1a18'), roughness: 0.4, metalness: 0.6 }),
  );
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30') }),
  );
  bombLight.position.set(0.18, 0.18, 0);
  bomb.add(bombBody, bombLight);
  bomb.visible = false;
  scene.add(bomb);
  let blinkTime = 0;

  return {
    state,
    sitePosition(name) {
      return SITES[name];
    },
    targetSitePosition() {
      return SITES[state.site];
    },
    setTargetSite(name) {
      state.site = name;
      for (const [key, meshes] of Object.entries(siteMeshes)) {
        const active = key === name;
        meshes.pad.material.emissiveIntensity = active ? 0.9 : 0.25;
        meshes.letter.material.opacity = active ? 1 : 0.45;
      }
    },
    reset(targetSite) {
      state.status = 'carried';
      state.site = targetSite;
      state.carrier = 'player';
      state.plantProgress = 0;
      state.fuseLeft = 0;
      state.defuseProgress = 0;
      state.defuser = null;
      bomb.visible = false;
      this.setTargetSite(targetSite);
    },
    beginPlant() {
      if (state.status === 'carried') state.status = 'planting';
    },
    cancelPlant() {
      if (state.status === 'planting') {
        state.status = 'carried';
        state.plantProgress = 0;
      }
    },
    plant() {
      state.status = 'planted';
      state.plantProgress = 1;
      state.fuseLeft = 40;
      const pos = SITES[state.site];
      bomb.position.set(pos.x, 0.18, pos.z);
      bomb.visible = true;
    },
    beginDefuse(bot) {
      state.defuser = bot;
    },
    cancelDefuse() {
      state.defuser = null;
      state.defuseProgress = 0;
    },
    defuse() {
      state.status = 'defused';
      bomb.visible = false;
    },
    detonate() {
      state.status = 'detonated';
      bomb.visible = false;
    },
    step(dt) {
      if (state.status === 'planted') {
        state.fuseLeft -= dt;
        blinkTime += dt;
        bombLight.material.color.setHex(Math.floor(blinkTime * 4) % 2 === 0 ? 0xff3b30 : 0x550000);
      }
    },
  };
}
