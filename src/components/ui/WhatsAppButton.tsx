"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function WhatsAppButton() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);



  useEffect(() => {
    let mainEl: HTMLElement | null = null;
    let scrollableDivs: NodeListOf<Element> | null = null;
    let ticking = false;

    const updateScroll = (e?: Event) => {
      let scrollY = 0;
      if (typeof window !== "undefined") {
        scrollY = window.scrollY;
      }
      
      if (e && e.target) {
        if (e.target === document || e.target === window) {
          const doc = document.documentElement || document.body;
          scrollY = Math.max(scrollY, doc.scrollTop);
        } else if (e.target instanceof HTMLElement) {
          scrollY = Math.max(scrollY, e.target.scrollTop);
        }
      }

      // Cache DOM queries if not already done (avoids doing this 60 times a second)
      if (!mainEl) mainEl = document.querySelector("main");
      if (!scrollableDivs) scrollableDivs = document.querySelectorAll(".overflow-y-auto, .lg\\:overflow-y-auto");

      if (mainEl) {
        scrollY = Math.max(scrollY, mainEl.scrollTop);
      }

      scrollableDivs?.forEach((div) => {
        if (div instanceof HTMLElement) {
          scrollY = Math.max(scrollY, div.scrollTop);
        }
      });

      setIsScrolled(scrollY > 100);
      ticking = false;
    };

    const handleScroll = (e?: Event) => {
      if (!ticking) {
        window.requestAnimationFrame(() => updateScroll(e));
        ticking = true;
      }
    };

    // Use capture phase to catch scroll events from any nested scrollable container
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });

    // Directly attach listener to main element if/when it mounts in DOM
    const attachToMain = () => {
      if (!mainEl) {
        mainEl = document.querySelector("main");
        if (mainEl) {
          mainEl.addEventListener("scroll", handleScroll, { passive: true });
        }
      }
    };

    attachToMain();

    // Check periodically for late hydration / component mount
    const intervalId = setInterval(() => {
      attachToMain();
      if (mainEl) {
        clearInterval(intervalId);
      }
    }, 200);

    // Initial check
    updateScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      document.removeEventListener("scroll", handleScroll, { capture: true });
      if (mainEl) {
        mainEl.removeEventListener("scroll", handleScroll);
      }
      clearInterval(intervalId);
    };
  }, []);

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: "smooth" });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Also scroll any other overflow-y-auto elements (like the categories catalog list)
      const scrollableDivs = document.querySelectorAll(".overflow-y-auto, .lg\\:overflow-y-auto");
      scrollableDivs.forEach((div) => {
        if (div instanceof HTMLElement) {
          div.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
  };

  if (pathname?.includes("experience")) {
    return null;
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 right-[21px] md:right-8 z-50 flex flex-col items-center gap-4 font-sans tracking-tight pointer-events-none">
      {/* Scroll to Top Button */}
      <AnimatePresence>
        {isScrolled && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={scrollToTop}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(14,165,233)] text-white shadow-[rgba(14,165,233,0.3)_0px_4px_14px] hover:bg-[#0284c7] transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer animate-[fadeIn_0.2s_ease]"
            aria-label="Scroll to top"
            style={{
              outline: "none"
            }}
          >
            <ChevronUp size={20} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Instagram Trigger Button Container */}
      <div className="relative flex flex-col items-center pointer-events-auto">
        {/* Action Trigger */}
        <a
          href="https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            // Force-open Instagram in a brand-new tab, never navigating this site away.
            e.preventDefault();
            window.open(
              "https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
              "_blank",
              "noopener,noreferrer"
            );
          }}
          className="pointer-events-auto relative block"
          aria-label="Follow on Instagram"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="transition-transform duration-300 hover:scale-[1.06] active:scale-95"
            style={{
              filter: "drop-shadow(0 14px 26px rgba(62, 169, 235, 0.38)) drop-shadow(0 5px 14px rgba(14, 116, 179, 0.2))",
              width: "54px",
              height: "54px"
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 118 120"
              width="54"
              height="54"
              aria-hidden="true"
              className="w-full h-full"
            >
              <defs>
                <clipPath id="floating-contact-bubble-clip">
                  <path d="M58 6C28.18 6 4 30.18 4 60c0 9.8 2.6 19 7.14 26.9L6 114l27.6-7.24A54.1 54.1 0 0 0 58 114c29.82 0 54-24.18 54-54S87.82 6 58 6z" />
                </clipPath>

                <clipPath id="floating-contact-sphere-clip">
                  <circle cx="58" cy="58" r="40" />
                </clipPath>

                <radialGradient id="floating-contact-halo" cx="50%" cy="46%" r="64%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
                  <stop offset="72%" stopColor="#eef9ff" stopOpacity="0.82" />
                  <stop offset="100%" stopColor="#d9f0fb" stopOpacity="0.15" />
                </radialGradient>

                <linearGradient id="floating-contact-body" x1="0.5" y1="0" x2="0.5" y2="1">
                  <stop offset="0%" stopColor="#95d0fb" />
                  <stop offset="100%" stopColor="#44a6f2" />
                </linearGradient>

                <linearGradient id="floating-contact-rim" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#e8f8ff" />
                  <stop offset="100%" stopColor="#a6daf8" />
                </linearGradient>

                <linearGradient id="floating-contact-water-band" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>

                <radialGradient id="floating-contact-rim-highlight" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>

                <filter id="floating-contact-blur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.4" />
                </filter>

                <radialGradient id="anim-droplet-gradient" cx="35%" cy="30%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                  <stop offset="30%" stopColor="#e0f2fe" stopOpacity="0.3" />
                  <stop offset="70%" stopColor="#bae6fd" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.8" />
                </radialGradient>
              </defs>

              {/* Halo soft background shadow */}
              <path
                d="M58 6C28.18 6 4 30.18 4 60c0 9.8 2.6 19 7.14 26.9L6 114l27.6-7.24A54.1 54.1 0 0 0 58 114c29.82 0 54-24.18 54-54S87.82 6 58 6z"
                fill="url(#floating-contact-halo)"
                filter="url(#floating-contact-blur)"
                transform="scale(1.045) translate(-2.7, -2.7)"
              />

              {/* White speech bubble background rim */}
              <path
                d="M58 6C28.18 6 4 30.18 4 60c0 9.8 2.6 19 7.14 26.9L6 114l27.6-7.24A54.1 54.1 0 0 0 58 114c29.82 0 54-24.18 54-54S87.82 6 58 6z"
                fill="#ffffff"
                stroke="url(#floating-contact-rim)"
                strokeWidth="2.1"
                strokeLinejoin="round"
              />

              {/* Blue sphere body (background waves removed) */}
              <circle cx="58" cy="58" r="40" fill="url(#floating-contact-body)" />

              {/* White Instagram camera glyph (was the phone receiver) */}
              <path
                fill="#FFFFFF"
                transform="translate(58, 58) scale(1.9) translate(-12, -12)"
                d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"
              />

              {/* Glass Sheen / reflection ellipse */}
              <ellipse
                className="floating-contact-sheen"
                cx="44"
                cy="30"
                rx="30"
                ry="18"
                fill="url(#floating-contact-rim-highlight)"
                transform="rotate(-24 44 30)"
              />

              {/* Extra white semi-transparent highlight rim */}
              <path
                d="M58 6C28.18 6 4 30.18 4 60c0 9.8 2.6 19 7.14 26.9L6 114l27.6-7.24A54.1 54.1 0 0 0 58 114c29.82 0 54-24.18 54-54S87.82 6 58 6z"
                fill="none"
                stroke="rgba(255,255,255,0.78)"
                strokeWidth="2.1"
                strokeLinejoin="round"
              />

              {/* Professional Animated Water Droplets (3 Staggered Loops) */}
              {/* Droplet 1: Right-side main slide (condenses, slides down right circle edge, falls straight down) */}
              <g>
                <animateMotion
                  path="M 85,13.3 A 54,54 0 0,1 112,60 A 54,54 0 0,1 85,106.8 L 85,145"
                  dur="6s"
                  begin="0s"
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="spline"
                  keyTimes="0; 0.15; 0.75; 0.85; 1"
                  keyPoints="0; 0; 0.75; 1; 1"
                  keySplines="0 0 1 1; 0.4 0 0.2 1; 0.5 0 0.8 1; 0 0 1 1"
                />
                <g>
                  <animate
                    attributeName="opacity"
                    values="0; 0.95; 0.95; 0; 0; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 0.85; 1"
                    dur="6s"
                    begin="0s"
                    repeatCount="indefinite"
                  />
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    values="0; 1; 1; 0.7 1.4; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 1"
                    dur="6s"
                    begin="0s"
                    repeatCount="indefinite"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="rgba(3, 105, 161, 0.35)"
                    filter="url(#floating-contact-blur)"
                    transform="translate(0.5, 1.2)"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="url(#anim-droplet-gradient)"
                    stroke="rgba(14,165,233,0.72)"
                    strokeWidth="0.6"
                  />
                  <ellipse cx="2" cy="-1.5" rx="0.8" ry="1.2" fill="#ffffff" transform="rotate(-30 2 -1.5)" />
                  <ellipse cx="-1.5" cy="1.5" rx="1.2" ry="1.8" fill="#ffffff" fillOpacity="0.45" transform="rotate(-30 -1.5 1.5)" />
                </g>
              </g>

              {/* Droplet 2: Left-side tail slide (condenses, slides down left circle edge, flows onto the tail, falls straight down from tail tip) */}
              <g>
                <animateMotion
                  path="M 31,13.3 A 54,54 0 0,0 4,60 A 54,54 0 0,0 11.14,86.9 L 6,114 L 6,145"
                  dur="6s"
                  begin="2s"
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="spline"
                  keyTimes="0; 0.15; 0.75; 0.85; 1"
                  keyPoints="0; 0; 0.78; 1; 1"
                  keySplines="0 0 1 1; 0.4 0 0.2 1; 0.5 0 0.8 1; 0 0 1 1"
                />
                <g>
                  <animate
                    attributeName="opacity"
                    values="0; 0.95; 0.95; 0; 0; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 0.85; 1"
                    dur="6s"
                    begin="2s"
                    repeatCount="indefinite"
                  />
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    values="0; 0.85; 0.85; 0.6 1.2; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 1"
                    dur="6s"
                    begin="2s"
                    repeatCount="indefinite"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="rgba(3, 105, 161, 0.35)"
                    filter="url(#floating-contact-blur)"
                    transform="translate(0.5, 1.2)"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="url(#anim-droplet-gradient)"
                    stroke="rgba(14,165,233,0.72)"
                    strokeWidth="0.6"
                  />
                  <ellipse cx="2" cy="-1.5" rx="0.8" ry="1.2" fill="#ffffff" transform="rotate(-30 2 -1.5)" />
                  <ellipse cx="-1.5" cy="1.5" rx="1.2" ry="1.8" fill="#ffffff" fillOpacity="0.45" transform="rotate(-30 -1.5 1.5)" />
                </g>
              </g>

              {/* Droplet 3: Top-right secondary slide (shorter path, smaller bead, starts with a delay) */}
              <g>
                <animateMotion
                  path="M 70,7 A 54,54 0 0,1 112,60 A 54,54 0 0,1 96,82 L 96,145"
                  dur="6s"
                  begin="4s"
                  repeatCount="indefinite"
                  rotate="auto"
                  calcMode="spline"
                  keyTimes="0; 0.15; 0.75; 0.85; 1"
                  keyPoints="0; 0; 0.50; 1; 1"
                  keySplines="0 0 1 1; 0.4 0 0.2 1; 0.5 0 0.8 1; 0 0 1 1"
                />
                <g>
                  <animate
                    attributeName="opacity"
                    values="0; 0.95; 0.95; 0; 0; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 0.85; 1"
                    dur="6s"
                    begin="4s"
                    repeatCount="indefinite"
                  />
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    values="0; 0.75; 0.75; 0.5 1.1; 0"
                    keyTimes="0; 0.15; 0.75; 0.83; 1"
                    dur="6s"
                    begin="4s"
                    repeatCount="indefinite"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="rgba(3, 105, 161, 0.35)"
                    filter="url(#floating-contact-blur)"
                    transform="translate(0.5, 1.2)"
                  />
                  <path
                    d="M 5,0 C 5,2.5 3.5,4.5 1,4.5 L -5,0.5 C -5.5,0.2 -5.5,-0.2 -5, -0.5 L 1,-4.5 C 3.5,-4.5 5,-2.5 5,0 Z"
                    fill="url(#anim-droplet-gradient)"
                    stroke="rgba(14,165,233,0.72)"
                    strokeWidth="0.6"
                  />
                  <ellipse cx="2" cy="-1.5" rx="0.8" ry="1.2" fill="#ffffff" transform="rotate(-30 2 -1.5)" />
                  <ellipse cx="-1.5" cy="1.5" rx="1.2" ry="1.8" fill="#ffffff" fillOpacity="0.45" transform="rotate(-30 -1.5 1.5)" />
                </g>
              </g>
            </svg>
          </motion.div>
        </a>
      </div>
    </div>
  );
}
