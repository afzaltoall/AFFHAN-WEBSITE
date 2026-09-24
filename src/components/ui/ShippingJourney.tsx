"use client";

import { JOURNEY_STAGES, LANES } from "@/lib/shippingJourney";

export function ShippingJourney() {
  return (
    <section
      aria-labelledby="journey-heading"
      className="relative bg-[#FAFAF7]"
    >
      <div className="mx-auto w-full max-w-[1500px] px-6 py-24 md:px-12 lg:px-16 lg:py-32">
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
          The journey
        </span>
        <h2
          id="journey-heading"
          className="mt-6 max-w-4xl text-[9vw] font-medium leading-[0.9] tracking-[-0.04em] text-[#08222e] sm:text-[7vw] lg:text-[5vw]"
        >
          Five stages, one company answering for all of them
        </h2>

        <div className="mt-20 lg:mt-32">
          {JOURNEY_STAGES.map((stage, index) => (
            <div 
              key={stage.id} 
              className="group flex flex-col lg:flex-row gap-6 lg:gap-16 border-t border-[#08222e]/10 pt-8 pb-16 lg:pt-12 lg:pb-24"
            >
              {/* Sticky Stage Number */}
              <div className="lg:w-1/4 shrink-0">
                <div className="lg:sticky lg:top-32 text-[11vw] sm:text-[9vw] lg:text-[6vw] font-medium leading-none tracking-tight text-[#08222e]/10 transition-colors duration-500 group-hover:text-[#08222e]">
                  {stage.id}
                </div>
              </div>

              {/* Stage Content */}
              <div className="lg:w-3/4 max-w-3xl">
                <h3 className="text-3xl font-bold tracking-tight text-[#08222e] sm:text-4xl lg:text-5xl">
                  {stage.title}
                </h3>
                <p className="mt-6 text-lg font-medium leading-relaxed text-[#08222e] sm:text-xl">
                  {stage.lead}
                </p>
                <p className="mt-4 text-[17px] leading-relaxed text-[#5a6e77]">
                  {stage.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* The three lanes with an Affhan office at both ends. Real
            sailing times ?" see the note in lib/shippingJourney.ts. */}
        <div className="mt-10 border-t border-[#08222e]/20 pt-16">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#176579]">
            Typical sailing time
          </span>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {LANES.map((lane) => (
              <div key={lane.port} className="flex flex-col gap-2">
                <span className="text-sm font-semibold tracking-wide text-[#5a6e77]">
                  {lane.from} &rarr; {lane.to}
                </span>
                <span className="text-3xl font-bold text-[#08222e]">
                  ~{lane.days} days
                </span>
                <span className="text-sm text-[#5a6e77]">
                  {lane.port}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
