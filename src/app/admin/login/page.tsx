"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const quotes = [
  { title: "Source anything from China, effortlessly.", subtitle: "Sign in to manage your quote requests and sourcing inquiries with Affhan International." },
  { title: "Seamless logistics for your global trade.", subtitle: "End-to-end shipping solutions tailored for B2B enterprises." },
  { title: "Your trusted B2B sourcing partner.", subtitle: "Connect with verified suppliers and manufacturers instantly." },
  { title: "Streamline your supply chain today.", subtitle: "Track orders, manage invoices, and request quotes all in one place." }
];

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") === "google" ? "Google sign-in failed. Please try again." : null);
  const [loading, setLoading] = useState(false);
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % quotes.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      // Admins land on the dashboard, everyone else on home.
      router.push("/admin/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-white text-slate-900 overflow-hidden">
        <Link href="/" className="relative z-10 inline-flex items-center w-fit hover:opacity-80 transition-opacity">
          <div className="relative w-56 h-20">
            <Image src="/logo.png" alt="Affhan" fill className="object-contain" priority />
          </div>
        </Link>
        <div className="relative z-10 max-w-md h-48 mt-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={quoteIdx}
              initial={{ opacity: 0, y: 15, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -15, filter: "blur(8px)" }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <h1 className="text-4xl font-black leading-tight text-slate-900">{quotes[quoteIdx].title}</h1>
              <p className="mt-4 text-slate-500 text-lg">{quotes[quoteIdx].subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="relative z-10 text-slate-400 text-sm">© {new Date().getFullYear()} Affhan International Pvt Ltd</p>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative bg-gradient-to-br from-brand to-brand-dark overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-16 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="w-full max-w-md relative z-10">
          <Link href="/" className="lg:hidden inline-block mb-8 hover:opacity-80 transition-opacity">
            <div className="relative w-32 h-10 bg-white rounded-xl p-2 shadow-sm"><Image src="/logo.png" alt="Affhan" fill className="object-contain" /></div>
          </Link>

          <h2 className="text-3xl font-black text-white">Welcome back</h2>
          <p className="mt-2 text-white/80">Sign in to your Affhan account.</p>

          {error && (
            <div className="mt-6 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-200 text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-white mb-1.5 drop-shadow-sm">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border-none bg-white text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-brand/30 outline-none transition-all shadow-md"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-bold text-white drop-shadow-sm">Password</label>
                
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 rounded-xl border-none bg-white text-slate-900 placeholder:text-slate-400 focus:ring-4 focus:ring-brand/30 outline-none transition-all shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-white hover:bg-slate-50 text-brand font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign In
            </button>
          </form>


        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
