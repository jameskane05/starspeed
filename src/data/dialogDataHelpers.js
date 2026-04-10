/** Caption line; dialog-level `speakerId` is applied in DialogManager. Use sayAs() to override. */
export const say = (text, duration, startTime) => {
  const o = { text, duration };
  if (startTime !== undefined && startTime !== null) {
    const t = Number(startTime);
    if (Number.isFinite(t)) o.startTime = t;
  }
  return o;
};

export function sayAs(speakerId, text, duration, startTime) {
  const o = say(text, duration, startTime);
  o.speakerId = speakerId;
  return o;
}

export const dialogPublicUrl = (relativePath) => {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "";
  const path = relativePath.replace(/^\//, "");
  return base ? `${base}/${path}` : `/${path}`;
};
