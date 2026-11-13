/**
 * The lucky draw's sound (the owner, 2026-11-13: "use these audio files perfectly for the lucky draw"): their six short
 * files (public/lucky-draw/audio), each played at a moment of the screen's own (./stage.ts cues them), through WebAudio
 * so each lands on its moment and fades rather than cuts.
 *
 * A browser plays sound only once someone has pressed something on the page: the presenter's first press (Draw, a key,
 * a click anywhere) starts it (unlock). M or the speaker button mutes it, and the screen keeps that choice.
 */

export type SoundName = "click" | "scrolling" | "selection" | "slowmo" | "hit" | "whoosh";

/** The files, as the owner named them: Click, Scrolling, Selection progress, Slowmo selection, Transition, Transition whoosh. */
export const SOUND_FILES: Record<SoundName, string> = {
  click: "/lucky-draw/audio/click.mp3",
  scrolling: "/lucky-draw/audio/scrolling.mp3",
  selection: "/lucky-draw/audio/selection-progress.mp3",
  slowmo: "/lucky-draw/audio/slowmo-selection.mp3",
  hit: "/lucky-draw/audio/transition.mp3",
  whoosh: "/lucky-draw/audio/transition-whoosh.mp3",
};

/**
 * How loud each plays, as they were made at different levels (measured 2026-11-13, loudness over the whole file): the
 * whoosh loud (-13 dB), the selection bed, scrolling and the hits about -21 dB, the click quiet (-30 dB). Set so the bed
 * sits under the hits and the whoosh never drowns the rest.
 */
export const SOUND_LEVEL: Record<SoundName, number> = { click: 1, scrolling: 0.5, selection: 0.55, slowmo: 0.8, hit: 0.85, whoosh: 0.42 };

/** A sound playing: stopped, fading over `fade` seconds. */
export interface Playing {
  stop(fade?: number): void;
}

export class DrawSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly raw = new Map<SoundName, ArrayBuffer>();
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private muted: boolean;

  constructor(muted = false) {
    this.muted = muted;
  }

  /** The files fetched, once (small: three quarters of a megabyte in all), so the screen has them before the first draw. */
  load(): Promise<void> {
    this.loading ??= Promise.all(
      (Object.keys(SOUND_FILES) as SoundName[]).map(async (name) => {
        try {
          const res = await fetch(SOUND_FILES[name]);
          if (res.ok) this.raw.set(name, await res.arrayBuffer());
        } catch {
          // A sound that will not come is silence; the draw goes on.
        }
      }),
    ).then(() => this.decode());
    return this.loading;
  }

  /** A press on the page: from now on the browser lets it play. Safe to call on every press. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      void this.load().then(() => this.decode());
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private async decode() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [name, raw] of this.raw) {
      if (this.buffers.has(name)) continue;
      try {
        this.buffers.set(name, await ctx.decodeAudioData(raw.slice(0)));
      } catch {
        // Not a sound this browser can play: silence.
      }
    }
  }

  /** Whether sound is playing now: started by a press, its files in, and not muted. */
  get on(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * One sound, `delay` seconds from now, at its level times `gain`; looped if `loop`, fading in over `fadeIn`. Null while
   * the browser does not let it play yet, or its file is not in: the moment passes in silence, never late.
   */
  play(name: SoundName, { gain = 1, delay = 0, loop = false, fadeIn = 0 } = {}): Playing | null {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !this.master || !buffer || ctx.state !== "running") return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const level = ctx.createGain();
    const at = ctx.currentTime + Math.max(0, delay);
    const target = SOUND_LEVEL[name] * gain;
    if (fadeIn > 0) {
      level.gain.setValueAtTime(0, at);
      level.gain.linearRampToValueAtTime(target, at + fadeIn);
    } else level.gain.setValueAtTime(target, at);
    source.connect(level).connect(this.master);
    source.start(at);
    let over = false;
    source.onended = () => {
      over = true;
      source.disconnect();
      level.disconnect();
    };
    return {
      stop: (fade = 0.25) => {
        if (over) return;
        over = true;
        const now = ctx.currentTime;
        level.gain.cancelScheduledValues(now);
        level.gain.setValueAtTime(level.gain.value, now);
        level.gain.linearRampToValueAtTime(0, now + fade);
        try {
          source.stop(now + fade + 0.02);
        } catch {
          // Already stopped.
        }
      },
    };
  }

  /** Muted or not: the whole of it, eased (no click as it goes). */
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  close() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
  }
}
