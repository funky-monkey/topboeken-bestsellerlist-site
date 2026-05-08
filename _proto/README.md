# TopBoeken — UI Prototypes

Static HTML mockups created during the design phase. Open any file directly in a browser — no server needed.

## Files

| File | Description |
|---|---|
| `layout.html` | First layout exploration — sidebar + grid (Option A), filter pills + list (Option B), Netflix-style rows (Option C) |
| `layout-combo.html` | First combo: genre pills + per-source horizontal rows |
| `layout-combo-v2.html` | Combo with full 1400px centered layout and book thumbnails |
| `layout-v3.html` | White theme, Libre Baskerville + Helvetica Neue typography, #1 book double-size |
| `layout-v4.html` | Added hover interaction (frosted glass panel slides up on cover hover) |
| `layout-v5.html` | Square corners, tighter 3px gap between covers, real cover image layout |
| `layout-v6.html` | **Real book covers** from Open Library API, white theme, full hover interaction |
| `layout-v7.html` | Detail page with larger cover column (460px) — **closest to final design** |
| `detail-page.html` | Early detail page exploration (dark theme, before final direction) |

## Final approved design

`layout-v7.html` — scroll down to the detail page section. This file shows both:
- The homepage with genre pills + per-source rows + hover interaction
- The book detail page with large cover, mixed typography, buy buttons

## Design decisions captured here

- Typography: Libre Baskerville (serif) for article words, Helvetica Neue bold for brand names
- Book cards: sharp corners (no border-radius), 3px gap, full-bleed portrait covers
- Hover: cover blurs + frosted glass panel slides up with title/author/stars
- #1 book in each row is double-size (spans 2 grid rows)
- Last card in each row = "Meer bekijken" navigation button
- Detail page: 460px cover column left, info right, buy buttons with `rel="nofollow sponsored"`
