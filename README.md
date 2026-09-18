# Etsy Model & Niche Hunter — MCP Server

An MCP server that turns any AI agent into an Etsy product researcher: it finds
high-velocity, low-saturation sub-niches, audits competitor shops, and creates
rank-safe digital download drafts.

**You use your own Etsy API keys.** Nothing is proxied through a third party and
no credentials ship with this package.

## Tools

| Tool | What it does |
| --- | --- |
| `scan_niche` | Scans active Etsy listings for a keyword, returns demand estimates, model/variant clusters ranked by sales velocity, tag evidence and incumbent weaknesses. |
| `analyze_shop` | Audits a shop by name, id or URL: inventory, per-listing demand, pricing spread, strongest tags, listing-quality gaps. |
| `create_draft` | Creates a digital download **draft** in your own shop, with titles and tags sanitised to Etsy's limits. |

## Requirements

1. A free Etsy developer app → keystring: https://www.etsy.com/developers/register
2. For draft creation only: an Etsy OAuth2 access token with the `listings_w` scope.

## Install

From this repository:

```bash
git clone https://github.com/teomro/etsy.git etsy-mcp-server
cd etsy-mcp-server
npm install
npm run build
```

Then point your agent at the local build:

```json
{
  "mcpServers": {
    "etsy": {
      "command": "node",
      "args": ["/absolute/path/to/etsy-mcp-server/dist/index.js"],
      "env": {
        "ETSY_API_KEY": "your_keystring",
        "ETSY_SHARED_SECRET": "your_shared_secret",
        "ETSY_OAUTH_TOKEN": "optional_oauth_access_token",
        "ETSY_SHOP_ID": "optional_numeric_shop_id"
      }
    }
  }
}
```

Or via npm (published package):

```json
{
  "mcpServers": {
    "etsy": {
      "command": "npx",
      "args": ["-y", "@etsylens/mcp-server"],
      "env": {
        "ETSY_API_KEY": "your_keystring",
        "ETSY_SHARED_SECRET": "your_shared_secret",
        "ETSY_OAUTH_TOKEN": "optional_oauth_access_token",
        "ETSY_SHOP_ID": "optional_numeric_shop_id"
      }
    }
  }
}
```

Docker:

```bash
docker build -t etsy-mcp-server .
docker run -i --rm -e ETSY_API_KEY=... -e ETSY_SHARED_SECRET=... etsy-mcp-server
```

Tools then appear to the agent as `mcp__etsy__scan_niche`,
`mcp__etsy__analyze_shop` and `mcp__etsy__create_draft`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ETSY_API_KEY` | yes | Your Etsy keystring (read access). |
| `ETSY_SHARED_SECRET` | no | Kept for parity with Etsy app credentials. |
| `ETSY_OAUTH_TOKEN` | for drafts | OAuth2 access token with `listings_w`. |
| `ETSY_SHOP_ID` | for drafts | Your numeric shop id (not the shop name). |
| `ETSY_FAVORITES_TO_SALES` | no | Override the calibration constant (default `22.08`). |

## How the estimates work

Etsy publishes no per-listing sales number. Demand is derived from public
signals:

```
estimated total sales    = favourites × 22.08
estimated monthly sales  = estimated total sales ÷ months since listed
estimated monthly revenue = estimated monthly sales × price
sales velocity           = cluster monthly sales ÷ competing listings
```

These are directional estimates, not measured sales.

## Rate limits

Etsy allows **10 requests/second** and **10,000 requests/day** per keystring.
The server paces paged requests and surfaces Etsy's own 429 message when you hit
the cap.

## Safety

- `create_draft` only ever creates drafts — it never publishes or edits live listings.
- Digital listings require a file attachment, added in Etsy Shop Manager before publishing.
- Titles are capped at 140 characters; tags are capped at 13 × 20 characters.

MIT licensed.
