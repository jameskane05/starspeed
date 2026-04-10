/**
 * debugSpawner.js — jump straight into solo missions / steps via URL (dev builds).
 *
 * Params (all optional except debugMission to activate):
 *   debugMission   — mission id registered in missions/missionsIndex.js (e.g. trainingGrounds)
 *   debugStep      — step id on that mission (e.g. laserWave, missileWave). Omit to use mission.startStepId.
 *   debugLevel     — level id (e.g. arenatech). Omit to use mission.defaultLevelId.
 *
 * Examples:
 *   ?debugMission=trainingGrounds
 *   ?debugMission=trainingGrounds&debugStep=missileWave
 *   ?debugMission=trainingGrounds&debugStep=laserWave&debugLevel=arenatech
 *   ?debugMission=charon
 *
 * Training Grounds step ids: introDialog, movementGoals, rollDialog, rollTraining,
 * laserDialog, laserWave, missileDialog, missileWave
 *
 * Charon step ids: briefing
 *
 * Add new missions in missions/missionsIndex.js; step ids are keys of mission.steps.
 */

import { MISSIONS } from "../missions/missionsIndex.js";

const P_MISSION = "debugMission";
const P_STEP = "debugStep";
const P_LEVEL = "debugLevel";

export function getDebugMissionSpawn() {
  const urlParams = new URLSearchParams(window.location.search);
  const missionId = urlParams.get(P_MISSION)?.trim();
  if (!missionId) return null;

  const mission = MISSIONS[missionId];
  if (!mission) {
    console.warn(
      `[DebugSpawner] Unknown ${P_MISSION}="${missionId}". Registered:`,
      Object.keys(MISSIONS),
    );
    return null;
  }

  const levelId =
    urlParams.get(P_LEVEL)?.trim() ||
    mission.defaultLevelId ||
    null;

  const stepRaw = urlParams.get(P_STEP)?.trim();
  let debugStepId;
  if (stepRaw) {
    if (mission.steps?.[stepRaw]) {
      debugStepId = stepRaw;
    } else {
      console.warn(
        `[DebugSpawner] Unknown ${P_STEP}="${stepRaw}" for mission "${missionId}". Steps:`,
        mission.steps ? Object.keys(mission.steps) : [],
      );
    }
  }

  const config = {
    missionId,
    levelId,
    ...(debugStepId ? { debugStepId } : {}),
  };
  console.log("[DebugSpawner] URL spawn:", config);
  return config;
}

export function isDebugMissionSpawnActive() {
  return new URLSearchParams(window.location.search).has(P_MISSION);
}

export function getDebugMissionSpawnParamMission() {
  return new URLSearchParams(window.location.search).get(P_MISSION)?.trim() ?? null;
}

export default {
  getDebugMissionSpawn,
  isDebugMissionSpawnActive,
  getDebugMissionSpawnParamMission,
};
