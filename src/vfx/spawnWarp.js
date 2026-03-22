import * as THREE from "three";

function patchWarpMaterial(material, uniforms) {
  const cloned = material.clone();
  const originalDepthWrite = cloned.depthWrite;
  cloned.transparent = true;
  cloned.depthWrite = false;

  if (cloned.isMeshStandardMaterial || cloned.isMeshPhysicalMaterial) {
    cloned.onBeforeCompile = (shader) => {
      shader.uniforms.uSpawnWarpProgress = uniforms.progress;
      shader.uniforms.uSpawnWarpColor = uniforms.color;
      shader.uniforms.uSpawnWarpEdge = uniforms.edgeStrength;

      shader.vertexShader =
        `
        varying vec3 vSpawnWarpWorld;
      ` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          vec4 spawnWarpWorld = modelMatrix * vec4(position, 1.0);
          vSpawnWarpWorld = spawnWarpWorld.xyz;
        `,
        );

      shader.fragmentShader =
        `
        uniform float uSpawnWarpProgress;
        uniform vec3 uSpawnWarpColor;
        uniform float uSpawnWarpEdge;
        varying vec3 vSpawnWarpWorld;

        float spawnWarpHash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
      ` +
        shader.fragmentShader.replace(
          "#include <output_fragment>",
          `
          float warpNoise = spawnWarpHash31(floor(vSpawnWarpWorld * 3.75));
          float warpReveal = smoothstep(
            uSpawnWarpProgress - 0.24,
            uSpawnWarpProgress + 0.03,
            warpNoise
          );
          float warpEdge = 1.0 - smoothstep(
            0.0,
            0.075,
            abs(warpNoise - uSpawnWarpProgress)
          );
          diffuseColor.a *= warpReveal;
          if (diffuseColor.a < 0.02) discard;
          totalEmissiveRadiance += uSpawnWarpColor * warpEdge * uSpawnWarpEdge;
          #include <output_fragment>
        `,
        );
    };
    cloned.customProgramCacheKey = () =>
      `${material.customProgramCacheKey?.() ?? ""}|spawn-warp-v1`;
  }

  cloned.needsUpdate = true;
  cloned.userData._spawnWarpOriginalDepthWrite = originalDepthWrite;
  return cloned;
}

export function beginSpawnWarp(root, options = {}) {
  const duration = options.duration ?? 2.35;
  const baseScale = root.scale.clone();
  const warpColor = new THREE.Color(options.color ?? 0x8affff);
  const uniforms = {
    progress: { value: 0 },
    color: { value: warpColor },
    edgeStrength: { value: 4.8 },
  };
  const materials = [];

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const sourceMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const warpedMaterials = sourceMaterials.map((material) => {
      const warped = patchWarpMaterial(material, uniforms);
      materials.push(warped);
      return warped;
    });
    child.material = Array.isArray(child.material)
      ? warpedMaterials
      : warpedMaterials[0];
  });

  const light = new THREE.PointLight(warpColor, 0, 18, 2);
  light.position.set(0, 0, 0);
  root.add(light);

  let elapsed = 0;
  let active = true;

  return {
    materials,
    get active() {
      return active;
    },
    update(delta = 0.016) {
      if (!active) return false;
      elapsed += delta;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - t) * (1 - t);
      uniforms.progress.value = Math.min(1.25, eased * 1.22);
      uniforms.edgeStrength.value = 5.0 - eased * 2.4;

      const pulse = Math.sin(t * Math.PI);
      light.intensity = (1 - t) * 6.5 + pulse * 2.0;
      light.distance = 8 + pulse * 12;

      const scale = 0.94 + eased * 0.06;
      root.scale.copy(baseScale).multiplyScalar(scale);

      for (const material of materials) {
        material.opacity = 0.12 + eased * 0.88;
      }

      if (t >= 1) {
        root.scale.copy(baseScale);
        root.remove(light);
        for (const material of materials) {
          material.depthWrite =
            material.userData._spawnWarpOriginalDepthWrite ?? true;
          material.opacity = 1;
        }
        active = false;
        return false;
      }

      return true;
    },
    dispose() {
      root.scale.copy(baseScale);
      root.remove(light);
      active = false;
    },
  };
}

export function prewarmSpawnWarp(renderer, camera, root, options = {}) {
  if (!renderer || !camera || !root) return;

  const tempScene = new THREE.Scene();
  const tempCamera = camera.clone();
  tempCamera.position.set(0, 0, 0);
  tempCamera.rotation.set(0, 0, 0);
  tempCamera.updateMatrixWorld(true);

  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(2, 3, 4);
  tempScene.add(ambient, key);

  root.position.set(0, 0, -8);
  root.updateMatrixWorld(true);
  tempScene.add(root);

  const warp = beginSpawnWarp(root, options);
  warp.update(0.35);
  tempScene.updateMatrixWorld(true);
  renderer.compile(tempScene, tempCamera);

  warp.dispose();
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of mats) {
      material?.dispose?.();
    }
    if (options.disposeGeometry) {
      child.geometry?.dispose?.();
    }
  });
}
