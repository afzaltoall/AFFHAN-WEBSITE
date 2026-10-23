import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { upstash } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { supplierApplicationNewsEmail } from "@/lib/email-templates";
import { SUPPLIER_STATUS_LABEL, isOfferStatus } from "@/lib/supplier-offer";
import { NEWS_SETTLE_MS, isNews, newsOf, type NewsState } from "@/lib/supplier-news-rules";

/**
 * The supplier's email when the team decides on their application or replies to it (the owner, 2026-10-23:
 * "email on your decision"). The rules are lib/supplier-news-rules.ts; this sends.
 *
 * Sent after the team's change has stood for NEWS_SETTLE_MS, from after(): the admin's request answers at once,
 * and a run of changes (Reviewing, then Accepted; a status, then a reply) is one email about where it ended. Each
 * change schedules a send; a send whose change is no longer the latest (reviewedAt moved on) leaves it to the
 * later one.
 *
 * Measured against what the supplier was last emailed about this application, kept in Upstash
 * (supplier-told:<id>): so setting a status back and forth, or saving the same reply twice, emails nobody twice.
 * Where Upstash is not set up or does not answer, the supplier is taken to have seen it only as sent (NEW, no
 * reply), which can repeat news but never loses any.
 *
 * Never logs the address or what the email says: the application's id, where it stands and whether it went.
 */

const told = (offerId: string) => `supplier-told:${offerId}`;
const FIRST: NewsState = { status: "NEW", reply: null };
/** How long Upstash may take before it is treated as down, as the limits treat it (lib/rate-limit.ts). */
const WAIT_MS = 1_500;
const KEEP_S = 400 * 24 * 60 * 60;

const within = <T,>(work: Promise<T>): Promise<T | null> =>
  Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS))]).catch(() => null);

async function lastTold(offerId: string): Promise<NewsState | null> {
  if (!upstash) return null;
  const value = await within(upstash.get<NewsState>(told(offerId)));
  return value && typeof value === "object" && typeof value.status === "string" ? value : null;
}

async function rememberTold(offerId: string, state: NewsState): Promise<void> {
  if (!upstash) return;
  await within(upstash.set(told(offerId), state, { ex: KEEP_S }));
}

/** After the response: once the change has settled, email the supplier if it is news to them. */
export function scheduleSupplierNews(offerId: string, changedAt: Date): void {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, NEWS_SETTLE_MS));
    try {
      const now = await prisma.supplierOffer.findUnique({
        where: { id: offerId },
        select: {
          status: true,
          reply: true,
          reviewedAt: true,
          productName: true,
          supplier: { select: { email: true, name: true, status: true } },
        },
      });
      // Gone, or changed again since: the later change sends, if anything.
      if (!now || now.reviewedAt?.getTime() !== changedAt.getTime()) return;
      // A blocked supplier cannot sign in to see it, so is not written to about it either.
      if (now.supplier.status !== "ACTIVE" || !isOfferStatus(now.status)) return;

      const news = newsOf((await lastTold(offerId)) ?? FIRST, { status: now.status, reply: now.reply });
      if (!isNews(news)) return;

      const sent = await sendEmail({
        to: now.supplier.email,
        ...supplierApplicationNewsEmail({
          name: now.supplier.name,
          productName: now.productName,
          status: now.status,
          statusLabel: SUPPLIER_STATUS_LABEL[now.status],
          reply: now.reply,
          statusChanged: news.status,
        }),
      });
      if (sent.ok) await rememberTold(offerId, { status: now.status, reply: now.reply });
      console.info(`supplier news: application ${offerId}, ${now.status}${news.reply ? " and a reply" : ""}: ${sent.ok ? "emailed" : `not emailed (${sent.reason})`}`);
    } catch (error) {
      console.error("supplier news failed:", error instanceof Error ? error.name : "unknown");
    }
  });
}
