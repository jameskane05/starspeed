import * as THREE from "three";

const _tipWorld = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat = new THREE.Matrix4();
const _origin = new THREE.Vector3();

/**
 * Local axis from cone base toward tip for meshes exported like Blender's default cone,
 * after the usual "lay flat" rotation (-90° Y etc.) is baked into the object's world quat.
 * We intentionally do not strip a uniform -90° Y: it is part of the exported transform and
 * any per-spawn yaw is composed on top; removing it would assume a fixed mesh/export convention.
 */
const SPAWN_CONE_TIP_LOCAL = new THREE.Vector3(0, 1, 0);

/**
 * Ship/camera flies along local -Z; orient so -Z aligns with the spawn marker's tip direction.
 */
export function setCameraQuaternionFromSpawnMarker(outQuat, markerWorldQuaternion) {
  _tipWorld.copy(SPAWN_CONE_TIP_LOCAL).applyQuaternion(markerWorldQuaternion).normalize();
  if (_tipWorld.lengthSq() < 1e-10) {
    outQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-70 * Math.PI) / 180);
    return;
  }
  _up.set(0, 1, 0);
  if (Math.abs(_tipWorld.dot(_up)) > 0.985) {
    _up.set(0, 0, 1);
  }
  _mat.lookAt(_origin, _tipWorld, _up);
  outQuat.setFromRotationMatrix(_mat);
}

export function markerQuaternionToCameraQuaternion(markerWorldQuaternion) {
  const q = new THREE.Quaternion();
  setCameraQuaternionFromSpawnMarker(q, markerWorldQuaternion);
  return q;
}

export function applyAuthoredPlayerSpawn(game, index) {
  const n = game.playerSpawnPoints?.length ?? 0;
  if (n === 0) return false;
  const i = ((index % n) + n) % n;
  game.camera.position.copy(game.playerSpawnPoints[i]);
  const mq = game.playerSpawnMarkerQuaternions?.[i];
  if (mq) {
    setCameraQuaternionFromSpawnMarker(game.camera.quaternion, mq);
  } else {
    game.camera.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      (-70 * Math.PI) / 180,
    );
  }
  game.player?.velocity?.set(0, 0, 0);
  return true;
}
