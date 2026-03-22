/**
 * gameMultiplayer.js - MULTIPLAYER MODE SETUP AND NETWORK HANDLERS
 * =============================================================================
 *
 * ROLE: Connects game to NetworkManager for multiplayer. Registers room/player
 * join/leave/update listeners, spawns local player and remote players, syncs
 * projectiles and collectibles, and handles game start from room state.
 *
 * KEY RESPONSIBILITIES:
 * - setupNetworkListeners(game): roomJoined, playerJoin, playerLeave, playerUpdate
 * - addRemotePlayer / removeRemotePlayer; sync local player stats from server
 * - startMultiplayerGame(game): create local Player, spawn remotes, preload level
 * - Handle projectile and collectible spawn/remove/pickup from network events
 *
 * RELATED: NetworkManager.js, Player.js, RemotePlayer.js, gameLevel.js,
 * gameNetworkProjectiles.js, gamePlayerLifecycle.js, ShipDestruction.js, gameData.js.
 *
 * =============================================================================
 */

import * as THREE from "three";
import { Player } from "../entities/Player.js";
import { RemotePlayer } from "../entities/RemotePlayer.js";
import { Explosion } from "../entities/Explosion.js";
import {
  spawnDestruction,
  PLAYER_SHIP_MODEL_INDEX,
} from "../vfx/ShipDestruction.js";
import NetworkManager from "../network/NetworkManager.js";
import MenuManager from "../ui/MenuManager.js";
import proceduralAudio from "../audio/ProceduralAudio.js";
import sfxManager from "../audio/sfxManager.js";
import engineAudio from "../audio/EngineAudio.js";
import { GAME_STATES, SHIP_CLASSES } from "../data/gameData.js";
import { updateLeaderboardButtonVisibility } from "./gameInGameUI.js";
import {
  getSceneObjectsForState,
  getSceneObject,
  LEVEL_OBJECT_IDS,
} from "./gameLevel.js";
import {
  showFirstViewLoading,
  hideFirstViewLoading,
  waitForFirstViewReady,
} from "./gameFirstViewLoading.js";
import { loadShipModels, shipModels } from "../entities/Enemy.js";

/** In-flight addNetworkBot per id (async); syncNetworkBotsWithState may call every frame until done. */
const pendingNetworkBotAdds = new Set();

function hashBotId(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function createBotPlaceholderMesh(scene) {
  const geometry = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 8);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x1a0a0a,
    emissive: 0xff4400,
    emissiveIntensity: 0.4,
    metalness: 0.3,
    roughness: 0.7,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

function buildBotShipGroup(id) {
  const root = new THREE.Group();
  const n = shipModels.length;
  if (n === 0) return { root, usesSharedShip: false };

  const template = shipModels[hashBotId(id) % n];
  const clone = template.clone();
  clone.scale.setScalar(2.0);
  clone.rotation.set(0, Math.PI, 0);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    const name = child.name?.toLowerCase?.() || "";
    if (name.startsWith("thruster_") || name.startsWith("weapon_")) {
      child.visible = false;
    }
  });
  root.add(clone);
  return { root, usesSharedShip: true };
}

function disposeNetworkBotEntry(game, entry) {
  if (!entry?.mesh) return;
  game.scene.remove(entry.mesh);
  if (!entry.usesSharedShip) {
    entry.mesh.traverse?.((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const m of mats) m?.dispose?.();
    });
  }
}

export async function addNetworkBot(game, id, bot) {
  if (game.networkBots.has(id)) return;
  if (pendingNetworkBotAdds.has(id)) return;
  pendingNetworkBotAdds.add(id);
  try {
    await loadShipModels();
    if (game.networkBots.has(id)) return;

    const { root, usesSharedShip } = buildBotShipGroup(id);
    if (root.children.length === 0) {
      const fallback = createBotPlaceholderMesh(game.scene);
      game.networkBots.set(id, { mesh: fallback, usesSharedShip: false });
      fallback.position.set(bot.x, bot.y, bot.z);
      fallback.quaternion.set(bot.qx, bot.qy, bot.qz, bot.qw);
      return;
    }
    game.scene.add(root);
    root.position.set(bot.x, bot.y, bot.z);
    root.quaternion.set(bot.qx, bot.qy, bot.qz, bot.qw);
    game.networkBots.set(id, { mesh: root, usesSharedShip });
  } finally {
    pendingNetworkBotAdds.delete(id);
  }
}

export function removeNetworkBot(game, id, deathData = null) {
  const entry = game.networkBots.get(id);
  if (entry) {
    disposeNetworkBotEntry(game, entry);
    game.networkBots.delete(id);
  }
  if (deathData && deathData.x !== undefined) {
    const pos = new THREE.Vector3(deathData.x, deathData.y, deathData.z);
    const explosion = new Explosion(
      game.scene,
      pos,
      0xff4400,
      game.dynamicLights,
      { big: true },
    );
    game.explosions.push(explosion);
    sfxManager.play("ship-explosion", pos);
    if (game.particles) game.explosionEffect?.emitBigExplosion?.(pos);
  }
}

/** Single source of truth: Colyseus state.bots ↔ scene meshes (no duplicate botAdd + start-game race). */
export function syncNetworkBotsWithState(game) {
  if (!game.isMultiplayer || !game.scene) return;
  const state = NetworkManager.getState();
  if (!state?.botsEnabled) {
    for (const id of [...game.networkBots.keys()]) {
      removeNetworkBot(game, id);
    }
    return;
  }
  if (!state.bots) return;

  const ids = new Set();
  state.bots.forEach((bot, id) => {
    ids.add(id);
    if (!game.networkBots.has(id)) {
      void addNetworkBot(game, id, bot).catch((err) =>
        console.warn("[Multiplayer] addNetworkBot failed", err),
      );
    }
  });
  for (const id of [...game.networkBots.keys()]) {
    if (!ids.has(id)) {
      removeNetworkBot(game, id);
    }
  }
}

function pushLevelSpawnsToServer(game) {
  game._extractSpawnPoints();
  const ne = game.spawnPoints?.length ?? 0;
  const np = game.playerSpawnPoints?.length ?? 0;
  const nm = game.missileSpawnPoints?.length ?? 0;
  console.log(
    `[Multiplayer] spawn sync → server (host=${NetworkManager.isHost()}): ${ne} enemy, ${np} player, ${nm} missile`,
  );
  NetworkManager.sendSpawnPoints({
    enemySpawns: game.spawnPoints,
    playerSpawns: game.playerSpawnPoints,
    missileSpawns: game.missileSpawnPoints,
    bounds: game._levelBounds || null,
  });
}

async function hostSyncSpawnsAfterPreload(game) {
  try {
    await game.preloadLevel();
  } catch {
    /* preloadLevel already logs */
  }
  if (!NetworkManager.isHost() || !game.sceneManager) return;
  pushLevelSpawnsToServer(game);
}

export function setupNetworkListeners(game) {
  NetworkManager.on("roomJoined", () => {
    const roomState = NetworkManager.getState();
    if (roomState?.level) {
      game.gameManager.setState({ currentLevel: roomState.level });
    }
    const push = () => void hostSyncSpawnsAfterPreload(game);
    push();
    queueMicrotask(push);
    setTimeout(push, 80);
    setTimeout(push, 400);
  });

  NetworkManager.on("playerJoin", ({ player, sessionId, isLocal }) => {
    if (!isLocal && game.isMultiplayer) {
      game.addRemotePlayer(sessionId, player);
    }
  });

  NetworkManager.on("playerLeave", ({ sessionId }) => {
    game.removeRemotePlayer(sessionId);
  });

  NetworkManager.on("playerUpdate", ({ player, sessionId, isLocal }) => {
    if (!isLocal && game.remotePlayers.has(sessionId)) {
      const remote = game.remotePlayers.get(sessionId);
      remote.updateFromServer(player);
    } else if (isLocal && game.player) {
      game.player.health = player.health;
      game.player.maxHealth = player.maxHealth;
      game.player.missiles = player.missiles;
      game.player.maxMissiles = player.maxMissiles;
      game.player.boostFuel = player.boostFuel ?? game.player.boostFuel;
      game.player.maxBoostFuel =
        player.maxBoostFuel ?? game.player.maxBoostFuel;
      game.player.isBoosting = player.isBoosting ?? false;
      game.player.hasLaserUpgrade = player.hasLaserUpgrade;

      const lastProcessed = player.lastProcessedInput;
      if (lastProcessed > 0) {
        game.prediction.applyServerState(
          { x: player.x, y: player.y, z: player.z },
          { x: player.qx, y: player.qy, z: player.qz, w: player.qw },
          lastProcessed,
        );
        NetworkManager.clearProcessedInputs(lastProcessed);
      }
    }
  });

  NetworkManager.on("projectileSpawn", ({ projectile, id }) => {
    if (projectile.ownerId !== NetworkManager.sessionId) {
      game.spawnNetworkProjectile(id, projectile);
    } else if (projectile.type === "missile") {
      while (
        game.localMissileQueue.length > 0 &&
        game.localMissileQueue[0].disposed
      ) {
        game.localMissileQueue.shift();
      }
      const localMissile = game.localMissileQueue.shift();
      if (localMissile && !localMissile.disposed) {
        game.localMissileIds.set(id, localMissile);
      }
    }
  });

  NetworkManager.on("projectileRemove", ({ id }) => {
    game.removeNetworkProjectile(id);
  });

  NetworkManager.on("projectileUpdate", ({ projectile, id }) => {
    game.updateNetworkProjectile(id, projectile);
  });

  NetworkManager.on("collectibleSpawn", ({ collectible, id }) => {
    game.spawnCollectible(id, collectible);
  });

  NetworkManager.on("collectibleRemove", ({ id }) => {
    game.removeCollectible(id);
  });

  NetworkManager.on("hit", (data) => {
    game.handleNetworkHit(data);
  });

  NetworkManager.on("kill", (data) => {
    game.showKillFeed(data.killerName, data.victimName);

    let victimPos = null;
    if (data.victimId === NetworkManager.sessionId) {
      victimPos = game.camera.position.clone();
      const deathQuat = game.camera.quaternion.clone();
      spawnDestruction(
        game.scene,
        victimPos,
        deathQuat,
        PLAYER_SHIP_MODEL_INDEX,
        2.0,
      );
      game.handleLocalPlayerDeath();
    } else {
      const remote = game.remotePlayers.get(data.victimId);
      if (remote && remote.mesh) {
        victimPos = remote.mesh.position.clone();
        const deathQuat = remote.mesh.quaternion.clone();
        const remoteScale = remote.shipMesh?.scale?.x ?? 1;
        spawnDestruction(
          game.scene,
          victimPos,
          deathQuat,
          PLAYER_SHIP_MODEL_INDEX,
          remoteScale,
        );
      }
      if (data.killerId === NetworkManager.sessionId) {
        proceduralAudio.killConfirm();
      }
    }

    if (victimPos) {
      const explosion = new Explosion(
        game.scene,
        victimPos,
        0xff4400,
        game.dynamicLights,
        { big: true },
      );
      game.explosions.push(explosion);
      sfxManager.play("ship-explosion", victimPos);

      if (game.particles) {
        game.explosionEffect.emitBigExplosion(victimPos);
      }
    }
  });

  NetworkManager.on("respawn", (data) => {
    if (data.playerId === NetworkManager.sessionId) {
      game.handleLocalPlayerRespawn(data);
      proceduralAudio.respawn();
    }
  });

  NetworkManager.on("stateChange", (state) => {
    if (state.phase === "results") {
      game.onMatchEnd();
    }
    if (
      state.phase === "countdown" &&
      state.countdown === 3 &&
      NetworkManager.isHost()
    ) {
      game.gameManager.setState({
        currentLevel: state.level || game.gameManager.getState().currentLevel,
      });
      const run = () => void hostSyncSpawnsAfterPreload(game);
      run();
      setTimeout(run, 500);
    }
    if (state.phase === "lobby" && state.level) {
      const current = game.gameManager.getState().currentLevel;
      if (current !== state.level) {
        const oldState = {
          ...game.gameManager.getState(),
          currentLevel: current,
          currentState: GAME_STATES.PLAYING,
        };
        const oldObjects = getSceneObjectsForState(oldState);
        for (const obj of oldObjects) {
          if (game.sceneManager.hasObject(obj.id)) {
            game.sceneManager.removeObject(obj.id);
          }
        }
        game.gameManager.setState({ currentLevel: state.level });
        game.lightManager?.updateAmbientForLevel(state.level);
        game.isLoadingLevel = false;
        void hostSyncSpawnsAfterPreload(game);
      }
    }
  });

  NetworkManager.on("collectiblePickup", (data) => {
    game.handleCollectiblePickup(data);
  });

  NetworkManager.on("botDeath", (data) => {
    removeNetworkBot(game, data.botId, data);
  });
}

export async function startMultiplayerGame(game) {
  game.isMultiplayer = true;
  updateLeaderboardButtonVisibility(game);
  const loadingTracker = game.levelLoadingTracker;

  if (!game.levelLoadPromise) {
    loadingTracker?.reset();
  }
  MenuManager.showBackgroundLoading();
  loadingTracker?.registerTask("multiplayer-player-setup");
  loadingTracker?.registerTask("multiplayer-scene-setup");
  showFirstViewLoading();

  const state = NetworkManager.getState();
  const localPlayer = NetworkManager.getLocalPlayer();
  const level = state?.level || "newworld";
  game.gameManager.setState({
    currentLevel: level,
    currentState: GAME_STATES.PLAYING,
    isMultiplayer: true,
  });
  game.lightManager?.updateAmbientForLevel(level);

  await game.preloadLevel();

  for (const id of LEVEL_OBJECT_IDS) {
    const obj = getSceneObject(id);
    if (
      obj?.criteria?.currentLevel &&
      obj.criteria.currentLevel !== level &&
      game.sceneManager.hasObject(id)
    ) {
      game.sceneManager.removeObject(id);
    }
  }

  if (!localPlayer) {
    loadingTracker?.completeTask("multiplayer-scene-setup");
    loadingTracker?.completeTask("multiplayer-player-setup");
    hideFirstViewLoading();
    return;
  }

  const classStats =
    SHIP_CLASSES[localPlayer.shipClass] || SHIP_CLASSES.fighter;

  game.player = new Player(game.camera, game.input, game.level, game.scene, {
    game,
  });
  game.player.health = localPlayer.health;
  game.player.maxHealth = localPlayer.maxHealth;
  game.player.missiles = localPlayer.missiles;
  game.player.maxMissiles = localPlayer.maxMissiles || classStats.maxMissiles;
  game.player.boostFuel = localPlayer.boostFuel ?? game.player.boostFuel;
  game.player.maxBoostFuel =
    localPlayer.maxBoostFuel ?? game.player.maxBoostFuel;
  game.player.hasLaserUpgrade = localPlayer.hasLaserUpgrade || false;
  game.player.acceleration = classStats.acceleration;
  game.player.maxSpeed = classStats.maxSpeed;

  engineAudio.init();

  game.dynamicLights?.warmupShaders(game.renderer, game.camera);

  const objectsToLoad = getSceneObjectsForState(game.gameManager.getState());
  const loads = [];
  for (const obj of objectsToLoad) {
    if (!game.sceneManager.hasObject(obj.id)) {
      loads.push(game.sceneManager.loadObject(obj));
    }
  }
  if (loads.length > 0) {
    await Promise.all(loads);
  }
  loadingTracker?.completeTask("multiplayer-scene-setup");

  if (NetworkManager.isHost()) {
    pushLevelSpawnsToServer(game);
  }

  if (game.playerSpawnPoints?.length > 0) {
    const sp =
      game.playerSpawnPoints[
        Math.floor(Math.random() * game.playerSpawnPoints.length)
      ];
    game.camera.position.copy(sp);
  } else {
    game.camera.position.set(localPlayer.x, localPlayer.y, localPlayer.z);
  }
  game.camera.quaternion.set(
    localPlayer.qx,
    localPlayer.qy,
    localPlayer.qz,
    localPlayer.qw,
  );

  NetworkManager.getPlayers().forEach(([sessionId, playerData]) => {
    if (sessionId !== NetworkManager.sessionId) {
      game.addRemotePlayer(sessionId, playerData);
    }
  });

  if (state?.botsEnabled && state?.bots) {
    await game.ensureEnemyShipAssetsLoaded();
  }

  if (!game.input.mobile.shouldSkipPointerLock()) {
    document.body.requestPointerLock?.()?.catch?.(() => {
      console.warn("[Game] Pointer lock failed - click to capture");
    });
  }
  document.getElementById("crosshair").classList.add("active");
  document.getElementById("hud").classList.add("active");

  game.gameManager.setState({
    isRunning: true,
  });
  loadingTracker?.completeTask("multiplayer-player-setup");

  game.renderer.domElement.style.display = "block";

  (async () => {
    await waitForFirstViewReady(game);
    MenuManager.enterPlayingMode();
    hideFirstViewLoading();
  })();
}

export function addRemotePlayer(game, sessionId, playerData) {
  if (game.remotePlayers.has(sessionId)) return;

  const state = NetworkManager.getState();
  const remote = new RemotePlayer(
    game.scene,
    playerData,
    state?.mode === "team",
  );
  game.remotePlayers.set(sessionId, remote);
}

export function removeRemotePlayer(game, sessionId) {
  const remote = game.remotePlayers.get(sessionId);
  if (remote) {
    remote.dispose();
    game.remotePlayers.delete(sessionId);
  }
}

export function onMatchEnd(game) {
  document.exitPointerLock();
  document.getElementById("crosshair").classList.remove("active");
  document.getElementById("hud").classList.remove("active");
  MenuManager.show();

  game.cleanupMultiplayer();
}

export function cleanupMultiplayer(game) {
  game._mpWasAlive = undefined;
  game._levelSpawnCache = null;
  game.remotePlayers.forEach((remote) => remote.dispose());
  game.remotePlayers.clear();

  game.networkBots.forEach((entry) => disposeNetworkBotEntry(game, entry));
  game.networkBots.clear();
  pendingNetworkBotAdds.clear();

  game.networkProjectiles.forEach((data) => {
    if (data.type === "missile") {
      data.obj.dispose(game.scene);
    } else {
      data.obj.dispose(game.scene);
    }
  });
  game.networkProjectiles.clear();

  game.collectibles.forEach((collectible) => collectible.dispose());
  game.collectibles.clear();

  if (game._missilePickups) {
    for (const pickup of game._missilePickups) {
      if (pickup.collectible) pickup.collectible.dispose();
    }
    game._missilePickups = null;
  }
}
