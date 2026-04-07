/**
 * Checkpoint / spawn dissolve VFX (material onBeforeCompile + optional particles).
 *
 * ---------------------------------------------------------------------------
 * SOLO CAMPAIGN — GPU program reuse (read this before adding pooled VFX props)
 * ---------------------------------------------------------------------------
 * Three.js keys cached WebGL programs by material.customProgramCacheKey(). We append
 * `|cpDissolve:<batchSerial>` so patched materials bust stale program caches when needed.
 *
 * - One batch serial **per logical precook** (one gate root, one enemy root): all submeshes on
 *   that root share the same suffix. Identical material *types* (e.g. six spoke clones) then
 *   share **one** GPU program instead of N programs → avoids stacked onFirstUse stalls.
 *
 * - **Pooled clones** of the same visual (multiple checkpoint slots, same mesh layout): call
 *   precookCheckpointDissolveMaterials(..., { sharedDissolveBatchSerial }) with **one** id from
 *   allocateCheckpointDissolveBatchSerial() for the whole pool. Otherwise each slot gets a new
 *   serial and you pay duplicate programs on every spawn.
 *
 * - **Uniforms**: each instance still gets its own dissolveUniforms + bbox; only the **program
 *   binary** is deduped when cache keys match.
 *
 * Pair with MissionManager “narrow warm” during first-view load so first real draws happen under
 * the loading overlay, not when the player reaches an objective.
 * ---------------------------------------------------------------------------
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { setupUniforms, setupShaderSnippets } from "../utils/shaderHelper.js";
import { perlinNoise } from "./shaders/perlinNoise.glsl.js";
import {
  vertexGlobal,
  vertexMain,
  fragmentGlobal,
  fragmentMain,
} from "./shaders/dissolveShader.glsl.js";
import {
  particleVertexShader,
  particleFragmentShader,
} from "./shaders/dissolveParticle.glsl.js";
import { DissolveParticleSystem } from "./DissolveParticleSystem.js";

function createRadialParticleTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _sharedRadialParticleTexture = null;
function getRadialParticleTexture() {
  if (!_sharedRadialParticleTexture) {
    _sharedRadialParticleTexture = createRadialParticleTexture();
  }
  return _sharedRadialParticleTexture;
}

const _burstWorldPos = new THREE.Vector3();
/** Next id if applyDissolvePatches does not receive forcedBatchSerial / sharedDissolveBatchSerial. */
let _checkpointDissolveProgramSerial = 0;

/**
 * Grab a single batch id to reuse across many precooks (e.g. N pooled checkpoint meshes).
 * See file header “SOLO CAMPAIGN — GPU program reuse”.
 */
export function allocateCheckpointDissolveBatchSerial() {
  return ++_checkpointDissolveProgramSerial;
}

/** Position-only geometry in world space — mergeGeometries requires identical attributes; GLB submeshes often differ (uv, color, …). */
function meshToWorldPositionGeometry(mesh) {
  const src = mesh.geometry;
  if (!src?.getAttribute) return null;
  const pos = src.getAttribute("position");
  if (!pos) return null;
  mesh.updateMatrixWorld(true);
  const m = mesh.matrixWorld;
  const verts = [];
  const idx = src.index;
  if (idx) {
    for (let i = 0; i < idx.count; i++) {
      const vi = idx.getX(i);
      _burstWorldPos.fromBufferAttribute(pos, vi).applyMatrix4(m);
      verts.push(_burstWorldPos.x, _burstWorldPos.y, _burstWorldPos.z);
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      _burstWorldPos.fromBufferAttribute(pos, i).applyMatrix4(m);
      verts.push(_burstWorldPos.x, _burstWorldPos.y, _burstWorldPos.z);
    }
  }
  if (verts.length === 0) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  return out;
}

function restoreCheckpointDissolveMaterialUserData(mat) {
  const orig = mat.userData.checkpointDissolveOriginalOnBeforeCompile;
  mat.onBeforeCompile = orig ?? (() => {});
  delete mat.userData.checkpointDissolveOriginalOnBeforeCompile;
  delete mat.userData.checkpointDissolveUniforms;
  if (mat.userData.checkpointDissolveBaseProgramCacheKey != null) {
    mat.customProgramCacheKey = mat.userData.checkpointDissolveBaseProgramCacheKey;
  } else {
    delete mat.customProgramCacheKey;
  }
  delete mat.userData.checkpointDissolveBaseProgramCacheKey;
  mat.version++;
  mat.needsUpdate = true;
}

export function restoreDissolveModifiedMaterials(modifiedMaterials) {
  for (const mat of modifiedMaterials) {
    restoreCheckpointDissolveMaterialUserData(mat);
  }
  modifiedMaterials.length = 0;
}

/** Reset any dissolve hooks left on meshes (e.g. after a bad warp/teardown mismatch). */
export function stripCheckpointDissolveMaterials(root) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat?.userData?.checkpointDissolveOriginalOnBeforeCompile) continue;
      restoreCheckpointDissolveMaterialUserData(mat);
    }
  });
}

function canPatchDissolveMaterial(mat) {
  if (!mat) return false;
  return (
    mat.isMeshStandardMaterial ||
    mat.isMeshPhysicalMaterial ||
    mat.isMeshLambertMaterial ||
    mat.isMeshPhongMaterial ||
    mat.isMeshToonMaterial ||
    mat.isMeshMatcapMaterial ||
    mat.isMeshBasicMaterial
  );
}

/**
 * Patches every patchable mesh under `root`. All materials patched in this call share
 * `|cpDissolve:<batchSerial>` (either `forcedBatchSerial` or a fresh ++).
 * Do not share `dissolveUniforms` between unrelated roots — each gate/enemy needs its own bbox/state.
 */
function applyDissolvePatches(
  root,
  dissolveUniforms,
  modifiedMaterials,
  forcedBatchSerial = null,
) {
  const batchSerial =
    forcedBatchSerial != null
      ? forcedBatchSerial
      : ++_checkpointDissolveProgramSerial;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!canPatchDissolveMaterial(mat)) continue;
      if (!mat.userData.checkpointDissolveOriginalOnBeforeCompile) {
        mat.userData.checkpointDissolveOriginalOnBeforeCompile = mat.onBeforeCompile;
        mat.userData.checkpointDissolveBaseProgramCacheKey =
          typeof mat.customProgramCacheKey === "function"
            ? mat.customProgramCacheKey.bind(mat)
            : null;
      }
      mat.customProgramCacheKey = function () {
        const baseFn = mat.userData.checkpointDissolveBaseProgramCacheKey;
        const base = baseFn
          ? baseFn()
          : THREE.Material.prototype.customProgramCacheKey.call(mat);
        return `${base}|cpDissolve:${batchSerial}`;
      };
      const originalOnBeforeCompile = mat.userData.checkpointDissolveOriginalOnBeforeCompile;
      mat.onBeforeCompile = (shader) => {
        if (originalOnBeforeCompile) originalOnBeforeCompile(shader);
        setupUniforms(shader, dissolveUniforms);
        setupShaderSnippets(
          shader,
          vertexGlobal,
          vertexMain,
          perlinNoise + fragmentGlobal,
          fragmentMain,
        );
      };
      mat.userData.checkpointDissolveUniforms = dissolveUniforms;
      mat.needsUpdate = true;
      mat.version++;
      if (!modifiedMaterials.includes(mat)) modifiedMaterials.push(mat);
    }
  });
}

function buildParticleBurst(
  root,
  scene,
  renderer,
  dissolveUniforms,
  particleColorThree,
  particleSize,
  particleDecimation,
  dispersion,
  velocitySpread,
) {
  if (!scene || !renderer) return null;

  const geometries = [];
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geo = meshToWorldPositionGeometry(child);
    if (geo) geometries.push(geo);
  });

  if (geometries.length === 0) return null;

  let mergedGeo =
    geometries.length > 1 ? mergeGeometries(geometries) : geometries[0];
  for (const g of geometries) {
    if (g !== mergedGeo) g.dispose();
  }
  if (!mergedGeo) {
    console.warn(
      "[checkpointDissolveWarp] mergeGeometries failed; particle burst skipped.",
    );
    return null;
  }

  const originalPositions = mergedGeo.getAttribute("position");
  const decimatedCount = Math.max(
    1,
    Math.floor(originalPositions.count / particleDecimation),
  );
  const decimatedPositions = new Float32Array(decimatedCount * 3);
  for (let i = 0; i < decimatedCount; i++) {
    const si = i * particleDecimation;
    decimatedPositions[i * 3 + 0] = originalPositions.getX(si);
    decimatedPositions[i * 3 + 1] = originalPositions.getY(si);
    decimatedPositions[i * 3 + 2] = originalPositions.getZ(si);
  }
  const decimatedGeo = new THREE.BufferGeometry();
  decimatedGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(decimatedPositions, 3),
  );
  mergedGeo.dispose();

  const particleSystem = new DissolveParticleSystem(
    decimatedGeo,
    dispersion,
    velocitySpread,
  );
  const particleTexture = getRadialParticleTexture();

  const particleUniforms = {
    uPixelDensity: { value: renderer.getPixelRatio() },
    uBaseSize: { value: particleSize },
    uFreq: dissolveUniforms.uFreq,
    uAmp: dissolveUniforms.uAmp,
    uEdge: dissolveUniforms.uEdge,
    uColor: {
      value: new THREE.Vector3(
        particleColorThree.r * 0.9,
        particleColorThree.g * 0.9,
        particleColorThree.b * 0.9,
      ),
    },
    uProgress: dissolveUniforms.uProgress,
    uParticleTexture: { value: particleTexture },
  };

  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    uniforms: particleUniforms,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
  });

  const particleMesh = new THREE.Points(decimatedGeo, particleMaterial);
  particleMesh.frustumCulled = false;
  particleMesh.renderOrder = 10000;
  scene.add(particleMesh);

  return {
    particleMesh,
    particleMaterial,
    particleSystem,
    decimatedGeo,
    particleTexture,
  };
}

function cleanupParticleBurst(
  scene,
  particleMesh,
  particleMaterial,
  particleTexture,
  decimatedGeo,
) {
  if (particleMesh && scene) scene.remove(particleMesh);
  particleMaterial?.dispose?.();
  // particleTexture is shared via getRadialParticleTexture(); never dispose here.
  decimatedGeo?.dispose?.();
}

/** Solo / training / MP bot spawn-in & respawn dissolve length (seconds). Checkpoints pass their own `duration`. */
export const ENEMY_SPAWN_DISSOLVE_DURATION = 3;

/**
 * Apply dissolve shader hooks once (e.g. pool build or editor-time precook).
 *
 * Each **root** needs its own `{ dissolveUniforms, modifiedMaterials }` — never share that object
 * across two different gate meshes (uniforms include per-mesh wipe bounds).
 *
 * @param {number} [options.sharedDissolveBatchSerial] — Optional. When building **multiple identical
 * roots** (visual pool), pass one value from allocateCheckpointDissolveBatchSerial() so every slot
 * shares the same `|cpDissolve:*` suffix and reuses GPU programs across instances.
 */
export function precookCheckpointDissolveMaterials(root, options = {}) {
  const frequency = options.frequency ?? 0.5;
  const edgeWidth = options.edgeWidth ?? 0.85;
  const progressStart = options.progressStart ?? 18;
  const edgeColor = new THREE.Color(options.edgeColor ?? 0x8affff);
  const color2 = new THREE.Color(options.edgeColor2 ?? options.edgeColor ?? 0x4dffff);

  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);

  const dissolveUniforms = {
    uEdgeColor1: { value: new THREE.Vector3(edgeColor.r, edgeColor.g, edgeColor.b) },
    uEdgeColor2: { value: new THREE.Vector3(color2.r, color2.g, color2.b) },
    uFreq: { value: frequency },
    uAmp: { value: 16 },
    uProgress: { value: progressStart },
    uEdge: { value: edgeWidth },
    uDissolveMode: { value: 0 },
    uWipeDirection: { value: 0 },
    uWipeSoftness: { value: 0.15 },
    uWipeBounds: { value: new THREE.Vector2(bbox.min.y, bbox.max.y) },
  };

  const modifiedMaterials = [];
  const batchSerial =
    options.sharedDissolveBatchSerial != null
      ? options.sharedDissolveBatchSerial
      : ++_checkpointDissolveProgramSerial;
  applyDissolvePatches(root, dissolveUniforms, modifiedMaterials, batchSerial);
  return { dissolveUniforms, modifiedMaterials };
}

/**
 * Shadow-style noise dissolve (fragment hook after opaque_fragment) + edge particles.
 * Same API surface as legacy spawn warp for enemies: update, dispose, restart, freeze, unfreeze.
 *
 * @param {object} [options.dissolvePrecooked] - From {@link precookCheckpointDissolveMaterials}; skips patch pass on activate.
 */
export function beginCheckpointDissolve(root, game, options = {}) {
  const scene = game?.scene;
  const renderer = game?.renderer;
  const duration = options.duration ?? 3.5;
  const progressStart = options.progressStart ?? 18;
  const progressEnd = options.progressEnd ?? -18;
  const frequency = options.frequency ?? 0.5;
  const edgeWidth = options.edgeWidth ?? 0.85;
  let edgeColor = new THREE.Color(options.edgeColor ?? 0x8affff);
  let color2 = new THREE.Color(options.edgeColor2 ?? options.edgeColor ?? 0x4dffff);
  let particleColor = new THREE.Color(options.particleColor ?? 0x8affff);
  const particleSize = options.particleSize ?? 28;
  const particleDecimation = options.particleDecimation ?? 12;
  const enableParticles = options.particles !== false;
  const particleDispersion = options.particleDispersion ?? 6;
  const particleVelocitySpread = options.particleVelocitySpread ?? 0.12;
  /** Split CPU work: patches this frame, mergeGeometries + Points next frame (training gates). */
  const deferParticleAttach = options.deferParticleAttach === true;
  /** Training pool: seal/dispose do not strip dissolve hooks so the same materials stay precompiled. */
  const retainDissolveMaterials = options.retainDissolveMaterials === true;

  const precooked = options.dissolvePrecooked;
  const usesPrecooked = precooked != null;

  let dissolveUniforms;
  let modifiedMaterials;

  if (usesPrecooked) {
    dissolveUniforms = precooked.dissolveUniforms;
    modifiedMaterials = precooked.modifiedMaterials;
    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(root);
    dissolveUniforms.uWipeBounds.value.set(bbox.min.y, bbox.max.y);
    dissolveUniforms.uProgress.value = progressStart;
  } else {
    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(root);
    dissolveUniforms = {
      uEdgeColor1: { value: new THREE.Vector3(edgeColor.r, edgeColor.g, edgeColor.b) },
      uEdgeColor2: { value: new THREE.Vector3(color2.r, color2.g, color2.b) },
      uFreq: { value: frequency },
      uAmp: { value: 16 },
      uProgress: { value: progressStart },
      uEdge: { value: edgeWidth },
      uDissolveMode: { value: 0 },
      uWipeDirection: { value: 0 },
      uWipeSoftness: { value: 0.15 },
      uWipeBounds: { value: new THREE.Vector2(bbox.min.y, bbox.max.y) },
    };
    modifiedMaterials = [];
    applyDissolvePatches(root, dissolveUniforms, modifiedMaterials);
  }

  let particleMesh = null;
  let particleMaterial = null;
  let particleSystem = null;
  let decimatedGeo = null;
  let particleTexture = null;
  let elapsedOptions = 0;
  let finished = false;
  let disposed = false;
  let frozen = false;

  function attachParticles() {
    if (!enableParticles || !scene || !renderer) return;
    cleanupParticleBurst(scene, particleMesh, particleMaterial, particleTexture, decimatedGeo);
    particleMesh = null;
    particleMaterial = null;
    particleSystem = null;
    decimatedGeo = null;
    particleTexture = null;

    const burst = buildParticleBurst(
      root,
      scene,
      renderer,
      dissolveUniforms,
      particleColor,
      particleSize,
      particleDecimation,
      particleDispersion,
      particleVelocitySpread,
    );
    if (burst) {
      particleMesh = burst.particleMesh;
      particleMaterial = burst.particleMaterial;
      particleSystem = burst.particleSystem;
      decimatedGeo = burst.decimatedGeo;
      particleTexture = burst.particleTexture;
    }
  }

  function scheduleParticleAttach() {
    if (!enableParticles || !scene || !renderer) return;
    if (deferParticleAttach && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (disposed) return;
        attachParticles();
      });
    } else {
      attachParticles();
    }
  }

  scheduleParticleAttach();

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function cleanupGpuExtras() {
    cleanupParticleBurst(scene, particleMesh, particleMaterial, particleTexture, decimatedGeo);
    particleMesh = null;
    particleMaterial = null;
    particleSystem = null;
    particleTexture = null;
    decimatedGeo = null;
  }

  function seal() {
    if (finished) return;
    finished = true;
    dissolveUniforms.uProgress.value = progressEnd;
    if (!retainDissolveMaterials) {
      restoreDissolveModifiedMaterials(modifiedMaterials);
    }
    cleanupGpuExtras();
  }

  function refreshBounds() {
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root);
    dissolveUniforms.uWipeBounds.value.set(b.min.y, b.max.y);
  }

  const api = {
    materials: modifiedMaterials,
    warpUniforms: dissolveUniforms,
    progressStart,
    progressEnd,
    get finished() {
      return finished;
    },
    get disposed() {
      return disposed;
    },
    get frozen() {
      return frozen;
    },
    get particleMesh() {
      return particleMesh;
    },
    restart(opts = {}) {
      if (disposed) return;
      const hold = opts.hold === true;
      cleanupGpuExtras();
      if (!usesPrecooked) {
        restoreDissolveModifiedMaterials(modifiedMaterials);
      }
      refreshBounds();

      if (opts.color != null) {
        edgeColor = new THREE.Color(opts.color);
        color2 = new THREE.Color(opts.color);
        particleColor = new THREE.Color(opts.color);
        dissolveUniforms.uEdgeColor1.value.set(edgeColor.r, edgeColor.g, edgeColor.b);
        dissolveUniforms.uEdgeColor2.value.set(color2.r, color2.g, color2.b);
      }

      if (!usesPrecooked) {
        applyDissolvePatches(root, dissolveUniforms, modifiedMaterials);
      }
      scheduleParticleAttach();

      elapsedOptions = 0;
      finished = false;
      frozen = hold;
      dissolveUniforms.uProgress.value = progressStart;
      if (particleMesh) particleMesh.visible = false;
    },
    freeze() {
      if (disposed || finished) return;
      frozen = true;
    },
    unfreeze() {
      if (disposed || finished) return;
      frozen = false;
    },
    update(delta = 0.016) {
      if (disposed || finished) return false;
      if (frozen) return true;
      const dt = Math.min(0.1, Math.max(0, Number(delta) || 0));
      elapsedOptions += dt;
      const t = Math.min(1, elapsedOptions / duration);
      const eased = easeOutQuad(t);
      const progress = THREE.MathUtils.lerp(progressStart, progressEnd, eased);
      dissolveUniforms.uProgress.value = progress;

      const inTransition = progress > progressEnd && progress < progressStart;
      if (particleMesh) {
        particleMesh.visible = inTransition;
        if (inTransition && particleSystem) particleSystem.updateAttributesValues();
      }

      if (t >= 1) {
        seal();
        return false;
      }
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!finished && !retainDissolveMaterials) {
        restoreDissolveModifiedMaterials(modifiedMaterials);
      }
      cleanupGpuExtras();
      finished = true;
    },
  };

  api.update(0);
  return api;
}

/** Alias for ships / props using the same VFX as training gates. */
export const beginDissolveMaterialize = beginCheckpointDissolve;

export function prewarmCheckpointDissolve(renderer, camera, root) {
  if (!renderer?.compile || !camera || !root) return;
  const scene = new THREE.Scene();
  const cam = camera.clone();
  cam.position.set(0, 0, 0);
  cam.rotation.set(0, 0, 0);
  cam.updateMatrixWorld(true);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  root.position.set(0, 0, -12);
  root.updateMatrixWorld(true);
  scene.add(root);
  const warp = beginCheckpointDissolve(root, { scene, renderer }, { duration: 3 });
  warp.update(0.25);
  scene.updateMatrixWorld(true);
  renderer.compile(scene, cam);
  warp.dispose();
  scene.remove(root);
}
