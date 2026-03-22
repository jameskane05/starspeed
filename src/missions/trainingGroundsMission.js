import * as THREE from "three";

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

function getCheckpointPositions(game) {
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

function getAllEnemySpawnPositions(game) {
  const enemySpawns = game.spawnPoints ?? [];
  if (!enemySpawns.length) {
    const origin = (
    game.camera.position ??
      game.playerSpawnPoints?.[0] ??
      new THREE.Vector3(0, 0, 0)
  ).clone();
    return Array.from({ length: 3 }, (_, index) =>
      origin.clone().add(new THREE.Vector3(index * 8 - 8, 3 + index * 2, -35)),
    );
  }
  return enemySpawns.map((spawn) => spawn.clone());
}

export const trainingGroundsMission = {
  id: "trainingGrounds",
  defaultLevelId: "arenatech",
  startStepId: "introDialog",

  start(manager) {
    manager.game.enemyRespawnQueue.length = 0;
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
        if (type !== "dialogCompleted" || payload.id !== "trainingGroundsIntro") {
          return;
        }
        manager.completeObjective("listenIntro");
        manager.enterStep("movementGoals");
      },
    },

    movementGoals: {
      title: "Basic Flight",
      enter(manager) {
        setWeaponPermissions(manager);
        manager.runtime.movementGoalsCompleted = 0;
        manager.setObjectives("Basic Flight", [
          {
            id: "movementGoals",
            text: "Steer through the goals (0/3)",
            completed: false,
          },
        ]);
        manager.setCheckpointSequence(getCheckpointPositions(manager.game), {
          radius: 4.5,
          triggerRadius: 5.25,
        });
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
          return;
        }
        if (type === "checkpointSequenceCompleted") {
          manager.enterStep("rollDialog");
        }
      },
    },

    rollDialog: {
      title: "Roll Training",
      enter(manager) {
        setWeaponPermissions(manager);
        manager.setObjectives("Roll Training", [
          {
            id: "listenRoll",
            text: "Listen to the roll instructions.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted" || payload.id !== "trainingGroundsRollIntro") {
          return;
        }
        manager.completeObjective("listenRoll");
        manager.enterStep("rollTraining");
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
        setWeaponPermissions(manager);
        manager.setObjectives("Target Practice", [
          {
            id: "listenLasers",
            text: "Listen to the target practice briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, payload) {
        if (type !== "dialogCompleted" || payload.id !== "trainingGroundsLaserIntro") {
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
        manager.runtime.laserKills = 0;
        const positions = getAllEnemySpawnPositions(manager.game);
        manager.setObjectives("Target Practice", [
          {
            id: "laserWave",
            text: "Destroy the bots (0/3)",
            completed: false,
          },
        ]);
        manager.spawnEnemyWave(positions);
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
        if (
          type !== "dialogCompleted" ||
          payload.id !== "trainingGroundsMissileIntro"
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
        const positions = getAllEnemySpawnPositions(manager.game);
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
          manager.completeMission();
        }
      },
    },
  },
};

export default trainingGroundsMission;
