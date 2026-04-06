import * as THREE from "three";

export class DissolveParticleSystem {
  constructor(geometry, dispersion = 8.0, velocitySpread = 0.15) {
    this.geometry = geometry;
    this.count = geometry.getAttribute("position").array.length / 3;
    this.dispersion = dispersion;
    this.velocitySpread = velocitySpread;
    this.maxOffsetArr = new Float32Array(this.count);
    this.scaleArr = new Float32Array(this.count);
    this.distArr = new Float32Array(this.count);
    this.rotationArr = new Float32Array(this.count);
    this.currentPositionArr = new Float32Array(
      this.geometry.getAttribute("position").array,
    );
    this.initPositionArr = new Float32Array(
      this.geometry.getAttribute("position").array,
    );
    this.velocityArr = new Float32Array(this.count * 3);
    this._attrOffset = null;
    this._attrDist = null;
    this._attrRotation = null;
    this._attrScale = null;
    this._attrPosition = null;
    this._attrVelocity = null;
    this.setAttributesValues();
  }

  setAttributesValues() {
    const minDispersion = this.dispersion * 0.25;
    for (let i = 0; i < this.count; i++) {
      const x = i * 3 + 0;
      const y = i * 3 + 1;
      const z = i * 3 + 2;
      this.maxOffsetArr[i] = Math.random() * this.dispersion + minDispersion;
      this.scaleArr[i] = Math.random();
      this.rotationArr[i] = Math.random() * 2 * Math.PI;
      this.velocityArr[x] = (Math.random() - 0.5) * this.velocitySpread;
      this.velocityArr[y] = Math.random() * this.velocitySpread + 0.05;
      this.velocityArr[z] = (Math.random() - 0.5) * this.velocitySpread;
      this.distArr[i] = 0.01;
    }
    this._ensureBufferAttributes();
    this._markAttributesDirty();
  }

  updateAttributesValues() {
    for (let i = 0; i < this.count; i++) {
      this.rotationArr[i] += 0.1;
      const x = i * 3 + 0;
      const y = i * 3 + 1;
      const z = i * 3 + 2;
      const speed = 0.3;
      const waveOffset1 = Math.sin(this.currentPositionArr[y] * 2.0) * 0.08;
      const waveOffset2 = Math.sin(this.currentPositionArr[x] * 2.0) * 0.08;
      this.currentPositionArr[x] += (this.velocityArr[x] + waveOffset1) * speed;
      this.currentPositionArr[y] += (this.velocityArr[y] + waveOffset2) * speed;
      this.currentPositionArr[z] += this.velocityArr[z] * speed;
      const dx = this.currentPositionArr[x] - this.initPositionArr[x];
      const dy = this.currentPositionArr[y] - this.initPositionArr[y];
      const dz = this.currentPositionArr[z] - this.initPositionArr[z];
      const distSq = dx * dx + dy * dy + dz * dz;
      const maxR = this.maxOffsetArr[i];
      this.distArr[i] = Math.sqrt(distSq);
      if (distSq > maxR * maxR) {
        this.currentPositionArr[x] = this.initPositionArr[x];
        this.currentPositionArr[y] = this.initPositionArr[y];
        this.currentPositionArr[z] = this.initPositionArr[z];
        this.distArr[i] = 0.01;
      }
    }
    this._markAttributesDirty();
  }

  _ensureBufferAttributes() {
    if (this._attrOffset) return;
    const g = this.geometry;
    this._attrOffset = new THREE.BufferAttribute(this.maxOffsetArr, 1);
    this._attrDist = new THREE.BufferAttribute(this.distArr, 1);
    this._attrRotation = new THREE.BufferAttribute(this.rotationArr, 1);
    this._attrScale = new THREE.BufferAttribute(this.scaleArr, 1);
    this._attrPosition = new THREE.BufferAttribute(this.currentPositionArr, 3);
    this._attrVelocity = new THREE.BufferAttribute(this.velocityArr, 3);
    g.setAttribute("aOffset", this._attrOffset);
    g.setAttribute("aDist", this._attrDist);
    g.setAttribute("aRotation", this._attrRotation);
    g.setAttribute("aScale", this._attrScale);
    g.setAttribute("aPosition", this._attrPosition);
    g.setAttribute("aVelocity", this._attrVelocity);
  }

  _markAttributesDirty() {
    this._attrOffset.needsUpdate = true;
    this._attrDist.needsUpdate = true;
    this._attrRotation.needsUpdate = true;
    this._attrScale.needsUpdate = true;
    this._attrPosition.needsUpdate = true;
    this._attrVelocity.needsUpdate = true;
  }
}
