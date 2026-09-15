import { OFFICES } from "@/lib/brand";

/**
 * The open roles, in one place.
 *
 * These used to live inside `prisma-roles.tsx`, which is a client component —
 * so neither the careers layout nor the per-role pages could read them to emit
 * JobPosting markup without duplicating the list, and a duplicated list is one
 * that eventually disagrees with itself. Same extraction as `src/lib/rankings.ts`:
 * the data moves to a plain module, the components keep the rendering.
 *
 * `offices` names keys in OFFICES rather than repeating the cities, so a job's
 * location and the address in its schema can never drift apart. The visible
 * card label is derived from them.
 */
export type CareerRole = {
  /** Also the DOM id on the overview grid (`role-01`). */
  id: string;
  /** URL segment: /careers/<slug>/. Never change one without a redirect. */
  slug: string;
  title: string;
  /** Keys of OFFICES. First one is the primary location. */
  offices: (keyof typeof OFFICES)[];
  /** One line, used on the role page under the H1 and in its description. */
  blurb: string;
  /** Why this role exists here, in terms of how the company actually runs. */
  context: string;
  features: string[];
  metaTitle: string;
  metaDescription: string;
};

/**
 * The day this list was last confirmed accurate — NOT a decorative constant.
 *
 * Google reads it as `datePosted` and treats stale postings as a quality
 * problem, so it has to be moved whenever the roles below change. There is
 * deliberately no `validThrough`: these are standing roles with no closing
 * date, and Google's guidance is to omit the property rather than invent one.
 *
 * Nothing here states a salary or an employment type either. Nobody has given
 * us either figure, and a guess published as structured data is still a guess.
 */
export const ROLES_CONFIRMED_ON = "2026-09-13";

export const ROLES: CareerRole[] = [
  {
    id: "01",
    slug: "sourcing-specialist",
    title: "Sourcing Specialist",
    offices: ["guangzhou", "chennai"],
    blurb:
      "Find the factory, agree the price, and hold the supplier to it — the buying end of every order Affhan ships.",
    context:
      "Affhan's catalogue runs to more than 10 lakh items across 500+ categories, but nothing on the site carries a price, because nothing on it is stock. Every job starts as an inquiry: a photograph, a specification, a quantity and a destination. Turning that into a named factory and a landed cost is this role.",
    features: [
      "Build and manage Chinese supplier relationships",
      "Negotiate pricing, MOQs and lead times",
      "Source products to match client requirements",
    ],
    metaTitle: "Sourcing Specialist Job | Affhan Guangzhou & Chennai",
    metaDescription:
      "Sourcing Specialist role at Affhan International in Guangzhou or Chennai. Find factories, negotiate pricing and MOQs, and source to client specification.",
  },
  {
    id: "02",
    slug: "quality-control-inspector",
    title: "Quality Control Inspector",
    offices: ["guangzhou"],
    blurb:
      "Stand in the factory before the container is sealed, and say whether it ships.",
    context:
      "Most of what Affhan moves is made to a customer's specification rather than pulled off a shelf, and the customer is usually several thousand miles from the line it is made on. The inspection in Guangdong is the only point at which a problem is still cheap to fix.",
    features: [
      "Conduct on-site factory inspections and audits",
      "Enforce international compliance standards",
      "Document defects and drive corrective action",
    ],
    metaTitle: "Quality Control Inspector Job in Guangzhou | Affhan",
    metaDescription:
      "QC Inspector role at Affhan International in Guangzhou, China. Run on-site factory inspections and audits, enforce compliance and drive corrective action.",
  },
  {
    id: "03",
    slug: "logistics-freight-coordinator",
    title: "Logistics & Freight Coordinator",
    offices: ["chennai", "dubai"],
    blurb:
      "Route it, book it, clear it, and know where it is when someone asks.",
    context:
      "Affhan is an NVOCC as well as a forwarder, so the choice between LCL and FCL, sea and air, and one routing and another is made in-house rather than handed to a carrier. Customs paperwork is handled at both ends, which is why this role sits in Chennai and Dubai rather than at a single desk.",
    features: [
      "Oversee end-to-end freight and forwarding",
      "Optimise sea, air and multimodal routing",
      "Handle customs clearance and documentation",
    ],
    metaTitle: "Freight & Logistics Coordinator Job | Chennai, Dubai",
    metaDescription:
      "Logistics & Freight Coordinator role at Affhan International in Chennai or Dubai. Sea and air routing, LCL and FCL, customs clearance and documentation.",
  },
  {
    id: "04",
    slug: "b2b-account-manager",
    title: "B2B Account Manager",
    offices: ["uk", "singapore"],
    blurb:
      "Own the customer from the first quote request to the delivered container.",
    context:
      "Because nothing is sold off a shelf, an account here is a sequence of sourcing jobs rather than a repeat order line. The buyer sends a request, the Guangzhou desk prices it, and somebody has to hold the thread from that first message through inspection, shipping and clearance.",
    features: [
      "Own client relationships from inquiry to delivery",
      "Turn quote requests into sourced orders",
      "Grow accounts across global markets",
    ],
    metaTitle: "B2B Account Manager Job | Affhan London & Singapore",
    metaDescription:
      "B2B Account Manager role at Affhan International in London or Singapore. Own client accounts from the first quote request to the delivered container.",
  },
];

/**
 * What a candidate would call the place, where that differs from the postal
 * locality. The UK office is in Mitcham, which is the correct thing to put in
 * a PostalAddress and the wrong thing to put on a job card — nobody searches
 * for work in Mitcham, and the card has always said London.
 */
const CITY_LABEL: Partial<Record<keyof typeof OFFICES, string>> = {
  uk: "London",
};

/** "Guangzhou / Chennai" — what the overview card prints under the job title. */
export function roleLocationLabel(role: CareerRole): string {
  return role.offices
    .map((key) => CITY_LABEL[key] ?? OFFICES[key].address.addressLocality)
    .join(" / ");
}

/** "Guangzhou or Chennai" — the same list, read as a sentence. */
export function roleLocationSentence(role: CareerRole): string {
  const cities = role.offices.map((key) => CITY_LABEL[key] ?? OFFICES[key].address.addressLocality);
  if (cities.length === 1) return cities[0];
  return `${cities.slice(0, -1).join(", ")} or ${cities[cities.length - 1]}`;
}

/** trailingSlash: true, so every internal link has to end in one. */
export function rolePath(role: CareerRole): string {
  return `/careers/${role.slug}/`;
}

export function roleBySlug(slug: string): CareerRole | undefined {
  return ROLES.find((r) => r.slug === slug);
}

/**
 * The landing page for the city an office sits in, where one exists.
 *
 * Guangzhou's is the office tour rather than a service page, and there is no
 * page for Melaka or Paris — those keys simply return nothing rather than
 * linking somewhere that does not exist.
 */
export const OFFICE_LANDING_PAGE: Partial<Record<keyof typeof OFFICES, { href: string; label: string }>> = {
  chennai: { href: "/sourcing-company-chennai/", label: "our Chennai office" },
  dubai: { href: "/sourcing-company-dubai/", label: "our Dubai office" },
  uk: { href: "/sourcing-company-uk/", label: "our UK office" },
  singapore: { href: "/sourcing-company-singapore/", label: "our Singapore office" },
  malaysia: { href: "/sourcing-company-malaysia/", label: "our Malaysia office" },
  guangzhou: { href: "/china-sourcing-office-guangzhou/", label: "our Guangzhou office" },
};
