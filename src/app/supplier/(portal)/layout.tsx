import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentSupplier } from "@/lib/supplier-session";
import { OPEN_STATUSES } from "@/lib/supplier-offer";
import { OFFICES } from "@/lib/brand";
import { SupplierTopBar } from "@/components/supplier/SupplierTopBar";

export const dynamic = "force-dynamic";

/**
 * The signed-in supplier portal: the catalogue, the supplier's applications, their profile.
 *
 * The door is here, for every page in the group, as the console's is (app/admin/(console)/layout.tsx): a
 * request without a live supplier session goes to the sign-in before anything renders. The pages read the same
 * session again through currentSupplier, which React answers from this lookup.
 *
 * The group is in brackets, so it shapes nothing in the URL: these pages are /supplier/, /supplier/applications/
 * and /supplier/profile/, while the sign-in pages beside the group stay outside the door.
 */
export default async function SupplierPortalLayout({ children }: { children: React.ReactNode }) {
  const supplier = await currentSupplier();
  if (!supplier) redirect("/supplier/login/");

  // The figure beside "My applications": still open. Decoration, so a failure costs the figure, not the page.
  const openCount = await prisma.supplierOffer
    .count({ where: { supplierId: supplier.id, status: { in: [...OPEN_STATUSES] } } })
    .catch(() => null);

  const whatsapp = OFFICES.dubai.whatsapp;
  return (
    <div className="flex min-h-screen flex-col bg-[#f2f5f6] text-[#10262e]">
      <SupplierTopBar companyName={supplier.companyName} name={supplier.name} openCount={openCount} />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-[#dde5e8] bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-1 px-4 py-5 text-[12.5px] text-[#5b6f76] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} AFFHAN International Pvt Ltd</p>
          <p>
            Questions about supplying AFFHAN?{" "}
            <a href="mailto:info@affhan.com" className="font-semibold text-brand-dark hover:underline">
              info@affhan.com
            </a>
            {whatsapp ? (
              <>
                {" · "}
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-dark hover:underline">
                  WhatsApp
                </a>
              </>
            ) : null}
          </p>
        </div>
      </footer>
    </div>
  );
}
