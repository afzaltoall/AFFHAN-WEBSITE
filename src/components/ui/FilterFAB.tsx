"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FilterFABProps {
  isOpen: boolean;
  onClick: () => void;
}

export function FilterFAB({ isOpen, onClick }: FilterFABProps) {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const handleTouchStart = () => {
      setIsTouchDevice(true);
      window.removeEventListener("touchstart", handleTouchStart);
    };
    window.addEventListener("touchstart", handleTouchStart);
    return () => window.removeEventListener("touchstart", handleTouchStart);
  }, []);

  return (
    <div className="fixed bottom-6 right-[20px] z-40 lg:hidden">
      {/* Self-contained CSS styles for advanced GPU-accelerated premium effects */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes border-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes pulse-ring-one {
            0% { transform: scale(0.9); opacity: 0.9; }
            50% { transform: scale(1.15); opacity: 0.4; }
            100% { transform: scale(1.4); opacity: 0; }
          }
          @keyframes pulse-ring-two {
            0% { transform: scale(0.85); opacity: 0.7; }
            50% { transform: scale(1.25); opacity: 0.3; }
            100% { transform: scale(1.65); opacity: 0; }
          }
          @keyframes gentle-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          .animate-border-spin {
            animation: border-spin 3s linear infinite;
          }
          .animate-pulse-ring-one {
            animation: pulse-ring-one 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
          }
          .animate-pulse-ring-two {
            animation: pulse-ring-two 3.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite;
          }
          .fab-float-container {
            animation: gentle-float 3.5s ease-in-out infinite;
          }
          .fab-glow-shadow {
            box-shadow: 
              0 15px 35px rgba(39, 168, 196, 0.35),
              0 5px 15px rgba(23, 101, 121, 0.2),
              inset 0 2px 4px rgba(255, 255, 255, 0.4),
              inset 0 -2px 4px rgba(0, 0, 0, 0.2);
          }
        `
      }} />

      {/* Pulse rings acting as sonar waves in background */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="absolute h-14 w-14 rounded-full border border-[#27a8c4]/30 bg-[#27a8c4]/5 animate-pulse-ring-one" />
        <div className="absolute h-14 w-14 rounded-full border border-[#176579]/20 bg-[#176579]/5 animate-pulse-ring-two" />
      </div>

      {/* Outer spinning gradient border track */}
      <div className="absolute -inset-[3px] rounded-full overflow-hidden pointer-events-none opacity-80">
        <div className="absolute inset-0 bg-gradient-to-r from-[#27a8c4] via-transparent to-[#176579] rounded-full animate-border-spin" style={{ margin: '1px' }} />
        <div className="absolute inset-[2px] bg-[#f9fafb] rounded-full" />
      </div>

      {/* Main Interactive Button Container with float animation */}
      <div className="fab-float-container relative">
        <motion.button
          onClick={onClick}
          // Dynamic Framer Motion variables to avoid mobile sticking
          whileHover={isTouchDevice ? {} : { 
            scale: 1.12, 
            boxShadow: "0 20px 40px rgba(39, 168, 196, 0.5)" 
          }}
          whileTap={{ 
            scale: 0.88, 
            rotate: isOpen ? -45 : 15,
            transition: { type: "spring", stiffness: 450, damping: 12 }
          }}
          transition={{ type: "spring", stiffness: 350, damping: 16 }}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#176579] via-[#228fa6] to-[#3cd5f7] text-white fab-glow-shadow border border-white/20 cursor-pointer overflow-hidden outline-none select-none"
          aria-label={isOpen ? "Close filter categories" : "Open filter categories"}
        >
          {/* Internal liquid overlay effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
          
          {/* Icon Switcher */}
          <AnimatePresence mode="wait">
            {isOpen ? (
              // Close state
              <motion.div
                key="close-icon"
                initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="flex items-center justify-center"
              >
                <svg className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.div>
            ) : (
              // Filter funnel state with falling particles
              <motion.div
                key="filter-icon"
                initial={{ opacity: 0, rotate: 90, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: -90, scale: 0.7 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="relative h-10 w-10 flex items-center justify-center"
              >
                <svg className="h-10 w-10 text-white" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    {/* Glowing filter particle drop-shadow */}
                    <filter id="particle-glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    
                    {/* Paths for the particles to travel through the funnel */}
                    <path id="path-left" d="M 13,10 Q 17,16 20,20 L 20,32" />
                    <path id="path-right" d="M 27,10 Q 23,16 20,20 L 20,32" />
                    <path id="path-center" d="M 20,8 L 20,32" />
                  </defs>

                  {/* Funnel Silhouette Border */}
                  <path
                    d="M 9,9 C 9,8.45 9.45,8 10,8 H 30 C 30.55,8 31,8.45 31,9 V 12.5 C 31,12.8 30.88,13.1 30.65,13.3 L 23,20 V 30 L 17,33 V 20 L 9.35,13.3 C 9.12,13.1 9,12.8 9,12.5 Z"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
                  />

                  {/* Flowing filter particles animating along paths */}
                  {/* Left Path Particle */}
                  <circle r="1.5" fill="#5ce1e6" filter="url(#particle-glow)">
                    <animateMotion
                      dur="2.4s"
                      repeatCount="indefinite"
                      path="M 13,10 Q 17,16 20,20 L 20,32"
                      calcMode="spline"
                      keyTimes="0; 0.5; 1"
                      keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 1; 0"
                      keyTimes="0; 0.2; 0.85; 1"
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* Right Path Particle (offset timing) */}
                  <circle r="1.5" fill="#3cd5f7" filter="url(#particle-glow)">
                    <animateMotion
                      dur="2.8s"
                      begin="0.9s"
                      repeatCount="indefinite"
                      path="M 27,10 Q 23,16 20,20 L 20,32"
                      calcMode="spline"
                      keyTimes="0; 0.5; 1"
                      keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 1; 0"
                      keyTimes="0; 0.2; 0.85; 1"
                      dur="2.8s"
                      begin="0.9s"
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* Center Path Particle (faster, standard timing) */}
                  <circle r="1.2" fill="#ffffff" filter="url(#particle-glow)">
                    <animateMotion
                      dur="1.8s"
                      begin="0.4s"
                      repeatCount="indefinite"
                      path="M 20,8 L 20,32"
                      calcMode="spline"
                      keyTimes="0; 0.4; 1"
                      keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 1; 0"
                      keyTimes="0; 0.25; 0.85; 1"
                      dur="1.8s"
                      begin="0.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
