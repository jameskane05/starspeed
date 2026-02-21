/**
 * LightManager.js - SCENE LIGHTING
 * =============================================================================
 *
 * Manages Three.js lights. SplatEdit lights removed for performance.
 *
 * =============================================================================
 */

import * as THREE from "three";
import GUI from "lil-gui";
import { lights } from "../data/lightData.js";
import { LEVELS } from "../data/gameData.js";
import { checkCriteria } from "../data/sceneData.js";

const DEFAULT_AMBIENT = { color: 0x667788, intensity: 4 };

class LightManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.sceneManager = options.sceneManager || null;
    this.gameManager = options.gameManager || null;
    this.gui = null;

    this.lights = new Map();

    const gameState = this.gameManager?.getState();
    this.loadLightsFromData(lights, gameState);

    const level = gameState?.currentLevel;
    if (level) this.updateAmbientForLevel(level);
  }

  updateAmbientForLevel(levelId) {
    const ambient = this.lights.get("ambient");
    if (!ambient) return;

    const levelConfig = LEVELS[levelId];
    const base = lights.ambient || {};
    const fallback = { color: base.color ?? DEFAULT_AMBIENT.color, intensity: base.intensity ?? DEFAULT_AMBIENT.intensity };
    const color = levelConfig?.ambientColor ?? fallback.color;
    const intensity = levelConfig?.ambientIntensity ?? fallback.intensity;

    ambient.color.setHex(color);
    ambient.intensity = intensity;
  }

  loadLightsFromData(lightsData, gameState = null) {
    for (const [key, config] of Object.entries(lightsData)) {
      if (gameState && config.criteria) {
        if (!checkCriteria(gameState, config.criteria)) {
          continue;
        }
      }

      try {
        this.createLight(config);
      } catch (error) {
        console.error(`Error creating light "${key}":`, error);
      }
    }

    console.log(`[LightManager] Created ${this.lights.size} lights`);
  }

  createLight(config) {
    switch (config.type) {
      case "AmbientLight":
        return this.createAmbientLight(config);
      case "DirectionalLight":
        return this.createDirectionalLight(config);
      case "PointLight":
        return this.createPointLight(config);
      case "SpotLight":
        return this.createSpotLight(config);
      default:
        console.warn(`Unknown light type "${config.type}"`);
        return null;
    }
  }

  createAmbientLight(config = {}) {
    const light = new THREE.AmbientLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0
    );

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  createDirectionalLight(config = {}) {
    const light = new THREE.DirectionalLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  createPointLight(config = {}) {
    const light = new THREE.PointLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0,
      config.distance ?? 0,
      config.decay ?? 2
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);
    return light;
  }

  createSpotLight(config = {}) {
    const light = new THREE.SpotLight(
      config.color ?? 0xffffff,
      config.intensity ?? 1.0,
      config.distance ?? 0,
      config.angle ?? Math.PI / 3,
      config.penumbra ?? 0,
      config.decay ?? 2
    );

    if (config.position) {
      light.position.set(
        config.position.x ?? 0,
        config.position.y ?? 0,
        config.position.z ?? 0
      );
    }

    if (config.castShadow !== undefined) {
      light.castShadow = config.castShadow;
    }

    if (config.id) {
      this.lights.set(config.id, light);
    }

    this.scene.add(light);

    if (config.target) {
      light.target.position.set(
        config.target.x ?? 0,
        config.target.y ?? 0,
        config.target.z ?? 0
      );
      this.scene.add(light.target);
    }

    return light;
  }

  getLight(id) {
    return this.lights.get(id) || null;
  }

  removeLight(id) {
    const light = this.lights.get(id);
    if (light) {
      this.scene.remove(light);
      this.lights.delete(id);
    }
  }

  showGUI() {
    if (this.gui) return;
    this.gui = new GUI({ title: "Lighting" });

    for (const [id, light] of this.lights) {
      const folder = this.gui.addFolder(id);

      folder.add(light, "intensity", 0, 20, 0.01).name("Intensity");

      const colorObj = { color: `#${light.color.getHexString()}` };
      folder.addColor(colorObj, "color").name("Color").onChange((v) => {
        light.color.set(v);
      });

      if (light.position) {
        folder.add(light.position, "x", -100, 100, 0.5).name("X");
        folder.add(light.position, "y", -100, 100, 0.5).name("Y");
        folder.add(light.position, "z", -100, 100, 0.5).name("Z");
      }

      if (light.distance !== undefined) {
        folder.add(light, "distance", 0, 200, 1).name("Distance");
      }

      if (light.decay !== undefined) {
        folder.add(light, "decay", 0, 5, 0.1).name("Decay");
      }

      folder.close();
    }

    // Quick add new light
    const addFolder = this.gui.addFolder("+ Add Light");
    const addOpts = { type: "PointLight", intensity: 5, distance: 50, color: "#ffffff" };
    addFolder.add(addOpts, "type", ["AmbientLight", "DirectionalLight", "PointLight", "SpotLight"]);
    addFolder.add(addOpts, "intensity", 0, 50, 0.5);
    addFolder.add(addOpts, "distance", 0, 200, 1);
    addFolder.addColor(addOpts, "color");
    addFolder.add({ add: () => {
      const newId = `custom-${this.lights.size}`;
      this.createLight({
        id: newId,
        type: addOpts.type,
        color: new THREE.Color(addOpts.color).getHex(),
        intensity: addOpts.intensity,
        distance: addOpts.distance,
        decay: 2,
        position: { x: 0, y: 5, z: 0 },
      });
      this.hideGUI();
      this.showGUI();
    }}, "add").name("Create");
    addFolder.close();

    // Log current values button
    this.gui.add({ log: () => {
      console.log("=== Light Settings ===");
      for (const [id, light] of this.lights) {
        const entry = { id, type: light.type, color: `0x${light.color.getHexString()}`, intensity: light.intensity };
        if (light.position) entry.position = { x: +light.position.x.toFixed(2), y: +light.position.y.toFixed(2), z: +light.position.z.toFixed(2) };
        if (light.distance !== undefined) entry.distance = light.distance;
        if (light.decay !== undefined) entry.decay = light.decay;
        console.log(JSON.stringify(entry));
      }
    }}, "log").name("Log to Console");
  }

  hideGUI() {
    if (this.gui) {
      this.gui.destroy();
      this.gui = null;
    }
  }

  toggleGUI() {
    if (this.gui) this.hideGUI();
    else this.showGUI();
  }

  destroy() {
    this.hideGUI();
    for (const [id, light] of this.lights) {
      this.scene.remove(light);
    }
    this.lights.clear();
  }
}

export default LightManager;
