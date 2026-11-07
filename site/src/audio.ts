// §4.9/§5.7: Web Audio synthesis. Default OFF. No BGM. Footstep pitch follows thermal inertia; MAG data -> slow drone (E: sonification).
export class Sound {
  ctx?: AudioContext; on = false; private drone?: OscillatorNode; private gain?: GainNode;
  toggle(): boolean { this.on = !this.on; if (this.on) this.start(); else this.stop(); return this.on; }
  private start() {
    this.ctx ??= new AudioContext(); this.ctx.resume(); const c = this.ctx;
    this.gain = c.createGain(); this.gain.gain.value = 0.0; this.gain.connect(c.destination);
    this.drone = c.createOscillator(); this.drone.type = 'sine'; this.drone.frequency.value = 55; this.drone.connect(this.gain); this.drone.start();
    this.gain.gain.linearRampToValueAtTime(0.03, c.currentTime + 1.5);
  }
  private stop() { if (this.gain && this.ctx) this.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4); const d = this.drone; setTimeout(() => d?.stop(), 500); this.drone = undefined; }
  /** magnitude (nT) -> drone pitch; temperature (K) -> slight detune/brightness */
  field(bMag: number, tempK: number | null) { if (!this.on || !this.drone || !this.ctx) return; this.drone.frequency.setTargetAtTime(40 + Math.min(80, Math.abs(bMag)), this.ctx.currentTime, 0.5); if (tempK != null) this.drone.detune.setTargetAtTime((tempK - 250) * 2, this.ctx.currentTime, 1); }
  step(ti: number) {
    if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle';
    o.frequency.value = 90 + Math.min(400, ti) * 0.6; g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.12); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.14);
  }
  /** P3-1 スラスター噴射音（E: 演出）。微推力入力中に短いノイズ的パルス */
  thrust() {
    if (!this.on || !this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.value = 65 + Math.random() * 25; g.gain.setValueAtTime(0.018, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.17);
  }
}
