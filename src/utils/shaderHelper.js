export function setupUniforms(shader, uniforms) {
  const keys = Object.keys(uniforms);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    shader.uniforms[key] = uniforms[key];
  }
}

export function setupShaderSnippets(
  shader,
  vertexGlobal,
  vertexMain,
  fragmentGlobal,
  fragmentMain,
) {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
${vertexGlobal}
`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
${vertexMain}
`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
${fragmentGlobal}
`,
  );
  // After lighting: `gl_FragColor` is set. Do not anchor on `dithering_fragment` — when
  // DITHERING is off, that chunk preprocesses to empty and some builds/cache paths made
  // the dissolve inject ineffective (full hull on first visible frame / “pop-in”).
  const opaqueNeedle = "#include <opaque_fragment>";
  if (shader.fragmentShader.includes(opaqueNeedle)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      opaqueNeedle,
      `${opaqueNeedle}
${fragmentMain}
`,
    );
  } else {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
${fragmentMain}
`,
    );
  }
}
