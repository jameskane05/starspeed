export function getSystemInfo() {
  const info = {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    platform: typeof navigator !== "undefined" ? navigator.platform : "",
    language: typeof navigator !== "undefined" ? navigator.language : "",
    screenWidth: typeof screen !== "undefined" ? screen.width : 0,
    screenHeight: typeof screen !== "undefined" ? screen.height : 0,
    deviceMemory: typeof navigator !== "undefined" ? navigator.deviceMemory : undefined,
    gpu: "",
    gpuVendor: "",
    vram: "unknown",
  };

  if (typeof navigator !== "undefined" && navigator.userAgentData) {
    try {
      info.platform = navigator.userAgentData.platform || info.platform;
    } catch (_) {}
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        info.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
        info.gpuVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || "";
      }
    }
  } catch (_) {}

  return info;
}
