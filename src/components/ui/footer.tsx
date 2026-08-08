"use client";

import React, { useState, type FC, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FooterProps extends React.HTMLAttributes<HTMLElement> {
  logoSrc: string;
  companyName?: string;
  description?: string;
  companyEmail?: string;
  usefulLinksTitle?: string;
  usefulLinks?: { label: string; href: string }[];
  socialTitle?: string;
  socialLinks?: { label: string; href: string; icon: ReactNode }[];
  contactTitle?: string;
  contactLines?: ReactNode;
  onSubscribe?: (email: string) => Promise<boolean>;
}

export const Footer: FC<FooterProps> = ({
  logoSrc,
  companyName = "AFFHAN GROUP",
  description = "Affhan group is an import and export sourcing company valued by its clients and partners in the industry for its high-end professional expertise and services.",
  companyEmail,
  usefulLinksTitle = "Useful Links",
  usefulLinks = [
    { label: "Home", href: "#" },
    { label: "About Us", href: "#" },
    { label: "Contact Us", href: "#" },
    { label: "Privacy Policy", href: "/privacy-policy" },
  ],
  socialTitle = "Follow Us",
  socialLinks = [],
  contactTitle = "Subscribe to our newsletter",
  contactLines,
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
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-9 px-6 py-12 sm:px-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-12 lg:px-14">
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
        </section>

        <nav className="lg:justify-self-center" aria-label="Useful links">
          <div className="flex h-12 items-center mb-4">
            <h3 className="text-base font-bold tracking-wide text-white">
              {usefulLinksTitle}
            </h3>
          </div>
          <ul className="space-y-2.5">
            {usefulLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className="text-sm text-slate-200 transition-colors hover:text-[#3cd5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3cd5f7]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="lg:justify-self-center" aria-label="Follow us">
          <div className="flex h-12 items-center mb-4">
            <h3 className="text-base font-bold tracking-wide text-white">
              {socialTitle}
            </h3>
          </div>
          <ul className="space-y-2.5">
            {socialLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  aria-label={link.label}
                  className="flex items-center gap-2 text-sm text-slate-200 transition-colors hover:text-[#3cd5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3cd5f7]"
                >
                  {link.icon}
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section>
          <div className="flex h-12 items-center mb-4">
            <h3 className="text-base font-bold tracking-wide text-white">
              {contactTitle}
            </h3>
          </div>
          {contactLines ? (
            <div className="text-sm leading-7 text-slate-200/90">
              {contactLines}
            </div>
          ) : (
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
          )}
        </section>
      </div>
    </footer>
  );
};
