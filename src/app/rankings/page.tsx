import type { Metadata } from "next";
import { RankingsClient } from "./RankingsClient";
import { getCachedRankings, DEFAULT_GROUP_LIMIT } from "@/lib/rankings";

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
// page costs nothing extra — it is already cached, keyed per tab/scope/page.
// Everything past the first page still goes through the API from the client.

export const metadata: Metadata = {
  title: "Top Ranking | Affhan",
  description:
    "The most-stocked categories in Affhan's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
  alternates: { canonical: "https://affhan.com/rankings/" },
  openGraph: {
    title: "Top Ranking | Affhan",
    description:
      "The most-stocked categories in Affhan's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
    url: "https://affhan.com/rankings/",
    type: "website",
    siteName: "Affhan",
    images: [{ url: "/images/logo.png", width: 800, height: 600 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Top Ranking | Affhan",
    description:
      "The most-stocked categories in Affhan's sourcing catalogue, with a sample of products from each. Request a quote on anything you see.",
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
  const initial = await getCachedRankings("hot", 0, DEFAULT_GROUP_LIMIT, null);

  return (
    <RankingsClient
      initialGroups={initial.groups}
      initialHasMore={initial.hasMore}
      initialScopeName={initial.scopeName}
    />
  );
}
