/**
 * Game.js - MAIN GAME CONTAINER AND LOOP ORCHESTRATOR
 * =============================================================================
 *
 * ROLE: Central game object that holds scene, camera, renderer, managers, and
 * entity state. Coordinates init (via gameInit.js), update loop, and mode
 * switching between menu and play (solo/multiplayer).
 *
 * KEY RESPONSIBILITIES:
 * - Own references to GameManager, SceneManager, LightManager, input, player, level
 * - Delegate init to gameInit.js; run requestAnimationFrame loop with gameUpdate.tick
 * - Start solo play via gameSolo; multiplayer via gameMultiplayer (NetworkManager)
 * - Hold local state: enemies, projectiles, missiles, explosions, remote players
 * - Integrate Prediction for client-side prediction in multiplayer
 *
 * RELATED: gameInit.js, gameUpdate.js, gameSolo.js, gameMultiplayer.js, GameManager,
 * SceneManager, LightManager, NetworkManager, MenuManager.
 *
 * =============================================================================
 */

import * as THREE from "three";
import { GAME_STATES } from "../data/gameData.js";
import NetworkManager from "../network/NetworkManager.js";
import MenuManager from "../ui/MenuManager.js";
import * as gameInGameUI from "./gameInGameUI.js";
import * as gameLevel from "./gameLevel.js";
import * as gameEnemies from "./gameEnemies.js";
import * as gameCombat from "./gameCombat.js";
import * as gameNetworkProjectiles from "./gameNetworkProjectiles.js";
import * as gamePlayerLifecycle from "./gamePlayerLifecycle.js";
import * as gameSolo from "./gameSolo.js";
import * as gameMultiplayer from "./gameMultiplayer.js";
import * as gameUpdate from "./gameUpdate.js";
import { Prediction } from "../network/Prediction.js";


export class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.sparkRenderer = null;

    this.gameManager = null;
    this.sceneManager = null;
    this.lightManager = null;
    this.musicManager = null;
    this.particles = null;
    this.dynamicLights = null;

    this.input = null;
    this.player = null;
    this.level = null;
    this.enemies = [];
    this.spawnPoints = [];
    this.enemyRespawnQueue = [];
    this.projectiles = [];
    this.missiles = [];
    this.explosions = [];
    this.impacts = [];
    this.lastMissileTime = 0;
    this.missileCooldown = 0.4;
    this.lastLaserTime = 0;
    this.laserCooldown = 0.1;
    this.clock = new THREE.Clock();
    this.boundFireEnemy = (pos, dir, style) =>
      gameCombat.fireEnemyWeapon(this, pos, dir, style);

    this.hud = null;
    this._hudLast = { health: null, kills: null, missiles: null, boost: null };
    this._hudAccum = 0;

    // Multiplayer state
    this.isMultiplayer = false;
    this.remotePlayers = new Map();
    this.networkProjectiles = new Map();
    this.collectibles = new Map();
    this.isEscMenuOpen = false;
    this.escMenu = null;
    this.prediction = new Prediction({
      enabled: true,
      reconciliationThreshold: 0.5,
      smoothCorrection: true,
    });
    this.lastInputSeq = 0;

    // Track local missiles with their server IDs for homing sync
    this.localMissileQueue = []; // Missiles waiting to be linked to server IDs
    this.localMissileIds = new Map(); // serverId -> local missile

    this.xrManager = null;
    this._frameCount = 0;
    this.enemyShipAssetsPromise = null;
    this.projectileSplatLayer = null;
  }

  async init() {
    const gameInit = await import("./gameInit.js");
    return gameInit.init(this);
  }

  async startSoloDebug() {
    return gameSolo.startSoloDebug(this);
  }

  async ensureEnemyShipAssetsLoaded() {
    return gameSolo.ensureEnemyShipAssetsLoaded(this);
  }

  setupNetworkListeners() {
    gameMultiplayer.setupNetworkListeners(this);
  }

  async preloadLevel() {
    return gameLevel.preloadLevel(this);
  }

  async loadLevelAndStart() {
    return gameLevel.loadLevelAndStart(this);
  }

  _extractSpawnPoints() {
    gameLevel.extractSpawnPoints(this);
  }

  _initProjectileSplatLayer() {
    gameCombat.initProjectileSplatLayer(this);
  }

  _createProjectileSplatLight(isPlayerOwned, visual) {
    return gameCombat.createProjectileSplatLight(this, isPlayerOwned, visual);
  }

  async startMultiplayerGame() {
    return gameMultiplayer.startMultiplayerGame(this);
  }

  addRemotePlayer(sessionId, playerData) {
    gameMultiplayer.addRemotePlayer(this, sessionId, playerData);
  }

  removeRemotePlayer(sessionId) {
    gameMultiplayer.removeRemotePlayer(this, sessionId);
  }

  spawnCollectible(id, data) {
    gameNetworkProjectiles.spawnCollectible(this, id, data);
  }

  removeCollectible(id) {
    gameNetworkProjectiles.removeCollectible(this, id);
  }

  handleCollectiblePickup(data) {
    gameNetworkProjectiles.handleCollectiblePickup(this, data);
  }

  showPickupMessage(text) {
    gameNetworkProjectiles.showPickupMessage(this, text);
  }

  spawnNetworkProjectile(id, data) {
    gameNetworkProjectiles.spawnNetworkProjectile(this, id, data);
  }

  removeNetworkProjectile(id) {
    gameNetworkProjectiles.removeNetworkProjectile(this, id);
  }

  updateNetworkProjectile(id, projectile) {
    gameNetworkProjectiles.updateNetworkProjectile(this, id, projectile);
  }

  handleNetworkHit(data) {
    gameNetworkProjectiles.handleNetworkHit(this, data);
  }

  showDamageIndicator(hitWorldPos) {
    gamePlayerLifecycle.showDamageIndicator(this, hitWorldPos);
  }

  handleLocalPlayerDeath() {
    gamePlayerLifecycle.handleLocalPlayerDeath(this);
  }

  _startSoloRespawn() {
    gamePlayerLifecycle.startSoloRespawn(this);
  }

  _finishSoloRespawn() {
    gamePlayerLifecycle.finishSoloRespawn(this);
  }

  handleLocalPlayerRespawn() {
    gamePlayerLifecycle.handleLocalPlayerRespawn(this);
  }

  showKillFeed(killer, victim) {
    gamePlayerLifecycle.showKillFeed(this, killer, victim);
  }

  onMatchEnd() {
    gameMultiplayer.onMatchEnd(this);
  }

  cleanupMultiplayer() {
    gameMultiplayer.cleanupMultiplayer(this);
  }

  onStateChanged(newState, oldState) {
    if (
      newState.currentState === GAME_STATES.PLAYING &&
      oldState?.currentState !== GAME_STATES.PLAYING
    ) {
      this.dynamicSceneElementManager?.setElements([]);
    }
  }

  onGameStarted() {
    this.playerEngineTrails?.forEach((t) => t.clear());
    if (!this.isMultiplayer && !this.input.mobile.shouldSkipPointerLock()) {
      document.body.requestPointerLock?.()?.catch?.(() => {});
      document.getElementById("crosshair").classList.add("active");
      document.getElementById("hud").classList.add("active");
    }
  }

  onGameOver() {
    document.exitPointerLock();
    document.getElementById("crosshair").classList.remove("active");
    document.getElementById("hud").classList.remove("active");
    MenuManager.show();
  }

  onVictory() {
    document.exitPointerLock();
    document.getElementById("crosshair").classList.remove("active");
    document.getElementById("hud").classList.remove("active");
  }

  spawnEnemies() {
    gameEnemies.spawnEnemies(this);
  }

  _spawnMissilePickups() {
    gameEnemies.spawnMissilePickups(this);
  }

  _checkMissilePickups(playerPos, delta) {
    gameEnemies.checkMissilePickups(this, playerPos, delta);
  }

  spawnAtPoint(pos) {
    gameEnemies.spawnAtPoint(this, pos);
  }

  tickEnemyRespawns(delta) {
    gameEnemies.tickEnemyRespawns(this, delta);
  }

  start() {
    if (this.gameManager.isPlaying()) return;
    this.gameManager.startGame();
  }

  toggleEscMenu() {
    gameInGameUI.toggleEscMenu(this);
  }

  showEscMenu() {
    gameInGameUI.showEscMenu(this);
  }

  showOptionsMenu() {
    gameInGameUI.showOptionsMenu(this);
  }

  showLeaderboard() {
    gameInGameUI.showLeaderboard(this);
  }

  hideLeaderboard() {
    gameInGameUI.hideLeaderboard(this);
  }

  showControlsHelp(visible) {
    gameInGameUI.showControlsHelp(this, visible);
  }

  resumeGame() {
    gameInGameUI.resumeGame(this);
  }

  leaveMatch() {
    gameInGameUI.leaveMatch(this);
  }

  stop() {
    if (this.player && this.player.health <= 0) {
      this.gameManager.gameOver();
    } else {
      document.exitPointerLock();
      document.getElementById("crosshair").classList.remove("active");
      document.getElementById("hud").classList.remove("active");
      this.gameManager.setState({
        currentState: GAME_STATES.PAUSED,
        isRunning: false,
      });
    }
  }

  handleGamepadFire() {
    if (!this.input.isGamepadMode()) return;

    const gp = this.input.gamepad;
    if (gp.fire) {
      this.firePlayerWeapon();
    }
    // Missiles fire on button press, not hold
    if (gp.missileJustPressed) {
      this.firePlayerMissile();
    }
  }

  firePlayerWeapon() {
    gameCombat.firePlayerWeapon(this);
  }

  firePlayerMissile() {
    gameCombat.firePlayerMissile(this);
  }

  fireEnemyWeapon(position, direction, style = null) {
    gameCombat.fireEnemyWeapon(this, position, direction, style);
  }

  updateHUD(delta) {
    gameInGameUI.updateHUD(this, delta);
  }

  sendInputToServer(delta) {
    if (!this.isMultiplayer || !this.player) return;

    const state = NetworkManager.getState();
    if (!state || state.phase !== "playing") return;

    const localPlayer = NetworkManager.getLocalPlayer();
    if (localPlayer && !localPlayer.alive) return;

    this.lastInputSeq = NetworkManager.sendInput({
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      qx: this.camera.quaternion.x,
      qy: this.camera.quaternion.y,
      qz: this.camera.quaternion.z,
      qw: this.camera.quaternion.w,
      vx: this.player.velocity.x,
      vy: this.player.velocity.y,
      vz: this.player.velocity.z,
      dt: delta,
      boost: this.input.keys.boost || this.input.gamepad.boost,
    });
  }

  animate(timestamp, frame) {
    const delta = this.clock.getDelta();
    gameUpdate.tick(this, delta, timestamp, frame);
  }

  checkCollisions() {
    gameCombat.checkCollisions(this);
  }

  _updateBoostDoF(delta) {
    gameUpdate.updateBoostDoF(this, delta);
  }

  _updateBloomActive() {
    gameUpdate.updateBloomActive(this);
  }

  onResize() {
    gameUpdate.onResize(this);
  }
}
