"use client";

import { useState, useSyncExternalStore } from "react";

const noChanges = () => () => {};

/**
 * A script that must run before the first paint (the console's theme: admin-dark.css), drawn only into the server's
 * HTML. A browser runs a script as it reads the page; one React makes later, on a move inside the site, is never run,
 * and in development React says so: "Encountered a script tag while rendering React component" (the owner's localhost,
 * 2026-11-22, on a move into the console from a page outside it). So it is drawn on the server and kept through
 * hydration, when useSyncExternalStore reads the server's answer; on a move it is not made at all. The frame sets the
 * theme itself on a move, as it always has (AdminFrame).
 */
export function FirstPaintScript({ code }: { code: string }) {
  const fromServer = useSyncExternalStore(noChanges, () => false, () => true);
  const [drawn] = useState(fromServer);
  return drawn ? <script dangerouslySetInnerHTML={{ __html: code }} /> : null;
}

export default FirstPaintScript;
