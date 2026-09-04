import {
  Armchair, Baby, Backpack, Bed, Box, Cable, Camera, Car, Circle, Cog,
  Diamond, Dog, Droplet, Dumbbell, Factory, Flower, Footprints, Gem,
  Glasses, Hammer, Handbag, Headphones, Heart, Lamp, Laptop, Lightbulb, Orbit, Palette,
  Paintbrush, PartyPopper, PawPrint, PersonStanding, Pill, Puzzle, Ribbon, Rocket, Ruler,
  Layers, Scissors, Shield, Shirt, ShoppingBag, Smartphone, Snowflake, Sofa, Sparkle,
  SportShoe, SwatchBook, Toolbox, ToyBrick, Trophy, Tv, Umbrella, Utensils, Venus,
  Watch, Wheat, Wrench,
} from "lucide-react";
import { categoryImageIcon } from "@/components/ui/CategoryImageIcon";

/**
 * Categories that have artwork of their own, in public/categories/.
 *
 * Each entry points at a web-sized copy, not the original. next.config sets
 * images.unoptimized globally — deliberately, because the catalogue hotlinks
 * hundreds of thousands of CJ images and routing those through the optimizer
 * would exhaust the Vercel image quota — so nothing resizes these for us. The
 * source art here is 1254x1254 and 1.4MB; drawn at eighteen pixels that is
 * about seventy-five thousand times more data than the icon needs. The 128px
 * WebP beside it is 9KB.
 *
 * Adding one: drop the artwork in public/categories/, save a 128px WebP next
 * to it with a filename that has no spaces or ampersands, and list it here.
 * Anything not listed falls through to a lucide glyph.
 */
const CUSTOM_ART: Record<string, string> = {
  // Empty until artwork is added back. Every category falls through to its
  // glyph below, so the menu is complete either way — this only upgrades the
  // ones that have a picture.
};

// Single source of truth for turning the flat /api/categories list into a
// navigable tree. Every category-consuming UI (navbar mega-menu, homepage
// sidebar, /products sidebar+popout) should build its tree through this
// function rather than re-implementing its own filtering, so "hide branches
// with zero products anywhere in their subtree" only has to be correct once.

/**
 * One icon per top-level category, by exact name.
 *
 * The keyword rules below still cover the other ~580 categories, but they
 * cannot tell fifty top-level entries apart: they matched on substrings, first
 * rule wins, so nine categories came out as the same shirt and sixteen fell
 * through to the generic box. They also mis-fired — "Skin Care" contains
 * "car", so skincare was drawn as a motor car.
 *
 * Exact names are checked first. A name that is not here still goes through
 * the keywords, so nothing else changes and a category promoted tomorrow is no
 * worse off than it was.
 *
 * Where the icon set has no literal glyph the choice is associative, and those
 * are the ones worth arguing about: lucide has exactly one garment (Shirt) for
 * fourteen clothing categories, so trousers became a ruler and coats a
 * snowflake. See the note in the report — the honest fix for those is a
 * product photo rather than a glyph.
 */
type CategoryIcon = React.ComponentType<{ size?: number; className?: string }>;

const ICON_BY_NAME: Record<string, CategoryIcon> = {
  // The fourteen CJ puts at the top.
  "Home, Garden & Furniture": Sofa,
  "Jewelry & Watches": Gem,
  "Men's Clothing": PersonStanding,
  "Bags & Shoes": ShoppingBag,
  "Women's Clothing": Venus,
  "Toys, Kids & Babies": ToyBrick,
  "Health, Beauty & Hair": Scissors,
  "Sports & Outdoors": Dumbbell,
  "Home Improvement": Hammer,
  "Pet Supplies": Dog,
  "Phones & Accessories": Smartphone,
  "Automobiles & Motorcycles": Car,
  "Consumer Electronics": Tv,
  "Computer & Office": Laptop,

  // Jewellery, which needed six distinct pieces rather than one gem.
  Earrings: Sparkle,
  "Necklace & Pendants": Heart,
  Rings: Circle,
  "Bracelets & Bangles": Ribbon,
  "Fine Jewelry": Diamond,
  "Men's Watches": Watch,

  // Bags, shoes and luggage.
  "Women's Shoes": Footprints,
  "Men's Shoes": SportShoe,
  "Women's Luggage & Bags": Handbag,
  "Backpacks & Luggage": Backpack,

  // Home.
  Furniture: Armchair,
  "Home Textiles": Bed,
  "Indoor Lighting": Lamp,
  "Kitchen, Dining & Bar": Utensils,
  "Festive & Party Supplies": PartyPopper,

  // Beauty.
  "Skin Care": Droplet,
  Makeup: Palette,
  "Nail Art & Tools": Paintbrush,

  // Electronics and parts.
  "Portable Audio & Video": Headphones,
  "Cases & Covers": Shield,
  "Mobile Phone Accessories": Cable,
  "Auto Replacement Parts": Cog,
  "Tools & Hardware": Toolbox,

  // Children and pets.
  "Girls Clothing": Flower,
  "Boys Clothing": Rocket,
  "Baby Clothing": Baby,
  "Toys & Hobbies": Puzzle,
  "Pet Apparels": PawPrint,

  // Clothing, where the icon set runs out of garments.
  "T-Shirts": Shirt,
  Sportswear: Trophy,
  "Men's Outerwear & Jackets": Snowflake,
  "Women's Outerwear & Jackets": Umbrella,
  "Men's Bottoms": Ruler,
  "Women's Bottoms": SwatchBook,
  // Layers, not Sparkles: Sparkles is Sparkle plus two small stars and at
  // 18px the two read as the same glyph next to each other in the rail.
  "Women's Tops & Sets": Layers,
  "Women's Accessories": Glasses,
};

// Built once. A component created inside getCategoryIcon would be a new type
// on every render, and React would throw the icon away and remount it each
// time — a fresh image request per keystroke in the menu.
const ART_ICONS: Record<string, CategoryIcon> = Object.fromEntries(
  Object.entries(CUSTOM_ART).map(([name, src]) => [name, categoryImageIcon(src, name)])
);

export function getCategoryIcon(name: string): CategoryIcon {
  const art = ART_ICONS[name];
  if (art) return art;

  const exact = ICON_BY_NAME[name];
  if (exact) return exact;

  const n = name.toLowerCase();
  if (n.includes("cloth") || n.includes("apparel") || n.includes("fashion") || n.includes("shoe")) return Shirt;
  if (n.includes("electronic") || n.includes("audio") || n.includes("appliance")) return Tv;
  if (n.includes("sport") || n.includes("outdoor")) return Dumbbell;
  if (n.includes("jewel") || n.includes("watch")) return Gem;
  if (n.includes("toy") || n.includes("kid") || n.includes("baby")) return Baby;
  if (n.includes("furniture") || n.includes("garden") || n.includes("home")) return Sofa;
  if (n.includes("auto") || n.includes("car") || n.includes("motor") || n.includes("vehicle")) return Car;
  if (n.includes("phone") || n.includes("mobile")) return Smartphone;
  if (n.includes("computer") || n.includes("laptop") || n.includes("office")) return Laptop;
  if (n.includes("beauty") || n.includes("hair") || n.includes("makeup")) return Heart;
  if (n.includes("health") || n.includes("medical")) return Pill;
  if (n.includes("pet") || n.includes("dog") || n.includes("cat") || n.includes("animal")) return Dog;
  if (n.includes("food") || n.includes("agricult")) return Wheat;
  if (n.includes("industrial") || n.includes("machin")) return Factory;
  if (n.includes("tool") || n.includes("hardware")) return Wrench;
  if (n.includes("security") || n.includes("camera")) return Camera;
  if (n.includes("light")) return Lightbulb;
  return Box;
}

export interface CategoryRecord {
  id: string;
  name: string;
  parentId: string | null;
  thumbnailUrl?: string | null;
  productCount: number;
  /** Draw this at the top of the menu as well as in its real place. */
  displayAsTopLevel?: boolean | null;
  /** What to call it when promoted, if its own name would be ambiguous. */
  displayLabel?: string | null;
  [key: string]: unknown;
}

export interface CategoryTreeNode extends CategoryRecord {
  children: CategoryTreeNode[];
  recursiveProductCount: number;
  // A representative image for the node: its own thumbnail, or (for parent
  // nodes that have none, since products only attach to leaves) the thumbnail
  // of its biggest-subtree descendant. Lets every category — top-level ones
  // included — render as an image tile instead of a placeholder box.
  displayThumbnail: string | null;
}

export function buildCategoryTree(categories: CategoryRecord[]): CategoryTreeNode[] {
  const nodeById = new Map<string, CategoryTreeNode>();
  categories.forEach(c => {
    nodeById.set(c.id, { ...c, children: [], recursiveProductCount: 0, displayThumbnail: null });
  });

  const roots: CategoryTreeNode[] = [];
  nodeById.forEach(node => {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Promoted categories appear at the top as well as where they really live.
  //
  // CJ's taxonomy puts fourteen nodes at the top and buries the things people
  // actually shop by underneath — "Furniture" is three levels down, inside
  // "Home Storage". Rather than rewrite CJ's tree (the sync would overwrite
  // it, and the real shape is what every product link depends on), a flag
  // lifts a copy of the node to the root.
  //
  // A copy, deliberately, not a move: "Women's Shoes" is a sensible thing to
  // find at the top of the menu AND the thing you expect to see when you open
  // "Bags & Shoes". Taking it out of its parent would leave that panel looking
  // gutted. So the same node is reachable from two places, which is how a
  // large menu is normally navigated.
  //
  // The copy is shallow-cloned before finalize runs, because finalize mutates
  // children in place — sharing one object between two positions would let the
  // second pass see an already-finalized subtree and drop it.
  const promoted = categories.filter(c => c.displayAsTopLevel && nodeById.has(c.id));
  for (const c of promoted) {
    const original = nodeById.get(c.id)!;
    // Already at the top in CJ's own tree: the flag is redundant, not a
    // reason to draw it twice.
    if (!original.parentId || !nodeById.has(original.parentId)) continue;
    roots.push(cloneForRoot(original));
  }

  // Bottom-up: compute each node's recursive product count, drop any node
  // (at any depth) whose subtree has zero products, sort each level by count.
  // The zero-product filter is what keeps empty categories (level-1/level-2
  // nodes whose leaves haven't been synced yet, plus genuinely-empty CJ tree
  // nodes) out of every category UI — so users never click into a dead-end
  // "No products found" branch. A category reappears automatically the moment
  // the sync attaches its first product.
  const finalize = (nodes: CategoryTreeNode[]): CategoryTreeNode[] => {
    return nodes
      .map(node => {
        node.children = finalize(node.children);
        const childrenTotal = node.children.reduce((sum, c) => sum + c.recursiveProductCount, 0);
        node.recursiveProductCount = (node.productCount || 0) + childrenTotal;
        // children are already finalized + sorted by recursiveProductCount desc,
        // so the first child with an image is the biggest populated subtree.
        node.displayThumbnail = node.thumbnailUrl
          || node.children.find(c => c.displayThumbnail)?.displayThumbnail
          || null;
        return node;
      })
      .filter(node => node.recursiveProductCount > 0)
      .sort((a, b) => b.recursiveProductCount - a.recursiveProductCount);
  };

  return finalize(roots);
}

/**
 * A deep copy of a node, standing at the root under its display name.
 *
 * Deep because finalize() rewrites children arrays in place; two positions
 * sharing one object would have the second pass operate on the first pass's
 * output. The id is kept as-is — the promoted tile links to the same category
 * page as the nested one, which is the point.
 */
function cloneForRoot(node: CategoryTreeNode): CategoryTreeNode {
  return {
    ...node,
    name: node.displayLabel || node.name,
    children: node.children.map(cloneForRoot),
    // Marks this as the promoted copy, so a UI that wants to tell them apart
    // can. Nothing needs it today.
    promotedCopy: true,
  };
}

// Flattens a node's descendant leaves (nodes with no children) — for UIs
// that need a flat list of "the actual product-bearing categories" rather
// than the nested tree, e.g. a circular thumbnail-tile grid.
export function flattenLeaves(node: CategoryTreeNode): CategoryTreeNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(flattenLeaves);
}
