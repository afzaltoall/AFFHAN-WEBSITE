import { permanentRedirect } from "next/navigation";

// /categories has never had content of its own — it has always just forwarded
// to the catalog.
//
// permanentRedirect (308) rather than redirect (307): a temporary redirect
// tells Google the move might be undone, so it keeps /categories in the index
// and does not consolidate its signals onto the target. This move is permanent.
//
// The destination keeps its trailing slash on purpose. next.config sets
// trailingSlash: true, so a redirect to "/products" would immediately 308
// again to "/products/" — an extra hop on every single visit.
//
// No metadata export here. This component never renders, so metadata on it is
// dead code, and a canonical pointing at /categories/ actively contradicts the
// redirect by implying the URL is indexable in its own right.
export default function CategoriesPage() {
  permanentRedirect("/products/");
}
