"use client";

import { useState } from "react";
import type { DrawMode } from "@/lib/lucky-draw-shared";
import { DrawWall } from "./wall/DrawWall";

/**
 * The lucky draw on the television: the wall, and only the wall (./wall/DrawWall.tsx; the owner, 2026-11-23, over the
 * first screen, the list: "this old ui is showing sometimes remove this from this project"). The list came up instead
 * whenever this browser looked unfit for the wall: no WebGL on a graphics chip, reduced motion, or the wall's first
 * seconds drawn slowly, as a TV tab opened behind the console's always are. It is gone from the project, kept only as
 * tag backup/lucky-draw-v1.
 *
 * If the wall loses its WebGL (the graphics chip was reset), it starts again from the draw as the server has it: a draw
 * already made is in its seat. More than three losses in a minute, or a browser that can't draw WebGL at all, and the
 * screen says what to turn on, and shows nothing else.
 */
const RESTARTS = 3;
const RESTART_WINDOW_MS = 60_000;

export function DrawShow({ mode, closes }: { mode: DrawMode | null; closes: string }) {
  const [run, setRun] = useState(0);
  const [losses, setLosses] = useState<number[]>([]);
  const [noWebgl, setNoWebgl] = useState(false);
  if (noWebgl) return <NoWebgl />;
  return (
    <DrawWall
      key={run}
      mode={mode}
      closes={closes}
      onFail={(why) => {
        if (why === "webgl") {
          setNoWebgl(true);
          return;
        }
        const now = Date.now();
        const recent = [...losses.filter((t) => now - t < RESTART_WINDOW_MS), now];
        setLosses(recent);
        if (recent.length > RESTARTS) setNoWebgl(true);
        else setRun((n) => n + 1);
      }}
    />
  );
}

/** No WebGL: what to turn on, on the wall's own ground. */
function NoWebgl() {
  return (
    <div className="lw-nogl" role="alert">
      <p className="lw-nogl-brand">AFFHAN</p>
      <h1>This browser can&apos;t show the lucky draw screen</h1>
      <p>
        Turn on “Use graphics acceleration when available” in the browser&apos;s settings (under System), restart the browser,
        then open the screen again from the console.
      </p>
      <button type="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  );
}
