"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

/**
 * Opens a category of the catalogue in place, on the catalogue's own page (/products/): the address changes at
 * once and the catalogue, which reads it (ProductsCatalogue's useUrlParams), turns to that category the same
 * moment; nothing waits on the server (the owner, 2026-10-14, of the phone's categories: "not going to the page,
 * very slow"). Next keeps its history in step through its own pushState hook, so Back, a refresh and a shared
 * link all work. False anywhere else, where it does nothing.
 */
export function openCategoryInPlace(id: string): boolean {
  if (window.location.pathname.replace(/\/+$/, "") !== "/products") return false;
  window.history.pushState(null, "", `/products/?categoryId=${encodeURIComponent(id)}`);
  return true;
}

/** A link to a category that opens it in place (openCategoryInPlace); a click meant for a new tab stays a link's. */
export function CategoryLink({ id, children, onClick, ...rest }: { id: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      href={`/products/?categoryId=${id}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (openCategoryInPlace(id)) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
