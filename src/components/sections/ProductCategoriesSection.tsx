"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

interface Cat {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  productCount: number;
}

function CategoryTile({ cat }: { cat: Cat }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/products/?categoryId=${cat.id}`}
      className="group flex flex-col liquid-glass-card transition-all overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-slate-50 overflow-hidden">
        {cat.thumbnailUrl && !failed ? (
          <Image
            src={getCdnUrl(cat.thumbnailUrl, 300) as string}
            alt={cat.name}
            fill
            sizes="(max-width:640px) 40vw, (max-width:1024px) 22vw, 15vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">No Image</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-brand-dark transition-colors min-h-[34px]">
          {cat.name}
        </h3>
        <p className="text-[11px] font-semibold text-slate-400 mt-1">
          {cat.productCount.toLocaleString()} products
        </p>
      </div>
    </Link>
  );
}

export function ProductCategoriesSection() {
  const [categories, setCategories] = useState<Cat[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        const cats: Cat[] = (data.data || [])
          .filter((c: Cat) => c.thumbnailUrl && c.productCount > 0)
          .sort((a: Cat, b: Cat) => b.productCount - a.productCount);
        setCategories(cats);
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <section id="product-categories" className="w-full bg-white py-14 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Product Categories</span>
            <h2 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-slate-900">
              Explore our sourcing categories
            </h2>
            <p className="mt-2 text-slate-500 max-w-xl">
              Browse across {categories.length.toLocaleString()} verified categories — every product we can source for you.
            </p>
          </div>
          <Link
            href="/products/"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-dark hover:gap-3 transition-all shrink-0"
          >
            View all categories <ArrowRight size={16} />
          </Link>
        </div>

        {categories.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="aspect-square bg-slate-100 animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <CategoryTile key={cat.id} cat={cat} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
