/**
 * SceneManager.js - SCENE OBJECT LOADING AND MANAGEMENT
 * =============================================================================
 *
 * Loads and manages 3D scene content including Gaussian splats (via SparkRenderer)
 * and GLTF models (via Three.js GLTFLoader).
 *
 * =============================================================================
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SplatMesh } from "@sparkjsdev/spark";
import { createTrimeshCollider } from "../physics/Physics.js";

class SceneManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.renderer = options.renderer || null;
    this.sparkRenderer = options.sparkRenderer || null;
    this.physicsManager = options.physicsManager || null;

    this.objects = new Map(); // id -> THREE.Object3D
    this.objectData = new Map(); // id -> config data
    this.gltfLoader = new GLTFLoader();
    this.loadingPromises = new Map();
  }

  /**
   * Load a scene object based on its config
   * @param {Object} objectData - Object configuration from sceneData.js
   * @param {Function} onProgress - Optional progress callback (0-1)
   * @returns {Promise<THREE.Object3D>}
   */
  async loadObject(objectData, onProgress = null) {
    const { id, type } = objectData;

    // Already loading?
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id);
    }

    // Already loaded?
    if (this.objects.has(id)) {
      console.warn(`[SceneManager] Object "${id}" already loaded`);
      return this.objects.get(id);
    }

    let loadPromise;

    switch (type) {
      case "splat":
        loadPromise = this._loadSplat(objectData, onProgress);
        break;
      case "gltf":
        loadPromise = this._loadGLTF(objectData, onProgress);
        break;
      default:
        console.error(`[SceneManager] Unknown object type: ${type}`);
        return null;
    }

    this.loadingPromises.set(id, loadPromise);

    try {
      const object = await loadPromise;
      this.objects.set(id, object);
      this.objectData.set(id, objectData);
      this.loadingPromises.delete(id);
      console.log(`[SceneManager] Loaded: ${id} (${type})`);

      if (objectData.gizmo && window.gizmoManager) {
        window.gizmoManager.registerObject(object, id, type);
      }

      return object;
    } catch (error) {
      this.loadingPromises.delete(id);
      console.error(`[SceneManager] Error loading "${id}":`, error);
      throw error;
    }
  }

  /**
   * Load a gaussian splat
   */
  async _loadSplat(objectData, onProgress = null) {
    const { id, path, position, rotation, scale, quaternion, paged } =
      objectData;

    console.log(
      `[SceneManager] Loading splat: ${path}${paged ? " (paged/LOD)" : ""}`,
    );

    const splatMesh = new SplatMesh({
      url: path,
      editable: true, // Allow SplatEdit layers to affect this splat (for headlight effects)
      paged: paged || false, // Enable streaming for LOD files
      onProgress: (progress) => {
        if (onProgress) onProgress(progress);
      },
    });

    // Apply transform
    if (quaternion) {
      splatMesh.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      );
    } else if (rotation) {
      splatMesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    }

    if (position) {
      splatMesh.position.set(position.x || 0, position.y || 0, position.z || 0);
    }

    if (scale !== undefined) {
      if (typeof scale === "number") {
        splatMesh.scale.setScalar(scale);
      } else if (typeof scale === "object") {
        splatMesh.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
      }
    }

    this.scene.add(splatMesh);

    // Wait for initialization with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Splat load timeout: ${path}`)), 60000),
    );

    try {
      await Promise.race([splatMesh.initialized, timeout]);
    } catch (err) {
      console.error(`[SceneManager] Splat load error:`, err);
      // Still return the mesh even if timeout - it might load eventually
    }

    return splatMesh;
  }

  /**
   * Load a GLTF model
   */
  _loadGLTF(objectData) {
    return new Promise((resolve, reject) => {
      const { id, path, position, rotation, scale, options } = objectData;

      this.gltfLoader.load(
        path,
        (gltf) => {
          const model = gltf.scene;

          // Apply transform
          if (position) {
            model.position.set(
              position.x || 0,
              position.y || 0,
              position.z || 0,
            );
          }

          if (rotation) {
            model.rotation.set(
              rotation.x || 0,
              rotation.y || 0,
              rotation.z || 0,
            );
          }

          if (scale !== undefined) {
            if (typeof scale === "number") {
              model.scale.setScalar(scale);
            } else if (typeof scale === "object") {
              model.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
            }
          }

          // Handle options
          if (options) {
            if (options.visible === false) {
              model.visible = false;
            }

            // Occluder mesh: writes to depth buffer for particle/projectile occlusion
            if (options.occluder) {
              this._applyOccluderMaterial(model, options.debugWireframe);
            }

            if (options.physicsCollider) {
              this._createPhysicsCollider(id, model, position);
            }
          }

          this.scene.add(model);
          resolve(model);
        },
        undefined,
        (error) => {
          reject(error);
        },
      );
    });
  }

  /**
   * Apply occluder material to a model - writes to depth buffer to occlude transparent objects
   * @param {THREE.Object3D} model - The model to apply the material to
   * @param {boolean} debugWireframe - If true, show a visible wireframe for alignment
   */
  _applyOccluderMaterial(model, debugWireframe = false) {
    model.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }

        if (debugWireframe) {
          child.material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
            depthWrite: true,
            depthTest: true,
          });
        } else {
          child.material = new THREE.ShaderMaterial({
            vertexShader: `
              void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              void main() {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
              }
            `,
            depthTest: true,
            depthWrite: true,
            transparent: true,
            side: THREE.DoubleSide,
          });
        }
        child.castShadow = false;
        child.receiveShadow = false;
        child.renderOrder = -50;
      }
    });
  }

  /**
   * Set occluder debug mode on/off for a loaded object
   * @param {string} id - Object ID
   * @param {boolean} debugWireframe - If true, show wireframe; if false, invisible occluder
   */
  setOccluderDebug(id, debugWireframe) {
    const object = this.objects.get(id);
    if (object) {
      this._applyOccluderMaterial(object, debugWireframe);
    }
  }

  _createPhysicsCollider(id, model, position) {
    const vertices = [];
    const indices = [];
    let indexOffset = 0;

    model.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name && child.name.startsWith("Cube")) return;

      const geo = child.geometry;
      const pos = geo.attributes.position;
      const idx = geo.index;

      child.updateWorldMatrix(true, false);
      const matrix = child.matrixWorld;
      const modelPos = model.position;
      const localMatrix = matrix.clone();
      localMatrix.elements[12] -= modelPos.x;
      localMatrix.elements[13] -= modelPos.y;
      localMatrix.elements[14] -= modelPos.z;

      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(localMatrix);
        vertices.push(v.x, v.y, v.z);
      }

      if (idx) {
        for (let i = 0; i < idx.count; i++) {
          indices.push(idx.getX(i) + indexOffset);
        }
      } else {
        for (let i = 0; i < pos.count; i++) {
          indices.push(i + indexOffset);
        }
      }
      indexOffset += pos.count;
    });

    if (vertices.length === 0) {
      console.warn(
        `[SceneManager] No geometry found for physics collider "${id}"`,
      );
      return;
    }

    const px = position?.x || 0;
    const py = position?.y || 0;
    const pz = position?.z || 0;
    createTrimeshCollider(vertices, indices, px, py, pz);
    console.log(
      `[SceneManager] Created trimesh collider for "${id}" (${vertices.length / 3} verts, ${indices.length / 3} tris)`,
    );
  }

  /**
   * Remove an object from the scene
   */
  removeObject(id) {
    const object = this.objects.get(id);
    if (object) {
      // Dispose SplatMesh
      if (object.dispose) {
        object.dispose();
      }

      // Remove from scene and parent
      object.removeFromParent();
      this.scene.remove(object);

      // Dispose geometries and materials
      const toDispose = [];
      object.traverse((child) => toDispose.push(child));
      for (const child of toDispose) {
        child.removeFromParent();
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }

      this.objects.delete(id);
      this.objectData.delete(id);
      console.log(`[SceneManager] Removed: ${id}`);
    }
  }

  /**
   * Get a loaded object by ID
   */
  getObject(id) {
    return this.objects.get(id) || null;
  }

  /**
   * Check if an object is loaded
   */
  hasObject(id) {
    return this.objects.has(id);
  }

  /**
   * Get all loaded object IDs
   */
  getObjectIds() {
    return Array.from(this.objects.keys());
  }

  /**
   * Clean up all objects
   */
  destroy() {
    for (const id of this.objects.keys()) {
      this.removeObject(id);
    }
  }
}

export default SceneManager;
