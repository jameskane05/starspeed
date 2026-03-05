import * as THREE from "three";
import { stepWorld } from "../physics/Physics.js";
import { updateDestruction } from "../vfx/ShipDestruction.js";
import NetworkManager from "../network/NetworkManager.js";
import proceduralAudio from "../audio/ProceduralAudio.js";
import engineAudio from "../audio/EngineAudio.js";
import * as gameInGameUI from "./gameInGameUI.js";

const _enginePos = new THREE.Vector3();
const _audioForward = new THREE.Vector3();
const _audioUp = new THREE.Vector3();
const _unitForward = new THREE.Vector3();

export function tick(game, delta, timestamp, frame) {
  game._frameCount++;
  const isPlaying = game.gameManager.isPlaying();

  if (!isPlaying) {
    proceduralAudio.shieldRechargeStop();
  }

  if (game.xrManager) {
    game.xrManager.update(timestamp, frame);
  }

  game.input.pollGamepad();

  if (isPlaying) {
    game.dynamicSceneElementManager?.update();
    stepWorld();

    const multiplayerDead =
      game.isMultiplayer &&
      NetworkManager.getLocalPlayer() &&
      !NetworkManager.getLocalPlayer().alive;

    if (multiplayerDead) {
      proceduralAudio.shieldRechargeStop();
    }

    if (!game._soloRespawning && !multiplayerDead) {
      game.input.update(delta);
      game.handleGamepadFire();

      if (game.player) {
        const boostFuelBefore = game.player.boostFuel;
        game.player.update(delta, game.clock.elapsedTime);
        if (game.isMultiplayer) {
          const localPlayer = NetworkManager.getLocalPlayer();
          if (localPlayer) {
            game.player.boostFuel = localPlayer.boostFuel;
            game.player.maxBoostFuel = localPlayer.maxBoostFuel;
            game.player.isBoosting = localPlayer.isBoosting;
          }
        }
        engineAudio.update(delta, game.player);
        updateBoostDoF(game, delta);
        const isBoosting = game.isMultiplayer
          ? (NetworkManager.getLocalPlayer()?.isBoosting ?? false)
          : game.player.isBoosting;
        const t = game.clock.elapsedTime;
        if (
          game.player.engineMarkers?.length > 0 &&
          game.playerEngineTrails.length >= 2
        ) {
          if (isBoosting) {
            for (
              let i = 0;
              i < game.player.engineMarkers.length && i < 2;
              i++
            ) {
              game.player.engineMarkers[i].getWorldPosition(_enginePos);
              game.playerEngineTrails[i].addPoint(_enginePos, t);
            }
          }
          game.playerEngineTrails[0].update(t);
          game.playerEngineTrails[1].update(t);
        }
        if (!game.isMultiplayer) {
          const p = game.player;
          const elapsed = game.clock.elapsedTime;
          if (
            p.health < p.maxHealth &&
            elapsed - p.lastDamageTime >= p.shieldRegenDelay
          ) {
            p.health = Math.min(
              p.maxHealth,
              p.health + p.shieldRegenRate * delta,
            );
          }
          const isShieldRecharging =
            p.health < p.maxHealth &&
            elapsed - p.lastDamageTime >= p.shieldRegenDelay;
          if (isShieldRecharging) {
            proceduralAudio.shieldRechargeUpdate(p.health / p.maxHealth);
          } else {
            proceduralAudio.shieldRechargeStop();
          }
        } else {
          const p = game.player;
          if (p.health < p.maxHealth) {
            proceduralAudio.shieldRechargeUpdate(p.health / p.maxHealth);
          } else {
            proceduralAudio.shieldRechargeStop();
          }
        }
      }
    }

    game.remotePlayers.forEach((remote) => {
      remote.update(delta);
    });

    game.collectibles.forEach((collectible) => {
      collectible.update(delta);
    });

    if (!game.isMultiplayer) {
      const playerPos = game.xrManager?.isPresenting
        ? game.xrManager.rig.position
        : game.camera.position;
      game._checkMissilePickups(playerPos, delta);
    }

    if (!game.isMultiplayer) {
      const cullDist =
        game.gameManager.getPerformanceProfile().enemyCullDistance ?? 200;
      for (let i = 0; i < game.enemies.length; i++) {
        game.enemies[i].update(
          delta,
          game.camera.position,
          game.boundFireEnemy,
          game._frameCount,
          cullDist,
        );
      }
      game.tickEnemyRespawns(delta);
    }

    game.projectiles.forEach((proj) => proj.update(delta));

    const missileTargets = [
      ...game.enemies,
      ...Array.from(game.remotePlayers.values()),
    ];
    game.missiles.forEach((m) => m.update(delta, missileTargets));

    if (game.isMultiplayer) {
      game.localMissileIds.forEach((missile, serverId) => {
        if (missile.disposed || missile.lifetime <= 0) {
          game.localMissileIds.delete(serverId);
        } else {
          NetworkManager.sendMissileUpdate(
            serverId,
            missile.group.position,
            missile.direction,
          );
        }
      });
    }

    game.networkProjectiles.forEach((data, id) => {
      if (data.type === "projectile") {
        data.obj.update(delta);
      } else if (data.type === "missile") {
        const serverProj = NetworkManager.getState()?.projectiles?.get(id);
        if (serverProj) {
          data.obj.group.position.set(
            serverProj.x,
            serverProj.y,
            serverProj.z,
          );
          data.obj.direction
            .set(serverProj.dx, serverProj.dy, serverProj.dz)
            .normalize();
          _unitForward.set(0, 0, 1);
          data.obj.group.quaternion.setFromUnitVectors(
            _unitForward,
            data.obj.direction,
          );
        }

        data.obj.lifetime -= delta;
        if (data.obj.particles) {
          data.obj.spawnTimer += delta;
          while (data.obj.spawnTimer >= data.obj.spawnRate) {
            data.obj.spawnTimer -= data.obj.spawnRate;
            data.obj.trailsEffect.emitMissileExhaust(
              data.obj.group.position,
              data.obj.group.quaternion,
              data.obj.direction,
            );
          }
        }
        data.obj.trail.material.opacity = 0.6 + Math.random() * 0.25;
      }
    });

    for (let i = game.explosions.length - 1; i >= 0; i--) {
      if (!game.explosions[i].update(delta)) {
        game.explosions.splice(i, 1);
      }
    }

    for (let i = game.impacts.length - 1; i >= 0; i--) {
      if (!game.impacts[i].update(delta)) {
        game.impacts.splice(i, 1);
      }
    }

    updateDestruction(delta);

    game.checkCollisions();

    game.updateHUD(delta);
    gameInGameUI.updateLeaderboardTimer(game);
    game.sendInputToServer(delta);

    if (game.isMultiplayer && game.player) {
      game.prediction.applySmoothCorrection(game.camera.position, delta);
    }

    if (
      game.player &&
      game.player.health <= 0 &&
      !game.isMultiplayer &&
      !game._soloRespawning
    ) {
      game.gameManager.setState({
        deaths: (game.gameManager.getState().deaths || 0) + 1,
      });
      game._startSoloRespawn();
    }
  }

  game.particles?.update(delta);
  game.dynamicLights?.update(delta);
  game.musicManager?.update(delta);
  game.gizmoManager?.update(delta);

  if (game.camera && proceduralAudio) {
    _audioForward.set(0, 0, -1).applyQuaternion(game.camera.quaternion);
    _audioUp.set(0, 1, 0).applyQuaternion(game.camera.quaternion);
    proceduralAudio.setListenerPosition(
      game.camera.position,
      _audioForward,
      _audioUp,
    );
  }

  if (game.projectileSplatLayer) {
    game.projectileSplatLayer.updateMatrixWorld(true);
  }

  if (game.xrManager?.isPresenting) {
    game.renderer.render(game.scene, game.camera);
  } else if (game._bloomActive) {
    game.composer.render();
  } else {
    game.renderer.render(game.scene, game.camera);
  }
}

export function updateBoostDoF(game, delta) {
  if (!game.sparkRenderer || !game.player) return;
  const target = game.player.isBoosting ? game._boostDoFAngleMax : 0;
  const rate = 6;
  const t = 1 - Math.exp(-rate * delta);
  game._boostDoFApertureAngle += (target - game._boostDoFApertureAngle) * t;
  game.sparkRenderer.apertureAngle = game._boostDoFApertureAngle;
}

export function updateBloomActive(game) {
  game._bloomActive = game.bloomEnabled && game.bloomPass.strength > 0.01;
  game.bloomPass.enabled = game._bloomActive;
  if (game.sparkRenderer) {
    game.sparkRenderer.encodeLinear = game._bloomActive;
  }
}

export function onResize(game) {
  const vp = window.visualViewport;
  const w = vp ? Math.round(vp.width) : window.innerWidth;
  const h = vp ? Math.round(vp.height) : window.innerHeight;
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(w, h);
  game.composer?.setSize(w, h);
  game.bloomPass?.resolution?.set(w, h);
}
