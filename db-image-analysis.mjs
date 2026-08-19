import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeTable(modelName, fieldName, isJson = false) {
  try {
    const total = await prisma[modelName].count();
    console.log(`\n=== Table: ${modelName} | Field: ${fieldName} | Total: ${total} ===`);
    
    if (total === 0) {
      console.log("Empty table, skipping breakdown.");
      return;
    }

    let records;
    if (isJson) {
      // Just fetch up to a sample size to avoid OOM if large
      records = await prisma[modelName].findMany({
        select: { [fieldName]: true },
        take: 1000 // Just a sample for json
      });
    } else {
      // Get all non-null for analysis
      records = await prisma[modelName].findMany({
        where: { [fieldName]: { not: null } },
        select: { [fieldName]: true }
      });
    }

    let s3Count = 0;
    let cjCount = 0;
    let aliyunCount = 0;
    let alicdnCount = 0;
    let publicCount = 0;
    let otherCount = 0;
    let nullCount = total - records.length;

    const samples = {
      s3: [], cj: [], aliyun: [], alicdn: [], public: [], other: []
    };

    const addSample = (cat, url) => {
      if (samples[cat].length < 3) samples[cat].push(url);
    };

    for (const record of records) {
      const val = record[fieldName];
      if (!val) {
        nullCount++;
        continue;
      }
      
      let urls = [];
      if (isJson) {
        if (Array.isArray(val)) {
          urls = val;
        } else {
          continue;
        }
      } else {
        urls = [val];
      }

      for (let url of urls) {
        if (typeof url !== 'string') continue;
        const lowerUrl = url.toLowerCase();
        
        if (lowerUrl.includes('affan-product-images.s3')) {
          s3Count++;
          addSample('s3', url);
        } else if (lowerUrl.includes('cf.cjdropshipping.com') || lowerUrl.includes('cjdropshipping.com')) {
          cjCount++;
          addSample('cj', url);
        } else if (lowerUrl.includes('aliyuncs.com')) {
          aliyunCount++;
          addSample('aliyun', url);
        } else if (lowerUrl.includes('alicdn.com')) {
          alicdnCount++;
          addSample('alicdn', url);
        } else if (lowerUrl.startsWith('/')) {
          publicCount++;
          addSample('public', url);
        } else {
          otherCount++;
          addSample('other', url);
        }
      }
    }

    const totalValidUrls = s3Count + cjCount + aliyunCount + alicdnCount + publicCount + otherCount;
    if (isJson) console.log(`Note: Analyzed ${totalValidUrls} URLs within JSON arrays across ${records.length} sampled rows.`);

    const pct = (cnt) => ((cnt / (isJson ? totalValidUrls : total)) * 100).toFixed(2) + "%";

    console.log(`- S3 (affan-product-images): ${s3Count} (${pct(s3Count)})`);
    if (s3Count > 0) console.log(`  Samples: ${samples.s3.join(', ')}`);
    
    console.log(`- CJ Dropshipping: ${cjCount} (${pct(cjCount)})`);
    if (cjCount > 0) console.log(`  Samples: ${samples.cj.join(', ')}`);
    
    console.log(`- AliYun OSS: ${aliyunCount} (${pct(aliyunCount)})`);
    if (aliyunCount > 0) console.log(`  Samples: ${samples.aliyun.join(', ')}`);
    
    console.log(`- AliExpress CDN: ${alicdnCount} (${pct(alicdnCount)})`);
    if (alicdnCount > 0) console.log(`  Samples: ${samples.alicdn.join(', ')}`);
    
    console.log(`- Local/Public (/path): ${publicCount} (${pct(publicCount)})`);
    if (publicCount > 0) console.log(`  Samples: ${samples.public.join(', ')}`);
    
    console.log(`- Other/Unknown: ${otherCount} (${pct(otherCount)})`);
    if (otherCount > 0) console.log(`  Samples: ${samples.other.join(', ')}`);
    
    if (!isJson) console.log(`- NULL/Empty: ${nullCount} (${pct(nullCount)})`);

  } catch (err) {
    console.error(`Error analyzing ${modelName}.${fieldName}:`, err);
  }
}

async function main() {
  await analyzeTable('product', 'imageUrl');
  await analyzeTable('category', 'thumbnailUrl');
  await analyzeTable('scrapedProduct', 'imageUrl');
  await analyzeTable('adminUser', 'image');
  await prisma.$disconnect();
}
main();
