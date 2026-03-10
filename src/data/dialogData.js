import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./sceneData.js";

export const dialogTracks = {
  cockpitIntro: {
    id: "cockpitIntro",
    audio: "./e51c80bc-f6c9-4fb5-9a6c-b6038fc93eed.mp3",
    faceDataUrl: "./face-mocap-1773151926516.json",
    captions: [
      { text: "Our guests are ready to join us.", duration: 2.1 },
      {
        text: "Just set the coordinates in an open area on the floor.",
        startTime: 3.0,
        duration: 3.02,
      },
      { text: "They'll... find their way in.", startTime: 7.2, duration: 2.3 },
      { text: "Trans-dimensionally.", startTime: 9.76, duration: 0.7 },
    ],
    criteria: {
      currentState: GAME_STATES.PLAYING,
      cockpitIntroPlayed: { $ne: true },
    },
    once: true,
    autoPlay: true,
    priority: 100,
    delay: 0.5,
    requiresGesture: true,
    onComplete: (gameManager) => {
      gameManager.setState({ cockpitIntroPlayed: true });
    },
  },
};

export function getDialogsForState(state, playedDialogs = new Set()) {
  const autoPlayDialogs = Object.values(dialogTracks).filter(
    (d) => d.autoPlay === true
  );
  const sorted = autoPlayDialogs.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );
  const matching = [];
  for (const dialog of sorted) {
    if (dialog.once && playedDialogs.has(dialog.id)) continue;
    if (!dialog.criteria || checkCriteria(state, dialog.criteria)) {
      matching.push(dialog);
    }
  }
  return matching;
}

export function getDialogById(id) {
  return dialogTracks[id] || null;
}

export default dialogTracks;
