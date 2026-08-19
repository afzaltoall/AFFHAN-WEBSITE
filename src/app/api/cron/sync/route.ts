import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { fetchCategories, fetchCjProducts, delay, type CjCategoryNode, type CjRawProduct } from "../../../../lib/cj";
import { isCategoryBlocked } from "../../../../lib/moderation";
import { uploadImageToS3 } from "../../../../lib/s3-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow Vercel up to 5 minutes to run this cron job

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isTestMode = searchParams.get("test") === "true";

    // 1. Basic security check
    if (!isTestMode) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    // 2. Initialize categories if empty
    const forcePartial = searchParams.get("forcePartial");
    if (forcePartial) {
      await prisma.syncProgress.updateMany({
        where: { category: { name: forcePartial }, status: "IN_PROGRESS" },
        data: { status: "PARTIAL_LIMIT_REACHED" }
      });
      return NextResponse.json({ success: true, message: `Forced ${forcePartial} to PARTIAL_LIMIT_REACHED.` });
    }

    const categoryCount = await prisma.category.count();
    if (categoryCount === 0) {
      console.log("Category table empty, fetching full tree from CJ...");
      const categoriesTree = await fetchCategories();
      
      const leafCategories: { id: string; name?: string; parentId: string | null; parentName: string | null }[] = [];
      const traverse = (node: CjCategoryNode, parentId: string | null = null, parentName: string | null = null) => {
        if (node.categoryFirstList) {
          node.categoryFirstList.forEach((child) => traverse(child, node.categoryFirstId ?? null, node.categoryFirstName ?? null));
        } else if (node.categorySecondList) {
          node.categorySecondList.forEach((child) => traverse(child, node.categorySecondId ?? null, node.categorySecondName ?? null));
        } else if (node.categoryId) {
          leafCategories.push({
            id: node.categoryId,
            name: node.categoryName,
            parentId,
            parentName,
          });
        }
      };

      categoriesTree.forEach((root) => traverse(root));
      
      console.log(`Found ${leafCategories.length} leaf categories. Bulk inserting...`);
      
      // Bulk insert categories
      await prisma.category.createMany({
        data: leafCategories.map(cat => ({
          id: cat.id,
          name: cat.name ?? "Unnamed Category",
          parentId: cat.parentId,
          parentName: cat.parentName
        })),
        skipDuplicates: true
      });

      // Bulk insert sync progress
      await prisma.syncProgress.createMany({
        data: leafCategories.map(cat => ({
          categoryId: cat.id,
          lastPageFetched: 0,
          status: "PENDING"
        })),
        skipDuplicates: true
      });
      
      return NextResponse.json({ success: true, message: `Initialized ${leafCategories.length} categories. Run again to start syncing.` });
    }

    // 3. Find next category to sync
    // Prioritize finishing IN_PROGRESS categories before starting new PENDING ones
    let progress = await prisma.syncProgress.findFirst({
      where: { status: "IN_PROGRESS" },
      orderBy: { updatedAt: 'asc' },
      include: { category: true }
    });

    if (!progress) {
      progress = await prisma.syncProgress.findFirst({
        where: { status: "PENDING" },
        orderBy: { updatedAt: 'asc' },
        include: { category: true }
      });
    }

    if (!progress) {
      return NextResponse.json({ success: true, message: "All categories completed." });
    }

    console.log(`Resuming sync for category: ${progress.category.name} (${progress.categoryId})`);
    
    // Concurrency Lock
    await prisma.syncProgress.update({
      where: { id: progress.id },
      data: { status: "IN_PROGRESS" }
    });

    let lastPage = progress.lastPageFetched;
    let totalPages = progress.totalPages || 999;
    let totalSynced = 0;
    
    // Setup category lineage for S3 nested folder structure
    const leafCategory = progress.category.name;
    const subCategory = progress.category.parentName || 'uncategorized';
    const parentCatRecord = subCategory !== 'uncategorized' 
      ? await prisma.category.findFirst({ where: { name: subCategory } }) 
      : null;
    const rootCategory = parentCatRecord?.parentName || 'uncategorized';

    // Fetch up to 5 pages per cron run
    for (let i = 0; i < 5; i++) {
      const pageNum = lastPage + 1;
      if (pageNum > totalPages) break;
      
      try {
        const productData = await fetchCjProducts(progress.categoryId, pageNum, 50);
        const cjProducts = productData.list || [];
        totalPages = Math.ceil((productData.total || 0) / 50);
        
        if (cjProducts.length === 0) {
          console.log(`Page ${pageNum} returned 0 products. Assuming end of category.`);
          lastPage = totalPages;
          break;
        }
        
        // Native chunking for concurrency (batch size 5)
        const chunkArray = <T>(arr: T[], size: number): T[][] =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
          );

        const batches = chunkArray(cjProducts, 5);
        let results: PromiseSettledResult<any>[] = [];

        for (const batch of batches) {
          const batchPromises = batch.map(async (cp: CjRawProduct) => {
            const cjPid = cp.pid || cp.productId || String(cp.id);
            if (!cjPid) return null;

            const parseName = (nameStr: unknown) => {
              if (!nameStr) return null;
              if (typeof nameStr === 'string' && nameStr.startsWith('[') && nameStr.endsWith(']')) {
                try {
                  const parsed = JSON.parse(nameStr);
                  if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
                } catch {}
              }
              return String(nameStr);
            };

            // Block specifically contaminated or unwanted categories
            const blockedCategories = [
              '95C53342-6277-4FEC-B450-6D3F9EEDD6A1', // Flower Girl Dresses
              '2409230541301627300', // Women's Camis
              '7D611AF5-5135-4BBB-86F6-E80179F8E5B8', // Rompers
              'ECDBD4C4-7467-4831-9F55-740E3C7968BE', // Suits & Sets
              '7B69E34F-43A3-4143-A22D-30786EE97998'  // Jumpsuits
            ];

            if (blockedCategories.includes(progress.categoryId)) {
              console.warn(`[Moderation] Skipped blocked category: ${progress.category.name}`);
              return null; // Skip entirely
            }

            const rawName = cp.productNameEn || cp.productName || "Unknown Product";
            const parsedName = parseName(rawName) || "Unknown Product";

            // Content Moderation Filter
            const explicitWords = ['vibrator', 'dildo', 'masturbator', 'fleshlight', 'anal', 'penis', 'vagina', 'sex doll', 'bdsm', 'bondage', 'nipple clamp', 'cock ring', 'adult toy', 'sex toy', 'butt plug', 'anal plug'];
            const lingerieWords = ['bra', 'lingerie', 'camisole', 'corset', 'latex bodysuit', 'shapewear', 'waist trainer', 'girdle', 'bikini', 'g-string', 'gstring'];
            const fetishWords = ['patent leather bodysuit', 'harness'];
            
            const standardRegex = new RegExp(`\\b(${[...explicitWords, ...lingerieWords, ...fetishWords].join('|')})\\b`, 'i');
            const beltRegex = new RegExp(`\\b(${[...explicitWords, 'bra', 'lingerie', 'camisole', 'latex bodysuit', 'shapewear', 'waist trainer', 'sauna suit', 'body shaper', 'patent leather bodysuit', 'harness'].join('|')})\\b`, 'i');
            
            let nameToCheck = parsedName.toLowerCase();
            const catName = cp.categoryName || progress.category.name;
            
            let isBlocked = false;
            let matchedKeyword = '';

            // Category-level moderation: whole categories whose imagery is too
            // adult for a B2B catalog are skipped + logged regardless of name.
            if (isCategoryBlocked(catName)) {
              isBlocked = true;
              matchedKeyword = 'blocked-category';
            }

            if (!isBlocked && catName !== 'Pet Toy Set') {
              const hasExclusion = ['wiring harness', 'dog harness', 'pet harness', 'safety harness', 'latex toy', 'cleaning glove', 'disposable latex glove', 'goalkeeper glove', 'latex glove'].some(ex => nameToCheck.includes(ex));
              
              if (!hasExclusion) {
                nameToCheck = nameToCheck.replace(/corset-style/gi, '');
                
                const regexToUse = catName === 'Belts & Cummerbunds' ? beltRegex : standardRegex;
                const match = nameToCheck.match(regexToUse);
                
                if (match || standardRegex.test(catName)) {
                  isBlocked = true;
                  matchedKeyword = match ? match[0] : 'Category Name Match';
                }
              }
            }

            if (isBlocked) {
              console.warn(`[Moderation] Skipped explicit product: ${parsedName} (Triggered by: ${matchedKeyword})`);
              return prisma.moderationLog.create({
                data: {
                  cjPid: String(cjPid),
                  name: parsedName,
                  categoryName: catName,
                  flaggedKeyword: matchedKeyword
                }
              }).then(() => null).catch((e) => {
                console.error("Moderation log error:", e);
                return null;
              });
            }

            // Download from CJ and upload to S3 if not already an S3 URL
            let finalImageUrl = cp.productImage || cp.productImageSet?.[0] || null;
            if (finalImageUrl && !finalImageUrl.includes('affan-product-images.s3')) {
              try {
                finalImageUrl = await uploadImageToS3(finalImageUrl, cp.productSku || String(cjPid), rootCategory, subCategory, leafCategory);
              } catch (err) {
                console.warn(`[Cron] S3 upload failed for product ${cjPid}, falling back to raw CJ URL.`, err);
              }
            }

            return prisma.product.upsert({
              where: { cjPid: String(cjPid) },
              update: {
                name: parsedName,
                sku: cp.productSku || null,
                imageUrl: finalImageUrl,
                allImages: cp.productImageSet || [],
                categoryId: progress.categoryId,
                category: cp.categoryName || progress.category.name,
                description: cp.description || null,
                lastSynced: new Date(),
              },
              create: {
                cjPid: String(cjPid),
                name: parsedName,
                sku: cp.productSku || null,
                imageUrl: finalImageUrl,
                allImages: cp.productImageSet || [],
                categoryId: progress.categoryId,
                category: cp.categoryName || progress.category.name,
                description: cp.description || null,
              }
            });
          });
          
          const batchResults = await Promise.allSettled(batchPromises);
          results.push(...batchResults);
        }
        
        for (const res of results) {
          if (res.status === 'fulfilled' && res.value !== null) {
            totalSynced++;
          } else if (res.status === 'rejected') {
            console.error(`Failed to upsert a product in category ${progress.category.name}:`, res.reason?.message || res.reason);
          }
        }
        
        lastPage = pageNum;
        
        // Save progress after every page to prevent data loss on crash
        await prisma.syncProgress.update({
          where: { id: progress.id },
          data: { lastPageFetched: lastPage, totalPages }
        });
        
        console.log(`Saved page ${pageNum} for ${progress.category.name}.`);
        await delay(500);
        
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message === "MaxOffsetLimit" || message.includes("max offset")) {
          console.log(`CJ API limit reached on category ${progress.category.name} page ${pageNum} (max offset 6000). Marking category as partially completed.`);
          lastPage = totalPages; // Force completion
          break; // break the retry loop and drop down to the completion logic
        }

        if (message === "PointsLimitReached") {
          console.log(`CJ Daily API Points Limit Reached! Pausing sync for today.`);
          // Status stays IN_PROGRESS so it resumes here later
          return NextResponse.json({ success: false, pointsLimitReached: true, error: message }, { status: 429 });
        }

        console.error(`Error on page ${pageNum}:`, message);
        await prisma.syncProgress.update({
          where: { id: progress.id },
          data: { status: "FAILED", errorMessage: message || "Unknown error" }
        });
        return NextResponse.json({ success: false, error: message }, { status: 500 });
      }
    }

    // 4. Mark completed if done
    let newStatus = "IN_PROGRESS";
    if (lastPage >= totalPages) {
      newStatus = lastPage >= 120 ? "PARTIAL_LIMIT_REACHED" : "COMPLETED"; // 120 * 50 = 6000 max offset
      console.log(`Category ${progress.category.name} fully completed with status: ${newStatus}!`);
    }

    await prisma.syncProgress.update({
      where: { id: progress.id },
      data: { status: newStatus }
    });

    // 5. Auto-fill this category's thumbnail from a product image as soon as
    // it has one, so a freshly-synced category shows a real tile in the
    // mega-menu/sidebar automatically — no separate populate_category_thumbnails
    // run needed. Non-fatal by design: a failure here must never break sync.
    try {
      const cat = await prisma.category.findUnique({
        where: { id: progress.categoryId },
        select: { thumbnailUrl: true }
      });
      if (cat && !cat.thumbnailUrl) {
        const withImg = await prisma.product.findFirst({
          where: { categoryId: progress.categoryId, imageUrl: { not: null } },
          orderBy: { id: "desc" },
          select: { imageUrl: true }
        });
        if (withImg?.imageUrl) {
          await prisma.category.update({
            where: { id: progress.categoryId },
            data: { thumbnailUrl: withImg.imageUrl }
          });
        }
      }
    } catch (thumbErr) {
      console.error("Thumbnail backfill (non-fatal) failed:", thumbErr);
    }

    return NextResponse.json({
      success: true,
      synced: totalSynced,
      category: progress.category.name,
      status: newStatus,
      lastPageFetched: lastPage,
      totalPages
    });

  } catch (error) {
    console.error("Cron sync failed completely:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
