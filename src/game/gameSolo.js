/**
 * gameSolo.js - SOLO PLAY MODE SETUP AND ENTRY
 * =============================================================================
 *
 * ROLE: Enters solo (single-player) play: loads level, spawns player, enemies,
 * and missile pickups; shows game canvas and hides menu. Optional VR entry.
 *
 * KEY RESPONSIBILITIES:
 * - startSoloDebug(game): set isMultiplayer false, update lights for level, init engine audio
 * - Optional XR enter; preload level and enemy ship assets; create local Player
 * - Spawn enemies (gameEnemies), missile pickups; start game loop in PLAYING state
 * - Used when starting from menu or debug; multiplayer flow is in gameMultiplayer.js
 *
 * RELATED: gameLevel.js, gameEnemies.js, Player.js, Enemy.js, ShipDestruction.js,
 * EngineAudio.js, MenuManager.js, LightManager.js.
 *
 * =============================================================================
 */

import * as THREE from "three";
import { Player } from "../entities/Player.js";
import {
  loadShipModels,
  shipModels,
  reapplyShipMaterials,
} from "../entities/Enemy.js";
import { prefractureModels } from "../vfx/ShipDestruction.js";
import { GAME_STATES } from "../data/gameData.js";
import MenuManager from "../ui/MenuManager.js";
import engineAudio from "../audio/EngineAudio.js";
import * as gameEnemies from "./gameEnemies.js";

export async function startSoloDebug(game) {
  game.isMultiplayer = false;
  game.dynamicSceneElementManager?.setElements([]);

  const level = game.gameManager.getState().currentLevel;
  game.lightManager?.updateAmbientForLevel(level);

  engineAudio.init();

  const xrActive = game.xrManager?.supported
    ? await game.xrManager.enterVR(game.scene, game.camera)
    : false;

  await game.preloadLevel();
  await ensureEnemyShipAssetsLoaded(game);

  game.renderer.domElement.style.display = "block";
  MenuManager.hide();

  game.player = new Player(
    game.camera,
    game.input,
    game.level,
    game.scene,
    { game },
  );
  game.player.health = 100;
  game.player.maxHealth = 100;
  game.player.missiles = 6;
  game.player.maxMissiles = 6;
  game.camera.quaternion.setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    (-70 * Math.PI) / 180,
  );

  if (xrActive) {
    game.player.setXRMode(game.xrManager);
  }

  game._extractSpawnPoints();

  if (game.playerSpawnPoints.length > 0) {
    const sp =
      game.playerSpawnPoints[
        Math.floor(Math.random() * game.playerSpawnPoints.length)
      ];
    game.camera.position.copy(sp);
  }

  game.dynamicLights?.warmupShaders(
    game.renderer,
    game.camera,
    game.spawnPoints.length,
  );
  game.spawnEnemies();
  gameEnemies.spawnMissilePickups(game);

  if (!xrActive && !game.input.mobile.shouldSkipPointerLock()) {
    document.body.requestPointerLock?.()?.catch?.(() => {});
  }
  document.getElementById("hud").classList.add("active");

  game.gameManager.setState({
    currentState: GAME_STATES.PLAYING,
    isRunning: true,
    isMultiplayer: false,
  });
}

export async function ensureEnemyShipAssetsLoaded(game) {
  if (game.enemyShipAssetsPromise) {
    await game.enemyShipAssetsPromise;
    return;
  }
  game.enemyShipAssetsPromise = (async () => {
    await loadShipModels();
    prefractureModels(shipModels);
    await reapplyShipMaterials(shipModels);
  })();
  await game.enemyShipAssetsPromise;
}
