import { GAME_STATES } from "./gameData.js";
import { checkCriteria } from "./sceneData.js";

const say = (speakerId, text, duration) => ({
  speakerId,
  text,
  duration,
});

export const dialogSpeakers = {
  alcair: {
    id: "alcair",
    label: "ALCAIR",
    vrmUrl: "./model_original_1773065783.vrm",
  },
  groundControl: {
    id: "groundControl",
    label: "GROUND CONTROL",
    vrmUrl: "./model_original_1773089969.vrm",
  },
};

export const dialogTracks = {
  trainingGroundsIntro: {
    id: "trainingGroundsIntro",
    captions: [
      say(
        "alcair",
        "ALCAIR: Greetings, STARSPEED. I am Alcair, your shipboard computer, here to guide you through this training exercise for the XR-zero antigravity starfighter.",
        6.5,
      ),
      say("alcair", "ALCAIR: Ground control, do you read?", 2.1),
      say(
        "groundControl",
        "GROUND CONTROL: We're all set. Let's get going, pilot.",
        2.8,
      ),
      say(
        "alcair",
        "ALCAIR: The mouse or arrow keys control look direction. WASD keys control your forward, backward and lateral motion along that look direction.",
        5.8,
      ),
      say("alcair", "ALCAIR: Steer through these goals now.", 2.1),
    ],
    criteria: {
      currentState: GAME_STATES.PLAYING,
      currentMissionId: "trainingGrounds",
      missionStepId: "introDialog",
    },
    autoPlay: true,
    priority: 200,
    placeholderAnimation: true,
  },
  trainingGroundsRollIntro: {
    id: "trainingGroundsRollIntro",
    captions: [
      say("groundControl", "GROUND CONTROL: Ace flying.", 1.7),
      say(
        "alcair",
        "ALCAIR: Now, the tricky part. Roll. Q and E roll left and right. The mammalian mind wasn't made for zero-G.",
        5.2,
      ),
      say("alcair", "ALCAIR: My advice? Forget there's a floor.", 2.3),
      say(
        "groundControl",
        "GROUND CONTROL: Enough with the lectures. Barrel roll.",
        2.6,
      ),
    ],
    criteria: {
      currentState: GAME_STATES.PLAYING,
      currentMissionId: "trainingGrounds",
      missionStepId: "rollDialog",
    },
    autoPlay: true,
    priority: 200,
    placeholderAnimation: true,
  },
  trainingGroundsLaserIntro: {
    id: "trainingGroundsLaserIntro",
    captions: [
      say(
        "alcair",
        "ALCAIR: Now, target practice. Enemy bots are armed. Engage with lasers on the left mouse button.",
        4.8,
      ),
      say("alcair", "ALCAIR: Destroy all three.", 1.5),
    ],
    criteria: {
      currentState: GAME_STATES.PLAYING,
      currentMissionId: "trainingGrounds",
      missionStepId: "laserDialog",
    },
    autoPlay: true,
    priority: 200,
    placeholderAnimation: true,
  },
  trainingGroundsMissileIntro: {
    id: "trainingGroundsMissileIntro",
    captions: [
      say("groundControl", "GROUND CONTROL: Bots disarmed.", 1.8),
      say(
        "alcair",
        "ALCAIR: Round two. Missile projectiles. Press the right mouse button to fire.",
        4.0,
      ),
      say(
        "alcair",
        "ALCAIR: Homing missiles track the nearest target, while kinetic rounds bounce off walls and do splash damage.",
        5.3,
      ),
      say(
        "alcair",
        "ALCAIR: Press G to switch between them. Another round of bots is inbound. Destroy them.",
        4.8,
      ),
    ],
    criteria: {
      currentState: GAME_STATES.PLAYING,
      currentMissionId: "trainingGrounds",
      missionStepId: "missileDialog",
    },
    autoPlay: true,
    priority: 200,
    placeholderAnimation: true,
  },
};

export function getDialogsForState(state, playedDialogs = new Set()) {
  const autoPlayDialogs = Object.values(dialogTracks).filter(
    (d) => d.autoPlay === true,
  );
  const sorted = autoPlayDialogs.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0),
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

export function getDialogSpeakerById(id) {
  return dialogSpeakers[id] || null;
}

export default dialogTracks;
