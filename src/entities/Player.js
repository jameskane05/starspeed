/**
 * Player.js - LOCAL PLAYER SHIP AND COCKPIT
 * =============================================================================
 *
 * ROLE: First-person player ship: movement, look, roll, boost, health/missiles,
 * cockpit model and headlight. Physics-based movement and collision; engine trail
 * and gun retract visuals. Used in solo and as local ship in multiplayer.
 *
 * KEY RESPONSIBILITIES:
 * - update(delta, gameTime): apply input to velocity, drag, collision (level sphere cast)
 * - Boost fuel drain/regen; shield regen after damage; roll from input
 * - Cockpit GLTF, headlight toggle; engine trail and retract-on-fire
 * - takeDamage(amount), setXRMode(xrManager); prefracture for destruction (ShipDestruction)
 *
 * RELATED: Input.js, Physics.js, ShipDestruction.js, gameCombat.js, EngineTrail.
 *
 * =============================================================================
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { checkSphereCollision, castSphere } from "../physics/Physics.js";
import { prefracturePlayerShip } from "../vfx/ShipDestruction.js";
import { LipSyncManager } from "../ui/LipSyncManager.js";
import { VRMAvatarRenderer } from "../ui/VRMAvatarRenderer.js";
import {
  hologramVertexShader,
  hologramFragmentShader,
} from "../vfx/shaders/hologramShader.glsl.js";

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _pitchQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();
const _engineColorBlack = new THREE.Color(0x000000);
const _engineColorGlow = new THREE.Color(0xbbddff);
const _engineColorBoost = new THREE.Color(0xddffff);
const GUN_RETRACT_AMOUNT = 0.06;
const GUN_RETRACT_RECOVERY = 6;
const IDLE_BOB_SPEED = 0.6;
const IDLE_BOB_POS_AMP = 0.0005;
const IDLE_BOB_ANGLE_AMP = 0.00005;
const IDLE_VELOCITY_THRESHOLD = 0.08;

export class Player {
  constructor(camera, input, level, scene, options = {}) {
    this.camera = camera;
    this.input = input;
    this.level = level;
    this.scene = scene;
    this.game = options.game ?? null;
    this.xrManager = null;

    this.health = options.health || 100;
    this.maxHealth = options.maxHealth || 100;
    this.missiles = options.missiles || 6;
    this.maxMissiles = options.maxMissiles || 6;
    this.hasLaserUpgrade = false;

    this.lastDamageTime = 0;
    this.shieldRegenDelay = 5;
    this.shieldRegenRate = 15;

    this.boostFuel = 200;
    this.maxBoostFuel = 200;
    this.boostDrainRate = 20;
    this.boostRegenRate = 33;
    this.boostRegenDelay = 3;
    this.lastBoostTime = 0;
    this.boostMultiplier = 2.5;
    this.isBoosting = false;

    this.acceleration = options.acceleration || 0.75;
    this.maxSpeed = options.maxSpeed || 2.7;

    this.velocity = new THREE.Vector3();
    this.drag = 0.97;
    this.collisionRadius = 1.5;

    this.rollVelocity = 0;
    this.rollAccel = 6;
    this.rollMaxSpeed = 3;
    this.rollDrag = 0.96;

    this.pitchVelocity = 0;
    this.yawVelocity = 0;
    this.lookAccel = 0.1;
    this.lookMaxSpeed = 3.0;
    this.lookDrag = 0.93;

    this.fireFromLeft = true;
    this.missileFromLeft = true;

    this.gunL = null;
    this.gunR = null;
    this.missileL = null;
    this.missileR = null;
    this.gunRetractionL = 0;
    this.gunRetractionR = 0;
    this.engineMarkers = [];
    this.engineMaterials = [];
    this.exteriorRef = null;
    this.engineGlowT = 0;
    this.engineGlowTarget = 0;
    this.lipSyncManager = null;
    this.vrmAvatarRenderer = null;
    this.visemeHoloTime = 0;
    this.visemeHoloUniforms = null;

    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();

    this.headlight = new THREE.SpotLight(
      0xffffff,
      40,
      200,
      Math.PI / 4,
      0.5,
      1.5,
    );
    this.headlight.position.set(0, 0.5, -0.5);
    this.headlight.target.position.set(0, 0, -10);
    this.headlight.visible = true;
    this.headlightEnabled = true;
    this.camera.add(this.headlight);
    this.camera.add(this.headlight.target);

    this.loadCockpit(scene);
    this.loadExteriorRef();
  }

  loadExteriorRef() {
    const loader = new GLTFLoader();
    loader.load(
      "./Heavy_EXT_02.glb",
      (gltf) => {
        this.exteriorRef = gltf.scene;
        this.exteriorRef.visible = false;
        this.exteriorRef.position.set(0, 0, 0);
        this.exteriorRef.rotation.set(0, Math.PI, 0);
        this.exteriorRef.scale.setScalar(1);

        this.exteriorRef.traverse((child) => {
          const n = child.name;
          if (n === "Gun_L") {
            this.gunL = child;
            child.userData.restPosition = child.position.clone();
          } else if (n === "Gun_R") {
            this.gunR = child;
            child.userData.restPosition = child.position.clone();
          } else if (n === "Missile_L") this.missileL = child;
          else if (n === "Missile_R") this.missileR = child;
          if (n === "Engine_L" || n === "Engine_R")
            this.engineMarkers.push(child);
          if (n === "Engine_Center" || n === "Engine_L" || n === "Engine_R") {
            if (child.isMesh && child.material)
              this.engineMaterials.push(child.material);
            else if (child.children) {
              child.traverse((c) => {
                if (c.isMesh && c.material)
                  this.engineMaterials.push(c.material);
              });
            }
          }
        });
        if (!this.gunL || !this.gunR) {
          console.warn(
            "[Player] Ship model missing Gun_L and/or Gun_R; laser spawn using fallback offsets.",
          );
        }
        if (this.engineMarkers.length < 2) {
          console.warn(
            "[Player] Ship model missing Engine_L and/or Engine_R; boost trail VFX disabled.",
          );
        }
        if (this.engineMaterials.length === 0) {
          console.warn(
            "[Player] Ship model missing Engine_ meshes; engine glow disabled.",
          );
        }

        this.camera.add(this.exteriorRef);
        prefracturePlayerShip(this.exteriorRef);
        if (this.xrManager) this._reparentToRig();
      },
      undefined,
      (err) => console.error("Exterior ref load error:", err),
    );
  }

  loadCockpit(scene) {
    const loader = new GLTFLoader();
    loader.load(
      "./Heavy_INT_03.glb",
      (gltf) => {
        this.cockpit = gltf.scene;
        this.cockpit.scale.setScalar(1.0);

        // Debug: log bounds to find correct seat position
        const box = new THREE.Box3().setFromObject(this.cockpit);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        console.log("[Cockpit] Bounds min:", box.min, "max:", box.max);
        console.log("[Cockpit] Size:", size, "Center:", center);

        // Test: place cockpit directly in front of camera at -Z
        this.cockpit.position.set(0, 0, 5.35);
        this.cockpit.rotation.set(0, Math.PI, 0);
        console.log("[Cockpit] Test position: (0, 0, -5), no rotation");

        // Log all meshes and make canopy/glass transparent
        this.cockpit.traverse((child) => {
          if (child.isMesh) {
            console.log(
              "[Cockpit] Mesh:",
              child.name,
              "visible:",
              child.visible,
              "material:",
              child.material?.type,
            );
          }
        });

        const cockpitLight = new THREE.PointLight(0x88aaff, 1, 5);
        cockpitLight.position.set(0, 0.2, 0);
        this.cockpit.add(cockpitLight);

        let screenRMesh = null;
        this.cockpit.traverse((child) => {
          if (child.name === "Screen_R") {
            screenRMesh = child.isMesh
              ? child
              : (child.children?.find((c) => c.isMesh) ?? null);
          }
        });
        if (screenRMesh) {
          const uniforms = {
            uTexture: { value: null },
            uTime: { value: 0 },
            uHoloColor: { value: new THREE.Vector3(0.0, 0.85, 0.95) },
            uScanLineIntensity: { value: 0.4 },
            uAlpha: { value: 1.0 },
            uUvOffset: { value: new THREE.Vector2(0, 0) },
            uUvRepeat: { value: new THREE.Vector2(1, 1) },
          };
          const mat = new THREE.ShaderMaterial({
            vertexShader: hologramVertexShader,
            fragmentShader: hologramFragmentShader,
            uniforms,
            transparent: true,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide,
          });
          const visemeGeom = screenRMesh.geometry.clone();
          const pos = visemeGeom.attributes.position;
          const count = pos.count;
          let xMin = Infinity,
            xMax = -Infinity,
            yMin = Infinity,
            yMax = -Infinity,
            zMin = Infinity,
            zMax = -Infinity;
          for (let i = 0; i < count; i++) {
            const x = pos.getX(i),
              y = pos.getY(i),
              z = pos.getZ(i);
            xMin = Math.min(xMin, x);
            xMax = Math.max(xMax, x);
            yMin = Math.min(yMin, y);
            yMax = Math.max(yMax, y);
            zMin = Math.min(zMin, z);
            zMax = Math.max(zMax, z);
          }
          const xSpan = xMax - xMin,
            ySpan = yMax - yMin,
            zSpan = zMax - zMin;
          const uAxis =
            xSpan >= ySpan && xSpan >= zSpan ? "x" : ySpan >= zSpan ? "y" : "z";
          const vAxis =
            uAxis === "x"
              ? ySpan >= zSpan
                ? "y"
                : "z"
              : uAxis === "y"
                ? xSpan >= zSpan
                  ? "x"
                  : "z"
                : xSpan >= ySpan
                  ? "x"
                  : "y";
          const uvs = new Float32Array(count * 2);
          let uMin = Infinity,
            uMax = -Infinity,
            vMin = Infinity,
            vMax = -Infinity;
          for (let i = 0; i < count; i++) {
            const uVal =
              uAxis === "x"
                ? pos.getX(i)
                : uAxis === "y"
                  ? pos.getY(i)
                  : pos.getZ(i);
            const vVal =
              vAxis === "x"
                ? pos.getX(i)
                : vAxis === "y"
                  ? pos.getY(i)
                  : pos.getZ(i);
            uMin = Math.min(uMin, uVal);
            uMax = Math.max(uMax, uVal);
            vMin = Math.min(vMin, vVal);
            vMax = Math.max(vMax, vVal);
          }
          const uSpan = uMax - uMin || 1,
            vSpan = vMax - vMin || 1;
          for (let i = 0; i < count; i++) {
            const uVal =
              uAxis === "x"
                ? pos.getX(i)
                : uAxis === "y"
                  ? pos.getY(i)
                  : pos.getZ(i);
            const vVal =
              vAxis === "x"
                ? pos.getX(i)
                : vAxis === "y"
                  ? pos.getY(i)
                  : pos.getZ(i);
            uvs[i * 2] = (uVal - uMin) / uSpan;
            uvs[i * 2 + 1] = (vVal - vMin) / vSpan;
          }
          for (let i = 0; i < count; i++) {
            uvs[i * 2 + 1] = 0.2 + 0.6 * uvs[i * 2 + 1];
          }
          visemeGeom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
          const visemeMesh = new THREE.Mesh(visemeGeom, mat);
          visemeMesh.position.set(0, 0.002, 0.01);
          visemeMesh.renderOrder = 9010;
          screenRMesh.add(visemeMesh);
          this.visemeHoloUniforms = uniforms;

          const vrmRenderer = new VRMAvatarRenderer({
            vrmUrl: "./model_original_1773065783.vrm",
          });
          uniforms.uTexture.value = vrmRenderer.getTexture();
          vrmRenderer
            .loadVRM()
            .then(() => {
              this.vrmAvatarRenderer = vrmRenderer;
              uniforms.uTexture.value = vrmRenderer.getTexture();
              uniforms.uUvRepeat.value.set(1, 1);
              uniforms.uUvOffset.value.set(0, 0);
              if (!this.game?.gameManager) return;
              import("../ui/DialogManager.js").then(({ DialogManager }) => {
                const dm = new DialogManager({
                  gameManager: this.game.gameManager,
                  vrmAvatarRenderer: vrmRenderer,
                  captionParent: this.camera,
                });
                dm.initialize().then(() => {
                  this.game.dialogManager = dm;
                });
              });
            })
            .catch((err) => {
              console.warn("[Cockpit] VRM load failed, using 2D viseme:", err);
              const margin = 0.02;
              const cellSize = 1 / 4;
              const displaySize = cellSize * (1 - margin * 2);
              const texLoader = new THREE.TextureLoader();
              texLoader.load(
                "./textures/ComfyUI_00429_.png",
                (texture) => {
                  uniforms.uTexture.value = texture;
                  uniforms.uUvOffset.value.set(
                    cellSize * margin,
                    3 / 4 + cellSize * margin,
                  );
                  uniforms.uUvRepeat.value.set(displaySize, displaySize);
                  for (let i = 0; i < count; i++) {
                    const uVal =
                      uAxis === "x"
                        ? pos.getX(i)
                        : uAxis === "y"
                          ? pos.getY(i)
                          : pos.getZ(i);
                    const vVal =
                      vAxis === "x"
                        ? pos.getX(i)
                        : vAxis === "y"
                          ? pos.getY(i)
                          : pos.getZ(i);
                    const u = (uVal - uMin) / uSpan,
                      v = (vVal - vMin) / vSpan;
                    uvs[i * 2] = 0.125 + v * 0.75;
                    uvs[i * 2 + 1] = u;
                  }
                  visemeGeom.attributes.uv.needsUpdate = true;
                  this.lipSyncManager = new LipSyncManager({
                    onFrameChange: (frameIndex, uv) => {
                      uniforms.uUvOffset.value.set(uv.u, uv.v);
                      uniforms.uUvRepeat.value.set(uv.uSize, uv.vSize);
                    },
                  });
                  const setVisemeFrame = (frameIndex) => {
                    const uv = this.lipSyncManager.getUV(frameIndex);
                    uniforms.uUvOffset.value.set(uv.u, uv.v);
                    uniforms.uUvRepeat.value.set(uv.uSize, uv.vSize);
                  };
                  setVisemeFrame(this.lipSyncManager.visemeFrames.silence);
                  this.lipSyncManager.initialize().then(async () => {
                    if (!this.game?.gameManager) return;
                    const { DialogManager } =
                      await import("../ui/DialogManager.js");
                    const dm = new DialogManager({
                      gameManager: this.game.gameManager,
                      lipSyncManager: this.lipSyncManager,
                      captionParent: this.camera,
                    });
                    await dm.initialize();
                    this.game.dialogManager = dm;
                  });
                },
                undefined,
                (e) =>
                  console.warn("[Cockpit] 2D viseme texture load failed:", e),
              );
            });
        }

        this.camera.add(this.cockpit);
        console.log("Cockpit loaded");

        if (this.xrManager) {
          this._reparentToRig();
        }
      },
      undefined,
      (err) => console.error("Cockpit load error:", err),
    );
  }

  setXRMode(xrManager) {
    if (this.xrManager) {
      this.xrManager.onSessionEnd = null;
    }
    this.xrManager = xrManager;
    if (xrManager) {
      xrManager.onSessionEnd = () => this._restoreCockpitFromXR();
      this._reparentToRig();
    }
  }

  _restoreCockpitFromXR() {
    if (!this.xrManager) return;
    const rig = this.xrManager.rig;
    if (this.cockpit && this.cockpit.parent === rig) {
      rig.remove(this.cockpit);
      this.cockpit.scale.setScalar(1.0);
      this.cockpit.position.set(0, 0, 5.35);
      this.camera.add(this.cockpit);
    }
    if (this.exteriorRef && this.exteriorRef.parent === rig) {
      rig.remove(this.exteriorRef);
      this.exteriorRef.position.set(0, 0, 0);
      this.camera.add(this.exteriorRef);
    }
  }

  _reparentToRig() {
    if (!this.xrManager) return;
    const rig = this.xrManager.rig;

    if (this.cockpit && this.cockpit.parent === this.camera) {
      this.camera.remove(this.cockpit);
      this.cockpit.scale.setScalar(1.5);
      this.cockpit.position.set(0, 0.8, 8.25);
      rig.add(this.cockpit);
    }
    if (this.exteriorRef && this.exteriorRef.parent === this.camera) {
      this.camera.remove(this.exteriorRef);
      rig.add(this.exteriorRef);
    }
    if (this.headlight && this.headlight.parent === this.camera) {
      this.camera.remove(this.headlight);
      this.camera.remove(this.headlight.target);
      rig.add(this.headlight);
      rig.add(this.headlight.target);
    }
  }

  updateXR(delta, elapsedTime) {
    const xr = this.xrManager;
    const rig = xr.rig;

    _right.set(1, 0, 0).applyQuaternion(rig.quaternion);
    _up.set(0, 1, 0).applyQuaternion(rig.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(rig.quaternion);

    const lookSens = (window.gameManager?.getLookSensitivity?.() ?? 0.8) / 0.8;
    const lookSpeed = 1.2 * lookSens;
    if (Math.abs(xr.lookInput.x) > 0.02 || Math.abs(xr.lookInput.y) > 0.02) {
      _yawQuat.setFromAxisAngle(_up, xr.lookInput.x * lookSpeed * delta);
      _pitchQuat.setFromAxisAngle(_right, xr.lookInput.y * lookSpeed * delta);

      rig.quaternion.premultiply(_pitchQuat);
      rig.quaternion.premultiply(_yawQuat);
      rig.quaternion.normalize();
    }

    // Left hand transient-pointer: thrust (Y) + strafe (X)
    _accel.set(0, 0, 0);
    if (Math.abs(xr.moveInput.y) > 0.05) {
      _accel.addScaledVector(_forward, xr.moveInput.y);
    }
    if (Math.abs(xr.moveInput.x) > 0.05) {
      _accel.addScaledVector(_right, xr.moveInput.x);
    }

    if (_accel.lengthSq() > 0) {
      _accel.normalize().multiplyScalar(this.acceleration * delta);
      this.velocity.add(_accel);
    }

    if (this.velocity.lengthSq() > this.maxSpeed * this.maxSpeed) {
      this.velocity.normalize().multiplyScalar(this.maxSpeed);
    }
    this.velocity.multiplyScalar(this.drag);

    // Collision detection against rig position
    const pos = rig.position;
    const vel = this.velocity;

    const hit = castSphere(
      pos.x,
      pos.y,
      pos.z,
      pos.x + vel.x,
      pos.y + vel.y,
      pos.z + vel.z,
      this.collisionRadius,
    );

    if (!hit) {
      rig.position.add(vel);
    } else {
      const hitX = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x + vel.x,
        pos.y,
        pos.z,
        this.collisionRadius,
      );
      const hitY = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x,
        pos.y + vel.y,
        pos.z,
        this.collisionRadius,
      );
      const hitZ = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x,
        pos.y,
        pos.z + vel.z,
        this.collisionRadius,
      );

      if (!hitX) rig.position.x += vel.x;
      else this.velocity.x = 0;
      if (!hitY) rig.position.y += vel.y;
      else this.velocity.y = 0;
      if (!hitZ) rig.position.z += vel.z;
      else this.velocity.z = 0;
    }

    const speed = this.velocity.length();
    const idle = Math.max(0, 1 - speed / IDLE_VELOCITY_THRESHOLD);
    if (idle > 0) {
      const t = elapsedTime;
      _up.set(0, 1, 0).applyQuaternion(rig.quaternion);
      _right.set(1, 0, 0).applyQuaternion(rig.quaternion);
      _forward.set(0, 0, -1).applyQuaternion(rig.quaternion);
      rig.position.addScaledVector(
        _up,
        Math.sin(t * IDLE_BOB_SPEED) * IDLE_BOB_POS_AMP * idle,
      );
      rig.position.addScaledVector(
        _right,
        Math.sin(t * IDLE_BOB_SPEED * 0.73 + 1) *
          IDLE_BOB_POS_AMP *
          0.75 *
          idle,
      );
      rig.position.addScaledVector(
        _forward,
        Math.sin(t * IDLE_BOB_SPEED * 0.5 + 2) * IDLE_BOB_POS_AMP * 0.5 * idle,
      );
      _pitchQuat.setFromAxisAngle(
        _right,
        Math.sin(t * 0.42) * IDLE_BOB_ANGLE_AMP * idle,
      );
      _yawQuat.setFromAxisAngle(
        _up,
        Math.sin(t * 0.38 + 0.5) * IDLE_BOB_ANGLE_AMP * idle,
      );
      rig.quaternion.premultiply(_yawQuat).premultiply(_pitchQuat).normalize();
    }

    if (this.engineMaterials.length > 0) {
      this.engineGlowTarget = this.isBoosting
        ? 1
        : Math.min(1, this.velocity.length() / this.maxSpeed);
      this.engineGlowT +=
        (this.engineGlowTarget - this.engineGlowT) * Math.min(1, delta * 4);
      const boostGlow = this.isBoosting ? 1 : 0;
      for (const mat of this.engineMaterials) {
        if (!mat.color || !mat.emissive) continue;
        mat.color.lerpColors(
          _engineColorBlack,
          boostGlow > 0 ? _engineColorBoost : _engineColorGlow,
          this.engineGlowT,
        );
        mat.emissive.lerpColors(
          _engineColorBlack,
          boostGlow > 0 ? _engineColorBoost : _engineColorGlow,
          this.engineGlowT,
        );
        mat.emissiveIntensity =
          boostGlow > 0 ? 2.2 : 0.05 + 0.25 * this.engineGlowT;
      }
    }

    const gunRecover = 1 - Math.exp(-GUN_RETRACT_RECOVERY * delta);
    if (this.gunL?.userData.restPosition) {
      this.gunRetractionL = Math.max(
        0,
        this.gunRetractionL - this.gunRetractionL * gunRecover,
      );
      this.gunL.position.copy(this.gunL.userData.restPosition);
      this.gunL.position.z -= this.gunRetractionL;
    }
    if (this.gunR?.userData.restPosition) {
      this.gunRetractionR = Math.max(
        0,
        this.gunRetractionR - this.gunRetractionR * gunRecover,
      );
      this.gunR.position.copy(this.gunR.userData.restPosition);
      this.gunR.position.z -= this.gunRetractionR;
    }
    if (this.vrmAvatarRenderer && this.game?.renderer) {
      this.vrmAvatarRenderer.update(this.game.renderer, delta);
    } else {
      this.lipSyncManager?.updateAnalysis();
    }
    if (this.visemeHoloUniforms?.uTime) {
      this.visemeHoloTime += delta;
      this.visemeHoloUniforms.uTime.value = this.visemeHoloTime;
    }
  }

  triggerGunRecoil(fromLeft) {
    if (fromLeft && this.gunL) this.gunRetractionL = GUN_RETRACT_AMOUNT;
    else if (!fromLeft && this.gunR) this.gunRetractionR = GUN_RETRACT_AMOUNT;
  }

  getWeaponSpawnPoint() {
    if (this.gunL && this.gunR) {
      const gun = this.fireFromLeft ? this.gunL : this.gunR;
      this.fireFromLeft = !this.fireFromLeft;
      const out = new THREE.Vector3();
      gun.getWorldPosition(out);
      return out;
    }
    const pos = this.xrManager
      ? this.xrManager.rig.position
      : this.camera.position;
    const quat = this.xrManager
      ? this.xrManager.rig.quaternion
      : this.camera.quaternion;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(quat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const sideOffset = this.fireFromLeft ? -0.4 : 0.4;
    this.fireFromLeft = !this.fireFromLeft;
    return pos
      .clone()
      .add(right.multiplyScalar(sideOffset))
      .add(down.multiplyScalar(0.3))
      .add(forward.multiplyScalar(0.5));
  }

  getMissileSpawnPoint() {
    if (this.missileL && this.missileR) {
      const launcher = this.missileFromLeft ? this.missileL : this.missileR;
      this.missileFromLeft = !this.missileFromLeft;
      const out = new THREE.Vector3();
      launcher.getWorldPosition(out);
      return out;
    }
    const pos = this.xrManager
      ? this.xrManager.rig.position
      : this.camera.position;
    const quat = this.xrManager
      ? this.xrManager.rig.quaternion
      : this.camera.quaternion;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(quat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const sideOffset = this.missileFromLeft ? -0.5 : 0.5;
    this.missileFromLeft = !this.missileFromLeft;
    return pos
      .clone()
      .add(right.multiplyScalar(sideOffset))
      .add(down.multiplyScalar(0.35))
      .add(forward.multiplyScalar(0.4));
  }

  update(delta, elapsedTime = 0) {
    if (this.xrManager) {
      this.updateXR(delta, elapsedTime);
      return;
    }
    if (this.vrmAvatarRenderer && this.game?.renderer) {
      this.vrmAvatarRenderer.update(this.game.renderer, delta);
    } else {
      this.lipSyncManager?.updateAnalysis();
    }
    if (this.visemeHoloUniforms?.uTime) {
      this.visemeHoloTime += delta;
      this.visemeHoloUniforms.uTime.value = this.visemeHoloTime;
    }

    const keys = this.input.keys;
    const gp = this.input.gamepad;
    const useGamepad = this.input.isGamepadMode();
    const mouse = this.input.consumeMouse();

    // Toggle headlight (intensity only - avoid visible toggle which triggers recompilation)
    if (keys.toggleHeadlightJustPressed) {
      this.headlightEnabled = !this.headlightEnabled;
      const headlightIntensity = 40;
      if (this.headlight) {
        this.headlight.intensity = this.headlightEnabled
          ? headlightIntensity
          : 0;
      }
      keys.toggleHeadlightJustPressed = false;
    }

    const controlDelta = Math.min(delta, 0.05);
    const lookSens = (window.gameManager?.getLookSensitivity?.() ?? 0.8) / 0.8;

    _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

    if (useGamepad) {
      const gpLookSpeed = 4.0 * lookSens;
      this.pitchVelocity += -gp.lookY * gpLookSpeed * controlDelta;
      this.yawVelocity += -gp.lookX * gpLookSpeed * controlDelta;
    } else {
      this.pitchVelocity += -mouse.y * this.lookAccel * lookSens;
      this.yawVelocity += -mouse.x * this.lookAccel * lookSens;

      const keyLookSpeed = 3.0 * lookSens;
      if (keys.lookUp) this.pitchVelocity += keyLookSpeed * controlDelta;
      if (keys.lookDown) this.pitchVelocity -= keyLookSpeed * controlDelta;
      if (keys.lookLeft) this.yawVelocity += keyLookSpeed * controlDelta;
      if (keys.lookRight) this.yawVelocity -= keyLookSpeed * controlDelta;
    }

    if (Math.abs(this.pitchVelocity) > this.lookMaxSpeed) {
      this.pitchVelocity = Math.sign(this.pitchVelocity) * this.lookMaxSpeed;
    }
    if (Math.abs(this.yawVelocity) > this.lookMaxSpeed) {
      this.yawVelocity = Math.sign(this.yawVelocity) * this.lookMaxSpeed;
    }

    this.pitchVelocity *= Math.pow(this.lookDrag, delta * 60);
    this.yawVelocity *= Math.pow(this.lookDrag, delta * 60);

    _yawQuat.setFromAxisAngle(_up, this.yawVelocity * controlDelta);
    this.camera.quaternion.premultiply(_yawQuat);

    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const maxPitch = Math.PI / 2 - 1e-4;
    let pitchDelta = this.pitchVelocity * controlDelta;
    const pitchNow = Math.asin(THREE.MathUtils.clamp(-_forward.y, -1, 1));
    const pitchAfter = THREE.MathUtils.clamp(
      pitchNow + pitchDelta,
      -maxPitch,
      maxPitch,
    );
    pitchDelta = pitchAfter - pitchNow;
    _pitchQuat.setFromAxisAngle(_right, pitchDelta);
    this.camera.quaternion.premultiply(_pitchQuat);

    let rollInput = 0;
    if (useGamepad) {
      if (gp.rollAnalog && Math.abs(gp.rollAnalog) > 0.1) {
        rollInput = gp.rollAnalog * this.rollAccel * controlDelta;
      } else {
        if (gp.rollLeft) rollInput -= this.rollAccel * controlDelta;
        if (gp.rollRight) rollInput += this.rollAccel * controlDelta;
      }
    } else {
      if (keys.rollLeft) rollInput -= this.rollAccel * controlDelta;
      if (keys.rollRight) rollInput += this.rollAccel * controlDelta;
    }

    this.rollVelocity += rollInput;
    if (Math.abs(this.rollVelocity) > this.rollMaxSpeed) {
      this.rollVelocity = Math.sign(this.rollVelocity) * this.rollMaxSpeed;
    }
    const hasRollInput =
      rollInput !== 0 ||
      (useGamepad && gp.rollAnalog && Math.abs(gp.rollAnalog) > 0.1);
    const rollDamp = hasRollInput
      ? Math.pow(this.rollDrag, delta * 60)
      : Math.pow(this.rollDrag, delta * 60) * Math.pow(0.92, delta * 60);
    this.rollVelocity *= rollDamp;

    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _rollQuat.setFromAxisAngle(_forward, this.rollVelocity * controlDelta);
    this.camera.quaternion.premultiply(_rollQuat);
    this.camera.quaternion.normalize();

    _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);

    // Movement
    _accel.set(0, 0, 0);

    if (useGamepad) {
      // Gamepad movement (left stick + d-pad for vertical)
      if (gp.moveY < -0.1)
        _accel.add(_forward.clone().multiplyScalar(-gp.moveY));
      if (gp.moveY > 0.1) _accel.sub(_forward.clone().multiplyScalar(gp.moveY));
      if (gp.moveX > 0.1) _accel.add(_right.clone().multiplyScalar(gp.moveX));
      if (gp.moveX < -0.1) _accel.sub(_right.clone().multiplyScalar(-gp.moveX));
      if (gp.strafeUp) _accel.add(_up);
      if (gp.strafeDown) _accel.sub(_up);
    } else {
      // Keyboard movement
      if (keys.forward) _accel.add(_forward);
      if (keys.backward) _accel.sub(_forward);
      if (keys.right) _accel.add(_right);
      if (keys.left) _accel.sub(_right);
      if (keys.strafeUp) _accel.add(_up);
      if (keys.strafeDown) _accel.sub(_up);
    }

    // Boost logic
    const wantsBoost = useGamepad ? gp.boost : keys.boost;
    if (wantsBoost && this.boostFuel > 0 && _accel.lengthSq() > 0) {
      this.isBoosting = true;
      this.boostFuel = Math.max(
        0,
        this.boostFuel - this.boostDrainRate * delta,
      );
      this.lastBoostTime = elapsedTime;
    } else {
      this.isBoosting = false;
      // Regenerate boost fuel after delay
      if (elapsedTime - this.lastBoostTime >= this.boostRegenDelay) {
        this.boostFuel = Math.min(
          this.maxBoostFuel,
          this.boostFuel + this.boostRegenRate * delta,
        );
      }
    }

    if (_accel.lengthSq() > 0) {
      let accelMod = this.acceleration;
      if (this.isBoosting) {
        accelMod *= this.boostMultiplier;
      }
      _accel.normalize().multiplyScalar(accelMod * delta);
      this.velocity.add(_accel);
    }

    if (this.velocity.lengthSq() > this.maxSpeed * this.maxSpeed) {
      this.velocity.normalize().multiplyScalar(this.maxSpeed);
    }

    this.velocity.multiplyScalar(this.drag);

    // Collision detection with Rapier
    const pos = this.camera.position;
    const vel = this.velocity;

    // Try full movement
    const hit = castSphere(
      pos.x,
      pos.y,
      pos.z,
      pos.x + vel.x,
      pos.y + vel.y,
      pos.z + vel.z,
      this.collisionRadius,
    );

    if (!hit) {
      this.camera.position.add(vel);
    } else {
      // Slide along walls - try each axis
      const hitX = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x + vel.x,
        pos.y,
        pos.z,
        this.collisionRadius,
      );
      const hitY = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x,
        pos.y + vel.y,
        pos.z,
        this.collisionRadius,
      );
      const hitZ = castSphere(
        pos.x,
        pos.y,
        pos.z,
        pos.x,
        pos.y,
        pos.z + vel.z,
        this.collisionRadius,
      );

      if (!hitX) {
        this.camera.position.x += vel.x;
      } else {
        this.velocity.x = 0;
      }

      if (!hitY) {
        this.camera.position.y += vel.y;
      } else {
        this.velocity.y = 0;
      }

      if (!hitZ) {
        this.camera.position.z += vel.z;
      } else {
        this.velocity.z = 0;
      }
    }

    const speed = this.velocity.length();
    const idle = Math.max(0, 1 - speed / IDLE_VELOCITY_THRESHOLD);
    if (idle > 0) {
      const t = elapsedTime;
      _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(
        _up,
        Math.sin(t * IDLE_BOB_SPEED) * IDLE_BOB_POS_AMP * idle,
      );
      this.camera.position.addScaledVector(
        _right,
        Math.sin(t * IDLE_BOB_SPEED * 0.73 + 1) *
          IDLE_BOB_POS_AMP *
          0.75 *
          idle,
      );
      this.camera.position.addScaledVector(
        _forward,
        Math.sin(t * IDLE_BOB_SPEED * 0.5 + 2) * IDLE_BOB_POS_AMP * 0.5 * idle,
      );
      _pitchQuat.setFromAxisAngle(
        _right,
        Math.sin(t * 0.42) * IDLE_BOB_ANGLE_AMP * idle,
      );
      _yawQuat.setFromAxisAngle(
        _up,
        Math.sin(t * 0.38 + 0.5) * IDLE_BOB_ANGLE_AMP * idle,
      );
      this.camera.quaternion
        .premultiply(_yawQuat)
        .premultiply(_pitchQuat)
        .normalize();
    }

    if (this.engineMaterials.length > 0) {
      this.engineGlowTarget = this.isBoosting
        ? 1
        : Math.min(1, this.velocity.length() / this.maxSpeed);
      this.engineGlowT +=
        (this.engineGlowTarget - this.engineGlowT) * Math.min(1, delta * 4);
      const boostGlow = this.isBoosting ? 1 : 0;
      for (const mat of this.engineMaterials) {
        if (!mat.color || !mat.emissive) continue;
        mat.color.lerpColors(
          _engineColorBlack,
          boostGlow > 0 ? _engineColorBoost : _engineColorGlow,
          this.engineGlowT,
        );
        mat.emissive.lerpColors(
          _engineColorBlack,
          boostGlow > 0 ? _engineColorBoost : _engineColorGlow,
          this.engineGlowT,
        );
        mat.emissiveIntensity =
          boostGlow > 0 ? 2.2 : 0.05 + 0.25 * this.engineGlowT;
      }
    }

    const gunRecover = 1 - Math.exp(-GUN_RETRACT_RECOVERY * delta);
    if (this.gunL?.userData.restPosition) {
      this.gunRetractionL = Math.max(
        0,
        this.gunRetractionL - this.gunRetractionL * gunRecover,
      );
      this.gunL.position.copy(this.gunL.userData.restPosition);
      this.gunL.position.z -= this.gunRetractionL;
    }
    if (this.gunR?.userData.restPosition) {
      this.gunRetractionR = Math.max(
        0,
        this.gunRetractionR - this.gunRetractionR * gunRecover,
      );
      this.gunR.position.copy(this.gunR.userData.restPosition);
      this.gunR.position.z -= this.gunRetractionR;
    }
  }
}
