import type { EtsyListing } from "./etsy.js";
import { computeMetrics } from "./metrics.js";

/**
 * Model / variant clustering.
 *
 * Generic keywords ("digital planner", "repair manual") are saturated. Real
 * opportunities live one level deeper: a specific model code, year range, trim
 * or sub-theme. This groups the scanned listings by the concrete tokens that
 * appear in their titles and ranks each cluster by sales velocity.
 */

const STOP = new Set([
  "the","and","for","with","from","your","you","our","this","that","all","any","are",
  "digital","download","instant","printable","pdf","file","files","manual","manuals",
  "guide","guides","service","repair","workshop","owners","owner","shop","etsy","new",
  "best","set","pack","bundle","template","templates","planner","design","custom","gift",
  "print","printables","editable","canva","pages","page","book","ebook","full","complete",
]);

export interface ModelCluster {
  model: string;
  listings: number;
  years: string[];
  estMonthlySales: number;
  avgPrice: number;
  /** estimated monthly sales per competing listing - higher means less crowded demand */
  salesVelocity: number;
  hot: boolean;
  topTitles: string[];
  weaknesses: string[];
}

export function extractYears(title: string): string[] {
  return Array.from(new Set(title.match(/\b(19|20)\d{2}\b/g) || []));
}

function tokens(title: string): string[] {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9\-\s]/g, " ");
  return cleaned
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        t.length <= 20 &&
        !STOP.has(t) &&
        !/^(19|20)\d{2}$/.test(t)
    );
}

/** Candidate model tokens: alphanumeric codes first, then distinctive words. */
export function extractModelTokens(title: string): string[] {
  const all = tokens(title);
  const codes = all.filter((t) => /\d/.test(t) || /^[a-z]{1,3}\d/.test(t));
  return codes.length ? codes : all.slice(0, 4);
}

function weaknessesOf(group: EtsyListing[]): string[] {
  const w: string[] = [];
  const avgTags =
    group.reduce((s, l) => s + (l.tags?.length || 0), 0) / group.length;
  if (avgTags < 13)
    w.push(`rivals use only ${avgTags.toFixed(1)} of 13 tags on average`);
  const shortTitles = group.filter((l) => l.title.length < 80).length;
  if (shortTitles / group.length > 0.4)
    w.push("most rival titles are far below the 140-character limit");
  const thin = group.filter((l) => (l.description || "").length < 500).length;
  if (thin / group.length > 0.4) w.push("thin descriptions (under 500 characters)");
  if (group.length <= 5) w.push("very few competing listings");
  return w;
}

export function clusterModels(
  listings: EtsyListing[],
  limit = 10
): ModelCluster[] {
  const groups = new Map<string, EtsyListing[]>();
  for (const l of listings) {
    for (const token of extractModelTokens(l.title)) {
      const arr = groups.get(token) || [];
      arr.push(l);
      groups.set(token, arr);
    }
  }

  const clusters: ModelCluster[] = [];
  for (const [model, group] of groups) {
    if (group.length < 2) continue;
    const metrics = group.map(computeMetrics);
    const estMonthlySales =
      Math.round(metrics.reduce((s, m) => s + m.estMonthlySales, 0) * 10) / 10;
    if (estMonthlySales <= 0) continue;
    const avgPrice =
      Math.round(
        (group.reduce((s, l) => s + (parseFloat(l.price) || 0), 0) /
          group.length) *
          100
      ) / 100;
    clusters.push({
      model,
      listings: group.length,
      years: Array.from(new Set(group.flatMap((l) => extractYears(l.title)))).sort(),
      estMonthlySales,
      avgPrice,
      salesVelocity: Math.round((estMonthlySales / group.length) * 10) / 10,
      hot: false,
      topTitles: group
        .slice()
        .sort((a, b) => b.num_favorers - a.num_favorers)
        .slice(0, 3)
        .map((l) => l.title),
      weaknesses: weaknessesOf(group),
    });
  }

  if (!clusters.length) return [];
  const velocities = clusters.map((c) => c.salesVelocity).sort((a, b) => a - b);
  const median = velocities[Math.floor(velocities.length / 2)];
  for (const c of clusters) c.hot = c.salesVelocity >= median && c.listings <= 12;

  return clusters
    .sort(
      (a, b) =>
        b.estMonthlySales * (1 + Math.min(1.5, b.salesVelocity / 5)) -
        a.estMonthlySales * (1 + Math.min(1.5, a.salesVelocity / 5))
    )
    .slice(0, limit);
}

/** Frequency + sales weighted tag ranking, used as keyword evidence. */
export function rankKeywords(listings: EtsyListing[], limit = 25) {
  const map = new Map<
    string,
    { tag: string; listings: number; estMonthlySales: number; favorites: number }
  >();
  for (const l of listings) {
    const m = computeMetrics(l);
    for (const raw of l.tags || []) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      const e =
        map.get(tag) || { tag, listings: 0, estMonthlySales: 0, favorites: 0 };
      e.listings += 1;
      e.estMonthlySales += m.estMonthlySales;
      e.favorites += l.num_favorers;
      map.set(tag, e);
    }
  }
  return Array.from(map.values())
    .filter((e) => e.listings >= 2)
    .map((e) => ({
      ...e,
      estMonthlySales: Math.round(e.estMonthlySales * 10) / 10,
    }))
    .sort(
      (a, b) =>
        b.estMonthlySales + b.favorites * 0.01 -
        (a.estMonthlySales + a.favorites * 0.01)
    )
    .slice(0, limit);
}
