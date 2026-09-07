import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * Does this product exist? Asked here, in the layout, because this is the last
 * place the answer can still change the HTTP status.
 *
 * loading.tsx in this segment puts the page inside a Suspense boundary, so
 * Next flushes the shell — status line included, as 200 — before the page
 * component ever runs. notFound() from inside there swaps the UI for the
 * 404 page but cannot recall the status that has already gone out, and the
 * result is a soft 404: a page that says "not found" over a successful
 * response, which Google indexes as thin content. Moving the check outside the
 * boundary means the status is still open when the answer arrives.
 *
 * A layout renders once per navigation into the segment, and this is an
 * indexed primary-key lookup selecting a single column, so it costs a
 * fraction of the three queries the page itself already makes. The skeleton
 * still shows for products that do exist, which is the point of keeping
 * loading.tsx.
 */
export default async function ProductLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (Number.isNaN(numericId)) notFound();

  const exists = await prisma.product.findUnique({
    where: { id: numericId },
    select: { id: true },
  });
  if (!exists) notFound();

  return children;
}
