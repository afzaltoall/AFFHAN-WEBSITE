import "server-only";

/**
 * Words that name a material, a use or a part rather than a kind of product (the coverage analysis's list,
 * REPORT.md Appendix G). A supplier term made only of these ("corporate gift", "hotel amenity", "baby", "led
 * light", "car part", "silicone") is broad: it matches titles by accident as often as not, so it scores low
 * unless the inquired product's category agrees, and a supplier matched through one is shown as a broad match.
 */
export const BROAD_WORDS: ReadonlySet<string> = new Set(
  (
    "leather silicone silicon ceramic wooden wood gold silver silk glass fabric rubber plastic paper steel metal bamboo cotton " +
    "acetate tpu abs pc polyester aluminium aluminum copper brass foam acrylic nylon pvc eva " +
    "led light lighting sport kitchen bathroom bedroom car auto accessory decor decoration interior exterior electronic hardware " +
    "energy engineering packing packaging household home office hotel solar laser audio baby kid child lady woman women man men " +
    "amenity gift corporate craft care fancy daily fresh supply theme park " +
    "button clip frame controller magnet tube panel board seat floor hook cable motor adapter ink glue tape screw bolt bearing " +
    "wrap prop master valve part spare chain through plating infrared sensor switch module wire"
  ).split(/\s+/),
);

/** Every word of the term is a material, a use or a part. */
export function isBroadTerm(term: string): boolean {
  return term.split(/\s+/).every((w) => BROAD_WORDS.has(w));
}
