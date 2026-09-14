import type { Metadata } from "next";

// Hiring intent, and only hiring intent.
//
// The old description read "global sourcing, quality control, freight and
// logistics teams across Chennai, Guangzhou, London…", which is how the
// sourcing-company-in-<city> pages describe themselves — the careers page was
// quietly bidding for their queries with a page that has no service on it. The
// roles come first now, and the cities sit in their own sentence.
const PAGE_TITLE = "Careers at AFFHAN Group | Sourcing, QC and Freight Jobs";
const PAGE_DESCRIPTION =
  "Jobs at AFFHAN International. Open roles in sourcing, quality control, freight and account management. Hiring in Chennai, Guangzhou, London and Dubai.";

// Applies to /careers/ and is inherited by /careers/<role>/, which is why each
// role page sets its own title, description, canonical and OG card in full.
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "https://affhan.com/careers/" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "https://affhan.com/careers/",
    siteName: "AFFHAN Group",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

// No JobPosting markup here any more.
//
// Four postings used to be emitted from this layout, which put all four on
// /careers/ — and, because a layout wraps its children, would now repeat all
// four on every /careers/<role>/ page as well. Google asks for one posting per
// URL to be eligible for the jobs experience, so each posting moved to the page
// that is actually about it: src/app/careers/[role]/page.tsx.
export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
