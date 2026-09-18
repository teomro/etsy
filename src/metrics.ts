import type { EtsyListing } from "./etsy.js";

/**
 * Etsy's public API exposes no per-listing sales number, so demand is estimated
 * from the signals Etsy does return: favourites, views, price and listing age.
 *
 *   estimated total sales   = favourites x FAVORITES_TO_SALES
 *   estimated monthly sales = estimated total sales / months since listed
 *   estimated monthly revenue = estimated monthly sales x price
 *
 * FAVORITES_TO_SALES is calibrated against real shop sales counters; override it
 * with the ETSY_FAVORITES_TO_SALES env var if you have your own calibration.
 */
export const FAVORITES_TO_SALES = Number(
  process.env.ETSY_FAVORITES_TO_SALES || 22.08
);

export interface ListingMetrics {
  ageMonths: number;
  estTotalSales: number;
  estMonthlySales: number;
  estMonthlyRevenue: number;
  conversionSignal: number;
}

export function monthsSince(ts: number | null): number {
  if (!ts) return 12;
  const months = (Date.now() / 1000 - ts) / (60 * 60 * 24 * 30.44);
  return Math.max(1, Math.round(months * 10) / 10);
}

export function computeMetrics(l: EtsyListing): ListingMetrics {
  const ageMonths = monthsSince(l.creation_timestamp);
  const price = parseFloat(l.price) || 0;
  const estTotalSales = Math.round(l.num_favorers * FAVORITES_TO_SALES);
  const estMonthlySales = Math.round((estTotalSales / ageMonths) * 10) / 10;
  return {
    ageMonths,
    estTotalSales,
    estMonthlySales,
    estMonthlyRevenue: Math.round(estMonthlySales * price),
    conversionSignal:
      l.views > 0 ? Math.round((l.num_favorers / l.views) * 1000) / 10 : 0,
  };
}

export const ESTIMATION_NOTE =
  `Estimates: total sales = favourites x ${FAVORITES_TO_SALES}; monthly sales = total / months listed; ` +
  `revenue = monthly sales x price. Etsy publishes no per-listing sales figure, so these are directional estimates, not measured sales.`;
