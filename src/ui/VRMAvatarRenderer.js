import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import {
  createVRMAnimationClip,
  VRMAnimationLoaderPlugin,
} from "@pixiv/three-vrm-animation";

const RT_SIZE = 512;
const FACE_MATRIX_EPS = 1e-8;

function normalizeMocapFrame(frame, namesLength) {
  if (Array.isArray(frame)) {
    const expected = 1 + namesLength + 16;
    if (frame.length !== expected) {
      throw new Error(
        `Invalid v4 mocap frame: expected ${expected} numbers, got ${frame.length}`,
      );
    }
    const t = frame[0];
    const values = frame.slice(1, 1 + namesLength);
    const faceMatrix = frame.slice(1 + namesLength, 1 + namesLength + 16);
    return { t, values, faceMatrix };
  }
  return {
    t: frame.t,
    values: frame.values,
    faceMatrix: frame.faceMatrix ?? null,
  };
}

function faceMatrixIsUsable(m) {
  if (!m || m.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(m[i]) > FACE_MATRIX_EPS) return true;
  }
  return false;
}

function normalizeFaceDataInPlace(data) {
  const namesLength = data.names.length;
  const normalized = data.frames.map((f) => normalizeMocapFrame(f, namesLength));
  for (const frame of normalized) {
    if (!faceMatrixIsUsable(frame.faceMatrix)) frame.faceMatrix = null;
  }
  data.frames = normalized;
  const fps = typeof data.fps === "number" && data.fps > 0 ? data.fps : 30;
  data.clipDurationSec = normalized.length
    ? normalized[normalized.length - 1].t + 1 / fps
    : 0;
}

function sampleFrames(frames, names, t) {
  if (!frames.length || !names.length) return null;
  if (t <= frames[0].t) return frames[0].values;
  if (t >= frames[frames.length - 1].t) return frames[frames.length - 1].values;
  let i = 0;
  while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const w = (t - a.t) / (b.t - a.t);
  const out = [];
  for (let j = 0; j < a.values.length; j++) {
    out.push(a.values[j] * (1 - w) + b.values[j] * w);
  }
  return out;
}

const _m4A = new THREE.Matrix4();
const _m4B = new THREE.Matrix4();
const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _quatC = new THREE.Quaternion();
const _quatD = new THREE.Quaternion();
const _quatE = new THREE.Quaternion();
const _quatF = new THREE.Quaternion();
const _quatG = new THREE.Quaternion();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _eulerA = new THREE.Euler();

const FACE_SMOOTHING = 14;
const HEAD_SMOOTHING = 10;
const DIALOG_FACE_BLEND = 6;
const DIALOG_POSE_BLEND = 4;
/** Idle clip weight → 0 / back to 1 around dialog; separate from pose blend so idle drops out fast. */
const IDLE_MIXER_BLEND = 36;
const NECK_ROTATION_WEIGHT = 0.35;
const HEAD_ROTATION_WEIGHT = 0.65;
const LEAN_PITCH_SCALE = 0.032;
const LEAN_YAW_SCALE = 0.04;
const LEAN_MAX_PITCH = THREE.MathUtils.degToRad(18);
const LEAN_MAX_YAW = THREE.MathUtils.degToRad(18);
const SPINE_LEAN_WEIGHT = 0.6;
const CHEST_LEAN_WEIGHT = 0.4;

function sampleFaceMatrix(frames, t) {
  if (!frames.length) return null;
  if (t <= frames[0].t) {
    const m = frames[0].faceMatrix;
    return faceMatrixIsUsable(m) ? m : null;
  }
  if (t >= frames[frames.length - 1].t) {
    const m = frames[frames.length - 1].faceMatrix;
    return faceMatrixIsUsable(m) ? m : null;
  }
  let i = 0;
  while (i + 1 < frames.length && frames[i + 1].t <= t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const ma = a.faceMatrix;
  const mb = b.faceMatrix;
  if (!faceMatrixIsUsable(ma) || !faceMatrixIsUsable(mb)) return null;
  const w = (t - a.t) / (b.t - a.t);
  _m4A.fromArray(ma);
  _m4B.fromArray(mb);
  _m4A.decompose(_posA, _quatA, new THREE.Vector3());
  _m4B.decompose(_posB, _quatB, new THREE.Vector3());
  _quatA.slerp(_quatB, w);
  _posA.lerp(_posB, w);
  _m4A.compose(_posA, _quatA, new THREE.Vector3(1, 1, 1));
  const out = new Array(16);
  _m4A.toArray(out);
  return out;
}

function getFaceRotation(faceMatrix, outQuat) {
  _vecA.set(-faceMatrix[4], faceMatrix[5], faceMatrix[6]).normalize();
  _vecB.set(-faceMatrix[8], faceMatrix[9], faceMatrix[10]).normalize();
  _vecA.addScaledVector(_vecB, -_vecA.dot(_vecB)).normalize();
  _vecC.crossVectors(_vecA, _vecB).normalize();
  _vecA.crossVectors(_vecB, _vecC).normalize();
  _m4A.makeBasis(_vecC, _vecA, _vecB);
  outQuat.setFromRotationMatrix(_m4A);
  return outQuat;
}

function applyBoneBlend(bone, baseQuat, deltaQuat, weight) {
  if (!bone) return;
  _quatE.identity().slerp(deltaQuat, weight);
  bone.quaternion.copy(baseQuat).premultiply(_quatE);
}

function applyRigPose(vrm, faceMatrix, state) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;
  const head = humanoid.getNormalizedBoneNode("head");
  const neck = humanoid.getNormalizedBoneNode("neck");
  const spine =
    humanoid.getNormalizedBoneNode("chest") ??
    humanoid.getNormalizedBoneNode("spine");
  const chest = humanoid.getNormalizedBoneNode("upperChest");
  if (!head && !neck && !spine && !chest) return;
  if (faceMatrix && faceMatrix.length === 16) {
    getFaceRotation(faceMatrix, _quatA);
    if (!state.initialized) {
      if (head) state.baseHeadQuaternion.copy(head.quaternion);
      if (neck) state.baseNeckQuaternion.copy(neck.quaternion);
      if (spine) state.baseSpineQuaternion.copy(spine.quaternion);
      if (chest) state.baseChestQuaternion.copy(chest.quaternion);
      state.baseFaceQuaternionInverse.copy(_quatA).invert();
      state.baseTx = faceMatrix[12];
      state.baseTz = faceMatrix[14];
      state.initialized = true;
    }
    _quatC.copy(_quatA).multiply(state.baseFaceQuaternionInverse);
    if (!state.smoothedInitialized) {
      state.smoothedDeltaQuaternion.copy(_quatC);
      state.smoothedLeanEuler.set(0, 0, 0);
      state.smoothedInitialized = true;
    }
    _quatD.copy(state.smoothedDeltaQuaternion).slerp(_quatC, state.smoothingAlpha);
    state.smoothedDeltaQuaternion.copy(_quatD);
    _eulerA.set(
      THREE.MathUtils.clamp(
        -(faceMatrix[14] - state.baseTz) * LEAN_PITCH_SCALE,
        -LEAN_MAX_PITCH,
        LEAN_MAX_PITCH,
      ),
      THREE.MathUtils.clamp(
        (faceMatrix[12] - state.baseTx) * LEAN_YAW_SCALE,
        -LEAN_MAX_YAW,
        LEAN_MAX_YAW,
      ),
      0,
      "XYZ",
    );
    state.smoothedLeanEuler.x = THREE.MathUtils.lerp(
      state.smoothedLeanEuler.x,
      _eulerA.x,
      state.smoothingAlpha,
    );
    state.smoothedLeanEuler.y = THREE.MathUtils.lerp(
      state.smoothedLeanEuler.y,
      _eulerA.y,
      state.smoothingAlpha,
    );
  }
  if (!state.initialized || !state.smoothedInitialized) return;
  applyBoneBlend(
    neck,
    state.baseNeckQuaternion,
    state.smoothedDeltaQuaternion,
    state.dialogWeight * NECK_ROTATION_WEIGHT,
  );
  applyBoneBlend(
    head,
    state.baseHeadQuaternion,
    state.smoothedDeltaQuaternion,
    state.dialogWeight * HEAD_ROTATION_WEIGHT,
  );
  _quatF.setFromEuler(
    _eulerA.set(
      state.smoothedLeanEuler.x * state.dialogWeight * SPINE_LEAN_WEIGHT,
      state.smoothedLeanEuler.y * state.dialogWeight * SPINE_LEAN_WEIGHT,
      0,
      "XYZ",
    ),
  );
  _quatG.setFromEuler(
    _eulerA.set(
      state.smoothedLeanEuler.x * state.dialogWeight * CHEST_LEAN_WEIGHT,
      state.smoothedLeanEuler.y * state.dialogWeight * CHEST_LEAN_WEIGHT,
      0,
      "XYZ",
    ),
  );
  if (spine) spine.quaternion.copy(state.baseSpineQuaternion).premultiply(_quatF);
  if (chest) chest.quaternion.copy(state.baseChestQuaternion).premultiply(_quatG);
}

function applyMorphTargets(vrmScene, names, values) {
  if (!values || values.length !== names.length) return;
  vrmScene.traverse((obj) => {
    if (!obj.isMesh || !obj.morphTargetDictionary) return;
    const dict = obj.morphTargetDictionary;
    const influences = obj.morphTargetInfluences;
    for (let i = 0; i < names.length; i++) {
      const idx = dict[names[i]];
      if (idx !== undefined && influences[idx] !== undefined) {
        influences[idx] = values[i];
      }
    }
  });
}

function clearMorphTargets(vrmScene, names) {
  if (!names?.length) return;
  vrmScene.traverse((obj) => {
    if (!obj.isMesh || !obj.morphTargetDictionary) return;
    const dict = obj.morphTargetDictionary;
    const influences = obj.morphTargetInfluences;
    for (let i = 0; i < names.length; i++) {
      const idx = dict[names[i]];
      if (idx !== undefined && influences[idx] !== undefined) {
        influences[idx] = 0;
      }
    }
  });
}

function smoothFaceValues(values, state, delta) {
  if (!values?.length) return values;
  const alpha = 1 - Math.exp(-FACE_SMOOTHING * delta);
  if (!state.values || state.values.length !== values.length) {
    state.values = values.slice();
    return state.values;
  }
  for (let i = 0; i < values.length; i++) {
    state.values[i] = THREE.MathUtils.lerp(state.values[i], values[i], alpha);
  }
  return state.values;
}

function scaleFaceValues(values, weight, state) {
  if (!values?.length) return null;
  if (!state.values || state.values.length !== values.length) {
    state.values = new Array(values.length);
  }
  for (let i = 0; i < values.length; i++) {
    state.values[i] = values[i] * weight;
  }
  return state.values;
}

function createHumanoidOnlyClip(vrmAnimation, vrm) {
  const clip = createVRMAnimationClip(vrmAnimation, vrm);
  const allowedTracks = new Set();
  const excludedBones = new Set([
    "neck",
    "head",
    "leftEye",
    "rightEye",
    "jaw",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "rightUpperArm",
    "leftLowerArm",
    "rightLowerArm",
    "leftHand",
    "rightHand",
    "leftThumbMetacarpal",
    "rightThumbMetacarpal",
    "leftThumbProximal",
    "rightThumbProximal",
    "leftThumbDistal",
    "rightThumbDistal",
    "leftIndexProximal",
    "rightIndexProximal",
    "leftIndexIntermediate",
    "rightIndexIntermediate",
    "leftIndexDistal",
    "rightIndexDistal",
    "leftMiddleProximal",
    "rightMiddleProximal",
    "leftMiddleIntermediate",
    "rightMiddleIntermediate",
    "leftMiddleDistal",
    "rightMiddleDistal",
    "leftRingProximal",
    "rightRingProximal",
    "leftRingIntermediate",
    "rightRingIntermediate",
    "leftRingDistal",
    "rightRingDistal",
    "leftLittleProximal",
    "rightLittleProximal",
    "leftLittleIntermediate",
    "rightLittleIntermediate",
    "leftLittleDistal",
    "rightLittleDistal",
  ]);

  for (const boneName of vrmAnimation.humanoidTracks.rotation.keys()) {
    if (excludedBones.has(boneName)) continue;
    const nodeName = vrm.humanoid.getNormalizedBoneNode(boneName)?.name;
    if (nodeName) allowedTracks.add(`${nodeName}.quaternion`);
  }

  for (const boneName of vrmAnimation.humanoidTracks.translation.keys()) {
    if (excludedBones.has(boneName)) continue;
    const nodeName = vrm.humanoid.getNormalizedBoneNode(boneName)?.name;
    if (nodeName) allowedTracks.add(`${nodeName}.position`);
  }

  return new THREE.AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.filter((track) => allowedTracks.has(track.name)),
  );
}

function applyFaceToExpressionManager(vrm, names, values) {
  const em = vrm.expressionManager;
  if (!em || !names || !values) return;
  const get = (name) => {
    const i = names.indexOf(name);
    return i >= 0 ? values[i] : 0;
  };
  em.setValue("aa", get("jawOpen"));
  em.setValue("ou", get("mouthPucker"));
  em.setValue("oh", Math.max(0, get("mouthFunnel")));
  em.setValue("ee", (get("mouthStretchLeft") + get("mouthStretchRight")) * 0.5);
  em.setValue("ih", (get("mouthUpperUpLeft") + get("mouthUpperUpRight")) * 0.5);
  em.setValue("blink", 0);
  em.setValue("blinkLeft", get("eyeBlinkLeft"));
  em.setValue("blinkRight", get("eyeBlinkRight"));
}

export class VRMAvatarRenderer {
  constructor(options = {}) {
    this.vrmUrl = options.vrmUrl ?? "./model_original_1773065783.vrm";
    this.idleUrl = options.idleUrl ?? "./ani_Idle_Action_01.vrma";
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
    this.camera.position.set(0, 0, 1.2);
    this.camera.lookAt(0, 0, 0);
    this.renderTarget = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0.5, 0.5, 1);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    this.vrm = null;
    this.faceData = null;
    this.audioElement = null;
    this._ready = false;
    this._playing = false;
    this._placeholderPlaying = false;
    this._placeholderDuration = 0;
    this._placeholderStartTime = 0;
    this._dialogFaceWeight = 0;
    this._dialogPoseWeight = 0;
    this.idleMixer = null;
    this.idleAction = null;
    this._idleBlendWeight = 1;
    this._headPoseState = {
      dialogWeight: 0,
      initialized: false,
      smoothedInitialized: false,
      smoothingAlpha: 1,
      baseHeadQuaternion: new THREE.Quaternion(),
      baseNeckQuaternion: new THREE.Quaternion(),
      baseSpineQuaternion: new THREE.Quaternion(),
      baseChestQuaternion: new THREE.Quaternion(),
      baseFaceQuaternionInverse: new THREE.Quaternion(),
      smoothedDeltaQuaternion: new THREE.Quaternion(),
      smoothedLeanEuler: new THREE.Euler(),
      baseTx: 0,
      baseTz: 0,
    };
    this._faceSmoothingState = { values: null };
    this._weightedFaceState = { values: null };
    this._placeholderTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
    );
    this._placeholderTexture.needsUpdate = true;
  }

  getTexture() {
    return this._ready ? this.renderTarget.texture : this._placeholderTexture;
  }

  getCurrentTime() {
    if (this.audioElement) return this.audioElement.currentTime ?? 0;
    if (this._placeholderPlaying) {
      return performance.now() / 1000 - this._placeholderStartTime;
    }
    return 0;
  }

  isPlaying() {
    if (this._placeholderPlaying) {
      return performance.now() / 1000 - this._placeholderStartTime <
        this._placeholderDuration;
    }
    return this._playing && this.audioElement && !this.audioElement.ended;
  }

  async loadVRM() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    return new Promise((resolve, reject) => {
      loader.load(
        this.vrmUrl,
        async (gltf) => {
          this.vrm = gltf.userData.vrm;
          if (!this.vrm) {
            reject(new Error("No VRM in gltf.userData.vrm"));
            return;
          }
          this.scene.add(this.vrm.scene);
          this.vrm.scene.rotation.order = "ZYX";
          this.vrm.scene.rotation.set(0, Math.PI, -Math.PI / 2);
          this.vrm.scene.position.set(-1.85, 0, 0.475);
          this.vrm.scene.scale.setScalar(1.1);
          this._ready = true;
          try {
            await this.loadIdleAnimation();
          } catch (e) {
            console.warn("[VRMAvatarRenderer] Idle animation load failed:", e);
          }
          resolve(this.vrm);
        },
        undefined,
        reject,
      );
    });
  }

  async loadFaceData(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Face data load failed: ${url}`);
    const data = await res.json();
    if (!data.names || !Array.isArray(data.frames))
      throw new Error("Invalid face data");
    normalizeFaceDataInPlace(data);
    this.faceData = data;
    return data;
  }

  async loadIdleAnimation() {
    if (!this.vrm) return null;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    return new Promise((resolve, reject) => {
      loader.load(
        this.idleUrl,
        (gltf) => {
          const vrmAnimation = gltf.userData.vrmAnimations?.[0];
          if (!vrmAnimation) {
            resolve(null);
            return;
          }
          const clip = createHumanoidOnlyClip(vrmAnimation, this.vrm);
          if (!clip.tracks.length) {
            resolve(null);
            return;
          }
          this.idleMixer = new THREE.AnimationMixer(this.vrm.scene);
          this.idleAction = this.idleMixer.clipAction(clip);
          this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
          this.idleAction.setEffectiveWeight(this._idleBlendWeight);
          this.idleAction.play();
          resolve(clip);
        },
        undefined,
        reject,
      );
    });
  }

  async play(audioUrl, faceDataUrl) {
    this.stop();
    if (!this._ready || !this.vrm) return;
    let faceData = this.faceData;
    if (faceDataUrl && (!faceData || faceData._url !== faceDataUrl)) {
      await this.loadFaceData(faceDataUrl);
      faceData = this.faceData;
      faceData._url = faceDataUrl;
    }
    if (!faceData) return;

    this.audioElement = document.createElement("audio");
    this.audioElement.src = audioUrl;
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.loop = false;
    try {
      await new Promise((resolve, reject) => {
        this.audioElement.addEventListener("canplaythrough", resolve, {
          once: true,
        });
        this.audioElement.addEventListener("error", reject, { once: true });
        this.audioElement.load();
      });
    } catch (e) {
      console.warn("[VRMAvatarRenderer] Audio load failed:", audioUrl, e);
      this.audioElement = null;
      return;
    }
    this.audioElement.play().catch(() => {});
    this._playing = true;
    this.audioElement.addEventListener(
      "ended",
      () => {
        this._playing = false;
      },
      { once: true },
    );
  }

  playPlaceholder(durationSeconds = 0) {
    this.stop();
    if (!this._ready || !this.vrm) return;
    this._placeholderPlaying = durationSeconds > 0;
    this._placeholderDuration = Math.max(0, durationSeconds);
    this._placeholderStartTime = performance.now() / 1000;
  }

  stop() {
    this._playing = false;
    this._placeholderPlaying = false;
    this._placeholderDuration = 0;
    this._placeholderStartTime = 0;
    this._dialogFaceWeight = 0;
    this._dialogPoseWeight = 0;
    this._headPoseState.initialized = false;
    this._headPoseState.smoothedInitialized = false;
    this._headPoseState.dialogWeight = 0;
    this._faceSmoothingState.values = null;
    this._weightedFaceState.values = null;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = "";
      this.audioElement = null;
    }
  }

  update(renderer, delta) {
    if (!this._ready || !this.vrm) return;
    if (
      this._placeholderPlaying &&
      performance.now() / 1000 - this._placeholderStartTime >= this._placeholderDuration
    ) {
      this._placeholderPlaying = false;
    }
    const isSpeaking = !!(this.audioElement && this._playing) || this._placeholderPlaying;

    const idleBlendAlpha = 1 - Math.exp(-IDLE_MIXER_BLEND * delta);
    this._idleBlendWeight = THREE.MathUtils.lerp(
      this._idleBlendWeight,
      isSpeaking ? 0 : 1,
      idleBlendAlpha,
    );
    if (Math.abs(this._idleBlendWeight - (isSpeaking ? 0 : 1)) < 0.001) {
      this._idleBlendWeight = isSpeaking ? 0 : 1;
    }

    const dialogFaceBlendAlpha = 1 - Math.exp(-DIALOG_FACE_BLEND * delta);
    const dialogPoseBlendAlpha = 1 - Math.exp(-DIALOG_POSE_BLEND * delta);
    this._dialogFaceWeight = THREE.MathUtils.lerp(
      this._dialogFaceWeight,
      isSpeaking ? 1 : 0,
      dialogFaceBlendAlpha,
    );
    if (Math.abs(this._dialogFaceWeight - (isSpeaking ? 1 : 0)) < 0.001) {
      this._dialogFaceWeight = isSpeaking ? 1 : 0;
    }
    this._dialogPoseWeight = THREE.MathUtils.lerp(
      this._dialogPoseWeight,
      isSpeaking ? 1 : 0,
      dialogPoseBlendAlpha,
    );
    if (Math.abs(this._dialogPoseWeight - (isSpeaking ? 1 : 0)) < 0.001) {
      this._dialogPoseWeight = isSpeaking ? 1 : 0;
    }
    this._headPoseState.dialogWeight = this._dialogPoseWeight;
    let t = 0;
    if (this.audioElement && this._playing) {
      t = this.audioElement.currentTime;
    } else if (this._placeholderPlaying) {
      t = performance.now() / 1000 - this._placeholderStartTime;
    }
    if (this.idleAction) {
      if (!isSpeaking && this.idleAction.paused) {
        this.idleAction.paused = false;
      }
      this.idleAction.setEffectiveWeight(this._idleBlendWeight);
      if (isSpeaking && this._idleBlendWeight <= 0.001) {
        this.idleAction.paused = true;
      }
    }
    if (
      this.idleMixer &&
      this.idleAction &&
      !this.idleAction.paused &&
      this._idleBlendWeight > 0
    ) {
      this.idleMixer.update(delta);
    }
    let faceValues = null;
    let faceMatrix = null;
    if (this.audioElement && this._playing && this.faceData && this.faceData.frames && this.faceData.frames.length) {
      this._headPoseState.smoothingAlpha = 1 - Math.exp(-HEAD_SMOOTHING * delta);
      faceValues = smoothFaceValues(
        sampleFrames(this.faceData.frames, this.faceData.names, t),
        this._faceSmoothingState,
        delta,
      );
      faceMatrix = sampleFaceMatrix(this.faceData.frames, t);
    }
    const weightedFaceValues = scaleFaceValues(
      this._faceSmoothingState.values,
      this._dialogFaceWeight,
      this._weightedFaceState,
    );
    if (weightedFaceValues) {
      applyFaceToExpressionManager(this.vrm, this.faceData.names, weightedFaceValues);
    } else if (this._placeholderPlaying && this.vrm.expressionManager) {
      const mouthOpen = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 10));
      const mouthRound = 0.04 + 0.08 * (0.5 + 0.5 * Math.sin(t * 6 + 0.8));
      this.vrm.expressionManager.setValue("aa", mouthOpen);
      this.vrm.expressionManager.setValue("oh", mouthRound);
      this.vrm.expressionManager.setValue("ou", mouthRound * 0.6);
      this.vrm.expressionManager.setValue("blink", 0);
    } else if (this.vrm.expressionManager) {
      this.vrm.expressionManager.resetValues();
    }
    if (this.vrm.update) this.vrm.update(delta);
    if (weightedFaceValues) {
      applyMorphTargets(this.vrm.scene, this.faceData.names, weightedFaceValues);
    } else if (this.faceData?.names) {
      clearMorphTargets(this.vrm.scene, this.faceData.names);
    }
    if (this._dialogFaceWeight === 0 && this._dialogPoseWeight === 0) {
      this._headPoseState.initialized = false;
      this._headPoseState.smoothedInitialized = false;
      this._faceSmoothingState.values = null;
      this._weightedFaceState.values = null;
    }
    applyRigPose(this.vrm, faceMatrix, this._headPoseState);
    const oldTarget = renderer.getRenderTarget();
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.renderTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldClearColor);
    renderer.setClearAlpha(oldClearAlpha);
  }

  dispose() {
    this.stop();
    this.idleMixer?.stopAllAction();
    this.renderTarget.dispose();
    this._placeholderTexture.dispose();
    if (this.vrm?.scene) this.scene.remove(this.vrm.scene);
    this.vrm = null;
    this.faceData = null;
    this._ready = false;
  }
}
