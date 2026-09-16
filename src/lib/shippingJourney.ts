/**
 * The five stages a shipment actually passes through, and the transit times
 * for the three lanes we run our own people on.
 *
 * Data, not JSX, because the journey section renders it and the FAQ quotes the
 * same lane figures. One copy, so a transit time cannot be updated in the
 * animation and left stale in the answer underneath it.
 */

export interface JourneyStage {
  /** Two digits, shown as the step marker. */
  id: string;
  title: string;
  /** One line under the heading, for the sticky stage. */
  lead: string;
  body: string;
}

export const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: "01",
    title: "Collection",
    lead: "The goods leave on our instruction, not the supplier's.",
    body:
      "A supplier arranging its own pickup books to its own convenience, and the first anyone hears of a delay is when the vessel has sailed without the cargo. Our Guangzhou desk holds the booking, confirms the goods are finished and packed, and releases the truck when they are. If two suppliers are feeding one shipment, they arrive at our warehouse rather than at the port on different days.",
  },
  {
    id: "02",
    title: "Consolidation and export papers",
    lead: "Where most of the cost is decided, and almost none of the attention goes.",
    body:
      "Cartons are measured and re-palletised if the layout wastes space — a carton size that loses a third of a pallet is a third of a container you paid for and did not use. The export declaration, certificates of origin, fumigation and packing lists are prepared against the HS code the destination will actually assess. Getting that code wrong does not stop the goods leaving China; it stops them entering the country they are going to.",
  },
  {
    id: "03",
    title: "Ocean or air",
    lead: "LCL, FCL, or wings — whichever the stock maths argues for.",
    body:
      "LCL for a part load, FCL when the volume justifies a box of its own, air when six weeks of stock sitting on water costs more than the freight bill does. We are an NVOCC, so the contract with the line is ours and the bill of lading carries our name — the booking stays ours to answer for rather than passing down a chain of agents. You are told the vessel, the cut-off and the sailing, and told again if any of them move.",
  },
  {
    id: "04",
    title: "Arrival and customs",
    lead: "Cleared by the people who wrote the export papers.",
    body:
      "A query from customs at the destination is answered by someone holding the file, not by an agent who received a container number and a phone call. Duties, port charges and any inspection are handled as part of the job rather than surfacing afterwards as costs nobody mentioned. Doing both ends is the whole point of doing either.",
  },
  {
    id: "05",
    title: "Final delivery",
    lead: "The inland leg is in the quote, not added at the end.",
    body:
      "This is the stage that most often turns a cheap quote into an expensive one. Freight to port is the number people compare; the run from port to warehouse is the number they find out about later. Goods arrive at your door, and the file closes with the same company that opened it.",
  },
];

/**
 * Real sailing times, supplied by the shipping desk on 2026-09-16.
 *
 * Port to port, and approximate on purpose — a transhipment can add a week on
 * its own, which is why the FAQ keeps the caveat alongside the figure. These
 * are the three lanes with an Affhan office at both ends; everything else is
 * quoted per booking rather than advertised.
 */
export interface Lane {
  from: string;
  to: string;
  /** Destination port, for the label. */
  port: string;
  days: number;
}

export const LANES: Lane[] = [
  { from: "China", to: "Chennai", port: "Chennai", days: 20 },
  { from: "China", to: "Dubai", port: "Jebel Ali", days: 25 },
  { from: "China", to: "the UK", port: "Felixstowe", days: 45 },
];
