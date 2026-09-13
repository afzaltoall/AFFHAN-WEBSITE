// Proposed title / description / H1 for the six pages, with the numbers that
// decide whether each one is shippable.
//
//   node tools/audit/105-metadata-proposal.mjs
//
// Titles are checked against 60 characters and descriptions against 155,
// because the current set is already at those limits — China's title is 64 and
// truncates today. This is a trade of words, not an addition of them, so the
// count matters as much as the wording.

const LIMITS = { title: 60, description: 155 };

const KW = [
  ['sourcing company', /sourcing compan/i],
  ['sourcing agent', /sourcing agent/i],
  ['import/export', /import[\s/-]?(and\s)?export|import\b.*\bexport/i],
  ['shipping', /shipping/i],
  ['logistics', /logistic/i],
  ['freight', /freight/i],
  ['procurement', /procurement|buying office/i],
  ['supplier', /supplier|factory|manufactur/i],
];

const PAGES = [
  {
    slug: 'sourcing-company-singapore',
    was: {
      title: 'China Sourcing Agent in Singapore | AFFHAN Group',
      description: 'China sourcing agent in Singapore for import and re-export. Factory sourcing, inspection, PSA freight, GST and TradeNet permits, ASEAN distribution.',
      h1: 'China Sourcing Agent in Singapore — AFFHAN Group',
    },
    now: {
      title: 'Sourcing Company in Singapore | China Sourcing Agent',
      description: 'Sourcing company and China sourcing agent in Singapore: factory sourcing, inspection, PSA freight, TradeNet permits and ASEAN re-export logistics.',
      h1: 'Sourcing Company & China Sourcing Agent in Singapore — AFFHAN Group',
    },
    why: 'Adds the head phrase it never carried ("sourcing company") plus logistics. Most title room of the six (was 48).',
  },
  {
    slug: 'sourcing-company-malaysia',
    was: {
      title: 'China Sourcing Agent in Malaysia | Import | AFFHAN Group',
      description: 'China sourcing agent in Malaysia. Factory sourcing, halal and SIRIM compliance, Form E preferential duty, Port Klang freight and SST-ready clearance.',
      h1: 'China Sourcing Agent in Malaysia — AFFHAN Group',
    },
    now: {
      title: 'Sourcing Company in Malaysia | China Sourcing Agent',
      description: 'Sourcing company and import agent in Malaysia: factory sourcing, halal and SIRIM compliance, Form E duty savings, Port Klang freight and logistics.',
      h1: 'Sourcing Company & China Sourcing Agent in Malaysia — AFFHAN Group',
    },
    why: 'Replaces the bare "| Import" fragment with the head phrase; keeps halal/SIRIM/Form E, which is what makes this page local.',
  },
  {
    slug: 'sourcing-company-uk',
    was: {
      title: 'China Sourcing Agent London | UK Import Company | AFFHAN',
      description: 'China sourcing agent in London for UK importers. Factory sourcing, inspection and freight into Felixstowe and Southampton, with CDS customs clearance.',
      h1: 'China Sourcing Agent in London & the UK — AFFHAN Group',
    },
    now: {
      title: 'Sourcing Company in London | UK Import Export Agent',
      description: 'Sourcing company and China sourcing agent in London for UK import and export: factory inspection, Felixstowe freight and CDS customs clearance.',
      h1: 'Sourcing Company & China Sourcing Agent in London & the UK — AFFHAN Group',
    },
    why: 'Keeps "import" but pairs it with "export" and the head phrase. Office is Mitcham, in Greater London, so "London" is honest.',
  },
  {
    slug: 'china-sourcing-company',
    was: {
      title: 'China Sourcing Company | Import Export Partner in China – AFFHAN',
      description: 'AFFHAN is a China sourcing company and import export company with its own buying office in Guangzhou. Factory sourcing, inspection and freight since 2000.',
      h1: 'China Sourcing Company — Your Import Export Partner in China',
    },
    now: {
      title: 'China Sourcing Company & Import Export Agent | AFFHAN',
      description: 'China sourcing company and import export agent with our own buying office in Guangzhou: supplier sourcing, factory audits, freight and logistics.',
      h1: 'China Sourcing Company & Import Export Agent — Sourcing, Shipping and Logistics from China',
    },
    why: 'Its title is 64 today and truncates in results. Shortening it also frees room for "agent", which it lacked.',
  },
  {
    slug: 'china-sourcing-office-guangzhou',
    was: {
      title: 'Our China Sourcing Office in Guangzhou | AFFHAN Group',
      description: "Inside AFFHAN's Guangzhou sourcing office: the factory clusters we buy from, how inspection works, Canton Fair sourcing and container consolidation.",
      h1: 'Our China Sourcing Office in Guangzhou — AFFHAN Group',
    },
    now: {
      title: 'Guangzhou Sourcing Agent & China Buying Office | AFFHAN',
      description: 'Our Guangzhou sourcing agent and China buying office: supplier sourcing, factory audits, Canton Fair sourcing, container consolidation and freight.',
      h1: 'Guangzhou Sourcing Agent & China Buying Office — AFFHAN Group',
    },
    why: 'The biggest change of the six. Today it carries no commercial keyword at all and reads as an internal about-page; "Our ... Office" is not a phrase anyone searches.',
  },
  {
    slug: 'sourcing-from-china',
    was: {
      title: 'China Sourcing Agent | Costs, Lead Times & Risks | AFFHAN',
      description: 'What sourcing from China actually involves: Chinese New Year timing, minimum order quantities, tooling ownership and when China is the wrong answer.',
      h1: 'Sourcing From China — What Buyers Should Know First',
    },
    now: {
      title: 'Sourcing From China: Costs, Lead Times & Supplier Risks',
      description: 'What importing from China really involves: MOQs, Chinese New Year timing, tooling ownership, supplier vetting, freight costs and when to look elsewhere.',
      h1: 'Sourcing From China — Costs, Lead Times, Suppliers and Shipping',
    },
    why: 'Deliberately NOT led by "China Sourcing Agent" any more — that duplicated the China page and the two competed. This one owns the informational intent.',
  },
];

const bar = (n, limit) => (n <= limit ? 'ok ' : 'OVER');

console.log('PROPOSED METADATA — 6 pages\n');
for (const p of PAGES) {
  console.log(`/${p.slug}/`);
  for (const f of ['title', 'description']) {
    const limit = LIMITS[f];
    console.log(`  ${f.toUpperCase()}`);
    console.log(`    was (${String(p.was[f].length).padStart(3)}) ${p.was[f]}`);
    console.log(`    now (${String(p.now[f].length).padStart(3)}) ${bar(p.now[f].length, limit)} ${p.now[f]}`);
  }
  console.log(`  H1`);
  console.log(`    was  ${p.was.h1}`);
  console.log(`    now  ${p.now.h1}`);

  const blobWas = [p.was.title, p.was.description, p.was.h1].join(' ');
  const blobNow = [p.now.title, p.now.description, p.now.h1].join(' ');
  const gained = KW.filter(([, re]) => re.test(blobNow) && !re.test(blobWas)).map(([k]) => k);
  const still = KW.filter(([, re]) => !re.test(blobNow)).map(([k]) => k);
  console.log(`  gains : ${gained.length ? gained.join(', ') : '(none)'}`);
  console.log(`  still absent in metadata (body/FAQ work): ${still.length ? still.join(', ') : 'none'}`);
  console.log(`  why   : ${p.why}\n`);
}

const over = PAGES.filter((p) => p.now.title.length > LIMITS.title || p.now.description.length > LIMITS.description);
console.log(over.length ? `WARNING: ${over.length} over limit` : 'All titles <= 60 and descriptions <= 155.');
