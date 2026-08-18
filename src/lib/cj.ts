const CJ_API_URL = "https://developers.cjdropshipping.com/api2.0/v1";

interface CjAuthResponse {
  code: number;
  result: boolean;
  message: string;
  data: {
    accessToken: string;
    accessTokenExpiryDate: string;
  };
}

// Fields we actually read off a CJ product list item. CJ's API returns many
// more fields than this; this is intentionally not exhaustive.
export interface CjRawProduct {
  pid?: string;
  productId?: string;
  id?: string | number;
  productNameEn?: string;
  productName?: string;
  productSku?: string;
  productImage?: string;
  productImageSet?: string[];
  categoryName?: string;
  description?: string;
  [key: string]: unknown;
}

interface CjProductResponse {
  code: number;
  result: boolean;
  message: string;
  data: {
    list: CjRawProduct[];
    total: number;
  };
}

// CJ's category tree: each node is either an internal node with a nested
// list of children (categoryFirstList / categorySecondList) or a leaf with
// a categoryId — see fetchCategories() and the traverse() in the sync cron.
export interface CjCategoryNode {
  categoryId?: string;
  categoryName?: string;
  categoryFirstId?: string;
  categoryFirstName?: string;
  categorySecondId?: string;
  categorySecondName?: string;
  categoryFirstList?: CjCategoryNode[];
  categorySecondList?: CjCategoryNode[];
}

// In-memory cache for the token
let cachedToken: string | null = null;
let tokenExpiryTime: number | null = null;

/**
 * Ensures we have a valid CJ API token. Re-fetches if expired or missing.
 */
export async function getCjToken(): Promise<string> {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ_API_KEY is not defined in environment variables");
  }

  // If we have a token and it's not expiring in the next 10 minutes (600,000 ms)
  const now = Date.now();
  if (cachedToken && tokenExpiryTime && tokenExpiryTime > now + 600000) {
    return cachedToken;
  }

  console.log("Fetching new CJ Dropshipping Access Token...");

  const response = await fetch(`${CJ_API_URL}/authentication/getAccessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apiKey }),
  });

  const json: CjAuthResponse = await response.json();

  if (!json.result || !json.data) {
    throw new Error(`CJ API Auth Error: ${json.message}`);
  }

  cachedToken = json.data.accessToken;
  // Parse expiry (assuming string like "2023-12-31 23:59:59" or similar)
  // Fallback to exactly 14 days if parsing fails just in case
  const expiryParsed = new Date(json.data.accessTokenExpiryDate).getTime();
  tokenExpiryTime = isNaN(expiryParsed) ? now + 14 * 24 * 60 * 60 * 1000 : expiryParsed;

  return cachedToken;
}

/**
 * Delay function to handle rate limiting
 */
export const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Fetch products from CJ API by keyword
 * API Docs: https://developers.cjdropshipping.com/en/api/api2/api/product.html
 */
export async function fetchCjProducts(categoryId: string, pageNum = 1, pageSize = 50, retries = 3) {
  const token = await getCjToken();

  console.log(`[CJ API] Fetching products for categoryId: "${categoryId}", page: ${pageNum}`);

  const searchParams = new URLSearchParams({
    categoryId,
    pageNum: pageNum.toString(),
    pageSize: pageSize.toString()
  });

  try {
    const searchResponse = await fetch(`${CJ_API_URL}/product/list?${searchParams.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
    });

    const json: CjProductResponse = await searchResponse.json();

    if (!json.result) {
      if (json.message.includes("Too Many Requests") || json.message.includes("QPS limit")) {
        throw new Error(`RateLimited`);
      }
      if (json.message.includes("the max offset is")) {
        throw new Error(`MaxOffsetLimit`);
      }
      if (json.message.includes("Insufficient API points")) {
        throw new Error(`PointsLimitReached`);
      }
      throw new Error(`API Error: ${json.message}`);
    }

    return json.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== "MaxOffsetLimit" && retries > 0) {
      console.log(`Fetch failed for category ${categoryId} page ${pageNum} (${message}). Retrying... (${retries} left)`);
      await delay(2500);
      return fetchCjProducts(categoryId, pageNum, pageSize, retries - 1);
    }
    throw err;
  }
}

export async function fetchCategories(): Promise<CjCategoryNode[]> {
  const token = await getCjToken();
  console.log(`[CJ API] Fetching full category tree...`);
  
  const response = await fetch(`${CJ_API_URL}/product/getCategory`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
    },
  });

  const json: { result: boolean; message: string; data: CjCategoryNode[] } = await response.json();
  if (!json.result) {
    throw new Error(`CJ API Category Fetch Error: ${json.message}`);
  }

  return json.data;
}
