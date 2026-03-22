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
import { prewarmSpawnWarp } from "../vfx/spawnWarp.js";
import { GAME_STATES } from "../data/gameData.js";
import MenuManager from "../ui/MenuManager.js";
import engineAudio from "../audio/EngineAudio.js";
import * as gameEnemies from "./gameEnemies.js";
import MissionManager from "../missions/MissionManager.js";
import { updateLeaderboardButtonVisibility } from "./gameInGameUI.js";
import {
  showFirstViewLoading,
  hideFirstViewLoading,
  waitForFirstViewReady,
} from "./gameFirstViewLoading.js";

export async function startSoloDebug(game) {
  game.isMultiplayer = false;
  updateLeaderboardButtonVisibility(game);
  game.dynamicSceneElementManager?.setElements([]);
  const missionConfig = game.pendingMissionConfig;
  const loadingTracker = game.levelLoadingTracker;

  if (!game.levelLoadPromise) {
    loadingTracker?.reset();
  }
  MenuManager.showBackgroundLoading();
  loadingTracker?.registerTask("solo-xr");
  loadingTracker?.registerTask("solo-enemy-assets");
  loadingTracker?.registerTask("solo-player-setup");
  showFirstViewLoading();

  const level = game.gameManager.getState().currentLevel;
  game.lightManager?.updateAmbientForLevel(level);

  engineAudio.init();

  const xrActive = game.xrManager?.supported
    ? await game.xrManager.enterVR(game.scene, game.camera)
    : false;
  loadingTracker?.completeTask("solo-xr");

  await game.preloadLevel();
  await ensureEnemyShipAssetsLoaded(game, loadingTracker);

  game.player = new Player(game.camera, game.input, game.level, game.scene, {
    game,
  });
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
  if (!game.missionManager) {
    game.missionManager = new MissionManager(game);
  }

  if (!missionConfig) {
    game.missionManager.stopMission();
    game.spawnEnemies();
    gameEnemies.spawnMissilePickups(game);
  } else {
    if (game._missilePickups) {
      for (const pickup of game._missilePickups) {
        pickup.collectible?.dispose?.();
      }
      game._missilePickups = [];
    }
    game.enemyRespawnQueue.length = 0;
    game.gameManager.clearMissionState({
      currentMissionId: missionConfig.missionId,
      missionLevelId: missionConfig.levelId,
      missionStatus: "starting",
    });
  }

  if (!xrActive && !game.input.mobile.shouldSkipPointerLock()) {
    document.body.requestPointerLock?.()?.catch?.(() => {});
  }
  document.getElementById("hud").classList.add("active");

  game.gameManager.setState({
    currentState: GAME_STATES.PLAYING,
    isRunning: true,
    isMultiplayer: false,
  });

  if (missionConfig) {
    await game.missionManager.startMission(
      missionConfig.missionId,
      missionConfig,
    );
  }
  game.pendingMissionConfig = null;
  loadingTracker?.completeTask("solo-player-setup");

  game.renderer.domElement.style.display = "block";

  (async () => {
    await waitForFirstViewReady(game);
    MenuManager.enterPlayingMode();
    hideFirstViewLoading();
  })();
}

export async function ensureEnemyShipAssetsLoaded(game, loadingTracker = null) {
  if (game.enemyShipAssetsPromise) {
    await game.enemyShipAssetsPromise;
    if (!game._spawnWarpPrewarmed) {
      prewarmEnemySpawnWarp(game);
    }
    loadingTracker?.completeTask("solo-enemy-assets");
    return;
  }
  game.enemyShipAssetsPromise = (async () => {
    await loadShipModels();
    prefractureModels(shipModels);
    await reapplyShipMaterials(shipModels);
  })();
  await game.enemyShipAssetsPromise;
  prewarmEnemySpawnWarp(game);
  loadingTracker?.completeTask("solo-enemy-assets");
}

function prewarmEnemySpawnWarp(game) {
  if (game._spawnWarpPrewarmed) return;
  const template = shipModels[0];
  if (!template || !game.renderer || !game.camera) return;

  const clone = template.clone();
  clone.scale.setScalar(2.0);
  clone.rotation.set(0, Math.PI, 0);

  prewarmSpawnWarp(game.renderer, game.camera, clone, {
    color: template.userData?.enemyLaserColor ?? 0xff8800,
  });
  game._spawnWarpPrewarmed = true;
}
