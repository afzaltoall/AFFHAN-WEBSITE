"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, type MotionValue } from "framer-motion";
import Image from "next/image";

import { SocialBeams } from "@/components/ui/social-beams";

type Service = { title: string; desc: string; img: string };

// Each service card owns its own scroll-driven motion values. Extracted into a
// component (rather than calling hooks inside a .map callback) so the Rules of
// Hooks are satisfied — servicesList is a fixed-length array, so the number of
// these components never changes between renders.
function ServiceImageCard({ service, idx, activeService }: { service: Service; idx: number; activeService: MotionValue<number> }) {
  const isActive = useTransform(activeService, (val) => (Math.round(val) === idx ? 1 : 0) as number);
  const opacity = useSpring(useTransform(isActive, [0, 1], [0, 1]));
  const y = useSpring(useTransform(isActive, [0, 1], [20, 0]));
  const zIndex = useTransform(isActive, [0, 1], [0, 10]);
  return (
    <motion.div
      style={{ opacity, y, zIndex }}
      className="absolute inset-0 flex flex-col justify-center"
    >
      <div className="relative w-full aspect-video md:aspect-[16/7] lg:aspect-video max-h-[30vh] lg:max-h-[50vh] rounded-lg overflow-hidden mb-4 lg:mb-8 border border-black/10 shadow-2xl">
        <Image src={service.img} alt={service.title} fill className={`object-cover scale-[1.12] ${idx === 1 ? "translate-y-[3%]" : ""}`} />
      </div>
      <div className="w-12 h-1 bg-[#d4a373] mb-4" />
      <p className="text-sm md:text-base lg:text-lg text-black/80 leading-relaxed max-w-lg">
        {service.desc}
      </p>
    </motion.div>
  );
}

function ServiceListItem({ service, idx, activeService }: { service: Service; idx: number; activeService: MotionValue<number> }) {
  const isActive = useTransform(activeService, (val) => (Math.round(val) === idx ? 1 : 0) as number);
  const color = useTransform(isActive, [0, 1], ["rgba(0,0,0,0.2)", "rgba(0,0,0,1)"]);
  const x = useSpring(useTransform(isActive, [0, 1], [0, 10]));
  return (
    <motion.h3
      style={{ color, x }}
      className="text-xl sm:text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-bold tracking-tight transition-colors duration-300 leading-tight cursor-default"
    >
      {service.title === "Manufacturing, Sourcing & Supply" ? "Manufacturing & Sourcing" : service.title}
    </motion.h3>
  );
}

export default function AboutUsContent() {
  // 1. Opening Sequence
  const openingRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: rawOpeningProgress } = useScroll({
    target: openingRef,
    offset: ["start start", "end end"],
  });
  const openingProgress = useSpring(rawOpeningProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  // Fade texts sequentially with slight vertical movement for better animation
  const opacity1 = useTransform(openingProgress, [0, 0.15, 0.25], [1, 1, 0]);
  const y1 = useTransform(openingProgress, [0, 0.15, 0.25], [0, 0, -30]);

  const opacity2 = useTransform(openingProgress, [0.25, 0.35, 0.45, 0.5], [0, 1, 1, 0]);
  const y2 = useTransform(openingProgress, [0.25, 0.35, 0.45, 0.5], [30, 0, 0, -30]);

  const opacity3 = useTransform(openingProgress, [0.5, 0.6, 0.7, 0.75], [0, 1, 1, 0]);
  const y3 = useTransform(openingProgress, [0.5, 0.6, 0.7, 0.75], [30, 0, 0, -30]);

  const opacity4 = useTransform(openingProgress, [0.75, 0.85, 0.95, 1], [0, 1, 1, 0]);
  const y4 = useTransform(openingProgress, [0.75, 0.85, 0.95, 1], [30, 0, 0, -30]);

  // Scroll-down cue on the opening screen; fades the moment you start scrolling.
  const scrollCueOpacity = useTransform(openingProgress, [0, 0.06], [1, 0]);

  // 2. CEO Reveal Sequence
  const ceoRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: rawCeoProgress } = useScroll({
    target: ceoRef,
    offset: ["start start", "end end"],
  });
  const ceoProgress = useSpring(rawCeoProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  // CEO Animation phases
  const bgColor = useTransform(ceoProgress, [0.28, 0.35], ["#ffffff", "#0a0a0a"]);

  // Phase 0: Who's behind
  const whoOpacity = useTransform(ceoProgress, [0, 0.15, 0.28], [0, 1, 0]);
  const whoScale = useTransform(ceoProgress, [0, 0.15, 0.28], [0.9, 1, 1.1]);

  // Phase 1: Reveal Image & Quote
  const imgOpacity = useTransform(ceoProgress, [0.35, 0.45, 0.95, 1], [0, 1, 1, 0]);
  const imgScale = useTransform(ceoProgress, [0.35, 1], [1.05, 1]);
  const quoteOpacity = useTransform(ceoProgress, [0.5, 0.6, 0.95, 1], [0, 1, 1, 0]);
  const quoteY = useTransform(ceoProgress, [0.5, 0.6, 0.95, 1], [30, 0, 0, -20]);

  // 2.5 Be globally connected
  const globalRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: rawGlobalProgress } = useScroll({
    target: globalRef,
    offset: ["start start", "end end"],
  });
  // Using a snappy spring to smooth out raw wheel events without lagging
  const globalProgress = useSpring(rawGlobalProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });

  const leftGlobalX = useTransform(globalProgress, [0, 0.4], ["-150vw", "0vw"]);
  const rightGlobalX = useTransform(globalProgress, [0, 0.4], ["150vw", "0vw"]);
  const globalScale = useTransform(globalProgress, [0, 0.4, 0.7, 0.9], [0.8, 1, 1, 1.2]);
  // Fade in at the very start to prevent any 1-frame flashes before scroll calculation
  const globalOpacity = useTransform(globalProgress, [0, 0.1, 0.7, 0.9], [0, 1, 1, 0]);

  // 3. Services
  const servicesRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: servicesProgress } = useScroll({
    target: servicesRef,
    offset: ["start start", "end end"],
  });

  const activeService = useTransform(servicesProgress, [0, 1], [0, 5]);

  const servicesList = [
    {
      title: "Manufacturing, Sourcing & Supply",
      // "500+ categories", matching every other page and the catalogue itself:
      // 509 categories currently hold products. "40+" was true but understated
      // it by thirteen times, and it was the one figure on the site that
      // disagreed with the rest.
      desc: "Backed by strong production capabilities and global partnerships, we manufacture, source, stock and supply high-quality products across 500+ categories seamlessly serving over 190+ markets in 6 countries worldwide.",
      img: "/services/img_1.webp"
    },
    {
      title: "Global Shipping Network",
      desc: "Our global shipping network delivers efficient and reliable cargo movement across international markets. Supported by trusted logistics partners, we handle tracking with precision.",
      img: "/services/img_2.webp"
    },
    {
      title: "Door-to-Door Freight Solutions",
      desc: "We offer comprehensive door-to-door freight services for both LCL and FCL shipments. From pickup to final delivery, we manage customs, documentation and logistics with care and efficiency.",
      img: "/services/img_3.webp"
    },
    {
      title: "Air Freight Services",
      desc: "Built for time-critical and high-value shipments, we offer priority handling, real-time tracking and seamless coordination, backed by strong airline partnerships and a dedicated team.",
      img: "/services/img_4.webp"
    },
    {
      title: "Non-Vessel Operating Common Carrier",
      desc: "We specialize in NVOCC operations, offering reliable and cost-effective ocean freight solutions through strong global partnerships and seamless cargo consolidation.",
      img: "/services/img_5.webp"
    },
    {
      title: "Global Stocking Solutions",
      desc: "With strategically located warehouses across multiple countries, we offer secure storage, professional packaging and timely delivery, ensuring your products reach customers seamlessly.",
      img: "/services/img_6.webp"
    }
  ];

  // 4. Global Reach
  const reachRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: reachProgress } = useScroll({
    target: reachRef,
    offset: ["start center", "end center"],
  });

  // Highlighting text based on scroll
  const reachText1 = useTransform(reachProgress, [0, 0.25], [0.3, 1]);
  const reachText2 = useTransform(reachProgress, [0.25, 0.5], [0.3, 1]);
  const reachText3 = useTransform(reachProgress, [0.5, 0.75], [0.3, 1]);
  const reachText4 = useTransform(reachProgress, [0.75, 1], [0.3, 1]);
  const reachGlobalY = useTransform(reachProgress, [0, 1], ["-40vh", "40vh"]);

  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      {/* 1. Opening Sequence */}
      <section ref={openingRef} className="relative h-[400vh] bg-white text-black">
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
          <motion.h2 style={{ opacity: opacity1, y: y1 }} className="absolute text-3xl md:text-5xl lg:text-7xl font-bold tracking-tight text-center px-4">
            Trusted partnerships are<br />not built overnight.
          </motion.h2>
          <motion.h2 style={{ opacity: opacity2, y: y2 }} className="absolute text-4xl md:text-6xl lg:text-8xl font-bold tracking-tight text-center px-4">
            They are <span className="text-[#d4a373]">earned.</span>
          </motion.h2>
          <motion.h2 style={{ opacity: opacity3, y: y3 }} className="absolute text-3xl md:text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1] py-2 text-center px-4">
            Every shipment carries<br />a promise we keep.
          </motion.h2>
          <motion.h2 style={{ opacity: opacity4, y: y4 }} className="absolute text-3xl md:text-5xl lg:text-7xl font-bold tracking-tight text-center px-4">
            Reliability that moves the <span className="text-[#d4a373]">world.</span>
          </motion.h2>

          {/* Scroll-down cue — animated mouse + chevrons */}
          <motion.div
            style={{ opacity: scrollCueOpacity }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-black/60"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Scroll</span>
            <div className="flex h-9 w-6 items-start justify-center rounded-full border-2 border-black/50 p-1.5">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-black/60"
                animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <motion.svg
              width="18" height="12" viewBox="0 0 18 12" fill="none"
              animate={{ y: [0, 4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <path d="M1 1l8 8 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </motion.div>
        </div>
      </section>

      {/* 2. CEO Reveal */}
      <section ref={ceoRef} className="relative h-[600vh] bg-[#0a0a0a]">
        <motion.div style={{ backgroundColor: bgColor }} className="sticky top-0 h-screen w-full flex flex-col items-center justify-center overflow-hidden">

          {/* Phase 0: Who's behind */}
          <motion.div style={{ opacity: whoOpacity, scale: whoScale }} className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <h2 className="text-4xl md:text-6xl lg:text-[5rem] font-bold tracking-tight text-black px-4 py-2">Who&apos;s behind the work.</h2>
          </motion.div>

          {/* Phase 1: Reveal Image directly to full screen */}
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
            style={{ opacity: imgOpacity }}
          >
            <motion.div style={{ scale: imgScale }} className="relative w-full h-full overflow-hidden">
              <Image
                src="/ceo.webp"
                alt="Afzal Khan - CEO"
                fill
                className="object-cover object-[25%_20%] md:object-[right_20%] md:scale-[1.15] md:-translate-x-12"
                priority
              />
              {/* Uniform Dark Overlay */}
              <div className="absolute inset-0 bg-black/70 z-10" />
            </motion.div>
          </motion.div>

          {/* Phase 2: Message */}
          <motion.div
            style={{ opacity: quoteOpacity, y: quoteY }}
            className="absolute inset-0 flex flex-col justify-end md:justify-center w-full z-30 pointer-events-none pt-24 pb-32 md:pt-32 md:pb-0"
          >
            <div className="w-full flex justify-end px-8 md:px-16 lg:px-24 xl:px-32">
              <div className="w-full max-w-[42rem] flex flex-col">
                <p className="text-[0.55rem] md:text-xs tracking-[0.2em] text-white/70 mb-4 md:mb-8 uppercase font-medium">A Message From The Founder</p>
                <div className="relative">
                  <span className="absolute -left-6 md:-left-10 -top-2 text-4xl md:text-6xl text-[#c7a461] font-serif leading-none">“</span>
                  <blockquote className="text-lg md:text-2xl lg:text-[1.75rem] font-light leading-[1.6] italic text-white/95">
                    Affhan was never built by one person&apos;s effort. It is built by the hard work and dedication of every single person who calls this company home. There is no finish line for us, no end point to growth. Our vision is simple to build a platform big enough to carry the ambitions of every business we serve, and strong enough to help them succeed.
                  </blockquote>
                </div>

                <div className="w-full h-[1px] bg-white/20 mt-8 md:mt-12 mb-4 md:mb-6" />
                <div className="flex flex-col items-end">
                  <span className="text-white text-lg md:text-xl font-medium tracking-wider">AFZAL KHAN</span>
                  <span className="text-[#c7a461] text-sm md:text-base mt-1">Founder & CEO</span>
                </div>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </section>

      {/* 2.5 Be globally connected */}
      <section ref={globalRef} className="relative h-[200vh] bg-white">
        <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
          <motion.div style={{ scale: globalScale, opacity: globalOpacity }} className="flex items-center gap-4 md:gap-8 text-black font-bold tracking-tighter">
            <motion.span style={{ x: leftGlobalX }} className="text-4xl md:text-6xl lg:text-[6rem]">Be globally</motion.span>
            <motion.span style={{ x: rightGlobalX }} className="text-4xl md:text-6xl lg:text-[6rem] text-[#d4a373]">connected</motion.span>
          </motion.div>
        </div>
      </section>

      {/* 3. Services Scroll-linked */}
      <section ref={servicesRef} className="relative h-[600vh] bg-white">
        {/* Invisible anchor points for Footer link navigation to precise scroll positions */}
        <div id="service-manufacturing" className="absolute top-[0vh]" />
        <div id="service-global-shipping" className="absolute top-[100vh]" />
        <div id="service-door-to-door" className="absolute top-[200vh]" />
        <div id="service-air-freight" className="absolute top-[300vh]" />
        <div id="service-nvocc" className="absolute top-[400vh]" />
        <div id="service-global-stocking" className="absolute top-[500vh]" />
        <div className="sticky top-0 h-screen w-full flex flex-col justify-center px-4 md:px-12 lg:px-24 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 w-full max-w-7xl mx-auto h-[85vh] lg:h-[75vh] items-center">

            {/* Left side: Images and Descriptions */}
            <div className="relative h-[45vh] lg:h-full flex flex-col justify-center">
              {servicesList.map((service, idx) => (
                <ServiceImageCard key={idx} service={service} idx={idx} activeService={activeService} />
              ))}
            </div>

            {/* Right side: List */}
            <div className="flex flex-col justify-center h-[35vh] lg:h-full">
              <p className="text-black/50 mb-2 lg:mb-6 text-xs lg:text-sm uppercase tracking-wider font-semibold">Our Services</p>
              <div className="flex flex-col space-y-2 lg:space-y-3">
                {servicesList.map((service, idx) => (
                  <ServiceListItem key={idx} service={service} idx={idx} activeService={activeService} />
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Global Reach */}
      <section ref={reachRef} className="relative min-h-[150vh] bg-white flex items-center overflow-hidden">
        <div className="sticky top-0 h-screen w-full flex items-center px-8 md:px-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 w-full max-w-7xl mx-auto items-center">
            <div className="relative">
              <p className="text-black/50 mb-2 font-semibold uppercase tracking-wider text-sm">Our Reach:</p>
              <div className="absolute top-1/2 -translate-y-1/2 -z-10 left-0">
                <motion.h2 
                  style={{ y: reachGlobalY }}
                  className="text-7xl md:text-[8rem] lg:text-[12rem] font-bold tracking-tighter text-[#c7a461] opacity-60 whitespace-nowrap"
                >
                  Global.
                </motion.h2>
              </div>
            </div>
            <div className="flex flex-col justify-center space-y-6 text-3xl md:text-4xl lg:text-[2.75rem] font-medium tracking-tight leading-tight text-black">
              <motion.span style={{ opacity: reachText1 }}>500K+ Products Sourced globally.</motion.span>
              {/* Seven, and the two lines below name exactly seven. Hong Kong
                  was listed here as an eighth office and there is no business
                  there — it appeared in no office record, so the count and the
                  list disagreed with the Contact page. Keep this number in step
                  with the office records in OfficeLocations. */}
              <motion.span style={{ opacity: reachText2 }}>7 Global Offices managing operations.</motion.span>
              <motion.span style={{ opacity: reachText3, color: "#d4a373" }}>United Kingdom, France, China, UAE.</motion.span>
              <motion.span style={{ opacity: reachText4, color: "#d4a373" }}>Singapore, Malaysia, India.</motion.span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Footer */}
      <section className="relative h-screen w-full bg-white flex items-center justify-center px-8 lg:px-24 overflow-hidden text-black border-t border-gray-100">
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true, amount: 0.5 }}
            className="flex flex-col items-center text-center"
          >
            <span className="text-brand text-sm font-semibold uppercase tracking-[0.2em] mb-3">Partner With Us</span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-gray-800">Affhan International pvt ltd</h2>
          </motion.div>

          {/* Center Affhan logo with animated social "wires" flowing in */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true, amount: 0.4 }}
            className="w-full"
          >
            <SocialBeams />
          </motion.div>

          <span className="text-gray-400 text-base font-medium tracking-wide">Follow Us</span>
        </div>

        <div className="absolute bottom-6 right-8 text-gray-400 text-xs">
          ©2026 Affhan International pvt ltd
        </div>
      </section>

    </div>
  );
}
