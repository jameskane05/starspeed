export const musicTracks = [
  "./audio/music/STARSPEED OST - GUIDEBOOK - 24 HR Diner.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Hyperion.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - I Miss The Internet (Instrumental).mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - Modern Problems.mp3",
  "./audio/music/STARSPEED OST - GUIDEBOOK - SLEEPERS.mp3",
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
