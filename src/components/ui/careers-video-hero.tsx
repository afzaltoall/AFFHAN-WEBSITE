"use client";

import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import { scrollToId } from "@/lib/scroll";
import { useVideoScrub } from "@/lib/useVideoScrub";

const instrument = Instrument_Serif({ weight: "400", subsets: ["latin"] });

/**
 * The careers hero: three beats over a video the reader scrubs.
 *
 * The video used to autoplay on a loop, which meant it was always moving and
 * never in step with anything. Now its playhead follows scroll position — the
 * ship advances as you read and stops when you stop — so the motion belongs to
 * the reader rather than running underneath them.
 *
 * Three beats rather than one, because a single line of copy over three
 * screens of scrolling leaves two of them empty. Each fades fully out before
 * the next arrives, so the frame is never carrying two thoughts at once.
 *
 * They are placed against the footage rather than centred by default: the ship
 * sits low and left through the middle of the clip, so beats two and three sit
 * right, in the open sky, where they neither cover it nor compete with it.
 *
 * The scroll track is 300vh rather than the 500vh a standalone scroll-video
 * page would use. This is the opening of a long careers page — the teams wall,
 * the roles and the growth flow all follow — and five screens before the first
 * heading would bury them.
 */

/**
 * Opacity for a beat that fades in, holds, then fades out.
 *
 * Bands are expressed as scroll progress. `outStart`/`outEnd` are optional so
 * the final beat can hold to the end of the track.
 */
function band(p: number, inStart: number, inEnd: number, outStart?: number, outEnd?: number): number {
  if (p < inStart) return 0;
  if (p < inEnd) return (p - inStart) / (inEnd - inStart);
  if (outStart === undefined || outEnd === undefined || p < outStart) return 1;
  if (p < outEnd) return 1 - (p - outStart) / (outEnd - outStart);
  return 0;
}

export function CareersVideoHero() {
  const { trackRef, videoRef, progress } = useVideoScrub();

  // Sequential: each is fully gone before the next appears.
  const beat1 = progress < 0.24 ? 1 : band(progress, 0, 0, 0.24, 0.34);
  const beat2 = band(progress, 0.40, 0.48, 0.62, 0.70);
  const beat3 = band(progress, 0.78, 0.86);

  // A beat that has faded out must not keep catching clicks.
  const beatStyle = (opacity: number): React.CSSProperties => ({
    opacity,
    transition: "opacity 0.1s ease-out",
    pointerEvents: opacity < 0.05 ? "none" : "auto",
  });

  // Rises as it appears, so a beat arrives rather than simply switching on.
  const rise = (opacity: number, distance = 24): React.CSSProperties => ({
    transform: `translateY(${(1 - Math.min(1, opacity)) * distance}px)`,
    transition: "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
  });

  return (
    // 220vh on a phone, 300vh from sm up. Three screens of scrolling is a
    // comfortable prologue with a mouse; on a touch device it is a lot of thumb
    // before the page proper starts, and the beats still get their full run.
    <div ref={trackRef} className="relative h-[220vh] sm:h-[300vh]">
      <section
        className="sticky top-0 h-screen overflow-hidden"
        // Dark type, because the footage is bright.
        //
        // Measured across the clip: average luma 180/255, never darker than
        // 133. White type scored 1.48:1 on the brightest frames and the muted
        // grey 1.53:1 — which is why the subheading had all but disappeared.
        // #081f2a is the brand's navy and scores 4.59:1 on the darkest frame
        // and 11.43:1 on the brightest, so it holds for the whole flight.
        style={{
          "--background": "201 100% 13%",
          "--foreground": "202 68% 10%",
          "--muted-foreground": "202 68% 10%",
        } as React.CSSProperties}
      >
        {/* Background video.
            Never played — the hook writes currentTime. muted + playsInline are
            required for iOS to allow seeking without a user gesture, and the
            poster covers the moment before the first frame decodes. */}
        <div className="absolute inset-0 z-0">
          {/* Two encodes of the same all-intra footage, both 1920 native.
              The browser takes the first it can decode: VP9 is smaller and
              measurably sharper (6.0MB at SSIM 0.9920 against 6.6MB at 0.9908),
              and the H.264 mp4 is there for older iOS Safari, which has never
              reliably decoded VP9 in a WebM container. Each visitor downloads
              one of them, not both. */}
          <video
            ref={videoRef}
            muted
            playsInline
            preload="auto"
            poster="/career-video/career-1-poster.jpg"
            // The clip is 16:9 and a phone is not, so object-cover crops
            // the sides hard. Biasing left keeps the ship — the only subject
            // in the frame — from being cropped out on portrait.
            className="h-full w-full object-cover object-[38%_center] sm:object-center"
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src="/career-video/career-1-scrub.webm" type="video/webm" />
            <source src="/career-video/career-1-scrub.mp4" type="video/mp4" />
          </video>
          {/* A light scrim, not a dark one.
              The old overlay was bg-black/30 mix-blend-multiply, which suited
              the previous night-time clip and works against this one: it
              muddies the cloud and does nothing for dark type. This lifts the
              frame towards white so the copy keeps a comfortable margin even on
              the darkest frame — 4.59:1 becomes 7.29:1 — while the corners stay
              untouched footage. */}
          <div
            className="absolute inset-0"
            style={{
              // Two layers: a soft vertical lift that covers a tall portrait
              // column of text, and the original centred pool for wide screens.
              // The radial alone left the top and bottom of a phone screen
              // unlifted, which is where the copy actually sits there.
              // Raised from 0.30/0.34. Measured on the darkest frame the copy
              // crosses, the old floor left the muted words at 4.03:1 — under
              // the 4.5:1 body threshold, and visibly washed out beside the
              // solid ones. At 0.40/0.44 those same words clear 6.6:1.
              background: [
                "linear-gradient(180deg, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.20) 35%, rgba(255,255,255,0.20) 65%, rgba(255,255,255,0.40) 100%)",
                "radial-gradient(ellipse 90% 70% at 50% 45%, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0.24) 45%, rgba(255,255,255,0) 78%)",
              ].join(", "),
            }}
          />
        </div>

        <style>{`
          @keyframes fade-rise {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-rise { animation: fade-rise 0.8s ease-out both; }
          .animate-fade-rise-delay { animation: fade-rise 0.8s ease-out 0.2s both; }
          .animate-fade-rise-delay-2 { animation: fade-rise 0.8s ease-out 0.4s both; }

          /* Rebuilt for dark type on a light background. The original was a
             white-on-dark treatment: a near-transparent white fill with a white
             inner highlight, which on cloud reads as no button at all. */
          .liquid-glass {
            background: rgba(255, 255, 255, 0.55);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            border: 1px solid rgba(8, 31, 42, 0.18);
            box-shadow: 0 1px 2px rgba(8, 31, 42, 0.06), 0 8px 24px -12px rgba(8, 31, 42, 0.25);
            position: relative;
            overflow: hidden;
            transition: transform 0.3s ease, background 0.3s ease;
          }
          /* Gated to real hover-capable pointers — a plain :hover on a button
             sticks on touch devices, forcing a double-tap to actually click it. */
          @media (hover: hover) and (pointer: fine) {
            .liquid-glass:hover {
              transform: scale(1.03);
              background: rgba(255, 255, 255, 0.72);
            }
          }
        `}</style>

        {/* ---- Beat 1: the headline, centred ---- */}
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
          style={beatStyle(beat1)}
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center">
            <h1 className={cn(
              "animate-fade-rise text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] font-normal text-[hsl(var(--foreground))]",
              instrument.className
            )}>
              Grow <em className="not-italic text-[hsl(var(--muted-foreground))]/88">without limits</em>,{" "}
              with <em className="not-italic text-[hsl(var(--muted-foreground))]/88">Affhan</em>.
            </h1>

            <p className="animate-fade-rise-delay text-[hsl(var(--muted-foreground))]/92 text-base sm:text-lg max-w-2xl mt-8 leading-relaxed font-[family-name:var(--font-geist-sans)]">
              From Chennai to Guangzhou, London to Dubai, Affhan sources, inspects and moves the world&apos;s goods across 190+ markets. Join the team that turns global trade into everyday craft &mdash; and build a career without borders.
            </p>

            <button
              onClick={() => scrollToId("roles")}
              className="animate-fade-rise-delay-2 liquid-glass rounded-full px-14 py-5 text-base font-medium text-[hsl(var(--foreground))] mt-12 cursor-pointer font-[family-name:var(--font-geist-sans)]"
            >
              Begin Journey
            </button>
          </div>
        </div>

        {/* ---- Beat 2: right, in the open sky beside the ship ----
             Every figure here is one the site already stands behind: seven
             offices, trading since 2000. Nothing invented to fill the space. */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-7 sm:px-10 md:justify-end md:px-16 lg:px-24"
          style={beatStyle(beat2)}
        >
          <div className="w-full max-w-md text-left sm:max-w-lg" style={rise(beat2)}>
            <p className="text-[12px] sm:text-xs font-semibold uppercase tracking-[0.24em] sm:tracking-[0.28em] text-[hsl(var(--muted-foreground))]/88">
              Trading since 2000
            </p>
            <h2 className={cn(
              "mt-3.5 text-[2.6rem] sm:text-5xl md:text-6xl leading-[1.05] sm:leading-[1.02] tracking-[-1.2px] sm:tracking-[-1.4px] font-normal text-[hsl(var(--foreground))]",
              instrument.className
            )}>
              Seven offices,<br />
              <em className="not-italic text-[hsl(var(--muted-foreground))]/88">one crew.</em>
            </h2>
            <p className="mt-5 sm:mt-6 max-w-md text-[15.5px] sm:text-base leading-[1.62] text-[hsl(var(--muted-foreground))]/92 font-[family-name:var(--font-geist-sans)]">
              Guangzhou, Chennai, Dubai, London, Singapore, Melaka and Paris. The buyers walking factory floors
              and the people clearing the container at the other end work for the same company &mdash; which is
              the whole reason the job is worth doing well.
            </p>
          </div>
        </div>

        {/* ---- Beat 3: the close, and the way in ---- */}
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-7 sm:px-10 md:justify-end md:px-16 lg:px-24"
          style={beatStyle(beat3)}
        >
          <div className="w-full max-w-md text-left sm:max-w-lg" style={rise(beat3)}>
            <p className="text-[12px] sm:text-xs font-semibold uppercase tracking-[0.24em] sm:tracking-[0.28em] text-[hsl(var(--muted-foreground))]/88">
              Open roles
            </p>
            <h2 className={cn(
              "mt-3.5 text-[2.6rem] sm:text-5xl md:text-6xl leading-[1.05] sm:leading-[1.02] tracking-[-1.2px] sm:tracking-[-1.4px] font-normal text-[hsl(var(--foreground))]",
              instrument.className
            )}>
              Find your place<br />
              <em className="not-italic text-[hsl(var(--muted-foreground))]/88">in the crossing.</em>
            </h2>
            <p className="mt-5 sm:mt-6 max-w-md text-[15.5px] sm:text-base leading-[1.62] text-[hsl(var(--muted-foreground))]/92 font-[family-name:var(--font-geist-sans)]">
              Sourcing, quality, freight, customs, and the people who hold it all together. If you like
              problems that cross borders, there is probably one here with your name on it.
            </p>
            <button
              onClick={() => scrollToId("roles")}
              className="liquid-glass mt-9 cursor-pointer rounded-full px-10 py-4 text-[15px] font-medium text-[hsl(var(--foreground))] font-[family-name:var(--font-geist-sans)]"
            >
              See open roles
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
