/**
 * musicData.js - MUSIC TRACK LIST AND SHUFFLE
 * =============================================================================
 *
 * ROLE: Defines paths to music tracks and shuffled() helper for playlist order.
 * Used by MusicManager to build playlists.
 *
 * KEY RESPONSIBILITIES:
 * - musicTracks: array of track paths
 * - shuffled(arr): return copy of array in random order
 *
 * RELATED: MusicManager.js.
 *
 * =============================================================================
 */

export const musicTracks = [
  "./audio/music/STARSPEED OST - GUIDEBOOK - 24 HR Diner.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Biff's Auto Detailing..mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Florissant Meadows.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Hyperion.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - I Miss The Internet (Instrumental).mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Jamestown Mall.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Modern Problems.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - SLEEPERS.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Walking Underground.mp3",
];

export function shuffled(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default musicTracks;
