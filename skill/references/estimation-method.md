# How the estimates are calculated

Etsy's public API exposes no per-listing sales number. Demand is derived from
public signals returned by the API.

```
estimated total sales     = favourites × 22.08
estimated monthly sales   = estimated total sales ÷ months since the listing was created
estimated monthly revenue = estimated monthly sales × price
sales velocity            = cluster estimated monthly sales ÷ competing listings in the cluster
```

- `22.08` is a calibration constant measured against a real shop's lifetime sales
  counter. It can be overridden with the `ETSY_FAVORITES_TO_SALES` env var.
- A cluster is marked `hot` when its sales velocity is at or above the median of
  the scan and it has 12 or fewer competing listings.
- Conversion signal = favourites per 1,000 views, where Etsy returns view counts.

Always present these as directional estimates, never as measured sales.
