/**
 * The company's identity, in one place, matched to the Google Business Profiles.
 *
 * Local ranking rests on the site and the verified profile agreeing about who
 * this business is — the name, the address, the phone number, the accounts.
 * Google reconciles those signals across every page it crawls, and a second
 * spelling of an address is not extra information to it, it is a contradiction.
 *
 * Before this file the UK office existed on the site in three different forms:
 * "No.4, Laings Corner, Mitcham CR4 2JA" in the page schema, "34, Monarch
 * parade London Road Mitcham CR4 3HA" on the office card, and a phone number
 * (+44 7438 911975) that matched neither the card's own page nor the profile.
 * The office card held the right address all along. Constants cannot drift
 * like that; text copied between eight files always does.
 *
 * Everything here is read off the Google Business Profiles the company
 * verifies and controls. Where a profile does not state something — a full
 * week of opening hours, a geo coordinate — it is absent here rather than
 * guessed, because a plausible invention is worse than a missing field.
 */

/** Canonical profile URLs, matching the "Social profiles" list on every GBP. */
export const SOCIAL_PROFILES = [
  "https://www.facebook.com/affhaninternational",
  "https://www.instagram.com/affhanglobal",
  "https://www.linkedin.com/company/affhanglobal/",
  "https://www.youtube.com/@affhan_global",
  "https://www.tiktok.com/@affhan_global",
  "https://x.com/affhan_shipping",
] as const;

/** The single Organization every location page points its parent at. */
export const ORG_ID = "https://affhan.com/#organization";

/** "Opening date: 1 July 2000", stated identically on all four profiles. */
export const FOUNDING_DATE = "2000-07-01";

export const SITE_URL = "https://affhan.com";
export const LOGO_URL = "https://affhan.com/images/logo.png";

export interface OfficeNap {
  /** The registered entity, spelled as the Google profile spells it. */
  legalName: string;
  /**
   * Whether these values were read off the verified Google profile, or come
   * from the company's own records. False is not a problem — it is a note that
   * this address has not yet been reconciled against a listing.
   */
  profileConfirmed: boolean;
  /** E.164, the only form that is unambiguous across countries. */
  telephone: string;
  /** Extra numbers the profile lists, in the order it lists them. */
  altTelephones?: string[];
  /** wa.me link where the profile publishes one as its chat channel. */
  whatsapp?: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode?: string;
    postOfficeBoxNumber?: string;
    addressCountry: string;
  };
}

/**
 * Every office the site publishes an address for.
 *
 * Four of the five are confirmed against their Google Business Profile. The
 * Singapore entry is marked `profileConfirmed: false`: the profile exists —
 * Jalan Besar, primary category "Importer and Exporter" — but its address and
 * phone tab has not been read, so those values still come from the company's
 * own records. The flag is here so the distinction stays visible rather than
 * being quietly forgotten once everything looks tidy.
 *
 * Guangzhou has no profile and no separate landing page, so it stays in
 * OfficeLocations with the rest of the card content.
 */
export const OFFICES = {
  chennai: {
    profileConfirmed: true,
    legalName: "AFFHAN INTERNATIONAL PVT LTD",
    // The profile's primary number. The Royapuram landline is real but
    // secondary, and schema.org telephone takes one value — it should be the
    // number Google already associates with the listing.
    telephone: "+91-90920-09044",
    altTelephones: ["+91-44-4743-2777"],
    address: {
      streetAddress: "Appavoo Tower West, 69/46, 3, S Madha Church Street, near Harbour Gate, Royapuram",
      addressLocality: "Chennai",
      addressRegion: "Tamil Nadu",
      postalCode: "600013",
      addressCountry: "IN",
    },
  },
  dubai: {
    profileConfirmed: true,
    legalName: "AFFHAN SHIPPING LLC",
    telephone: "+971-54-406-5867",
    whatsapp: "https://wa.me/971544065867",
    address: {
      streetAddress: "White Crown Building, Office 203, Sheikh Zayed Road, Trade Centre 1",
      addressLocality: "Dubai",
      postOfficeBoxNumber: "7184",
      addressCountry: "AE",
    },
  },
  uk: {
    profileConfirmed: true,
    legalName: "AFFHAN INTERNATIONAL LTD",
    // The profile's contact number, which the office card disagreed with
    // (+44 7438 911975) before this file existed.
    telephone: "+44-7815-098806",
    // Monarch Parade, Mitcham — confirmed by the company, and the Google
    // profile has been updated to match it.
    //
    // Worth recording why, because the evidence pointed the other way for a
    // while: the profile briefly read "34 London Road, London SW17 9HP", which
    // is Tooting rather than Mitcham, and that reading was taken as
    // authoritative here. It was the profile that was wrong. CR4 3HA is the
    // real office; Mitcham is the Royal Mail post town for CR4.
    address: {
      streetAddress: "34 Monarch Parade, London Road",
      addressLocality: "Mitcham",
      addressRegion: "Greater London",
      postalCode: "CR4 3HA",
      addressCountry: "GB",
    },
  },
  malaysia: {
    profileConfirmed: true,
    legalName: "AFFHAN INTERNATIONAL SDN. BHD.",
    telephone: "+60-11-5672-6242",
    altTelephones: ["+60-16-654-5911"],
    whatsapp: "https://wa.me/601156726242",
    address: {
      streetAddress: "18, Jalan Temenggong",
      addressLocality: "Melaka",
      postalCode: "75000",
      addressCountry: "MY",
    },
  },
  singapore: {
    // The profile exists but its contact tab has not been read, so this is the
    // company's own record — the same address and number the office card on
    // every page already publishes.
    profileConfirmed: false,
    legalName: "AFFHAN INTERNATIONAL PTE. LTD.",
    telephone: "+65-6296-0279",
    address: {
      streetAddress: "10 Jalan Besar, #08-11 Sim Lim Tower",
      addressLocality: "Singapore",
      postalCode: "208787",
      addressCountry: "SG",
    },
  },
} as const satisfies Record<string, OfficeNap>;

/** schema.org PostalAddress from an office entry. */
export function postalAddress(office: OfficeNap) {
  return { "@type": "PostalAddress", ...office.address };
}

/**
 * Opening hours, only where the profile states a full week.
 *
 * Malaysia is the one profile that publishes every day. The others show a
 * fragment in the search panel ("Opens 9 am", "Closes 6 pm") which is not
 * enough to write a week from, so they are left as they are rather than
 * filled in with a guess that would then contradict the profile.
 */
export const MALAYSIA_HOURS = [
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday"],
    opens: "09:00",
    closes: "17:00",
  },
  {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Wednesday", "Thursday", "Friday", "Saturday"],
    opens: "09:00",
    closes: "18:00",
  },
] as const;
