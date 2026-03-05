import * as THREE from "three";
import { GAME_STATES } from "../data/gameData.js";
import {
  getSceneObjectsForState,
  getSceneObject,
  LEVEL_OBJECT_IDS,
} from "../data/sceneData.js";
import NetworkManager from "../network/NetworkManager.js";
import MenuManager from "../ui/MenuManager.js";

function getLevelOcclusion(game) {
  const level = game.gameManager.getState().currentLevel;
  const levelDataId = level ? `${level}LevelData` : null;
  return (
    (levelDataId && game.sceneManager.getObject(levelDataId)) ||
    game.sceneManager.getObject("levelOcclusion") ||
    game.sceneManager.getObject("newworldLevelData") ||
    game.sceneManager.getObject("newworldOcclusion")
  );
}

export async function preloadLevel(game) {
  if (game.isLoadingLevel) return;

  console.log("[Game] Preloading level...");
  game.isLoadingLevel = true;

  try {
    let state = game.gameManager.getState();
    let objectsToLoad = getSceneObjectsForState({
      ...state,
      currentState: GAME_STATES.PLAYING,
    });

    const loads = [];
    for (const obj of objectsToLoad) {
      if (game.sceneManager.hasObject(obj.id)) continue;
      loads.push(
        game.sceneManager
          .loadObject(obj, obj.type === "splat" ? (p) => {} : null)
          .catch((err) => {
            console.warn(`[Game] Failed to load ${obj.id}:`, err.message);
            throw err;
          }),
      );
    }
    await Promise.all(loads);
    console.log("[Game] Level preloaded successfully");
  } catch (err) {
    console.warn(
      "[Game] Level preload failed, falling back to newworld:",
      err?.message,
    );
    const current = game.gameManager.getState().currentLevel;
    if (current && current !== "newworld") {
      game.gameManager.setState({ currentLevel: "newworld" });
      if (game.isMultiplayer && NetworkManager.isHost()) {
        NetworkManager.setLevel("newworld");
      }
    }
  }

  game.isLoadingLevel = false;
}

export async function loadLevelAndStart(game) {
  game.gameManager.setState({
    currentState: GAME_STATES.PLAYING,
  });

  const objectsToLoad = getSceneObjectsForState(game.gameManager.getState());
  const loads = [];
  for (const obj of objectsToLoad) {
    if (game.sceneManager.hasObject(obj.id)) continue;
    loads.push(
      game.sceneManager.loadObject(
        obj,
        obj.type === "splat"
          ? (progress) => {
              MenuManager.updateLoadingProgress(progress);
            }
          : null,
      ),
    );
  }
  if (loads.length > 0) {
    console.log("[Game] Loading level objects...");
    try {
      await Promise.all(loads);
      console.log("[Game] Level loaded successfully");
    } catch (err) {
      console.error("[Game] Level load failed:", err);
    }
  } else {
    console.log("[Game] Level already preloaded");
  }

  MenuManager.loadingComplete();
}

export function extractSpawnPoints(game) {
  game.spawnPoints = [];
  game.playerSpawnPoints = [];
  game.missileSpawnPoints = [];
  game.dynamicSceneElementManager?.setElements([]);

  const level = game.gameManager.getState().currentLevel;
  const levelDataId = level ? `${level}LevelData` : null;
  const levelData = levelDataId
    ? game.sceneManager.getObject(levelDataId)
    : null;
  if (levelData?.userData?.extractedSpawnPoints) {
    const { enemy, player, missile } =
      levelData.userData.extractedSpawnPoints;
    game.spawnPoints = enemy;
    game.playerSpawnPoints = player;
    game.missileSpawnPoints = missile;
    game.dynamicSceneElementManager?.setElements(
      levelData.userData.dynamicSceneElements || [],
    );
    console.log(
      `[Game] Parsed ${levelDataId}: ${game.spawnPoints.length} enemies, ${game.playerSpawnPoints.length} player spawns, ${game.missileSpawnPoints.length} missile pickups`,
    );
    const levelMesh = getLevelOcclusion(game);
    if (levelMesh) {
      const box = new THREE.Box3().setFromObject(levelMesh);
      game._levelBounds = {
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3()),
      };
    }
    return;
  }

  const spawnId = game.sceneManager.hasObject("newworldSpawns")
    ? "newworldSpawns"
    : game.sceneManager.hasObject("levelSpawns")
      ? "levelSpawns"
      : null;
  const spawnModel = spawnId ? game.sceneManager.getObject(spawnId) : null;

  if (spawnModel) {
    spawnModel.updateMatrixWorld(true);
    spawnModel.traverse((child) => {
      if (!child.isMesh) return;
      const pos = new THREE.Vector3();
      child.getWorldPosition(pos);
      const name = child.name || "";
      if (name.startsWith("Enemy")) game.spawnPoints.push(pos);
      else if (name.startsWith("Spawn")) game.playerSpawnPoints.push(pos);
      else if (name.startsWith("Missile")) game.missileSpawnPoints.push(pos);
    });
    game.sceneManager.removeObject(spawnId);
    console.log(
      `[Game] Parsed ${spawnId}: ${game.spawnPoints.length} enemies, ${game.playerSpawnPoints.length} player spawns, ${game.missileSpawnPoints.length} missile pickups`,
    );
  } else {
    const fallbackMesh = getLevelOcclusion(game);
    if (!fallbackMesh) {
      console.warn(
        "[Game] No spawn GLB and no occlusion mesh — cannot extract spawn points",
      );
      return;
    }

    fallbackMesh.updateMatrixWorld(true);
    const toRemove = [];
    fallbackMesh.traverse((child) => {
      if (!child.isMesh || !child.name?.startsWith("Cube")) return;
      const pos = new THREE.Vector3();
      child.getWorldPosition(pos);
      game.spawnPoints.push(pos);
      toRemove.push(child);
    });

    for (const obj of toRemove) {
      obj.removeFromParent();
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    console.log(
      `[Game] Extracted ${game.spawnPoints.length} spawn points from occlusion mesh (fallback)`,
    );
  }

  const levelMesh = getLevelOcclusion(game);
  if (levelMesh) {
    const box = new THREE.Box3().setFromObject(levelMesh);
    game._levelBounds = {
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
    };
  }
}

export { LEVEL_OBJECT_IDS, getSceneObject, getSceneObjectsForState };
