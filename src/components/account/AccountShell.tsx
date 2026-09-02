"use client";

import { motion } from "framer-motion";

/**
 * The furniture every account section shares: a heading, and a white card to
 * put things in. Here rather than repeated four times so the sections cannot
 * drift into four slightly different paddings.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] ${className}`}
    >
      {children}
    </div>
  );
}

/** Fades a section in once, so moving between them is not a hard cut. */
export function Fade({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * What a section shows when there is genuinely nothing in it yet.
 *
 * An empty state that says what to do next is the difference between "this is
 * broken" and "you have not done this yet" — and these two sections start
 * empty for everybody, so it is the first thing most people will see.
 */
export function EmptyState({
  Icon,
  title,
  body,
  action,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
        <Icon size={22} className="text-slate-400" />
      </span>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
