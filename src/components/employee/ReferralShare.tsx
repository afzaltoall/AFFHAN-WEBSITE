"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { wt } from "@/components/employee/workspace-ui";

/** Copy one thing, and say so for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      window.prompt("Copy this:", text);
    }
  };
  return (
    <button type="button" onClick={() => void copy()} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold ${wt.pill}`}>
      {done ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {done ? "Copied" : label}
    </button>
  );
}

/**
 * The employee's link, to hand out (My referrals): copy it, or send it on WhatsApp with a line of its own. It opens
 * the trip's page, and whoever applies after coming through it is credited to them; nobody is ever asked for a code.
 */
export function ReferralShare({ link }: { link: string }) {
  const message = `Apply for the Free China Business Trip with AFFHAN: ${link}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton text={link} label="Copy link" />
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-semibold text-white hover:bg-black"
      >
        <MessageCircle size={14} /> Share on WhatsApp
      </a>
    </div>
  );
}
