import { Plane } from "lucide-react";
import { flagUrl } from "@/lib/countries";
import type { TripRegistration } from "@/components/TripAccess/useTripStatus";
import { DISPLAY } from "@/components/CinematicExperience/parts";
import { REGISTERED } from "./content";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** "1 Oct 2026 · 17:42 IST" */
function registeredAt(iso: string) {
  const p = Object.fromEntries(WHEN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} IST`;
}

/**
 * The participant's own registration, as a boarding pass: their name, their
 * Trip ID, where from, when they registered, and when the winners are
 * announced; a perforated stub with the status. Their own details, shown to
 * them only. `stamp` presses a gold REGISTERED seal on, for the moment they
 * arrive from the application.
 */
export function BoardingPass({ reg, stamp }: { reg: TripRegistration; stamp: boolean }) {
  const P = REGISTERED.pass;
  return (
    <article className={`tr-pass ${stamp ? "tr-pass-stamp" : ""}`} aria-label={`${P.kind}: ${reg.fullName}, ${P.tripId} ${reg.referenceNo}`}>
      <div className="tr-pass-main">
        <header className="tr-pass-head">
          <span className="tr-pass-brand">{P.brand}</span>
          <span className="tr-pass-kind">{P.kind}</span>
        </header>
        <div className="tr-pass-grid">
          <div className="tr-pass-field tr-pass-wide">
            <span className="tr-pass-label">{P.passenger}</span>
            <span className={`${DISPLAY} tr-pass-name`}>{reg.fullName}</span>
          </div>
          <div className="tr-pass-field tr-pass-wide">
            <span className="tr-pass-label">{P.tripId}</span>
            <span className="tr-pass-id">{reg.referenceNo}</span>
          </div>
          <div className="tr-pass-route tr-pass-wide" aria-hidden>
            <span className="tr-pass-place">
              <span className="tr-pass-label">{P.from}</span>
              <span className="tr-pass-city">
                {reg.iso && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flagUrl(reg.iso)} alt="" width={20} height={14} className="tr-flag" />
                )}
                {reg.country}
              </span>
              <span className="tr-pass-sub">{reg.city}</span>
            </span>
            <span className="tr-pass-flight">
              <span className="tr-pass-dash" />
              <Plane size={18} strokeWidth={1.8} className="tr-pass-plane" />
              <span className="tr-pass-dash" />
            </span>
            <span className="tr-pass-place tr-pass-place-to">
              <span className="tr-pass-label">{P.to}</span>
              <span className="tr-pass-city">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl("cn")} alt="" width={20} height={14} className="tr-flag" />
                {P.toValue}
              </span>
            </span>
          </div>
          <p className="sr-only">
            {P.from} {reg.city}, {reg.country}. {P.to} {P.toValue}.
          </p>
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.registered}</span>
            <span className="tr-pass-value">{registeredAt(reg.createdAt)}</span>
          </div>
          <div className="tr-pass-field">
            <span className="tr-pass-label">{P.announced}</span>
            <span className="tr-pass-value">{REGISTERED.pool.date}</span>
          </div>
        </div>
      </div>
      <div className="tr-pass-stub">
        <span aria-hidden className="tr-pass-perf" />
        <span className="tr-pass-label">Status</span>
        <span className="tr-pass-status">{P.status}</span>
        <span className="tr-pass-stub-line">{P.stub}</span>
      </div>
      {stamp && (
        <span aria-hidden className="tr-stamp">
          {REGISTERED.board.status}
        </span>
      )}
    </article>
  );
}
