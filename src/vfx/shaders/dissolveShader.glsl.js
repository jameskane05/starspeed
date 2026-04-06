export const vertexGlobal = `
    varying vec3 vPos;
    varying vec3 vWorldPos;
`;

export const vertexMain = `
    vPos = position;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
`;

export const fragmentGlobal = `
    varying vec3 vPos;
    varying vec3 vWorldPos;
    uniform vec3 uEdgeColor1;
    uniform vec3 uEdgeColor2;
    uniform float uFreq;
    uniform float uAmp;
    uniform float uProgress;
    uniform float uEdge;
    uniform float uDissolveMode;
    uniform float uWipeDirection;
    uniform float uWipeSoftness;
    uniform vec2 uWipeBounds;
`;

export const fragmentMain = `
    float dissolveValue;

    if (uDissolveMode < 0.5) {
        dissolveValue = cnoise(vPos * uFreq) * uAmp;
    } else {
        float normalizedY = (vWorldPos.y - uWipeBounds.x) / (uWipeBounds.y - uWipeBounds.x);
        normalizedY = clamp(normalizedY, 0.0, 1.0);
        if (uWipeDirection < 0.5) {
            normalizedY = 1.0 - normalizedY;
        }
        dissolveValue = normalizedY * 28.0 - 14.0;
        float softEdge = uWipeSoftness * 2.0;
        dissolveValue += (fract(sin(vPos.x * 12.9898 + vPos.z * 78.233) * 43758.5453) - 0.5) * softEdge;
    }

    if (dissolveValue < uProgress) discard;

    float edgeWidth = uProgress + uEdge;
    if (dissolveValue > uProgress && dissolveValue < edgeWidth) {
        gl_FragColor = vec4(uEdgeColor1, dissolveValue);
    }
    gl_FragColor = vec4(gl_FragColor.xyz, 1.0);
`;
