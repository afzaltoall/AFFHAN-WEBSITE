import Image from "next/image";
import Link from "next/link";
import { SalesDeskPreview } from "@/components/ui/SalesDeskPreview";
import { LoginBackground } from "@/components/ui/LoginBackground";

/**
 * The frame both employee auth screens sit in.
 *
 * It exists so /employee/login/ and /employee/forgot-password/ stop being two
 * unrelated designs — the login page was a navy rectangle beside a brand
 * gradient with white-on-teal form fields, and forgot-password was a plain
 * card centred on slate-50. This is one shell, and it is the SAME shell the
 * public /login/ uses: the ambient LoginBackground on the form side, a white
 * card on top of it, and the field tokens from authFieldStyles inside.
 *
 * The left panel is the part that was empty. It now carries the brand, the
 * headline, a drawing of the sales desk (see SalesDeskPreview — sample text,
 * nothing fetched) and the copyright line, on a restrained grid-and-gradient
 * ground rather than flat navy.
 *
 * Below lg the left panel is replaced by a compact brand header above the
 * form, so a phone gets the logo and the heading without 50% of the viewport
 * spent on decoration, and nothing scrolls sideways.
 *
 * No dark-background logo variant exists in public/ — only logo.png — so the
 * white pill stays. Creating one was out of scope.
 */
export function EmployeeAuthShell({
  title,
  blurb,
  children,
}: {
  /** The headline on the left panel, and the small heading on mobile. */
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1fr]">
      {/* ---------------------------------------------------------- left */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b2230] p-12 lg:flex">
        {/* Ground: one deep gradient plus a faint grid. Both are painted, not
            animated — the only motion on this panel is the preview's. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,#14465a_0%,#0b2230_55%,#07161f_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(100% 70% at 30% 20%, #000 0%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(100% 70% at 30% 20%, #000 0%, transparent 75%)",
            }}
          />
        </div>

        <Link
          href="/"
          className="relative z-10 inline-block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
        >
          <span className="relative block h-10 w-32 rounded-xl bg-white p-2 shadow-sm">
            <Image src="/logo.png" alt="Affhan" fill className="object-contain" />
          </span>
        </Link>

        <div className="relative z-10">
          <h1 className="text-4xl font-black leading-tight text-white">{title}</h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">{blurb}</p>
          <div className="mt-9">
            <SalesDeskPreview />
          </div>
        </div>

        <p className="relative z-10 text-sm text-slate-400">
          © {new Date().getFullYear()} AFFHAN International Pvt Ltd
        </p>
      </div>

      {/* --------------------------------------------------------- right */}
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-12">
        <LoginBackground />

        <div className="relative z-10 w-full max-w-md">
          {/* The mobile brand header the left panel collapses into. */}
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <Link
              href="/"
              className="inline-block rounded-xl transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            >
              <span className="relative block h-10 w-32 rounded-xl bg-white p-2 shadow-sm">
                <Image src="/logo.png" alt="Affhan" fill className="object-contain" />
              </span>
            </Link>
            <h1 className="mt-4 text-2xl font-black text-white">{title}</h1>
          </div>

          {/* The card, as on /login/: white over the ambient background, which
              is what puts the form's text on a AA-contrast ground instead of
              white-on-teal. */}
          <div className="rounded-2xl border border-white/60 bg-white/95 px-6 py-6 shadow-2xl backdrop-blur-xl">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

export default EmployeeAuthShell;
