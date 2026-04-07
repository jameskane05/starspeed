const DIALOG_VOICE_WEBAUDIO_FADE_IN_SEC = 1;

export class LipSyncManager {
  constructor(options = {}) {
    this.debug = options.debug || false;
    this.cols = options.cols || 4;
    this.rows = options.rows || 4;
    this.totalFrames = this.cols * this.rows;
    this.updateInterval = 50;
    this.lastUpdateTime = 0;
    this.currentFrame = 0;
    this.targetFrame = 0;
    this.audioContext = null;
    this.analyser = null;
    this.audioSource = null;
    this.audioElement = null;
    this.frequencyData = null;
    this.timeDomainData = null;
    this.binHz = 0;
    this.onFrameChange = options.onFrameChange || null;

    this.visemeFrames = {
      silence: 14,
      neutral: 0,
      rest: 15,
      BMP: 14,
      CHJ: 6,
      UHU: 9,
      OOW: 5,
      AEI: 4,
      consonants: 7,
      OH: 5,
      TH: 9,
      FV: 11,
      EE: 2,
      L: 13,
      R: 5,
      smile: 3,
      surprised: 1,
      IH: 6,
      EH: 9,
      AE: 4,
      AH: 8,
      AW: 5,
      OO: 5,
      UH: 9,
    };

    this._analysisActive = false;
    this._isPlaying = false;
    this._placeholderActive = false;
    this._placeholderEndTime = 0;
    this._placeholderSequence = [
      this.visemeFrames.neutral,
      this.visemeFrames.AEI,
      this.visemeFrames.OH,
      this.visemeFrames.UHU,
      this.visemeFrames.neutral,
    ];
    this._placeholderIndex = 0;
    this._lineOutGain = null;
  }

  _disconnectMediaAudioChain() {
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch (e) {}
      this.audioSource = null;
    }
    if (this._lineOutGain) {
      try {
        this._lineOutGain.disconnect();
      } catch (e) {}
      this._lineOutGain = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (e) {}
    }
  }

  async initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.7;
      const bufferLength = this.analyser.frequencyBinCount;
      this.frequencyData = new Uint8Array(bufferLength);
      this.timeDomainData = new Uint8Array(bufferLength);
      this.binHz = 44100 / this.analyser.fftSize;
      return true;
    } catch (e) {
      if (this.debug) console.error("[LipSync] init failed:", e);
      return false;
    }
  }

  async loadAudio(src) {
    if (!this.audioContext) await this.initialize();
    if (this.audioContext.state === "suspended") await this.audioContext.resume();

    this.audioElement = document.createElement("audio");
    this.audioElement.src = src;
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.loop = false;

    await new Promise((resolve, reject) => {
      this.audioElement.addEventListener("canplaythrough", resolve, { once: true });
      this.audioElement.addEventListener("error", reject, { once: true });
      this.audioElement.load();
    });

    this._disconnectMediaAudioChain();
    this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
    this.audioSource.connect(this.analyser);
    this._lineOutGain = this.audioContext.createGain();
    this._lineOutGain.gain.value = 1;
    this.analyser.connect(this._lineOutGain);
    this._lineOutGain.connect(this.audioContext.destination);
    this.binHz = this.audioContext.sampleRate / this.analyser.fftSize;
  }

  play() {
    if (!this.audioElement) return;
    this._isPlaying = true;
    if (this._lineOutGain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this._lineOutGain.gain.cancelScheduledValues(t);
      this._lineOutGain.gain.setValueAtTime(0, t);
      this._lineOutGain.gain.linearRampToValueAtTime(
        1,
        t + DIALOG_VOICE_WEBAUDIO_FADE_IN_SEC,
      );
    }
    const playAudio = async () => {
      try {
        if (this.audioContext?.state === "suspended") await this.audioContext.resume();
        await this.audioElement.play();
      } catch (e) {
        if (this.debug) console.error("[LipSync] play failed:", e.message);
      }
    };
    playAudio();
    this._analysisActive = true;
    this.audioElement.addEventListener(
      "ended",
      () => {
        this._isPlaying = false;
        this._analysisActive = false;
        this.currentFrame = 0;
        if (this.onFrameChange) this.onFrameChange(0, this.getUV(0));
      },
      { once: true }
    );
  }

  playPlaceholder(durationSeconds = 0) {
    this.stop();
    this._placeholderActive = durationSeconds > 0;
    this._placeholderEndTime = performance.now() + durationSeconds * 1000;
    this._placeholderIndex = 0;
    const frame = this._placeholderSequence[this._placeholderIndex];
    this.currentFrame = frame;
    if (this.onFrameChange) {
      this.onFrameChange(frame, this.getUV(frame));
    }
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    this._isPlaying = false;
    this._analysisActive = false;
    this._placeholderActive = false;
    this._placeholderEndTime = 0;
    this._placeholderIndex = 0;
    if (this.onFrameChange) {
      this.onFrameChange(this.visemeFrames.silence, this.getUV(this.visemeFrames.silence));
    }
  }

  updateAnalysis() {
    if (this._placeholderActive && !this._isPlaying) {
      const now = performance.now();
      if (now >= this._placeholderEndTime) {
        this._placeholderActive = false;
        if (this.onFrameChange) {
          this.onFrameChange(this.visemeFrames.silence, this.getUV(this.visemeFrames.silence));
        }
        return;
      }
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = now;
      this._placeholderIndex =
        (this._placeholderIndex + 1) % this._placeholderSequence.length;
      this.currentFrame = this._placeholderSequence[this._placeholderIndex];
      if (this.onFrameChange) {
        this.onFrameChange(this.currentFrame, this.getUV(this.currentFrame));
      }
      return;
    }
    if (!this._isPlaying || !this._analysisActive || !this.analyser) return;
    const now = performance.now();
    if (now - this.lastUpdateTime < this.updateInterval) return;
    this.lastUpdateTime = now;

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);
    const amplitude = this._getAmplitude();

    if (amplitude < 0.015) {
      this.targetFrame = this.visemeFrames.silence;
    } else {
      const { f1, f2 } = this._findFormants();
      const highFreqEnergy = this._getHighFrequencyEnergy();
      this.targetFrame = this._formantToViseme(f1, f2, amplitude, highFreqEnergy);
    }
    this.currentFrame = this.targetFrame;
    if (this.onFrameChange) {
      this.onFrameChange(this.currentFrame, this.getUV(this.currentFrame));
    }
  }

  _getAmplitude() {
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      const val = (this.timeDomainData[i] - 128) / 128;
      sum += val * val;
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }

  _getHighFrequencyEnergy() {
    const startBin = Math.floor(2500 / this.binHz);
    const endBin = Math.min(Math.floor(8000 / this.binHz), this.frequencyData.length - 1);
    let sum = 0;
    for (let i = startBin; i <= endBin; i++) sum += this.frequencyData[i];
    return sum / (endBin - startBin + 1) / 255;
  }

  _findFormants() {
    const f1Start = Math.floor(250 / this.binHz);
    const f1End = Math.floor(900 / this.binHz);
    const f2Start = Math.floor(800 / this.binHz);
    const f2End = Math.floor(2500 / this.binHz);
    let f1Bin = f1Start;
    let f1Max = 0;
    for (let i = f1Start; i <= f1End && i < this.frequencyData.length; i++) {
      if (this.frequencyData[i] > f1Max) {
        f1Max = this.frequencyData[i];
        f1Bin = i;
      }
    }
    let f2Bin = f2Start;
    let f2Max = 0;
    for (let i = f2Start; i <= f2End && i < this.frequencyData.length; i++) {
      if (Math.abs(i - f1Bin) < 3) continue;
      if (this.frequencyData[i] > f2Max) {
        f2Max = this.frequencyData[i];
        f2Bin = i;
      }
    }
    return { f1: f1Bin * this.binHz, f2: f2Bin * this.binHz };
  }

  _formantToViseme(f1, f2, amplitude, highFreqEnergy) {
    if (highFreqEnergy > 0.5) return this.visemeFrames.CHJ;
    if (amplitude < 0.03) return this.visemeFrames.silence;
    if (highFreqEnergy > 0.35 && amplitude < 0.15) return this.visemeFrames.FV;
    const f1Norm = Math.max(0, Math.min(1, (f1 - 250) / 550));
    const f2Norm = Math.max(0, Math.min(1, (f2 - 800) / 1700));
    if (f1Norm > 0.6 || amplitude > 0.25) {
      if (f2Norm > 0.5) return this.visemeFrames.AEI;
      if (f2Norm < 0.25) return this.visemeFrames.AH;
      return this.visemeFrames.UHU;
    }
    if (f1Norm > 0.35) {
      if (f2Norm > 0.55) return this.visemeFrames.EH;
      if (f2Norm < 0.3) return this.visemeFrames.OH;
      return this.visemeFrames.UH;
    }
    if (f2Norm > 0.6) return this.visemeFrames.EE;
    if (f2Norm < 0.25) return this.visemeFrames.OOW;
    if (amplitude > 0.08) return this.visemeFrames.consonants;
    return this.visemeFrames.neutral;
  }

  getUV(frameIndex) {
    frameIndex = Math.max(0, Math.min(frameIndex, this.totalFrames - 1));
    const col = frameIndex % this.cols;
    const row = Math.floor(frameIndex / this.cols);
    const cellWidth = 1 / this.cols;
    const cellHeight = 1 / this.rows;
    const margin = 0.02;
    const uSize = cellWidth * (1 - margin * 2);
    const vSize = cellHeight * (1 - margin * 2);
    const u = col * cellWidth + cellWidth * margin;
    const v = (this.rows - 1 - row) * cellHeight + cellHeight * margin;
    return { u, v, uSize, vSize };
  }

  destroy() {
    this.stop();
    if (this.audioElement) {
      this.audioElement.src = "";
      this.audioElement = null;
    }
    this._disconnectMediaAudioChain();
    this.analyser = null;
  }
}
