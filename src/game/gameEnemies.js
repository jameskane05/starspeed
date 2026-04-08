/**
 * gameEnemies.js - ENEMY AND MISSILE PICKUP SPAWNING
 * =============================================================================
 *
 * ROLE: Spawns enemies at level-authored positions and missile pickups for
 * solo play. Updates game state (enemiesRemaining) and HUD. Handles enemy
 * respawn queue and missile pickup respawn timers.
 *
 * KEY RESPONSIBILITIES:
 * - spawnEnemies(game): create Enemy instances at game.spawnPoints; set enemiesRemaining
 * - spawnEnemiesFromLevelSpawnPointsWithPrewarm / spawnEnemiesAtPointsWithPrewarm: bulk GPU-prewarmed spawn
 * - prewarmEnemyMeshesInPlace(game, enemies, positions): shared compile pass for any Enemy batch
 * - spawnMissilePickups(game): create Collectible missile pickups at missileSpawnPoints
 * - processEnemyRespawnQueue(game, delta): respawn dead enemies after delay
 * - processMissilePickupRespawns(game, delta): respawn collected missile pickups
 *
 * RELATED: Enemy.js, Collectible.js, gameData.js, ShipDestruction (trails), GameManager.
 *
 * ---------------------------------------------------------------------------
 * SOLO CAMPAIGN — mission enemy pool vs checkpoint gates (GPU)
 * ---------------------------------------------------------------------------
 * Checkpoints: MissionManager “Checkpoint GPU pipeline” + first-view
 * prewarmCheckpointPoolDuringFirstView (shared dissolve batch across pool slots).
 *
 * Enemies: initTrainingMissionEnemyPool builds the pool with precook + dissolve, then
 * prewarmMissionEnemyPoolInPlace → prewarmEnemyMeshesInPlace (hide rest of scene except
 * these meshes + lights, focus camera, compile + composer/render). That is the same
 * *idea* as narrowWarmKeepingSceneRoots for gates, but keeps camera + spawn placement
 * logic for ships that start off-screen. Runs during startSoloDebug before PLAYING;
 * warmGpuProgramsForPlay then hits the full scene again.
 *
 * Use allocateCheckpointDissolveBatchSerial() once for the whole pool precook loop so
 * identical ship layouts reuse |cpDissolve:* suffixes (see checkpointDissolveWarp.js).
 * Pooled respawns use precooked materials + activateEnemyAtSpawn (no per-frame compile).
 * ---------------------------------------------------------------------------
 */

import * as THREE from "three";
import { Enemy, shipModels } from "../entities/Enemy.js";
import { Collectible } from "../entities/Collectible.js";
import {
  allocateCheckpointDissolveBatchSerial,
  beginCheckpointDissolve,
  ENEMY_SPAWN_DISSOLVE_DURATION,
  precookCheckpointDissolveMaterials,
  stripCheckpointDissolveMaterials,
} from "../vfx/checkpointDissolveWarp.js";
import {
  getAllLevelEnemySpawnPositions,
  TRAINING_MISSION_WAVE_SIZE,
} from "../missions/trainingGroundsMission.js";

function enemySpawnOptions(game) {
  const enableLights =
    game.gameManager.getPerformanceSetting("rendering", "enemyLights") ?? true;
  return { enableLights, trailsEffect: game.trailsEffect, game };
}

export function spawnEnemies(game) {
  if (game.spawnPoints.length === 0) {
    console.warn("[Game] No spawn points found in level mesh");
    return;
  }

  const opts = enemySpawnOptions(game);
  for (const pos of game.spawnPoints) {
    const enemy = new Enemy(
      game.scene,
      pos.clone(),
      game.level,
      game._levelBounds,
      opts,
    );
    game.enemies.push(enemy);
  }

  console.log(
    `[Game] Spawned ${game.enemies.length} enemies at authored positions`,
  );
  game.gameManager.setState({ enemiesRemaining: game.enemies.length });
  game.updateHUD();
}

export async function spawnEnemiesFromLevelSpawnPointsWithPrewarm(game) {
  if (game.spawnPoints.length === 0) {
    console.warn("[Game] No spawn points found in level mesh");
    return;
  }
  const positions = game.spawnPoints.map((p) => p.clone());
  await spawnEnemiesAtPointsWithPrewarm(game, positions);
  console.log(
    `[Game] Spawned ${game.enemies.length} enemies at authored positions (prewarmed)`,
  );
  game.updateHUD();
}

export function spawnMissilePickups(game) {
  if (game.missileSpawnPoints.length === 0) return;

  game._missilePickups = [];
  for (let i = 0; i < game.missileSpawnPoints.length; i++) {
    const pos = game.missileSpawnPoints[i];
    const id = `missile_solo_${i}`;
    const data = { id, type: "missile", x: pos.x, y: pos.y, z: pos.z };
    const collectible = new Collectible(
      game.scene,
      data,
      game.dynamicLights,
    );
    game._missilePickups.push({
      id,
      collectible,
      pos: pos.clone(),
      respawnTimer: 0,
      active: true,
    });
  }
  console.log(
    `[Game] Spawned ${game._missilePickups.length} missile pickups`,
  );
}

export function checkMissilePickups(game, playerPos, delta) {
  if (!game._missilePickups) return;
  const pickupRadiusSq = 25;

  for (const pickup of game._missilePickups) {
    if (!pickup.active) {
      pickup.respawnTimer -= delta;
      if (pickup.respawnTimer <= 0) {
        pickup.collectible = new Collectible(
          game.scene,
          {
            id: pickup.id,
            type: "missile",
            x: pickup.pos.x,
            y: pickup.pos.y,
            z: pickup.pos.z,
          },
          game.dynamicLights,
        );
        pickup.active = true;
      }
      continue;
    }

    pickup.collectible.update(delta);

    const dx = playerPos.x - pickup.pos.x;
    const dy = playerPos.y - pickup.pos.y;
    const dz = playerPos.z - pickup.pos.z;
    if (
      dx * dx + dy * dy + dz * dz < pickupRadiusSq &&
      game.player &&
      game.player.missiles < game.player.maxMissiles
    ) {
      game.player.missiles = game.player.maxMissiles;
      pickup.collectible.playPickupEffect();
      pickup.collectible.dispose();
      pickup.collectible = null;
      pickup.active = false;
      pickup.respawnTimer = 30;
      const st = game.gameManager?.getState?.();
      if (
        st?.currentMissionId === "trainingGrounds" &&
        st?.missionStepId === "ammoCollectibleBrief"
      ) {
        game.missionManager?.reportEvent?.("trainingMissilePickupCollected", {});
      } else {
        game.showPickupMessage("MISSILES REFILLED");
      }
      game.updateHUD();
    }
  }
}

export function spawnAtPoint(game, pos) {
  const enemy = new Enemy(
    game.scene,
    pos.clone(),
    game.level,
    game._levelBounds,
    enemySpawnOptions(game),
  );
  game.enemies.push(enemy);
  game.gameManager.setState({ enemiesRemaining: game.enemies.length });
}

function activateEnemyAtSpawn(game, enemy, position, { skipHud = false } = {}) {
  enemy.health = 100;
  enemy.state = "wander";
  enemy.fireCooldown = 0;
  enemy.hasLOS = false;
  enemy.losCheckCounter = 0;
  enemy.velocity.set(0, 0, 0);
  enemy.disposed = false;
  enemy.spawnPoint.copy(position);
  enemy.mesh.position.copy(position);
  enemy.mesh.visible = false;
  if (enemy.shipLight) {
    enemy.shipLight.intensity = enemy.shipLightIntensity;
  }
  enemy._pickNewWaypoint();

  const dissolveOptsBase = {
    duration: ENEMY_SPAWN_DISSOLVE_DURATION,
    edgeColor: enemy.laserColor,
    particleColor: enemy.laserColor,
    particleDecimation: 8,
    particleSize: 26,
  };
  const dissolveOpts = enemy._enemyDissolvePrecooked
    ? {
        ...dissolveOptsBase,
        dissolvePrecooked: enemy._enemyDissolvePrecooked,
        retainDissolveMaterials: true,
        particles: false,
      }
    : dissolveOptsBase;

  enemy.spawnWarp?.dispose?.();
  if (!enemy._enemyDissolvePrecooked) {
    stripCheckpointDissolveMaterials(enemy.mesh);
  }
  enemy.spawnWarp = beginCheckpointDissolve(enemy.mesh, game, dissolveOpts);

  if (!game.enemies.includes(enemy)) {
    game.enemies.push(enemy);
  }
  if (!skipHud) {
    game.gameManager.setState({ enemiesRemaining: game.enemies.length });
  }

  enemy.mesh.visible = true;
  if (enemy.spawnWarp && !enemy.spawnWarp.disposed && !enemy.spawnWarp.finished) {
    enemy.spawnWarp.update(1 / 60);
  }
}

const ENEMY_CONSTRUCT_RAF_CHUNK = 5;

/**
 * Bulk spawn at world positions: build hidden enemies (spread across frames),
 * prewarm GPU, then activate so warp VFX plays without a compile hitch.
 * @param {Function|null} enemyOptionsForIndex – (i) => partial Enemy ctor options, e.g. `{ missionPoolSlot }`
 */
export async function spawnEnemiesAtPointsWithPrewarm(
  game,
  positions,
  enemyOptionsForIndex = null,
) {
  if (!positions?.length) return;
  if (!game.renderer || !game.camera) {
    for (const position of positions) {
      spawnAtPoint(game, position);
    }
    return;
  }

  const base = new THREE.Vector3(0, MISSION_POOL_HIDE_Y, 0);
  const optsBase = {
    ...enemySpawnOptions(game),
    deferSpawnWarp: true,
  };
  const enemies = [];
  const nModels = shipModels.length;

  for (let i = 0; i < positions.length; i++) {
    const extra =
      typeof enemyOptionsForIndex === "function"
        ? enemyOptionsForIndex(i) || {}
        : enemyOptionsForIndex || {};
    const modelPick =
      extra.modelIndex != null
        ? extra.modelIndex
        : nModels > 0
          ? i % nModels
          : undefined;
    const enemy = new Enemy(
      game.scene,
      base.clone(),
      game.level,
      game._levelBounds,
      {
        ...optsBase,
        ...extra,
        ...(modelPick !== undefined ? { modelIndex: modelPick } : {}),
      },
    );
    enemy.mesh.visible = false;
    if (enemy.shipLight) enemy.shipLight.intensity = 0;
    enemy.spawnWarp = beginCheckpointDissolve(enemy.mesh, game, {
      duration: ENEMY_SPAWN_DISSOLVE_DURATION,
      edgeColor: enemy.laserColor,
      particleColor: enemy.laserColor,
      particleDecimation: 8,
      particleSize: 26,
    });
    while (!enemy.spawnWarp.finished) {
      enemy.spawnWarp.update(0.25);
    }
    enemy.spawnWarp.restart({ hold: true });
    enemies.push(enemy);
    if (i % ENEMY_CONSTRUCT_RAF_CHUNK === ENEMY_CONSTRUCT_RAF_CHUNK - 1) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  await prewarmEnemyMeshesInPlace(game, enemies, positions);

  for (let i = 0; i < enemies.length; i++) {
    activateEnemyAtSpawn(game, enemies[i], positions[i], { skipHud: true });
  }
  game.gameManager.setState({ enemiesRemaining: game.enemies.length });
}

const MISSION_POOL_HIDE_Y = -200000;

function getTrainingMissionPoolCount(game) {
  return Math.max(
    TRAINING_MISSION_WAVE_SIZE,
    getAllLevelEnemySpawnPositions(game).length,
  );
}

export function disposeMissionEnemyPool(game) {
  if (!game._missionEnemyPool?.length) return;
  for (const enemy of game._missionEnemyPool) {
    try {
      enemy.spawnWarp?.dispose?.();
      stripCheckpointDissolveMaterials(enemy.mesh);
      enemy.dispose(game.scene, null);
    } catch (err) {
      console.warn("[gameEnemies] disposeMissionEnemyPool:", err);
    }
  }
  game._missionEnemyPool = null;
}

function renderPrewarmFrame(game) {
  if (game.xrManager?.isPresenting) {
    game.renderer.render(game.scene, game.camera);
  } else if (game._bloomActive && game.composer) {
    game.composer.render();
  } else {
    game.renderer.render(game.scene, game.camera);
  }
}

function focusCameraOnPrewarmTargets(game, positions) {
  const camera = game.camera;
  if (!camera || !positions.length) return null;

  const center = new THREE.Vector3();
  for (const position of positions) center.add(position);
  center.multiplyScalar(1 / positions.length);

  let radius = 12;
  for (const position of positions) {
    radius = Math.max(radius, center.distanceTo(position));
  }

  const saved = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
  camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.4, radius * 1.8));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  return saved;
}

function isolatePrewarmScene(game, enemies) {
  const allowed = new Set(enemies.map((e) => e.mesh));
  const hidden = [];
  for (const child of game.scene.children) {
    if (allowed.has(child) || child.isLight) continue;
    hidden.push({ child, visible: child.visible });
    child.visible = false;
  }
  return hidden;
}

/**
 * Narrow-style warm for arbitrary enemy batches (mission pool init, bulk spawn prewarm).
 * Hides other top-level scene nodes, focuses camera on `positions`, runs warp + compile + one play render.
 * Mirrors checkpoint “narrow warm” intent; differs by camera + per-enemy placement for frustum.
 */
export async function prewarmEnemyMeshesInPlace(game, enemies, positions) {
  if (!enemies?.length || !positions?.length || !game.renderer || !game.camera) {
    return;
  }

  const cameraState = focusCameraOnPrewarmTargets(game, positions);
  const hiddenSceneChildren = isolatePrewarmScene(game, enemies);
  const saved = enemies.map((enemy) => ({
    meshPos: enemy.mesh.position.clone(),
    meshVisible: enemy.mesh.visible,
    meshFrustumCulled: enemy.mesh.frustumCulled,
    lightIntensity: enemy.shipLight?.intensity ?? 0,
  }));

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const p = positions[i] ?? positions[0];
    enemy.mesh.position.copy(p);
    enemy.mesh.visible = true;
    enemy.mesh.frustumCulled = false;
    if (enemy.shipLight) {
      enemy.shipLight.intensity = enemy.shipLightIntensity ?? 7;
      enemy.shipLight.position.copy(enemy.mesh.position);
      enemy.shipLight.position.y += 0.3;
      enemy.shipLight.position.z += 6;
    }
  }

  try {
    for (let i = 0; i < enemies.length; i++) {
      const w = enemies[i].spawnWarp;
      if (!w || w.disposed) continue;
      w.unfreeze();
      let guard = 0;
      while (!w.finished && guard++ < 200) {
        w.update(0.25);
      }
      w.restart({ hold: true });
    }
    // Sync compile only: compileAsync() polls materials on a timer; mission teardown
    // (flushRetainedEnemyMeshes / disposeMissionEnemyPool) can dispose those materials
    // mid-flight and crash WebGLRenderer.checkMaterialsReady (program undefined).
    if (game.renderer.compileAsync) {
      await game.renderer.compileAsync(game.scene, game.camera);
    } else {
      game.renderer.compile(game.scene, game.camera);
    }
    renderPrewarmFrame(game);
  } finally {
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      const s = saved[i];
      enemy.mesh.position.copy(s.meshPos);
      enemy.mesh.visible = s.meshVisible;
      enemy.mesh.frustumCulled = s.meshFrustumCulled;
      if (enemy.shipLight) {
        enemy.shipLight.position.copy(enemy.mesh.position);
        enemy.shipLight.position.y += 0.3;
        enemy.shipLight.position.z += 6;
        enemy.shipLight.intensity = s.lightIntensity;
      }
    }
    for (const { child, visible } of hiddenSceneChildren) {
      child.visible = visible;
    }
    if (cameraState) {
      game.camera.position.copy(cameraState.position);
      game.camera.quaternion.copy(cameraState.quaternion);
      game.camera.updateMatrixWorld(true);
    }
  }
}

async function prewarmMissionEnemyPoolInPlace(game) {
  const pool = game._missionEnemyPool;
  if (!pool?.length) return;
  const padded = getAllLevelEnemySpawnPositions(game).slice();
  const padRef =
    padded[padded.length - 1] ?? new THREE.Vector3(0, 4, -45);
  while (padded.length < pool.length) {
    padded.push(padRef.clone());
  }
  await prewarmEnemyMeshesInPlace(game, pool, padded);
}

export async function initTrainingMissionEnemyPool(game) {
  disposeMissionEnemyPool(game);
  const base = new THREE.Vector3(0, MISSION_POOL_HIDE_Y, 0);
  const opts = {
    ...enemySpawnOptions(game),
    deferSpawnWarp: true,
  };
  const pool = [];
  const nModels = shipModels.length;
  const poolCount = getTrainingMissionPoolCount(game);
  // One dissolve batch id for every pooled ship — same pattern as checkpoint pool (checkpointDissolveWarp header).
  const enemyPoolDissolveBatchSerial = allocateCheckpointDissolveBatchSerial();
  for (let i = 0; i < poolCount; i++) {
    const modelIndex = nModels > 0 ? i % nModels : undefined;
    const enemy = new Enemy(
      game.scene,
      base.clone(),
      game.level,
      game._levelBounds,
      {
        ...opts,
        missionPoolSlot: i,
        ...(modelIndex !== undefined ? { modelIndex } : {}),
      },
    );
    enemy.mesh.visible = false;
    if (enemy.shipLight) enemy.shipLight.intensity = 0;
    enemy._enemyDissolvePrecooked = precookCheckpointDissolveMaterials(
      enemy.mesh,
      {
        edgeColor: enemy.laserColor,
        edgeColor2: enemy.laserColor,
        sharedDissolveBatchSerial: enemyPoolDissolveBatchSerial,
      },
    );
    enemy.spawnWarp = beginCheckpointDissolve(enemy.mesh, game, {
      duration: ENEMY_SPAWN_DISSOLVE_DURATION,
      edgeColor: enemy.laserColor,
      particleColor: enemy.laserColor,
      particleDecimation: 8,
      particleSize: 26,
      dissolvePrecooked: enemy._enemyDissolvePrecooked,
      retainDissolveMaterials: true,
    });
    while (!enemy.spawnWarp.finished) {
      enemy.spawnWarp.update(0.25);
    }
    enemy.spawnWarp.restart({ hold: true });
    pool.push(enemy);
  }
  game._missionEnemyPool = pool;
  await prewarmMissionEnemyPoolInPlace(game);
}

export function spawnMissionWaveFromPool(game, positions) {
  const pool = game._missionEnemyPool;
  if (!pool?.length || positions.length > pool.length) return false;
  for (let i = 0; i < positions.length; i++) {
    activatePooledMissionEnemy(game, pool[i], positions[i]);
  }
  return true;
}

function activatePooledMissionEnemy(game, enemy, position) {
  activateEnemyAtSpawn(game, enemy, position);
}

export function tickEnemyRespawns(game, delta) {
  for (let i = game.enemyRespawnQueue.length - 1; i >= 0; i--) {
    game.enemyRespawnQueue[i].timer -= delta;
    if (game.enemyRespawnQueue[i].timer <= 0) {
      const { pos, missionPoolSlot } = game.enemyRespawnQueue[i];
      game.enemyRespawnQueue.splice(i, 1);
      const pool = game._missionEnemyPool;
      if (
        missionPoolSlot != null &&
        pool?.length &&
        missionPoolSlot < pool.length
      ) {
        const pooled = pool[missionPoolSlot];
        if (pooled && !game.enemies.includes(pooled)) {
          activateEnemyAtSpawn(game, pooled, pos);
          continue;
        }
      }
      spawnAtPoint(game, pos);
    }
  }
}
