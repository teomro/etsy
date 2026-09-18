/**
 * Thin Etsy Open API v3 client.
 * Credentials always come from the user running the server (env vars or
 * per-call tool arguments) - this package never ships or uses anyone else's keys.
 */

const BASE = "https://openapi.etsy.com/v3/application";

export interface Credentials {
  /** Etsy keystring. May be given as "KEYSTRING" or "KEYSTRING:SHAREDSECRET". */
  apiKey: string;
  /** OAuth2 access token - only needed for write operations (draft creation). */
  oauthToken?: string;
  shopId?: string;
}

export function resolveCredentials(args: {
  api_key?: string;
  oauth_token?: string;
  shop_id?: string;
}): Credentials {
  const apiKey =
    args.api_key ||
    process.env.ETSY_API_KEY ||
    process.env.ETSY_KEYSTRING ||
    "";
  if (!apiKey) {
    throw new Error(
      "No Etsy API key found. Set ETSY_API_KEY (your keystring) in the server environment, or pass api_key to the tool."
    );
  }
  return {
    apiKey,
    oauthToken: args.oauth_token || process.env.ETSY_OAUTH_TOKEN,
    shopId: args.shop_id || process.env.ETSY_SHOP_ID,
  };
}

function keystring(apiKey: string) {
  // Etsy expects only the keystring in x-api-key; tolerate "KEY:SECRET" input.
  return apiKey.split(":")[0].trim();
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  description?: string;
  url: string;
  price: string;
  currency_code: string;
  num_favorers: number;
  views: number;
  tags: string[];
  shop_id?: number;
  creation_timestamp: number | null;
}

async function request<T>(
  path: string,
  creds: Credentials,
  init: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "x-api-key": keystring(creds.apiKey),
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  if (creds.oauthToken) headers.Authorization = `Bearer ${creds.oauthToken}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "Etsy rate limit reached (10 requests/second, 10,000/day per keystring). Wait a moment and retry with a smaller max_results."
      );
    }
    throw new Error(`Etsy API ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Etsy returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}

function normalise(raw: any): EtsyListing {
  const price = raw?.price
    ? typeof raw.price === "object"
      ? (Number(raw.price.amount) / Number(raw.price.divisor || 100)).toFixed(2)
      : String(raw.price)
    : "0";
  return {
    listing_id: raw.listing_id,
    title: raw.title ?? "",
    description: raw.description ?? "",
    url: raw.url ?? `https://www.etsy.com/listing/${raw.listing_id}`,
    price,
    currency_code: raw?.price?.currency_code ?? raw.currency_code ?? "USD",
    num_favorers: raw.num_favorers ?? 0,
    views: raw.views ?? 0,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    shop_id: raw.shop_id,
    creation_timestamp: raw.creation_timestamp ?? raw.original_creation_timestamp ?? null,
  };
}

/** Keyword search across active listings, paged up to max_results (Etsy caps at 100/page). */
export async function searchListings(
  keyword: string,
  creds: Credentials,
  maxResults = 100
): Promise<EtsyListing[]> {
  const out: EtsyListing[] = [];
  const limit = 100;
  for (let offset = 0; offset < maxResults; offset += limit) {
    const take = Math.min(limit, maxResults - offset);
    const params = new URLSearchParams({
      keywords: keyword,
      limit: String(take),
      offset: String(offset),
      sort_on: "score",
    });
    const data = await request<{ results: any[] }>(
      `/listings/active?${params}`,
      creds
    );
    const page = (data.results || []).map(normalise);
    out.push(...page);
    if (page.length < take) break;
    // stay under the 10 requests/second burst limit
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Etsy requires a numeric shop_id - resolve a shop name into one when needed. */
export async function resolveShopId(
  shopNameOrId: string,
  creds: Credentials
): Promise<{ shop_id: number; shop_name: string }> {
  if (/^\d+$/.test(shopNameOrId.trim())) {
    const shop = await request<any>(`/shops/${shopNameOrId.trim()}`, creds);
    return { shop_id: shop.shop_id, shop_name: shop.shop_name };
  }
  const name = shopNameOrId.replace(/^https?:\/\/(www\.)?etsy\.com\/shop\//i, "").split("/")[0];
  const data = await request<{ results: any[] }>(
    `/shops?shop_name=${encodeURIComponent(name)}`,
    creds
  );
  const hit = (data.results || []).find(
    (s) => String(s.shop_name).toLowerCase() === name.toLowerCase()
  ) || data.results?.[0];
  if (!hit) throw new Error(`No Etsy shop found matching "${shopNameOrId}".`);
  return { shop_id: hit.shop_id, shop_name: hit.shop_name };
}

export async function getShop(shopId: number, creds: Credentials) {
  return request<any>(`/shops/${shopId}`, creds);
}

export async function getShopListings(
  shopId: number,
  creds: Credentials,
  maxResults = 100,
  state: "active" | "draft" = "active"
): Promise<EtsyListing[]> {
  const out: EtsyListing[] = [];
  const limit = 100;
  for (let offset = 0; offset < maxResults; offset += limit) {
    const take = Math.min(limit, maxResults - offset);
    const params = new URLSearchParams({
      limit: String(take),
      offset: String(offset),
      state,
    });
    const data = await request<{ results: any[] }>(
      `/shops/${shopId}/listings/${state}?${params}`,
      creds
    );
    const page = (data.results || []).map(normalise);
    out.push(...page);
    if (page.length < take) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Create a digital-download draft listing in the caller's own shop. */
export async function createDraftListing(
  creds: Credentials,
  input: {
    shop_id: number;
    title: string;
    description: string;
    tags: string[];
    price: number;
    quantity: number;
    taxonomy_id: number;
  }
) {
  if (!creds.oauthToken) {
    throw new Error(
      "Creating a draft needs write access. Set ETSY_OAUTH_TOKEN (an Etsy OAuth2 access token with the listings_w scope) or pass oauth_token."
    );
  }
  const body = {
    quantity: input.quantity,
    title: input.title,
    description: input.description,
    price: input.price,
    who_made: "i_did",
    when_made: "2020_2025",
    taxonomy_id: input.taxonomy_id,
    listing_type: "download",
    type: "download",
    state: "draft",
    is_digital: true,
    tags: input.tags,
  };
  return request<any>(`/shops/${input.shop_id}/listings`, creds, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
