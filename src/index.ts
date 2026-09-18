#!/usr/bin/env node
/**
 * Etsy Model & Niche Hunter - MCP server
 *
 * Exposes three tools to any MCP-compatible agent (Claude Code, MCP Market Hub,
 * Cursor, ...). Every request uses the credentials of the person running the
 * server, supplied through environment variables or per-call tool arguments.
 *
 *   ETSY_API_KEY      required - your own Etsy Open API v3 keystring
 *   ETSY_SHARED_SECRET optional - kept for parity with Etsy app credentials
 *   ETSY_OAUTH_TOKEN  optional - OAuth2 access token, required only for drafts
 *   ETSY_SHOP_ID      optional - default shop for draft creation
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  createDraftListing,
  getShop,
  getShopListings,
  resolveCredentials,
  resolveShopId,
  searchListings,
} from "./etsy.js";
import { clusterModels, rankKeywords } from "./clusters.js";
import { ESTIMATION_NOTE, computeMetrics } from "./metrics.js";

const server = new McpServer({
  name: "etsy",
  version: "1.0.0",
});

const credentialArgs = {
  api_key: z
    .string()
    .optional()
    .describe("Your Etsy keystring. Defaults to the ETSY_API_KEY env var."),
};

function json(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* scan_niche                                                          */
/* ------------------------------------------------------------------ */
server.tool(
  "scan_niche",
  "Scan active Etsy listings for a seed keyword and return demand estimates, model/variant clusters ranked by sales velocity, keyword evidence and incumbent weaknesses.",
  {
    keyword: z.string().describe('Seed keyword, e.g. "tractor repair manual".'),
    max_results: z
      .number()
      .int()
      .min(20)
      .max(500)
      .default(100)
      .describe("How many active listings to scan (Etsy rate limits apply)."),
    ...credentialArgs,
  },
  async ({ keyword, max_results, api_key }) => {
    try {
      const creds = resolveCredentials({ api_key });
      const listings = await searchListings(keyword, creds, max_results ?? 100);
      if (!listings.length) {
        return json({
          keyword,
          scanned: 0,
          message: "Etsy returned no active listings for this keyword.",
        });
      }
      const scored = listings.map((l) => ({ l, m: computeMetrics(l) }));
      const totalMonthly =
        Math.round(scored.reduce((s, x) => s + x.m.estMonthlySales, 0) * 10) / 10;
      const prices = listings
        .map((l) => parseFloat(l.price) || 0)
        .filter(Boolean)
        .sort((a, b) => a - b);

      return json({
        keyword,
        scanned: listings.length,
        estimation_note: ESTIMATION_NOTE,
        niche_summary: {
          estimated_monthly_sales_across_scanned: totalMonthly,
          price_range: prices.length
            ? {
                low: prices[0],
                median: prices[Math.floor(prices.length / 2)],
                high: prices[prices.length - 1],
              }
            : null,
        },
        model_clusters: clusterModels(listings, 10),
        keyword_evidence: rankKeywords(listings, 25),
        top_listings: scored
          .sort((a, b) => b.m.estMonthlySales - a.m.estMonthlySales)
          .slice(0, 10)
          .map(({ l, m }) => ({
            listing_id: l.listing_id,
            title: l.title,
            url: l.url,
            price: l.price,
            currency: l.currency_code,
            favorites: l.num_favorers,
            tags: l.tags,
            est_monthly_sales: m.estMonthlySales,
            est_monthly_revenue: m.estMonthlyRevenue,
          })),
      });
    } catch (e) {
      return fail(e);
    }
  }
);

/* ------------------------------------------------------------------ */
/* analyze_shop                                                        */
/* ------------------------------------------------------------------ */
server.tool(
  "analyze_shop",
  "Audit an Etsy shop (by name, numeric id, or shop URL): inventory, estimated demand per listing, pricing distribution, strongest tags and listing-quality gaps.",
  {
    shop: z
      .string()
      .describe('Shop name, numeric shop id, or https://www.etsy.com/shop/... URL.'),
    max_listings: z
      .number()
      .int()
      .min(10)
      .max(500)
      .default(100)
      .describe("How many active listings to pull from the shop."),
    ...credentialArgs,
  },
  async ({ shop, max_listings, api_key }) => {
    try {
      const creds = resolveCredentials({ api_key });
      const { shop_id, shop_name } = await resolveShopId(shop, creds);
      const info = await getShop(shop_id, creds);
      const listings = await getShopListings(
        shop_id,
        creds,
        max_listings ?? 100,
        "active"
      );
      const scored = listings.map((l) => ({ l, m: computeMetrics(l) }));
      const prices = listings
        .map((l) => parseFloat(l.price) || 0)
        .filter(Boolean)
        .sort((a, b) => a - b);
      const avgTags =
        listings.reduce((s, l) => s + (l.tags?.length || 0), 0) /
        (listings.length || 1);

      return json({
        shop: {
          shop_id,
          shop_name,
          lifetime_sales: info?.transaction_sold_count ?? null,
          review_count: info?.review_count ?? null,
          review_average: info?.review_average ?? null,
          listing_active_count: info?.listing_active_count ?? null,
        },
        estimation_note: ESTIMATION_NOTE,
        pulled_listings: listings.length,
        pricing: prices.length
          ? {
              low: prices[0],
              median: prices[Math.floor(prices.length / 2)],
              high: prices[prices.length - 1],
            }
          : null,
        listing_quality: {
          average_tags_used: Math.round(avgTags * 10) / 10,
          listings_below_13_tags: listings.filter((l) => (l.tags?.length || 0) < 13)
            .length,
          short_titles_under_80_chars: listings.filter((l) => l.title.length < 80)
            .length,
        },
        protected_keywords: rankKeywords(listings, 15),
        top_listings: scored
          .sort((a, b) => b.m.estMonthlySales - a.m.estMonthlySales)
          .slice(0, 15)
          .map(({ l, m }) => ({
            listing_id: l.listing_id,
            title: l.title,
            url: l.url,
            price: l.price,
            favorites: l.num_favorers,
            tags: l.tags,
            est_monthly_sales: m.estMonthlySales,
            est_monthly_revenue: m.estMonthlyRevenue,
          })),
        model_clusters: clusterModels(listings, 8),
      });
    } catch (e) {
      return fail(e);
    }
  }
);

/* ------------------------------------------------------------------ */
/* create_draft                                                        */
/* ------------------------------------------------------------------ */
const TITLE_MAX = 140;
const TAG_MAX = 20;

function sanitizeTitle(raw: string) {
  let t = raw.replace(/\s+/g, " ").trim();
  let seenAmp = false;
  t = t.replace(/&/g, () => (seenAmp ? " and " : ((seenAmp = true), "&")));
  t = t.replace(/[%:]/g, " ").replace(/\s+/g, " ").trim();
  return t.slice(0, TITLE_MAX).trim();
}

function sanitizeTags(raw: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const clean = tag
      .replace(/[^a-zA-Z0-9\- ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, TAG_MAX)
      .trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length === 13) break;
  }
  return out;
}

server.tool(
  "create_draft",
  "Create a rank-safe digital download DRAFT listing in your own Etsy shop. Titles and tags are sanitised to Etsy limits. The draft is never published - attach the digital file in Etsy Shop Manager first.",
  {
    title: z.string().describe("Listing title, max 140 characters after cleanup."),
    description: z.string().describe("Full listing description."),
    tags: z
      .array(z.string())
      .describe("Up to 13 tags, each max 20 characters. Extra tags are dropped."),
    price: z.number().positive().describe("Listing price in the shop currency."),
    taxonomy_id: z
      .number()
      .int()
      .default(343)
      .describe("Etsy taxonomy id. 343 = Guides & How Tos (digital)."),
    quantity: z.number().int().min(1).default(999),
    shop_id: z
      .string()
      .optional()
      .describe("Your numeric shop id. Defaults to the ETSY_SHOP_ID env var."),
    oauth_token: z
      .string()
      .optional()
      .describe("Etsy OAuth2 access token. Defaults to ETSY_OAUTH_TOKEN."),
    ...credentialArgs,
  },
  async (args) => {
    try {
      const creds = resolveCredentials(args);
      let shopId = creds.shopId;
      if (!shopId) {
        throw new Error(
          "No shop id. Set ETSY_SHOP_ID or pass shop_id - Etsy requires the numeric shop id, not the shop name."
        );
      }
      if (!/^\d+$/.test(shopId)) {
        shopId = String((await resolveShopId(shopId, creds)).shop_id);
      }

      const title = sanitizeTitle(args.title);
      const tags = sanitizeTags(args.tags);
      const created = await createDraftListing(creds, {
        shop_id: Number(shopId),
        title,
        description: args.description,
        tags,
        price: args.price,
        quantity: args.quantity ?? 999,
        taxonomy_id: args.taxonomy_id ?? 343,
      });

      return json({
        status: "draft_created",
        listing_id: created?.listing_id ?? created?.results?.[0]?.listing_id ?? null,
        applied_title: title,
        applied_tags: tags,
        next_step:
          "Open Etsy Shop Manager, attach the digital file to this draft, then publish. Digital listings cannot go live without an attached file.",
      });
    } catch (e) {
      return fail(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Etsy MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Etsy MCP server:", err);
  process.exit(1);
});
