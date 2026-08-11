"use client";

import { Footer } from "@/components/ui/footer";

import { InstagramIcon, LinkedinIcon, YouTubeIcon, FacebookIcon, TiktokIcon, TwitterXIcon } from "@/components/ui/social-icons";

function ChevronIcon() {
  return (
    <span aria-hidden="true" className="text-[#3cd5f7] font-bold text-base">
      ›
    </span>
  );
}

const usefulLinks = [
  { label: "Home", href: "/" },
  { label: "Explore Products", href: "/explore-products" },
  { label: "About Us", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Contact Us", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms-conditions" },
];

const socialLinks = [
  { label: "Manufacturing, Sourcing & Supply", href: "/about#service-manufacturing", icon: <ChevronIcon /> },
  { label: "Global Shipping Network", href: "/about#service-global-shipping", icon: <ChevronIcon /> },
  { label: "Door-to-Door Freight Solutions", href: "/about#service-door-to-door", icon: <ChevronIcon /> },
  { label: "Air Freight Services", href: "/about#service-air-freight", icon: <ChevronIcon /> },
  { label: "Non-Vessel Operating Common Carrier", href: "/about#service-nvocc", icon: <ChevronIcon /> },
  { label: "Global Stocking Solutions", href: "/about#service-global-stocking", icon: <ChevronIcon /> },
];

export function FooterSection() {
  const handleNewsletterSubscribe = async () => {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    return true;
  };

  return (
    <section id="contact" className="flex w-full lg:snap-start flex-col bg-[#245B6D]">
      <Footer
        logoSrc="/images/logo.png"
        companyName="AFFHAN GROUP"
        description="Affhan group is an import and export sourcing company valued by its clients and partners in the industry for its high end professional expertise and services. It is headquartered in Guangzhou with offices in China, London, India, Singapore, Malaysia, France and Dubai."
        usefulLinksTitle="QUICK LINKS"
        usefulLinks={usefulLinks}
        socialTitle="SERVICES"
        socialLinks={socialLinks}
        contactTitle="AFFHAN INTERNATIONAL PVT LTD"
              contactLines={
                <>
                  <p>
                    No.69/46, Appavoo Tower, West Madha Church Road Near by Harbour
                    Gate No : 3, Royapuram, Chennai - 600 013
                  </p>
                  <p className="mt-4">TAMIL NADU, INDIA</p>
                  <p className="mt-4">
                    <span className="font-semibold text-[#3cd5f7]">Office:</span>{" "}
                    044 - 4743 2777
                  </p>
                  <p className="mt-4">
                    <span className="font-semibold text-[#3cd5f7]">Email:</span>{" "}
                    info@affhan.com
                  </p>
                </>
              }
              onSubscribe={handleNewsletterSubscribe}
              className="border-t border-white/10"
            />

      <div className="border-t border-white/10 bg-[#19414e]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 py-4 text-xs text-slate-200/80 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-14">
          <p>Copyright &copy; 2026 Affhan. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.facebook.com/affhaninternational/reels/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <FacebookIcon />
            </a>
            <a
              href="https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <InstagramIcon />
            </a>
            <a
              href="https://www.tiktok.com/@affhan_global"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <TiktokIcon />
            </a>
            <a
              href="https://www.youtube.com/@affhan_global/shorts"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <YouTubeIcon />
            </a>
            <a
              href="https://www.linkedin.com/company/affhanglobal/posts/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <LinkedinIcon />
            </a>
            <a
              href="https://x.com/affhan_shipping"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter/X"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:shadow-lg"
            >
              <TwitterXIcon />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
