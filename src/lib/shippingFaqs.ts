import { LANES } from "@/lib/shippingJourney";

/**
 * The questions a freight customer actually types, answered.
 *
 * Exported as data because two things consume them: the accordion on the page
 * and the FAQPage node in the schema graph. Google treats visible text that
 * disagrees with the structured data as a quality problem, so there is exactly
 * one copy and both read it.
 *
 * The transit figures come from LANES, for the same reason — a sailing time
 * updated in the animation and left stale in the answer underneath it is
 * precisely the kind of drift this codebase has been bitten by before.
 *
 * Nothing here quotes tonnage, shipment counts, client numbers or prices. The
 * note at the top of ShippingContent.tsx says why: invented figures have gone
 * live on this site before.
 */

const laneLine = LANES.map((l) => `${l.from} to ${l.to} (${l.port}) around ${l.days} days`).join(", ");

export const SHIPPING_FAQS = [
  {
    question: "How long does sea freight from China take?",
    answer:
      `Port to port, on the three lanes where we have our own office at both ends: ${laneLine}. ` +
      "Those are typical sailings rather than guarantees — the service matters, and a transhipment can add a week on its own. " +
      "We quote the actual vessel, sailing and cut-off for your booking, because a figure that ignores your port pair is not useful for planning.",
  },
  {
    question: "What is the difference between a freight forwarder and an NVOCC?",
    answer:
      "A forwarder arranges carriage on your behalf and the contract sits between you and the shipping line. An NVOCC takes the contract itself and issues its own bill of lading, then buys the space from the line. Affhan is an NVOCC, so the booking is ours to answer for — if something moves, you are dealing with the company that holds the contract rather than being passed to the carrier.",
  },
  {
    question: "Do you handle customs clearance at both ends?",
    answer:
      "Yes, and with the same team. Export documentation, certificates of origin and the HS classification are prepared in China; the import entry, duties and any inspection are handled at the destination. The reason to do both is that a customs query on arrival is answered by someone who already has the file.",
  },
  {
    question: "What is the difference between LCL and FCL, and which do I need?",
    answer:
      "FCL is a container of your own. LCL is a share of one, consolidated with other shipments — cheaper outright, but charged by volume and with handling at both ends. Past roughly half a container the economics usually turn. Where the volume sits near that line we quote both rather than choosing for you.",
  },
  {
    question: "Can you ship from suppliers we found ourselves?",
    answer:
      "Yes. Sourcing and freight are separate services and plenty of customers use only the second. If you have your own suppliers we collect from them, consolidate if there are several, and carry the shipment from there.",
  },
  {
    question: "What does door-to-door actually include?",
    answer:
      "Collection from the supplier, export clearance, the main freight leg, import clearance, duties handled, and the inland run to your warehouse. That definition is worth checking against any quote you compare us with: \"door to door\" is used loosely, and the inland leg is the part most often left out of the number people compare.",
  },
  {
    question: "When is air freight the cheaper decision?",
    answer:
      "When the stock costs more to wait for than to fly. A container on the water is capital you cannot sell for several weeks, plus whatever a stockout costs in orders you could not fill. For high-value, low-volume goods, or a first production run you need in market before committing to a full container, the freight premium is often smaller than the cost of waiting. For heavy, low-margin goods it almost never is.",
  },
  {
    question: "Do you store goods before shipping?",
    answer:
      "Yes. Warehousing and consolidation are part of the service, which matters when several suppliers are feeding one shipment, or when production finishes before you want the goods to arrive. Holding them and shipping once is usually cheaper than paying for each shipment on its own.",
  },
];
