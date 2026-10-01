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
 * front of the application, the landing page's key terms, and the
 * application's consents. Change the wording here and it changes everywhere.
 */

export const TRIP_TERMS_HREF = "/free-china-trip/terms/";
export const TRIP_PRIVACY_HREF = "/free-china-trip/privacy/";
export const TRIP_APPLY_HREF = "/free-china-trip/apply/";

/** One piece of a section, in reading order. */
export type LegalBlock =
  | { kind: "p"; text: string; link?: { text: string; href: string } }
  | { kind: "list"; items: string[] }
  /** A line the document sets in capitals for emphasis ("ECONOMY CLASS ONLY."). */
  | { kind: "notice"; text: string }
  /** A date the document sets on a line of its own. */
  | { kind: "date"; text: string }
  /** A declaration quoted in the document. */
  | { kind: "quote"; text: string }
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

export interface LegalDoc {
  /** The document's own title lines, as it sets them. */
  heading: string[];
  intro: string[];
  sections: LegalSection[];
}

const p = (text: string, link?: { text: string; href: string }): LegalBlock => ({ kind: "p", text, ...(link ? { link } : {}) });
const list = (...items: string[]): LegalBlock => ({ kind: "list", items });
const notice = (text: string): LegalBlock => ({ kind: "notice", text });
const date = (text: string): LegalBlock => ({ kind: "date", text });
const quote = (text: string): LegalBlock => ({ kind: "quote", text });
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
export const TRIP_TERMS: LegalDoc = {
  heading: ["AFFHAN Free China Business Trip", "Terms & Conditions"],
  intro: [
    "These Terms & Conditions govern participation in the Affhan Free China Business Trip organised by AFFHAN INTERNATIONAL PVT LTD.",
    "By submitting an application for the Affhan Free China Business Trip, the applicant confirms that they have read, understood, and agreed to these Terms & Conditions.",
  ],
  sections: [
    {
      n: 1,
      title: "Program Overview",
      blocks: [
        p("The Affhan Free China Business Trip is a promotional group business-travel program under which five eligible applicants will be selected to participate in a China business trip organised by AFFHAN INTERNATIONAL PVT LTD."),
        p("The application period will open on 5 October 2026 and close on 25 November 2026."),
        p("The five winners will be announced on 1 December 2026 through Affhan's official communication channels."),
        p("The official China Business Trip travel date and final itinerary will be announced separately by Affhan to the selected winners."),
        p("Selection as a winner is subject to final verification, required travel documentation, applicable visa requirements, and compliance with these Terms & Conditions."),
      ],
    },
    {
      n: 2,
      title: "Eligibility",
      blocks: [
        p("Applicants must satisfy the eligibility requirements published by Affhan for the Program."),
        p("Applicants must provide genuine, accurate, complete, and current information."),
        p("An application may be rejected or disqualified where:"),
        list(
          "required information is incomplete;",
          "information provided is false, misleading, or materially inaccurate;",
          "duplicate applications are identified;",
          "fraudulent or invalid documents are submitted; or",
          "the applicant does not satisfy the published eligibility requirements.",
        ),
        p("Unless otherwise stated by Affhan, each applicant may submit only one application."),
      ],
    },
    {
      n: 3,
      title: "Application Period",
      blocks: [
        p("Applications open on:"),
        date("5 October 2026"),
        p("Applications close on:"),
        date("25 November 2026"),
        p("Applications submitted after the published closing date may not be considered."),
        p("Affhan may close or restrict applications where reasonably necessary for technical, operational, legal, or administrative reasons."),
      ],
    },
    {
      n: 4,
      title: "Winner Selection",
      blocks: [
        p("All applications received during the application period will first undergo an eligibility review."),
        p("Only valid and eligible applications will be included in the final selection pool."),
        p("Every eligible applicant will have an equal opportunity to be selected."),
        p("No additional selection preference will be given based on application submission time, company size, business turnover, social-media activity, number of likes, comments, shares, or other factors unless expressly stated in the official Program rules."),
        p("After the application period closes and the final eligible applicant list is confirmed, five applicants will be selected through a randomised digital selection process."),
        p("The final eligible applicant list will be entered into an automated random-selection system and randomly shuffled to determine the five selected applicants."),
        p("The random-selection system will not evaluate or rank applicants based on their personal or business qualities. Its purpose is to randomly select applicants from the final eligible pool."),
        p("Affhan may also randomly select reserve applicants through the same selection process."),
        p("The five selected applicants will be considered provisional winners until final verification is completed."),
      ],
    },
    {
      n: 5,
      title: "Winner Announcement",
      blocks: [
        p("The five selected winners will be announced on:"),
        date("1 December 2026"),
        p("The announcement will be made through Affhan's official communication channels."),
        p("Affhan may contact selected winners directly using the contact information provided in their application."),
        p("The official Trip date and final itinerary will be communicated separately to the selected winners."),
      ],
    },
    {
      n: 6,
      title: "Final Verification",
      blocks: [
        p("Selection through the randomised process does not constitute final confirmation of participation."),
        p("Before confirming a winner, Affhan may verify:"),
        list(
          "identity;",
          "application information;",
          "business information;",
          "eligibility;",
          "travel readiness;",
          "passport and travel-document requirements; and",
          "other information reasonably required for participation.",
        ),
        p("A selected winner must complete the required verification within the period communicated by Affhan."),
        p("Failure to complete verification may result in cancellation of the selected applicant's participation."),
      ],
    },
    {
      n: 7,
      title: "Passport Requirement",
      blocks: [
        p("Each participant is responsible for obtaining, maintaining, and carrying a valid passport and any other travel document required for international travel."),
        p("Participants are responsible for ensuring that their passport remains valid and satisfies the requirements applicable to the intended journey."),
        p("Affhan does not guarantee passport issuance, renewal, validity, acceptance, or approval by any government or immigration authority."),
        p("Passport details or a passport copy may be requested from selected winners where reasonably necessary for travel booking, verification, or visa processing."),
      ],
    },
    {
      n: 8,
      title: "Visa Requirements",
      blocks: [
        p("Participants are responsible for meeting all applicable visa and immigration requirements."),
        p("Where a selected winner already holds a valid visa suitable for the proposed Trip, Affhan may consider reimbursement of an eligible visa-related expense subject to Affhan's reimbursement policy, applicable requirements, valid supporting documentation, and any applicable reimbursement limit."),
        p("Where a selected winner does not hold the required visa, Affhan may, where operationally feasible, assist with or initiate the applicable visa process."),
        p("Visa approval and issuance are solely subject to the decision of the relevant authorities."),
        p("Affhan does not guarantee:"),
        list("visa approval;", "visa issuance;", "visa processing time;", "entry permission; or", "any particular immigration outcome."),
      ],
    },
    {
      n: 9,
      title: "Visa Refusal or Cancellation",
      blocks: [
        p("If a selected winner is unable to obtain the required visa, or if the required visa is refused, cancelled, withdrawn, or otherwise unavailable before travel, Affhan may cancel that participant's selection and participation in the Trip."),
        p("In such circumstances, Affhan may select the next eligible reserve applicant through the applicable selection process."),
        p("A participant cannot participate in the Trip without the travel authorisation legally required for the journey."),
      ],
    },
    {
      n: 10,
      title: "Flights",
      blocks: [
        p("Where airfare is included as part of the Trip, the included airfare will be:"),
        notice("ECONOMY CLASS ONLY."),
        p("The airline, route, schedule, baggage allowance, seat allocation, and other flight arrangements will be determined by Affhan or its appointed travel provider, subject to availability."),
        p("The following are not included unless expressly confirmed by Affhan in writing:"),
        list(
          "business-class or premium-class upgrades;",
          "preferred seat upgrades;",
          "additional baggage;",
          "route changes;",
          "date changes;",
          "optional airline services; and",
          "other personal airline-related expenses.",
        ),
        p("Any such additional cost shall be borne by the participant."),
      ],
    },
    {
      n: 11,
      title: "Group Transportation",
      blocks: [
        p("Transportation provided by Affhan during the official Trip itinerary will be arranged as group transportation."),
        p("Participants are expected to travel according to the official group itinerary and transportation schedule."),
        p("Affhan does not provide individual, private, personal, or on-demand transportation as part of the standard Trip arrangement."),
        p("Separate transportation will not be provided for:"),
        list(
          "personal shopping;",
          "private appointments;",
          "independent sightseeing;",
          "personal errands;",
          "private business activities; or",
          "activities outside the official itinerary.",
        ),
        p("Participants wishing to travel independently outside the official itinerary must arrange and pay for their own transportation."),
      ],
    },
    {
      n: 12,
      title: "Group Travel",
      blocks: [
        p("The Trip is designed as a group travel experience."),
        p("Participants are expected to remain with the group during scheduled official activities unless otherwise approved by Affhan."),
        p("Affhan may appoint group coordinators, representatives, or business guides to support the group."),
        p("Where applicable, the planned operating arrangement is approximately:"),
        notice("1 BUSINESS GUIDE : 5 PARTICIPANTS"),
        p("The final guide-to-participant ratio may vary depending on the final group size and operational requirements."),
      ],
    },
    {
      n: 13,
      title: "Market and Business Visits",
      blocks: [
        p("Visits to markets, showrooms, commercial locations, business districts, and other planned destinations will be conducted as part of the official group itinerary."),
        p("Market and planned business-location visits are group activities."),
        p("Affhan does not provide:"),
        list(
          "individual private market visits;",
          "private market transportation;",
          "one-to-one market accompaniment; or",
          "separate personal sourcing trips",
        ),
        p("as part of the standard Trip arrangement."),
        p("Participants who wish to conduct activities outside the official itinerary must arrange and pay for them independently unless Affhan expressly approves otherwise."),
      ],
    },
    {
      n: 14,
      title: "Accommodation",
      blocks: [
        p("Accommodation included in the Trip will be provided on a group or shared accommodation basis."),
        notice("SINGLE OR PRIVATE ROOM ACCOMMODATION IS NOT INCLUDED."),
        p("Participants should not assume entitlement to an individual room."),
        p("Room allocation will be determined by Affhan according to the group arrangement, accommodation availability, and operational requirements."),
        p("Any request for single occupancy, a private room, a room upgrade, an additional room, or any other accommodation enhancement shall be at the participant's own expense unless Affhan expressly confirms otherwise in writing."),
      ],
    },
    {
      n: 15,
      title: "Food and Meals",
      blocks: [
        notice("FOOD AND MEALS ARE NOT INCLUDED IN THE FREE CHINA BUSINESS TRIP ARRANGEMENT."),
        p("Each participant is responsible for their own:"),
        list("breakfast;", "lunch;", "dinner;", "beverages;", "snacks; and", "other food-related expenses."),
        p("Affhan will not be responsible for ordinary personal food expenses unless a specific meal is expressly stated as included in the official itinerary."),
      ],
    },
    {
      n: 16,
      title: "Personal Shopping and Purchases",
      blocks: [
        p("All personal and commercial purchases made by a participant are entirely at the participant's own expense."),
        p("This includes:"),
        list(
          "products;",
          "samples;",
          "merchandise;",
          "gifts;",
          "personal items;",
          "supplier purchases;",
          "business purchases; and",
          "other goods or services purchased during the Trip.",
        ),
        p("Participants must use their own funds for such purchases."),
        p("Affhan does not undertake to finance, pay for, or reimburse personal or commercial purchases unless expressly confirmed by Affhan in writing before the expense is incurred."),
      ],
    },
    {
      n: 17,
      title: "Business Guidance",
      blocks: [
        p("Affhan may provide group business guidance through an assigned business guide during the official Trip itinerary."),
        p("The business guide is intended to support the group's business-travel experience."),
        p("Business guidance does not guarantee:"),
        list(
          "supplier approval;",
          "product quality;",
          "pricing;",
          "minimum order quantities;",
          "successful negotiations;",
          "contracts;",
          "business partnerships;",
          "commercial success; or",
          "any specific business outcome.",
        ),
      ],
    },
    {
      n: 18,
      title: "What the Trip Includes",
      blocks: [
        p("Subject to the official Trip itinerary and these Terms & Conditions, the standard Trip arrangement may include:"),
        list(
          "economy-class round-trip airfare;",
          "group or shared accommodation;",
          "group transportation during the official itinerary; and",
          "group business guidance as arranged by Affhan.",
        ),
        p("Only benefits expressly confirmed by Affhan as part of the official Trip package will be considered included."),
        p("The term “Free China Business Trip” does not mean that every expense incurred by the participant is covered by Affhan."),
      ],
    },
    {
      n: 19,
      title: "What the Trip Does Not Include",
      blocks: [
        p("Unless expressly stated otherwise, participants are responsible for:"),
        list(
          "food and beverages;",
          "personal shopping;",
          "commercial purchases;",
          "product samples;",
          "private transportation;",
          "independent sightseeing;",
          "personal activities;",
          "single-room accommodation;",
          "room upgrades;",
          "flight upgrades;",
          "preferred seats;",
          "additional baggage;",
          "communication expenses;",
          "medical expenses;",
          "personal insurance;",
          "incidental hotel expenses; and",
          "other personal or optional expenses.",
        ),
      ],
    },
    {
      n: 20,
      title: "Visa Reimbursement and Valid Invoices",
      blocks: [
        p("Where Affhan expressly approves an eligible visa-related reimbursement, the participant must provide the required supporting documentation."),
        p("Where an invoice is required, the invoice must be a valid invoice issued by the actual supplier or service provider."),
        p("Affhan may reject a reimbursement claim where the supporting document is:"),
        list(
          "missing;",
          "materially incomplete;",
          "altered;",
          "duplicated;",
          "illegible;",
          "not issued by the relevant supplier or service provider;",
          "inconsistent with the expense claimed; or",
          "otherwise not acceptable under Affhan's reimbursement requirements.",
        ),
        p("Affhan may verify any invoice, receipt, payment document, or other supporting evidence before processing reimbursement."),
        p("Only expenses expressly approved under the reimbursement policy will be considered eligible for reimbursement."),
      ],
    },
    {
      n: 21,
      title: "Participant Conduct",
      blocks: [
        p("Participants must behave respectfully, responsibly, and lawfully throughout the Trip."),
        p("Participants must comply with:"),
        list(
          "applicable laws;",
          "immigration requirements;",
          "airline rules;",
          "accommodation rules;",
          "transportation instructions;",
          "official itinerary requirements; and",
          "reasonable instructions provided by Affhan representatives.",
        ),
        p("Affhan may restrict or terminate participation where a participant's conduct creates a safety, legal, operational, or material disruption to the group or Trip."),
      ],
    },
    {
      n: 22,
      title: "Travel Schedule and Changes",
      blocks: [
        p("The official travel date and final itinerary will be announced separately."),
        p("After the itinerary is announced, flight schedules, accommodation, transportation, guides, destinations, and itinerary details may be changed where reasonably necessary due to:"),
        list(
          "availability;",
          "airline or travel-provider changes;",
          "operational requirements;",
          "government restrictions;",
          "visa or immigration requirements;",
          "safety considerations; or",
          "circumstances beyond Affhan's reasonable control.",
        ),
        p("Material changes will be communicated where reasonably practicable."),
      ],
    },
    {
      n: 23,
      title: "Withdrawal by Selected Winner",
      blocks: [
        p("A selected winner who wishes to withdraw from the Trip must notify Affhan as soon as reasonably possible."),
        p("Where a selected winner withdraws or becomes unable to participate, Affhan may offer the available place to the next eligible reserve applicant."),
      ],
    },
    {
      n: 24,
      title: "Cancellation of Participation by Affhan",
      blocks: [
        p("Affhan may cancel a participant's selection or participation where:"),
        list(
          "the participant is found to be ineligible;",
          "false or misleading information is identified;",
          "required documents are not provided;",
          "required visa or travel authorisation is unavailable;",
          "the participant breaches these Terms & Conditions;",
          "the participant fails to complete verification within the required time;",
          "the participant engages in serious misconduct; or",
          "the Trip becomes impracticable due to circumstances beyond Affhan's reasonable control.",
        ),
      ],
    },
    {
      n: 25,
      title: "No Transfer",
      blocks: [
        p("Selection is personal to the selected participant."),
        p("A selected Trip place may not be sold, transferred, assigned, exchanged, or substituted with another person without Affhan's prior written approval."),
      ],
    },
    {
      n: 26,
      title: "No Cash Alternative",
      blocks: [p("Unless expressly stated otherwise, the Trip benefits are not transferable and cannot be exchanged for cash or an alternative monetary benefit.")],
    },
    {
      n: 27,
      title: "Commercial Outcomes",
      blocks: [
        p("Participation in the Trip does not guarantee any commercial outcome."),
        p("Affhan does not guarantee that participants will:"),
        list(
          "identify a suitable supplier;",
          "obtain a particular price;",
          "secure a contract;",
          "complete a purchase;",
          "find a particular product;",
          "establish a business relationship; or",
          "achieve any specific commercial result.",
        ),
        p("Any commercial transaction entered into by a participant is solely between the participant and the relevant third party."),
      ],
    },
    {
      n: 28,
      title: "Insurance and Medical Expenses",
      blocks: [
        p("Unless expressly stated otherwise, personal travel, medical, accident, baggage, or other insurance is not included in the standard Trip arrangement."),
        p("Participants are responsible for considering and arranging any insurance they require."),
        p("Participants are responsible for their own medical needs, prescriptions, treatment, and related expenses during the Trip."),
      ],
    },
    {
      n: 29,
      title: "Personal Data and Travel Documents",
      blocks: [
        p("Affhan may collect and process personal information reasonably required for:"),
        list(
          "application administration;",
          "eligibility review;",
          "random selection administration;",
          "participant verification;",
          "communication;",
          "travel arrangements;",
          "accommodation arrangements;",
          "visa-related processing where applicable;",
          "reimbursement processing; and",
          "compliance with applicable legal obligations.",
        ),
        p("Passport details, visa details, identity documents, and other travel information will be requested only where reasonably necessary for the relevant application, verification, travel, or visa-processing stage."),
        p("Participants should refer to the Affhan Privacy Policy for information regarding the collection, use, storage, retention, and handling of personal data.", {
          text: "Affhan Privacy Policy",
          href: TRIP_PRIVACY_HREF,
        }),
      ],
    },
    {
      n: 30,
      title: "Fraud and Misrepresentation",
      blocks: [
        p("Affhan may investigate suspected:"),
        list(
          "fraud;",
          "fabricated information;",
          "forged documents;",
          "duplicate applications;",
          "false claims;",
          "manipulation; or",
          "other material misrepresentation.",
        ),
        p("Any applicant or participant found to have engaged in such conduct may be disqualified or removed from the Program."),
      ],
    },
    {
      n: 31,
      title: "Force Majeure",
      blocks: [
        p("Affhan shall not be responsible for delay, cancellation, interruption, or inability to perform any part of the Trip caused by circumstances beyond its reasonable control, including:"),
        list(
          "government restrictions;",
          "visa or immigration restrictions;",
          "airline disruption;",
          "border restrictions;",
          "natural events;",
          "public emergencies;",
          "strikes;",
          "security situations; or",
          "other comparable circumstances.",
        ),
      ],
    },
    {
      n: 32,
      title: "Amendment of Terms",
      blocks: [
        p("Affhan may update these Terms & Conditions where reasonably necessary to reflect operational, travel, legal, or Program changes."),
        p("Any material update applicable to participants will be communicated through official Program channels where reasonably practicable."),
      ],
    },
    {
      n: 33,
      title: "Governing Law and Jurisdiction",
      blocks: [
        p("These Terms & Conditions shall be governed by and interpreted in accordance with the laws of India."),
        p("Subject to applicable law, disputes arising from or relating to these Terms & Conditions shall be subject to the jurisdiction of the competent courts in Chennai, Tamil Nadu, India."),
      ],
    },
    {
      n: 34,
      title: "Acceptance of Terms",
      blocks: [
        p("By submitting an application, the Applicant confirms:"),
        quote("I have read and understood the Affhan Free China Business Trip Terms & Conditions and agree to comply with the published eligibility requirements, selection process, verification requirements, passport and visa requirements, group travel arrangements, accommodation arrangements, food and personal expense responsibilities, reimbursement conditions, and all other applicable Terms & Conditions."),
      ],
    },
    {
      n: 35,
      title: "Official Program Information",
      blocks: [
        {
          kind: "facts",
          rows: [
            { label: "Program", lines: ["AFFHAN FREE CHINA BUSINESS TRIP"] },
            { label: "Organiser", lines: ["AFFHAN INTERNATIONAL PVT LTD"] },
            { label: "Office Address", lines: OFFICE },
            { label: "Application Opening Date", lines: ["5 October 2026"] },
            { label: "Application Closing Date", lines: ["25 November 2026"] },
            { label: "Number of Winners", lines: ["5"] },
            { label: "Winner Announcement Date", lines: ["1 December 2026"] },
            { label: "Trip Date", lines: ["TO BE ANNOUNCED SEPARATELY"] },
            { label: "Official Contact Email", lines: [EMAIL], href: `mailto:${EMAIL}` },
            { label: "Official Application", lines: ["Available through the official Affhan application page"], href: TRIP_APPLY_HREF },
            { label: "Official Terms & Conditions", lines: ["Published on the official Affhan website"], href: TRIP_TERMS_HREF },
            { label: "Official Privacy Policy", lines: ["Published on the official Affhan website"], href: TRIP_PRIVACY_HREF },
          ],
        },
      ],
    },
  ],
};

// ---- Privacy Policy -----------------------------------------------------------------------------
export const TRIP_PRIVACY: LegalDoc = {
  heading: ["AFFHAN Free China Business Trip", "Privacy Policy"],
  intro: [
    "AFFHAN INTERNATIONAL PVT LTD respects your privacy and is committed to protecting the personal information you provide when using our website, submitting an application for the Affhan Free China Business Trip, or communicating with us.",
    "This Privacy Policy explains what personal information we collect, why we collect it, how we use it, when we may share it, how we protect it, and how you may contact us regarding your personal information.",
  ],
  sections: [
    {
      n: 1,
      title: "Information We Collect",
      blocks: [
        p("Depending on how you interact with Affhan, we may collect the following information."),
        sub("Personal Information"),
        list("Full name", "Email address", "Mobile number", "Country", "City or location", "Other contact information you choose to provide"),
        sub("Business Information"),
        list(
          "Company name",
          "Job title or designation",
          "Business category",
          "Company website",
          "Business description",
          "Years in business",
          "Business interests",
          "Products or categories of interest",
          "Business objectives",
          "Information provided in application responses",
        ),
        sub("Application Information"),
        list(
          "Information submitted through the Free China Business Trip application",
          "Application responses",
          "Eligibility information",
          "Information required for winner verification",
          "Communications relating to the application",
        ),
        sub("Travel Information"),
        p("Where reasonably required for selected applicants or travel processing, we may collect:"),
        list(
          "Nationality",
          "Passport information",
          "Passport validity information",
          "Passport copy",
          "Visa information",
          "Travel-readiness information",
          "Other information reasonably required for travel or visa processing",
        ),
        sub("Reimbursement Information"),
        p("Where an approved reimbursement is applicable, we may collect:"),
        list("Invoice information", "Receipt information", "Proof of payment", "Reimbursement-related information"),
        sub("Technical Information"),
        p("When you use our website, certain technical information may be collected automatically, such as:"),
        list("IP address", "Browser type", "Device information", "Operating system", "Pages visited", "Approximate website usage information"),
        p("We only collect information that is reasonably relevant to the purpose for which it is required."),
      ],
    },
    {
      n: 2,
      title: "How We Use Your Information",
      blocks: [
        p("Affhan may use your information to:"),
        list(
          "process and manage applications;",
          "review eligibility;",
          "administer the winner-selection process;",
          "conduct random selection among eligible applicants;",
          "contact applicants;",
          "verify selected winners;",
          "communicate winner announcements;",
          "arrange approved travel services;",
          "coordinate accommodation and group transportation;",
          "support visa-related processing where applicable;",
          "process approved reimbursements;",
          "verify invoices and receipts;",
          "prevent fraud and duplicate applications;",
          "respond to enquiries;",
          "improve our website and application process;",
          "maintain required records; and",
          "comply with applicable legal, regulatory, accounting, or operational requirements.",
        ),
      ],
    },
    {
      n: 3,
      title: "Application Data",
      blocks: [
        p("When you apply for the Affhan Free China Business Trip, the information you provide may be used to:"),
        list(
          "process your application;",
          "determine eligibility;",
          "place eligible applications into the random-selection pool;",
          "communicate with you regarding your application;",
          "conduct verification if selected; and",
          "administer the Program.",
        ),
        p("Submitting an application does not guarantee selection or participation."),
      ],
    },
    {
      n: 4,
      title: "Random Selection Data",
      blocks: [
        p("Only applicants who meet the published eligibility requirements will be included in the final random-selection pool."),
        p("Personal information may be used to identify and administer eligible applications and to conduct the Program's random selection process."),
        p("The random-selection system is intended to randomly select applicants from the eligible pool and does not assess or rank applicants based on personal or business characteristics."),
      ],
    },
    {
      n: 5,
      title: "Passport and Visa Information",
      blocks: [
        p("Passport, visa, identity, and other travel-document information will be requested only where reasonably necessary for the applicable stage of the Program."),
        p("Such information may be required for:"),
        list(
          "final winner verification;",
          "travel booking;",
          "accommodation arrangements;",
          "visa-related processing;",
          "travel coordination; or",
          "compliance with applicable requirements.",
        ),
        p("Where possible, Affhan will request only the information reasonably necessary for the relevant purpose."),
      ],
    },
    {
      n: 6,
      title: "How We Share Your Information",
      blocks: [
        p("Affhan may share relevant personal information with trusted service providers and organisations where reasonably necessary to operate the Program."),
        p("These may include:"),
        list(
          "Travel booking providers",
          "Airlines and travel service providers",
          "Accommodation providers",
          "Transportation providers",
          "Visa or travel-document service providers",
          "Technology and hosting providers",
          "Email and communication providers",
          "Payment or reimbursement service providers",
          "Professional advisers where reasonably necessary",
          "Government, regulatory, immigration, or law-enforcement authorities where legally required",
        ),
        p("Information shared with service providers will be limited to what is reasonably necessary for the relevant service or purpose."),
        p("Affhan does not sell personal information as part of the Free China Business Trip Program."),
      ],
    },
    {
      n: 7,
      title: "International Processing",
      blocks: [
        p("Because the Program involves international travel, certain personal information may need to be processed by service providers located outside India where reasonably necessary for:"),
        list("travel;", "accommodation;", "transportation;", "visa processing;", "communication; or", "other Program-related services."),
        p("Such information will be handled in accordance with applicable requirements and the relevant service arrangements."),
      ],
    },
    {
      n: 8,
      title: "Data Security",
      blocks: [
        p("Affhan takes reasonable technical and organisational measures to protect personal information against unauthorised access, misuse, loss, alteration, disclosure, or destruction."),
        p("Access to personal information may be limited to authorised personnel and service providers who reasonably require it for the purposes described in this Privacy Policy."),
        p("However, no method of internet transmission or electronic storage can be guaranteed to be completely secure."),
      ],
    },
    {
      n: 9,
      title: "Data Retention",
      blocks: [
        p("Affhan may retain personal information for as long as reasonably necessary for:"),
        list(
          "administering the Program;",
          "completing winner verification;",
          "arranging travel or visa processing;",
          "processing reimbursements;",
          "responding to enquiries;",
          "resolving disputes;",
          "maintaining accounting and business records; and",
          "complying with applicable legal or regulatory requirements.",
        ),
        p("When personal information is no longer reasonably required for these purposes, Affhan may delete, anonymise, or securely dispose of it, subject to applicable requirements."),
      ],
    },
    {
      n: 10,
      title: "Your Privacy Requests",
      blocks: [
        p("Depending on applicable law, you may have rights relating to your personal information."),
        p("These may include requesting information about how your personal data is processed, requesting correction of inaccurate information, making applicable privacy requests, or withdrawing consent where consent is the applicable basis for processing."),
        p("To make a privacy-related request, contact Affhan at:"),
        { kind: "email", address: EMAIL },
        p("Affhan may need to verify your identity before processing certain requests."),
      ],
    },
    {
      n: 11,
      title: "Consent",
      blocks: [
        p("Where Affhan relies on consent to process personal information, the relevant information and purpose will be presented to you before or when the information is collected."),
        p("Where consent is required, it will be requested through a clear affirmative action."),
        p("Where applicable, withdrawal of consent may be requested by contacting Affhan."),
        p("Withdrawal of consent does not affect processing that is otherwise permitted or required under applicable law."),
      ],
    },
    {
      n: 12,
      title: "Application Form Consent",
      blocks: [
        p("Before submitting an application, the applicant may be asked to acknowledge:"),
        quote("I have read and understood the Affhan Privacy Policy and consent to the processing of my personal information for the purposes described in this Privacy Policy."),
      ],
    },
    {
      n: 13,
      title: "Marketing Communications",
      blocks: [
        p("Where you separately choose to receive promotional or marketing communications from Affhan, we may use your contact information for those communications."),
        p("You may unsubscribe from promotional communications through the available unsubscribe option or by contacting Affhan."),
        p("Marketing consent is separate from consent required to administer the Free China Business Trip."),
      ],
    },
    {
      n: 14,
      title: "Cookies and Website Technologies",
      blocks: [
        p("Our website may use cookies and similar technologies to support:"),
        list("essential website functions;", "security;", "performance;", "preferences; and", "website analytics where such tools are used."),
        p("Cookies or similar technologies are not used to automatically request or collect passport or visa information."),
      ],
    },
    {
      n: 15,
      title: "Third-Party Services",
      blocks: [
        p("Our website or application process may use third-party services for:"),
        list(
          "website hosting;",
          "analytics;",
          "email communication;",
          "application or form processing;",
          "file storage;",
          "payment or reimbursement processing; and",
          "travel-related services.",
        ),
        p("Third-party providers may process information according to their own privacy practices and applicable agreements."),
      ],
    },
    {
      n: 16,
      title: "Travel and Visa Service Providers",
      blocks: [
        p("Where selected applicants provide passport, visa, or travel information, relevant information may be shared with the travel, accommodation, transportation, or visa-related service providers required to arrange or support the Trip."),
        p("Only information reasonably necessary for the relevant service should be shared."),
      ],
    },
    {
      n: 17,
      title: "Reimbursement Documents",
      blocks: [
        p("Where a participant submits an invoice, receipt, or proof of payment for an approved reimbursement, Affhan may use and verify the information contained in those documents for:"),
        list("reimbursement processing;", "verification;", "fraud prevention;", "accounting; and", "record-keeping."),
        p("Participants should provide only the documents required for the relevant reimbursement."),
      ],
    },
    {
      n: 18,
      title: "Data Accuracy",
      blocks: [
        p("Applicants and participants are responsible for providing accurate and current information."),
        p("Where information previously submitted is inaccurate or has changed, the applicant or participant should contact Affhan at:"),
        { kind: "email", address: EMAIL },
      ],
    },
    {
      n: 19,
      title: "Fraud Prevention",
      blocks: [
        p("Affhan may use application and account information to identify and investigate:"),
        list(
          "duplicate applications;",
          "fraudulent submissions;",
          "false information;",
          "forged documents;",
          "suspicious reimbursement claims; or",
          "misuse of the Program.",
        ),
        p("This may involve verification of the information and documents provided."),
      ],
    },
    {
      n: 20,
      title: "Children",
      blocks: [
        p("The Affhan Free China Business Trip is intended for applicants who meet the published eligibility requirements."),
        p("Affhan does not knowingly seek to collect personal information from children except where permitted or required by applicable law and appropriate safeguards are in place."),
      ],
    },
    {
      n: 21,
      title: "Winner Information",
      blocks: [
        p("Where an applicant is selected as a winner, Affhan may publish or communicate limited winner information as part of the official winner announcement."),
        p("This may include the winner's name or other information specifically authorised or appropriate for the announcement."),
        p("Passport numbers, passport copies, visa documents, private contact information, and other sensitive travel information will not be publicly displayed as part of a standard winner announcement."),
      ],
    },
    {
      n: 22,
      title: "Links to Other Websites",
      blocks: [
        p("The Affhan website may contain links to third-party websites or services."),
        p("Affhan is not responsible for the privacy practices, content, security, or policies of third-party websites."),
        p("Users should review the privacy policies of third-party websites before providing personal information to them."),
      ],
    },
    {
      n: 23,
      title: "Data Security Incidents",
      blocks: [
        p("If Affhan becomes aware of a personal-data security incident that requires notification under applicable law, Affhan will take appropriate steps in accordance with applicable requirements."),
      ],
    },
    {
      n: 24,
      title: "Changes to This Privacy Policy",
      blocks: [
        p("Affhan may update this Privacy Policy where reasonably necessary to reflect changes to:"),
        list("the Program;", "our data practices;", "technology;", "service providers;", "legal requirements; or", "operational processes."),
        p("Material changes may be communicated through appropriate official channels where reasonably practicable."),
      ],
    },
    {
      n: 25,
      title: "Contact Us",
      blocks: [
        p("For questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact:"),
        { kind: "address", lines: ["AFFHAN INTERNATIONAL PVT LTD", ...OFFICE] },
        { kind: "email", label: "Email:", address: EMAIL },
      ],
    },
    {
      n: 26,
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
  terms: { before: "I agree to the ", link: "Terms & Conditions", after: "." },
} as const;

/**
 * The trip's facts as its Terms state them (clauses 1, 3, 4, 5 and 35), for
 * the places that summarise them. Each is the document's own figure.
 */
export const TRIP_FACTS = {
  applicationsOpen: "5 October 2026",
  applicationsClose: "25 November 2026",
  winnersAnnounced: "1 December 2026",
  winners: 5,
} as const;
