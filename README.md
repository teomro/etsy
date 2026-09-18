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
| `health_check` | Reports whether a key is configured and whether Etsy answers. Run this first if anything fails. |

## Deploy on MCP Market

1. MCP Servers → **+ Add custom** → **GitHub**
   - Repository: `https://github.com/teomro/etsy`
   - Server name: `etsy`
2. After the deploy succeeds, open the server's **Variables** tab and set
   `ETSY_API_KEY` (required) and `ETSY_SHARED_SECRET`. Add `ETSY_OAUTH_TOKEN`
   and `ETSY_SHOP_ID` only if you want draft creation.
3. Restart / redeploy the server, then reconnect it in your agent.
4. Ask the agent to run `health_check` — it confirms keys and Etsy connectivity.

The deploy manifest is `mcp.json`: install `npm install --include=dev`, build
`npm run build`, start `node dist/index.js` over stdio. A `Dockerfile` with the
same steps is included for Docker-based deploys.

## Requirements

1. A free Etsy developer app → keystring: https://www.etsy.com/developers/register
2. For draft creation only: an Etsy OAuth2 access token with the `listings_w` scope.

## Install

```bash
npm install
npm run build
```

## Configure your agent

Claude Desktop / Claude Code (`claude_desktop_config.json`):

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

Tools then appear to the agent as `mcp__etsy__scan_niche`,
`mcp__etsy__analyze_shop`, `mcp__etsy__create_draft` and `mcp__etsy__health_check`.

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
