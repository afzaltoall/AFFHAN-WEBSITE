"use client";

// This file held the console's assignee picker, the dropdown an administrator handed leads out with. Leads are
// taken by staff from the open pool now (lib/lead-pool.ts; the owner, 2026-10-22), so the picker has gone and only
// the avatar it shared with the console and Team Performance is left. The file keeps its name so those
// imports did not all have to move.

/** A face, or the initial standing in for one. Shared with the console. */
export function Avatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <span className="flex items-center justify-center rounded-full bg-brand-dark font-semibold uppercase text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name[0]}</span>;
}
