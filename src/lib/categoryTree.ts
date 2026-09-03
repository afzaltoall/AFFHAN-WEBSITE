import { Shirt, Tv, Dumbbell, Gem, Baby, Sofa, Car, Smartphone, Laptop, Heart, Pill, Dog, Wheat, Box, Factory, Wrench, Camera, Lightbulb } from "lucide-react";

// Single source of truth for turning the flat /api/categories list into a
// navigable tree. Every category-consuming UI (navbar mega-menu, homepage
// sidebar, /products sidebar+popout) should build its tree through this
// function rather than re-implementing its own filtering, so "hide branches
// with zero products anywhere in their subtree" only has to be correct once.

export function getCategoryIcon(name: string) {
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
