"use client";

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlagSelect } from "@/components/ui/FlagSelect";
import { COUNTRIES } from "@/lib/countries";
interface Contact2Props {
  title?: string;
  description?: string;
  phone?: string;
  email?: string;
}

import { InstagramIcon, LinkedinIcon, YouTubeIcon, FacebookIcon, TiktokIcon, TwitterXIcon } from "@/components/ui/social-icons";

const PhoneIcon = () => (
  <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.824-1.445-5.14-3.761-6.585-6.585l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
  </svg>
);

const MailIcon = () => (
  <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
  </svg>
);

export const Contact2 = ({
  title = "Contact Us",
  description = "We'd love to hear from you. Reach out for inquiries, support, or partnerships.",
  phone = "(123) 34567890",
  email = "email@example.com",
}: Contact2Props) => {
  const [showScrollCue, setShowScrollCue] = React.useState(true);
  // A country/dial dropdown being open overlaps the fixed "scroll down" cue at
  // the bottom, so we hide the cue while either menu is showing.
  const [countryOpen, setCountryOpen] = React.useState(false);
  const [dialOpen, setDialOpen] = React.useState(false);
  const anyDropdownOpen = countryOpen || dialOpen;

  // Controlled form state for the contact submission.
  const [form, setForm] = React.useState({
    fullName: "",
    email: "",
    companyName: "",
    country: "",
    phoneIso: "in",
    phoneCode: "+91",
    phone: "",
    message: "",
  });
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = React.useState<string>("");

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (status === "error" || status === "success") { setStatus("idle"); setFeedback(""); }
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (!form.fullName.trim()) { setStatus("error"); setFeedback("Please enter your full name."); return; }
    if (!emailValid) { setStatus("error"); setFeedback("Please enter a valid email address."); return; }
    if (!form.country.trim()) { setStatus("error"); setFeedback("Please select a country."); return; }
    if (!form.phone.trim()) { setStatus("error"); setFeedback("Please enter your phone number."); return; }
    if (!form.message.trim()) { setStatus("error"); setFeedback("Please enter a message."); return; }

    setStatus("submitting");
    setFeedback("");
    try {
      const payloadForm = {
        ...form,
        phone: `${form.phoneCode} ${form.phone}`
      };
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForm),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setFeedback(payload.error || "Something went wrong. Please try again.");
        return;
      }
      setStatus("success");
      setFeedback(payload.message || "Thanks for reaching out — we'll get back to you soon.");
      setForm({ fullName: "", email: "", companyName: "", country: "", phoneIso: "in", phoneCode: "+91", phone: "", message: "" });
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again.");
    }
  };

  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 80) {
        setShowScrollCue(false);
      } else {
        setShowScrollCue(true);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Run once initially to check scroll state on mount
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="relative min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0] text-slate-900 pt-32 pb-36 flex flex-col justify-center overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        .liquid-glass-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.55) 0%, rgba(240, 253, 250, 0.3) 100%) !important;
          backdrop-filter: blur(24px) !important;
          -webkit-backdrop-filter: blur(24px) !important;
          border-top: 2px solid rgba(255, 255, 255, 0.9) !important;
          border-left: 2px solid rgba(255, 255, 255, 0.9) !important;
          border-bottom: 2px solid rgba(148, 163, 184, 0.35) !important;
          border-right: 2px solid rgba(148, 163, 184, 0.35) !important;
          border-radius: 28px !important;
          box-shadow: 
            inset 0 3px 10px rgba(255, 255, 255, 0.95), 
            inset 0 -3px 10px rgba(0, 0, 0, 0.04),
            inset 0 1px 18px rgba(255, 255, 255, 0.45),
            0 12px 32px rgba(15, 23, 42, 0.06),
            0 1px 3px rgba(0, 0, 0, 0.02) !important;
          transition: all 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform, box-shadow, background-color, border-color;
        }

        /* Gated to real hover-capable pointers — plain :hover sticks on
           touch devices and forces a double-tap to actually click through. */
        @media (hover: hover) and (pointer: fine) {
          .liquid-glass-card:hover {
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 0%, rgba(240, 253, 250, 0.4) 100%) !important;
            border-top-color: rgba(255, 255, 255, 0.99) !important;
            border-left-color: rgba(255, 255, 255, 0.99) !important;
            border-bottom-color: rgba(148, 163, 184, 0.55) !important;
            border-right-color: rgba(148, 163, 184, 0.55) !important;
            box-shadow:
              inset 0 5px 15px rgba(255, 255, 255, 0.98),
              inset 0 -5px 15px rgba(0, 0, 0, 0.05),
              inset 0 1px 25px rgba(255, 255, 255, 0.6),
              0 24px 50px rgba(39, 168, 196, 0.16),
              0 4px 12px rgba(0, 0, 0, 0.03) !important;
            transform: translateY(-8px) scale(1.015) !important;
          }
        }

        .liquid-glass-card:active {
          transform: translateY(-3px) scale(0.99) !important;
          box-shadow:
            inset 0 2px 6px rgba(255, 255, 255, 0.9),
            inset 0 -2px 6px rgba(0, 0, 0, 0.05),
            0 12px 25px rgba(39, 168, 196, 0.08) !important;
        }

        /* Touch devices: no lift on tap — it reads as a stuck hover. */
        @media (hover: none), (pointer: coarse) {
          .liquid-glass-card:active {
            transform: none !important;
          }
        }
      `}} />
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(39,168,196,0.06),transparent_40%),radial-gradient(circle_at_70%_70%,rgba(241,245,249,0.6),transparent_40%)] pointer-events-none" />
      
      <div className="container relative z-10 mx-auto px-5 sm:px-8 lg:px-14">
        <div className="mx-auto flex max-w-screen-xl flex-col justify-between gap-12 lg:flex-row lg:gap-20 -translate-y-2 md:-translate-y-3">
          
          {/* Info Side */}
          <div className="flex flex-col justify-start gap-8 lg:w-5/12">
            <div className="text-center lg:text-left">
              <span className="text-xs font-semibold uppercase tracking-[0.26em] text-[#176579] block mb-3">
                GET IN TOUCH
              </span>
              <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:mb-3 lg:text-6xl text-[#081f2a]">
                {title}
              </h1>
              {/* Vertical line divider */}
              <div className="h-[3.5px] w-14 bg-[#27a8c4] rounded-full mx-auto lg:mx-0 mb-6" />
              <p className="text-slate-600 text-sm leading-relaxed sm:text-base max-w-md mx-auto lg:mx-0">
                {description}
              </p>
            </div>
            
            <div className="mx-auto w-full max-w-sm lg:mx-0 p-7 sm:p-9 liquid-glass-card">
              <h3 className="mb-6 text-center text-xl font-bold tracking-tight lg:text-left text-[#176579]">
                Contact Details
              </h3>
              <ul className="space-y-4 text-slate-600 text-sm sm:text-base">
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#27a8c4]/10 text-[#176579] shrink-0 mt-0.5">
                    <PhoneIcon />
                  </span>
                  <div className="flex items-start gap-1.5 py-1.5">
                    <strong className="text-slate-800 shrink-0 text-sm sm:text-base leading-none">Phone:</strong>
                    <div className="flex flex-col gap-2">
                      {phone.split(" / ").map((num, idx) => {
                        const cleanNum = num.replace(/\s+/g, "");
                        return (
                          <a
                            key={idx}
                            href={`tel:${cleanNum}`}
                            className="text-[#176579] hover:underline hover:text-[#27a8c4] transition duration-300 font-medium whitespace-nowrap text-sm sm:text-base leading-none"
                          >
                            {num}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#27a8c4]/10 text-[#176579] shrink-0 mt-0.5">
                    <MailIcon />
                  </span>
                  <div className="flex items-start gap-1.5 py-1.5">
                    <strong className="text-slate-800 shrink-0 text-sm sm:text-base leading-none">Email:</strong>{" "}
                    <a href={`mailto:${email}`} className="text-[#176579] hover:underline hover:text-[#27a8c4] transition duration-300 font-medium text-sm sm:text-base leading-none">
                      {email}
                    </a>
                  </div>
                </li>
              </ul>
              
              {/* Social Media Links */}
              <div className="mt-6 pt-5 border-t border-slate-200/80">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#176579] mb-3 text-center lg:text-left">
                  Follow Us
                </h4>
                <div className="flex items-center justify-center lg:justify-start gap-3">
                  <a
                    href="https://www.facebook.com/affhaninternational/reels/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="Facebook"
                  >
                    <FacebookIcon />
                  </a>
                  <a
                    href="https://www.linkedin.com/company/affhanglobal/posts/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="LinkedIn"
                  >
                    <LinkedinIcon />
                  </a>
                  <a
                    href="https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="Instagram"
                  >
                    <InstagramIcon />
                  </a>
                  <a
                    href="https://www.tiktok.com/@affhan_global"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="TikTok"
                  >
                    <TiktokIcon />
                  </a>
                  <a
                    href="https://www.youtube.com/@affhan_global/shorts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="YouTube"
                  >
                    <YouTubeIcon />
                  </a>
                  <a
                    href="https://x.com/affhan_shipping"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-[#176579] hover:bg-[#27a8c4]/15 hover:border-[#27a8c4]/40 hover:text-[#176579] hover:scale-[1.08] transition-all duration-300 shadow-sm cursor-pointer"
                    aria-label="Twitter/X"
                  >
                    <TwitterXIcon />
                  </a>
                </div>
              </div>
            </div>
          </div>
          
          {/* Form Side */}
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-screen-md flex flex-col gap-6 p-6 sm:p-10 lg:w-7/12 liquid-glass-card">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="fullName" className="text-slate-700 font-semibold tracking-wide">Full Name <span className="text-red-500">*</span></Label>
                <Input type="text" id="fullName" name="fullName" autoComplete="name" value={form.fullName} onChange={setField("fullName")} placeholder="John Doe" className="bg-slate-50/70 border-slate-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] focus-visible:bg-white rounded-xl transition-all shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="email" className="text-slate-700 font-semibold tracking-wide">Email Address <span className="text-red-500">*</span></Label>
                <Input type="email" id="email" name="email" autoComplete="email" value={form.email} onChange={setField("email")} placeholder="john@example.com" className="bg-slate-50/70 border-slate-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] focus-visible:bg-white rounded-xl transition-all shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]" />
              </div>
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="companyName" className="text-slate-700 font-semibold tracking-wide">Company Name</Label>
                <Input type="text" id="companyName" name="companyName" autoComplete="organization" value={form.companyName} onChange={setField("companyName")} placeholder="Optional" className="bg-slate-50/70 border-slate-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] focus-visible:bg-white rounded-xl transition-all shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]" />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="country" className="text-slate-700 font-semibold tracking-wide">Country <span className="text-red-500">*</span></Label>
                <FlagSelect
                  id="country"
                  mode="country"
                  placeholder="Select country"
                  selected={COUNTRIES.find((c) => c.name === form.country) || null}
                  onSelect={(c) => { setForm((f) => ({ ...f, country: c.name })); if (status === "error") { setStatus("idle"); setFeedback(""); } }}
                  onOpenChange={setCountryOpen}
                  buttonClassName="!h-11"
                />
              </div>
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="phone" className="text-slate-700 font-semibold tracking-wide">Phone Number <span className="text-red-500">*</span></Label>
                <div className="flex items-stretch gap-2">
                  <div className="w-24 shrink-0">
                    <FlagSelect
                      mode="dial"
                      align="right"
                      placeholder="Code"
                      selected={COUNTRIES.find((c) => c.iso === form.phoneIso) || null}
                      onSelect={(c) => setForm((f) => ({ ...f, phoneIso: c.iso, phoneCode: c.dial }))}
                      onOpenChange={setDialOpen}
                      buttonClassName="!h-11 bg-slate-100"
                    />
                  </div>
                  <Input type="tel" inputMode="numeric" id="phone" name="phone" autoComplete="tel-national" value={form.phone} onChange={setField("phone")} placeholder="9876543210" className="min-w-0 flex-1 bg-slate-50/70 border border-slate-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] focus-visible:bg-white rounded-xl transition-all shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]" />
                </div>
              </div>
            </div>
            <div className="grid w-full gap-2">
              <Label htmlFor="message" className="text-slate-700 font-semibold tracking-wide">Message / Requirements</Label>
              <Textarea placeholder="Any specific requirements, target price, or shipping preference?" id="message" name="message" value={form.message} onChange={setField("message")} className="bg-slate-50/70 border-slate-200 text-slate-950 placeholder:text-slate-400 focus-visible:ring-[#27a8c4]/30 focus-visible:border-[#27a8c4] focus-visible:bg-white rounded-xl min-h-[120px] transition-all shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.03)] focus-visible:shadow-[0_0_12px_rgba(39,168,196,0.12)]" />
            </div>

            {/* Inline status feedback */}
            {feedback && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm font-medium rounded-xl px-4 py-3 ${
                  status === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                {feedback}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[#27a8c4] to-[#176579] text-white font-bold hover:from-[#176579] hover:to-[#081f2a] shadow-[0_8px_24px_rgba(39,168,196,0.25)] hover:shadow-[0_12px_32px_rgba(23,85,101,0.35)] transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 text-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span>{status === "submitting" ? "Sending…" : "Send Message"}</span>
              {status === "submitting" ? (
                <svg className="w-4.5 h-4.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4.5 h-4.5 transform rotate-45 -translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
          
        </div>
      </div>

      {/* Scroll Down Indicator */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-all duration-500 ${showScrollCue && !anyDropdownOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        <a
          href="#locations"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("locations")?.scrollIntoView({ behavior: "smooth" });
          }}
          className="group flex flex-col items-center gap-0.5 px-3.5 py-1 rounded-full bg-white/95 border border-[#27a8c4]/25 hover:border-[#27a8c4]/50 hover:bg-[#27a8c4]/5 transition-all duration-300 shadow-[0_0_12px_rgba(39,168,196,0.18)] hover:shadow-[0_0_20px_rgba(39,168,196,0.38)] backdrop-blur-md"
        >
          <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600 group-hover:text-[#176579] transition-colors duration-300 text-center max-w-[240px] sm:max-w-none">
            Scroll down to see locations of our offices globally
          </span>
          <svg
            className="w-3 h-3 text-[#176579] group-hover:text-[#27a8c4] transition-colors duration-300 animate-subtle-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </a>
      </div>
    </section>
  );
};
