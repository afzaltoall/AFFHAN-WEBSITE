import React from 'react';
import { cn } from '@/lib/utils';

interface RetroTvErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  errorCode?: string;
  errorMessage?: string;
}

const RetroTvError = React.forwardRef<HTMLDivElement, RetroTvErrorProps>(
  (
    {
      className,
      errorCode = '404',
      errorMessage = 'NOT FOUND',
      ...props
    },
    ref
  ) => {
    const errorCodeDigits = errorCode.split('');

    return (
      <div
        ref={ref}
        className={cn(
          'main_wrapper relative flex items-center justify-center min-h-[350px] w-full',
          className
        )}
        {...props}
      >
        {/* The 404 background text */}
        <div className="text_404 absolute inset-0 flex items-center justify-center -z-10 select-none opacity-50 md:opacity-100 pointer-events-none">
          <div className="flex gap-4 md:gap-8 text-[10rem] md:text-[14rem] font-bold text-gray-500/50 tracking-widest">
            {errorCodeDigits.map((digit, index) => (
              <div key={index} className={`text_404${index + 1}`}>
                {digit}
              </div>
            ))}
          </div>
        </div>

        {/* The Retro TV */}
        <div className="main relative z-10 flex flex-col items-center">
          
          {/* Antenna Section */}
          <div className="antenna relative flex justify-center items-end w-16 h-12 -mb-4 z-0">
            {/* Base of antenna */}
            <div className="a_base absolute w-16 h-10 bg-[#e67e22] border-2 border-black rounded-t-full bottom-0 shadow-[inset_0_-4px_rgba(0,0,0,0.2)]" />
            
            {/* Left Antenna (a1) */}
            <div className="a1 absolute bottom-6 left-[40%] w-[3px] h-16 bg-black origin-bottom -rotate-[35deg]">
              <div className="a1d absolute -top-1 -left-[4px] w-3 h-3 bg-black rounded-full" />
            </div>
            
            {/* Right Antenna (a2) */}
            <div className="a2 absolute bottom-6 right-[40%] w-[3px] h-12 bg-black origin-bottom rotate-[25deg]">
              <div className="a2d absolute -top-1 -left-[4px] w-3 h-3 bg-black rounded-full" />
            </div>
          </div>

          {/* Main TV Body */}
          <div className="tv relative bg-[#e67e22] border-4 border-black rounded-2xl w-72 md:w-80 h-48 md:h-56 p-3 flex shadow-[inset_0_-10px_rgba(0,0,0,0.15),_0_10px_20px_rgba(0,0,0,0.3)] z-10">
            
            {/* Left side: The Screen */}
            <div className="display_div bg-black border-4 border-black rounded-xl w-48 md:w-56 h-full relative overflow-hidden flex items-center justify-center">
              
              {/* Static overlay (simulating noise) */}
              <div className="screen_out absolute inset-0 bg-white/10 mix-blend-overlay opacity-60" 
                   style={{
                     backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)"
                   }}>
              </div>

              {/* The NOT FOUND text box */}
              <div className="screen_out1 relative z-10 bg-black border border-white/80 px-3 py-1 rounded shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                <div className="screen text-center">
                  <span className="notfound_text text-white text-xs md:text-sm font-mono tracking-widest font-bold">
                    {errorMessage}
                  </span>
                </div>
              </div>
            </div>

            {/* Right side: The controls */}
            <div className="buttons_div flex-1 flex flex-col justify-between py-3 items-center">
              
              {/* Speaker grill lines */}
              <div className="lines flex flex-col gap-2 w-full items-center mt-2">
                <div className="line1 w-8 h-1.5 bg-black rounded-full" />
                <div className="line2 w-8 h-1.5 bg-black rounded-full" />
                <div className="line3 w-8 h-1.5 bg-black rounded-full" />
              </div>
              
              {/* Knobs */}
              <div className="flex flex-col gap-3 mt-4">
                <div className="b1 w-6 h-6 bg-[#333] border-2 border-black rounded-full relative shadow-[inset_1px_1px_rgba(255,255,255,0.3)] flex items-center justify-center">
                  <div className="w-4 h-1 bg-white rotate-45 rounded-sm" />
                </div>
                <div className="b2 w-6 h-6 bg-[#333] border-2 border-black rounded-full relative shadow-[inset_1px_1px_rgba(255,255,255,0.3)] flex items-center justify-center">
                  <div className="w-4 h-1 bg-white -rotate-12 rounded-sm" />
                </div>
              </div>
              
              {/* Bottom Speaker dots */}
              <div className="speakers flex gap-1.5 mt-auto mb-1">
                <div className="g11 w-1.5 h-1.5 bg-black rounded-full" />
                <div className="g12 w-1.5 h-1.5 bg-black rounded-full" />
                <div className="g13 w-1.5 h-1.5 bg-black rounded-full" />
              </div>

            </div>
          </div>

          {/* TV Stand / Bottom */}
          <div className="bottom flex flex-col items-center z-0 -mt-2">
            <div className="flex justify-between w-48 px-4">
              <div className="base1 w-5 h-4 bg-[#333] border-2 border-black border-t-0 rounded-b-sm" />
              <div className="base2 w-5 h-4 bg-[#333] border-2 border-black border-t-0 rounded-b-sm" />
            </div>
            {/* The line below the TV stand */}
            <div className="base3 w-80 md:w-96 h-1.5 bg-black rounded-full mt-2 opacity-80" />
          </div>

        </div>
      </div>
    );
  }
);

RetroTvError.displayName = 'RetroTvError';

export { RetroTvError };
