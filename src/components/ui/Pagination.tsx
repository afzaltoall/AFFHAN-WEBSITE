"use client";

import { useState } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Numbered pager (1, 2, 3 ... N) with a sliding window around the current
// page.
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const [jumpPage, setJumpPage] = useState("");

  if (totalPages <= 1) return null;

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpPage, 10);
    if (!isNaN(target)) {
      const clamped = Math.max(1, Math.min(totalPages, target));
      onPageChange(clamped);
      setJumpPage("");
    }
  };

  const keep = new Set<number>(
    [1, totalPages, page - 2, page - 1, page, page + 1, page + 2].filter(p => p >= 1 && p <= totalPages)
  );
  const sorted = Array.from(keep).sort((a, b) => a - b);

  const items: Array<number | "ellipsis"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) items.push("ellipsis");
    items.push(p);
    prev = p;
  }

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-12 flex-wrap">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Prev
      </button>
      {items.map((it, i) =>
        it === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm select-none">...</span>
        ) : (
          <button
            key={it}
            onClick={() => onPageChange(it)}
            className={`min-w-9 h-9 px-2 rounded-lg text-sm font-semibold transition-colors ${
              it === page ? "bg-brand text-white" : "text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {it}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>

      {totalPages > 20 && (
        <form onSubmit={handleJump} className="flex items-center gap-2 ml-2 sm:ml-4">
          <span className="text-sm text-slate-500">Go to page:</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            className="w-16 h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            placeholder="No."
          />
          <button
            type="submit"
            disabled={!jumpPage}
            className="h-9 px-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Go
          </button>
        </form>
      )}
    </nav>
  );
}
