/**
 * Dialog duck targets and ramp times — shared by music, procedural SFX, and engine audio.
 * Voice lines do not use these buses (see VRMAvatarRenderer → destination / <audio>).
 */

export const DIALOG_DUCK_LEVEL = 0.17;
export const DIALOG_DUCK_RAMP_DOWN_SEC = 1;
export const DIALOG_DUCK_RAMP_UP_SEC = 2;
