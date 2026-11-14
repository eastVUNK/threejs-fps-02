// EMBERLINE map: "Foundry Yard", an original industrial yard.
// A 32 x 24 m walled yard, two lanes split by a furnace block, crates for
// cover, a raised gantry at the north end. Every box is both a collider
// (axis-aligned Box3) and a surface bullets stop on. No textures, no models:
// plain geometry in the palette, lit by one warm key light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter walls (4.6 m high).
  box(32.4, 0.4, 24.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 24.4, -16.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 24.4, 16.2, 2.3, 0, 'surface');
  box(32.4, 4.6, 0.4, 0, 2.3, -12.2, 'surface');
  box(32.4, 4.6, 0.4, 0, 2.3, 12.2, 'surface');

  // Mid furnace block splits the yard into west and east lanes.
  box(2.0, 3.4, 2.0, 0, 1.7, -2.0, 'hairline');
  box(1.2, 1.2, 1.2, 0, 4.0, -2.0, 'accent');
  // Cover crates: crouch-height on both lanes, tall crates at the corners.
  box(3.4, 1.1, 1.2, -6.0, 0.55, -1.0, 'hairline');
  box(1.2, 1.1, 3.4, 6.0, 0.55, -1.0, 'hairline');
  box(1.6, 0.7, 1.6, -10.0, 0.35, -7.0, 'hairline');
  box(1.6, 0.7, 1.6, 10.0, 0.35, -7.0, 'hairline');
  box(2.4, 0.9, 1.2, -3.0, 0.45, 6.0, 'hairline');
  box(2.4, 0.9, 1.2, 3.0, 0.45, 6.0, 'hairline');
  box(1.4, 2.2, 1.4, -13.6, 1.1, 9.6, 'surface');
  box(1.4, 2.2, 1.4, 13.6, 1.1, 9.6, 'surface');
  // North gantry platform (walkable top at y = 0.5, low step).
  box(8.0, 0.5, 2.6, 0, 0.25, -10.4, 'surface');

  // Spawn markers: Ember (player) south, Slate (bots) north.
  const emberSpawn = new THREE.Vector3(0, 0, 9.5);
  const slateSpawn = new THREE.Vector3(0, 0, -9.5);

  // Light: warm key from the south-east, cool fill from the north, dusk sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a3128'), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.2);
  key.position.set(10, 15, 9);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 55;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.slate), 0.5);
  fill.position.set(-9, 10, -11);
  scene.add(fill);

  // Ember glow strip on the furnace block: the yard's landmark.
  const glow = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 12, 1.8);
  glow.position.set(0, 4.6, -2.0);
  scene.add(glow);

  return { colliders, shootables, group, emberSpawn, slateSpawn };
}
