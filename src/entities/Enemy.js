import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { castSphere } from "../physics/Physics.js";

const _direction = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _lookMatrix = new THREE.Matrix4();
const _upVec = new THREE.Vector3(0, 1, 0);
const _newPos = new THREE.Vector3();
const _wanderDir = new THREE.Vector3();
const _toWaypoint = new THREE.Vector3();

let exteriorModel = null;
let loadPromise = null;
const _deadLights = [];

async function loadShipModels() {
  if (loadPromise) return loadPromise;
  if (exteriorModel) return;

  loadPromise = (async () => {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync("./Heavy_EXT_01.glb");
      exteriorModel = gltf.scene;
      console.log("Loaded exterior ship model for enemies");
    } catch (err) {
      console.warn("Failed to load Heavy_EXT_01.glb for enemies:", err);
    }
  })();

  return loadPromise;
}

export { loadShipModels };

function randomInBounds(center, size, margin = 0.7) {
  return new THREE.Vector3(
    center.x + (Math.random() - 0.5) * size.x * margin,
    center.y + (Math.random() - 0.5) * size.y * margin,
    center.z + (Math.random() - 0.5) * size.z * margin,
  );
}

function biasedWaypoint(currentPos, center, size, centroidBias = 0.35) {
  const raw = randomInBounds(center, size, 0.7);
  raw.lerp(center, centroidBias);
  // blend toward current position a bit for smoother paths
  raw.lerp(currentPos, 0.15);
  return raw;
}

export class Enemy {
  constructor(scene, position, level, bounds, options = {}) {
    this.level = level;
    this.health = 100;
    this.speed = 3 + Math.random() * 3;
    this.detectionRange = 50;
    this.fireRate = 2;
    this.fireCooldown = 0;
    this.collisionRadius = 3;
    this.disposed = false;

    // Level bounds for wander
    this.boundsCenter = bounds?.center?.clone() || position.clone();
    this.boundsSize = bounds?.size?.clone() || new THREE.Vector3(40, 20, 40);

    this.spawnPoint = position.clone();
    this.state = "wander";
    this.hasLOS = false;
    this.losCheckCounter = 0;
    this.glowColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6).getHex();

    // Wander state
    this.waypoint = biasedWaypoint(
      position,
      this.boundsCenter,
      this.boundsSize,
    );
    this.wanderCooldown = 0;
    this.wanderInterval = 4 + Math.random() * 4;
    this.velocity = new THREE.Vector3();
    this.steerStrength = 1.5 + Math.random() * 1.0;
    this.stuckTimer = 0;
    this.physicsFrame = Math.floor(Math.random() * 3);

    this.mesh = new THREE.Group();
    this.mesh.position.copy(position);

    if (exteriorModel) {
      const clone = exteriorModel.clone();
      clone.scale.setScalar(0.5);
      clone.rotation.set(0, Math.PI, 0);
      clone.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
        }
      });
      this.mesh.add(clone);

      if (options.enableLights !== false) {
        if (_deadLights.length > 0) {
          this.shipLight = _deadLights.pop();
          this.shipLight.intensity = 7;
        } else {
          this.shipLight = new THREE.PointLight(0xffffff, 7, 8, 1.5);
          scene.add(this.shipLight);
        }
        this.shipLight.position.copy(position);
        this.shipLight.position.y += 0.3;
        this.shipLight.position.z += 6;
      }
    } else {
      const fallbackGeo = new THREE.OctahedronGeometry(0.8, 0);
      const fallbackMat = new THREE.MeshStandardMaterial({
        color: 0xff3333,
        emissive: 0xff0000,
        emissiveIntensity: 0.3,
        metalness: 0.8,
        roughness: 0.2,
      });
      this.mesh.add(new THREE.Mesh(fallbackGeo, fallbackMat));
    }

    scene.add(this.mesh);
  }

  _pickNewWaypoint() {
    this.waypoint = biasedWaypoint(
      this.mesh.position,
      this.boundsCenter,
      this.boundsSize,
    );
    this.wanderInterval = 3 + Math.random() * 5;
    this.wanderCooldown = 0;
    this.stuckTimer = 0;
  }

  checkLOS(playerPos) {
    const dist = this.mesh.position.distanceTo(playerPos);
    if (dist < 0.1) return true;
    const hit = castSphere(
      this.mesh.position.x,
      this.mesh.position.y,
      this.mesh.position.z,
      playerPos.x,
      playerPos.y,
      playerPos.z,
      0.3,
    );
    return !hit || hit.toi >= dist - 0.5;
  }

  canMoveTo(from, to) {
    const hit = castSphere(
      from.x,
      from.y,
      from.z,
      to.x,
      to.y,
      to.z,
      this.collisionRadius,
    );
    return !hit;
  }

  update(delta, playerPos, fireCallback) {
    if (this.disposed) return;

    this.fireCooldown -= delta;

    const distToPlayerSq = this.mesh.position.distanceToSquared(playerPos);

    // Distance cull — hide mesh and skip AI/physics when far away
    const culled = distToPlayerSq > 10000; // 100m
    if (this.mesh.visible !== !culled) {
      this.mesh.visible = !culled;
      if (this.shipLight) this.shipLight.visible = !culled;
    }
    if (culled) return;

    this.physicsFrame++;

    // Medium distance (50-100m): render but freeze wandering enemies
    if (distToPlayerSq > 2500 && this.state === "wander") return;

    const detectionRangeSq = this.detectionRange * this.detectionRange;

    // Scale LOS check frequency by distance — nearby check often, far less
    const losInterval = distToPlayerSq < 400 ? 4 : distToPlayerSq < 1600 ? 8 : 16;
    this.losCheckCounter++;
    if (this.losCheckCounter >= losInterval) {
      this.losCheckCounter = 0;
      if (distToPlayerSq < detectionRangeSq) {
        this.hasLOS = this.checkLOS(playerPos);
      } else {
        this.hasLOS = false;
      }
    }

    if (this.hasLOS) {
      this.state = "attack";
    } else if (this.state === "attack" && distToPlayerSq >= detectionRangeSq) {
      this.state = "wander";
    }

    if (this.shipLight) {
      this.shipLight.position.copy(this.mesh.position);
      this.shipLight.position.y += 0.3;
    }

    if (this.state === "attack") {
      _direction.subVectors(playerPos, this.mesh.position).normalize();

      _lookMatrix.lookAt(this.mesh.position, playerPos, _upVec);
      _targetQuat.setFromRotationMatrix(_lookMatrix);
      this.mesh.quaternion.slerp(_targetQuat, delta * 2);

      if (distToPlayerSq > 64) {
        _newPos.copy(this.mesh.position);
        _newPos.x += _direction.x * this.speed * delta;
        _newPos.y += _direction.y * this.speed * delta;
        _newPos.z += _direction.z * this.speed * delta;
        if (this.canMoveTo(this.mesh.position, _newPos)) {
          this.mesh.position.copy(_newPos);
        }
      }

      if (this.hasLOS && this.fireCooldown <= 0 && distToPlayerSq < 625) {
        fireCallback(this.mesh.position, _direction);
        this.fireCooldown = 1 / this.fireRate;
      }
    } else {
      this._updateWander(delta);
    }
  }

  _updateWander(delta) {
    this.wanderCooldown += delta;

    _toWaypoint.subVectors(this.waypoint, this.mesh.position);
    const distToWaypoint = _toWaypoint.length();

    if (distToWaypoint < 3 || this.wanderCooldown >= this.wanderInterval) {
      this._pickNewWaypoint();
      _toWaypoint.subVectors(this.waypoint, this.mesh.position);
    }

    // Steering: desired direction toward waypoint
    _wanderDir.copy(_toWaypoint).normalize();

    // Blend velocity toward desired direction (smooth steering)
    this.velocity.lerp(_wanderDir, this.steerStrength * delta);
    this.velocity.normalize();

    const moveSpeed = this.speed * 0.4 * delta;
    _newPos.copy(this.mesh.position);
    _newPos.x += this.velocity.x * moveSpeed;
    _newPos.y += this.velocity.y * moveSpeed;
    _newPos.z += this.velocity.z * moveSpeed;

    // Throttle physics checks for wandering — only every 3rd frame
    if (this.physicsFrame % 3 === 0) {
      if (this.canMoveTo(this.mesh.position, _newPos)) {
        this.mesh.position.copy(_newPos);
        this.stuckTimer = 0;
      } else {
        this.stuckTimer += delta;
        if (this.stuckTimer > 1.0) {
          this._pickNewWaypoint();
        }
      }
    } else {
      this.mesh.position.copy(_newPos);
    }

    // Face movement direction
    if (this.velocity.lengthSq() > 0.001) {
      _newPos.copy(this.mesh.position).add(this.velocity);
      _lookMatrix.lookAt(this.mesh.position, _newPos, _upVec);
      _targetQuat.setFromRotationMatrix(_lookMatrix);
      this.mesh.quaternion.slerp(_targetQuat, delta * 3);
    }
  }

  takeDamage(amount) {
    this.health -= amount;
    this.state = "attack";
    this.hasLOS = true;
  }

  dispose(scene) {
    if (this.disposed) return;
    this.disposed = true;

    if (this.shipLight) {
      this.shipLight.intensity = 0;
      _deadLights.push(this.shipLight);
    }

    scene.remove(this.mesh);

    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}
