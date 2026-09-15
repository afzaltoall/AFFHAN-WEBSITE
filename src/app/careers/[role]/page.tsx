import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FooterSection } from "@/components/sections/FooterSection";
import { LOGO_URL, OFFICES, ORG_ID, SITE_URL, postalAddress, type OfficeNap } from "@/lib/brand";
import {
  OFFICE_LANDING_PAGE,
  ROLES,
  ROLES_CONFIRMED_ON,
  rolePath,
  roleBySlug,
  roleLocationLabel,
  roleLocationSentence,
  type CareerRole,
} from "@/lib/careerRoles";

// One page per job, which is the shape Google actually asks for.
//
// The four postings previously shared /careers/. That is valid markup and it
// validates in the Rich Results Test, but Google's job documentation is
// explicit that a posting needs its own URL to be eligible for the jobs
// experience — a list page marked up with four JobPostings is a list page.
// /careers/ is now the overview and links here; each of these owns exactly one
// JobPosting, one canonical and one <h1>.

export const revalidate = 86_400;

export function generateStaticParams() {
  return ROLES.map((role) => ({ role: role.slug }));
}

// Anything that is not one of the four slugs is a 404, not a thin page built
// from an empty role.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>;
}): Promise<Metadata> {
  const role = roleBySlug((await params).role);
  if (!role) return {};

  const url = `${SITE_URL}${rolePath(role)}`;
  return {
    title: role.metaTitle,
    description: role.metaDescription,
    // Set explicitly on every one of these. careers/layout.tsx declares a
    // canonical for the overview page, and `alternates` inherits down the
    // segment — without this, all four would claim to be /careers/.
    alternates: { canonical: url },
    openGraph: {
      title: role.metaTitle,
      description: role.metaDescription,
      url,
      siteName: "Affhan",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: role.metaTitle,
      description: role.metaDescription,
    },
  };
}

function jobPostingSchema(role: CareerRole) {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    identifier: {
      "@type": "PropertyValue",
      name: "AFFHAN Group",
      value: `affhan-role-${role.id}`,
    },
    title: role.title,
    // Google requires a full description and accepts HTML. Built from the same
    // copy the page renders, so the two cannot disagree.
    description: [
      `<p>${role.blurb}</p>`,
      `<p>${role.context}</p>`,
      `<p>What you will do:</p><ul>`,
      role.features.map((f) => `<li>${f}</li>`).join(""),
      `</ul>`,
      `<p>AFFHAN International has sourced, inspected and shipped goods out of China since 2000, from seven offices across Asia, the Middle East and Europe.</p>`,
    ].join(""),
    datePosted: ROLES_CONFIRMED_ON,
    hiringOrganization: {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "AFFHAN International Pvt Ltd",
      sameAs: SITE_URL,
      logo: LOGO_URL,
    },
    jobLocation: role.offices.map((key) => ({
      "@type": "Place",
      address: postalAddress(OFFICES[key]),
    })),
    url: `${SITE_URL}${rolePath(role)}`,
  };
}

// Careers → this role. Two levels, because that is the whole depth of the
// section, and a breadcrumb that invents a level is worse than none.
function breadcrumbSchema(role: CareerRole) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Careers", item: `${SITE_URL}/careers/` },
      { "@type": "ListItem", position: 2, name: role.title, item: `${SITE_URL}${rolePath(role)}` },
    ],
  };
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const role = roleBySlug((await params).role);
  if (!role) notFound();

  const others = ROLES.filter((r) => r.slug !== role.slug);

  return (
    <main className="relative min-h-screen bg-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingSchema(role)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(role)) }}
      />

      {/* Header. pt-28 rather than pt-24: the navbar is `fixed` inside a
          `relative` header and contributes nothing to flow, so every page pads
          for it itself. */}
      <header className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white pt-28 pb-14">
        <div className="mx-auto max-w-3xl px-6 sm:px-8">
          <nav aria-label="Breadcrumb" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <Link href="/careers/" className="hover:text-brand">
              Careers
            </Link>
            <span className="mx-2 text-slate-300">/</span>
            <span className="text-slate-700">{role.title}</span>
          </nav>

          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-900 sm:text-5xl text-balance">
            {role.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{role.blurb}</p>

          <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Location</dt>
              <dd className="mt-1 font-semibold text-slate-800">{roleLocationLabel(role)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Team</dt>
              <dd className="mt-1 font-semibold text-slate-800">AFFHAN International</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Listed</dt>
              <dd className="mt-1 font-semibold text-slate-800">
                <time dateTime={ROLES_CONFIRMED_ON}>
                  {new Date(ROLES_CONFIRMED_ON).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </dd>
            </div>
          </dl>

          <a
            href="/contact/"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
          >
            Apply for this role
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-14 sm:px-8">
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">About the role</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">{role.context}</p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">What you will do</h2>
          <ul className="mt-5 space-y-3">
            {role.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-base leading-relaxed text-slate-700">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {feature}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Where you will work
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            This role is based in {roleLocationSentence(role)}.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {role.offices.map((key) => {
              const office: OfficeNap = OFFICES[key];
              const landing = OFFICE_LANDING_PAGE[key];
              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
                  <p className="text-sm font-bold tracking-tight text-slate-900">{office.legalName}</p>
                  <address className="mt-2 text-sm not-italic leading-relaxed text-slate-600">
                    {office.address.streetAddress}
                    <br />
                    {office.address.addressLocality}
                    {office.address.addressRegion ? `, ${office.address.addressRegion}` : ""}
                    {office.address.postalCode ? ` ${office.address.postalCode}` : ""}
                  </address>
                  {landing && (
                    <Link
                      href={landing.href}
                      className="mt-3 inline-block text-sm font-semibold text-brand hover:text-brand-dark"
                    >
                      More about {landing.label} →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">About AFFHAN</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            AFFHAN International Pvt Ltd has traded since 2000 from a head office in Royapuram,
            Chennai, with its own registered company and staff in China, Singapore, Malaysia, the
            UAE, the United Kingdom and France. We source products from Chinese factories, inspect
            them before they ship, and move them by sea and air with customs cleared at both ends.{" "}
            <Link href="/about/" className="font-semibold text-brand hover:text-brand-dark">
              More about the company
            </Link>
            .
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-brand/20 bg-brand/5 p-7">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">How to apply</h2>
          <p className="mt-3 text-base leading-relaxed text-slate-700">
            Send us your CV and a line about why this role, either through the contact form or by
            email to{" "}
            <a href="mailto:info@affhan.com" className="font-semibold text-brand hover:text-brand-dark">
              info@affhan.com
            </a>
            . Mention <strong>{role.title}</strong> so it reaches the right office.
          </p>
          <a
            href="/contact/"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
          >
            Apply for this role
          </a>
        </section>

        <section className="mt-14 border-t border-slate-200 pt-10">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Other open roles</h2>
          <ul className="mt-4 divide-y divide-slate-200">
            {others.map((other) => (
              <li key={other.slug}>
                <Link
                  href={rolePath(other)}
                  className="group flex items-baseline justify-between gap-4 py-3"
                >
                  <span className="font-semibold text-slate-800 group-hover:text-brand">
                    {other.title}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">{roleLocationLabel(other)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/careers/"
            className="mt-6 inline-block text-sm font-semibold text-brand hover:text-brand-dark"
          >
            ← All careers at AFFHAN
          </Link>
        </section>
      </div>

      <FooterSection />
    </main>
  );
}
