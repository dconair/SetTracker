import { useCallback, useEffect, useRef, useState } from "react";

export interface BeatOptions {
  bpm: number;
  /** Länge einer Phrase in Takten (Standard 8 = 32 Schläge). */
  phraseBars?: number;
  /** Deutliches Signal (Becken) am Beginn jeder Phrase. */
  phraseSignal?: boolean;
  /** Wird im Moment jedes Schlags aufgerufen (0 = erster Schlag). */
  onBeat?: (index: number) => void;
}

/**
 * Einfacher Übungs-Beat aus dem Browser-Synthesizer: Kick auf jedem Schlag (die Eins betont),
 * Hi-Hat dazwischen, ein Basston, der mit jeder Phrase wechselt. Keine Audiodateien nötig.
 */
export function useBeat(options: BeatOptions) {
  const opts = useRef(options);
  opts.current = options;
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const state = useRef({ start: 0, next: 0, index: 0, timer: 0 });

  const stop = useCallback(() => {
    window.clearInterval(state.current.timer);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setPlaying(false);
  }, []);

  const start = useCallback(() => {
    stop();
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    const tone = (freq: number, endFreq: number, t: number, dur: number, gain: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
    const noise = (t: number, dur: number, gain: number, highpass: number) => {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = highpass;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter).connect(g).connect(master);
      src.start(t);
    };
    const bassNotes = [55, 65.4, 49, 58.3]; // wechselt je Phrase – so hört man den Neubeginn auch ohne Signal

    const s = state.current;
    s.start = ctx.currentTime + 0.12;
    s.next = s.start;
    s.index = 0;
    const schedule = () => {
      const { bpm, phraseBars = 8, phraseSignal, onBeat } = opts.current;
      const period = 60 / bpm;
      while (s.next < ctx.currentTime + 0.15) {
        const i = s.index;
        const t = s.next;
        const beatInBar = i % 4;
        const phraseStart = i % (phraseBars * 4) === 0;
        tone(beatInBar === 0 ? 150 : 120, 45, t, 0.22, beatInBar === 0 ? 1 : 0.75);       // Kick
        noise(t + period / 2, 0.05, 0.18, 7000);                                           // Hi-Hat auf dem Off-Beat
        if (beatInBar === 1 || beatInBar === 3) noise(t, 0.12, 0.16, 1800);                // Clap auf 2 und 4
        tone(bassNotes[Math.floor(i / (phraseBars * 4)) % bassNotes.length] * 2, bassNotes[0], t + period / 2, period * 0.4, 0.22, "triangle");
        if (phraseStart && phraseSignal) noise(t, 0.9, 0.3, 5000);                         // Becken zum Phrasenbeginn
        if (onBeat) window.setTimeout(() => ctxRef.current === ctx && opts.current.onBeat?.(i), Math.max(0, (t - ctx.currentTime) * 1000));
        s.index += 1;
        s.next += period;
      }
    };
    schedule();
    s.timer = window.setInterval(schedule, 25);
    setPlaying(true);
  }, [stop]);

  useEffect(() => stop, [stop]);

  /** Aktuelle Position in Schlägen (mit Nachkommastellen), solange der Beat läuft. */
  const position = useCallback(() => {
    const ctx = ctxRef.current;
    return ctx ? (ctx.currentTime - state.current.start) / (60 / opts.current.bpm) : 0;
  }, []);

  return { playing, start, stop, position };
}
