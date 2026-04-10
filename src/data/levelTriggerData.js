/**
 * Binds level-authored trigger mesh names (see SceneManager: `Trigger`, `Trigger.001`, …)
 * to gameplay: criteria, one-shot, GameManager patches, dialog, and mission events.
 *
 * Geometry (world OBB) comes from the GLB; this file only links names → behavior.
 */

import { GAME_STATES } from "./gameData.js";

/**
 * @typedef {object} LevelTriggerBinding
 * @property {string} objectName - Blender object name (e.g. "Trigger", "Trigger.001")
 * @property {string} id - Stable id for once-tracking and logging
 * @property {boolean} [once]
 * @property {object} [criteria] - Passed to sceneData.checkCriteria(gameState)
 * @property {object} [onEnter]
 * @property {object} [onEnter.setState] - Partial GameManager.setState
 * @property {string} [onEnter.playDialog] - Dialog track id for DialogManager.playDialog
 * @property {string} [onEnter.emitMissionEvent] - MissionManager.reportEvent(type, payload)
 * @property {object} [onEnter.missionPayload] - Extra payload merged with trigger metadata
 */

/** @type {LevelTriggerBinding[]} */
export const charonLevelTriggerBindings = [
  {
    objectName: "Trigger",
    id: "charon-trigger-main",
    once: true,
    criteria: {
      currentMissionId: "charon",
      currentState: GAME_STATES.PLAYING,
    },
    onEnter: {
      // Add playDialog: "yourTrackId" when assets exist.
      emitMissionEvent: "charonTriggerMain",
    },
  },
];

const byLevel = {
  charon: charonLevelTriggerBindings,
};

/**
 * @param {string} levelId
 * @returns {LevelTriggerBinding[]}
 */
export function getLevelTriggerBindings(levelId) {
  return byLevel[levelId] ?? [];
}
