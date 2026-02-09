export const sfxSounds = {
  "laser": {
    id: "laser",
    src: [
      './audio/sfx/laser-01.mp3',
      './audio/sfx/laser-02.mp3',
      './audio/sfx/laser-03.mp3',
      './audio/sfx/laser-04.mp3',
      './audio/sfx/laser-05.mp3',
      './audio/sfx/laser-06.mp3',
      './audio/sfx/laser-07.mp3',
      './audio/sfx/laser-08.mp3',
    ],
    volume: [0.8, 1.0],
    pitch: [0.9, 1.1],
    roundRobin: true,
    spatial: true,
    refDistance: 25,
    maxDistance: 500,
    rolloffFactor: .5,
  },

  "ship-explosion": {
    id: "ship-explosion",
    src: ['./audio/sfx/ship-explosion.mp3'],
    volume: [1.3, 1.6],
    pitch: [0.85, 1.05],
    spatial: true,
    refDistance: 25,
    maxDistance: 500,
    rolloffFactor: 0.5,
  },
};

export default sfxSounds;
