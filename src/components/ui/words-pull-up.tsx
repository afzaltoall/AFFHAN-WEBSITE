"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

interface WordsPullUpProps {
  text: string;
  className?: string;
  showAsterisk?: boolean;
}

export function WordsPullUp({ text, className, showAsterisk }: WordsPullUpProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const words = text.split(" ");

  return (
    <h1 ref={ref} className={cn("relative inline-flex flex-wrap", className)}>
      {words.map((word, i) => {
        const isLastWord = i === words.length - 1;
        return (
          <motion.span
            key={i}
            className="inline-block mr-[0.25em]"
            initial={{ y: 20, opacity: 0 }}
            animate={isInView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
            transition={{
              delay: i * 0.08,
              duration: 0.8,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {word}
            {isLastWord && showAsterisk && (
              <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em]">
                *
              </span>
            )}
          </motion.span>
        );
      })}
    </h1>
  );
}

export interface TextSegment {
  text: string;
  className?: string;
}

interface WordsPullUpMultiStyleProps {
  segments: TextSegment[];
  className?: string;
}

export function WordsPullUpMultiStyle({ segments, className }: WordsPullUpMultiStyleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  let wordIndex = 0;

  return (
    <div ref={ref} className={cn("relative inline-flex flex-wrap", className)}>
      {segments.map((segment, segIdx) => {
        const words = segment.text.split(" ");
        return (
          <span key={segIdx} className={cn("inline-flex flex-wrap", segment.className)}>
            {words.map((word, wIdx) => {
              const currentDelay = wordIndex * 0.08;
              wordIndex++;
              return (
                <motion.span
                  key={wIdx}
                  className="inline-block mr-[0.25em]"
                  initial={{ y: 20, opacity: 0 }}
                  animate={isInView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
                  transition={{
                    delay: currentDelay,
                    duration: 0.8,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {word}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}
