/**
 * The countdown's clock, heard (Scene16Countdown): a tick on every even
 * second and a tock on every odd one, as the seconds turn.
 *
 * The sounds are the owner's own recording (public/free-china-trip/
 * time-sound.mp3), cut down to one tick and one tock in a small mono WAV
 * (16-clock-ticks.wav: the tick at 0.00s, the tock at 0.35s). Looping the
 * recording would drift: its ticks fall 975 to 1025 ms apart. Instead each
 * sound is scheduled on the audio clock for the exact moment the second
 * turns (when the figures roll), a few hundred milliseconds ahead, so the
 * ticks are sample-accurate and never wander from the clock face, however
 * busy the page is.
 *
 * Nothing is fetched until the clock is first heard. Browsers only let a
 * page make sound after a click, tap or key press on it (a scroll is not
 * one), so `start()` is called from one, or once the page has had one.
 */

const SRC = "/free-china-trip/16-clock-ticks.wav";
const SOUNDS = { tick: { at: 0, len: 0.33 }, tock: { at: 0.35, len: 0.29 } } as const;
/** The level the clock settles at: the recording is raised to a 0.89 peak, so this is about a third of full scale. */
const VOLUME = 0.38;
/** How far ahead each tick is put on the audio clock, and how often the scheduler looks. */
const AHEAD_MS = 300;
const LOOK_MS = 90;
/** The figures roll 12 ms after the second turns, and are drawn a frame later:
 *  the tick lands with the roll, a touch after it rather than before (sound
 *  ahead of the picture is what the ear notices). */
const SYNC_MS = 28;

export interface ClockSound {
  /** Begin (or carry on) ticking: fades in. Call from a click, tap or key press, or once the page has had one. */
  start(): Promise<boolean>;
  /** Fade out and stop scheduling. */
  stop(): void;
  /** Gone for good (the page is leaving). */
  destroy(): void;
}

/**
 * @param target  The moment the countdown reaches zero (ms since the epoch):
 *                no tick is scheduled after it.
 * @param onTick  Called as each sound plays (for the button's pulse); `even`
 *                is the tick, odd the tock.
 */
export function createClockSound(target: number, onTick?: (even: boolean) => void): ClockSound {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let buffer: AudioBuffer | null = null;
  let loading: Promise<AudioBuffer | null> | null = null;
  let timer = 0;
  let running = false;
  /** The next whole second (ms since the epoch) still to be scheduled. */
  let next = 0;
  const pending = new Set<number>();

  const load = () =>
    (loading ??= (async () => {
      try {
        const res = await fetch(SRC);
        const data = await res.arrayBuffer();
        return await ctx!.decodeAudioData(data);
      } catch {
        return null;
      }
    })());

  const schedule = () => {
    if (!running || !ctx || !master || !buffer) return;
    const now = Date.now();
    // A tab woken from sleep: skip the seconds that have gone.
    if (next < now) next = Math.ceil(now / 1000) * 1000;
    while (next - now < AHEAD_MS) {
      if (next > target) return stop();
      const left = Math.floor((target - next) / 1000) % 60;
      const even = left % 2 === 0;
      const s = even ? SOUNDS.tick : SOUNDS.tock;
      // The audio clock runs ahead of what is heard by the output latency.
      const lag = (ctx.outputLatency || ctx.baseLatency || 0) as number;
      const when = Math.max(ctx.currentTime, ctx.currentTime + (next + SYNC_MS - Date.now()) / 1000 - lag);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(master);
      src.start(when, s.at, s.len);
      if (onTick) {
        const id = window.setTimeout(() => {
          pending.delete(id);
          onTick(even);
        }, Math.max(0, next + SYNC_MS - Date.now()));
        pending.add(id);
      }
      next += 1000;
    }
  };

  const stop = () => {
    running = false;
    window.clearInterval(timer);
    pending.forEach((id) => window.clearTimeout(id));
    pending.clear();
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    }
  };

  return {
    async start() {
      if (running) return true;
      try {
        ctx ??= new AudioContext();
        // Without a click on the page some browsers leave resume() pending
        // rather than refusing: never wait on it for long.
        if (ctx.state === "suspended") await Promise.race([ctx.resume(), new Promise((r) => window.setTimeout(r, 400))]);
      } catch {
        return false;
      }
      if (ctx.state !== "running") return false;
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
      }
      buffer ??= await load();
      if (!buffer) return false;
      running = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.18);
      next = Math.ceil(Date.now() / 1000) * 1000;
      schedule();
      timer = window.setInterval(schedule, LOOK_MS);
      return true;
    },
    stop,
    destroy() {
      stop();
      void ctx?.close();
      ctx = null;
    },
  };
}
