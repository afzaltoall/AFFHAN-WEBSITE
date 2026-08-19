// Client component because each step carries its lucide `icon` as a component
// reference, and a function cannot cross the server-to-client boundary as a
// prop. The markup is still server-rendered — client components are — so the
// stage text is in the HTML either way.
"use client";

import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Factory,
  FileText,
  Home,
  MessageCircle,
  ShieldCheck,
  Truck,
} from "lucide-react";
import RadialOrbitalTimeline, {
  type TimelineItem,
} from "@/components/ui/radial-orbital-timeline";

const sourcingTimelineData: TimelineItem[] = [
  {
    id: 1,
    title: "Enquiry",
    date: "Step 01",
    content: "Get in touch with our team, and we can discuss your product specs, timeline and quantity.",
    category: "Discovery",
    icon: MessageCircle,
    relatedIds: [2],
    status: "completed",
  },
  {
    id: 2,
    title: "Quote",
    date: "Step 02",
    content: "Our team will prepare a quote for you after discussing your product specs with our network of factories.",
    category: "Commercial",
    icon: FileText,
    relatedIds: [1, 3],
    status: "completed",
  },
  {
    id: 3,
    title: "Confirm Order/Design",
    date: "Step 03",
    content: "Depending on your order, it may require a custom design. Approval is required before sampling and production.",
    category: "Approval",
    icon: CheckCircle2,
    relatedIds: [2, 4],
    status: "completed",
  },
  {
    id: 4,
    title: "Payment",
    date: "Step 04",
    content: "Once you're happy with your quote and design, a deposit is made to commence your order.",
    category: "Commercial",
    icon: CreditCard,
    relatedIds: [3, 5],
    status: "in-progress",
  },
  {
    id: 5,
    title: "Production",
    date: "Step 05",
    content: "We monitor manufacturing schedules close-up. Production usually takes 3-5 weeks.",
    category: "Manufacturing",
    icon: Factory,
    relatedIds: [4, 6],
    status: "in-progress",
  },
  {
    id: 6,
    title: "Quality Control",
    date: "Step 06",
    content: "A member of our team does a full QC inspection report to ensure the order is to spec.",
    category: "Inspection",
    icon: ShieldCheck,
    relatedIds: [5, 7],
    status: "in-progress",
  },
  {
    id: 7,
    title: "Balance Payment",
    date: "Step 07",
    content: "Once you're happy with the production results, the balance payment is required to ship your order.",
    category: "Commercial",
    icon: Banknote,
    relatedIds: [6, 8],
    status: "pending",
  },
  {
    id: 8,
    title: "Shipping & Storage",
    date: "Step 08",
    content: "Orders are shipped via sea or air cargo. We also have a warehouse to consolidate with any orders.",
    category: "Logistics",
    icon: Truck,
    relatedIds: [7, 9],
    status: "pending",
  },
  {
    id: 9,
    title: "Delivery at Doorsteps",
    date: "Step 09",
    content: "After the consignment reaches the port, we clear the goods and dispatch them to the final destination.",
    category: "Fulfilment",
    icon: Home,
    relatedIds: [8],
    status: "pending",
  },
];

const stepChecklists: Record<number, { title: string; items: string[] }> = {
  1: {
    title: "Stage Deliverables",
    items: [
      "Submit product specifications & ideas",
      "Assign dedicated sourcing agent",
      "Identify potential target factory matches",
      "Confirm target order quantities & guidelines",
    ],
  },
  2: {
    title: "Commercial Costing",
    items: [
      "Request detailed quotes from verified factories",
      "Estimate shipping freight & port handling tariffs",
      "Review sample unit costs & bulk tier pricing",
      "Deliver structured quotation sheet to client",
    ],
  },
  3: {
    title: "Design Signoff",
    items: [
      "Generate custom 2D/3D product blueprints",
      "Align packaging size and branded logo formats",
      "Verify material compliance certifications",
      "Obtain final design approval signature",
    ],
  },
  4: {
    title: "Payment Milestones",
    items: [
      "Process 30% start production deposit",
      "Prepare factory manufacturing contract",
      "Review payment terms & milestones",
      "Approve starting schedule with factory raw materials",
    ],
  },
  5: {
    title: "Factory Production",
    items: [
      "Procure raw materials & check quality",
      "Begin molding & assembly line processes",
      "Conduct weekly progress checks on output speed",
      "Confirm initial production run schedule",
    ],
  },
  6: {
    title: "Quality Inspection",
    items: [
      "Inspect mid-production batch run quality",
      "Supervise final packaging & seal durability",
      "Issue detailed testing report with video proof",
      "Approve consignment ready for shipping release",
    ],
  },
  7: {
    title: "Balance Settlement",
    items: [
      "Verify final inspection report pass",
      "Settle 70% remaining balance payment",
      "Release factory cargo transfer permissions",
      "Issue official commercial invoice & certificate of origin",
    ],
  },
  8: {
    title: "Logistics Booking",
    items: [
      "Select sea/air cargo freight provider",
      "Consolidate orders at Guangzhou warehousing hub",
      "Prepare customs export declaration papers",
      "Load container & seal tracking tags",
    ],
  },
  9: {
    title: "Doorstep Delivery",
    items: [
      "Supervise arrival at destination port",
      "Clear local import customs duties & paperwork",
      "Dispatch final logistics truck routes to door",
      "Conduct post-delivery check with client",
    ],
  },
};

interface SourcingProcessSectionProps {
  /** Small label above the heading. */
  eyebrow?: string;
  /** The section h2. Overridable so a landing page can keep its own
   *  keyword-bearing wording rather than a generic one. */
  heading?: string;
  /** Optional sentence under the heading. */
  intro?: string;
}

export function SourcingProcessSection({
  eyebrow = "Affhan Workflow",
  heading = "Process of Sourcing",
  intro,
}: SourcingProcessSectionProps) {
  return (
    // No scroll-snap and no forced h-screen: the landing page this sits on
    // scrolls normally, and pinning a section to the viewport there would fight
    // the rest of the page. min-h keeps the orbit roomy without trapping scroll.
    <section
      id="sourcing-process"
      className="flex w-full flex-col overflow-hidden bg-gradient-to-br from-[#1b4452] via-[#245b6d] to-[#123642] px-5 py-16 sm:px-8 lg:min-h-[820px] lg:px-12 lg:py-20"
    >
      <div className="relative z-30 mx-auto w-full max-w-xl shrink-0 text-center lg:max-w-6xl">
        <span className="text-xs font-bold uppercase tracking-[0.24em] text-[#3cd5f7]">{eyebrow}</span>
        <h2 className="mt-2 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.018em] text-balance text-white sm:text-4xl">
          {heading}
        </h2>
        {intro && (
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-[1.6] tracking-[-0.003em] text-pretty text-slate-200">
            {intro}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <RadialOrbitalTimeline timelineData={sourcingTimelineData} checklists={stepChecklists} />
      </div>
    </section>
  );
}
