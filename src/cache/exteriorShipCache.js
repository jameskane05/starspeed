/**
 * exteriorShipCache.js - SHARED CACHE FOR HEAVY_EXT_02.GLB
 *
 * StartScreenScene sets the cache when it loads the menu ship so Player
 * can reuse it (clone) during gameplay instead of re-requesting the asset.
 */

let cached = null;

export function setCachedExteriorShip(scene) {
  cached = scene;
}

export function getCachedExteriorShip() {
  return cached ?? null;
}
