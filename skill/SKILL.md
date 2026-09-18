---
name: etsy-model-niche-hunter
title: Etsy Model & Niche Hunter
version: 1.0.0
description: Autonomous Etsy intelligence skill that uncovers high-velocity sub-niches, groups specific product/model clusters, audits competitor listing weaknesses, and creates rank-safe Etsy drafts.
allowed-tools:
  - mcp__etsy__scan_niche
  - mcp__etsy__analyze_shop
  - mcp__etsy__create_draft
---

## What this skill does

Autonomous Etsy intelligence skill that uncovers high-velocity sub-niches, groups specific product/model clusters, audits competitor listing weaknesses, and creates rank-safe Etsy drafts.

## How to use it

Prompt the agent with a seed topic or a competitor shop:

- "Find high-velocity model opportunities in vintage tractor manuals on Etsy."
- "Scan the printable wedding planner niche and tell me which sub-themes have high demand but low competition."
- "Audit competitor shop [ShopName] and find keyword gaps for my digital download listing."

---

## Core operating rules

1. **Specific over generic** — never stop at broad categories. Surface exact model codes, year ranges, trims, sub-types or buyer personas from `model_clusters`.
2. **Sales velocity first** — rank by `estimated monthly sales ÷ competing listings`. Flag clusters marked `hot` (high velocity, 12 or fewer rivals).
3. **Evidence-based tagging** — every tag must come from `keyword_evidence`, never invented.
4. **Rank-safe constraints**
   - Titles: max 140 characters, strongest buyer keyword inside the first 40.
   - Tags: exactly 13, each 20 characters or fewer, 2–3 word buyer phrases.
   - Taxonomy: `343` (Guides & How Tos) unless the user says otherwise.
   - Description: 700–1200 characters covering what's included, file format, instant download, and who it's for.
5. **Never invent** model numbers, page counts, brands or compatibility that are not in the scan data.

---

## Workflow

### Step 1 — Scan and cluster
1. Call `mcp__etsy__scan_niche` with the user's keyword.
2. Present the top 3–5 clusters as a table: sub-niche/model, estimated monthly sales, rival listings, sales velocity, incumbent weaknesses.
3. Always restate the `estimation_note` so the user knows these are estimates.

### Step 2 — Competitor audit
1. Call `mcp__etsy__analyze_shop` on the leading rival shop.
2. Report protected keywords (terms leaders already own), keyword gaps, and the pricing band.

### Step 3 — Rank-safe draft
1. Draft the title, 13 tags, description and price within the observed band.
2. Show the draft and wait for explicit approval.
3. Call `mcp__etsy__create_draft`.
4. Remind the user to attach the digital file in Etsy Shop Manager before publishing.

See `references/listing-rules.md` and `references/estimation-method.md`.
