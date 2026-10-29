"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { TRIP_APPLY_HREF, TRIP_REGISTERED_HREF } from "@/lib/trip-legal";
import { PHONE_QUERY } from "@/lib/useIsPhone";

/**
 * sessionStorage: set by the application as it hands a new participant on to
 * their boarding pass ({ ref, at }), so the page greets them; read once and
 * cleared.
 */
export const WELCOME_KEY = "affhan:trip-welcome";

/** The visitor's own registration, by their account or the browser they applied from (/api/trip-applications/me/). */
export interface TripRegistration {
  referenceNo: string;
  createdAt: string;
  fullName: string;
  firstName: string;
  country: string;
  iso: string | null;
  city: string;
  businessStatus: string;
}

/**
 * The visitor's registration: the registration, null for none, or undefined
 * when it could not be told (offline, a server error): a caller then does
 * nothing rather than guessing.
 */
export async function fetchTripRegistration(): Promise<TripRegistration | null | undefined> {
  try {
    const res = await fetch("/api/trip-applications/me/", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { registration?: TripRegistration | null };
    return json.registration ?? null;
  } catch {
    return undefined;
  }
}

/**
 * Where the trip opens: the board for someone who has registered already; on a
 * phone, the application itself (the owner, 2026-10-28: "only in mobile view,
 * once clicking the free china trip directly go to the application"); the
 * trip's page for everyone else. Called in the browser, after a press.
 */
export async function tripEntryHref(): Promise<string> {
  if (await fetchTripRegistration()) return TRIP_REGISTERED_HREF;
  return window.matchMedia(PHONE_QUERY).matches ? TRIP_APPLY_HREF : "/free-china-trip/";
}

/**
 * Who is signed in, and whether the visitor has registered for the trip (by
 * their account, or on this browser: no sign-in is needed to apply). `ready`
 * once both are known. Read again when someone signs in or out.
 */
export function useTripStatus() {
  const { user, loading } = useAuth();
  const [registration, setRegistration] = useState<TripRegistration | null>(null);
  /** The account the registration was read for (null: nobody signed in). */
  const [readFor, setReadFor] = useState<string | null | undefined>(undefined);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    let live = true;
    void fetchTripRegistration().then((r) => {
      if (!live) return;
      setRegistration(r ?? null);
      setReadFor(userId);
    });
    return () => {
      live = false;
    };
  }, [loading, userId]);

  return {
    ready: !loading && readFor === userId,
    signedIn: !!userId,
    user,
    registration: readFor === userId ? registration : null,
  };
}
