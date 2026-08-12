"use client";

import { motion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { getCdnUrl } from "@/lib/cdn";

interface ScrollChoreographyProps {
  className?: string;
  images: {
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
  };
  // Optional product thumbnails that "spill" outward from the centre as the
  // hero word zooms in (see ScatterItem). Decorative — safe to omit.
  scatter?: string[];
}

// Fixed spread targets (vw/vh from centre) + a little rotation, so the burst
// looks organic rather than symmetric. Indexed by scatter position.
const SCATTER_POS = [
  // Left side (4 active items: 0, 8, 2, 4) - evenly spaced
  { x: -32, y: -30, r: -14 }, // 0: Top left
  // Right side (5 potential items: 1, 3, 5, 7, 9) - evenly spaced
  { x: 32, y: -32, r: 12 },   // 1: Top right
  { x: -46, y: 10, r: -8 },   // 2: Mid-bottom left
  { x: 44, y: -16, r: 10 },   // 3: Mid-top right
  { x: -32, y: 30, r: -16 },  // 4: Bottom left
  { x: 48, y: 0, r: 14 },     // 5: Center right
  { x: -20, y: -60, r: -7 },  // 6: Empty / Hidden
  { x: 44, y: 16, r: 9 },     // 7: Mid-bottom right
  { x: -46, y: -10, r: -11 }, // 8: Mid-top left
  { x: 32, y: 32, r: 11 },    // 9: Bottom right
];

// A single product thumbnail that bursts from the centre outward to its scatter
// target as you scroll into the zoom phase, then fades before the hero goes
// full-bleed. Each item owns its own transforms so the parent's hook order is
// stable regardless of how many thumbnails are supplied.
function ScatterItem({
  progress,
  pos,
  img,
}: {
  progress: MotionValue<number>;
  pos: { x: number; y: number; r: number };
  img: string;
}) {
  const opacity = useTransform(progress, [0.5, 0.62, 0.82, 0.9], [0, 1, 1, 0]);
  const x = useTransform(progress, [0.5, 0.8], ["0vw", `${pos.x}vw`]);
  const y = useTransform(progress, [0.5, 0.8], ["0vh", `${pos.y}vh`]);
  const scale = useTransform(progress, [0.5, 0.68, 0.85], [0.35, 1, 1.06]);
  const rotate = useTransform(progress, [0.5, 0.8], [0, pos.r]);
  return (
    <motion.div
      style={{ x, y, scale, rotate, opacity }}
      className="absolute left-1/2 top-1/2 h-[8.5vw] w-[8.5vw] max-h-[150px] max-w-[150px] -translate-x-1/2 -translate-y-1/2 overflow-visible drop-shadow-2xl will-change-transform"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getCdnUrl(img) as string} alt="" className="h-full w-full object-contain" />
    </motion.div>
  );
}

export function ScrollChoreography({ className, images, scatter }: ScrollChoreographyProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 400,
    damping: 50,
    mass: 1.2,
    restDelta: 0.001,
  });

  const xLeft = "-20vw";
  const xRight = "20vw";
  const yTop = "-14vh";
  const yBottom = "14vh";

  const tlX = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [xLeft, xLeft, xLeft, "0vw", "0vw"]);
  const tlY = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [yTop, yBottom, yBottom, "0vh", "0vh"]);

  const brX = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [xRight, xRight, xRight, "0vw", "0vw"]);
  const brY = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [yBottom, yTop, yTop, "0vh", "0vh"]);

  const blX = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [xLeft, xLeft, xLeft, "0vw", "0vw"]);
  const blY = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [yBottom, yBottom, yBottom, "0vh", "0vh"]);

  const trX = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [xRight, xRight, xRight, "0vw", "0vw"]);
  const trY = useTransform(smoothProgress, [0, 0.3, 0.35, 0.65, 1], [yTop, yTop, yTop, "0vh", "0vh"]);

  const heroWidth = useTransform(smoothProgress, [0.65, 0.7, 0.9, 1], ["36vw", "36vw", "100vw", "100vw"]);
  const heroHeight = useTransform(smoothProgress, [0.65, 0.7, 0.9, 1], ["24vh", "24vh", "100vh", "100vh"]);

  const underImagesOpacity = useTransform(smoothProgress, [0.75, 0.85], [1, 0]);

  const baseImageClasses =
    "absolute left-1/2 top-1/2 w-[36vw] h-[24vh] overflow-hidden -translate-x-1/2 -translate-y-1/2 bg-muted shadow-2xl will-change-transform rounded-2xl";

  const scatterImages = (scatter ?? []).slice(0, SCATTER_POS.length);

  return (
    <div ref={containerRef} className={cn("relative h-[300vh] w-full", className)}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div style={{ x: tlX, y: tlY, opacity: underImagesOpacity }} className={cn(baseImageClasses, "z-10")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.topLeft} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-110 cursor-pointer" />
          </motion.div>

          <motion.div style={{ x: brX, y: brY, opacity: underImagesOpacity }} className={cn(baseImageClasses, "z-20")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.bottomRight} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-110 cursor-pointer" />
          </motion.div>

          <motion.div style={{ x: blX, y: blY, opacity: underImagesOpacity }} className={cn(baseImageClasses, "z-30")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.bottomLeft} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-110 cursor-pointer" />
          </motion.div>

          <motion.div
            style={{ x: trX, y: trY, width: heroWidth, height: heroHeight }}
            className={cn(baseImageClasses, "z-40 origin-center")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images.topRight} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-110 cursor-pointer" />
          </motion.div>
        </div>

        {/* Product spill — thumbnails burst outward as the hero word zooms. */}
        {scatterImages.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[45]">
            {scatterImages.map((img, i) => (
              img ? <ScatterItem key={`${i}-${img}`} progress={smoothProgress} pos={SCATTER_POS[i]} img={img} /> : null
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScrollChoreography;
