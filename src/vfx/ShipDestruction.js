import * as THREE from "three";
import {
  DestructibleMesh,
  FractureOptions,
} from "@dgreenheck/three-pinata";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const fragmentCache = new Map();
const activeDebris = [];

const FRAGMENT_COUNT = 8;
const DEBRIS_LIFETIME = 2.5;
const EJECT_SPEED = 18;
const SPIN_SPEED = 8;
const DRAG_PER_SEC = 0.3;

const innerMaterial = new THREE.MeshStandardMaterial({
  color: 0x111111,
  emissive: 0xff4400,
  emissiveIntensity: 3.0,
  metalness: 0.9,
  roughness: 0.3,
});

export function prefractureModels(shipModels) {
  for (let i = 0; i < shipModels.length; i++) {
    try {
      prefractureModel(i, shipModels[i]);
    } catch (e) {
      console.warn(`Failed to pre-fracture model ${i}:`, e);
    }
  }
  console.log(`Pre-fractured ${fragmentCache.size}/${shipModels.length} ship models`);
}

function prefractureModel(index, model) {
  const geometries = [];
  let outerMat = null;

  model.updateMatrixWorld(true);
  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geo = child.geometry.clone();
    geo.applyMatrix4(child.matrixWorld);
    geometries.push(geo);
    if (!outerMat) {
      outerMat = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
    }
  });

  if (geometries.length === 0) return;

  const merged =
    geometries.length === 1
      ? geometries[0]
      : mergeGeometries(geometries, false);
  if (!merged) return;

  const destructible = new DestructibleMesh(
    merged,
    outerMat || new THREE.MeshStandardMaterial(),
    innerMaterial,
  );

  const options = new FractureOptions({
    fractureMethod: "voronoi",
    fragmentCount: FRAGMENT_COUNT,
    voronoiOptions: { mode: "3D" },
  });

  const fragments = destructible.fracture(options);

  fragmentCache.set(
    index,
    fragments.map((f) => ({
      geometry: f.geometry,
    })),
  );

  destructible.dispose();
  for (const g of geometries) g.dispose();
}

const _center = new THREE.Vector3();
const _ejectDir = new THREE.Vector3();

export function spawnDestruction(scene, position, quaternion, modelIndex, scale = 2.0) {
  const cached = fragmentCache.get(modelIndex);
  if (!cached || cached.length === 0) return;

  for (const frag of cached) {
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.5,
      roughness: 0.6,
      transparent: true,
    });
    const innerClone = innerMaterial.clone();
    innerClone.transparent = true;

    frag.geometry.computeBoundingBox();
    const bb = frag.geometry.boundingBox;
    _center.copy(bb.min).add(bb.max).multiplyScalar(0.5);

    _ejectDir.copy(_center);
    if (_ejectDir.lengthSq() < 0.001) {
      _ejectDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }
    _ejectDir.normalize();

    const offset = _center.clone().multiplyScalar(scale);
    offset.applyQuaternion(quaternion);

    const mesh = new THREE.Mesh(frag.geometry, [outerMat, innerClone]);
    mesh.position.copy(position).add(offset);
    mesh.quaternion.copy(quaternion);
    mesh.scale.setScalar(scale);
    scene.add(mesh);

    const vel = _ejectDir.clone().multiplyScalar(EJECT_SPEED);
    vel.applyQuaternion(quaternion);
    vel.x += (Math.random() - 0.5) * 4;
    vel.y += Math.random() * 3;
    vel.z += (Math.random() - 0.5) * 4;

    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * SPIN_SPEED,
      (Math.random() - 0.5) * SPIN_SPEED,
      (Math.random() - 0.5) * SPIN_SPEED,
    );

    activeDebris.push({
      mesh,
      velocity: vel,
      angularVelocity: angVel,
      life: DEBRIS_LIFETIME,
    });
  }
}

export function updateDestruction(delta) {
  for (let i = activeDebris.length - 1; i >= 0; i--) {
    const d = activeDebris[i];
    d.life -= delta;

    if (d.life <= 0) {
      d.mesh.parent?.remove(d.mesh);
      const mats = Array.isArray(d.mesh.material)
        ? d.mesh.material
        : [d.mesh.material];
      for (const m of mats) m.dispose();
      activeDebris.splice(i, 1);
      continue;
    }

    d.mesh.position.x += d.velocity.x * delta;
    d.mesh.position.y += d.velocity.y * delta;
    d.mesh.position.z += d.velocity.z * delta;

    d.mesh.rotation.x += d.angularVelocity.x * delta;
    d.mesh.rotation.y += d.angularVelocity.y * delta;
    d.mesh.rotation.z += d.angularVelocity.z * delta;

    const alpha = d.life / DEBRIS_LIFETIME;
    const mats = Array.isArray(d.mesh.material)
      ? d.mesh.material
      : [d.mesh.material];
    for (const m of mats) {
      m.opacity = alpha;
    }

    d.velocity.multiplyScalar(Math.pow(DRAG_PER_SEC, delta));
  }
}

export function cleanupDestruction(scene) {
  for (const d of activeDebris) {
    d.mesh.parent?.remove(d.mesh);
    const mats = Array.isArray(d.mesh.material)
      ? d.mesh.material
      : [d.mesh.material];
    for (const m of mats) m.dispose();
  }
  activeDebris.length = 0;
}
