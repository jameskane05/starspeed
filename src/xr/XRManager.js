import * as THREE from "three";

const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();

export class XRManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.session = null;
    this.isPresenting = false;
    this.supported = false;

    this.rig = new THREE.Group();
    this.rig.name = "xr-rig";

    // Active transient-pointer tracking state
    this.rightHand = null; // { source, startDir: Vector3 | null }
    this.leftHand = null; // { source, startPos: Vector3 | null }

    // Normalized output values [-1, 1] consumed by Player each frame
    this.lookInput = { x: 0, y: 0 }; // yaw, pitch from right hand
    this.moveInput = { x: 0, y: 0 }; // strafe (x), thrust (y) from left hand

    this._scene = null;
    this._camera = null;

    this._checkSupport();
  }

  async _checkSupport() {
    if (!navigator.xr) return;
    try {
      this.supported = await navigator.xr.isSessionSupported("immersive-vr");
      console.log("[XR] immersive-vr supported:", this.supported);
    } catch (e) {
      console.warn("[XR] Support check failed:", e);
    }
  }

  async enterVR(scene, camera) {
    if (!navigator.xr) return false;

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "hand-tracking"],
      });

      this.session = session;
      this._scene = scene;
      this._camera = camera;

      this.renderer.xr.setReferenceSpaceType("local-floor");
      this.renderer.xr.enabled = true;
      await this.renderer.xr.setSession(session);

      // Reparent camera under rig, preserving world transform
      this.rig.position.copy(camera.position);
      this.rig.quaternion.copy(camera.quaternion);
      scene.add(this.rig);
      this.rig.add(camera);
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();

      session.addEventListener("inputsourceschange", (e) =>
        this._onInputSourcesChange(e),
      );
      session.addEventListener("selectstart", (e) => this._onSelectStart(e));
      session.addEventListener("selectend", (e) => this._onSelectEnd(e));
      session.addEventListener("end", () => this._onSessionEnd());

      this.isPresenting = true;
      console.log("[XR] Entered immersive-vr session");
      return true;
    } catch (err) {
      console.error("[XR] Failed to enter VR:", err);
      return false;
    }
  }

  _onInputSourcesChange(event) {
    for (const source of event.added) {
      console.log(
        "[XR] Input source added:",
        source.targetRayMode,
        source.handedness,
      );
    }
    for (const source of event.removed) {
      if (this.rightHand?.source === source) {
        this.rightHand = null;
        this.lookInput.x = 0;
        this.lookInput.y = 0;
      }
      if (this.leftHand?.source === source) {
        this.leftHand = null;
        this.moveInput.x = 0;
        this.moveInput.y = 0;
      }
    }
  }

  _onSelectStart(event) {
    const source = event.inputSource;
    if (source.targetRayMode !== "transient-pointer") return;

    if (source.handedness === "right") {
      this.rightHand = { source, startDir: null };
      console.log("[XR] Right hand pinch start (look)");
    } else if (source.handedness === "left") {
      this.leftHand = { source, startPos: null };
      console.log("[XR] Left hand pinch start (move)");
    }
  }

  _onSelectEnd(event) {
    const source = event.inputSource;
    if (source.handedness === "right" && this.rightHand?.source === source) {
      this.rightHand = null;
      this.lookInput.x = 0;
      this.lookInput.y = 0;
    }
    if (source.handedness === "left" && this.leftHand?.source === source) {
      this.leftHand = null;
      this.moveInput.x = 0;
      this.moveInput.y = 0;
    }
  }

  _onSessionEnd() {
    console.log("[XR] Session ended");
    this.isPresenting = false;
    this.rightHand = null;
    this.leftHand = null;
    this.lookInput.x = 0;
    this.lookInput.y = 0;
    this.moveInput.x = 0;
    this.moveInput.y = 0;

    const scene = this._scene;
    const camera = this._camera;
    if (scene && camera) {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      camera.getWorldPosition(worldPos);
      camera.getWorldQuaternion(worldQuat);

      scene.remove(this.rig);
      scene.add(camera);
      camera.position.copy(worldPos);
      camera.quaternion.copy(worldQuat);
    }

    this.session = null;
    this.renderer.xr.enabled = false;
  }

  update(timestamp, frame) {
    if (!this.isPresenting || !frame) return;

    const refSpace = this.renderer.xr.getReferenceSpace();
    if (!refSpace) return;

    this._updateRightHand(frame, refSpace);
    this._updateLeftHand(frame, refSpace);
  }

  _updateRightHand(frame, refSpace) {
    if (!this.rightHand) return;

    const pose = frame.getPose(this.rightHand.source.targetRaySpace, refSpace);
    if (!pose) return;

    const o = pose.transform.orientation;
    _quat.set(o.x, o.y, o.z, o.w);
    _dir.set(0, 0, -1).applyQuaternion(_quat);

    if (!this.rightHand.startDir) {
      this.rightHand.startDir = _dir.clone();
      return;
    }

    const sd = this.rightHand.startDir;

    // Yaw: angle between horizontal projections of start and current direction
    const sLen = Math.sqrt(sd.x * sd.x + sd.z * sd.z);
    const cLen = Math.sqrt(_dir.x * _dir.x + _dir.z * _dir.z);

    let yaw = 0;
    if (sLen > 0.01 && cLen > 0.01) {
      const snx = sd.x / sLen,
        snz = sd.z / sLen;
      const cnx = _dir.x / cLen,
        cnz = _dir.z / cLen;
      yaw = Math.atan2(snx * cnz - snz * cnx, snx * cnx + snz * cnz);
    }

    // Pitch: difference in elevation angle
    const pitch =
      Math.asin(THREE.MathUtils.clamp(_dir.y, -1, 1)) -
      Math.asin(THREE.MathUtils.clamp(sd.y, -1, 1));

    const maxAngle = 0.5; // ~29 degrees for full deflection
    this.lookInput.x = THREE.MathUtils.clamp(yaw / maxAngle, -1, 1);
    this.lookInput.y = THREE.MathUtils.clamp(pitch / maxAngle, -1, 1);
  }

  _updateLeftHand(frame, refSpace) {
    if (!this.leftHand) return;

    const pose = frame.getPose(this.leftHand.source.targetRaySpace, refSpace);
    if (!pose) return;

    const p = pose.transform.position;
    _pos.set(p.x, p.y, p.z);

    if (!this.leftHand.startPos) {
      this.leftHand.startPos = _pos.clone();
      return;
    }

    const delta = _pos.clone().sub(this.leftHand.startPos);
    const maxDist = 0.2; // 20cm for full deflection

    // Y axis: hand up = positive thrust (forward), hand down = negative thrust (backward)
    this.moveInput.y = THREE.MathUtils.clamp(delta.y / maxDist, -1, 1);
    // X axis: hand right = strafe right, hand left = strafe left
    this.moveInput.x = THREE.MathUtils.clamp(delta.x / maxDist, -1, 1);
  }

  dispose() {
    if (this.session) {
      this.session.end();
    }
  }
}
