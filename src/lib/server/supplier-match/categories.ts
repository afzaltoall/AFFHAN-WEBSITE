import "server-only";

/**
 * The inquired product's category as the matcher reads it.
 *
 * A supplier's term agrees with a category when every word of the term is in the category's name with its parent's
 * ("bag" and "Men's Luggage & Bags > Briefcases"), or the category's own name is within the term ("Water Heaters"
 * and "electric water heater"). That agreement adds to a supplier's score; it is enough on its own only when the
 * category is clean (clean-categories.json: most of its titles name it) and the term is not broad.
 */

/**
 * Catch-alls: categories whose names say nothing about what is filed in them (REPORT.md 2.0, found by sampling
 * their titles). Never a category match, clean or not; their products are matched by their titles only.
 */
export const CATCH_ALL_CATEGORY_IDS: ReadonlySet<string> = new Set([
  "87CF251F-8D11-4DE0-A154-9694D9858EB3", // Home Storage > Home Office Storage (151,937: lawn mowers, wrenches, body chains)
  "07398ADB-FC5E-4CC4-AD00-EB230E779E88", // Outerwear & Jackets > Blazers (32,326, mostly women's tops)
  "79F47CD1-F813-4B4D-8D21-2B35966FBA66", // Sportswear > Sports Accessories (19,562: label printers, bike pedals, sandals)
]);

/** Category names too generic to say what a term means when they are the whole name. */
export const GENERIC_CATEGORY_NAME =
  /^(accessories|others?|sets?|parts|tools?|supplies|products?|items?|gifts?|tops|bottoms|kits?|decor|storage|care|equipment|charms|interior parts|other replacement parts)$/i;

/** Pet products are a trade of their own: a CLOTHES, SHOES or TOYS supplier means people's. */
export const PET_CATEGORY = /\bpets?\b/i;
export const PET_TERM = /\b(pet|dog|cat|bird|fish|aquarium|animal|poultry|kennel)\b/;

export interface InquiryCategory {
  id: string;
  name: string;
  parentName: string | null;
}

/** "Parent > Name", as the console shows a category. */
export const categoryPath = (c: InquiryCategory) => (c.parentName ? `${c.parentName} > ${c.name}` : c.name);
