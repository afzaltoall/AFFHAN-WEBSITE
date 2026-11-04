"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CupSoda, Headphones, Lightbulb, ShoppingBag, Smartphone, Sun, UserRound, type LucideIcon } from "lucide-react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { CARGO_STATUSES, CARGO_STATUS_META } from "@/lib/cargo-shared";

/**
 * The staff door's left panel, running (the owner, 2026-11-03: "left side animative quotes and leads ... live",
 * "feels empty ... innovative"): the desks the staff sign in to, one after another, each with its headline and a
 * drawing of it at work. The sales desk takes leads in, has them taken and decided; the cargo desk moves a
 * consignment through the tracker's stages, an update for each; the trip desk counts applicants arriving through a link.
 * The headline and its drawing change together, so the panel tells one thing at a time.
 *
 * SAMPLE TEXT ONLY. Nothing here is fetched, nothing is real, and no name belongs to anyone: every one is "Sample …".
 * The drawings are made of the workspace's own pieces (its chips, the cargo tracker's stages, the referral link) so
 * they stay honest as the real screens change.
 *
 * It opens as the still drawing did (the server draws that; the browser takes over from it), and someone who asked
 * for less motion keeps the sales desk, still. aria-hidden on the drawings: a screen reader gets the headline and
 * the form, not invented customers.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
/** How long each desk is shown, long enough for its drawing to play through once. */
const TURN_MS = 10_000;

const DESKS = [
  { key: "sales", title: "The sales desk.", blurb: "The customers you take from the open pool, and the record of what happened to each one." },
  { key: "cargo", title: "The cargo desk.", blurb: "Each consignment's updates as they happen, for its customer to follow by its number." },
  { key: "trip", title: "The trip desk.", blurb: "Your own Free China Trip link, and everyone who applies through it, counted for you." },
] as const;

export function StaffDesks() {
  const [index, setIndex] = useState(0);
  const still = !!useReducedMotion();
  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setIndex((n) => (n + 1) % DESKS.length), TURN_MS);
    return () => window.clearInterval(timer);
  }, [still]);
  const desk = DESKS[index];

  return (
    <div>
      {/* Fixed heights, so nothing under the words moves as they change. */}
      <div className="min-h-[3rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={desk.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="text-4xl font-black leading-tight text-white"
          >
            {desk.title}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="mt-4 min-h-[3.25rem] max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={desk.blurb}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.08 }}
            className="text-[15px] leading-relaxed text-slate-300"
          >
            {desk.blurb}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="max-w-md text-[15px] leading-relaxed text-slate-300">Sign in with the address your administrator registered.</p>

      {/* Which desk, and how long until the next: the one showing fills. */}
      <div aria-hidden="true" className="mt-6 flex gap-2">
        {DESKS.map((d, i) => (
          <span key={d.key} className="h-[3px] w-10 overflow-hidden rounded-full bg-white/15">
            {i === index && (
              <motion.span
                key={`fill-${index}`}
                className="block h-full rounded-full bg-brand"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: still ? 0 : TURN_MS / 1000, ease: "linear" }}
              />
            )}
          </span>
        ))}
      </div>

      {/* The desk at work. One height for all three, so the panel never moves as they change. */}
      <div aria-hidden="true" className="pointer-events-none mt-9 h-[318px] select-none">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={desk.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {desk.key === "sales" ? <SalesDesk still={still} /> : desk.key === "cargo" ? <CargoDesk still={still} /> : <TripDesk still={still} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------------- the frame

/** The card every drawing sits in, as the workspace draws a list: who it is for, and one figure at the right. */
function DeskCard({ title, pill, children }: { title: string; pill: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[28rem] rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark ring-1 ring-white/20">
            <UserRound className="h-3.5 w-3.5 text-white/90" strokeWidth={2.2} />
          </span>
          <span className="text-[11px] font-semibold text-white/70">{title}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold tabular-nums text-white/70 ring-1 ring-white/10">
          {pill}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * A list that runs like a belt: a row comes down into the top from just above the window's edge as every row under it
 * moves down one place, and the one pushed below the window's foot is taken away once it is out of sight. The rows
 * move as one block (the list is put one row up before the frame is drawn, then slides down), so no row can ever be
 * over another. The window is as tall as `show` rows, measured once the list is in the browser.
 */
function Conveyor<T extends { id: number }>({ items, show, row }: { items: T[]; show: number; row: (item: T) => React.ReactNode }) {
  const first = useRef<HTMLLIElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  /** One row and the gap under it: how far the list moves when a row comes in. */
  const step = useRef(0);
  useEffect(() => {
    const h = first.current?.getBoundingClientRect().height;
    if (!h) return;
    setHeight(show * h + (show - 1) * 8);
    step.current = h + 8;
  }, [show]);

  // A new row at the top: the list one row up at once, before this frame is drawn, then down into place.
  const [shift, setShift] = useState(0);
  const top = useRef(items[0]?.id);
  useIsomorphicLayoutEffect(() => {
    const now = items[0]?.id;
    if (now === top.current) return;
    top.current = now;
    if (!step.current) return;
    setShift(-step.current);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShift(0));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [items]);

  return (
    <div className="overflow-hidden" style={height ? { height } : undefined}>
      <ul
        className="space-y-2"
        style={{
          transform: shift ? `translateY(${shift}px)` : undefined,
          transition: shift ? "none" : "transform 500ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {items.map((item, i) => (
          <li key={item.id} ref={i === 0 ? first : undefined} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
            {row(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ticks once a second while the drawing is shown; `step` gets the seconds since it appeared. */
function useSeconds(still: boolean, step: (seconds: number) => void) {
  const latest = useRef(step);
  useEffect(() => {
    latest.current = step;
  });
  useEffect(() => {
    if (still) return;
    let seconds = 0;
    const timer = window.setInterval(() => latest.current(++seconds), 1000);
    return () => window.clearInterval(timer);
  }, [still]);
}

/** A row added at the top, then the one pushed out of the window taken away once it has slid out of sight. */
function pushTop<T>(set: React.Dispatch<React.SetStateAction<T[]>>, item: T, keep: number) {
  set((rows) => [item, ...rows]);
  window.setTimeout(() => set((rows) => rows.slice(0, keep)), 700);
}

const ago = (s: number) => (s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86_400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86_400)}d`);
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** A chip that changes in place, the old fading as the new comes. */
function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={label}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ duration: 0.3, ease: EASE }}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${tone}`}
      >
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------------------------------------ the sales desk

/** The states a lead moves through, in the workspace's colours. */
const LEAD = {
  new: { label: "New", tone: "bg-[#7fd0e2]/10 text-[#9ee3f1] ring-[#7fd0e2]/30", rail: "bg-[#7fd0e2]/70" },
  progress: { label: "In progress", tone: "bg-sky-400/10 text-sky-300 ring-sky-400/25", rail: "bg-sky-400/70" },
  lead: { label: "Lead", tone: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25", rail: "bg-emerald-400/70" },
  passed: { label: "Not attended", tone: "bg-amber-400/10 text-amber-300 ring-amber-400/25", rail: "bg-amber-400/70" },
} as const;
type LeadState = keyof typeof LEAD;
interface LeadRow {
  id: number;
  name: string;
  line: string;
  /** What the product is, drawn in its square where the workspace shows its photo. */
  icon: LucideIcon;
  state: LeadState;
  age: number;
}

const LEADS_START: LeadRow[] = [
  { id: 1, name: "Sample importer", line: "LED panel lights · 500 units", icon: Lightbulb, state: "lead", age: 2 * 3600 },
  { id: 2, name: "Sample buyer", line: "Cotton tote bags · 2,000 units", icon: ShoppingBag, state: "progress", age: 20 * 60 },
  { id: 3, name: "Sample trader", line: "Bluetooth earbuds · 300 units", icon: Headphones, state: "passed", age: 24 * 3600 },
];
const LEAD_ARRIVALS = [
  { name: "Sample retailer", line: "Steel water bottles · 1,000 units", icon: CupSoda },
  { name: "Sample wholesaler", line: "Phone cases · 5,000 units", icon: Smartphone },
  { name: "Sample distributor", line: "Solar garden lights · 800 units", icon: Sun },
];

function SalesDesk({ still }: { still: boolean }) {
  const [rows, setRows] = useState<LeadRow[]>(LEADS_START);
  const [since, setSince] = useState(0);
  const nextId = useRef(1001);
  useSeconds(still, (s) => {
    setSince((n) => n + 1);
    setRows((rs) => rs.map((r) => ({ ...r, age: r.age + 1 })));
    // A lead at one second and at six; each taken two seconds after it came; the one taken before decided at nine.
    if (s === 1 || s === 6) {
      const a = LEAD_ARRIVALS[(s === 1 ? 0 : 1) % LEAD_ARRIVALS.length];
      setSince(0);
      pushTop(setRows, { id: nextId.current++, ...a, state: "new", age: 0 }, 3);
    } else if (s === 3 || s === 8) {
      setRows((rs) => rs.map((r, i) => (i === 0 && r.state === "new" ? { ...r, state: "progress" } : r)));
    } else if (s === 4 || s === 9) {
      setRows((rs) => {
        const at = rs.map((r, i) => (i > 0 && r.state === "progress" ? i : -1)).filter((i) => i > 0).pop();
        return at === undefined ? rs : rs.map((r, i) => (i === at ? { ...r, state: s === 9 ? "passed" : "lead" } : r));
      });
    }
  });
  const shown = rows.slice(0, 3);
  return (
    <DeskCard
      title="Your leads"
      pill={
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          {mmss(Math.max(0, 119 - since))} to respond
        </>
      }
    >
      <Conveyor
        items={rows}
        show={3}
        row={(r) => (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/15 to-white/5 ring-1 ring-white/10">
              <r.icon className="h-[18px] w-[18px] text-white/75" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-white/90">{r.name}</span>
              <span className="block truncate text-[11px] text-white/45">{r.line}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Chip label={LEAD[r.state].label} tone={LEAD[r.state].tone} />
              <span className="text-[10px] tabular-nums text-white/35">{ago(r.age)}</span>
            </span>
          </>
        )}
      />
      {/* The rail the console shows above a list: here, the three rows' states, in their order. */}
      <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-white/5">
        {shown.map((r) => (
          <span key={r.id} className={`w-[29%] transition-colors duration-500 ${LEAD[r.state].rail}`} />
        ))}
        <span className="flex-1 bg-white/10" />
      </div>
    </DeskCard>
  );
}

// ------------------------------------------------------------------------------------------------ the cargo desk

/** The cargo tracker's stages, in its words: its own list (lib/cargo-shared.ts), so a stage added there shows here. */
const STAGES = CARGO_STATUSES.map((s) => CARGO_STATUS_META[s].label);
/** When each was posted, the first the longest ago: one a day, ending today. */
const WHEN = STAGES.map((_, i, all) => (i === all.length - 1 ? "Today" : i === all.length - 2 ? "Yesterday" : `${all.length - 1 - i} days ago`));

function CargoDesk({ still }: { still: boolean }) {
  // Opens sailing; a stage more every two seconds, to the last (delivered since 2026-11-04) before the desk turns.
  const [stage, setStage] = useState(2);
  useSeconds(still, (s) => {
    if (s % 2 === 0) setStage((n) => Math.min(STAGES.length - 1, n + 1));
  });
  const updates = STAGES.slice(0, stage + 1)
    .map((name, i) => ({ id: i + 1 + (i >= 3 ? 1000 : 0), name, when: WHEN[i] }))
    .reverse();
  return (
    <DeskCard title="Your consignments" pill={<>CO-26-000041</>}>
      <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[12px] font-semibold text-white/90">Sample consignment · 40HQ</span>
          <span className="shrink-0 text-[11px] text-white/45">Guangzhou → Chennai</span>
        </div>
        {/* Where it has been in teal, where it is in white, as the customer's tracker draws it; never a colour per stage. */}
        <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
          {STAGES.map((s, i) => (
            <li key={s} className={`h-1.5 rounded-full transition-colors duration-500 ${i < stage ? "bg-brand/80" : i === stage ? "bg-white" : "bg-white/10"}`} />
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-white/55">
          Step {stage + 1} of {STAGES.length} · <span className="font-semibold text-white/90">{STAGES[stage]}</span>
        </p>
      </div>
      <div className="mt-2">
        <Conveyor
          items={updates}
          show={3}
          row={(u) => (
            <>
              <span className="w-[4.5rem] shrink-0 text-[10.5px] tabular-nums text-white/45">{u.when}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/90">{u.name}</span>
              <span className="shrink-0 text-[10px] text-white/35">Posted</span>
            </>
          )}
        />
      </div>
    </DeskCard>
  );
}

// ------------------------------------------------------------------------------------------------- the trip desk

interface Applicant {
  id: number;
  city: string;
  age: number;
}
const APPLICANTS_START: Applicant[] = [
  { id: 1, city: "Madurai", age: 2 * 3600 },
  { id: 2, city: "Coimbatore", age: 5 * 3600 },
  { id: 3, city: "Salem", age: 26 * 3600 },
];
const APPLICANT_CITIES = ["Trichy", "Vellore", "Tirunelveli"];

function TripDesk({ still }: { still: boolean }) {
  const [rows, setRows] = useState<Applicant[]>(APPLICANTS_START);
  const [counted, setCounted] = useState(37);
  const nextId = useRef(1001);
  useSeconds(still, (s) => {
    setRows((rs) => rs.map((r) => ({ ...r, age: r.age + 1 })));
    // Someone applies through the link at one, four and seven seconds, and is counted as they arrive.
    if (s === 1 || s === 4 || s === 7) {
      pushTop(setRows, { id: nextId.current++, city: APPLICANT_CITIES[[1, 4, 7].indexOf(s)], age: 0 }, 3);
      setCounted((n) => n + 1);
    }
  });
  return (
    <DeskCard title="Your referrals" pill={<>{counted} of 100 counted</>}>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
        <span className="truncate text-[11px] text-white/70">affhan.com/free-china-trip/apply/?ref=SAMPLE1</span>
        <span className="shrink-0 text-[10.5px] font-semibold text-[#9ee3f1]">Copy</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${counted}%` }} transition={{ duration: 0.6, ease: EASE }} />
      </div>
      <div className="mt-2.5">
        <Conveyor
          items={rows}
          show={3}
          row={(a) => (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/45 to-brand-dark/40 text-[12px] font-bold text-white ring-1 ring-white/15">
                {a.city[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-white/90">Sample applicant</span>
                <span className="block truncate text-[11px] text-white/45">{a.city}, India</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Chip label="Counted" tone="bg-brand/10 text-[#9ee3f1] ring-brand/30" />
                <span className="text-[10px] tabular-nums text-white/35">{ago(a.age)}</span>
              </span>
            </>
          )}
        />
      </div>
    </DeskCard>
  );
}

export default StaffDesks;
