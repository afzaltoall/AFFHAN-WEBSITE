"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

/**
 * Four soft characters beside the sign-in card. They watch the cursor, one of
 * them leans over when it comes close, the nearest one ducks while a password
 * is being typed, and every so often the group hops.
 *
 * Drawn rather than fetched: inline SVG in the brand's own colours, a few
 * hundred bytes of markup and no image request. The page it sits on had 5MB of
 * PNGs taken out of it a moment ago; a mascot that put a kilobyte back would
 * be a poor trade for a decoration.
 *
 * ── Why each character owns its own state ────────────────────────────────
 *
 * The first version of this drove all of them from one shared lean, and it
 * looked like one object with four faces painted on it: everybody leaned at
 * once, by the same amount, at the same instant. Four characters are only four
 * characters if they can disagree — so each is its own component with its own
 * springs, and the parent tells it only what is true about the world (where
 * the cursor is, whether it is the nearest one, whether a password is being
 * typed). What to do about that is the character's own business.
 *
 * Each is in exactly one pose at a time, in this order of precedence:
 *
 *   DUCK    a password field is focused and this is the character nearest it.
 *           Bows: down, forward, eyes shut. Beats everything.
 *   BEND    the cursor is inside this character's own proximity box. Leans
 *           hard toward it — skew from the feet, a little rotation, and a
 *           squash-and-stretch pair so the body reads as rubber rather than as
 *           a rotated rectangle. Only ever one character at a time.
 *   IDLE    everything else, which is most of the time. The body is at rest;
 *           only the pupils move, following the cursor across the whole page.
 *
 * The hop is separate from all three. It rides on an outer group so it can run
 * underneath whatever pose is current, and each character launches and lands
 * on its own offset — a synchronised hop is a rigid group animation wearing a
 * costume.
 *
 * prefers-reduced-motion removes the entrance, the hop, the bend and the
 * pupil tracking, and leaves the resting pose.
 */

/** Which field the form is on, in the only terms this illustration needs. */
export type MascotFocus = "name" | "email" | "phone" | "secret" | null;

/** The illustration's own coordinate space. */
const VB = { w: 300, h: 190 };
const GROUND = 170;

const BRAND = "#27a8c4";
const BRAND_DARK = "#176579";
const BRAND_SOFT = "#7fd0e2";
const BRAND_PALE = "#a9e0ec";

type CharId = "tall" | "mid" | "blobA" | "blobB";

/**
 * Where each character stands, and how big its personal space is.
 *
 * `cx` is the centre of its feet — the pivot everything turns around. `reach`
 * is how close the cursor has to get before it leans over; `top` keeps a
 * cursor high above the group from waking the short ones.
 */
const CHARS: {
  id: CharId;
  cx: number;
  reach: number;
  top: number;
  /** Order of precedence when the password field steals one away. */
  nearPassword: number;
}[] = [
  { id: "tall", cx: 131, reach: 58, top: 26, nearPassword: 3 },
  { id: "mid", cx: 189, reach: 52, top: 74, nearPassword: 2 },
  { id: "blobA", cx: 58, reach: 56, top: 122, nearPassword: 4 },
  // The password box sits low on the right of the card, so this is the one
  // with somewhere to look away from.
  { id: "blobB", cx: 247, reach: 50, top: 104, nearPassword: 1 },
];

const HOP_EVERY_MS = 9000;
const HOP_CHECK_MS = 1500;

export function SignupMascot({ focus = null }: { focus?: MascotFocus }) {
  const reduced = useReducedMotion();
  const ducking = focus === "secret";

  const svgRef = useRef<SVGSVGElement>(null);

  // Where the cursor is, in viewBox units. Motion values, not state: this
  // updates once a frame while the mouse moves and must not re-render React.
  const cursorX = useMotionValue(VB.w / 2);
  const cursorY = useMotionValue(VB.h / 2);

  // Which character the cursor is currently over, if any. This one IS state —
  // it changes rarely (entering and leaving a character's box) and it decides
  // which component re-renders into its bend pose.
  const [nearId, setNearId] = useState<CharId | null>(null);

  // Bumped to fire a hop. A counter rather than a boolean so two hops in a row
  // are two distinct values and the animation restarts cleanly.
  const [hop, setHop] = useState(0);
  // Starts at 0 and is stamped on mount: reading the clock during render is
  // reading something that changes when React is not looking.
  const lastActivity = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
  }, []);

  // ── the cursor, page-wide ────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) return;

    let frame = 0;
    let latest: { x: number; y: number } | null = null;

    const apply = () => {
      frame = 0;
      const svg = svgRef.current;
      if (!svg || !latest) return;
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;

      // Screen pixels into the illustration's own units. The cursor is usually
      // outside the svg, which is fine and wanted: a point far to the right is
      // exactly what "look over there" means.
      const vx = ((latest.x - r.left) / r.width) * VB.w;
      const vy = ((latest.y - r.top) / r.height) * VB.h;
      cursorX.set(vx);
      cursorY.set(vy);

      // Nearest character, if the cursor is actually inside somebody's space.
      // Set only on change, so crossing a character costs one render and
      // sitting inside it costs none.
      let found: CharId | null = null;
      let best = Infinity;
      for (const c of CHARS) {
        const dx = Math.abs(vx - c.cx);
        if (dx > c.reach) continue;
        if (vy < c.top - 34 || vy > GROUND + 40) continue;
        if (dx < best) {
          best = dx;
          found = c.id;
        }
      }
      setNearId((prev) => (prev === found ? prev : found));
    };

    const onMove = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY };
      lastActivity.current = Date.now();
      if (!frame) frame = requestAnimationFrame(apply);
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced, cursorX, cursorY]);

  // ── the occasional hop ───────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      // Only when nothing else has been going on. A hop in the middle of
      // someone filling in the form is a distraction, not a flourish.
      if (Date.now() - lastActivity.current < HOP_EVERY_MS) return;
      lastActivity.current = Date.now();
      setHop((n) => n + 1);
    }, HOP_CHECK_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // Typing counts as activity too, so the group holds still while it happens.
  useEffect(() => {
    if (focus) lastActivity.current = Date.now();
  }, [focus]);

  // While a password is being typed, exactly one character looks away: the one
  // standing nearest the password box. The rest carry on as they were.
  const duckId = ducking
    ? CHARS.reduce((a, b) => (a.nearPassword <= b.nearPassword ? a : b)).id
    : null;

  const shared = { cursorX, cursorY, hop, reduced: !!reduced };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      className="h-auto w-full max-w-[330px]"
      // Decorative. It says nothing the form does not already say, so a screen
      // reader should walk straight past it.
      role="presentation"
      aria-hidden="true"
    >
      <motion.line
        x1="10" y1={GROUND + 1} x2="290" y2={GROUND + 1}
        stroke={BRAND}
        strokeOpacity="0.18"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={reduced ? undefined : { duration: 0.7, delay: 0.1 }}
      />

      {/* Back to front. The tall one stands behind the other three. */}
      <MascotCharacter
        {...shared}
        index={0}
        cx={131}
        bending={nearId === "tall"}
        ducking={duckId === "tall"}
        peeking={ducking}
        eyes={{ cy: 74, gap: 26, tone: "#eaf7fa", ball: { sclera: "#eaf7fa", pupil: "#0d2f3a" } }}
      >
        <rect x="96" y="26" width="70" height="144" rx="15" fill={BRAND_DARK} />
      </MascotCharacter>

      <MascotCharacter
        {...shared}
        index={3}
        cx={247}
        bending={nearId === "blobB"}
        ducking={duckId === "blobB"}
        peeking={ducking}
        eyes={{ cy: 130, gap: 20, tone: "#08313d" }}
        // The flat beak, which is what tells this one apart from the other blob.
        // The body runs x 214→280, so the beak has to end well inside 280. It
        // was drawn to 286 and hung over the edge into empty space.
        mouth={<line x1="245" y1="147" x2="270" y2="147" stroke="#08313d" strokeWidth="2.6" strokeLinecap="round" />}
      >
        <path d={`M214 ${GROUND} V137 a33 33 0 0 1 66 0 V${GROUND} Z`} fill={BRAND_PALE} />
      </MascotCharacter>

      <MascotCharacter
        {...shared}
        index={1}
        cx={189}
        bending={nearId === "mid"}
        ducking={duckId === "mid"}
        peeking={ducking}
        eyes={{ cy: 106, gap: 24, tone: "#08313d", ball: { sclera: "#ffffff", pupil: "#08313d" } }}
      >
        <rect x="158" y="74" width="62" height="96" rx="14" fill={BRAND} />
      </MascotCharacter>

      <MascotCharacter
        {...shared}
        index={2}
        cx={58}
        bending={nearId === "blobA"}
        ducking={duckId === "blobA"}
        peeking={ducking}
        eyes={{ cy: 141, gap: 26, tone: "#0d2f3a" }}
        mouth={<circle cx="58" cy="157" r="2.6" fill="#0d2f3a" />}
      >
        <path d={`M10 ${GROUND} A48 48 0 0 1 106 ${GROUND} Z`} fill={BRAND_SOFT} />
      </MascotCharacter>
    </svg>
  );
}

/**
 * One character, and the only thing that decides what it does.
 *
 * The three poses are mutually exclusive and ordered, so this reads as the
 * state machine it is rather than as three animations racing each other.
 */
function MascotCharacter({
  index,
  cx,
  cursorX,
  cursorY,
  bending,
  ducking,
  peeking,
  hop,
  reduced,
  eyes,
  mouth,
  children,
}: {
  index: number;
  /** Centre of the feet: the pivot everything turns around. */
  cx: number;
  cursorX: MotionValue<number>;
  cursorY: MotionValue<number>;
  bending: boolean;
  /** This one bows: the character standing nearest the password box. */
  ducking: boolean;
  /** All of them look away while a password is being typed. */
  peeking: boolean;
  hop: number;
  reduced: boolean;
  eyes: {
    cy: number;
    gap: number;
    tone: string;
    ball?: { sclera: string; pupil: string };
  };
  mouth?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hopControls = useAnimationControls();

  // Which way to lean: whichever side of the feet the cursor is on, decided
  // once when the bend begins rather than re-read every frame. A bend that
  // kept re-aiming would jitter instead of committing to the lean — and
  // reading the cursor during render would be reading a moving value at a
  // moment React does not promise anything about.
  const [bendDir, setBendDir] = useState(1);
  useEffect(() => {
    if (bending) setBendDir(cursorX.get() >= cx ? 1 : -1);
  }, [bending, cursorX, cx]);

  const pose = ducking ? "duck" : bending ? "bend" : "idle";

  // The hop, on its own group so it runs underneath whatever pose is current.
  useEffect(() => {
    if (reduced || hop === 0) return;
    let cancelled = false;
    const run = async () => {
      // Each character leaves the ground at its own moment and lands at its
      // own. Synchronised, this would be one animation with four copies.
      await new Promise((r) => setTimeout(r, index * 78));
      if (cancelled) return;
      await hopControls.start({
        y: [0, -18 - index * 2, 0],
        rotate: [0, index % 2 ? 5 : -5, 0],
        transition: { duration: 0.52 + index * 0.04, ease: [0.3, 0, 0.2, 1] },
      });
      if (cancelled) return;
      // Landing: the squash, then the spring back. This is the part that sells
      // the weight — a hop without it is a shape sliding up and down.
      //
      // Two separate animations rather than one three-keyframe pass, because a
      // spring only interpolates between two values; [1, 0.86, 1] with a
      // spring is the error "Only two keyframes currently supported". The
      // squash is a quick tween in, and the recovery is the spring, which is
      // the half that wanted to be springy anyway.
      await hopControls.start({
        scaleY: 0.86,
        scaleX: 1.1,
        transition: { duration: 0.09, ease: "easeOut" },
      });
      if (cancelled) return;
      await hopControls.start({
        scaleY: 1,
        scaleX: 1,
        transition: { type: "spring", stiffness: 420, damping: 11 },
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [hop, index, hopControls, reduced]);

  const anchored = {
    transformBox: "fill-box" as const,
    transformOrigin: "50% 100%" as const,
  };

  return (
    // 1. entrance
    <motion.g
      initial={reduced ? false : { opacity: 0, y: 52, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0 }
          : { delay: 0.12 + index * 0.12, type: "spring", stiffness: 170, damping: 12 }
      }
      style={anchored}
    >
      {/* 2. the hop, underneath the pose */}
      <motion.g animate={hopControls} style={anchored}>
        {/* 3. the pose itself */}
        <motion.g
          initial={false}
          animate={pose}
          variants={{
            idle: { skewX: 0, rotate: 0, scaleX: 1, scaleY: 1, y: 0 },
            bend: {
              skewX: -bendDir * 19,
              rotate: bendDir * 5,
              scaleX: 1.05,
              scaleY: 0.95,
              y: 0,
            },
            // No rotate and no downward shift: both move the base, and this one
            // stands on a drawn ground line — a corner dipping below it is the
            // one thing that gives the whole illustration away. The squash and
            // the lean do the bowing, and the feet never leave the line.
            duck: { skewX: 6, rotate: 0, scaleX: 1.08, scaleY: 0.86, y: 0 },
          }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 150, damping: 12, mass: 0.9 }
          }
          style={anchored}
        >
          {children}
          <Eyes
            cx={cx}
            cy={eyes.cy}
            gap={eyes.gap}
            tone={eyes.tone}
            ball={eyes.ball}
            seed={index}
            cursorX={cursorX}
            cursorY={cursorY}
            peeking={peeking}
            reduced={reduced}
          />
          {mouth}
        </motion.g>
      </motion.g>
    </motion.g>
  );
}

/**
 * One pair of eyes, aimed at the cursor.
 *
 * This is the idle behaviour, and it never stops: whatever pose the body is
 * in, the pupils follow the cursor across the whole page. The offset is
 * normalised and clamped, so a cursor at the far edge of the screen and one
 * just off the shoulder both give a full look rather than a pupil sliding out
 * of its eye.
 */
function Eyes({
  cx,
  cy,
  gap,
  tone,
  ball,
  cursorX,
  cursorY,
  peeking,
  reduced,
  seed,
}: {
  cx: number;
  cy: number;
  gap: number;
  /** The dot, and the closed arc: whatever shows against this body. */
  tone: string;
  /** Given, the eye is a white with a dark pupil inside rather than one dot. */
  ball?: { sclera: string; pupil: string };
  cursorX: MotionValue<number>;
  cursorY: MotionValue<number>;
  /** A password is being typed. Eyes shut — but see the sneaked look below. */
  peeking: boolean;
  reduced: boolean;
  /** The character's index, so four sets of eyes never sneak in unison. */
  seed: number;
}) {
  const R = ball ? 5.4 : 4.4;
  const PUPIL_R = 2.7;
  // A pupil inside a white has less room to travel than a dot drawn straight
  // on the body, or it would slide out through the side of its own eye.
  const REACH = ball ? 2.2 : 3.6;
  const PEEK = { x: 2.5, y: 1.2 };
  const SCAN = 1.4;

  /*
   * One eye, opened for a moment, and shut again.
   *
   * Eyes politely closed for the whole time a password is typed is a pose;
   * a character who cannot quite resist checking is a character. So every
   * couple of seconds one eye — not both, and not the same one each time —
   * opens for about half a second. The period is offset by the character's
   * index, so the four of them never sneak a look together, which would read
   * as the illustration blinking rather than as four separate small decisions.
   */
  const [sneak, setSneak] = useState<number | null>(null);
  useEffect(() => {
    if (!peeking || reduced) {
      setSneak(null);
      return;
    }
    let shut: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      setSneak(Math.random() < 0.5 ? 0 : 1);
      shut = setTimeout(() => setSneak(null), 620);
    };
    const id = setInterval(open, 2400 + seed * 520);
    return () => {
      clearInterval(id);
      if (shut) clearTimeout(shut);
    };
  }, [peeking, reduced, seed]);

  /** Is this particular eye shut right now? */
  const shutFor = (i: number) => peeking && sneak !== i;

  // 0 while watching, 1 while peeking. Drives where the pupil sits, so the eye
  // that sneaks open is already looking away rather than straight at the field.
  const peek = useSpring(peeking ? 1 : 0, { stiffness: 140, damping: 14 });
  useEffect(() => {
    peek.set(peeking ? 1 : 0);
  }, [peeking, peek]);

  const scan = useMotionValue(0);
  useEffect(() => {
    if (!peeking || reduced) {
      scan.set(0);
      return;
    }
    const loop = animate(scan, [-1, 1, -1], {
      duration: 2.6,
      repeat: Infinity,
      ease: "easeInOut",
    });
    return () => loop.stop();
  }, [peeking, reduced, scan]);

  const jitterX = useMotionValue(0);
  const jitterY = useMotionValue(0);
  useEffect(() => {
    if (!peeking || reduced) {
      jitterX.set(0);
      jitterY.set(0);
      return;
    }
    const onKey = () => {
      jitterX.set((Math.random() - 0.5) * 1.6);
      jitterY.set((Math.random() - 0.5) * 1.2);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [peeking, reduced, jitterX, jitterY]);

  const rawX = useTransform(
    [cursorX, cursorY, peek, jitterX, scan],
    ([x, y, p, j, sc]: number[]) => {
      if (reduced) return 0;
      const dx = x - cx;
      const dy = y - cy;
      const track = (dx / (Math.hypot(dx, dy) || 1)) * REACH;
      return track * (1 - p) + (PEEK.x + sc * SCAN + j) * p;
    }
  );
  const rawY = useTransform(
    [cursorX, cursorY, peek, jitterY],
    ([x, y, p, j]: number[]) => {
      if (reduced) return 0;
      const dx = x - cx;
      const dy = y - cy;
      const track = (dy / (Math.hypot(dx, dy) || 1)) * REACH;
      return track * (1 - p) + (PEEK.y + j) * p;
    }
  );

  const px = useSpring(rawX, { stiffness: 260, damping: 20 });
  const py = useSpring(rawY, { stiffness: 260, damping: 20 });

  const xs = [cx - gap / 2, cx + gap / 2];
  const lid = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 140, damping: 14 };

  return (
    <g>
      {xs.map((x, i) => {
        const shut = shutFor(i);
        return (
          <g key={i}>
            {ball ? (
              <>
                {/* The white, which stays put — an eye does not slide around
                    the face; the pupil inside it does. */}
                <motion.circle
                  cx={x}
                  cy={cy}
                  r={R}
                  fill={ball.sclera}
                  animate={{ opacity: shut ? 0 : 1 }}
                  transition={lid}
                />
                <motion.circle
                  cx={x}
                  cy={cy}
                  r={PUPIL_R}
                  fill={ball.pupil}
                  style={{ x: px, y: py }}
                  animate={{ opacity: shut ? 0 : 1 }}
                  transition={lid}
                />
              </>
            ) : (
              <motion.circle
                cx={x}
                cy={cy}
                r={R}
                fill={tone}
                style={{ x: px, y: py }}
                animate={{ opacity: shut ? 0 : 1 }}
                transition={lid}
              />
            )}

            {/* Shut: an arc bowing downward, which is how a closed eye is
                drawn. Same colour, same place, so it reads as a blink. */}
            <motion.path
              d={`M ${x - R - 0.6} ${cy} q ${R + 0.6} 5 ${(R + 0.6) * 2} 0`}
              fill="none"
              stroke={tone}
              strokeWidth={2.5}
              strokeLinecap="round"
              initial={false}
              animate={{ opacity: shut ? 1 : 0 }}
              transition={lid}
            />
          </g>
        );
      })}
    </g>
  );
}
