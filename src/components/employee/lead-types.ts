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

/** A lead assigned to the reader: a quote request or a contact message. */
export interface LeadCardData {
  kind: "inquiry" | "contact";
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
}

export const leadKey = (lead: Pick<LeadCardData, "kind" | "id">) => `${lead.kind}:${lead.id}`;
