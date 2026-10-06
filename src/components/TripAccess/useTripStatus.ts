"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { TRIP_REGISTERED_HREF } from "@/lib/trip-legal";

/**
 * sessionStorage: set by the application as it hands a new participant on to
 * the board ({ ref, at }), so the board greets them; read once and cleared.
 */
export const WELCOME_KEY = "affhan:trip-welcome";

/** The signed-in account's own registration (/api/trip-applications/me/). */
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
 * The account's registration: the registration, null for none, or undefined
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
 * Where the trip opens for the signed-in visitor: the participants board for
 * someone who has registered already, the trip's page for everyone else.
 */
export async function tripEntryHref(): Promise<string> {
  return (await fetchTripRegistration()) ? TRIP_REGISTERED_HREF : "/free-china-trip/";
}

/**
 * Who is signed in, and whether they have registered for the trip. `ready`
 * once both are known (or known not to apply: nobody signed in).
 */
export function useTripStatus() {
  const { user, loading } = useAuth();
  const [registration, setRegistration] = useState<TripRegistration | null>(null);
  /** The account the registration was read for (null: nobody signed in). */
  const [readFor, setReadFor] = useState<string | null | undefined>(undefined);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setRegistration(null);
      setReadFor(null);
      return;
    }
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
    registration: userId && readFor === userId ? registration : null,
  };
}
