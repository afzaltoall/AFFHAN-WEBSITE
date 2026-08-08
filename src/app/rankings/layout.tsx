import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Ranking | Affhan Group",
  description:
    "Explore top-ranking and popular products across Affhan's global sourcing categories. Find what's trending and request a quote.",
};

export default function RankingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
