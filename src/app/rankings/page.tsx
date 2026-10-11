import type { Metadata } from "next";
import { RankingsClient } from "./RankingsClient";
import { getCachedRankings, getCachedRankingScopes, DEFAULT_GROUP_LIMIT } from "@/lib/rankings";

// The first screen is rendered here, on the server.
//
// This page used to be entirely "use client": it fetched /api/rankings from
// the browser on mount and rendered skeletons until that returned. Two
// consequences, both measured on production before this change:
//
//   LCP 6.16s, against 1.37s FCP — the gap is the round trip, because nothing
//   worth painting existed until it finished.
//   Zero product content in the HTML: no images, no product links, no prices
//   of any kind. The url is in the sitemap and canonical to itself, and it
//   served crawlers an empty shell.
//
// getCachedRankings is the same function /api/rankings calls, so the first
// page costs nothing extra: both slice one cached list per tab and scope.
// Everything past the first page comes through the API, read ahead of the
// scroll. The scopes (the top-level categories) come from here too, so the
// list of them is on the first paint instead of after a 250KB download.

export const metadata: Metadata = {
  title: "Top Ranking | AFFHAN",
  description:
    "The most-stocked categories in AFFHAN's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
  alternates: { canonical: "https://affhan.com/rankings/" },
  openGraph: {
    title: "Top Ranking | AFFHAN",
    description:
      "The most-stocked categories in AFFHAN's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
    url: "https://affhan.com/rankings/",
    type: "website",
    siteName: "AFFHAN",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Top Ranking | AFFHAN",
    description:
      "The most-stocked categories in AFFHAN's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
  },
};

// Matches the cache inside getCachedRankings. The page is a shell around data
// that changes at most once a minute; regenerating it more often than the data
// underneath would buy nothing.
export const revalidate = 60;

export default async function RankingsPage() {
  // "hot" with no scope is what the client starts on, so this has to be the
  // same arguments — a mismatch would mean the server renders one set of
  // cards and the client immediately replaces them with another.
  // Most popular is read too, and not sent: it warms that tab's cached list (a few seconds to build), so the
  // first press of the tab finds it ready instead of waiting on it behind the cards it replaces.
  const [initial, scopes] = await Promise.all([
    getCachedRankings("hot", 0, DEFAULT_GROUP_LIMIT, null),
    getCachedRankingScopes(),
    getCachedRankings("popular", 0, 1, null),
  ]);

  return <RankingsClient initialGroups={initial.groups} initialHasMore={initial.hasMore} initialScopeName={initial.scopeName} scopes={scopes} />;
}
