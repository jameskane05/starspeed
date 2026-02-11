/**
 * lightData.js - LIGHT DEFINITIONS
 * =============================================================================
 *
 * Standard Three.js lights only - SplatLights removed for performance.
 * SplatEdit layers cause significant per-frame overhead in SparkJS.
 *
 * =============================================================================
 */

import { GAME_STATES } from "./gameData.js";

export const lights = {
  ambient: {
    id: "ambient",
    type: "AmbientLight",
    color: 0x667788,
    intensity: 20,
  },
};

export default lights;
