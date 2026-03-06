/**
 * platformDetection.js - PLATFORM CAPABILITY FLAGS
 * =============================================================================
 *
 * ROLE: Detects mobile, iOS, Vision Pro, Safari, fullscreen support and sets
 * flags on GameManager state. Call early in init; other systems read state.isIOS,
 * state.isMobile, etc.
 *
 * KEY RESPONSIBILITIES:
 * - detectPlatform(gameManager): setState({ isMobile, isIOS, isVisionPro, isSafari, isFullscreenSupported })
 *
 * RELATED: gameInit.js, GameManager.js.
 *
 * =============================================================================
 */

export function detectPlatform(gameManager) {
  if (!gameManager) return;

  const isMobile =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isVisionPro =
    navigator.userAgent.includes("Macintosh") &&
    navigator.maxTouchPoints === 5 &&
    !/Chrome|Windows|Oculus|Quest/i.test(navigator.userAgent);

  const userAgent = navigator.userAgent.toLowerCase();
  const isSafari =
    (userAgent.includes("safari") &&
      !userAgent.includes("chrome") &&
      !userAgent.includes("chromium") &&
      !userAgent.includes("edge")) ||
    (navigator.vendor?.indexOf("Apple") > -1 &&
      !userAgent.includes("chrome") &&
      !userAgent.includes("chromium"));

  const isFullscreenSupported =
    !isIOS &&
    (document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled);

  gameManager.setState({
    isMobile,
    isIOS,
    isVisionPro,
    isSafari,
    isFullscreenSupported,
  });

  return { isMobile, isIOS, isVisionPro, isSafari, isFullscreenSupported };
}
