/**
 * gameNetworkProjectiles.js - MULTIPLAYER COLLECTIBLES AND PICKUPS
 * =============================================================================
 *
 * ROLE: Spawns and removes network-driven collectibles (missiles, laser upgrade).
 * Handles pickup events from server: play effects, update local player state,
 * show pickup messages. Also used by gameMultiplayer for collectible lifecycle.
 *
 * KEY RESPONSIBILITIES:
 * - spawnCollectible(game, id, data), removeCollectible(game, id)
 * - handleCollectiblePickup(game, data): play effect, update player (missiles/laser)
 * - showPickupMessage(game, text); integrate with particles (sparks) and procedural audio
 *
 * RELATED: Collectible.js, gameMultiplayer.js, NetworkManager.js, ProceduralAudio.js.
 *
 * =============================================================================
 */

import * as THREE from "three";
import { Projectile } from "../entities/Projectile.js";
import { Missile } from "../entities/Missile.js";
import { Explosion } from "../entities/Explosion.js";
import { LaserImpact } from "../entities/LaserImpact.js";
import { Collectible } from "../entities/Collectible.js";
import NetworkManager from "../network/NetworkManager.js";
import proceduralAudio from "../audio/ProceduralAudio.js";
import sfxManager from "../audio/sfxManager.js";

export function spawnCollectible(game, id, data) {
  if (game.collectibles.has(id)) return;

  const payload = {
    id: id ?? data?.id,
    type: data?.type ?? "missile",
    x: data?.x ?? 0,
    y: data?.y ?? 0,
    z: data?.z ?? 0,
  };
  const collectible = new Collectible(
    game.scene,
    payload,
    game.dynamicLights,
  );
  game.collectibles.set(id, collectible);
}

export function removeCollectible(game, id) {
  const collectible = game.collectibles.get(id);
  if (collectible) {
    collectible.dispose();
    game.collectibles.delete(id);
    console.log(`[Game] Removed collectible: ${id}`);
  }
}

export function handleCollectiblePickup(game, data) {
  const collectible = game.collectibles.get(data.collectibleId);

  if (collectible) {
    collectible.playPickupEffect();

    if (game.particles) {
      const pos = { x: data.x, y: data.y, z: data.z };
      const color =
        data.type === "missile"
          ? { r: 1, g: 0.4, b: 0 }
          : { r: 0, g: 1, b: 0.3 };
      game.sparksEffect.emitHitSparks(pos, color, 30);
    }
  }

  if (data.playerId === NetworkManager.sessionId && game.player) {
    proceduralAudio.collectPickup();
    if (data.type === "laser_upgrade") {
      game.player.hasLaserUpgrade = true;
      showPickupMessage(game, "LASER UPGRADE ACQUIRED");
    } else if (data.type === "missile") {
      showPickupMessage(game, "MISSILES REFILLED");
    }
  }
}

export function showPickupMessage(game, text) {
  const existing = document.querySelector(".pickup-message");
  if (existing) existing.remove();

  const msg = document.createElement("div");
  msg.className = "pickup-message";
  msg.textContent = text;
  document.body.appendChild(msg);

  setTimeout(() => msg.classList.add("visible"), 10);
  setTimeout(() => {
    msg.classList.remove("visible");
    setTimeout(() => msg.remove(), 300);
  }, 2000);
}

export function spawnNetworkProjectile(game, id, data) {
  console.log(
    "[Game] Spawning network projectile:",
    id,
    "type:",
    data.type,
    "pos:",
    data.x,
    data.y,
    data.z,
    "dir:",
    data.dx,
    data.dy,
    data.dz,
    "speed:",
    data.speed,
  );
  let position = new THREE.Vector3(data.x, data.y, data.z);
  const direction = new THREE.Vector3(data.dx, data.dy, data.dz);

  if (data.type === "missile") {
    const remote = game.remotePlayers.get(data.ownerId);
    const missilePos = remote?.getMissileSpawnPoint?.();
    if (missilePos) position.copy(missilePos).addScaledVector(direction, -1);

    const missile = new Missile(game.scene, position, direction, {
      trailsEffect: game.trailsEffect,
    });
    const targetPosition = new THREE.Vector3(data.x, data.y, data.z);
    const targetDirection = direction.clone().normalize();
    game.networkProjectiles.set(id, {
      type: "missile",
      obj: missile,
      targetPosition,
      targetDirection,
    });

    game.dynamicLights?.flash(position, 0xffaa33, {
      intensity: 14,
      distance: 20,
      ttl: 0.07,
      fade: 0.16,
    });
    proceduralAudio.missileFire();
  } else {
    const isPlayerOwned = data.ownerId === NetworkManager.sessionId;
    const remote = game.remotePlayers.get(data.ownerId);
    const gunPos = remote?.getWeaponSpawnPoint?.();
    if (gunPos) {
      position.copy(gunPos).addScaledVector(direction, -1);
    }

    const splatLight = game._createProjectileSplatLight?.(isPlayerOwned, null);
    const projectile = new Projectile(
      game.scene,
      position,
      direction,
      isPlayerOwned,
      data.speed,
      null,
      splatLight,
    );
    game.networkProjectiles.set(id, { type: "projectile", obj: projectile });

    if (remote?.triggerGunRecoil) remote.triggerGunRecoil();

    const flashColor = isPlayerOwned ? 0x00ffff : 0xff8800;
    game.dynamicLights?.flash(position, flashColor, {
      intensity: 10,
      distance: 16,
      ttl: 0.05,
      fade: 0.12,
    });
    sfxManager.play("laser", position);
  }
}

export function removeNetworkProjectile(game, id) {
  const data = game.networkProjectiles.get(id);
  if (data) {
    if (data.type === "missile") {
      data.obj.dispose(game.scene);
    } else {
      data.obj.dispose(game.scene);
    }
    game.networkProjectiles.delete(id);
  }
}

export function updateNetworkProjectile(game, id, projectile) {
  const data = game.networkProjectiles.get(id);
  if (!data) return;

  if (data.type === "missile" && data.targetPosition && data.targetDirection) {
    data.targetPosition.set(projectile.x, projectile.y, projectile.z);
    data.targetDirection.set(projectile.dx, projectile.dy, projectile.dz).normalize();
  } else if (data.type === "missile") {
    data.obj.group.position.set(projectile.x, projectile.y, projectile.z);
    data.obj.direction
      .set(projectile.dx, projectile.dy, projectile.dz)
      .normalize();
    const forward = new THREE.Vector3(0, 0, 1);
    data.obj.group.quaternion.setFromUnitVectors(
      forward,
      data.obj.direction,
    );
  } else {
    data.obj.mesh.position.set(projectile.x, projectile.y, projectile.z);
    data.obj.direction
      .set(projectile.dx, projectile.dy, projectile.dz)
      .normalize();
  }
}

export function handleNetworkHit(game, data) {
  console.log("[Game] Network hit received:", data);
  const hitPos = new THREE.Vector3(data.x, data.y, data.z);
  const hitNormal =
    data.nx !== undefined && data.ny !== undefined && data.nz !== undefined
      ? new THREE.Vector3(data.nx, data.ny, data.nz)
      : new THREE.Vector3(0, 1, 0);

  const isOurShot = data.shooterId === NetworkManager.sessionId;
  const hitColor = isOurShot ? 0x00ffff : 0xff8800;

  const impact = new LaserImpact(
    game.scene,
    hitPos,
    hitNormal,
    hitColor,
    game.dynamicLights,
  );
  game.impacts.push(impact);

  if (game.particles) {
    game.sparksEffect.emitElectricalSparks(hitPos, hitNormal, 100);
  }

  if (isOurShot) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
      const proj = game.projectiles[i];
      if (
        proj.isPlayerOwned &&
        proj.mesh.position.distanceToSquared(hitPos) < 25
      ) {
        proj.dispose(game.scene);
        game.projectiles.splice(i, 1);
        break;
      }
    }

    for (let i = game.missiles.length - 1; i >= 0; i--) {
      const missile = game.missiles[i];
      if (missile.getPosition().distanceToSquared(hitPos) < 36) {
        const explosion = new Explosion(
          game.scene,
          missile.getPosition(),
          0xff4400,
          game.dynamicLights,
        );
        game.explosions.push(explosion);
        missile.dispose(game.scene);
        game.missiles.splice(i, 1);
        break;
      }
    }
  }

  if (data.targetId !== NetworkManager.sessionId) {
    const remote = game.remotePlayers.get(data.targetId);
    if (remote) {
      remote.takeDamage(data.damage);
    }
  } else {
    game.player.health -= data.damage;
    game.player.lastDamageTime = game.clock.elapsedTime;
    game.showDamageIndicator(hitPos);
    proceduralAudio.shieldHit();
  }
}
