/** One entry on a lead's trail, as the workspace shows it. */
export interface LeadUpdate {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  /** Who recorded it. Only shown when it was not the person reading. */
  byName: string;
  byMe: boolean;
}

/** What a freight request from /shipping/ carries that the other two kinds do not. */
export interface FreightDetail {
  referenceNo: string;
  mode: string;
  method: string;
  portOfLoading: string;
  portOfDischarge: string;
  terms: string;
  commodity: string;
  commodityType: string;
  /** Exact decimal text, as stored. */
  cbm: string;
  weightKg: string;
  cartonBoxes: number | null;
}

/** A lead assigned to the reader: a quote request, a contact message or a freight request. */
export interface LeadCardData {
  kind: "inquiry" | "contact" | "shipment";
  id: string;
  createdAt: string;
  /** Product for a quote request; the sender's own name for a message. */
  title: string;
  /** The product's main photograph, when there is a product. */
  image: string | null;
  /** Every photograph the catalogue holds for it, main one first. */
  images: string[];
  /** For the link to the product's own page; null for messages and for inquiries whose product has gone. */
  productId: number | null;
  customerName: string;
  companyName: string | null;
  country: string;
  phone: string;
  email: string | null;
  quantity: number | null;
  message: string | null;
  /** Newest first. */
  updates: LeadUpdate[];
  /** Freight requests only. */
  freight?: FreightDetail;
}

export const leadKey = (lead: Pick<LeadCardData, "kind" | "id">) => `${lead.kind}:${lead.id}`;
