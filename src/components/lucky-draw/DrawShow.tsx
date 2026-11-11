"use client";

import { useEffect, useState } from "react";
import type { DrawMode } from "@/lib/lucky-draw-shared";
import { DrawScreen } from "./DrawScreen";
import { DrawWall } from "./wall/DrawWall";

/**
 * Which lucky draw screen the TV shows: the wall (./wall/DrawWall.tsx, drawn in 3D) wherever the browser draws WebGL
 * on a graphics chip; otherwise the list (./DrawScreen.tsx), which never needs one. The wall gives way to the list on
 * its own if it can't start, draws too slowly in its first seconds, or loses its WebGL (onFail), so the room is never
 * left with a stuck screen. Before anyone presses, both show the same draw from the same server.
 *
 * `?engine=list` asks for the list, `?engine=wall` for the wall even where it would not be chosen (checks, and a
 * screen the team has tried): the owner's way out if the wall ever looks wrong on the day.
 */
function wallFits(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const c = document.createElement("canvas");
    // No context where WebGL would run in software (SwiftShader): too slow for the wall.
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

export function DrawShow({ mode, closes }: { mode: DrawMode | null; closes: string }) {
  const [engine, setEngine] = useState<"wall" | "list" | null>(null);
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("engine");
    setForced(ask === "wall");
    setEngine(ask === "list" ? "list" : ask === "wall" || wallFits() ? "wall" : "list");
  }, []);
  if (!engine) return <div className="lw-boot" />;
  if (engine === "list") return <DrawScreen mode={mode} closes={closes} />;
  return <DrawWall mode={mode} closes={closes} keep={forced} onFail={() => setEngine("list")} />;
}
