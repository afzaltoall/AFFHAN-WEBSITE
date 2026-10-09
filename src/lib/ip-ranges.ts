/**
 * Whether an IP address is one the open internet can route to, for the photo
 * search's link fetch (security audit 2026-10-08, L1). Pure: the caller
 * resolves the name; this classifies what came back, so the rule can be
 * tested on its own.
 *
 * The old check compared dotted IPv4 text with a list of prefixes, and looked
 * for "::ffff:" in front of a dotted address. But the URL parser writes an IPv6
 * literal's embedded IPv4 in hex ("[::ffff:127.0.0.1]" becomes ::ffff:7f00:1),
 * so that link to this server's own loopback passed as public. Here every
 * address is parsed to numbers, and every IPv6 form that carries an IPv4
 * address (mapped, compatible, NAT64, 6to4) is judged by the address it
 * carries.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

type V4 = [number, number, number, number];

/** IPv4 ranges never fetched: [network, prefix length]. */
const V4_BLOCKED: Array<[V4, number]> = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, where cloud metadata services answer
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 168, 0, 0], 16], // private
  [[198, 18, 0, 0], 15], // benchmarking
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, and the broadcast address
];

function parseV4(s: string): V4 | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const octets = m.slice(1).map(Number) as V4;
  return octets.every((o) => o <= 255) ? octets : null;
}

const v4Number = (o: V4) => ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];

function isPublicV4(o: V4): boolean {
  const n = v4Number(o);
  return !V4_BLOCKED.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4Number(net) & mask) >>> 0);
  });
}

/** The eight 16-bit groups of an IPv6 address, or null if it is not one. */
function parseV6(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // A dotted IPv4 tail ("::ffff:1.2.3.4") becomes its two groups.
  const lastColon = s.lastIndexOf(":");
  if (lastColon >= 0 && s.slice(lastColon + 1).includes(".")) {
    const v4 = parseV4(s.slice(lastColon + 1));
    if (!v4) return null;
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (halves.length === 2 ? fill < 1 : head.length !== 8) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

const embeddedV4 = (hi: number, lo: number): V4 => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];

function isPublicV6(g: number[]): boolean {
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible, which covers :: and ::1 as well).
  if (zeroUpTo(5) && g[5] === 0xffff) return isPublicV4(embeddedV4(g[6], g[7]));
  if (zeroUpTo(6)) return g[6] !== 0 && isPublicV4(embeddedV4(g[6], g[7]));
  // NAT64, 64:ff9b::a.b.c.d, and its local-use range 64:ff9b:1::/48.
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && isPublicV4(embeddedV4(g[6], g[7]));
  // 6to4, 2002:aabb:ccdd::.
  if (g[0] === 0x2002) return isPublicV4(embeddedV4(g[1], g[2]));
  // Teredo (2001:0::/32) hides its IPv4 address; nothing a shopper links to lives there.
  if (g[0] === 0x2001 && g[1] === 0) return false;
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7, unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10, link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10, site-local (retired)
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8, multicast
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // 100::/64, discard
  return true;
}

/** True for an address on the open internet; false for anything internal, reserved, or not an IP at all. */
export function isPublicAddress(ip: string): boolean {
  const host = ip.trim().replace(/^\[|\]$/g, "");
  const v4 = parseV4(host);
  if (v4) return isPublicV4(v4);
  const v6 = parseV6(host);
  return v6 !== null && isPublicV6(v6);
}
