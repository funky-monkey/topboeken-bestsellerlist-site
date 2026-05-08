# TopBoeken — Design Spec
**Date:** 2026-05-08  
**Status:** Approved  
**UI Prototypes:** [`_proto/`](../../../_proto/README.md) — open any `.html` file directly in a browser to preview the design iterations. Start with `layout-v7.html` for the final approved direction.

---

## Overview

A Dutch-language book bestseller aggregation site that pulls from both Dutch and international bestseller sources, presents them in a clean visual interface, and monetises through affiliate links to bol.com, Amazon, and future Dutch partners.

**Domain:** topboeken.nl (working title)  
**Language:** Dutch (nl-NL)  
**Contact email for APIs:** sidney@funky-monkey.nl

---

## 1. Architecture

### Stack
- **Frontend:** Astro (static site generation)
- **Backend/CMS:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Deployment:** Own Linux VPS, Nginx, PM2
- **CI/CD:** GitHub Actions on push to `main`

### System layout

```
VPS
├── Nginx
│   ├── /           → serves /dist (Astro static build)
│   ├── /admin      → proxies to Express (port 3001)
│   └── /api        → proxies to Express (port 3001)
├── Express API (PM2)
│   ├── /admin/*    → CMS admin panel
│   └── /api/*      → internal endpoints (rebuild trigger, etc.)
├── SQLite
│   └── data/topboeken.sqlite
└── Cron (03:00 daily)
    └── scrape → update DB → astro build → atomic swap dist-next → dist
```

### Deployment flow (GitHub Actions)
Push to `main` → SSH into VPS → `git pull` → `npm ci` → `astro build` → `pm2 restart api` → `nginx reload`

### Build flow (nightly cron)
`scrape.sh` → scrape all sources → enrich via APIs → update SQLite → `astro build` into `dist-next/` → atomic swap to `dist/`

The atomic swap ensures the site never shows a broken or mid-build state.

### Directory layout on VPS
```
/home/deploy/topboeken/
  src/           ← Astro + Express source
  dist/          ← current live Astro build (served by Nginx)
  dist-next/     ← new build in progress
  data/          ← topboeken.sqlite
  covers/        ← downloaded book cover images (served by Nginx)
  scripts/       ← scrape.sh, build.sh
  logs/          ← scrape logs per run
```

---

## 2. Data Model

### Tables

```sql
sources
  id            INTEGER PRIMARY KEY
  name          TEXT            -- "Besteller 60", "NY Times", "bol.com"
  slug          TEXT UNIQUE     -- "besteller-60", "ny-times"
  country       TEXT            -- "NL", "US"
  accent_color  TEXT            -- "#3b82f6" (used in UI)
  url           TEXT            -- source homepage
  active        INTEGER DEFAULT 1
  scrape_config TEXT            -- JSON: method, endpoint, selectors

genres
  id            INTEGER PRIMARY KEY
  name_nl       TEXT            -- "Fictie", "Thriller", "Fantasy"
  slug          TEXT UNIQUE     -- "fictie", "thriller", "fantasy"

books
  id            INTEGER PRIMARY KEY
  isbn          TEXT UNIQUE     -- ISBN-13, primary key for dedup
  title         TEXT
  author        TEXT
  publisher     TEXT
  pages         INTEGER
  language      TEXT            -- "nl", "en"
  summary       TEXT
  cover_path    TEXT            -- local path: covers/{isbn}.jpg
  goodreads_rating  REAL
  goodreads_count   INTEGER
  slug          TEXT UNIQUE     -- generated from ISBN, never changes
  created_at    TEXT
  updated_at    TEXT

book_genres
  book_id       INTEGER REFERENCES books(id)
  genre_id      INTEGER REFERENCES genres(id)
  PRIMARY KEY (book_id, genre_id)

list_entries
  id            INTEGER PRIMARY KEY
  book_id       INTEGER REFERENCES books(id)
  source_id     INTEGER REFERENCES sources(id)
  genre_id      INTEGER REFERENCES genres(id)
  rank          INTEGER
  list_name     TEXT            -- "Hardcover Fiction", "Fictie", etc.
  week_date     TEXT            -- ISO date of the list week
  scraped_at    TEXT

affiliates
  id            INTEGER PRIMARY KEY
  name          TEXT            -- "bol.com", "Amazon NL", "Managementboek"
  slug          TEXT UNIQUE
  logo_url      TEXT
  country       TEXT            -- "NL", "BE"
  active        INTEGER DEFAULT 1

book_affiliates
  id            INTEGER PRIMARY KEY
  book_id       INTEGER REFERENCES books(id)
  affiliate_id  INTEGER REFERENCES affiliates(id)
  url           TEXT            -- affiliate link (stub or real)
  price         REAL
  currency      TEXT DEFAULT 'EUR'
  updated_at    TEXT

scrape_log
  id            INTEGER PRIMARY KEY
  source_id     INTEGER REFERENCES sources(id)
  started_at    TEXT
  finished_at   TEXT
  books_added   INTEGER
  books_updated INTEGER
  status        TEXT            -- "ok", "error", "partial"
  error_msg     TEXT
```

### Key design decisions
- **Dedup by ISBN:** one `books` row per unique book. The same book on 5 lists = 1 book row + 5 `list_entries`. This powers the "staat op deze lijsten" detail page section.
- **Slug based on ISBN:** stable URL even if title is corrected later.
- **Covers stored locally:** downloaded once at scrape time, served from VPS. Never hotlinked from Open Library or Google Books.
- **Affiliate links are extensible:** adding a new Dutch partner = 1 new `affiliates` row. Detail page renders buy buttons dynamically from `book_affiliates`, NL partners first.
- **Week history kept:** `list_entries` retains all historical rankings, enabling future "weeks on list" or trending features.

---

## 3. Sources & Data Pipeline

### Sources

| Source | Method | Notes |
|---|---|---|
| NY Times | **Official API** (free key) | `/lists/{list}.json` — clean JSON |
| Wikipedia | **Wikipedia REST API** | All-time bestsellers table |
| Open Library | **API** | Book metadata + covers by ISBN |
| Google Books | **API** | ISBN lookup, summaries, covers (fallback) |
| bol.com | **Affiliate API** (needs account) | Product feed; scrape fallback until account active |
| Publishers Weekly | **RSS feed** + parse linked article | Weekly bestseller articles |
| Besteller 60 (CPNB) | Scrape — Cheerio | Simple HTML table, no API available |
| Goodreads | Scrape — Cheerio | API shut down 2020 |
| Amazon NL | Scrape — Playwright | JS-rendered, needs headless browser |
| Barnes & Noble | Scrape — Cheerio | Low priority; mirrors NY Times |

### Scraper pipeline (per nightly run)

```
For each active source:
  1. Fetch list data → [{ title, author, rank, category, list_name }]
  2. For each book not already in DB by ISBN:
     a. Google Books API → ISBN-13, publisher, pages, language, summary, cover URL
     b. Open Library API → cover image (download to covers/{isbn}.jpg)
        Rate limit: max 3 req/sec, User-Agent: TopBoeken/1.0 (sidney@funky-monkey.nl)
        Only request if ISBN not already cached in DB
     c. Goodreads rating via scrape (if not cached)
  3. Upsert books, book_genres, list_entries, book_affiliates (stubs)
  4. Write scrape_log entry
  5. On completion: astro build → atomic dist swap
```

### Open Library API rules (must follow)
- `User-Agent: TopBoeken/1.0 (sidney@funky-monkey.nl)` on every request
- Max 3 req/sec (identified), 1 req/sec (unidentified)
- Never re-request an ISBN already cached in SQLite
- Use API endpoints only — no HTML scraping of openlibrary.org
- Download cover images locally — do not hotlink to their CDN in production

### Genre taxonomy (14 genres, all Dutch labels)

| Slug | Label |
|---|---|
| fictie | Fictie |
| non-fictie | Non-fictie |
| thriller | Thriller |
| fantasy | Fantasy |
| science-fiction | Science Fiction |
| romance | Romance |
| biografie | Biografie |
| kinderen | Kinderen |
| young-adult | Young Adult |
| horror | Horror |
| zelfhulp | Zelfhulp |
| kookboeken | Kookboeken |
| business | Business |
| comics | Comics |

---

## 4. Frontend Design

### Typography
- **Serif (surrounding/article words):** Libre Baskerville (Google Fonts), weight 400
- **Sans-serif (brand names, UI, meta):** Helvetica Neue / Helvetica / Arial, weight 700
- **Pattern:** headers mix both — first word(s) in serif, key name in sans-serif bold
  - Example: `De <span class="sans">Besteller 60</span>`
  - Example: `De <span class="sans">TopBoeken</span> Lijst`

### Colour
- Page background: `#f5f4f1` (warm off-white)
- Cards/surfaces: `#ffffff`
- Text: `#232323`
- Each source has an accent colour stored in `sources.accent_color`

### URL structure
```
/                          → homepage
/genre/[slug]              → e.g. /genre/thriller
/lijsten/[source-slug]     → e.g. /lijsten/ny-times
/boeken/[book-slug]        → detail page (slug = isbn-based)
/zoeken                    → search results
/admin                     → CMS (not indexed)
```

### Homepage
- Nav inside the 1400px site wrap (logo aligns with content)
- 14 genre filter pills — clicking filters all source rows simultaneously
- One row per source: source name (mixed serif/sans) + accent bar + country flag badge + "Bekijk alle →" link
- Each row: **#1 book double-size** (spans 2 rows) + 10 smaller books + "Meer bekijken" next button
- Book cards: sharp corners (no border-radius), 3px gap between covers
- Covers: full-bleed portrait image (7:10 ratio), no text underneath
- Hover: cover blurs slightly, frosted glass panel (`backdrop-filter: blur`) slides up from bottom with title, author, stars; rank badge fades out

### Detail page
- Left column (460px): large cover in a warm grey panel, prominent drop shadow, spine effect
- Right column: list tags (which lists + rank), title (mixed typography), author, star rating + count, meta strip (genre, publisher, pages, ISBN, language), summary, buy buttons
- Buy buttons: NL affiliates first (bol.com in blue `#0000a4`), Amazon in amber (`#ff9900`)
- All affiliate links: `rel="nofollow sponsored" target="_blank"`
- Bottom strip: "Staat op deze lijsten" — badges per list with rank

### Book card hover (all pages)
```css
.book-card:hover .book-cover-fill { filter: blur(2px) brightness(0.85); }
.book-card:hover .book-hover-panel { transform: translateY(0); }
.book-hover-panel {
  backdrop-filter: blur(14px) saturate(1.5);
  background: rgba(8, 8, 8, 0.52);
  transition: transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

---

## 5. SEO

### Per book detail page
```html
<html lang="nl">
<title>{title} – {author} | TopBoeken</title>
<meta name="description" content="{title} staat op {n} bestsellerlijsten. {summary_excerpt}">
<link rel="canonical" href="https://topboeken.nl/boeken/{slug}">
<meta property="og:title" content="{title} – {author}">
<meta property="og:description" content="{summary_excerpt}">
<meta property="og:image" content="https://topboeken.nl/covers/{isbn}.jpg">
<meta property="og:type" content="book">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="TopBoeken">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title} – {author}">
<meta name="twitter:image" content="https://topboeken.nl/covers/{isbn}.jpg">
<link rel="preload" as="image" href="https://topboeken.nl/covers/{isbn}.jpg" fetchpriority="high">
```

### JSON-LD per book
```json
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "{title}",
  "author": { "@type": "Person", "name": "{author}" },
  "isbn": "{isbn}",
  "numberOfPages": {pages},
  "publisher": "{publisher}",
  "inLanguage": "{language}",
  "image": "https://topboeken.nl/covers/{isbn}.jpg",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "{rating}",
    "reviewCount": "{count}"
  }
}
```

### JSON-LD per list/category page
```json
{
  "@type": "ItemList",
  "name": "{source} – {list_name} – Week {week}",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "url": "/boeken/{slug}" }
  ]
}
```

### JSON-LD site-wide (homepage)
```json
[
  {
    "@type": "WebSite",
    "url": "https://topboeken.nl",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://topboeken.nl/zoeken?q={search_term_string}"
    }
  },
  {
    "@type": "Organization",
    "name": "TopBoeken",
    "url": "https://topboeken.nl"
  }
]
```

### BreadcrumbList (detail page)
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "{genre}", "item": "/genre/{slug}" },
    { "@type": "ListItem", "position": 3, "name": "{title}" }
  ]
}
```

### Technical SEO
- `sitemap.xml` auto-generated by Astro on every build; `<lastmod>` = `books.updated_at`
- `robots.txt`: allow all, disallow `/admin`
- All images: explicit `width` + `height` attributes (prevents CLS)
- Hero cover image: `loading="eager"` + `fetchpriority="high"` preload
- All other covers: `loading="lazy"`
- Cover `alt`: `"Boekomslag van {title} door {author}"`
- All affiliate outbound links: `rel="nofollow sponsored" target="_blank"`
- Submit `sitemap.xml` to Google Search Console after launch

---

## 6. Simple CMS (Admin Panel)

**Auth:** single admin user, bcrypt password hash in SQLite, 24h session cookie.

**Routes:**
```
/admin                  → dashboard: book count, source status, last scrape results
/admin/scrape           → trigger manual scrape per source
/admin/books            → searchable book list
/admin/books/[id]       → edit title, summary, cover, genres
/admin/affiliates       → add/edit affiliate partners
/admin/sources          → enable/disable sources
/admin/logs             → scrape history + errors
```

**"Publiceer nu" button:** calls `astro build` server-side and swaps Nginx root — publishes fixes immediately without waiting for nightly cron.

---

## 7. Affiliate Links

**Initial stubs (before affiliate accounts are active):**
```
bol.com:   https://www.bol.com/nl/s/?searchtext={isbn}
Amazon NL: https://www.amazon.nl/s?k={isbn}
```

**After affiliate accounts are active:** replace stub URLs with proper partner URLs including affiliate tag. The `book_affiliates` table holds one row per book per partner — swapping to real URLs is a database update, no code change needed.

**Adding future Dutch affiliates** (Managementboek, Bruna, Kobo NL, etc.):
1. Add row to `affiliates` table
2. Wire scraper to populate `book_affiliates` for that partner
3. Detail page renders the new buy button automatically

---

## 8. Deployment Checklist (pre-launch)

- [ ] Register domain (topboeken.nl)
- [ ] Provision VPS, install Node.js, Nginx, PM2
- [ ] Set up GitHub Actions deploy key
- [ ] Get NY Times Books API key (free at developer.nytimes.com)
- [ ] Get Google Books API key (free at console.cloud.google.com)
- [ ] Set up bol.com affiliate account → get affiliate API credentials
- [ ] Set up Amazon Associates NL account
- [ ] Set up Google Search Console, submit sitemap
- [ ] Configure Nginx with SSL (Let's Encrypt)
- [ ] Set admin password (bcrypt hash) in environment variable
