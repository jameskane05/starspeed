import proceduralAudio from './ProceduralAudio.js';

class SFXManager {
  constructor() {
    this.buffers = new Map();
    this.indices = new Map();
    this.data = null;
    this._loading = null;
  }

  get ctx() { return proceduralAudio.ctx; }
  get masterGain() { return proceduralAudio.masterGain; }
  get sfxVolume() { return proceduralAudio.sfxVolume; }

  init(soundsData) {
    this.data = soundsData;
  }

  _ensureLoaded() {
    if (this._loading || this.buffers.size > 0) return;
    if (!this.ctx || !this.data) return;

    this._loading = this._loadAll();
  }

  async _loadAll() {
    const promises = Object.values(this.data).map(def => this._loadSound(def));
    await Promise.all(promises);
    console.log(`[SFXManager] Loaded ${this.buffers.size} sound(s)`);
  }

  async _loadSound(def) {
    try {
      if (def.src.length > 1) {
        const buffers = await Promise.all(
          def.src.map(async (file) => {
            const resp = await fetch(file);
            const ab = await resp.arrayBuffer();
            return this.ctx.decodeAudioData(ab);
          })
        );
        this.buffers.set(def.id, buffers);
        if (def.roundRobin) this.indices.set(def.id, 0);
      } else {
        const resp = await fetch(def.src[0]);
        const ab = await resp.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(ab);
        this.buffers.set(def.id, buf);
      }
    } catch (e) {
      console.warn(`[SFXManager] Failed to load "${def.id}":`, e);
    }
  }

  play(id, position = null) {
    if (!this.ctx || !this.masterGain) return;
    proceduralAudio.resume();
    this._ensureLoaded();

    const entry = this.buffers.get(id);
    if (!entry) return;

    const def = this.data[id];
    let buffer;

    if (Array.isArray(entry)) {
      const idx = this.indices.get(id) || 0;
      buffer = entry[idx % entry.length];
      this.indices.set(id, (idx + 1) % entry.length);
    } else {
      buffer = entry;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const vol = def?.volume ?? 1.0;
    const resolvedVol = Array.isArray(vol) ? vol[0] + Math.random() * (vol[1] - vol[0]) : vol;

    const pitch = def?.pitch;
    if (pitch) {
      source.playbackRate.value = Array.isArray(pitch) ? pitch[0] + Math.random() * (pitch[1] - pitch[0]) : pitch;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = this.sfxVolume * resolvedVol;

    if (position && def?.spatial) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = def.refDistance ?? 1;
      panner.maxDistance = def.maxDistance ?? 100;
      panner.rolloffFactor = def.rolloffFactor ?? 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 0;
      panner.coneOuterGain = 0;

      if (panner.positionX) {
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
      } else {
        panner.setPosition(position.x, position.y, position.z);
      }

      source.connect(gain);
      gain.connect(panner);
      panner.connect(this.masterGain);
    } else {
      source.connect(gain);
      gain.connect(this.masterGain);
    }

    source.start(0);
    source.onended = () => {
      gain.disconnect();
      source.disconnect();
    };
  }
}

const sfxManager = new SFXManager();
export default sfxManager;
