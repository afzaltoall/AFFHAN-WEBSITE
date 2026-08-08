// Single source of truth for turning the flat /api/categories list into a
// navigable tree. Every category-consuming UI (navbar mega-menu, homepage
// sidebar, /products sidebar+popout) should build its tree through this
// function rather than re-implementing its own filtering, so "hide branches
// with zero products anywhere in their subtree" only has to be correct once.

export interface CategoryRecord {
  id: string;
  name: string;
  parentId: string | null;
  thumbnailUrl?: string | null;
  productCount: number;
  [key: string]: any;
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

// Flattens a node's descendant leaves (nodes with no children) — for UIs
// that need a flat list of "the actual product-bearing categories" rather
// than the nested tree, e.g. a circular thumbnail-tile grid.
export function flattenLeaves(node: CategoryTreeNode): CategoryTreeNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(flattenLeaves);
}
