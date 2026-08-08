import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { Category } from ".prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parentId } = await params;

    // Fetch immediate children
    const children = await prisma.category.findMany({
      where: { parentId },
      orderBy: { name: 'asc' }
    });

    if (children.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch all categories to build adjacency list for quick descendant lookup
    const allCategories = await prisma.category.findMany({
      select: { id: true, parentId: true }
    });

    const childrenMap = new Map<string, string[]>();
    for (const cat of allCategories) {
      if (cat.parentId) {
        if (!childrenMap.has(cat.parentId)) childrenMap.set(cat.parentId, []);
        childrenMap.get(cat.parentId)!.push(cat.id);
      }
    }

    // Enhance each child with a representative product image
    const enhancedChildren = await Promise.all(
      children.map(async (child: Category) => {
        // Find all descendants of this child
        const descendants = new Set<string>([child.id]);
        const queue = [child.id];

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const childIds = childrenMap.get(curr);
          if (childIds) {
            for (const c of childIds) {
              if (!descendants.has(c)) {
                descendants.add(c);
                queue.push(c);
              }
            }
          }
        }

        // Fetch one representative product for this child (or its descendants)
        const product = await prisma.product.findFirst({
          where: {
            categoryId: { in: Array.from(descendants) },
            imageUrl: { not: null }
          },
          select: { imageUrl: true }
        });

        return {
          ...child,
          imageUrl: product?.imageUrl || null
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enhancedChildren
    });
  } catch (error: unknown) {
    console.error("Failed to fetch child categories:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
