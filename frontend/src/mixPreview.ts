import { valueAt } from "./LearnVisuals";
import type { Automation } from "./types";

export interface PreviewConfig {
  a: { id: number; start: number; barLen: number; deck: number };
  /** `rate`: Abspielgeschwindigkeit, mit der B auf das Tempo von A gebracht wird. */
  b: { id: number; start: number; barLen: number; deck: number; rate: number };
  bpm: number;
}

const LEAD = 4;   // Takte Vorlauf vor dem Mix-Punkt
const TAIL = 6;   // Takte Nachlauf

interface Chain { el: HTMLAudioElement; low: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode; lp: BiquadFilterNode; hp: BiquadFilterNode; fader: GainNode; meter: AnalyserNode }

/**
 * Hörvorschau eines Übergangs mit den eigenen Audiodateien.
 * Beide Tracks laufen durch je einen 3-Band-EQ, Filter und Kanalfader; die Regler-Automation des
 * Plans steuert sie taktgenau. Track B wird per Abspielgeschwindigkeit auf das Tempo von A gebracht
 * (die Tonhöhe bleibt erhalten) und startet am Mix-In, sobald A den Mix-Out erreicht.
 */
export class MixPreview {
  private ctx: AudioContext;
  private a: Chain;
  private b: Chain;
  private echoSend: GainNode;
  private raf = 0;
  private t0 = 0;
  private bStarted = false;
  private stopped = false;

  constructor(private cfg: PreviewConfig, private auto: Automation, private onPos: (bar: number | null) => void) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.a = this.chain(cfg.a.id);
    this.b = this.chain(cfg.b.id);
    // Echo: Verzögerung um einen halben Schlag mit Rückkopplung, gespeist aus Track A vor dem Fader
    const delay = this.ctx.createDelay(2);
    delay.delayTime.value = 30 / cfg.bpm;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.55;
    this.echoSend = this.ctx.createGain();
    this.echoSend.gain.value = 0;
    this.a.hp.connect(this.echoSend).connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.ctx.destination);
  }

  private chain(id: number): Chain {
    const el = new Audio(`/api/tracks/${id}/audio`);
    el.preload = "auto";
    const src = this.ctx.createMediaElementSource(el);
    const shelf = (type: BiquadFilterType, freq: number) => { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; return f; };
    const low = shelf("lowshelf", 220), mid = shelf("peaking", 1000), hi = shelf("highshelf", 3500);
    mid.Q.value = 0.7;
    const lp = shelf("lowpass", 20000), hp = shelf("highpass", 20);
    const fader = this.ctx.createGain();
    const meter = this.ctx.createAnalyser();
    meter.fftSize = 512;
    src.connect(low).connect(mid).connect(hi).connect(lp).connect(hp).connect(fader).connect(meter).connect(this.ctx.destination);
    return { el, low, mid, hi, lp, hp, fader, meter };
  }

  async start(): Promise<void> {
    const { a, b } = this.cfg;
    await this.ctx.resume();
    this.a.el.currentTime = Math.max(0, a.start - LEAD * a.barLen);
    this.b.el.currentTime = Math.max(0, b.start);
    this.b.el.playbackRate = b.rate;
    this.apply(-LEAD);
    await this.a.el.play();
    // Position über die Audio-Uhr: unabhängig davon, ob Track A gerade in einer Schleife läuft
    this.t0 = this.ctx.currentTime - (this.a.el.currentTime - a.start) / 1;
    this.tick();
  }

  private pos(): number {
    return (this.ctx.currentTime - this.t0) / this.cfg.a.barLen;
  }

  private value(name: string, deck: number, fallback: number, bar: number): number {
    const id = `${name}_${deck}`;
    const curve = this.auto.controls[id];
    return curve ? valueAt(curve, bar) : this.auto.rest[id] ?? fallback;
  }

  private apply(bar: number): void {
    const now = this.ctx.currentTime;
    const cross = this.auto.controls.crossfader ? valueAt(this.auto.controls.crossfader, bar) : null;
    const eq = (v: number) => (v <= 0.5 ? -30 * (1 - v / 0.5) : 6 * ((v - 0.5) / 0.5));
    for (const [chain, deck, side] of [[this.a, this.cfg.a.deck, "a"], [this.b, this.cfg.b.deck, "b"]] as const) {
      chain.low.gain.setTargetAtTime(eq(this.value("low", deck, 0.5, bar)), now, 0.02);
      chain.mid.gain.setTargetAtTime(eq(this.value("mid", deck, 0.5, bar)), now, 0.02);
      chain.hi.gain.setTargetAtTime(eq(this.value("hi", deck, 0.5, bar)), now, 0.02);
      const cfx = this.value("cfx", deck, 0.5, bar);
      chain.lp.frequency.setTargetAtTime(cfx < 0.5 ? 200 * Math.pow(100, cfx / 0.5) : 20000, now, 0.03);
      chain.hp.frequency.setTargetAtTime(cfx > 0.5 ? 20 * Math.pow(150, (cfx - 0.5) / 0.5) : 20, now, 0.03);
      let gain = Math.pow(this.value("fader", deck, side === "a" ? 1 : 0, bar), 1.5);
      if (cross !== null) gain *= side === "a" ? Math.cos((cross * Math.PI) / 2) : Math.sin((cross * Math.PI) / 2);
      chain.fader.gain.setTargetAtTime(gain, now, 0.015);
    }
    const echo = this.auto.controls.beatfx_onoff;
    this.echoSend.gain.setTargetAtTime(echo ? valueAt(echo, bar) * 0.8 : 0, now, 0.02);
  }

  private tick = (): void => {
    if (this.stopped) return;
    const bar = this.pos();
    const { a, b } = this.cfg;
    if (!this.bStarted && bar >= this.auto.b_start_bar) {
      this.bStarted = true;
      this.b.el.play().catch(() => {});
    }
    // Loop-Out: den letzten Takt vor dem Mix-Punkt wiederholen, solange der Loop aktiv ist
    const loop = Object.entries(this.auto.controls).find(([id]) => id.startsWith("loop4_"))?.[1];
    if (loop && valueAt(loop, bar) >= 0.5 && this.a.el.currentTime >= a.start) this.a.el.currentTime -= a.barLen;
    this.apply(bar);
    this.onPos(bar);
    if (bar > this.auto.bars + TAIL || this.b.el.ended || (this.a.el.ended && bar < this.auto.b_start_bar)) { this.stop(); return; }
    void b;
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Aktueller Pegel beider Kanäle (0…1) hinter dem Fader – für die Pegelanzeige. */
  levels(): [number, number] {
    const rms = (meter: AnalyserNode) => {
      const data = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      return Math.min(1, Math.sqrt(sum / data.length) * 3);
    };
    return [rms(this.a.meter), rms(this.b.meter)];
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.a.el.pause();
    this.b.el.pause();
    this.ctx.close().catch(() => {});
    this.onPos(null);
  }
}
