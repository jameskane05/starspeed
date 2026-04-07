import * as THREE from "three";
import * as gameEnemies from "../game/gameEnemies.js";

export const TRAINING_MISSION_WAVE_SIZE = 3;
const TRAINING_GOAL_ORDER = ["Goal", "Goal.001", "Goal.002"];
let trainingGoalPositionsPromise = null;

function updateCountObjective(manager, id, label, count, total) {
  manager.updateObjective(id, {
    text: `${label} (${count}/${total})`,
    completed: count >= total,
  });
}

function setWeaponPermissions(
  manager,
  { playerLaserEnabled = true, playerMissilesEnabled = false } = {},
) {
  manager.game.gameManager.setState({
    playerLaserEnabled,
    playerMissilesEnabled,
  });
}

function getNearestTrainingBot(manager) {
  const playerPos = manager.getPlayerPosition();
  let nearest = null;
  let nearestDistanceSq = Infinity;
  for (const enemy of manager.game.enemies) {
    if (
      !enemy ||
      enemy.disposed ||
      enemy.health <= 0 ||
      enemy.missionPoolSlot == null ||
      !enemy.mesh?.visible
    ) {
      continue;
    }
    const distanceSq = enemy.mesh.position.distanceToSquared(playerPos);
    if (distanceSq < nearestDistanceSq) {
      nearest = enemy;
      nearestDistanceSq = distanceSq;
    }
  }
  return nearest;
}

function enableNearestTrainingBotHelper(manager) {
  manager.setDirectionalHelperTarget({
    type: "trainingBot",
    getWorldPosition: (out) => {
      const enemy = getNearestTrainingBot(manager);
      if (!enemy?.mesh) return null;
      return enemy.mesh.getWorldPosition(out);
    },
  });
}

function disableNearestTrainingBotHelper(manager) {
  manager.clearDirectionalHelperTarget("trainingBot");
}

function enableTrainingMissilePickupHelper(manager) {
  manager.setDirectionalHelperTarget({
    type: "missilePickup",
    getWorldPosition: (out) => {
      const list = manager.game._missilePickups;
      if (!list?.length) return null;
      const pick = list.find((p) => p.active && p.collectible?.group);
      if (!pick?.collectible?.group) return null;
      return pick.collectible.group.getWorldPosition(out);
    },
  });
}

async function concludeMissileTraining(manager) {
  const allSpawns = getAllLevelEnemySpawnPositions(manager.game);
  if (allSpawns.length) {
    try {
      await manager.spawnEnemyWave(allSpawns);
    } catch (err) {
      console.warn("[Training] spawnEnemyWave:", err);
    }
  }
  manager.completeMission(
    "Training complete — all targets deployed. Keep practicing!",
    { preserveEnemyPool: true, missionCompleteOverlay: true },
  );
  manager.refillMissiles();
}

function getTrainingGoalAssetUrl() {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "";
  return (base ? `${base}/splats/spaceship-data.glb` : "./splats/spaceship-data.glb").replace(
    /\/+/g,
    "/",
  );
}

async function loadTrainingGoalPositionsFromFile() {
  if (!trainingGoalPositionsPromise) {
    trainingGoalPositionsPromise = (async () => {
      const response = await fetch(getTrainingGoalAssetUrl(), {
        cache: "no-cache",
      });
      if (!response.ok) {
        throw new Error(`Failed to load training goal GLB: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const view = new DataView(buffer);
      const magic = view.getUint32(0, true);
      const jsonChunkLength = view.getUint32(12, true);
      const jsonChunkType = view.getUint32(16, true);
      if (magic !== 0x46546c67 || jsonChunkType !== 0x4e4f534a) {
        throw new Error("Invalid GLB structure");
      }

      const jsonText = new TextDecoder().decode(
        new Uint8Array(buffer, 20, jsonChunkLength),
      );
      const gltf = JSON.parse(jsonText);
      const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
      const objects = nodes.map((node) => {
        const object = new THREE.Object3D();
        object.name = node?.name || "";
        if (Array.isArray(node?.translation) && node.translation.length >= 3) {
          object.position.set(
            node.translation[0],
            node.translation[1],
            node.translation[2],
          );
        }
        if (Array.isArray(node?.rotation) && node.rotation.length >= 4) {
          object.quaternion.set(
            node.rotation[0],
            node.rotation[1],
            node.rotation[2],
            node.rotation[3],
          );
        }
        if (Array.isArray(node?.scale) && node.scale.length >= 3) {
          object.scale.set(node.scale[0], node.scale[1], node.scale[2]);
        }
        return object;
      });

      nodes.forEach((node, index) => {
        if (!Array.isArray(node?.children)) return;
        const parent = objects[index];
        for (const childIndex of node.children) {
          const child = objects[childIndex];
          if (child) parent.add(child);
        }
      });

      const root = new THREE.Group();
      const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
      const sceneNodes = gltf.scenes?.[sceneIndex]?.nodes ?? [];
      for (const nodeIndex of sceneNodes) {
        const object = objects[nodeIndex];
        if (object) root.add(object);
      }
      root.updateMatrixWorld(true);

      const goalMap = new Map();
      root.traverse((child) => {
        if (!TRAINING_GOAL_ORDER.includes(child.name)) return;
        const pos = new THREE.Vector3();
        child.getWorldPosition(pos);
        goalMap.set(child.name, pos);
      });

      return TRAINING_GOAL_ORDER.map((name) => goalMap.get(name))
        .filter(Boolean)
        .map((goalPosition) => goalPosition.clone());
    })().catch((error) => {
      trainingGoalPositionsPromise = null;
      throw error;
    });
  }

  const positions = await trainingGoalPositionsPromise;
  return positions.map((goalPosition) => goalPosition.clone());
}

function getAuthoredGoalPositions(game) {
  const cachedGoals = game.trainingGoalPoints ?? [];
  if (cachedGoals.length >= 3) {
    return cachedGoals.slice(0, 3).map((goalPosition) => goalPosition.clone());
  }

  const levelId = game.gameManager?.getState?.()?.currentLevel;
  const levelDataId = levelId ? `${levelId}LevelData` : null;
  const levelData = levelDataId
    ? game.sceneManager?.getObject?.(levelDataId)
    : null;
  if (!levelData?.traverse) return [];

  const goalOrder = ["Goal", "Goal.001", "Goal.002"];
  const goalMap = new Map();
  levelData.updateMatrixWorld?.(true);
  levelData.traverse((child) => {
    const name = child?.name;
    if (!goalOrder.includes(name)) return;
    const pos = new THREE.Vector3();
    child.getWorldPosition(pos);
    goalMap.set(name, pos);
  });
  return goalOrder
    .map((name) => goalMap.get(name))
    .filter(Boolean)
    .map((goalPosition) => goalPosition.clone());
}

async function getCheckpointPositions(game) {
  // Prefer markers from the loaded level (world space). GLB-only goals from
  // spaceship-data use that asset's local frame and do not match newworld placement.
  const authoredGoals = getAuthoredGoalPositions(game);
  if (authoredGoals.length >= 3) {
    return authoredGoals;
  }

  try {
    const fileGoals = await loadTrainingGoalPositionsFromFile();
    if (fileGoals.length >= 3) {
      return fileGoals;
    }
  } catch (error) {
    console.warn("[Training] Failed to read goal markers from GLB:", error);
  }

  const playerPos = (
    game.player?.camera?.position ??
    game.camera?.position ??
    game.playerSpawnPoints?.[0] ??
    new THREE.Vector3(0, 0, 0)
  ).clone();
  const playerQuat = (
    game.player?.camera?.quaternion ??
    game.camera?.quaternion ??
    null
  )?.clone?.();

  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  if (playerQuat) {
    forward.applyQuaternion(playerQuat);
    right.applyQuaternion(playerQuat);
  }
  forward.y = 0;
  right.y = 0;
  if (forward.lengthSq() === 0) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }
  if (right.lengthSq() === 0) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }

  const first = playerPos.clone().addScaledVector(forward, 20);
  const second = first
    .clone()
    .addScaledVector(forward, 20)
    .addScaledVector(right, 10);
  const third = second
    .clone()
    .addScaledVector(forward, 20)
    .addScaledVector(right, -20);

  return [first, second, third];
}

export function getTrainingMissionEnemySpawnPositions(game) {
  const enemySpawns = game.spawnPoints ?? [];
  if (!enemySpawns.length) {
    const origin = (
      game.camera.position ??
      game.playerSpawnPoints?.[0] ??
      new THREE.Vector3(0, 0, 0)
    ).clone();
    return Array.from({ length: TRAINING_MISSION_WAVE_SIZE }, (_, index) =>
      origin.clone().add(new THREE.Vector3(index * 8 - 8, 3 + index * 2, -35)),
    );
  }
  return enemySpawns
    .slice(0, TRAINING_MISSION_WAVE_SIZE)
    .map((spawn) => spawn.clone());
}

/** Every authored Enemy spawn in the level (post-mission practice wave). */
export function getAllLevelEnemySpawnPositions(game) {
  const enemySpawns = game.spawnPoints ?? [];
  if (!enemySpawns.length) {
    const origin = (
      game.camera?.position ??
      game.playerSpawnPoints?.[0] ??
      new THREE.Vector3(0, 0, 0)
    ).clone();
    const n = Math.max(TRAINING_MISSION_WAVE_SIZE, 8);
    return Array.from({ length: n }, (_, index) =>
      origin
        .clone()
        .add(
          new THREE.Vector3(
            index * 10 - (n * 5),
            4 + (index % 4) * 2,
            -45 - index * 8,
          ),
        ),
    );
  }
  return enemySpawns.map((spawn) => spawn.clone());
}

export const trainingGroundsMission = {
  id: "trainingGrounds",
  defaultLevelId: "newworld",
  startStepId: "introDialog",

  start(manager) {
    manager.game.enemyRespawnQueue.length = 0;
    disableNearestTrainingBotHelper(manager);
    manager.prewarmCheckpointGraphics?.();
    manager.game.gameManager.setState({
      selectedMissileMode: "homing",
      playerLaserEnabled: true,
      playerMissilesEnabled: false,
    });
  },

  steps: {
    introDialog: {
      title: "Training Grounds",
      enter(manager) {
        setWeaponPermissions(manager);
        manager.setObjectives("Training Grounds", [
          {
            id: "listenIntro",
            text: "Listen to the briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted") return;
        if (payload.id !== "trainingGroundsIntroFollowUpCont") return;
        manager.completeObjective("listenIntro");
        manager.enterStep("movementGoals");
      },
    },

    movementGoals: {
      title: "Basic Flight",
      async enter(manager) {
        setWeaponPermissions(manager);
        manager.runtime.movementGoalsCompleted = 0;
        manager.runtime.trainingBoostHintPlayed = false;
        manager.runtime.trainingStrafeUpDownHintPlayed = false;
        manager.setObjectives("Basic Flight", [
          {
            id: "movementGoals",
            text: "Steer through the goals (0/3)",
            completed: false,
          },
        ]);
        await manager.setCheckpointSequence(
          await getCheckpointPositions(manager.game),
          {
            radius: 6.5,
            triggerRadius: 11,
          },
        );
      },
      onEvent(manager, type, payload) {
        if (type === "checkpointReached") {
          manager.runtime.movementGoalsCompleted = payload.completed;
          updateCountObjective(
            manager,
            "movementGoals",
            "Steer through the goals",
            payload.completed,
            payload.total,
          );
          if (payload.completed === 1 && !manager.runtime.trainingBoostHintPlayed) {
            manager.runtime.trainingBoostHintPlayed = true;
            const mobile = manager.gameManager.getState()?.isMobile === true;
            manager.game.dialogManager?.playDialog?.(
              mobile
                ? "trainingGroundsBoostMobile"
                : "trainingGroundsBoostDesktop",
            );
          }
          if (
            payload.completed === 2 &&
            !manager.runtime.trainingStrafeUpDownHintPlayed
          ) {
            manager.runtime.trainingStrafeUpDownHintPlayed = true;
            const mobile = manager.gameManager.getState()?.isMobile === true;
            manager.game.dialogManager?.playDialog?.(
              mobile
                ? "trainingGroundsStrafeUpDownMobile"
                : "trainingGroundsStrafeUpDownDesktop",
            );
          }
          return;
        }
        if (type === "checkpointSequenceCompleted") {
          manager.enterStep("aceFlyingBrief");
        }
      },
    },

    aceFlyingBrief: {
      title: "Basic Flight",
      enter(manager) {
        setWeaponPermissions(manager);
        manager.setObjectives("Basic Flight", [
          {
            id: "listenAceFlying",
            text: "Listen to the briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted") return;
        const id = payload.id;
        if (id !== "trainingGroundsBarrelRollBrief") return;
        manager.completeObjective("listenAceFlying");
        manager.enterStep("rollDialog");
      },
    },

    rollDialog: {
      title: "Roll Training",
      async enter(manager) {
        setWeaponPermissions(manager);
        manager.setObjectives("Roll Training", [
          {
            id: "listenRoll",
            text: "Listen to the roll instructions.",
            completed: false,
          },
        ]);
        manager.completeObjective("listenRoll");
        await manager.enterStep("rollTraining");
      },
    },

    rollTraining: {
      title: "Roll Training",
      enter(manager) {
        setWeaponPermissions(manager);
        manager.runtime.rollLeftObserved = false;
        manager.runtime.rollRightObserved = false;
        manager.setObjectives("Roll Training", [
          {
            id: "rollLeft",
            text: "Roll left.",
            completed: false,
          },
          {
            id: "rollRight",
            text: "Roll right.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "rollInput") return;

        if (payload.direction === "left" && !manager.runtime.rollLeftObserved) {
          manager.runtime.rollLeftObserved = true;
          manager.completeObjective("rollLeft");
        }
        if (payload.direction === "right" && !manager.runtime.rollRightObserved) {
          manager.runtime.rollRightObserved = true;
          manager.completeObjective("rollRight");
        }
        if (manager.areObjectivesComplete(["rollLeft", "rollRight"])) {
          manager.enterStep("laserDialog");
        }
      },
    },

    laserDialog: {
      title: "Target Practice",
      enter(manager) {
        disableNearestTrainingBotHelper(manager);
        setWeaponPermissions(manager);
        manager.runtime.trainingLaserBotsSpawned = false;
        manager.runtime.laserKills = 0;
        manager.setObjectives("Target Practice", [
          {
            id: "listenLasers",
            text: "Listen to the target practice briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type === "dialogMissionMilestone") {
          if (
            payload.dialogId !== "trainingGroundsLaserIntro" ||
            payload.event !== "trainingLaserBotsSpawn" ||
            manager.runtime.trainingLaserBotsSpawned
          ) {
            return;
          }
          manager.runtime.trainingLaserBotsSpawned = true;
          manager.runtime.laserKills = 0;
          const positions = getTrainingMissionEnemySpawnPositions(manager.game);
          enableNearestTrainingBotHelper(manager);
          void manager.spawnEnemyWave(positions);
          manager.setObjectives("Target Practice", [
            {
              id: "listenLasers",
              text: "Listen to the target practice briefing.",
              completed: false,
            },
            {
              id: "laserWave",
              text: "Destroy the bots (0/3)",
              completed: false,
            },
          ]);
          return;
        }
        if (type === "enemyDestroyed") {
          if (!manager.runtime.trainingLaserBotsSpawned) return;
          manager.runtime.laserKills =
            (manager.runtime.laserKills || 0) + 1;
          updateCountObjective(
            manager,
            "laserWave",
            "Destroy the bots",
            manager.runtime.laserKills,
            3,
          );
          return;
        }
        if (type !== "dialogCompleted") return;
        const id = payload.id;
        if (
          id !== "trainingGroundsLaserIntroDesktop" &&
          id !== "trainingGroundsLaserIntroMobile"
        ) {
          return;
        }
        manager.completeObjective("listenLasers");
        manager.enterStep("laserWave");
      },
    },

    laserWave: {
      title: "Target Practice",
      enter(manager) {
        setWeaponPermissions(manager, { playerLaserEnabled: true });
        if (manager.runtime.laserKills >= 3) {
          manager.enterStep("missileDialog");
          return;
        }
        if (!manager.runtime.trainingLaserBotsSpawned) {
          manager.runtime.laserKills = 0;
          const positions = getTrainingMissionEnemySpawnPositions(manager.game);
          enableNearestTrainingBotHelper(manager);
          void manager.spawnEnemyWave(positions);
          manager.runtime.trainingLaserBotsSpawned = true;
        }
        const k = manager.runtime.laserKills;
        manager.setObjectives("Target Practice", [
          {
            id: "laserWave",
            text: `Destroy the bots (${k}/3)`,
            completed: k >= 3,
          },
        ]);
      },
      onEvent(manager, type) {
        if (type !== "enemyDestroyed") return;
        manager.runtime.laserKills += 1;
        updateCountObjective(
          manager,
          "laserWave",
          "Destroy the bots",
          manager.runtime.laserKills,
          3,
        );
        if (manager.runtime.laserKills >= 3) {
          manager.enterStep("missileDialog");
        }
      },
    },

    missileDialog: {
      title: "Missile Training",
      enter(manager) {
        disableNearestTrainingBotHelper(manager);
        setWeaponPermissions(manager, { playerLaserEnabled: true });
        manager.refillMissiles();
        manager.setObjectives("Missile Training", [
          {
            id: "listenMissiles",
            text: "Listen to the missile briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted") return;
        const id = payload.id;
        if (
          id !== "trainingGroundsMissileToggleDesktop" &&
          id !== "trainingGroundsMissileToggleMobile"
        ) {
          return;
        }
        manager.completeObjective("listenMissiles");
        manager.enterStep("missileWave");
      },
    },

    missileWave: {
      title: "Missile Training",
      enter(manager) {
        setWeaponPermissions(manager, {
          playerLaserEnabled: true,
          playerMissilesEnabled: true,
        });
        manager.runtime.missileModeSwitched = false;
        manager.runtime.missileFired = false;
        manager.runtime.missileWaveKills = 0;
        manager.refillMissiles();
        const positions = getTrainingMissionEnemySpawnPositions(manager.game);
        enableNearestTrainingBotHelper(manager);
        manager.setObjectives("Missile Training", [
          {
            id: "switchMode",
            text: "Switch missile type with G.",
            completed: false,
          },
          {
            id: "fireMissile",
            text: "Fire a missile with the right mouse button.",
            completed: false,
          },
          {
            id: "clearMissileWave",
            text: "Destroy the incoming bots (0/3)",
            completed: false,
          },
        ]);
        manager.spawnEnemyWave(positions);
      },
      onEvent(manager, type) {
        if (type === "missileModeSwitched" && !manager.runtime.missileModeSwitched) {
          manager.runtime.missileModeSwitched = true;
          manager.completeObjective("switchMode");
        }

        if (type === "missileFired" && !manager.runtime.missileFired) {
          manager.runtime.missileFired = true;
          manager.completeObjective("fireMissile");
        }

        if (type === "enemyDestroyed") {
          manager.runtime.missileWaveKills += 1;
          updateCountObjective(
            manager,
            "clearMissileWave",
            "Destroy the incoming bots",
            manager.runtime.missileWaveKills,
            3,
          );
        }

        if (
          manager.runtime.missileWaveKills >= 3 &&
          manager.areObjectivesComplete(["switchMode", "fireMissile", "clearMissileWave"])
        ) {
          if (manager.game.gameManager?.state?.isMobile) {
            manager.enterStep("ammoCollectibleBrief");
          } else {
            manager.enterStep("tildeRemapDesktop");
          }
        }
      },
    },

    tildeRemapDesktop: {
      title: "Missile Training",
      enter(manager) {
        disableNearestTrainingBotHelper(manager);
        manager.game.dialogManager?.playDialog?.(
          "trainingGroundsTildeRemapDesktop",
        );
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted") return;
        if (payload.id !== "trainingGroundsTildeRemapDesktop") return;
        manager.enterStep("ammoCollectibleBrief");
      },
    },

    ammoCollectibleBrief: {
      title: "Resupply",
      enter(manager) {
        disableNearestTrainingBotHelper(manager);
        setWeaponPermissions(manager, {
          playerLaserEnabled: true,
          playerMissilesEnabled: true,
        });
        manager.setObjectives("Resupply", [
          {
            id: "listenAmmoBrief",
            text: "Listen to the resupply briefing.",
            completed: false,
          },
        ]);
        manager.game.dialogManager?.playDialog?.(
          "trainingGroundsAmmoCollectible",
        );
      },
      onEvent(manager, type, payload) {
        if (type === "dialogCompleted") {
          if (payload.id !== "trainingGroundsAmmoCollectible") return;
          manager.completeObjective("listenAmmoBrief");
          const game = manager.game;
          const points = game.missileSpawnPoints ?? [];
          if (points.length === 0) {
            console.warn(
              "[Training] No missile spawn points in level data; skipping ammo pickup phase.",
            );
            manager.enterStep("trainingCompleteOutro");
            return;
          }
          gameEnemies.spawnMissilePickups(game);
          const maxM = game.player?.maxMissiles ?? 6;
          if (game.player) {
            game.player.missiles = Math.max(0, maxM - 1);
          }
          game.updateHUD?.();
          enableTrainingMissilePickupHelper(manager);
          manager.setObjectives("Resupply", [
            {
              id: "collectMissileAmmo",
              text: "Fly into the missile ammo pickup to restock.",
              completed: false,
            },
          ]);
          return;
        }
        if (type === "trainingMissilePickupCollected") {
          manager.completeObjective("collectMissileAmmo");
          manager.clearDirectionalHelperTarget("missilePickup");
          manager.enterStep("trainingCompleteOutro");
        }
      },
    },

    trainingCompleteOutro: {
      title: "Missile Training",
      enter(manager) {
        disableNearestTrainingBotHelper(manager);
        manager.game.dialogManager?.playDialog?.(
          "trainingGroundsTrainingComplete",
        );
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted") return;
        if (payload.id !== "trainingGroundsTrainingComplete") return;
        void concludeMissileTraining(manager);
      },
    },
  },
};

export default trainingGroundsMission;
