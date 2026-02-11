import * as THREE from "three";

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * Sparks effects - electrical sparks and hit sparks.
 * Uses ParticleSystem pools to emit particles.
 */
export class SparksEffect {
  constructor(particleSystem) {
    this.particles = particleSystem;
  }

  /**
   * Simple hit sparks for general impacts.
   */
  emitHitSparks(position, color = { r: 1, g: 0.6, b: 0.2 }, count = 20) {
    for (let i = 0; i < count; i++) {
      const speed = 8 + Math.random() * 12;
      const vx = (Math.random() - 0.5) * 2;
      const vy = (Math.random() - 0.5) * 2;
      const vz = (Math.random() - 0.5) * 2;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz);

      this.particles.sparks.emit({
        x: position.x + (Math.random() - 0.5) * 0.3,
        y: position.y + (Math.random() - 0.5) * 0.3,
        z: position.z + (Math.random() - 0.5) * 0.3,
        vx: (vx / len) * speed,
        vy: (vy / len) * speed,
        vz: (vz / len) * speed,
        r: color.r,
        g: color.g + Math.random() * 0.2,
        b: color.b,
        alpha: 1.0,
        size: 6 + Math.random() * 8,
        life: 0.2 + Math.random() * 0.3,
        drag: 0.94,
        rise: 0,
      });
    }
  }

  /**
   * Electrical sparks effect - matches Unity ElectricalSparksEffect prefab.
   * Used for laser impacts on enemies.
   * Unity params:
   * - Shape: Cone/Donut, radius: 0.01, angle: 14.617361
   * - Lifetime: 0.5-2 seconds
   * - Start speed: 0 (velocity from VelocityModule only)
   * - VelocityModule: x: ±2, y: ±2, z: 3 (constant)
   * - ClampVelocity: magnitude: 3, dampen: 1
   * - Size: 0.01 (very small)
   * - Color: white to grey (1,1,1 to 0.631,0.631,0.631)
   * - Gravity modifier: 0.5
   */
  emitElectricalSparks(position, normal, count = 80) {
    // Normalize the incoming normal
    _dir.set(normal.x, normal.y, normal.z);
    const len = _dir.length();
    if (len < 0.001) {
      _dir.set(0, 1, 0);
    } else {
      _dir.multiplyScalar(1 / len);
    }

    // Build a tangent frame around the normal
    if (Math.abs(_dir.y) < 0.99) {
      _tmp.set(0, 1, 0);
    } else {
      _tmp.set(1, 0, 0);
    }
    const tangent = _tmp.clone().cross(_dir).normalize();
    const bitangent = _dir.clone().cross(tangent);

    for (let i = 0; i < count; i++) {
      // Hemisphere cone: random direction biased along normal
      const coneAngle = (60 * Math.PI) / 180;
      const cosAngle = Math.cos(coneAngle);
      const z = cosAngle + Math.random() * (1 - cosAngle); // uniform in [cosAngle, 1]
      const r = Math.sqrt(1 - z * z);
      const theta = Math.random() * Math.PI * 2;

      const vx =
        _dir.x * z +
        tangent.x * r * Math.cos(theta) +
        bitangent.x * r * Math.sin(theta);
      const vy =
        _dir.y * z +
        tangent.y * r * Math.cos(theta) +
        bitangent.y * r * Math.sin(theta);
      const vz =
        _dir.z * z +
        tangent.z * r * Math.cos(theta) +
        bitangent.z * r * Math.sin(theta);

      const speed = 8 + Math.random() * 20;

      const bright = 0.7 + Math.random() * 0.3;

      this.particles.lineSparks.emit({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: vx * speed,
        vy: vy * speed,
        vz: vz * speed,
        r: bright,
        g: bright,
        b: 1.0,
        alpha: 1.0,
        life: 0.15 + Math.random() * 0.35,
        drag: 0.92,
        rise: -4,
        trailLength: 0.08 + Math.random() * 0.12,
        speedLimit: 0,
        speedDampen: 0,
      });
    }
  }
}
