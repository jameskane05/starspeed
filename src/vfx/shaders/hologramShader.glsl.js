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

varying vec2 vUv;

void main() {
  vec2 spriteUv = vUv * uUvRepeat + uUvOffset;
  vec4 texColor = texture2D(uTexture, spriteUv);

  float scanY = vUv.y * 60.0 + uTime * 3.0;
  float scanLine = fract(scanY);
  scanLine = smoothstep(0.0, 0.5, scanLine) * smoothstep(1.0, 0.5, scanLine);
  float scanEffect = mix(1.0, 0.7 + scanLine * 0.3, uScanLineIntensity);

  vec3 holoTint = texColor.rgb * uHoloColor * 1.3;
  holoTint *= scanEffect;

  float alpha = texColor.a * uAlpha * scanEffect;

  gl_FragColor = vec4(holoTint, alpha);
}
`;

export default {
  vertexShader: hologramVertexShader,
  fragmentShader: hologramFragmentShader,
};
