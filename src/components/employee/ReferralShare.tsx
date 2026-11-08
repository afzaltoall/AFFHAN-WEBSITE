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
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold sm:h-9 sm:gap-1.5 sm:text-[13px] ${wt.pill}`}
    >
      {done ? <Check className="size-[18px] text-emerald-600 sm:size-3.5" /> : <Copy className="size-[18px] sm:size-3.5" />} {done ? "Copied" : label}
    </button>
  );
}

/**
 * The employee's link, to hand out (My referrals): copy it, or send it on WhatsApp with a line of its own. It opens
 * the trip's page, and whoever applies after coming through it is credited to them; nobody is ever asked for a code.
 * On a phone (2026-11-08) both are the card's full width and a thumb's height, WhatsApp first, as that is how a phone
 * hands it out; from sm up, the two small pills side by side, as before.
 */
export function ReferralShare({ link }: { link: string }) {
  const message = `Apply for the Free China Business Trip with AFFHAN: ${link}`;
  return (
    <div className="grid gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
      <CopyButton text={link} label="Copy link" />
      <a
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="order-first inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[15px] font-semibold text-white hover:bg-black sm:order-none sm:h-9 sm:gap-1.5 sm:text-[13px]"
      >
        <MessageCircle className="size-[18px] sm:size-3.5" /> Share on WhatsApp
      </a>
    </div>
  );
}
