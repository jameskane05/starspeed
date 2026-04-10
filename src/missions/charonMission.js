import { spawnMissionWaveFromPool } from "../game/gameEnemies.js";

export const charonMission = {
  id: "charon",
  defaultLevelId: "charon",
  startStepId: "briefing",

  start(manager) {
    const game = manager.game;
    game.enemyRespawnQueue.length = 0;
    game.gameManager.setState({
      selectedMissileMode: "homing",
      playerLaserEnabled: true,
      playerMissilesEnabled: true,
    });
    const positions = game._charonInitialEnemyPositions;
    if (positions?.length) {
      spawnMissionWaveFromPool(game, positions);
    }
  },

  steps: {
    briefing: {
      title: "Charon",
      enter(manager) {
        manager.setObjectives("Charon", [
          {
            id: "awaitBriefing",
            text: "Await mission briefing.",
            completed: false,
          },
        ]);
      },
      onEvent(manager, type, _payload) {
        if (type === "charonTriggerMain") {
          // Wire dialog in levelTriggerData.js (playDialog) or play here.
        }
      },
    },
  },
};

export default charonMission;
