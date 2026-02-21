/**
 * sceneData.js - SCENE OBJECT DEFINITIONS
 * =============================================================================
 *
 * Defines all scene objects (splats, GLTFs, etc.) with their properties.
 *
 * Each object contains:
 * - id: Unique identifier
 * - type: "splat" | "gltf"
 * - path: Asset file path
 * - position, rotation, scale: Transform
 * - priority: Loading priority (higher = first)
 * - preload: If true, load during initial loading screen
 * - criteria: Optional state conditions for loading/unloading
 *
 * =============================================================================
 */

import { GAME_STATES } from "./gameData.js";

export const sceneObjects = {
  level: {
    id: "level",
    type: "splat",
    path: "./splats/spaceship/spaceship-lod-0.spz",
    description: "Level environment gaussian splat with LOD",
    //position: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: -90, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 100,
    preload: false,
    paged: true,
    gizmo: false,
    criteria: {
      currentLevel: "hangar",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  levelOcclusion: {
    id: "levelOcclusion",
    type: "gltf",
    path: "./starstrafe-level1-phys.glb",
    position: { x: 4.51, y: 2.23, z: -3.37 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 95,
    preload: false,
    gizmo: false,
    options: {
      occluder: true,
      debugWireframe: false,
      physicsCollider: true,
    },
    criteria: {
      currentLevel: "hangar",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  // === New World level ===

  newworldLevel: {
    id: "newworldLevel",
    type: "splat",
    path: "./splats/spaceship/spaceship-lod-0.spz",
    description: "New World environment gaussian splat with LOD",
    position: { x: -56.68, y: 0.0, z: 29.79 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 0.514,
    priority: 100,
    preload: false,
    paged: true,
    gizmo: false,
    criteria: {
      currentLevel: "newworld",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  newworldLevelData: {
    id: "newworldLevelData",
    type: "gltf",
    path: "./spaceship-data.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 95,
    preload: false,
    gizmo: false,
    options: {
      occluder: true,
      debugWireframe: false,
      physicsCollider: true,
      combinedLevel: { geometryName: "LevelGeometry" },
    },
    criteria: {
      currentLevel: "newworld",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  redarenaLevel: {
    id: "redarenaLevel",
    type: "splat",
    path: "./splats/red-arena-1.ply",
    description: "Red Arena environment gaussian splat",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 87.86,
    priority: 100,
    preload: false,
    paged: false,
    gizmo: false,
    criteria: {
      currentLevel: "redarena",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  redarenaLevelData: {
    id: "redarenaLevelData",
    type: "gltf",
    path: "./splats/arena-data.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 95,
    preload: false,
    gizmo: false,
    options: {
      occluder: true,
      debugWireframe: false,
      physicsCollider: true,
      combinedLevel: {
        geometryName: "LevelGeometry",
        dynamicSceneElements: {
          meshNamePrefix: "Pillar",
          ambientTint: 0xff4444,
          ambientTintStrength: 0.1,
        },
      },
    },
    criteria: {
      currentLevel: "redarena",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  arenatechLevel: {
    id: "arenatechLevel",
    type: "splat",
    path: "./splats/arena-tech.ply",
    description: "Tech Arena environment gaussian splat",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 30.2362,
    priority: 100,
    preload: false,
    paged: false,
    gizmo: false,
    criteria: {
      currentLevel: "arenatech",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  arenatechLevelData: {
    id: "arenatechLevelData",
    type: "gltf",
    path: "./splats/arena-data.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 95,
    preload: false,
    gizmo: false,
    options: {
      occluder: true,
      debugWireframe: false,
      physicsCollider: true,
      combinedLevel: {
        geometryName: "LevelGeometry",
        dynamicSceneElements: {
          meshNamePrefix: "Pillar",
          ambientTint: 0xd0c0a8,
          ambientTintStrength: 0.05,
        },
      },
    },
    criteria: {
      currentLevel: "arenatech",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  icetestLevel: {
    id: "icetestLevel",
    type: "splat",
    path: "./splats/Ice Crystal Mining Facility.ply",
    description: "Ice Crystal Mining Facility gaussian splat",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 5,
    priority: 100,
    preload: false,
    paged: false,
    gizmo: false,
    criteria: {
      currentLevel: "icetest",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },

  icetestLevelData: {
    id: "icetestLevelData",
    type: "gltf",
    path: "./splats/ice-mine-test-data.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    priority: 95,
    preload: false,
    gizmo: false,
    options: {
      occluder: true,
      debugWireframe: false,
      physicsCollider: true,
      combinedLevel: { geometryName: "LevelGeometry" },
    },
    criteria: {
      currentLevel: "icetest",
      currentState: { $in: [GAME_STATES.PLAYING, GAME_STATES.PAUSED] },
    },
  },
};

/**
 * Check if criteria matches current state
 * Supports simple equality and comparison operators ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin)
 */
export function checkCriteria(state, criteria) {
  if (!criteria) return true;

  for (const [key, condition] of Object.entries(criteria)) {
    const stateValue = state[key];

    if (typeof condition === "object" && condition !== null) {
      // Handle comparison operators
      if (condition.$eq !== undefined && stateValue !== condition.$eq)
        return false;
      if (condition.$ne !== undefined && stateValue === condition.$ne)
        return false;
      if (condition.$gt !== undefined && !(stateValue > condition.$gt))
        return false;
      if (condition.$gte !== undefined && !(stateValue >= condition.$gte))
        return false;
      if (condition.$lt !== undefined && !(stateValue < condition.$lt))
        return false;
      if (condition.$lte !== undefined && !(stateValue <= condition.$lte))
        return false;
      if (condition.$in !== undefined && !condition.$in.includes(stateValue))
        return false;
      if (condition.$nin !== undefined && condition.$nin.includes(stateValue))
        return false;
    } else {
      // Simple equality check
      if (stateValue !== condition) return false;
    }
  }

  return true;
}

/**
 * Get scene objects that should be loaded for the current game state
 * @param {Object} state - Current game state
 * @param {Object} options - Options object
 * @param {boolean} options.preloadOnly - If true, only return preload: true objects
 * @returns {Array<Object>} Array of scene objects to load
 */
export function getSceneObjectsForState(state, options = {}) {
  const sortedObjects = Object.values(sceneObjects).sort(
    (a, b) => (b.priority || 0) - (a.priority || 0),
  );

  const matchingObjects = [];

  for (const obj of sortedObjects) {
    // Filter by preload flag if requested
    if (options.preloadOnly && obj.preload !== true) {
      continue;
    }

    // Check criteria
    if (obj.criteria && !checkCriteria(state, obj.criteria)) {
      continue;
    }

    matchingObjects.push(obj);
  }

  return matchingObjects;
}

/**
 * Get a scene object by ID
 */
export function getSceneObject(id) {
  return sceneObjects[id] || null;
}

export default sceneObjects;
