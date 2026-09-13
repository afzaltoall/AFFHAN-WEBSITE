import type { Metadata } from "next";
import { LOGO_URL, OFFICES, ORG_ID, SITE_URL, postalAddress } from "@/lib/brand";
import { ROLES, ROLES_CONFIRMED_ON, roleLocationLabel } from "@/lib/careerRoles";

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

// One JobPosting per open role.
//
// The page listed four roles in plain markup, so a search engine could read
// them as prose and nothing more — no job rich result, no eligibility for the
// jobs experience. These nodes say the same thing in the vocabulary Google
// reads.
//
// Two deliberate omissions:
//
//   `validThrough` — these are standing roles with no closing date, and
//   Google's guidance is to leave the property out rather than invent one.
//   `datePosted` instead comes from ROLES_CONFIRMED_ON, which is a maintained
//   constant, not a decoration: move it whenever the role list changes.
//
//   `baseSalary` and `employmentType` — nobody has stated either, and a guess
//   here is a guess published as structured data.
//
// Caveat worth knowing: Google asks for one posting per URL, so four postings
// sharing /careers/ are valid markup but not the shape that earns a job rich
// result. Splitting them into /careers/<role>/ pages is the follow-up.
const jobPostings = ROLES.map((role) => ({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  identifier: {
    "@type": "PropertyValue",
    name: "AFFHAN Group",
    value: `affhan-role-${role.id}`,
  },
  title: role.title,
  // Google requires a full description and accepts HTML. Built from the same
  // bullets the card renders, so the two cannot disagree.
  description: [
    `<p>AFFHAN International is hiring a ${role.title} for our ${roleLocationLabel(role)} team.`,
    ` We have sourced, inspected and shipped goods out of China since 2000, from seven offices across Asia, the Middle East and Europe.</p>`,
    `<p>In this role you will:</p><ul>`,
    role.features.map((f) => `<li>${f}</li>`).join(""),
    `</ul>`,
  ].join(""),
  datePosted: ROLES_CONFIRMED_ON,
  hiringOrganization: {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "AFFHAN International Pvt Ltd",
    sameAs: SITE_URL,
    logo: LOGO_URL,
  },
  jobLocation: role.offices.map((key) => ({
    "@type": "Place",
    address: postalAddress(OFFICES[key]),
  })),
  url: `${SITE_URL}/careers/#role-${role.id}`,
}));

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {jobPostings.map((posting) => (
        <script
          key={posting.identifier.value}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(posting) }}
        />
      ))}
      {children}
    </>
  );
}
