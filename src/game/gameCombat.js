/**
 * gameCombat.js - WEAPONS, HITS, AND COMBAT RESOLUTION
 * =============================================================================
 *
 * ROLE: Handles firing (player and enemy), projectile/missile creation, hit
 * detection, damage, explosions, and laser impacts. Optional SplatEdit layer
 * for projectile lights. Network-aware for multiplayer (broadcast hits, sync).
 *
 * KEY RESPONSIBILITIES:
 * - initProjectileSplatLayer(game), createProjectileSplatLight (optional splat lights)
 * - firePlayerWeapon / fireEnemyWeapon: create Projectile or Missile, add to game
 * - Hit detection (sphere cast/collision); apply damage, spawn Explosion/LaserImpact
 * - Ship destruction (ShipDestruction), SFX and procedural audio, HUD kill updates
 *
 * RELATED: Projectile.js, Missile.js, Explosion.js, LaserImpact.js, Physics.js,
 * ShipDestruction.js, NetworkManager.js, sfxManager.js, ProceduralAudio.js.
 *
 * =============================================================================
 */

import * as THREE from "three";
import {
  SplatEdit,
  SplatEditSdf,
  SplatEditSdfType,
  SplatEditRgbaBlendMode,
} from "@sparkjsdev/spark";
import { castSphere, checkSphereCollision } from "../physics/Physics.js";
import { Projectile } from "../entities/Projectile.js";
import { Missile } from "../entities/Missile.js";
import { Explosion } from "../entities/Explosion.js";
import { LaserImpact } from "../entities/LaserImpact.js";
import { spawnDestruction } from "../vfx/ShipDestruction.js";
import NetworkManager from "../network/NetworkManager.js";
import proceduralAudio from "../audio/ProceduralAudio.js";
import sfxManager from "../audio/sfxManager.js";

const _fireDir = new THREE.Vector3();
const _hitPos = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();
const _sparkPos = new THREE.Vector3();

export function initProjectileSplatLayer(game) {
  if (game.projectileSplatLayer) return;
  if (
    !game.gameManager.getPerformanceSetting(
      "rendering",
      "projectileSplatLights",
    )
  )
    return;
  const layer = new SplatEdit({
    rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
    sdfSmooth: 0.2,
    softEdge: 2.5,
  });
  game.scene.add(layer);
  game.projectileSplatLayer = layer;
}

export function createProjectileSplatLight(game, isPlayerOwned, visual) {
  if (!game.projectileSplatLayer) return null;
  try {
    const color = isPlayerOwned
      ? new THREE.Color(0.04, 0.06, 0.08)
      : visual?.color
        ? new THREE.Color(visual.color).multiplyScalar(0.08)
        : new THREE.Color(0.07, 0.04, 0.03);
    const sdf = new SplatEditSdf({
      type: SplatEditSdfType.SPHERE,
      radius: 10,
      color,
      opacity: 0.1,
    });
    game.projectileSplatLayer.add(sdf);
    return sdf;
  } catch {
    return null;
  }
}

export function firePlayerWeapon(game) {
  if (!game.gameManager.isPlaying()) return;
  if (
    game.isMultiplayer &&
    NetworkManager.getLocalPlayer() &&
    !NetworkManager.getLocalPlayer().alive
  )
    return;
  if (!game.player.gunL || !game.player.gunR) return;

  const now = game.clock.elapsedTime;
  if (now - game.lastLaserTime < game.laserCooldown) return;
  game.lastLaserTime = now;

  const fireQuat = game.xrManager?.isPresenting
    ? game.xrManager.rig.quaternion
    : game.camera.quaternion;
  _fireDir.set(0, 0, -1).applyQuaternion(fireQuat);
  game.player.camera.updateMatrixWorld(true);
  const fromLeft = game.player.fireFromLeft;
  const spawnPos = game.player.getWeaponSpawnPoint();
  game.player.triggerGunRecoil(fromLeft);
  spawnPos.addScaledVector(_fireDir, -5);

  if (game.isMultiplayer) {
    NetworkManager.sendFire("laser", spawnPos, _fireDir);
  }

  const splatLight = createProjectileSplatLight(game, true, null);
  const projectile = new Projectile(
    game.scene,
    spawnPos,
    _fireDir,
    true,
    null,
    null,
    splatLight,
  );
  game.projectiles.push(projectile);

  sfxManager.play("laser", spawnPos);

  game.dynamicLights?.flash(spawnPos, 0x00ffff, {
    intensity: 10,
    distance: 16,
    ttl: 0.05,
    fade: 0.12,
  });
}

export function firePlayerMissile(game) {
  if (!game.gameManager.isPlaying()) return;
  if (game.player.missiles <= 0) return;
  if (
    game.isMultiplayer &&
    NetworkManager.getLocalPlayer() &&
    !NetworkManager.getLocalPlayer().alive
  )
    return;

  const now = game.clock.elapsedTime;
  if (now - game.lastMissileTime < game.missileCooldown) return;
  game.lastMissileTime = now;

  game.player.missiles--;

  const fireQuat = game.xrManager?.isPresenting
    ? game.xrManager.rig.quaternion
    : game.camera.quaternion;
  _fireDir.set(0, 0, -1).applyQuaternion(fireQuat);
  game.player.camera.updateMatrixWorld(true);
  const spawnPos = game.player.getMissileSpawnPoint();
  spawnPos.addScaledVector(_fireDir, -1);

  const missile = new Missile(game.scene, spawnPos, _fireDir, {
    trailsEffect: game.trailsEffect,
  });
  game.missiles.push(missile);

  proceduralAudio.missileFire();

  if (game.isMultiplayer) {
    NetworkManager.sendFire("missile", spawnPos, _fireDir);
    game.localMissileQueue.push(missile);
  }

  game.dynamicLights?.flash(spawnPos, 0xffaa33, {
    intensity: 14,
    distance: 20,
    ttl: 0.07,
    fade: 0.16,
  });
}

export function fireEnemyWeapon(game, position, direction, style = null) {
  const splatLight = createProjectileSplatLight(game, false, style);
  const projectile = new Projectile(
    game.scene,
    position.clone(),
    direction,
    false,
    null,
    style,
    splatLight,
  );
  game.projectiles.push(projectile);
  sfxManager.play("laser", position);
  if (style?.color) {
    game.dynamicLights?.flash(position, style.color, {
      intensity: 8,
      distance: 12,
      ttl: 0.05,
      fade: 0.1,
    });
  }
}

export function checkCollisions(game) {
  const playerPos = game.xrManager?.isPresenting
    ? game.xrManager.rig.position
    : game.camera.position;
  const playerRadiusSq = 0.64;

  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const proj = game.projectiles[i];

    if (proj.disposed || proj.lifetime <= 0) {
      proj.dispose(game.scene);
      game.projectiles.splice(i, 1);
      continue;
    }

    let hitSomething = false;
    const projPos = proj.mesh.position;
    const projColor = proj.isPlayerOwned ? 0x00ffff : 0xff8800;

    if (!game.isMultiplayer) {
      if (proj.isPlayerOwned) {
        for (let j = game.enemies.length - 1; j >= 0; j--) {
          const enemy = game.enemies[j];
          if (enemy.pointInHitbox(projPos)) {
            enemy.takeDamage(25);

            _hitNormal.subVectors(projPos, enemy.mesh.position).normalize();
            const impact = new LaserImpact(
              game.scene,
              projPos,
              _hitNormal,
              projColor,
              game.dynamicLights,
            );
            game.impacts.push(impact);

            if (game.particles) {
              game.sparksEffect.emitElectricalSparks(projPos, _hitNormal, 30);
            }

            hitSomething = true;

            if (enemy.health <= 0) {
              const deathPos = enemy.mesh.position.clone();
              const deathQuat = enemy.mesh.quaternion.clone();
              const explosion = new Explosion(
                game.scene,
                deathPos,
                enemy.glowColor,
                game.dynamicLights,
                { big: true },
              );
              game.explosions.push(explosion);
              sfxManager.play("ship-explosion", deathPos, 0.6);
              if (game.particles) {
                game.explosionEffect.emitBigExplosion(deathPos);
              }
              spawnDestruction(
                game.scene,
                deathPos,
                deathQuat,
                enemy.modelIndex,
              );
              const respawnPos = enemy.spawnPoint;
              enemy.dispose(game.scene);
              game.enemies.splice(j, 1);
              if (!game.isMultiplayer) {
                game.enemyRespawnQueue.push({ timer: 20, pos: respawnPos });
              }
              game.gameManager.setState({
                enemiesRemaining: game.enemies.length,
                enemiesKilled: game.gameManager.getState().enemiesKilled + 1,
              });
            }
            break;
          }
        }
      } else {
        const distSq = projPos.distanceToSquared(playerPos);
        if (distSq < playerRadiusSq) {
          game.player.health -= 10;
          game.player.lastDamageTime = game.clock.elapsedTime;
          game.showDamageIndicator(projPos);
          proceduralAudio.shieldHit();
          hitSomething = true;
        }
      }
    }

    let wallHitDetected = false;
    if (!hitSomething && proj.prevPosition) {
      const wallHit = castSphere(
        proj.prevPosition.x,
        proj.prevPosition.y,
        proj.prevPosition.z,
        projPos.x,
        projPos.y,
        projPos.z,
        0.3,
      );
      if (wallHit) {
        const toi = Number(wallHit.toi) || 0;
        if (proj.isPlayerOwned && toi < 0.01) {
          // skip spawn-point penetration
        } else {
          _hitPos.set(
            proj.prevPosition.x + proj.direction.x * toi,
            proj.prevPosition.y + proj.direction.y * toi,
            proj.prevPosition.z + proj.direction.z * toi,
          );
          if (isNaN(_hitPos.x)) _hitPos.copy(proj.prevPosition);
          _hitNormal.set(
            wallHit.normal2.x,
            wallHit.normal2.y,
            wallHit.normal2.z,
          );
          if (_hitNormal.dot(proj.direction) > 0) {
            _hitNormal.negate();
          }
          wallHitDetected = true;
          hitSomething = true;
        }
      }
    }

    const spawnOverlap =
      proj.isPlayerOwned &&
      proj.spawnOrigin &&
      projPos.distanceToSquared(proj.spawnOrigin) < 4;
    if (
      !hitSomething &&
      !spawnOverlap &&
      checkSphereCollision(projPos.x, projPos.y, projPos.z, 0.5)
    ) {
      _hitPos.copy(proj.prevPosition);
      _hitNormal.copy(proj.direction).negate();
      wallHitDetected = true;
      hitSomething = true;
    }

    if (wallHitDetected && game.particles) {
      _sparkPos.copy(_hitPos).addScaledVector(_hitNormal, 0.05);
      game.sparksEffect.emitElectricalSparks(_sparkPos, _hitNormal, 100);
      game.dynamicLights?.flash(_hitPos, projColor, {
        intensity: 8,
        distance: 12,
        ttl: 0.05,
        fade: 0.1,
      });
    }

    if (hitSomething) {
      proj.dispose(game.scene);
      game.projectiles.splice(i, 1);
    }
  }

  for (let i = game.missiles.length - 1; i >= 0; i--) {
    const missile = game.missiles[i];

    if (missile.disposed || missile.lifetime <= 0) {
      missile.dispose(game.scene);
      game.missiles.splice(i, 1);
      continue;
    }

    let exploded = false;
    const missilePos = missile.getPosition();

    for (let j = game.enemies.length - 1; j >= 0; j--) {
      const enemy = game.enemies[j];
      if (enemy.pointInHitbox(missilePos)) {
        enemy.takeDamage(missile.damage);
        exploded = true;

        if (enemy.health <= 0) {
          const deathPos = enemy.mesh.position.clone();
          const deathQuat = enemy.mesh.quaternion.clone();
          const explosion = new Explosion(
            game.scene,
            deathPos,
            enemy.glowColor,
            game.dynamicLights,
            { big: true },
          );
          game.explosions.push(explosion);
          sfxManager.play("ship-explosion", deathPos, 0.6);
          if (game.particles) {
            game.explosionEffect.emitBigExplosion(deathPos);
          }
          spawnDestruction(game.scene, deathPos, deathQuat, enemy.modelIndex);
          const respawnPos = enemy.spawnPoint;
          enemy.dispose(game.scene);
          game.enemies.splice(j, 1);
          if (!game.isMultiplayer) {
            game.enemyRespawnQueue.push({ timer: 20, pos: respawnPos });
          }
          game.gameManager.setState({
            enemiesRemaining: game.enemies.length,
            enemiesKilled: game.gameManager.getState().enemiesKilled + 1,
          });
        }
        break;
      }
    }

    if (!exploded && game.isMultiplayer) {
      for (const [, remote] of game.remotePlayers) {
        if (remote.mesh) {
          const distSq = missilePos.distanceToSquared(remote.mesh.position);
          if (distSq < 4) {
            exploded = true;
            break;
          }
        }
      }
    }

    if (!exploded && missile.checkWallCollision()) {
      exploded = true;
    }

    if (exploded) {
      const explosion = new Explosion(
        game.scene,
        missilePos,
        0xff4400,
        game.dynamicLights,
      );
      game.explosions.push(explosion);
      if (game.particles) {
        game.explosionEffect.emitExplosionParticles(
          missilePos,
          { r: 1, g: 0.4, b: 0.1 },
          30,
        );
      }
      missile.dispose(game.scene);
      game.missiles.splice(i, 1);
    }
  }
}
