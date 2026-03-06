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
 * - spawnMissilePickups(game): create Collectible missile pickups at missileSpawnPoints
 * - processEnemyRespawnQueue(game, delta): respawn dead enemies after delay
 * - processMissilePickupRespawns(game, delta): respawn collected missile pickups
 *
 * RELATED: Enemy.js, Collectible.js, gameData.js, ShipDestruction (trails), GameManager.
 *
 * =============================================================================
 */

import { Enemy } from "../entities/Enemy.js";
import { Collectible } from "../entities/Collectible.js";

function enemySpawnOptions(game) {
  const enableLights =
    game.gameManager.getPerformanceSetting("rendering", "enemyLights") ?? true;
  return { enableLights, trailsEffect: game.trailsEffect };
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
      game.showPickupMessage("MISSILES REFILLED");
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

export function tickEnemyRespawns(game, delta) {
  for (let i = game.enemyRespawnQueue.length - 1; i >= 0; i--) {
    game.enemyRespawnQueue[i].timer -= delta;
    if (game.enemyRespawnQueue[i].timer <= 0) {
      const { pos } = game.enemyRespawnQueue[i];
      game.enemyRespawnQueue.splice(i, 1);
      spawnAtPoint(game, pos);
    }
  }
}
