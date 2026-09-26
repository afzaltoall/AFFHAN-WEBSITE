import { Reveal } from "@/components/ui/Reveal";
import { TERMS } from "./content";
import { DISPLAY, EYEBROW, PlaceholderTag } from "./parts";

/**
 * 13 Terms & Conditions. The film's intensity drops here on purpose:
 * readability over spectacle. A lighter charcoal ground, body text at a
 * comfortable measure and line height, hairline dividers, and no motion beyond
 * the site's own gentle fade-up (Reveal, which does nothing at all under
 * reduced motion).
 *
 * Every section is a placeholder and says so, visibly. Nothing here states a
 * date, fee, criterion or guarantee; the wording must come from Affhan.
 */
export function Scene13Terms() {
  return (
    <section id="terms" aria-labelledby="cx-terms-title" className="relative bg-(--cx-char)/92 py-24 md:py-32">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-20 md:px-12">
        <div>
          <p className={EYEBROW}>{TERMS.eyebrow}</p>
          <h2 id="cx-terms-title" className={`${DISPLAY} mt-4 text-[clamp(36px,8vw,56px)] leading-[1.02] md:text-[clamp(44px,4vw,68px)]`}>
            {TERMS.title}
          </h2>
          <p role="note" className="mt-8 border-l border-(--cx-gold)/60 pl-5 text-[15px] leading-[1.75] text-(--cx-mute)">
            <PlaceholderTag className="mb-2 ml-0" />
            <br />
            {TERMS.notice}
          </p>
        </div>
        <dl className="border-t border-(--cx-faint)">
          {TERMS.sections.map((s) => (
            <Reveal key={s.id} className="grid gap-2 border-b border-(--cx-faint) py-7 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
              <dt className="text-[16px] font-semibold text-(--cx-white)">{s.title}</dt>
              <dd className="text-[16px] leading-[1.75] text-(--cx-mute)">
                {s.body}
                <PlaceholderTag />
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
