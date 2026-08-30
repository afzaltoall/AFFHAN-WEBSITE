"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drive a video's playhead from scroll position, smoothly.
 *
 * The video is never played. Scroll position maps to a target time, and a
 * frame loop eases the playhead towards it, so a flick of the wheel glides
 * rather than jumping between two distant frames.
 *
 * No WebCodecs, no frame bank, no mp4box.
 *
 * The usual reason for reaching for those is that seeking an ordinary web mp4
 * is slow: the decoder has to run forward from the previous keyframe, and a
 * typical encode has one every few seconds. public/career-video/career-1.mp4
 * was one keyframe every 144 frames, so scrubbing it directly stutters badly.
 *
 * The asset is re-encoded all-intra instead — every one of its 181 frames is a
 * keyframe (see scripts/build_scrub_video.mjs), which makes every seek
 * effectively instant. That buys the same smoothness as decoding frames by
 * hand in JavaScript, for none of the complexity and no extra dependency: no
 * megabyte of decoder shipped to the browser, nothing to fall back from when
 * WebCodecs is missing, and it works identically in every browser that can
 * play an mp4 at all.
 */

/** Higher eases faster. 8 lands roughly where a scroll flick feels attached. */
const LERP_TAU = 8;
/** Below this many seconds of error, snap — stops a permanent micro-crawl. */
const SNAP = 0.002;

export interface VideoScrub {
  /** Attach to the scroll track — its height is the scroll distance. */
  trackRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 0 → 1 through the track. Drive text fades from this. */
  progress: number;
}

export function useVideoScrub(): VideoScrub {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let last = performance.now();
    let current = 0;
    // Recomputed on resize rather than read every frame: offsetHeight forces
    // layout, and doing that once per frame is how a scroll effect ends up
    // costing more than the video it is driving.
    let span = 0;

    const measure = () => {
      span = Math.max(1, track.offsetHeight - window.innerHeight);
    };
    measure();

    const readProgress = () => {
      const top = track.getBoundingClientRect().top + window.scrollY;
      return Math.min(1, Math.max(0, (window.scrollY - top) / span));
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const p = readProgress();
      setProgress(p);

      const duration = video.duration;
      if (duration > 0 && Number.isFinite(duration)) {
        const target = p * duration;
        if (reduced) {
          current = target;
        } else {
          // Frame-rate independent easing: the same journey takes the same
          // time whether the display runs at 60Hz or 120.
          current += (target - current) * (1 - Math.exp(-dt * LERP_TAU));
          if (Math.abs(target - current) < SNAP) current = target;
        }
        // readyState >= 1 (HAVE_METADATA) is enough to seek. Guarding on it
        // stops a stream of rejected seeks before metadata arrives.
        if (video.readyState >= 1 && Math.abs(video.currentTime - current) > 0.001) {
          video.currentTime = current;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return { trackRef, videoRef, progress };
}
