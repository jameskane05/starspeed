import * as THREE from "three";
import { getRapier } from "../physics/Physics.js";

const RISE_SPEED = 0.3;
const RISE_AMPLITUDE = 0.5;
const ROT_SPEED = 0.15;

export class DynamicSceneElementManager {
  constructor(options = {}) {
    this.gameManager = options.gameManager || null;
    this.getGameTime = options.getGameTime || (() => 0);
  }

  setElements(elements) {
    this.elements = elements || [];
  }

  update() {
    if (!this.elements?.length) return;

    const RAPIER = getRapier();
    const t = this.getGameTime();
    const rise = Math.sin(t * RISE_SPEED) * RISE_AMPLITUDE;
    const rotY = t * ROT_SPEED;
    const qY = new RAPIER.Quaternion(0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2));

    const worldPos = new THREE.Vector3();
    for (const el of this.elements) {
      if (!el.body) continue;

      const base = el.basePos;
      worldPos.set(base.x, base.y + rise, base.z);

      el.body.setNextKinematicTranslation({ x: worldPos.x, y: worldPos.y, z: worldPos.z });
      el.body.setNextKinematicRotation(qY);

      el.mesh.position.copy(el.container.worldToLocal(worldPos));
      el.mesh.quaternion.copy(el.baseQuat).multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
      );
    }
  }

  destroy() {
    this.elements = [];
  }
}
