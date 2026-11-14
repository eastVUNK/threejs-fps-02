// Frag grenade: a thrown projectile with a gravity arc, one floor bounce,
// a 1.6 s fuse, then an explosion — area damage with falloff and a flash
// that whites out the screen at close range. One reusable blast mesh and
// light; no objects are allocated per frame in step().
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FUSE = 1.6;
const BLAST_RADIUS = 6;
const BLAST_MAX_DAMAGE = 120;
const BLAST_MIN_DAMAGE = 20;

export function createGrenades(scene, colliders) {
  const active = [];
  const tmp = new THREE.Vector3();

  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  blastMesh.visible = false;
  scene.add(blastMesh);
  const blastLight = new THREE.PointLight(new THREE.Color('#ffb060'), 0, 18, 1.5);
  scene.add(blastLight);
  let blastLife = 0;

  function collides(pos, radius) {
    tmp.set(pos.x - radius, pos.y - radius, pos.z - radius);
    const max = new THREE.Vector3(pos.x + radius, pos.y + radius, pos.z + radius);
    const box = new THREE.Box3(tmp, max);
    for (let i = 0; i < colliders.length; i += 1) {
      if (box.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  return {
    active,
    throwGrenade(from, direction) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c1a18'), roughness: 0.4, metalness: 0.6 }),
      );
      mesh.position.copy(from);
      scene.add(mesh);
      active.push({
        mesh,
        velocity: direction.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4, 0)),
        fuse: FUSE,
      });
    },
    step(dt, onExplode) {
      if (blastLife > 0) {
        blastLife -= dt;
        const frac = Math.max(0, blastLife / 0.4);
        blastMesh.material.opacity = frac * 0.5;
        blastMesh.scale.setScalar(1 + (1 - frac) * BLAST_RADIUS);
        blastLight.intensity = frac * 60;
        if (blastLife <= 0) {
          blastMesh.visible = false;
          blastLight.intensity = 0;
        }
      }
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const grenade = active[i];
        grenade.fuse -= dt;
        grenade.velocity.y -= GRAVITY * dt;
        const next = grenade.mesh.position.clone().add(grenade.velocity.clone().multiplyScalar(dt));
        if (next.y <= 0.09) {
          next.y = 0.09;
          if (Math.abs(grenade.velocity.y) > 2) {
            grenade.velocity.y *= -0.35;
            grenade.velocity.x *= 0.6;
            grenade.velocity.z *= 0.6;
          } else {
            grenade.velocity.set(0, 0, 0);
          }
        } else if (collides(next, 0.09)) {
          grenade.velocity.multiplyScalar(-0.3);
          next.copy(grenade.mesh.position);
        }
        grenade.mesh.position.copy(next);
        if (grenade.fuse <= 0) {
          const pos = grenade.mesh.position.clone();
          scene.remove(grenade.mesh);
          active.splice(i, 1);
          blastMesh.position.copy(pos);
          blastMesh.visible = true;
          blastMesh.scale.setScalar(1);
          blastLife = 0.4;
          blastLight.position.copy(pos);
          blastLight.intensity = 60;
          onExplode(pos, BLAST_RADIUS, BLAST_MAX_DAMAGE, BLAST_MIN_DAMAGE);
        }
      }
    },
  };
}
