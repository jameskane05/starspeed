/**
 * lightData.js - LIGHT DEFINITIONS
 * =============================================================================
 *
 * ROLE: Centralized definitions for Three.js lights. In-game ambient and
 * start-screen lights (ambient, directional). SplatEdit lights removed for performance.
 *
 * KEY RESPONSIBILITIES:
 * - lights: Default ambient (and any in-play) light configs
 * - startScreenLights: Array of light defs for menu/start screen (LightManager.loadStartScreenLights)
 * - Each def: id, type (AmbientLight, DirectionalLight, etc.), color, intensity, position
 *
 * RELATED: LightManager.js, gameData.js (LEVELS for per-level ambient).
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
