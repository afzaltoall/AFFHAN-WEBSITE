"use client";

import React, { useState, type FC, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FooterLink = { label: string; href: string; icon?: ReactNode };

interface FooterProps extends React.HTMLAttributes<HTMLElement> {
  logoSrc: string;
  companyName?: string;
  description?: string;
  companyEmail?: string;
  usefulLinksTitle?: string;
  usefulLinks?: FooterLink[];
  socialTitle?: string;
  socialLinks?: FooterLink[];
  /** Fourth column: the location landing pages. */
  locationsTitle?: string;
  locations?: FooterLink[];
  contactTitle?: string;
  contactLines?: ReactNode;
  /**
   * The copyright / social strip, rendered INSIDE <footer>.
   *
   * It used to be a sibling of this component rather than a child, which left
   * the copyright line and all six social icons outside the footer landmark —
   * so "go to the footer" reached the link columns and stopped short of them.
   */
  bottomBar?: ReactNode;
  onSubscribe?: (email: string) => Promise<boolean>;
}

/**
 * One heading treatment for all four columns.
 *
 * Extracted so they cannot drift: the same markup was written out four times,
 * which is how three of them end up matching and the fourth does not. The h-12
 * box is what lines the headings up with the logo lockup in column one — the
 * columns have different content heights, so without it the headings sit at
 * four different baselines.
 */
const ColumnHeading: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="mb-4 flex h-12 items-center">
    <h3 className="text-base font-bold uppercase tracking-wide text-white">{children}</h3>
  </div>
);

/**
 * A footer link list.
 *
 * <ul> inside <footer>, NOT <nav>. These lists used to be two <nav
 * aria-label="..."> landmarks, which put a third and fourth navigation
 * landmark on every page alongside the header's — and they largely repeat what
 * the header already offers. A screen-reader user cycling landmarks now finds
 * one nav, not three.
 *
 * next/link, not <a>. Every one of these is an internal route, so a bare <a>
 * made the entire footer of every page a full reload — the same bug fixed on
 * the careers link, but multiplied by thirteen links on every page of the
 * site. External and mailto links stay as <a>, which is what they should be.
 */
const LinkColumn: FC<{ title: string; links: FooterLink[]; className?: string }> = ({
  title,
  links,
  className,
}) => (
  <section className={className}>
    <ColumnHeading>{title}</ColumnHeading>
    <ul className="space-y-2.5">
      {links.map((link) => (
        <li key={link.label}>
          <Link
            href={link.href}
            className="flex items-center gap-2 text-sm text-slate-200 transition-colors hover:text-[#3cd5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3cd5f7]"
          >
            {link.icon}
            <span>{link.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
);

export const Footer: FC<FooterProps> = ({
  logoSrc,
  companyName = "AFFHAN GROUP",
  description = "Affhan group is an import and export sourcing company valued by its clients and partners in the industry for its high-end professional expertise and services.",
  companyEmail,
  usefulLinksTitle = "Useful Links",
  usefulLinks = [
    { label: "Home", href: "/" },
    { label: "About Us", href: "/about/" },
    { label: "Contact Us", href: "/contact/" },
    { label: "Privacy Policy", href: "/privacy-policy/" },
  ],
  socialTitle = "Follow Us",
  socialLinks = [],
  locationsTitle = "OUR LOCATIONS",
  locations = [],
  contactTitle = "Subscribe to our newsletter",
  contactLines,
  bottomBar,
  onSubscribe,
  className,
  ...props
}) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const handleSubscribe = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const success = onSubscribe ? await onSubscribe(email) : true;

    setSubscriptionStatus(success ? "success" : "error");
    setIsSubmitting(false);

    if (success) {
      setEmail("");
    }

    window.setTimeout(() => {
      setSubscriptionStatus("idle");
    }, 3000);
  };

  return (
    <footer
      className={cn(
        "w-full bg-[#245B6D] text-white",
        className,
      )}
      {...props}
    >
      {/* 1 / 2 / 4 columns. Unchanged — the grid was already right; what was
          wrong was what sat in the columns. Quick Links carried thirteen items
          against Services' six, so column two ran roughly twice the height of
          its neighbours and the row bottomed out ragged. The six location links
          move into a fourth column of their own and the address moves up into
          the brand column, which leaves 7 / 6 / 6 and a level row. */}
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-9 px-6 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-12 lg:px-14">
        {/* Column 1 — who we are and how to reach us. */}
        <section className="flex flex-col items-start gap-4">
          <div className="flex h-12 items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-200">
              <Image
                src={logoSrc}
                alt={`${companyName} logo`}
                width={42}
                height={42}
                className="h-10 w-10 object-contain"
              />
            </span>
            <span className="text-xl font-bold tracking-[-0.01em]">
              {companyName}
            </span>
          </div>
          <p className="max-w-[390px] text-sm leading-7 text-slate-200/90">
            {description}
          </p>
          {companyEmail ? (
            <a
              href={`mailto:${companyEmail}`}
              className="text-sm font-semibold text-white/95 transition-colors hover:text-[#3cd5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3cd5f7]"
            >
              {companyEmail}
            </a>
          ) : null}
          {/* The registered address, moved here from the fourth column so that
              column can carry the locations. It belongs beside the brand
              anyway: name, description, address, phone, email is one block. */}
          {contactLines ? (
            <div className="mt-2 max-w-[390px] text-sm leading-7 text-slate-200/90">
              {contactTitle ? (
                <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-white">
                  {contactTitle}
                </p>
              ) : null}
              {contactLines}
            </div>
          ) : null}
        </section>

        {/* Column 2 — Quick Links. */}
        <LinkColumn title={usefulLinksTitle} links={usefulLinks} className="lg:justify-self-center" />

        {/* Column 3 — Services. */}
        <LinkColumn title={socialTitle} links={socialLinks} className="lg:justify-self-center" />

        {/* Column 4 — Our Locations, or the newsletter form when a consumer
            passes no locations (the component's original default). */}
        {locations.length > 0 ? (
          <LinkColumn title={locationsTitle} links={locations} />
        ) : (
          <section>
            <ColumnHeading>{contactTitle}</ColumnHeading>
            <form onSubmit={handleSubscribe} className="relative w-full max-w-sm">
              <div className="relative">
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting || subscriptionStatus !== "idle"}
                  required
                  aria-label="Email for newsletter"
                  className="pr-28"
                />
                <Button
                  type="submit"
                  disabled={isSubmitting || subscriptionStatus !== "idle"}
                  className="absolute right-1 top-1 h-9 rounded-full bg-white px-4 text-[#245b6d] hover:bg-[#e9f8fb] font-semibold"
                >
                  {isSubmitting ? "Sending..." : "Subscribe"}
                </Button>
              </div>

              {(subscriptionStatus === "success" ||
                subscriptionStatus === "error") && (
                <div
                  key={subscriptionStatus}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-white/85 text-center text-sm shadow-sm backdrop-blur-sm"
                >
                  {subscriptionStatus === "success" ? (
                    <span className="font-semibold text-emerald-600">
                      Subscribed!
                    </span>
                  ) : (
                    <span className="font-semibold text-red-600">
                      Failed. Try again.
                    </span>
                  )}
                </div>
              )}
            </form>
          </section>
        )}
      </div>
      {bottomBar}
    </footer>
  );
};
