import Link from "next/link";
import type { MouseEvent } from "react";
import { sectionAnchor, type LegalBlock, type LegalDoc } from "@/lib/trip-legal";

/**
 * A legal document's sections, set for reading: the page (/free-china-trip/
 * terms/ and /privacy/) and the consent popup both use this, so the two can
 * never differ by a word. The words come from lib/trip-legal.ts; this only
 * sets them.
 *
 * `prefix` makes the anchors (#clause-7 on the Terms page, #section-3 on the
 * Privacy page, something else inside the popup so ids never collide).
 * `level` is the sections' heading level: 2 on a page under its h1, 3 in the
 * popup under its own heading. `onDocLink`, given only by the popup, takes a
 * link to the other document and turns it into a tab change; it returns true
 * when it has handled the click.
 */

const DISPLAY = "font-[family-name:var(--font-cx-display)]";
const pad = (n: number) => String(n).padStart(2, "0");

type DocLinkHandler = (href: string) => boolean;

export function LegalSections({
  doc,
  prefix,
  level = 2,
  onDocLink,
}: {
  doc: LegalDoc;
  prefix: string;
  level?: 2 | 3;
  onDocLink?: DocLinkHandler;
}) {
  const H = level === 2 ? "h2" : "h3";
  const Sub = level === 2 ? "h3" : "h4";
  return (
    <ol className="tl-sections">
      {doc.sections.map((s) => (
        <li key={s.n} id={sectionAnchor(prefix, s)} data-tl-section={s.n} className="tl-section">
          <H id={`${sectionAnchor(prefix, s)}-title`} className="tl-section-title">
            <span aria-hidden className={`${DISPLAY} tl-num`}>
              {pad(s.n)}
            </span>
            <span className="sr-only">{s.n}. </span>
            <span className="tl-section-name">{s.title}</span>
          </H>
          <div className="tl-body">
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} Sub={Sub} onDocLink={onDocLink} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DocLink({ href, children, onDocLink }: { href: string; children: string; onDocLink?: DocLinkHandler }) {
  // A plain click only: Ctrl, ⌘, Shift or a middle click still open the page.
  const onClick = onDocLink
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (onDocLink(href)) e.preventDefault();
      }
    : undefined;
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className="tl-link">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className="tl-link">
      {children}
    </Link>
  );
}

function Block({ block: b, Sub, onDocLink }: { block: LegalBlock; Sub: "h3" | "h4"; onDocLink?: DocLinkHandler }) {
  switch (b.kind) {
    case "p": {
      if (!b.link) return <p className="tl-p">{b.text}</p>;
      const at = b.text.indexOf(b.link.text);
      if (at < 0) return <p className="tl-p">{b.text}</p>;
      return (
        <p className="tl-p">
          {b.text.slice(0, at)}
          <DocLink href={b.link.href} onDocLink={onDocLink}>
            {b.link.text}
          </DocLink>
          {b.text.slice(at + b.link.text.length)}
        </p>
      );
    }
    case "list":
      return (
        <ul className={b.items.length > 8 ? "tl-list tl-list-wide" : "tl-list"}>
          {b.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "notice":
      return (
        <p className="tl-notice">
          <span>{b.text}</span>
        </p>
      );
    case "date":
      return (
        <p className="tl-date">
          <span aria-hidden className="tl-date-mark" />
          <span className={`${DISPLAY} tl-date-text`}>{b.text}</span>
        </p>
      );
    case "sub":
      return <Sub className="tl-sub">{b.text}</Sub>;
    case "address":
      return (
        <address className="tl-address">
          {b.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </address>
      );
    case "email":
      return (
        <p className="tl-email">
          {b.label && <span className="tl-email-label">{b.label} </span>}
          <a href={`mailto:${b.address}`} className="tl-link">
            {b.address}
          </a>
        </p>
      );
    case "facts":
      return (
        <dl className="tl-facts">
          {b.rows.map((r) => (
            <div key={r.label} className="tl-fact">
              <dt>{r.label}</dt>
              <dd>
                {r.href ? (
                  <DocLink href={r.href} onDocLink={onDocLink}>
                    {r.lines.join(" ")}
                  </DocLink>
                ) : (
                  r.lines.map((line) => <span key={line}>{line}</span>)
                )}
              </dd>
            </div>
          ))}
        </dl>
      );
  }
}
