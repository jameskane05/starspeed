import { Howl } from "howler";
import { musicTracks, shuffled } from "./musicData.js";
import { AudioSettings } from "../game/AudioSettings.js";
import { GAME_STATES } from "../data/gameData.js";

class MusicManager {
  constructor() {
    this.loaded = {};
    this.playlist = [];
    this.playlistIndex = 0;
    this.currentTrack = null;
    this.currentPath = null;
    this.isTransitioning = false;
    this.hasUserInteracted = false;
    this.pendingPlay = false;

    this.crossfadeState = { active: false };
    this.fadeState = { active: false };

    this._setupInteractionListeners();
    AudioSettings.onChange(() => this._applyVolumeSettings());
  }

  _buildPlaylist() {
    this.playlist = shuffled(musicTracks);
    this.playlistIndex = 0;
  }

  _loadTrack(path) {
    if (this.loaded[path]) return this.loaded[path];

    const volume = AudioSettings.getMusicVolume();
    const howl = new Howl({
      src: [path],
      loop: false,
      volume: volume,
      preload: true,
      onend: () => this._onTrackEnd(path),
      onloaderror: (id, error) => console.error(`[Music] Failed to load ${path}:`, error),
    });

    this.loaded[path] = howl;
    return howl;
  }

  _onTrackEnd(path) {
    if (this.currentPath !== path) return;
    this._playNext(2.0);
  }

  _playNext(fadeTime = 0) {
    this.playlistIndex++;
    if (this.playlistIndex >= this.playlist.length) {
      this._buildPlaylist();
    }
    this._playCurrent(fadeTime);
  }

  _playCurrent(fadeTime = 0) {
    const path = this.playlist[this.playlistIndex];
    if (!path) return;

    if (!this.hasUserInteracted) {
      this.pendingPlay = true;
      return;
    }

    const track = this._loadTrack(path);
    const previousPath = this.currentPath;
    const previousTrack = this.currentTrack;

    this.currentPath = path;
    this.currentTrack = track;
    this.isTransitioning = true;

    const targetVolume = AudioSettings.getMusicVolume();

    const startNewTrack = () => {
      if (track.state() === "loaded") {
        this._beginPlayback(track, previousTrack, targetVolume, fadeTime);
      } else {
        track.once("load", () => {
          this._beginPlayback(track, previousTrack, targetVolume, fadeTime);
        });
      }
    };

    startNewTrack();
  }

  _beginPlayback(track, previousTrack, targetVolume, fadeTime) {
    if (fadeTime > 0 && previousTrack && previousTrack.playing()) {
      const fadeOutStartVolume = previousTrack.volume();
      track.volume(0);
      track.play();
      this.crossfadeState = {
        active: true,
        fadeOutTrack: previousTrack,
        fadeInTrack: track,
        fadeOutStartVolume,
        fadeInTargetVolume: targetVolume,
        duration: fadeTime,
        startTime: Date.now(),
      };
    } else if (fadeTime > 0) {
      track.volume(0);
      track.play();
      this.fadeState = {
        active: true,
        track,
        startVolume: 0,
        targetVolume,
        duration: fadeTime,
        startTime: Date.now(),
      };
      this.isTransitioning = false;
    } else {
      if (previousTrack && previousTrack !== track) previousTrack.stop();
      track.volume(targetVolume);
      track.play();
      this.isTransitioning = false;
    }
  }

  _setupInteractionListeners() {
    const handleInteraction = () => {
      if (this.hasUserInteracted) return;
      this.hasUserInteracted = true;

      if (this.pendingPlay) {
        this.pendingPlay = false;
        this._playCurrent(0);
      }

      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);
  }

  setGameManager(gameManager) {
    this.gameManager = gameManager;

    gameManager.on("state:changed", (newState) => {
      const state = newState.currentState;
      if (state === GAME_STATES.MENU || state === GAME_STATES.PLAYING) {
        this.reshuffleAndPlay(2.0);
      }
    });

    this._buildPlaylist();
    this._playCurrent(0);
  }

  reshuffleAndPlay(fadeTime = 2.0) {
    this._buildPlaylist();
    this._playCurrent(fadeTime);
  }

  stopMusic(fadeTime = 0) {
    if (!this.currentTrack) return;

    if (fadeTime > 0) {
      this.fadeState = {
        active: true,
        track: this.currentTrack,
        startVolume: this.currentTrack.volume(),
        targetVolume: 0,
        duration: fadeTime,
        startTime: Date.now(),
        stopAfterFade: true,
      };
    } else {
      this.currentTrack.stop();
    }
    this.currentTrack = null;
    this.currentPath = null;
  }

  pauseMusic() {
    if (this.currentTrack) this.currentTrack.pause();
  }

  resumeMusic() {
    if (this.currentTrack) this.currentTrack.play();
  }

  _applyVolumeSettings() {
    const volume = AudioSettings.getMusicVolume();
    if (this.currentTrack && this.currentTrack.playing()) {
      this.currentTrack.volume(volume);
    }
  }

  update(dt) {
    if (this.crossfadeState.active) {
      const elapsed = (Date.now() - this.crossfadeState.startTime) / 1000;
      const t = Math.min(elapsed / this.crossfadeState.duration, 1);

      const { fadeOutTrack, fadeInTrack } = this.crossfadeState;

      if (fadeOutTrack) {
        fadeOutTrack.volume(this._lerp(this.crossfadeState.fadeOutStartVolume, 0, t));
      }
      if (fadeInTrack) {
        fadeInTrack.volume(this._lerp(0, this.crossfadeState.fadeInTargetVolume, t));
      }

      if (t >= 1) {
        if (fadeOutTrack) fadeOutTrack.stop();
        this.crossfadeState.active = false;
        this.isTransitioning = false;
      }
    }

    if (!this.crossfadeState.active && this.fadeState.active) {
      const elapsed = (Date.now() - this.fadeState.startTime) / 1000;
      const t = Math.min(elapsed / this.fadeState.duration, 1);
      const { track } = this.fadeState;

      if (track) {
        track.volume(this._lerp(this.fadeState.startVolume, this.fadeState.targetVolume, t));
        if (t >= 1) {
          if (this.fadeState.stopAfterFade) track.stop();
          this.fadeState.active = false;
          this.isTransitioning = false;
        }
      }
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  getCurrentTrack() {
    return this.currentPath;
  }

  isPlaying() {
    return this.currentTrack?.playing();
  }

  destroy() {
    Object.values(this.loaded).forEach((track) => track.unload());
    this.loaded = {};
    this.currentTrack = null;
    this.currentPath = null;
  }
}

export default MusicManager;
