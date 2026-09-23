import fs from 'node:fs';

// Replaces the per-company list in the admin Filter panel with two choices:
// "All", and only the people who named a company.
//
//   node tools/eprolo/39-company-filter.mjs
//
// Done as a script rather than by hand because the same shape appears in four
// filter predicates, two useState declarations and two count memos, and missing
// one of them leaves a filter that silently matches nothing.

const f = 'src/components/admin/AdminConsole.tsx';
let s = fs.readFileSync(f, 'utf8');
let n = 0;
const sub = (from, to, expect = 1) => {
  const hits = s.split(from).length - 1;
  if (hits !== expect) { console.error(`expected ${expect} hit(s), found ${hits} for:\n  ${from.slice(0, 100)}`); process.exit(1); }
  s = s.split(from).join(to);
  n += hits;
};

// --- state: the filter now holds a mode, not a company name ----------------
sub(
  'const [inquiryCompanyFilter, setInquiryCompanyFilter] = useState<string>("all");',
  'const [inquiryCompanyFilter, setInquiryCompanyFilter] = useState<CompanyFilter>("all");',
);
sub(
  'const [contactCompanyFilter, setContactCompanyFilter] = useState<string>("all");',
  'const [contactCompanyFilter, setContactCompanyFilter] = useState<CompanyFilter>("all");',
);

// --- counts: how many named a company, rather than a list of them ----------
sub(
  `  const inquiryCompanies = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach(i => {
      const cName = i.companyName?.trim();
      if (cName) counts.set(cName, (counts.get(cName) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);`,
  `  const inquiryWithCompany = useMemo(
    () => items.filter((i) => i.companyName?.trim()).length,
    [items],
  );`,
);
sub(
  `  const contactCompanies = useMemo(() => {
    const counts = new Map<string, number>();
    contactItems.forEach(c => {
      const cName = c.companyName?.trim();
      if (cName) counts.set(cName, (counts.get(cName) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [contactItems]);`,
  `  const contactWithCompany = useMemo(
    () => contactItems.filter((c) => c.companyName?.trim()).length,
    [contactItems],
  );`,
);

// --- the four predicates ---------------------------------------------------
sub(
  '(inquiryCompanyFilter === "all" || i.companyName?.trim() === inquiryCompanyFilter) &&',
  'matchesCompany(i.companyName, inquiryCompanyFilter) &&',
);
sub(
  '(contactCompanyFilter === "all" || c.companyName?.trim() === contactCompanyFilter) &&',
  'matchesCompany(c.companyName, contactCompanyFilter) &&',
  2, // the active list and the trash list
);
sub(
  'const matchingCompany = contactCompanyFilter === "all" ? contactItems : contactItems.filter(c => c.companyName?.trim() === contactCompanyFilter);',
  'const matchingCompany = contactItems.filter((c) => matchesCompany(c.companyName, contactCompanyFilter));',
);

// --- what gets handed to FilterMenu ---------------------------------------
sub('              companies={contactCompanies}', '              withCompanyCount={contactWithCompany}');
sub('                    companies={inquiryCompanies}', '                    withCompanyCount={inquiryWithCompany}');

fs.writeFileSync(f, s);
console.log(`applied ${n} replacements`);
