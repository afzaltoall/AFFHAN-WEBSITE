"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getCdnUrl } from "@/lib/cdn";
import { useAuth } from "@/context/AuthContext";
import { FlagSelect } from '@/components/ui/FlagSelect';
import { COUNTRIES } from '@/lib/countries';
import { isValidMobile } from '@/lib/phone';
import { lockBodyScroll } from '@/lib/scrollLock';
import { useBackDismiss } from "@/lib/useBackDismiss";
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, X, ChevronLeft, ChevronRight, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// MOQ (Minimum Order Quantity) tiers shown in the inquiry form. The dropdown
// displays a range, but we store the tier's lower bound as the quantity (an Int
// in the DB) — that lower bound IS the minimum order quantity.
const MOQ_OPTIONS = [
  { value: 20, label: "20 - 50 pcs" },
  { value: 50, label: "50 - 100 pcs" },
  { value: 100, label: "100 - 300 pcs" },
  { value: 300, label: "300 - 500 pcs" },
  { value: 500, label: "500 - 1,000 pcs" },
  { value: 1000, label: "1,000 - 2,000 pcs" },
  { value: 2000, label: "2,000 - 5,000 pcs" },
  { value: 5000, label: "5,000 - 10,000 pcs" },
  { value: 10000, label: "10,000 - 20,000 pcs" },
  { value: 20000, label: "20,000 - 50,000 pcs" },
  { value: 50000, label: "50,000+ pcs" },
];

interface InquiryModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  onClose: () => void;
}

export function InquiryModal({ product, onClose }: InquiryModalProps) {
  const [isVisible, setIsVisible] = useState(true);
  // Only to save a signed-in customer retyping what we already know. The form
  // stays fully usable signed out — `user` is simply null then.
  const { user } = useAuth();

  // Reset visibility and submission state when the modal is opened for a new product
  useEffect(() => {
    if (product) {
      setIsVisible(true);
      setSubmitted(false);
    }
  }, [product]);

  // Lock background scroll while the modal is open (it's a fixed full-screen
  // overlay, so we keep the user's scroll position — no jump to top). Shared
  // counter rather than a local save/restore: this modal can be opened on top
  // of another overlay that has already locked scrolling, and two independent
  // restores fight over who puts the value back.
  useEffect(() => {
    if (!product) return;
    return lockBodyScroll();
  }, [product]);
  
  const [inquiryForm, setInquiryForm] = useState({
    quantity: "20",
    name: "",
    email: "",
    companyName: "",
    country: "",
    phoneCountryCode: "in",
    phoneNumber: "",
    message: "",
  });
  
  // Fill in what the account already knows, without ever overwriting something
  // the customer has typed — they may be inquiring for a colleague, and having
  // the form snatch a field back mid-edit is worse than not prefilling at all.
  useEffect(() => {
    if (!user) return;
    setInquiryForm((f) => ({
      ...f,
      name: f.name || user.name || "",
      email: f.email || user.email || "",
    }));
  }, [user]);

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMoqDropdownOpen, setIsMoqDropdownOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const images = product?.images?.length ? product.images : (product?.imageUrl ? [product.imageUrl] : []);
  
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // Strong validation: must be a valid MOBILE number for the SELECTED country
  // (see src/lib/phone.ts). Rejects fake/short numbers AND the "wrong country,
  // wrong number" case (e.g. an Indian mobile typed under +86).
  const phoneEntered = inquiryForm.phoneNumber.trim() !== "";
  const phoneOk = isValidMobile(inquiryForm.phoneNumber, inquiryForm.phoneCountryCode);

  const isFormValid = inquiryForm.name.trim() !== "" &&
                      isValidEmail(inquiryForm.email) &&
                      inquiryForm.country !== "" &&
                      phoneOk;

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 250);
  };

  // Back dismiss is active only while the modal is actually open and showing a product.
  // Routed through handleClose rather than onClose so Back gets the same 250ms
  // dismissal as the X button instead of snapping the form away.
  useBackDismiss(Boolean(product && isVisible), handleClose);
  // The lightbox sits on top of the form and owns a second entry, so Back
  // closes the enlarged image first and leaves the form standing.
  useBackDismiss(Boolean(product && isLightboxOpen), () => setIsLightboxOpen(false));

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Combine phone code and number (dial already includes the leading "+").
    const selectedPhoneCountry = COUNTRIES.find(c => c.iso === inquiryForm.phoneCountryCode);
    const fullPhoneNumber = `${selectedPhoneCountry?.dial ?? ""} ${inquiryForm.phoneNumber}`.trim();

    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Explicit, because the session cookie is what lets the server attach
        // this inquiry to the customer's account. Anonymous submission is
        // unaffected — there is simply no cookie to send.
        credentials: 'include',
        body: JSON.stringify({
          productId: product?.id,
          productName: product?.name || "Unknown Product",
          quantity: parseInt(inquiryForm.quantity) || 1,
          customerName: inquiryForm.name,
          email: inquiryForm.email,
          companyName: inquiryForm.companyName,
          country: inquiryForm.country,
          phone: fullPhoneNumber,
          message: inquiryForm.message,
        }),
      });
      if (response.ok) {
        setSubmitted(true);
      } else {
        alert("Failed to submit inquiry. Please try again.");
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("Error submitting inquiry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!product) return null;

  const currentPhoneCountry = COUNTRIES.find(c => c.iso === inquiryForm.phoneCountryCode) || COUNTRIES[0];

  return (
    <>
    <AnimatePresence>
      {/* z-300, not z-110. This modal is never the only overlay on screen — it
          is opened from something, and one of those somethings is the
          image-search results panel, which is a full-viewport sheet at z-200.
          Both are portalled to document.body, so they are siblings in the root
          stacking context and the lower one simply paints behind: "Inquire
          Now" registered the click, mounted this, and hid it. It has to
          outrank every overlay that can open it, so it sits above the whole
          z-1xx band with room to spare. */}
      {isVisible && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={handleClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl flex flex-col relative z-10 overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white z-20">
              <div className="relative h-12 w-36 sm:h-14 sm:w-48 shrink-0">
                <Image src="/logo.png" alt="Affhan" fill className="object-contain object-left" priority />
              </div>
              <button
                onClick={handleClose}
                type="button"
                aria-label="Close quote request"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-sm shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col md:flex-row h-full max-h-[80vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}>
              
              <div className="w-full md:w-[45%] bg-gradient-to-b from-slate-50 to-white p-6 sm:p-10 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-slate-100">
                <div 
                  className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm mb-6 cursor-zoom-in group"
                  onClick={() => images.length > 0 && setIsLightboxOpen(true)}
                >
                  {images.length > 0 ? (
                    <Image 
                      src={getCdnUrl(images[0]) as string} 
                      alt={product.name} 
                      fill 
                      sizes="(max-width: 768px) 100vw, 320px" 
                      className="object-cover transition-transform duration-500 group-hover:scale-105" 
                      priority
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">No Image</div>
                  )}
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#336888]">
                  {product.categoryRef?.name || product.category || "Product"}
                </span>
                <h3 className="mt-3 text-xl font-extrabold text-slate-800 leading-snug line-clamp-2 px-2">
                  {product.name}
                </h3>
                <p className="mt-4 text-sm text-slate-500 font-medium max-w-[280px]">
                  Request a quote — our sourcing team will get this for you.
                </p>
              </div>

              <div className="w-full md:w-[55%] p-6 sm:p-10 bg-white relative">
                <AnimatePresence mode="wait">
                  {submitted ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative h-full flex flex-col items-center justify-center text-center py-10"
                    >
                      {/* Soft brand glow behind the confirmation */}
                      <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(51,104,136,0.14),transparent_70%)] blur-xl" />

                      <motion.div
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.05 }}
                        className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                      >
                        <motion.span
                          initial={{ opacity: 0.6, scale: 0.9 }}
                          animate={{ opacity: 0, scale: 1.7 }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
                          className="absolute inset-0 rounded-full bg-emerald-400/40"
                        />
                        <CheckCircle2 className="relative z-10 h-12 w-12" strokeWidth={2.4} />
                      </motion.div>

                      <motion.h4 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="text-2xl font-black tracking-tight text-slate-900">
                        Inquiry Submitted!
                      </motion.h4>
                      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mt-2 max-w-sm text-[15px] leading-relaxed text-slate-500">
                        Our sourcing team will review your request and get back to you with a quote — usually within 24 hours.
                      </motion.p>

                      {product?.name && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-5 flex max-w-xs items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="truncate">{product.name}</span>
                        </motion.div>
                      )}

                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 w-full max-w-[300px]">
                        <button onClick={handleClose} className="w-full rounded-xl bg-[#336888] py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#27506a] hover:shadow-lg">
                          Continue browsing
                        </button>
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.form 
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onSubmit={handleInquirySubmit} 
                      className="space-y-5 h-full flex flex-col justify-center"
                    >
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div className="relative">
                          <label className="block text-xs font-bold text-slate-700 mb-2">MOQ <span className="text-red-500">*</span></label>

                          <div
                            className="block w-full h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-900 cursor-pointer flex items-center justify-between hover:bg-white focus-within:bg-white focus-within:border-[#336888] focus-within:ring-2 focus-within:ring-[#336888]/20 transition-all duration-200"
                            onClick={() => setIsMoqDropdownOpen(!isMoqDropdownOpen)}
                          >
                            <span className="truncate">{MOQ_OPTIONS.find((o) => String(o.value) === inquiryForm.quantity)?.label ?? "Select MOQ"}</span>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isMoqDropdownOpen ? 'rotate-180' : ''}`} />
                          </div>

                          <AnimatePresence>
                            {isMoqDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto py-1" style={{ scrollbarWidth: "thin" }}
                              >
                                {MOQ_OPTIONS.map((o) => {
                                  const selected = String(o.value) === inquiryForm.quantity;
                                  return (
                                    <div
                                      key={o.value}
                                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm font-medium transition-colors ${selected ? 'bg-[#336888]/10 text-[#336888]' : 'text-slate-700 hover:bg-slate-50'}`}
                                      onClick={() => {
                                        setInquiryForm({ ...inquiryForm, quantity: String(o.value) });
                                        setIsMoqDropdownOpen(false);
                                      }}
                                    >
                                      <span className="flex-1 truncate">{o.label}</span>
                                      {selected && <CheckCircle2 className="w-4.5 h-4.5 text-[#336888] shrink-0" />}
                                    </div>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {isMoqDropdownOpen && (
                            <div className="fixed inset-0 z-40" onClick={() => setIsMoqDropdownOpen(false)} />
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Full Name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            required
                            placeholder="John Doe"
                            className="block w-full h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#336888] focus:ring-2 focus:ring-[#336888]/20 focus:outline-none transition-all duration-200 placeholder:text-slate-400 placeholder:font-normal"
                            value={inquiryForm.name}
                            onChange={(e) => setInquiryForm({ ...inquiryForm, name: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Email Address <span className="text-red-500">*</span></label>
                          <input
                            type="email"
                            required
                            placeholder="john@example.com"
                            className="block w-full h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#336888] focus:ring-2 focus:ring-[#336888]/20 focus:outline-none transition-all duration-200 placeholder:text-slate-400 placeholder:font-normal"
                            value={inquiryForm.email}
                            onChange={(e) => setInquiryForm({ ...inquiryForm, email: e.target.value })}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Company Name</label>
                          <input
                            type="text"
                            placeholder="Optional"
                            className="block w-full h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#336888] focus:ring-2 focus:ring-[#336888]/20 focus:outline-none transition-all duration-200 placeholder:text-slate-400 placeholder:font-normal"
                            value={inquiryForm.companyName}
                            onChange={(e) => setInquiryForm({ ...inquiryForm, companyName: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Country <span className="text-red-500">*</span></label>
                          <FlagSelect
                            mode="country"
                            placeholder="Select country"
                            selected={COUNTRIES.find((c) => c.name === inquiryForm.country) || null}
                            onSelect={(c) => setInquiryForm({ ...inquiryForm, country: c.name })}
                            buttonClassName="!h-11 border-slate-300 focus-visible:border-[#336888] focus-visible:ring-[#336888]/20"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-2">Phone Number <span className="text-red-500">*</span></label>
                          <div className="flex items-stretch gap-2">
                            <div className="w-24 shrink-0">
                              <FlagSelect
                                mode="dial"
                                align="right"
                                placeholder="Code"
                                selected={currentPhoneCountry}
                                onSelect={(c) => setInquiryForm({ ...inquiryForm, phoneCountryCode: c.iso })}
                                buttonClassName="!h-11 border-slate-300 focus-visible:border-[#336888] focus-visible:ring-[#336888]/20"
                              />
                            </div>
                            <input
                              type="tel"
                              required
                              inputMode="numeric"
                              placeholder="9876543210"
                              className="min-w-0 flex-1 h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-base font-medium text-slate-900 focus:bg-white focus:border-[#336888] focus:ring-2 focus:ring-[#336888]/20 focus:outline-none transition-all duration-200 placeholder:text-slate-400 placeholder:font-normal placeholder:text-sm"
                              value={inquiryForm.phoneNumber}
                              onChange={(e) => setInquiryForm({ ...inquiryForm, phoneNumber: e.target.value.replace(/\D/g, '') })}
                            />
                          </div>
                          {phoneEntered && !phoneOk && (
                            <p className="mt-1.5 text-xs font-semibold text-red-500">
                              Enter a valid {currentPhoneCountry.name} phone number.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pb-2">
                        <label className="block text-xs font-bold text-slate-700 mb-2">Message / Requirements</label>
                        <textarea
                          className="block w-full h-24 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 focus:bg-white focus:border-[#336888] focus:ring-2 focus:ring-[#336888]/20 focus:outline-none transition-all duration-200 resize-none placeholder:text-slate-400 placeholder:font-normal"
                          placeholder="Any specific requirements, target price, or shipping preference?"
                          value={inquiryForm.message}
                          onChange={(e) => setInquiryForm({ ...inquiryForm, message: e.target.value })}
                        />
                      </div>

                      <div className="pt-4 flex flex-col items-center">
                        <button
                          type="submit"
                          disabled={!isFormValid || isSubmitting}
                          className="relative w-full rounded-xl bg-[#336888] hover:bg-[#2a5670] disabled:bg-slate-300 disabled:opacity-100 disabled:cursor-not-allowed py-4 text-base font-bold text-white transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-[#336888]/20 hover:-translate-y-1 active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              Submit Inquiry
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </>
                          )}
                        </button>
                        <p className="mt-4 w-full text-center text-[13px] font-medium text-slate-500">
                          Your details are safe. Our team responds within 24 hours.
                        </p>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    
    <AnimatePresence>
      {isLightboxOpen && images.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[310] bg-black/95 flex items-center justify-center"
        >
          <button onClick={() => setIsLightboxOpen(false)} type="button" aria-label="Close image viewer" className="absolute top-6 right-6 text-white/70 hover:text-white z-[320] p-2 transition-colors cursor-pointer hover:scale-110 active:scale-95">
            <X size={32} />
          </button>
          
          <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-full z-[320]">
                  <button onClick={() => zoomOut()} type="button" aria-label="Zoom out" className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors cursor-pointer"><ZoomOut size={20} /></button>
                  <button onClick={() => resetTransform()} type="button" aria-label="Reset zoom" className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors cursor-pointer"><Maximize size={18} /></button>
                  <button onClick={() => zoomIn()} type="button" aria-label="Zoom in" className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors cursor-pointer"><ZoomIn size={20} /></button>
                </div>

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous image"
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1)); resetTransform(); }}
                      className="absolute left-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/20 transition-all z-[320] cursor-pointer hover:scale-110 active:scale-95"
                    >
                      <ChevronLeft size={36} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next image"
                      onClick={(e) => { e.stopPropagation(); setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0)); resetTransform(); }}
                      className="absolute right-6 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/20 transition-all z-[320] cursor-pointer hover:scale-110 active:scale-95"
                    >
                      <ChevronRight size={36} />
                    </button>
                    
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[320]">
                      {images.map((img: string, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            aria-label={`Show image ${idx + 1} of ${images.length}`}
                            aria-current={idx === activeImageIndex}
                            onClick={() => { setActiveImageIndex(idx); resetTransform(); }}
                            className={`relative w-12 h-12 rounded-md overflow-hidden cursor-pointer border-2 transition-all ${idx === activeImageIndex ? 'border-[#336888] scale-110' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`}
                          >
                            <Image src={getCdnUrl(img) as string} alt="" fill className="object-cover" />
                          </button>
                      ))}
                    </div>
                  </>
                )}

                <TransformComponent wrapperStyle={{ width: "100%", height: "100vh" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="relative w-full h-full max-w-6xl max-h-[85vh]">
                      <Image src={getCdnUrl(images[activeImageIndex]) as string} alt={product.name} fill className="object-contain" sizes="100vw" priority />
                    </div>
                </TransformComponent>
              </>
            )}
            </TransformWrapper>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
