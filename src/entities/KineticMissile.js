/**
 * KineticMissile.js - BOUNCING KINETIC PROJECTILE
 *
 * No homing. Flies straight, bounces off walls up to maxBounces, then explodes.
 * On hit (enemy or final wall) or after lifetime: AOE explosion + VFX (handled in gameCombat).
 */

import * as THREE from "three";

const _forward = new THREE.Vector3(0, 0, 1);
const _tempVec = new THREE.Vector3();

const missileGeometry = new THREE.CylinderGeometry(0.1, 0.06, 0.7, 8);
missileGeometry.rotateX(Math.PI / 2);

const missileMaterial = new THREE.MeshStandardMaterial({
  color: 0x4488ff,
  emissive: 0x4488ff,
  emissiveIntensity: 3,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  depthTest: true,
});

const trailGeometry = new THREE.CylinderGeometry(0.02, 0.05, 0.35, 6);
trailGeometry.rotateX(Math.PI / 2);
trailGeometry.translate(0, 0, 0.5);

const trailMaterial = new THREE.MeshStandardMaterial({
  color: 0x88aaff,
  emissive: 0x88aaff,
  emissiveIntensity: 4,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  depthTest: true,
});

export class KineticMissile {
  constructor(scene, position, direction, options = {}) {
    this.direction = direction.clone().normalize();
    this.speed = options.speed ?? 70;
    this.lifetime = 8;
    this.disposed = false;
    this.damage = options.damage ?? 95;
    this.explosionRadius = options.explosionRadius ?? 6;
    this.collisionRadius = 0.2;
    this.maxBounces = 4;
    this.bouncesLeft = this.maxBounces;
    this.isKinetic = true;

    this.trailsEffect = options.trailsEffect || null;
    this.spawnTimer = 0;
    this.spawnRate = 0.02;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.mesh = new THREE.Mesh(missileGeometry, missileMaterial);
    this.group.add(this.mesh);
    this.trail = new THREE.Mesh(trailGeometry, trailMaterial);
    this.group.add(this.trail);
    this.group.quaternion.setFromUnitVectors(_forward, this.direction);
    scene.add(this.group);
    this.scene = scene;
    this.prevPosition = position.clone();
  }

  update(delta, _targets = []) {
    this.lifetime -= delta;
    this.prevPosition.copy(this.group.position);
    _tempVec.copy(this.direction).multiplyScalar(this.speed * delta);
    this.group.position.add(_tempVec);
    this.trail.material.opacity = 0.6 + Math.random() * 0.25;
    if (this.trailsEffect) {
      this.spawnTimer += delta;
      while (this.spawnTimer >= this.spawnRate) {
        this.spawnTimer -= this.spawnRate;
        this.trailsEffect.emitMissileExhaust(
          this.group.position,
          this.group.quaternion,
          this.direction
        );
      }
    }
  }

  applyBounce(hitPos, normal) {
    const n = _tempVec.copy(normal).normalize();
    const dot = this.direction.dot(n);
    this.direction.sub(n.multiplyScalar(2 * dot));
    this.direction.normalize();
    this.group.quaternion.setFromUnitVectors(_forward, this.direction);
    this.group.position.copy(hitPos).addScaledVector(this.direction, 0.15);
    this.prevPosition.copy(this.group.position);
    this.bouncesLeft--;
  }

  getPosition() {
    return this.group.position;
  }

  dispose(scene) {
    if (this.disposed) return;
    this.disposed = true;
    scene.remove(this.group);
  }
}
