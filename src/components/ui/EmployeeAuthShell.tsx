import Image from "next/image";
import Link from "next/link";
import { StaffDesks } from "@/components/ui/StaffDesks";
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
 * The left panel carries the brand and the desks the staff sign in to, running (the owner, 2026-11-03: "this image
 * perfection is ok ... left side animative quotes and leads ... live ai feel ilama", "feels empty ... innovative"):
 * StaffDesks turns through the sales desk, the cargo desk and the trip desk, each headline with a drawing of that desk
 * at work (sample text, nothing fetched). The catalogue figures that sat under it went ("products categories counter
 * ... vendam"). On a restrained grid-and-gradient ground rather than flat navy.
 *
 * Below lg, the sign-in alone (the owner: "in mobile view only login have to show"), centred in the screen ("have to
 * be in center"): the brand, the card, and the copyright line under it.
 *
 * THE LOGO. public/logo.png is a 225x225 transparent PNG, so on a dark ground
 * it needs a light plate behind it or it disappears. The first attempt used a
 * 128x40 pill, which is the wrong shape for a square mark: object-contain
 * fitted the logo to the 40px height and left ~44px of bare white either side,
 * which is the lopsided look this replaces. It is now a square plate sized to
 * the mark, with the wordmark set beside it in white — a lockup rather than a
 * logo floating in a white rectangle.
 */
export function EmployeeAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="employee-auth-shell grid min-h-screen lg:grid-cols-[1fr_1fr]">
      {/* ---------------------------------------------------------- left */}
      {/* Set in from the edge on a wide screen (the owner, 2026-11-03: "slightly move right"). */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b2230] p-12 lg:flex xl:px-24">
        {/* Ground: one deep gradient plus a faint grid. Both are painted, not
            animated — the motion on this panel is the headline's and the desk's. */}
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

        <Lockup />

        <div className="relative z-10">
          <StaffDesks />
        </div>

        <p className="relative z-10 text-sm text-slate-400">© {new Date().getFullYear()} AFFHAN International Pvt Ltd</p>
      </div>

      {/* --------------------------------------------------------- right */}
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-8 sm:px-8 lg:px-12">
        <LoginBackground />

        <div className="relative z-10 w-full max-w-md">
          {/* Below lg: the brand over the card, in place of the left panel. */}
          <div className="mb-7 flex justify-center lg:hidden">
            <Lockup />
          </div>

          {/* The card, as on /login/: white over the ambient background, which
              is what puts the form's text on a AA-contrast ground instead of
              white-on-teal. */}
          <div className="rounded-2xl border border-white/60 bg-white/95 px-6 py-6 shadow-2xl backdrop-blur-xl">{children}</div>

          <p className="mt-6 text-center text-[12.5px] text-white/60 lg:hidden">© {new Date().getFullYear()} AFFHAN International Pvt Ltd</p>
        </div>
      </div>
    </main>
  );
}

/**
 * The AFFHAN mark on its square plate, with the wordmark in white: a lockup rather than a logo floating in a white
 * rectangle (see THE LOGO above).
 */
function Lockup() {
  return (
    <Link
      href="/"
      aria-label="Affhan home"
      className="group relative z-10 inline-flex items-center gap-3 self-start rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
    >
      {/* A square plate for a square mark, with even padding on all four
          sides. The ring and the soft shadow stop it reading as a hole
          punched in the panel. */}
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-white/70 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
        <Image src="/logo.png" alt="" width={34} height={34} className="object-contain" />
      </span>
      <span className="leading-none">
        <span className="block text-[15px] font-black tracking-[0.14em] text-white">AFFHAN</span>
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Staff workspace</span>
      </span>
    </Link>
  );
}

export default EmployeeAuthShell;
