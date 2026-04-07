export const hologramVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const hologramFragmentShader = `
uniform sampler2D uTexture;
uniform float uTime;
uniform vec3 uHoloColor;
uniform float uScanLineIntensity;
uniform float uAlpha;
uniform vec2 uUvOffset;
uniform vec2 uUvRepeat;
uniform float uNoiseStatic;

varying vec2 vUv;

void main() {
  float nStatic = clamp(uNoiseStatic, 0.0, 1.0);
  vec2 baseSpriteUv = vUv * uUvRepeat + uUvOffset;
  float aRaw = texture2D(uTexture, baseSpriteUv).a;

  vec2 fgJitter = (vec2(
    fract(sin(dot(vUv * vec2(50.1, 93.7) + uTime * 37.0, vec2(12.0, 78.0))) * 431.7),
    fract(sin(dot(vUv * vec2(33.2, 71.4) - uTime * 41.0, vec2(51.0, 26.0))) * 271.9)
  ) - 0.5) * 0.038 * nStatic;
  vec4 texColor = texture2D(uTexture, baseSpriteUv + fgJitter);

  float fgMask = smoothstep(0.06, 0.34, aRaw);
  float bgMask = 1.0 - smoothstep(0.04, 0.36, aRaw);
  float mSum = max(fgMask + bgMask, 0.001);
  fgMask /= mSum;
  bgMask /= mSum;

  vec2 fgFuzzUv = baseSpriteUv * (96.0 + uTime * 20.0);
  float fzFg = fract(sin(dot(fgFuzzUv, vec2(12.9898, 78.233))) * 43758.5453);
  float fzFg2 = fract(sin(dot(fgFuzzUv * 1.73 + vec2(uTime * 8.0, 0.0), vec2(39.346, 11.548))) * 28431.592);

  float bandY = fract(vUv.y * 96.0 + uTime * 16.0);
  bandY = smoothstep(0.0, 0.12, bandY) * smoothstep(0.55, 0.28, bandY);
  vec2 blk = floor(vUv * vec2(32.0, 40.0));
  float fzBlk = fract(sin(dot(blk, vec2(127.1, 311.7)) + uTime * 52.0) * 43758.5453);
  vec2 bgFuzzUv = vUv * (26.0 + uTime * 6.5);
  float fzBgDrift = fract(sin(dot(bgFuzzUv, vec2(19.713, 57.982))) * 91823.123);
  float fzBg = mix(fzBlk, fzBgDrift, 0.5) * (0.55 + bandY * 0.65) + fzBgDrift * 0.22;

  float scanY = vUv.y * 60.0 + uTime * 3.0;
  float scanLine = fract(scanY);
  scanLine = smoothstep(0.0, 0.5, scanLine) * smoothstep(1.0, 0.5, scanLine);
  float scanEffect = mix(1.0, 0.7 + scanLine * 0.3, uScanLineIntensity);

  vec3 holoTint = texColor.rgb * uHoloColor * 1.3;
  holoTint *= scanEffect;

  vec3 colFg = vec3(mix(fzFg, fzFg2, 0.35) * 0.78 + 0.12) * uHoloColor * 1.48;
  vec3 colBg = vec3(fzBg * 0.72 + 0.16) * uHoloColor * 1.22;
  vec3 staticRgb = colFg * fgMask + colBg * bgMask;
  holoTint = mix(holoTint, staticRgb, nStatic * 0.94);

  float alpha = texColor.a * uAlpha * scanEffect;
  float staticAlphaBoost = nStatic * uAlpha * (
    bgMask * (0.48 + 0.42 * fzBg) + fgMask * (0.08 + 0.14 * fzFg)
  );
  alpha = clamp(alpha + staticAlphaBoost, 0.0, 1.0);
  alpha = mix(alpha, alpha * (0.52 + mix(fzBg, mix(fzFg, fzFg2, 0.4), fgMask) * 0.46), nStatic * 0.4);

  gl_FragColor = vec4(holoTint, alpha);
}
`;

export default {
  vertexShader: hologramVertexShader,
  fragmentShader: hologramFragmentShader,
};
