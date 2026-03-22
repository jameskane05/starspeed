/**
 * Shared lobby accent palette (client + server). Keep in sync — server imports this file.
 */
/** Eight common, distinct accents (red → white). */
export const LOBBY_COLOR_PALETTE = Object.freeze([
  "#ff4444",
  "#ff8800",
  "#ffcc00",
  "#44dd44",
  "#00ffff",
  "#4488ff",
  "#cc44ff",
  "#ffffff",
]);

export function normalizeLobbyHex(hex) {
  const s = String(hex || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return "#00ffff";
}

export function paletteIncludesNormalized(normalizedHex) {
  const n = normalizeLobbyHex(normalizedHex);
  return LOBBY_COLOR_PALETTE.some((c) => normalizeLobbyHex(c) === n);
}

export function pickFirstFreeAccentColor(playersMap, palette, fallbackSessionId) {
  const taken = new Set();
  playersMap.forEach((p) => {
    if (p?.accentColor) taken.add(normalizeLobbyHex(p.accentColor));
  });
  for (const c of palette) {
    const n = normalizeLobbyHex(c);
    if (!taken.has(n)) return n;
  }
  let h = 0;
  const s = String(fallbackSessionId || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return normalizeLobbyHex(palette[Math.abs(h) % palette.length]);
}

/** Uniform pick among palette colors not yet taken (e.g. quickmatch). */
export function pickRandomFreeAccentColor(playersMap, palette, fallbackSessionId) {
  const taken = new Set();
  playersMap.forEach((p) => {
    if (p?.accentColor) taken.add(normalizeLobbyHex(p.accentColor));
  });
  const available = palette
    .map((c) => normalizeLobbyHex(c))
    .filter((n) => !taken.has(n));
  if (available.length === 0) {
    let h = 0;
    const s = String(fallbackSessionId || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return normalizeLobbyHex(palette[Math.abs(h) % palette.length]);
  }
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}
