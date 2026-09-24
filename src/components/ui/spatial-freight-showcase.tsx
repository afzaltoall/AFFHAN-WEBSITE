'use client';

import { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Ship, Plane, ChevronRight } from 'lucide-react';

// =========================================
// 1. CONFIGURATION & DATA TYPES
// =========================================

export type FreightId = 'sea' | 'air';

// No figures here. The cards once carried percentage bars (volume capacity,
// cost efficiency, transit speed, security) and an "efficiency" score, none
// with any source behind it; they were removed rather than replaced. A number
// goes on this page only when it can be checked.
export interface FreightData {
  id: FreightId;
  label: string; // Display name for the switcher
  title: string;
  description: string;
  image: string;
  colors: {
    gradient: string; // Tailwind gradient classes
    glow: string;     // Tailwind color class for accents
    ring: string;     // Tailwind border color for rings
  };
  stats: {
    status: string;
  };
}

// Default Data (Easy to Modify Here)
const FREIGHT_DATA: Record<FreightId, FreightData> = {
  sea: {
    id: 'sea',
    label: 'Sea',
    title: 'Sea Freight',
    description: 'FCL and LCL out of major global ports. Cost-effective for large volumes.',
    image: 'https://images.unsplash.com/photo-1494412651409-8963ce7935a7?q=80&w=800&auto=format&fit=crop',
    colors: {
      gradient: 'from-blue-600 to-indigo-900',
      glow: 'bg-blue-500',
      ring: 'border-l-blue-500/50',
    },
    stats: { status: 'Standard Transit' },
  },
  air: {
    id: 'air',
    label: 'Air',
    title: 'Air Freight',
    description: 'For cargo where the cost of delay outweighs the freight bill. Ideal for high-value or time-sensitive shipments that justify the premium over sea transport.',
    image: 'https://images.unsplash.com/photo-1542296332-2e4473faf563?q=80&w=800&auto=format&fit=crop',
    colors: {
      gradient: 'from-amber-600 to-orange-900',
      glow: 'bg-amber-500',
      ring: 'border-r-amber-500/50',
    },
    stats: { status: 'Priority Transit' },
  },
};

// =========================================
// 2. ANIMATION VARIANTS
// =========================================

const ANIMATIONS: {
  container: Variants;
  item: Variants;
  image: (isLeft: boolean) => Variants;
} = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { type: 'spring', stiffness: 100, damping: 20 },
    },
    exit: { opacity: 0, y: -10, filter: 'blur(5px)' },
  },
  image: (isLeft: boolean): Variants => ({
    initial: {
      opacity: 0,
      scale: 1.2,
      filter: 'blur(15px)',
      rotate: isLeft ? -5 : 5,
      x: isLeft ? -40 : 40,
    },
    animate: {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      rotate: 0,
      x: 0,
      transition: { type: 'spring', stiffness: 260, damping: 20 },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      filter: 'blur(20px)',
      transition: { duration: 0.25 },
    },
  }),
};

// =========================================
// 3. SUB-COMPONENTS
// =========================================

const BackgroundGradient = ({ isLeft }: { isLeft: boolean }) => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
    <motion.div
      animate={{
        background: isLeft
          ? 'radial-gradient(circle at 0% 50%, rgba(59, 130, 246, 0.1), transparent 50%)'
          : 'radial-gradient(circle at 100% 50%, rgba(245, 158, 11, 0.1), transparent 50%)',
      }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0"
    />
  </div>
);

const FreightVisual = ({ data, isLeft }: { data: FreightData; isLeft: boolean }) => (
  <motion.div layout="position" className="relative group shrink-0">
    {/* Animated Rings */}
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      className={`absolute inset-[-10%] rounded-full border border-dashed border-[#08222e]/10 ${data.colors.ring}`}
    />
    <motion.div
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      className={`absolute inset-0 rounded-full bg-gradient-to-br ${data.colors.gradient} blur-3xl opacity-20`}
    />

    {/* Image Container */}
    <div className="relative h-64 w-64 md:h-[400px] md:w-[400px] rounded-full border border-[#08222e]/10 shadow-xl flex items-center justify-center overflow-hidden bg-white/50 backdrop-blur-sm">
      <motion.div
        animate={{ y: [-5, 5, -5] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
        className="relative z-10 w-full h-full flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={data.id}
            src={data.image}
            alt={`${data.title}`}
            variants={ANIMATIONS.image(isLeft)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full h-full object-cover rounded-full p-2"
            draggable={false}
          />
        </AnimatePresence>
      </motion.div>
    </div>

    {/* Status Label */}
    <motion.div
      layout="position"
      className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-20"
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#08222e] bg-white px-4 py-2 rounded-full border border-[#08222e]/10 shadow-sm backdrop-blur">
        <span className={`h-1.5 w-1.5 rounded-full ${data.colors.glow} animate-pulse`} />
        {data.stats.status}
      </div>
    </motion.div>
  </motion.div>
);

const FreightDetails = ({ data, isLeft }: { data: FreightData; isLeft: boolean }) => {
  const alignClass = isLeft ? 'items-start text-left' : 'items-end text-right';

  return (
    <motion.div
      variants={ANIMATIONS.container}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`flex flex-col ${alignClass} py-8`}
    >
      <motion.h2 variants={ANIMATIONS.item} className="text-sm font-bold uppercase tracking-[0.2em] text-[#176579] mb-2 flex items-center gap-2">
        {isLeft ? <Ship size={16} /> : <Plane size={16} />} {data.label} Mode
      </motion.h2>
      <motion.h1 variants={ANIMATIONS.item} className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-[#08222e]">
        {data.title}
      </motion.h1>
      <motion.p variants={ANIMATIONS.item} className={`text-[#5a6e77] mb-8 max-w-sm leading-relaxed ${isLeft ? 'mr-auto' : 'ml-auto'}`}>
        {data.description}
      </motion.p>

      {/* To the freight quote form at the foot of the page, like every other
          quote button on it. */}
      <motion.div variants={ANIMATIONS.item} className={`flex ${isLeft ? 'justify-start' : 'justify-end'}`}>
        <a href="#shipping-quote" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#176579] hover:text-[#08222e] transition-colors group">
          Get a quote
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </a>
      </motion.div>
    </motion.div>
  );
};

const Switcher = ({ 
  activeId, 
  onToggle 
}: { 
  activeId: FreightId; 
  onToggle: (id: FreightId) => void 
}) => {
  const options = Object.values(FREIGHT_DATA).map(p => ({ id: p.id, label: p.label }));

  return (
    <div className="absolute bottom-6 inset-x-0 flex justify-center z-30 pointer-events-none">
      <motion.div layout className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-full bg-white shadow-md border border-[#08222e]/10 ring-1 ring-black/5">
        {options.map((opt) => (
          <motion.button
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            whileTap={{ scale: 0.96 }}
            className="relative w-28 h-12 rounded-full flex items-center justify-center text-sm font-bold tracking-wider uppercase focus:outline-none"
          >
            {activeId === opt.id && (
              <motion.div
                layoutId="island-surface-freight"
                className="absolute inset-0 rounded-full bg-[#08222e] shadow-inner"
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              />
            )}
            <span className={`relative z-10 transition-colors duration-300 ${activeId === opt.id ? 'text-white' : 'text-[#5a6e77] hover:text-[#08222e]'}`}>
              {opt.label}
            </span>
            {activeId === opt.id && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -bottom-1 h-1 w-6 rounded-full bg-[#176579]"
              />
            )}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
};

// =========================================
// 4. MAIN COMPONENT
// =========================================

export function SpatialFreightShowcase() {
  const [activeSide, setActiveSide] = useState<FreightId>('sea');
  
  const currentData = FREIGHT_DATA[activeSide];
  const isLeft = activeSide === 'sea';

  return (
    <div className="relative w-full bg-[#FAFAF7] text-[#08222e] overflow-hidden rounded-3xl border border-[#08222e]/10 shadow-sm flex flex-col items-center justify-center pb-24 pt-12 mt-12 mb-12">
      
      <BackgroundGradient isLeft={isLeft} />

      <div className="relative z-10 w-full px-6 flex flex-col justify-center max-w-5xl mx-auto">
        <motion.div
          layout
          transition={{ type: 'spring', bounce: 0, duration: 0.9 }}
          className={`flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 w-full ${
            isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
          }`}
        >
          {/* Left Column: Visuals */}
          <FreightVisual data={currentData} isLeft={isLeft} />

          {/* Right Column: Content */}
          <motion.div layout="position" className="w-full max-w-md">
            <AnimatePresence mode="wait">
              <FreightDetails 
                key={activeSide} // Key forces re-render for animation
                data={currentData} 
                isLeft={isLeft} 
              />
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>

      <Switcher activeId={activeSide} onToggle={setActiveSide} />
    </div>
  );
}
