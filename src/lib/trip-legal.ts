/**
 * The Free China Business Trip's own Terms & Conditions and Privacy Policy,
 * and the three consents the application asks for: the owner's text, as
 * supplied on 2026-10-01, word for word. Only the section headings are set in
 * title case here (the documents set them in capitals); the CSS can set them
 * however it likes.
 *
 * These are the TRIP's documents. The website's own Terms & Conditions and
 * Privacy Policy (/terms-conditions/, /privacy-policy/) are the main site's
 * and are not these: nothing here may link to or replace them.
 *
 * One source for every place that shows them: the two pages
 * (/free-china-trip/terms/, /free-china-trip/privacy/), the consent popup in
 * front of the application, the landing page's dates, and the application's
 * consents. Change the wording here and it changes everywhere.
 */

export const TRIP_TERMS_HREF = "/free-china-trip/terms/";
export const TRIP_PRIVACY_HREF = "/free-china-trip/privacy/";
export const TRIP_APPLY_HREF = "/free-china-trip/apply/";
/** The boarding pass: where a registered applicant lands, and returns to. */
export const TRIP_REGISTERED_HREF = "/free-china-trip/registered/";

/** One piece of a section, in reading order. */
export type LegalBlock =
  | { kind: "p"; text: string; link?: { text: string; href: string } }
  | { kind: "list"; items: string[] }
  /** A line the document sets in capitals for emphasis ("ECONOMY CLASS ONLY."). */
  | { kind: "notice"; text: string }
  /** A date the document sets on a line of its own. */
  | { kind: "date"; text: string }
  /** A sub-heading inside a section. */
  | { kind: "sub"; text: string }
  | { kind: "address"; lines: string[] }
  | { kind: "email"; label?: string; address: string }
  /** Labelled facts (the programme's official information). */
  | { kind: "facts"; rows: { label: string; lines: string[]; href?: string }[] };

export interface LegalSection {
  /** The document's own number for it, which anchors and links use (#clause-7). */
  n: number;
  title: string;
  blocks: LegalBlock[];
}

/** A section's anchor: #clause-7, #section-3. */
export function sectionAnchor(prefix: string, s: Pick<LegalSection, "n">) {
  return `${prefix}-${s.n}`;
}

export interface LegalDoc {
  /** The document's own title lines, as it sets them. */
  heading: string[];
  /** When the wording last changed, as the page states it ("8 November 2026"). */
  updated: string;
  intro: string[];
  sections: LegalSection[];
}

const p = (text: string, link?: { text: string; href: string }): LegalBlock => ({ kind: "p", text, ...(link ? { link } : {}) });
const list = (...items: string[]): LegalBlock => ({ kind: "list", items });
const notice = (text: string): LegalBlock => ({ kind: "notice", text });
const date = (text: string): LegalBlock => ({ kind: "date", text });
const sub = (text: string): LegalBlock => ({ kind: "sub", text });

const OFFICE = [
  "No. 69/46, Appavoo Tower,",
  "West Madha Church Road,",
  "Near Harbour Gate No. 3,",
  "Royapuram,",
  "Chennai – 600 013,",
  "Tamil Nadu, India",
];
const EMAIL = "info@affhan.com";

// ---- Terms & Conditions ---------------------------------------------------------------------
/**
 * The owner's revised text of 2026-10-01: seventeen clauses. It replaced the
 * first, 35-clause version the same day; its closing Acceptance came out on
 * the owner's request, and clause 14 gained its Medical Expenses and
 * Insurance subsection, in the owner's words, the same day.
 *
 * Brought up to what the trip does on 2026-11-08 (the owner: "update the terms and conditions and privacy policy
 * perfectly what we do what we done"): one application a mobile number and the ID proof through a team member's link
 * (clause 2), a link giving no advantage in the draw (clause 3), and the ID proof's exception to clause 15.
 */
export const TRIP_TERMS: LegalDoc = {
  heading: ["AFFHAN Free China Business Trip", "Terms & Conditions"],
  updated: "8 November 2026",
  intro: [
    "These Terms & Conditions explain the rules for applying to and participating in the Affhan Free China Business Trip organised by AFFHAN INTERNATIONAL PVT LTD.",
    "By submitting an application, you confirm that you have read, understood, and agreed to these Terms & Conditions.",
  ],
  sections: [
    {
      n: 1,
      title: "About the Program",
      blocks: [
        p("The Affhan Free China Business Trip is a group business-travel program."),
        p("Five (5) eligible applicants will be selected to participate in the Trip."),
        p("Applications open on 12 October 2026 and close on 25 November 2026."),
        p("The five winners will be announced on 1 December 2026 through Affhan's official communication channels."),
        p("The Trip date and final itinerary will be announced separately to the selected winners."),
      ],
    },
    {
      n: 2,
      title: "Application & Eligibility",
      blocks: [
        p("Applicants must provide accurate, complete, genuine, and current information."),
        p("Each applicant may submit only one application unless Affhan states otherwise."),
        p("Only one application is accepted for each mobile number."),
        p("Applicants who apply through a link shared with them by a member of the Affhan team must include a copy of one identity document with their application, as described in section 4 of the Privacy Policy."),
        p("An application may be rejected if:"),
        list(
          "the information is incomplete, false, or misleading;",
          "duplicate applications are submitted;",
          "invalid or fraudulent documents are provided; or",
          "the applicant does not meet the published eligibility requirements.",
        ),
      ],
    },
    {
      n: 3,
      title: "How the Five Winners Are Selected",
      blocks: [
        p("All applications are first checked for eligibility."),
        p("Only valid and eligible applicants are entered into the final selection pool."),
        p("Every eligible applicant has an equal opportunity to be selected."),
        p("Applying through a link shared by a member of the Affhan team does not change an applicant's chance of being selected."),
        p("The five winners are selected through a digital random-selection process."),
        p("The final eligible applicant list is entered into an automated random-selection system and randomly shuffled."),
        p("The system does not rank applicants or decide who is better. It randomly selects five applicants from the eligible pool."),
        p("Affhan may also select reserve applicants through the same random-selection process."),
        p("A selected applicant becomes a confirmed winner only after completing the required verification."),
      ],
    },
    {
      n: 4,
      title: "Winner Announcement & Verification",
      blocks: [
        p("The five winners will be announced on:"),
        date("1 December 2026"),
        p("Affhan may contact selected winners using the contact information provided in their application."),
        p("Before final confirmation, Affhan may verify the winner's:"),
        list("identity;", "application information;", "business information;", "eligibility; and", "required travel documents."),
        p("A selected winner must complete the required verification within the time provided by Affhan."),
        p("If a selected winner cannot complete the verification or cannot participate, Affhan may offer the place to the next eligible reserve applicant."),
      ],
    },
    {
      n: 5,
      title: "Passport",
      blocks: [
        p("Each participant is responsible for having a valid passport and all other travel documents required for international travel."),
        p("Affhan may request passport details or a passport copy from selected winners when required for travel booking, verification, or visa processing."),
        p("Participants are responsible for ensuring that their passport remains valid for the intended journey."),
      ],
    },
    {
      n: 6,
      title: "Visa",
      blocks: [
        p("Participants are responsible for meeting all applicable visa and immigration requirements."),
        p("If a selected winner already has a valid visa suitable for the Trip, an eligible visa-related expense may be considered for reimbursement according to Affhan's reimbursement policy."),
        p("If a selected winner does not have the required visa, Affhan may assist with the visa process where operationally feasible."),
        p("Visa approval is decided by the relevant authorities. Affhan does not guarantee visa approval, issuance, processing time, or entry permission."),
        p("If the required visa is refused, cancelled, withdrawn, or unavailable, Affhan may cancel that participant's selection and offer the place to the next eligible reserve applicant."),
      ],
    },
    {
      n: 7,
      title: "Flight",
      blocks: [
        p("The flight included in the Trip is:"),
        notice("ECONOMY CLASS ONLY."),
        p("Where airfare is included, Affhan or its appointed travel provider will determine the airline, route, schedule, baggage allowance, and seat allocation, subject to availability."),
        p("The following are not included unless expressly approved by Affhan:"),
        list(
          "business-class or premium upgrades;",
          "preferred seat upgrades;",
          "additional baggage;",
          "flight/date/route changes; and",
          "other optional airline expenses.",
        ),
        p("Any such additional cost is the participant's responsibility."),
      ],
    },
    {
      n: 8,
      title: "Group Transportation & Business Visits",
      blocks: [
        p("Transportation provided by Affhan during the official Trip itinerary will be group transportation."),
        p("Participants are expected to travel with the group according to the official itinerary."),
        p("Private or individual transportation is not included for personal shopping, private appointments, independent sightseeing, personal errands, or activities outside the official itinerary."),
        p("Markets, showrooms, commercial locations, and planned business destinations will be visited as part of the group itinerary."),
        p("Individual private market visits and one-to-one market transportation are not included."),
        p("Affhan may provide approximately one business guide for every five participants, subject to final group size and operational requirements."),
      ],
    },
    {
      n: 9,
      title: "Accommodation",
      blocks: [
        p("Accommodation provided as part of the Trip will be on a group/shared basis."),
        notice("SINGLE OR PRIVATE ROOM ACCOMMODATION IS NOT INCLUDED."),
        p("Room allocation will be arranged by Affhan according to the group arrangement and availability."),
        p("Any private room, room upgrade, or additional accommodation requested by a participant will be at the participant's own expense unless Affhan confirms otherwise in writing."),
      ],
    },
    {
      n: 10,
      title: "Food & Personal Expenses",
      blocks: [
        p("Food and meals are NOT included in the standard Free China Business Trip arrangement."),
        p("Participants are responsible for their own:"),
        list("breakfast;", "lunch;", "dinner;", "beverages;", "snacks; and", "other food expenses."),
        p("Participants are also responsible for all personal and commercial purchases made during the Trip."),
        p("This includes products, samples, merchandise, gifts, supplier purchases, business purchases, and other personal expenses."),
        p("Affhan does not finance or reimburse personal or commercial purchases unless expressly approved in writing before the expense is incurred."),
      ],
    },
    {
      n: 11,
      title: "Reimbursement & Valid Invoices",
      blocks: [
        p("Where Affhan approves an eligible reimbursement, the participant must provide the required supporting documents."),
        p("Where an invoice is required, it must be a valid invoice issued by the actual supplier or service provider."),
        p("Affhan may reject reimbursement claims supported by documents that are missing, incomplete, altered, duplicated, illegible, invalid, or otherwise unacceptable."),
        p("Affhan may verify invoices, receipts, and proof of payment before processing reimbursement."),
        p("Only expenses approved under Affhan's reimbursement policy are eligible for reimbursement."),
      ],
    },
    {
      n: 12,
      title: "Business Guidance",
      blocks: [
        p("Affhan may provide group business guidance through an assigned business guide during the official Trip."),
        p("Business guidance is provided to support the group's business travel experience."),
        p("Affhan does not guarantee:"),
        list(
          "a particular supplier;",
          "a particular product;",
          "a particular price;",
          "successful negotiations;",
          "contracts;",
          "business partnerships; or",
          "any specific commercial result.",
        ),
      ],
    },
    {
      n: 13,
      title: "Participant Responsibilities & Cancellation",
      blocks: [
        p("Participants must follow applicable laws, immigration requirements, airline rules, accommodation rules, transportation instructions, and the official group itinerary."),
        p("Affhan may cancel or withdraw a participant's selection where:"),
        list(
          "the participant becomes ineligible;",
          "false or misleading information is identified;",
          "required documents are not provided;",
          "the required visa or travel authorisation is unavailable;",
          "the participant does not complete verification;",
          "the participant breaches these Terms & Conditions;",
          "the participant engages in serious misconduct; or",
          "circumstances beyond Affhan's reasonable control prevent participation.",
        ),
        p("A selected winner who voluntarily withdraws may have their place offered to the next eligible reserve applicant."),
      ],
    },
    {
      n: 14,
      title: "Other Important Conditions",
      blocks: [
        p("The selected Trip place is personal and cannot be sold, transferred, or substituted without Affhan's written approval."),
        p("Trip benefits cannot be exchanged for cash unless Affhan expressly states otherwise."),
        p("The Trip does not guarantee any business or commercial success."),
        p("Personal travel insurance, medical expenses, and other personal expenses are the participant's responsibility unless expressly included in the official Trip package."),
        p("The Trip date, flights, accommodation, transportation, destinations, guides, and itinerary may be reasonably changed due to availability, operational requirements, airline changes, government restrictions, visa requirements, safety considerations, or other circumstances beyond Affhan's reasonable control."),
        sub("Medical Expenses and Insurance"),
        p("Unless expressly stated otherwise, medical, accident, health, baggage, or other insurance is not included in the Trip."),
        p("Participants are responsible for their own medical needs, medicines, treatment, hospitalisation, emergency medical care, and related expenses before, during, or in connection with the Trip."),
        p("Affhan does not provide or guarantee medical, health, or accident insurance and does not guarantee the availability, suitability, or outcome of any medical treatment or healthcare service."),
        p("Any medical or related expense incurred by a participant will be the participant's responsibility unless Affhan has expressly confirmed otherwise in writing."),
        p("Any assistance or coordination provided by Affhan in a medical emergency will be subject to availability and the requirements and decisions of the relevant medical or healthcare provider."),
      ],
    },
    {
      n: 15,
      title: "Personal Data",
      blocks: [
        p("Affhan may collect and process personal information required to:"),
        list(
          "manage applications;",
          "check eligibility;",
          "conduct the random selection process;",
          "verify selected winners;",
          "communicate with applicants;",
          "arrange travel and accommodation;",
          "support visa processing;",
          "process approved reimbursements; and",
          "comply with applicable requirements.",
        ),
        p("Passport, visa, identity, and other travel documents will be requested only when reasonably required for the relevant stage of the Program."),
        p("An application made through a link shared by a member of the Affhan team must include a copy of one identity document (clause 2)."),
        p("Please refer to the Affhan Privacy Policy for full information about personal-data handling.", {
          text: "Affhan Privacy Policy",
          href: TRIP_PRIVACY_HREF,
        }),
      ],
    },
    {
      n: 16,
      title: "Governing Law",
      blocks: [
        p("These Terms & Conditions shall be governed by the laws of India."),
        p("Subject to applicable law, disputes arising from these Terms & Conditions shall be subject to the jurisdiction of the competent courts in Chennai, Tamil Nadu, India."),
      ],
    },
    {
      n: 17,
      title: "Official Program Information",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Program", lines: ["AFFHAN FREE CHINA BUSINESS TRIP"] },
            { label: "Organiser", lines: ["AFFHAN INTERNATIONAL PVT LTD"] },
            { label: "Address", lines: OFFICE },
            { label: "Application Opens", lines: ["12 October 2026"] },
            { label: "Application Closes", lines: ["25 November 2026"] },
            { label: "Number of Winners", lines: ["5"] },
            { label: "Winner Announcement", lines: ["1 December 2026"] },
            { label: "Trip Date", lines: ["TO BE ANNOUNCED SEPARATELY"] },
            { label: "Contact", lines: [EMAIL], href: `mailto:${EMAIL}` },
          ],
        },
      ],
    },
  ],
};

// ---- Privacy Policy -----------------------------------------------------------------------------
/**
 * The owner's revised text of 2026-10-01: seventeen sections. It replaced
 * the first, 26-section version the same day.
 *
 * Brought up to what the trip does on 2026-11-08 (the owner: "update the terms and conditions and privacy policy
 * perfectly what we do what we done"; "privacy policy la technical information remove panu"): what the one-page
 * application asks and no Technical Information list (section 1); the ID proof's handling (section 4); what the team
 * member whose link was used sees (section 5); where the website and the documents are kept (section 6); the cookies
 * and browser storage the trip really uses, and no analytics (section 11). The section numbers stay: the pages and
 * the consent sheet link to them.
 */
export const TRIP_PRIVACY: LegalDoc = {
  heading: ["AFFHAN Free China Business Trip", "Privacy Policy"],
  updated: "8 November 2026",
  intro: [
    "AFFHAN INTERNATIONAL PVT LTD respects your privacy and is committed to protecting the personal information you provide when using our website, applying for the Affhan Free China Business Trip, or communicating with us.",
    "This Privacy Policy explains what information we collect, why we collect it, how we use it, when we may share it, and how we protect it.",
  ],
  sections: [
    {
      n: 1,
      title: "Information We Collect",
      blocks: [
        p("When you apply for the Trip, we collect only what the application asks:"),
        sub("Personal Details"),
        list("Full name", "Mobile number", "Country", "City"),
        sub("Business Details"),
        list("Whether you run a business"),
        sub("Application Details"),
        list(
          "Whether you have a valid passport",
          "Your agreement to the Terms & Conditions and this Privacy Policy",
          "A copy of one identity document, only if you apply through a link shared by a member of the Affhan team (see section 4)",
          "The code of that link, so that the team member who shared it is credited (see section 5)",
        ),
        sub("Travel Details"),
        p("Only from selected winners, when required for travel or visa processing:"),
        list(
          "Nationality",
          "Passport information",
          "Passport validity information",
          "Passport copy",
          "Visa information",
          "Travel-readiness information",
          "Other information reasonably required for travel or visa processing",
        ),
        sub("Reimbursement Details"),
        p("Only where an approved reimbursement applies:"),
        list("Invoice details", "Receipt details", "Proof of payment", "Reimbursement information"),
      ],
    },
    {
      n: 2,
      title: "Why We Collect Your Information",
      blocks: [
        p("We may use your information to:"),
        list(
          "Process your application",
          "Credit the Affhan team member whose link you applied through",
          "Check eligibility",
          "Administer the random selection process",
          "Contact applicants",
          "Verify selected winners",
          "Communicate winner announcements",
          "Arrange approved travel services",
          "Arrange accommodation and group transportation",
          "Support visa-related processing where applicable",
          "Process approved reimbursements",
          "Verify invoices and receipts",
          "Prevent fraud and duplicate applications",
          "Respond to enquiries",
          "Improve our website and application process",
          "Maintain necessary records",
          "Meet applicable legal and operational requirements",
        ),
      ],
    },
    {
      n: 3,
      title: "Random Winner Selection",
      blocks: [
        p("Only applicants who meet the published eligibility requirements will be included in the final random-selection pool."),
        p("Applicant information may be used to identify eligible applications and administer the selection process."),
        p("The random-selection system is used to randomly select five winners from the eligible applicant pool. It does not rank applicants or decide who is better based on personal or business characteristics."),
      ],
    },
    {
      n: 4,
      title: "Passport & Visa Information",
      blocks: [
        p("Passport, visa, identity, and other travel-document information will only be requested when reasonably necessary."),
        p("This information may be required for:"),
        list(
          "Final verification",
          "Travel booking",
          "Accommodation arrangements",
          "Visa-related processing",
          "Travel coordination",
          "Applicable legal or travel requirements",
        ),
        p("Where possible, Affhan will request only the information reasonably necessary for the relevant purpose."),
        // Added 2026-11-02: applicants who come through a link from the AFFHAN team add ID proof with the application; one of
        // five IDs since 2026-11-03; the Emirates ID and any other photo ID since 2026-11-04 (ID_PROOFS).
        // 2026-11-08: how it is kept and who can open it (the private bucket in Mumbai, the ID proof lock), and what the
        // browser does to a photo first (IdDocumentField's prepare). Under a heading of its own, after the list above: it
        // sat before "This information may be required for: Travel booking...", which read as if the ID were used for those.
        sub("Identity Document With Your Application"),
        p(
          "If you apply through a link shared with you by a member of the Affhan team, we ask for a photo or PDF of one identity document with your application: your Aadhaar (a masked Aadhaar is accepted), PAN card, Voter ID, driving licence, passport, Emirates ID, or another ID with your photo. It is used only to confirm who you are and to verify your application.",
        ),
        p(
          "Where your browser can, a photo is resized and the location information your camera saved in it is removed before it is uploaded. The document is kept in private, encrypted storage in India, separate from the rest of your application. Only Affhan administrators can open it, and only after entering their password again. The team member who shared the link cannot see it.",
        ),
      ],
    },
    {
      n: 5,
      title: "How We Share Your Information",
      blocks: [
        p("Where necessary to operate the Program, Affhan may share relevant information with trusted service providers such as:"),
        list(
          "Travel and booking providers",
          "Airlines",
          "Accommodation providers",
          "Transportation providers",
          "Visa or travel-document service providers",
          "Technology and hosting providers",
          "Email and communication providers",
          "Payment or reimbursement providers",
          "Professional advisers",
          "Government or regulatory authorities where legally required",
        ),
        p("We only share information that is reasonably necessary for the relevant purpose."),
        p("If you applied through a link shared by a member of the Affhan team, that team member can see your Trip ID, your name, part of your mobile number, the date you applied, and whether your application counts towards their referrals. They cannot see your identity document."),
        p("Affhan does not sell personal information as part of the Free China Business Trip Program."),
      ],
    },
    {
      n: 6,
      title: "International Processing",
      blocks: [
        p("Our website is hosted by Vercel, and your application is stored in a database run by Neon; both are located in the United States. Identity documents are stored with Amazon Web Services in Mumbai, India."),
        p("Because the Program involves international travel, some information may need to be processed by service providers outside India for travel, accommodation, transportation, visa processing, communication, or other Program-related services."),
        p("Such information will be handled according to applicable requirements and the relevant service arrangements."),
      ],
    },
    {
      n: 7,
      title: "Data Security",
      blocks: [
        p("Affhan takes reasonable technical and organisational measures to protect personal information from unauthorised access, misuse, loss, alteration, disclosure, or destruction."),
        p("Access to personal information is limited to authorised personnel and service providers who reasonably require it."),
        p("However, no internet transmission or electronic storage system can be guaranteed to be completely secure."),
      ],
    },
    {
      n: 8,
      title: "How Long We Keep Your Information",
      blocks: [
        p("We may keep personal information for as long as reasonably necessary to:"),
        list(
          "Administer the Program",
          "Verify winners",
          "Arrange travel or visa processing",
          "Process reimbursements",
          "Respond to enquiries",
          "Resolve disputes",
          "Maintain required business or accounting records",
          "Meet applicable legal or regulatory requirements",
        ),
        p("When information is no longer reasonably required, Affhan may delete, anonymise, or securely dispose of it, subject to applicable requirements."),
      ],
    },
    {
      n: 9,
      title: "Your Privacy Rights & Consent",
      blocks: [
        p("Depending on applicable law, you may have rights relating to your personal information, including requesting information about how your data is processed, requesting correction of inaccurate information, making applicable privacy requests, or withdrawing consent where consent is the applicable basis for processing."),
        p("Where consent is required, Affhan will provide appropriate information about what data is being collected and why."),
        p("To make a privacy-related request, contact:"),
        { kind: "email", address: EMAIL },
        p("Affhan may need to verify your identity before processing certain requests."),
      ],
    },
    {
      n: 10,
      title: "Marketing Communications",
      blocks: [
        p("If you separately choose to receive promotional or marketing communications from Affhan, we may use your contact information for those communications."),
        p("You may unsubscribe from promotional communications or contact Affhan at:"),
        { kind: "email", address: EMAIL },
        p("Marketing consent is separate from consent required to administer the Free China Business Trip."),
      ],
    },
    {
      n: 11,
      title: "Cookies & Third-Party Services",
      blocks: [
        p("Our website uses only the cookies and browser storage it needs to work. It does not use advertising or analytics cookies."),
        list(
          "A cookie remembers, on the browser you applied from, which application is yours, so that we can show you your boarding pass. It lasts up to one year.",
          "If you sign in, a cookie keeps you signed in for up to 30 days.",
          "While you fill in the application, your answers so far (your name, mobile number, country, city and business answer, never your passport answer or your agreement) are kept in your browser tab until you send the application or close the tab.",
          "If you arrived through a link shared by a member of the Affhan team, its code is kept in your browser tab for that visit only.",
        ),
        p("When you apply without signing in, Cloudflare runs a security check in the background to confirm that the application comes from a person, and the number of applications sent from one internet connection is limited to prevent misuse. These checks use your internet connection's address and are not used to track you."),
        p("Third-party providers may process information according to their own privacy practices and applicable agreements."),
        p("Cookies are not used to automatically request or collect passport or visa information."),
      ],
    },
    {
      n: 12,
      title: "Winner Information",
      blocks: [
        p("If you are selected as a winner, Affhan may publish or communicate limited winner information as part of the official winner announcement."),
        p("Passport numbers, passport copies, visa documents, private contact information, and other sensitive travel information will not be publicly displayed as part of a standard winner announcement."),
      ],
    },
    {
      n: 13,
      title: "Fraud Prevention",
      blocks: [
        p("Affhan may use application information to identify and investigate:"),
        list(
          "Duplicate applications",
          "Fraudulent submissions",
          "False information",
          "Forged documents",
          "Suspicious reimbursement claims",
          "Misuse of the Program",
        ),
      ],
    },
    {
      n: 14,
      title: "Children",
      blocks: [
        p("The Affhan Free China Business Trip is intended for applicants who meet the published eligibility requirements."),
        p("Affhan does not knowingly seek to collect personal information from children except where permitted or required by applicable law and appropriate safeguards are in place."),
      ],
    },
    {
      n: 15,
      title: "Changes to This Privacy Policy",
      blocks: [
        p("Affhan may update this Privacy Policy when reasonably necessary to reflect changes to the Program, our data practices, technology, service providers, legal requirements, or operational processes."),
        p("Material changes may be communicated through appropriate official channels."),
      ],
    },
    {
      n: 16,
      title: "Contact Us",
      blocks: [
        p("For questions, concerns, or privacy-related requests, please contact:"),
        { kind: "address", lines: ["AFFHAN INTERNATIONAL PVT LTD", ...OFFICE] },
        { kind: "email", label: "Email:", address: EMAIL },
      ],
    },
    {
      n: 17,
      title: "Acknowledgement",
      blocks: [
        p("By using the Affhan website or submitting an application for the Affhan Free China Business Trip, you acknowledge that you have been provided with this Privacy Policy and understand how your personal information may be collected and processed for the purposes described above."),
      ],
    },
  ],
};

// ---- The application's consents -------------------------------------------------------------------
/**
 * "Privacy & Consent", the three boxes before Submit, in the owner's words
 * and order. `link` marks the words that open the document.
 */
export const TRIP_CONSENTS = {
  heading: "Privacy & Consent",
  privacy: {
    before: "I have read and understood the ",
    link: "Privacy Policy",
    after: " and consent to the processing of my personal information for the purposes described in it.",
  },
  accuracy: "I confirm that the information I have provided is accurate and complete.",
  terms: { before: "I have read and agree to the ", link: "Terms & Conditions", after: "." },
} as const;

/**
 * The trip's facts as its Terms state them (clauses 1, 3, 4 and 17), for
 * the places that summarise them. Each is the document's own figure.
 */
export const TRIP_FACTS = {
  applicationsOpen: "12 October 2026",
  applicationsClose: "25 November 2026",
  winnersAnnounced: "1 December 2026",
  winners: 5,
} as const;
