/**
 * ExplosionEffect.js - EXPLOSION PARTICLE EMISSION
 * =============================================================================
 *
 * ROLE: Emits fire, smoke, and debris particles for big and small explosions.
 * Uses ParticleSystem pools; emission shapes (sphere, hemisphere) match Unity prefab.
 *
 * KEY RESPONSIBILITIES:
 * - emitBigExplosion(position, options): fire/smoke/debris; configurable counts from performance
 * - emitSmallExplosion(position, options): smaller burst
 * - Delegates to particleSystem.fire, smoke, debris, lineSparks
 *
 * RELATED: ParticleSystem.js, gameCombat.js, ShipDestruction.js.
 *
 * =============================================================================
 */

import * as THREE from "three";

const _dir = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _bitan = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function emitSphere(center, radius) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  _dir.set(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi)
  );
  return {
    x: center.x + _dir.x * radius,
    y: center.y + _dir.y * radius,
    z: center.z + _dir.z * radius,
    dx: _dir.x,
    dy: _dir.y,
    dz: _dir.z,
  };
}

function emitHemisphere(center, radius) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random());
  _dir.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
  return {
    x: center.x + _dir.x * radius,
    y: center.y + _dir.y * radius,
    z: center.z + _dir.z * radius,
    dx: _dir.x,
    dy: _dir.y,
    dz: _dir.z,
  };
}

export class ExplosionEffect {
  constructor(particleSystem) {
    this.particles = particleSystem;
  }

  _pickColor(range) {
    if (!range) return { r: 1, g: 1, b: 1 };
    const rMin = range.rMin ?? 1;
    const rMax = range.rMax ?? rMin;
    const gMin = range.gMin ?? 1;
    const gMax = range.gMax ?? gMin;
    const bMin = range.bMin ?? 1;
    const bMax = range.bMax ?? bMin;
    return {
      r: rMin + Math.random() * (rMax - rMin),
      g: gMin + Math.random() * (gMax - gMin),
      b: bMin + Math.random() * (bMax - bMin),
    };
  }

  /**
   * Big explosion – matched to Unity BigExplosionEffect prefab.
   * Billboard quads for fire & smoke (no size cap).
   * Proper emission shapes from Unity metadata.
   */
  emitBigExplosion(position, scale = 1, options = {}) {
    const s = scale;
    const fireColorRange = options.fireColorRange ?? {
      rMin: 1.0, rMax: 1.0,
      gMin: 0.8, gMax: 1.0,
      bMin: 0.3, bMax: 0.7,
    };
    const sparksColorRange = options.sparksColorRange ?? {
      rMin: 1.0, rMax: 1.0,
      gMin: 0.5, gMax: 0.9,
      bMin: 0.05, bMax: 0.15,
    };
    const debrisFireColorRange = options.debrisFireColorRange ?? {
      rMin: 1.0, rMax: 1.0,
      gMin: 0.6, gMax: 0.9,
      bMin: 0.15, bMax: 0.35,
    };
    const lineSparksColorRange = options.lineSparksColorRange ?? {
      rMin: 1.0, rMax: 1.0,
      gMin: 0.9, gMax: 0.9,
      bMin: 0.7, bMax: 0.7,
    };
    for (let i = 0; i < 25; i++) {
      const e = emitSphere(position, 1.52 * s);
      const drift = 0.3 * s;
      const vx = e.dx * 0.5 * s + (Math.random() - 0.5) * drift;
      const vy = e.dy * 0.5 * s + (Math.random() - 0.5) * drift;
      const vz = e.dz * 0.5 * s + (Math.random() - 0.5) * drift;
      const color = this._pickColor(fireColorRange);

      this.particles.fire.emit({
        x: e.x, y: e.y, z: e.z,
        vx, vy, vz,
        r: color.r, g: color.g, b: color.b,
        alpha: 1.0,
        size: (0.75 + Math.random() * 1.25) * s,
        sizeGrow: 3.0 * s,
        life: (0.5 + Math.random() * 0.5) * Math.max(1, s * 0.5),
        drag: 0.98, rise: 0,
        velocityOverLifetimeX: 4 * s,
        velocityOverLifetimeY: 10 * s,
        velocityOverLifetimeZ: 4 * s,
        noise: 2.0 * s,
        noiseFreq: 0.2,
      });
    }

    for (let i = 0; i < 60; i++) {
      const e = emitSphere(position, 0.5 * s);
      const baseSpeed = 5 * s;
      const drift = 1.0 * s;
      const vx = e.dx * baseSpeed + (Math.random() - 0.5) * drift;
      const vy = e.dy * baseSpeed + (Math.random() - 0.5) * drift;
      const vz = e.dz * baseSpeed + (Math.random() - 0.5) * drift;
      const color = this._pickColor(sparksColorRange);

      this.particles.sparks.emit({
        x: e.x, y: e.y, z: e.z,
        vx, vy, vz,
        r: color.r, g: color.g, b: color.b,
        alpha: 1.0, size: (2 + Math.random() * 4) * s,
        life: (0.1 + Math.random() * 1.4) * Math.max(1, s * 0.5), drag: 0.995, rise: 0,
      });
    }

    const debrisCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < debrisCount; i++) {
      const e = emitHemisphere(position, 1.0 * s);
      const speed = (25 + Math.random() * 25) * s;
      const dvx = e.dx * speed;
      const dvy = e.dy * speed;
      const dvz = e.dz * speed;
      const lineColor = this._pickColor(lineSparksColorRange);

      this.particles.lineSparks.emit({
        x: position.x, y: position.y, z: position.z,
        vx: dvx, vy: dvy, vz: dvz,
        r: lineColor.r, g: lineColor.g, b: lineColor.b,
        alpha: 1.0,
        life: (0.8 + Math.random() * 1.2) * Math.max(1, s * 0.5),
        drag: 0.97,
        rise: 0,
        trailLength: (0.06 + Math.random() * 0.04) * s,
      });

      const trailSteps = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < trailSteps; j++) {
        const t = (j + 1) / trailSteps;
        const delay = t * 0.15;
        const dragFactor = Math.pow(0.97, delay * 60);
        const tx = position.x + dvx * delay * dragFactor;
        const ty = position.y + dvy * delay * dragFactor;
        const tz = position.z + dvz * delay * dragFactor;
        const spread = 0.8 * s;
        const debrisColor = this._pickColor(debrisFireColorRange);

        this.particles.debrisFire.emit({
          x: tx + (Math.random() - 0.5) * spread,
          y: ty + (Math.random() - 0.5) * spread,
          z: tz + (Math.random() - 0.5) * spread,
          vx: dvx * 0.15 + (Math.random() - 0.5) * 2 * s,
          vy: dvy * 0.15 + (Math.random() - 0.5) * 2 * s,
          vz: dvz * 0.15 + (Math.random() - 0.5) * 2 * s,
          r: debrisColor.r, g: debrisColor.g, b: debrisColor.b,
          alpha: 0.9,
          size: (0.4 + Math.random() * 0.6) * s,
          sizeGrow: 2.5 * s,
          life: (0.1 + Math.random() * 0.2) * Math.max(1, s * 0.5),
          drag: 0.93, rise: 0,
        });

        if (j % 2 === 0) {
          const grey = 0.25 + Math.random() * 0.15;
          this.particles.smoke.emit({
            x: tx + (Math.random() - 0.5) * spread * 0.5,
            y: ty + (Math.random() - 0.5) * spread * 0.5,
            z: tz + (Math.random() - 0.5) * spread * 0.5,
            vx: dvx * 0.05 + (Math.random() - 0.5) * 1 * s,
            vy: dvy * 0.05 + (Math.random() - 0.5) * 1 * s,
            vz: dvz * 0.05 + (Math.random() - 0.5) * 1 * s,
            r: grey, g: grey, b: grey,
            alpha: 0.5,
            size: (0.3 + Math.random() * 0.5) * s,
            sizeGrow: 3.0 * s,
            life: (0.4 + Math.random() * 0.6) * Math.max(1, s * 0.5),
            drag: 0.96, rise: 0,
          });
        }
      }
    }

    for (let i = 0; i < 20; i++) {
      const e = emitHemisphere(position, 0.7 * s);
      const speed = (2 + Math.random() * 2) * s;
      const drift = 0.3 * s;
      const vx = e.dx * speed + (Math.random() - 0.5) * drift;
      const vy = e.dy * speed + (Math.random() - 0.5) * drift;
      const vz = e.dz * speed + (Math.random() - 0.5) * drift;

      const grey = 0.3 + Math.random() * 0.2;
      this.particles.smoke.emit({
        x: e.x, y: e.y, z: e.z,
        vx, vy, vz,
        r: grey, g: grey, b: grey,
        alpha: 0.6,
        size: (0.5 + Math.random() * 1.0) * s,
        sizeGrow: 5.0 * s,
        life: (1.0 + Math.random() * 2.0) * Math.max(1, s * 0.5),
        drag: 0.99, rise: 0,
        velocityOverLifetimeX: 0,
        velocityOverLifetimeY: 10 * s,
        velocityOverLifetimeZ: 0,
        speedLimit: 1.0 * s,
        speedDampen: 0.5,
      });
    }

    for (let i = 0; i < 15; i++) {
      const e = emitSphere(position, 0.5 * s);
      const speed = (1 + Math.random() * 2) * s;
      const drift = 0.5 * s;
      const vx = e.dx * speed + (Math.random() - 0.5) * drift;
      const vy = e.dy * speed + (Math.random() - 0.5) * drift;
      const vz = e.dz * speed + (Math.random() - 0.5) * drift;

      const grey = 0.2 + Math.random() * 0.15;
      this.particles.smoke.emit({
        x: e.x, y: e.y, z: e.z,
        vx, vy, vz,
        r: grey, g: grey, b: grey,
        alpha: 0.4,
        size: (0.8 + Math.random() * 1.2) * s,
        sizeGrow: 4.0 * s,
        life: (2.0 + Math.random() * 2.0) * Math.max(1, s * 0.5),
        drag: 0.995, rise: 0,
        speedLimit: 0.8 * s,
        speedDampen: 0.6,
      });
    }
  }

  /**
   * Small explosion for missile impacts, etc.
   */
  emitExplosionParticles(position, color = { r: 1, g: 0.5, b: 0.1 }, count = 60, scale = 1) {
    const s = scale;
    const colorJitter = 0.12;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const withJitter = (base) =>
      clamp(base + (Math.random() - 0.5) * 2 * colorJitter);
    for (let i = 0; i < count; i++) {
      const speed = (2 + Math.random() * 5) * s;
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

      this.particles.fire.emit({
        x: position.x + (Math.random() - 0.5) * 0.5 * s,
        y: position.y + (Math.random() - 0.5) * 0.5 * s,
        z: position.z + (Math.random() - 0.5) * 0.5 * s,
        vx: (vx / len) * speed, vy: (vy / len) * speed, vz: (vz / len) * speed,
        r: withJitter(color.r ?? 1),
        g: withJitter(color.g ?? 0.5),
        b: withJitter(color.b ?? 0.1),
        alpha: 1.0, size: (0.8 + Math.random() * 1.2) * s,
        sizeGrow: 2.5 * s,
        life: (0.3 + Math.random() * 0.4) * Math.max(1, s * 0.5), drag: 0.92, rise: 0,
      });
    }

    for (let i = 0; i < count; i++) {
      const speed = (12 + Math.random() * 25) * s;
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

      this.particles.sparks.emit({
        x: position.x, y: position.y, z: position.z,
        vx: (vx / len) * speed, vy: (vy / len) * speed, vz: (vz / len) * speed,
        r: 1.0, g: 0.7 + Math.random() * 0.3, b: 0.2,
        alpha: 1.0, size: (4 + Math.random() * 6) * s,
        life: (0.4 + Math.random() * 0.5) * Math.max(1, s * 0.5), drag: 0.96, rise: 0,
      });
    }

    for (let i = 0; i < count / 3; i++) {
      const speed = (1 + Math.random() * 3) * s;
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;

      const grey = 0.3 + Math.random() * 0.2;
      this.particles.smoke.emit({
        x: position.x + (Math.random() - 0.5) * 0.5 * s,
        y: position.y + (Math.random() - 0.5) * 0.5 * s,
        z: position.z + (Math.random() - 0.5) * 0.5 * s,
        vx: (vx / len) * speed, vy: (vy / len) * speed, vz: (vz / len) * speed,
        r: grey, g: grey, b: grey,
        alpha: 0.6, size: (1.0 + Math.random() * 1.5) * s,
        sizeGrow: 3.0 * s,
        life: (1.0 + Math.random() * 0.8) * Math.max(1, s * 0.5), drag: 0.97, rise: 0,
      });
    }
  }

  emitImpactSparks(position, scale = 1) {
    const count = Math.ceil(30 * scale);
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const speed = (10 + Math.random() * 25) * scale;

      this.particles.lineSparks.emit({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: (vx / len) * speed,
        vy: (vy / len) * speed,
        vz: (vz / len) * speed,
        r: 1.0,
        g: 0.6 + Math.random() * 0.35,
        b: 0.1 + Math.random() * 0.15,
        alpha: 1.0,
        life: (0.2 + Math.random() * 0.5) * Math.max(1, scale * 0.4),
        drag: 0.93,
        rise: -3,
        trailLength: (0.06 + Math.random() * 0.08) * scale,
      });
    }
  }

  emitFlameGusher(position, direction, scale = 1, options = {}) {
    _dir.set(direction.x, direction.y, direction.z).normalize();
    if (Math.abs(_dir.y) < 0.99) _tmp.set(0, 1, 0);
    else _tmp.set(1, 0, 0);
    _tan.crossVectors(_tmp, _dir).normalize();
    _bitan.crossVectors(_dir, _tan);

    const coneAngle = (25 * Math.PI) / 180;
    const cosAngle = Math.cos(coneAngle);
    const fireCount = Math.ceil(18 * scale);
    const smokeCount = Math.ceil(6 * scale);
    const s = scale;
    const fireColorRange = options.fireColorRange ?? {
      rMin: 1.0, rMax: 1.0,
      gMin: 0.55, gMax: 0.9,
      bMin: 0.05, bMax: 0.2,
    };

    for (let i = 0; i < fireCount; i++) {
      const z = cosAngle + Math.random() * (1 - cosAngle);
      const ringR = Math.sqrt(1 - z * z);
      const theta = Math.random() * Math.PI * 2;
      const vx = _dir.x * z + _tan.x * ringR * Math.cos(theta) + _bitan.x * ringR * Math.sin(theta);
      const vy = _dir.y * z + _tan.y * ringR * Math.cos(theta) + _bitan.y * ringR * Math.sin(theta);
      const vz = _dir.z * z + _tan.z * ringR * Math.cos(theta) + _bitan.z * ringR * Math.sin(theta);
      const speed = (4 + Math.random() * 8) * s;
      const color = this._pickColor(fireColorRange);

      this.particles.fire.emit({
        x: position.x + (Math.random() - 0.5) * 0.3 * s,
        y: position.y + (Math.random() - 0.5) * 0.3 * s,
        z: position.z + (Math.random() - 0.5) * 0.3 * s,
        vx: vx * speed, vy: vy * speed, vz: vz * speed,
        r: color.r, g: color.g, b: color.b,
        alpha: 1.0,
        size: (0.4 + Math.random() * 0.8) * s,
        sizeGrow: 2.5 * s,
        life: (0.3 + Math.random() * 0.5) * Math.max(1, s * 0.4),
        drag: 0.96, rise: 0,
        noise: 1.5 * s,
        noiseFreq: 0.3,
      });
    }

    for (let i = 0; i < smokeCount; i++) {
      const z = cosAngle + Math.random() * (1 - cosAngle);
      const ringR = Math.sqrt(1 - z * z);
      const theta = Math.random() * Math.PI * 2;
      const vx = _dir.x * z + _tan.x * ringR * Math.cos(theta) + _bitan.x * ringR * Math.sin(theta);
      const vy = _dir.y * z + _tan.y * ringR * Math.cos(theta) + _bitan.y * ringR * Math.sin(theta);
      const vz = _dir.z * z + _tan.z * ringR * Math.cos(theta) + _bitan.z * ringR * Math.sin(theta);
      const speed = (2 + Math.random() * 4) * s;
      const grey = 0.25 + Math.random() * 0.15;

      this.particles.smoke.emit({
        x: position.x + (Math.random() - 0.5) * 0.2 * s,
        y: position.y + (Math.random() - 0.5) * 0.2 * s,
        z: position.z + (Math.random() - 0.5) * 0.2 * s,
        vx: vx * speed, vy: vy * speed, vz: vz * speed,
        r: grey, g: grey, b: grey,
        alpha: 0.5,
        size: (0.3 + Math.random() * 0.5) * s,
        sizeGrow: 3.0 * s,
        life: (0.5 + Math.random() * 0.8) * Math.max(1, s * 0.4),
        drag: 0.97, rise: 0,
      });
    }
  }
}
