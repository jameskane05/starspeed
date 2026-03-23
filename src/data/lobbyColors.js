/**
 * Re-export from server shared module (single source of truth for palette + helpers).
 */
export {
  LOBBY_COLOR_PALETTE,
  normalizeLobbyHex,
  paletteIncludesNormalized,
  pickFirstFreeAccentColor,
  pickRandomFreeAccentColor,
} from "../../server/src/shared/lobbyColors.ts";
