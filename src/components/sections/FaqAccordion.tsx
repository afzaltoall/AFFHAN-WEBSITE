"use client";

import { useEffect, useId, useState } from "react";
import { Plus } from "lucide-react";

export interface FaqEntry {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  faqs: FaqEntry[];
}

// Opens on hover AND on click.
//
// Two pieces of state on purpose. Hover is transient — it opens a panel while
// the cursor is over it and lets go the moment it leaves. A click pins one
// open, so a visitor can move the cursor away and still read the answer. The
// pinned item wins over whatever is merely hovered.
//
// Hover is only wired up on devices with a real pointer. On a touch screen
// mouseenter fires from a tap and would fight the click that follows it — the
// same latching problem that made hover states on this site need two taps.
export function FaqAccordion({ faqs }: FaqAccordionProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [canHover, setCanHover] = useState(false);
  const baseId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const openIndex = pinnedIndex ?? hoveredIndex;

  return (
    <div className="flex flex-col gap-3">
      {faqs.map((faq, i) => {
        const isOpen = openIndex === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;

        return (
          <div
            key={faq.question}
            onMouseEnter={canHover ? () => setHoveredIndex(i) : undefined}
            onMouseLeave={canHover ? () => setHoveredIndex(null) : undefined}
            className={`rounded-2xl border bg-white transition-colors duration-200 ${
              isOpen ? "border-brand/40 shadow-[0_2px_14px_rgba(15,23,42,0.06)]" : "border-slate-200"
            }`}
          >
            {/* h3 keeps each question in the page's heading outline, exactly as
                the plain markup this replaced did. */}
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setPinnedIndex(pinnedIndex === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
              >
                <span
                  className={`text-[15px] sm:text-base font-medium tracking-[-0.012em] leading-snug transition-colors duration-200 ${
                    isOpen ? "text-brand-dark" : "text-slate-900"
                  }`}
                >
                  {faq.question}
                </span>
                <Plus
                  aria-hidden="true"
                  className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                    isOpen ? "rotate-45 text-brand" : "text-slate-400"
                  }`}
                />
              </button>
            </h3>

            {/* Always rendered — `faq-answer` collapses it with a grid row
                rather than removing it, so the text is in the HTML for a
                crawler whichever panel happens to be open.

                Three elements, not two: the outer one animates, the middle one
                clips, and the padding sits on the paragraph inside the clip.
                Padding on the collapsing element itself survives a zero height
                and leaks a sliver of the answer out under the question. */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              data-open={isOpen}
              className="faq-answer"
            >
              <div className="faq-answer-clip">
                <p className="px-5 pb-5 text-[15px] text-slate-600 leading-[1.65] tracking-[-0.003em] text-pretty sm:px-6 sm:pb-6">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
