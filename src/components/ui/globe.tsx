"use client";

import React from "react";

// Individual Flag SVG renderers for perfect rendering in small circles
function FlagCN() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <circle cx="16" cy="16" r="16" fill="#de2910" />
      <polygon points="8,13 10.5,13 11.3,10.5 12.1,13 14.6,13 12.6,14.6 13.3,17.1 11.3,15.5 9.3,17.1 10,14.6" fill="#ffde00" />
      <polygon points="15.5,7.5 16.3,7.5 16.5,6.7 16.7,7.5 17.5,7.5 16.9,8 17.1,8.8 16.5,8.3 15.9,8.8 16.1,8" fill="#ffde00" />
      <polygon points="18.5,10.5 19.3,10.5 19.5,9.7 19.7,10.5 20.5,10.5 19.9,11 20.1,11.8 19.5,11.3 18.9,11.8 19.1,11" fill="#ffde00" />
      <polygon points="18.5,14.5 19.3,14.5 19.5,13.7 19.7,14.5 20.5,14.5 19.9,15 20.1,15.8 19.5,15.3 18.9,15.8 19.1,15" fill="#ffde00" />
      <polygon points="15.5,17.5 16.3,17.5 16.5,16.7 16.7,17.5 17.5,17.5 16.9,18 17.1,18.8 16.5,18.3 15.9,18.8 16.1,18" fill="#ffde00" />
    </svg>
  );
}

function FlagUK() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <circle cx="16" cy="16" r="16" fill="#012169" />
      <path d="M0,0 L32,32 M32,0 L0,32" stroke="#ffffff" strokeWidth="4" />
      <path d="M0,0 L16,16" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M32,0 L16,16" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M32,32 L16,16" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M0,32 L16,16" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M16,0 L16,32 M0,16 L32,16" stroke="#ffffff" strokeWidth="6" />
      <path d="M16,0 L16,32 M0,16 L32,16" stroke="#C8102E" strokeWidth="3.6" strokeLinecap="square" />
    </svg>
  );
}

function FlagIN() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <circle cx="16" cy="16" r="16" fill="#ffffff" />
      <path d="M0,0 L32,0 L32,10.67 L0,10.67 Z" fill="#FF9933" />
      <path d="M0,21.33 L32,21.33 L32,32 L0,32 Z" fill="#138808" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="#000080" strokeWidth="0.8" />
      <circle cx="16" cy="16" r="1" fill="#000080" />
      <path d="M16,11.5 L16,20.5 M11.5,16 L20.5,16 M12.8,12.8 L19.2,19.2 M12.8,19.2 L19.2,12.8" stroke="#000080" strokeWidth="0.5" />
    </svg>
  );
}

function FlagSG() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <circle cx="16" cy="16" r="16" fill="#ffffff" />
      <path d="M0,0 L32,0 L32,16 L0,16 Z" fill="#EE2C3C" />
      <path d="M9.5,4.5 A 3.5,3.5 0 1,0 9.5,11.5 A 2.8,2.8 0 1,1 9.5,4.5" fill="#ffffff" />
      <circle cx="12" cy="6" r="0.8" fill="#ffffff" />
      <circle cx="14" cy="7" r="0.8" fill="#ffffff" />
      <circle cx="13" cy="9.5" r="0.8" fill="#ffffff" />
      <circle cx="11" cy="9.5" r="0.8" fill="#ffffff" />
      <circle cx="10" cy="7" r="0.8" fill="#ffffff" />
    </svg>
  );
}

function FlagMY() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <rect width="32" height="32" fill="#ffffff" />
      <path d="M0,0 h32 v4 h-32 Z M0,8 h32 v4 h-32 Z M0,16 h32 v4 h-32 Z M0,24 h32 v4 h-32 Z" fill="#cc0000" />
      <path d="M0,0 L18,0 L18,18 L0,18 Z" fill="#000066" />
      <path d="M8,4.5 A 4,4 0 1,0 8,13.5 A 3.2,3.2 0 1,1 8,4.5" fill="#FFCC00" />
      <polygon points="13,9 14,7 13.5,9.5 15.5,9 13.5,10.5 14,13 13,11 12,13 12.5,10.5 10.5,9 12.5,9.5 12,7" fill="#FFCC00" />
    </svg>
  );
}

function FlagAE() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full rounded-full overflow-hidden">
      <rect width="32" height="32" fill="#ffffff" />
      <path d="M0,0 L32,0 L32,10.67 L0,10.67 Z" fill="#00732F" />
      <path d="M0,21.33 L32,21.33 L32,32 L0,32 Z" fill="#000000" />
      <path d="M0,0 L9.6,0 L9.6,32 L0,32 Z" fill="#FF0000" />
    </svg>
  );
}

// 6 office regions with coordinated latitudinal top offsets and 5s rotational staggered delays
const pins = [
  { id: "uk", city: "London", country: "UK", top: "50px", flag: <FlagUK />, delay: "0s" },
  { id: "ae", city: "Dubai", country: "UAE", top: "90px", flag: <FlagAE />, delay: "-5s" },
  { id: "in", city: "Chennai", country: "India", top: "110px", flag: <FlagIN />, delay: "-10s" },
  { id: "cn", city: "Guangzhou", country: "China", top: "85px", flag: <FlagCN />, delay: "-15s" },
  { id: "sg", city: "Singapore", country: "Singapore", top: "130px", flag: <FlagSG />, delay: "-20s" },
  { id: "my", city: "Kuala Lumpur", country: "Malaysia", top: "140px", flag: <FlagMY />, delay: "-25s" },
];

export default function Globe() {
  return (
    <>
      <style>
        {`
          @keyframes earthRotate {
            0% { background-position: 0 0; }
            100% { background-position: 400px 0; }
          }

          @keyframes rotatePin {
            /* Front Face: Moving left to right with sinusoidal horizontal speed to simulate 3D curvature */
            0% {
              left: 25px;
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.65);
              visibility: hidden;
              pointer-events: none;
            }
            3% {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
              visibility: visible;
              pointer-events: auto;
            }
            12.5% {
              left: 54px;
            }
            25% {
              left: 125px;
            }
            37.5% {
              left: 196px;
            }
            47% {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
              visibility: visible;
              pointer-events: auto;
            }
            50% {
              left: 225px;
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.65);
              visibility: hidden;
              pointer-events: none;
            }
            /* Back Face: Moving across back of globe in invisible state to reset */
            100% {
              left: 25px;
              opacity: 0;
              transform: translate(-50%, -50%) scale(0.65);
              visibility: hidden;
              pointer-events: none;
            }
          }
        `}
      </style>
      <div
        aria-hidden="true"
        className="relative h-[250px] w-[250px] overflow-hidden rounded-full shadow-[0_0_26px_rgba(255,255,255,0.24),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]"
        style={{
          backgroundImage:
            "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/globe.jpeg')",
          backgroundPosition: "left",
          backgroundSize: "cover",
          animation: "earthRotate 30s linear infinite",
        }}
      >
        {pins.map((pin) => (
          <div
            key={pin.id}
            className="absolute z-30 pointer-events-auto"
            style={{
              top: pin.top,
              animation: `rotatePin 30s infinite linear`,
              animationDelay: pin.delay,
            }}
          >
            {/* Hover Trigger container */}
            <div className="relative group cursor-pointer">
              {/* Pulsing glow ring (disabled on mobile for performance) */}
              <span className="absolute -inset-1 rounded-full bg-[#3cd5f7]/40 sm:animate-ping hidden sm:block opacity-75" />
              
              {/* Flag Circle Container */}
              <div className="relative h-[18px] w-[18px] rounded-full border border-white/90 bg-slate-900 shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-300 group-hover:scale-125 group-hover:shadow-[0_0_12px_rgba(61,213,247,0.85)]">
                {pin.flag}
              </div>

              {/* Premium Interactive Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none transition-all duration-300">
                <div className="bg-slate-950/95 text-[10px] font-black text-white px-2.5 py-1.5 rounded-lg border border-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.5)] whitespace-nowrap tracking-wide flex items-center gap-1.5">
                  <span className="text-[#3cd5f7]">{pin.city}</span>
                  <span className="text-white/60">|</span>
                  <span className="text-white/90 font-bold uppercase tracking-wider text-[9px]">{pin.country}</span>
                </div>
                {/* Tooltip arrow */}
                <div className="w-1.5 h-1.5 bg-slate-950 border-r border-b border-white/10 rotate-45 -mt-[4px]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
