import * as THREE from "three";

const playerGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
playerGeometry.rotateX(Math.PI / 2);

const enemyGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
enemyGeometry.rotateX(Math.PI / 2);

const playerLaserColor = 0x00ffff;
const playerLaserIntensity = 6.0;
const playerMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color(playerLaserColor).multiplyScalar(1.4 + playerLaserIntensity * 0.35),
  transparent: true,
  opacity: 1.0,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const enemyMaterial = new THREE.MeshBasicMaterial({
  color: 0xff8800,
  transparent: true,
  opacity: 1.0,
  depthWrite: false,
  depthTest: true,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const _forward = new THREE.Vector3(0, 0, 1);
const _tempVec = new THREE.Vector3();

export class Projectile {
  constructor(scene, position, direction, isPlayerOwned, speed = null, visual = null, splatLight = null) {
    this.scene = scene;
    this.direction = direction.clone();
    if (this.direction.lengthSq() > 0.0001) {
      this.direction.normalize();
    } else {
      this.direction.set(0, 0, -1);
    }
    this.speed = speed !== null ? speed : isPlayerOwned ? 200 : 15;
    this.isPlayerOwned = isPlayerOwned;
    this.lifetime = 3;
    this.disposed = false;
    this.spawnOrigin = position.clone();
    this.prevPosition = position.clone();
    this.splatLight = splatLight;

    const geometry = isPlayerOwned ? playerGeometry : enemyGeometry;
    let material = isPlayerOwned ? playerMaterial : enemyMaterial;
    if (!isPlayerOwned && visual?.color) {
      material = enemyMaterial.clone();
      const boost = Math.max(0, Math.min(10, visual.intensity ?? 1));
      const energy = 1.4 + boost * 0.35;
      material.color = new THREE.Color(visual.color).multiplyScalar(energy);
      material.opacity = Math.min(1, 0.82 + boost * 0.02);
      material.toneMapped = false;
    }

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.quaternion.setFromUnitVectors(_forward, this.direction);
    scene.add(this.mesh);

    if (this.splatLight) {
      this.splatLight.position.copy(position);
    }
  }

  update(delta) {
    this.lifetime -= delta;
    this.prevPosition.copy(this.mesh.position);
    _tempVec.copy(this.direction).multiplyScalar(this.speed * delta);
    this.mesh.position.add(_tempVec);
    if (this.splatLight) {
      this.splatLight.position.copy(this.mesh.position);
    }
  }

  dispose(scene) {
    if (this.disposed) return;
    this.disposed = true;
    if (this.splatLight && this.splatLight.parent) {
      this.splatLight.parent.remove(this.splatLight);
    }
    scene.remove(this.mesh);
  }
}
