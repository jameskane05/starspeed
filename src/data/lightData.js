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
    intensity: 4,
  },
};

export const startScreenLights = [
  {
    id: "ambient",
    type: "AmbientLight",
    color: 0x404050,
    intensity: 3.6,
  },
  {
    id: "key",
    type: "DirectionalLight",
    color: 0xffeedd,
    intensity: 3.5,
    position: [-12, 10, 8],
  },
  {
    id: "fill",
    type: "DirectionalLight",
    color: 0xffaa88,
    intensity: 0.3,
    position: [5, -2, 5],
  },
  {
    id: "rim",
    type: "DirectionalLight",
    color: 0x66ddff,
    intensity: 0.5,
    position: [0, 2, -15],
  },
  {
    id: "engine",
    type: "PointLight",
    color: 0xff6600,
    intensity: 2,
    distance: 8,
    position: [0, 0, -8],
    parent: "moveGroup",
  },
];

export default lights;
