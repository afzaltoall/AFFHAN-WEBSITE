import Link from "next/link";
import { ArrowRight, Plane } from "lucide-react";
import "@/components/CinematicExperience/cinematic.css";
import "./trip-legal.css";
import { displayFont } from "@/components/CinematicExperience/fonts";
import { TRIP_APPLY_HREF, TRIP_FACTS, TRIP_PRIVACY_HREF, TRIP_TERMS_HREF, type LegalDoc } from "@/lib/trip-legal";
import { LegalReader } from "./LegalReader";
import { LegalSections } from "./LegalSections";

/**
 * /free-china-trip/terms/ and /free-china-trip/privacy/: the trip's own
 * Terms & Conditions and Privacy Policy, whole, in the trip's night-and-gold
 * (not the main site's /terms-conditions/ and /privacy-policy/, which are
 * the website's and stay as they are).
 *
 * Built for reading a long legal text: a measure of about 68 characters,
 * every section anchored (#clause-7, #section-3) so a clause can be linked,
 * a contents list beside the text on a desktop and folded above it on a
 * phone, and the key dates set out before the first clause. Everything is
 * server-rendered and readable without script; LegalReader only adds the
 * reading bar and the contents' place-keeping.
 */

const DISPLAY = "font-[family-name:var(--font-cx-display)]";

export function LegalPage({ doc, kind }: { doc: LegalDoc; kind: "terms" | "privacy" }) {
  const prefix = kind === "terms" ? "clause" : "section";
  const [eyebrow, title] = doc.heading;
  const [before, after] = title.includes("&") ? title.split("&") : [title, null];
  const other = kind === "terms" ? { href: TRIP_PRIVACY_HREF, label: "Privacy Policy" } : { href: TRIP_TERMS_HREF, label: "Terms & Conditions" };
  const count = kind === "terms" ? `${doc.sections.length} clauses` : `${doc.sections.length} sections`;
  const items = doc.sections.map((s) => ({ n: s.n, title: s.title }));

  return (
    <main className={`${displayFont.variable} cx tl-page pt-16`}>
      <div aria-hidden className="tl-sky" />

      <header className="tl-hero">
        <nav aria-label="Breadcrumb" className="tl-crumbs">
          <Link href="/free-china-trip/">Free China Business Trip</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <p className="tl-eyebrow">{eyebrow}</p>
        <h1 id="tl-title" className={`${DISPLAY} tl-title`}>
          {before}
          {after !== null && (
            <>
              <span className="tl-amp">&amp;</span>
              {after}
            </>
          )}
        </h1>
        <span aria-hidden className="tl-hero-rule" />
        <div className="tl-intro">
          {doc.intro.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        {kind === "terms" && (
          <dl className="tl-keys" aria-label="Key dates">
            <KeyFact label="Applications open" value={TRIP_FACTS.applicationsOpen} href="#clause-3" />
            <KeyFact label="Applications close" value={TRIP_FACTS.applicationsClose} href="#clause-3" />
            <KeyFact label="Winners announced" value={TRIP_FACTS.winnersAnnounced} href="#clause-5" />
            <KeyFact label="By random draw" value={`${TRIP_FACTS.winners} winners`} href="#clause-4" />
          </dl>
        )}

        <div className="tl-hero-actions">
          <ApplyLink />
          <Link href={other.href} className="tl-ghost">
            Read the {other.label}
          </Link>
        </div>
      </header>

      <div className="tl-layout">
        <aside className="tl-aside">
          <LegalReader prefix={prefix} items={items} label="Contents" />
        </aside>

        <article aria-labelledby="tl-title" className="tl-article">
          <details className="tl-toc-mobile">
            <summary>
              <span>Contents</span>
              <span className="tl-toc-mobile-count">{count}</span>
            </summary>
            <ol>
              {items.map((it) => (
                <li key={it.n}>
                  <a href={`#${prefix}-${it.n}`}>
                    <span>{String(it.n).padStart(2, "0")}</span>
                    {it.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <LegalSections doc={doc} prefix={prefix} />

          <footer className="tl-end">
            <p className={`${DISPLAY} tl-end-title`}>End of the {title}</p>
            <p className="tl-end-line">
              Questions? Write to{" "}
              <a href="mailto:info@affhan.com" className="tl-link">
                info@affhan.com
              </a>
              .
            </p>
            <div className="tl-hero-actions">
              <ApplyLink />
              <Link href={other.href} className="tl-ghost">
                Read the {other.label}
              </Link>
              <Link href="/free-china-trip/" className="tl-ghost">
                Back to the trip
              </Link>
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}

function KeyFact({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="tl-key">
      <dt>{label}</dt>
      <dd>
        <a href={href} className={`${DISPLAY} tl-key-value`}>
          {value}
        </a>
      </dd>
    </div>
  );
}

/** The landing page's gold button (ApplyButton's look), as a plain link: the
 *  application asks for the agreement itself, before it starts. */
function ApplyLink() {
  return (
    <Link
      href={TRIP_APPLY_HREF}
      className="cx-apply cx-apply-md group relative inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white)"
    >
      <span className="cx-apply-body">
        <span aria-hidden className="cx-apply-rim" />
        <span aria-hidden className="cx-apply-face" />
        <span aria-hidden className="cx-apply-sheen" />
        <span className="cx-apply-label">Apply for the Trip</span>
        <span aria-hidden className="cx-apply-port">
          <ArrowRight className="cx-apply-arrow" strokeWidth={2.2} />
          <Plane className="cx-apply-plane" strokeWidth={1.9} />
        </span>
      </span>
    </Link>
  );
}
