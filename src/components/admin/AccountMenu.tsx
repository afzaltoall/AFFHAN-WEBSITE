"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Mail, Moon, Sun } from "lucide-react";
import { Avatar } from "@/components/admin/AssigneePicker";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";

/**
 * The slice of the console palette this menu needs. Theme satisfies it, and
 * so does the smaller object AdminRail builds for itself — neither has to
 * grow to pass through here.
 */
export interface AccountTheme {
  navActive: string; navIdle: string; soft: string; mid: string;
  border: string; hover: string; modal: string;
}
/**
 * The account, as one row that opens what you can do with it.
 *
 * Four buttons used to sit at the foot of the rail permanently — change email,
 * change password, the theme, sign out — which is 160px of navigation spent on
 * things nobody does twice a month, in a rail that has to scroll to reach the
 * queue. They are behind the profile chip now: the photo and the name, which
 * is what the foot of a console is for, and the rest a click away.
 *
 * The panel is portalled and fixed, like FilterMenu's and AssignMenu's, for
 * exactly the reason theirs are: the rail is overflow-hidden, and anything
 * absolutely positioned inside it is cut off at the edge. It opens upward,
 * because it is at the bottom of the screen.
 */
export function AccountMenu({
  t, name, image, dark, label, onEmail, onPassword, onToggleDark, onSignOut,
}: {
  t: AccountTheme;
  name: string;
  image: string | null;
  dark: boolean;
  /** The rail's collapsing-label class, so the chip follows the rail. */
  label: string;
  /**
   * Opening the two dialogs. They live on the dashboard, so every other page
   * leaves these out and the menu links to the dashboard with ?account=,
   * which it reads on arrival — the same trick the four views use with ?view=.
   * The menu reads the same either way; only the journey differs.
   */
  onEmail?: () => void;
  onPassword?: () => void;
  /**
   * Left out by the pages that have no dark theme of their own — most of the
   * admin area. A switch that changes nothing you can see is worse than no
   * switch, so those menus simply do not carry one.
   */
  onToggleDark?: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; width: number; bottom: number; maxHeight: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const M = 8;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(236, vw - M * 2);
      // Aligned to the chip, then pulled inside the viewport — which is what
      // puts it beside the rail rather than under it when the rail is at 60px.
      const left = Math.max(M, Math.min(b.left, vw - width - M));
      setPos({ left, width, bottom: vh - b.top + 6, maxHeight: b.top - M * 2 });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = `flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${t.hover} ${t.mid}`;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name}
        className={`flex w-full items-center rounded-xl px-1.5 py-1.5 transition-colors ${open ? t.navActive : t.navIdle}`}
      >
        {/* The same 32px column the nav icons use, so the photo sits on the
            rail's midline with them rather than half a pixel off it. */}
        <span className="relative flex h-7 w-8 shrink-0 items-center justify-center">
          {image ? (
            <Avatar name={name} image={image} size={28} />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10">
              <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
            </span>
          )}
        </span>
        <span className={`min-w-0 flex-1 leading-tight ${label}`}>
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className={`block text-[11px] ${t.soft}`}>Administrator</span>
        </span>
        <span className={label}>
          <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "" : "rotate-180"}`} />
        </span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: "fixed", left: pos.left, bottom: pos.bottom, width: pos.width,
            maxHeight: pos.maxHeight, overflowY: "auto",
          }}
          className={`z-[200] overflow-hidden rounded-2xl p-1.5 shadow-xl ring-1 ${t.modal}`}
        >
          {/* Who this is, said once at the top: collapsed to 60px the chip is a
              photograph and nothing else, so the panel has to name the account
              it is about. */}
          <div className={`mb-1 border-b px-2.5 pb-2 pt-1 ${t.border}`}>
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className={`text-[11px] ${t.soft}`}>Administrator</p>
          </div>
          {onEmail ? (
            <button role="menuitem" onClick={() => { setOpen(false); onEmail(); }} className={item}>
              <Mail size={15} className="shrink-0" />
              <span className="flex-1">Change email</span>
            </button>
          ) : (
            <Link role="menuitem" href="/admin/?account=email" onClick={() => setOpen(false)} className={item}>
              <Mail size={15} className="shrink-0" />
              <span className="flex-1">Change email</span>
            </Link>
          )}
          {onPassword ? (
            <button role="menuitem" onClick={() => { setOpen(false); onPassword(); }} className={item}>
              <KeyRound size={15} className="shrink-0" />
              <span className="flex-1">Change password</span>
            </button>
          ) : (
            <Link role="menuitem" href="/admin/?account=password" onClick={() => setOpen(false)} className={item}>
              <KeyRound size={15} className="shrink-0" />
              <span className="flex-1">Change password</span>
            </Link>
          )}
          {/* The one that stays open: it changes the screen underneath, and
              closing the menu to show that off would mean reopening it to
              change your mind. */}
          {onToggleDark && (
            <button role="menuitemcheckbox" aria-checked={dark} onClick={onToggleDark} className={item}>
              {dark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
              <span className="flex-1">{dark ? "Light mode" : "Dark mode"}</span>
            </button>
          )}
          <div className={`my-1 border-t ${t.border}`} />
          <button role="menuitem" onClick={() => { setOpen(false); onSignOut(); }} className={`${item} text-red-600`}>
            <LogOut size={15} className="shrink-0" />
            <span className="flex-1">Sign out</span>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

export default AccountMenu;
