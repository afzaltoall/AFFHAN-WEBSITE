import { ASSETS } from "@/components/CinematicExperience/assets";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { FilmImage } from "@/components/CinematicExperience/parts";
import { Starfield } from "@/components/CinematicExperience/Starfield";

/**
 * Everything behind the words, in the film's gold / red / black family:
 *
 *  - One background per chapter ("mood"), crossfaded by opacity only:
 *    intro black; 01 dark blue-gold; 02 dark burgundy-gold; 03 deep black /
 *    warm red; 04 deep black / travel gold; 05 near-black / clean gold;
 *    done near-black / warm gold. (Gradients in apply.css.)
 *  - The intro's thin gold line, and a slow field of gold dust.
 *  - The travel picture step 04 turns towards (the globe).
 *  - The two motifs, 07 red silk and 08 gold light trail, which are never
 *    left on screen: they exist only while a transition sweeps them across.
 *
 *  - Over the chapter's colour, the landing page's night sky (Starfield: stars
 *    that blink, a few that shoot, the sky leaning with the pointer) and two
 *    slow washes of light, gold high on the right and crimson low on the
 *    left, drifting on long loops (CSS, transform only; still under reduced
 *    motion). So the page is alive behind the form, never a flat colour.
 *
 * Fixed to the screen (below the navbar), so a long step such as the review
 * scrolls over the same sky instead of running off the end of it. All of it
 * is aria-hidden and moved by ApplyExperience's timelines.
 */
export const MOODS = ["intro", "0", "1", "2", "3", "4", "done"] as const;
export type Mood = (typeof MOODS)[number];

export function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 top-16 overflow-hidden">
      {MOODS.map((m) => (
        <div key={m} data-ax="mood" data-mood={m} className={`ax-mood-${m} absolute inset-0 ${m === "intro" ? "" : "opacity-0"}`} />
      ))}

      <div className="ax-nebula ax-nebula-a" />
      <div className="ax-nebula ax-nebula-b" />
      <Starfield />

      <div data-ax="travel" className="absolute right-[2%] top-[4%] w-[min(38vw,520px)] opacity-0">
        <FilmImage asset={ASSETS.globe} alt="" sizes="38vw" eager className="opacity-90" />
      </div>

      <div data-ax="dust" className="absolute inset-0 opacity-0">
        <GoldDust className="h-full w-full" density={0.9} />
      </div>

      {/* The intro's horizon: a thin gold line drawn across the screen. */}
      <div data-ax="rule" className="ax-rule absolute inset-x-0 top-[66%] h-px origin-left opacity-0" />

      <div data-ax="silk" className="absolute left-[-10%] top-[38%] w-[120%] opacity-0 md:top-[30%]">
        <FilmImage asset={ASSETS.silk} alt="" sizes="120vw" eager className="cx-feather-x" />
      </div>
      <div data-ax="trail" className="absolute left-[-5%] top-[34%] w-[110%] opacity-0 mix-blend-screen md:top-[28%]">
        <FilmImage asset={ASSETS.gold} alt="" sizes="110vw" eager className="cx-feather-x" />
      </div>

      <div className="cx-grain absolute inset-0" />
    </div>
  );
}

/**
 * The host, Afzal Khan, on a desktop only: the owner's picture ("Afzal
 * Khan.png", never regenerated). He already faces left, his raised arm towards the words, so
 * he is not mirrored. He stands centred in the room to the right of the
 * words, on the bottom, 76% of the screen's height; he is wide (an arm up
 * and a leg out to the left), so his height is also held to that room (the
 * calc below): his arm never reaches the words. It moves
 * only at the defined moments (large in the intro, smaller through 01 and 02,
 * set back in 03, turned towards the travel picture in 04,
 * receding in 05, returning gently on success). Always whole on screen: depth
 * is scale, dimming and a touch of blur, never pushing him off the edge. On
 * each step change a band of light passes across him, cut to his silhouette
 * (.ax-host-sheen). No idle motion of any kind. He is fixed to the screen,
 * beside the form, so on a long step (the review) he stays in view while it
 * scrolls, instead of being left at the top of the page.
 */
export function Host() {
  return (
    <div aria-hidden className="pointer-events-none fixed bottom-0 right-0 top-16 hidden w-[55%] items-end justify-center lg:flex">
      <div data-ax="host" data-ax-hide className="relative aspect-[1004/1390] h-[min(76%,780px,calc(61.9vw-52px))] origin-bottom">
        <FilmImage asset={ASSETS.afzalKhan} alt="" sizes="(min-width: 1024px) 42vw, 1px" eager priority className="drop-shadow-[0_30px_60px_rgb(0_0_0/0.55)]" />
        <div data-ax="host-sheen" className="ax-host-sheen absolute inset-0 overflow-hidden opacity-0">
          <div data-ax="host-band" className="ax-host-band absolute inset-y-0 left-0 w-[45%]" />
        </div>
      </div>
    </div>
  );
}
