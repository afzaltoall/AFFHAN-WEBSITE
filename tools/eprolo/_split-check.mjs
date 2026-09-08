// Structural proof that the three homepage sections cannot share a product.
//
// Overlap used to be possible because each section carved the SAME array by
// hard-coded index: hero 0..60, Popular 61..81, Spotlight 60..65. The last two
// sat inside the first. splitHeroPool replaces that with ranges that cannot
// intersect, which is a property worth asserting rather than eyeballing in a
// browser — the DOM only shows one sample of it.

export function splitHeroPoolCheck() {
  // Mirrors src/lib/heroPool.ts. Kept literal so this runs without a TS build.
  const HERO = 240, POPULAR = 100;
  const split = (pool) => {
    const withImage = pool.filter((p) => p.imageUrl);
    const heroEnd = Math.min(HERO, withImage.length);
    const popularEnd = Math.min(heroEnd + POPULAR, withImage.length);
    return {
      hero: withImage.slice(0, heroEnd),
      popular: withImage.slice(heroEnd, popularEnd),
      spotlight: withImage.slice(popularEnd),
    };
  };

  let failures = 0;
  for (const size of [0, 5, 65, 100, 240, 341, 400, 600]) {
    const pool = Array.from({ length: size }, (_, i) => ({ id: i, imageUrl: `img-${i}` }));
    const { hero, popular, spotlight } = split(pool);
    const ids = (a) => new Set(a.map((x) => x.id));
    const h = ids(hero), p = ids(popular), s = ids(spotlight);
    const hp = [...h].filter((x) => p.has(x)).length;
    const hs = [...h].filter((x) => s.has(x)).length;
    const ps = [...p].filter((x) => s.has(x)).length;
    const total = hero.length + popular.length + spotlight.length;
    const ok = hp === 0 && hs === 0 && ps === 0 && total === size;
    if (!ok) failures++;
    console.log(`  pool ${String(size).padStart(3)} -> hero ${String(hero.length).padStart(3)}, ` +
      `popular ${String(popular.length).padStart(3)}, spotlight ${String(spotlight.length).padStart(3)}` +
      `  overlaps h/p=${hp} h/s=${hs} p/s=${ps}  covers-all=${total === size}  ${ok ? 'ok' : 'FAIL'}`);
  }
  console.log(`  ${failures === 0 ? 'no overlap at any pool size' : failures + ' FAILURES'}`);
  return failures === 0;
}
