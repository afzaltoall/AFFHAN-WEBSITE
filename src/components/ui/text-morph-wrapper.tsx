"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const FramerTextMorph = dynamic(
  () => import("./text-morph-client").then((mod) => mod.TextMorph),
  { ssr: false }
);

export type TextMorphProps = {
  words?: string[];
  interval?: number;
  className?: string;
  charClassName?: string;
};

const defaultWords = ["engineer", "developer", "designer"];

export function TextMorph({
  words = defaultWords,
  interval = 2500,
  className,
  charClassName,
}: TextMorphProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Exact same static DOM shape as what TextMorph will render for index 0,
    // so there's no layout shift while Framer Motion loads in the background.
    const chars = Array.from(words[0] ?? "");
    return (
      <span className={`inline-flex gap-[0.5px] overflow-hidden ${className ?? ""}`}>
        {chars.map((char, i) => (
          <span key={i} className={charClassName}>
            {char}
          </span>
        ))}
      </span>
    );
  }

  return (
    <FramerTextMorph
      words={words}
      interval={interval}
      className={className}
      charClassName={charClassName}
    />
  );
}

export default TextMorph;
