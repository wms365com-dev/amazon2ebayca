# Amazon.ca <-> eBay.ca Arbitrage Analyzer

Production-quality TypeScript app for marketplace arbitrage between Amazon Canada and eBay Canada.

This rebuild moves the project beyond the original one-way FBA MVP. It now treats each scan as a direction-aware arbitrage workflow:

- `eBay.ca -> Amazon.ca`
- `Amazon.ca -> eBay.ca`

It also stores historical scan data in the database so opportunities can be rescanned, compared over time, and reviewed like a seller workflow instead of a one-time calculator.

## What It Does

The app supports this workflow:

1. Create a `Scan Profile` from scratch or from a built-in suggested template
2. Choose a source marketplace and destination marketplace
3. Search the source marketplace for listings
4. Normalize and store source listings locally
5. Attempt a destination-marketplace match
6. Estimate pricing, fees, fulfillment, prep, labeling, tax, and other costs
7. Calculate profit, ROI, margin, and break-even
8. Score risk and confidence
9. Persist snapshots so rescans build history instead of overwriting everything
10. Review and update each opportunity with workflow statuses

## Key Changes In This Rebuild

- The app is now marketplace-direction aware instead of hardcoded to `eBay -> Amazon`
- Listings are stored in a neutral `MarketplaceListing` table
- Historical listing prices are stored in `ListingSnapshot`
- Match results are stored in `ListingMatch`
- Opportunities are stored in `ArbitrageOpportunity`
- Rescan history is stored in `ArbitrageOpportunitySnapshot`
- API cache entries are stored in SQLite instead of JSON cache files
- Demo mode is now explicit instead of silently turning on when credentials are missing
- Built-in suggested search templates are included for best sellers, replenishable items, and faster-moving branded products
- Replen monitoring is built in with bulk ASIN import, target buy prices, and exact-ASIN tracking

## Stack

- Backend: Node.js + Express + TypeScript
- Database: SQLite + Prisma ORM
- Frontend: EJS server-rendered pages + minimal vanilla JS
- Validation: Zod
- Logging: pino
- Scheduling: `node-cron`
- Tests: Vitest
- Deployment target: Railway

## Project Tree

```text
.
|-- .env.example
|-- .gitignore
|-- README.md
|-- package.json
|-- railway.json
|-- tsconfig.json
|-- vitest.config.ts
|-- data
|   |-- cache
|   |   `-- .gitkeep
|   `-- fixtures
|       |-- amazon-catalog.json
|       |-- amazon-fees.json
|       |-- amazon-pricing.json
|       `-- ebay-listings.json
|-- prisma
|   |-- migrations
|   |   |-- 202604110001_init
|   |   |   `-- migration.sql
|   |   |-- 202604120001_scan_leases
|   |   |   `-- migration.sql
|   |   |-- 202604260001_marketplace_arbitrage_rebuild
|   |   |   `-- migration.sql
|   |   `-- 202604270001_replen_monitoring
|   |       `-- migration.sql
|   |-- schema.prisma
|   `-- seed.ts
|-- docs
|   `-- research
|       |-- replen-catcher-build-checklist.md
|       `-- replen-catcher-promises.md
|-- src
|   |-- app.ts
|   |-- server.ts
|   |-- config
|   |   |-- env.ts
|   |   `-- logger.ts
|   |-- controllers
|   |   |-- adminController.ts
|   |   |-- dashboardController.ts
|   |   |-- opportunityController.ts
|   |   |-- replenController.ts
|   |   |-- savedSearchController.ts
|   |   |-- settingsController.ts
|   |   `-- webhookController.ts
|   |-- db
|   |   |-- bootstrap.ts
|   |   `-- prisma.ts
|   |-- jobs
|   |   |-- runDueScans.ts
|   |   `-- scanActiveSearches.ts
|   |-- models
|   |   `-- validators.ts
|   |-- public
|   |   |-- app.js
|   |   `-- styles.css
|   |-- routes
|   |   |-- index.ts
|   |   `-- webhooks.ts
|   |-- services
|   |   |-- amazon
|   |   |   `-- amazonService.ts
|   |   |-- calculator
|   |   |   `-- profitCalculator.ts
|   |   |-- demo
|   |   |   |-- demoMode.ts
|   |   |   `-- fixtureService.ts
|   |   |-- ebay
|   |   |   |-- ebayService.ts
|   |   |   `-- notificationService.ts
|   |   |-- matching
|   |   |   |-- engine.ts
|   |   |   `-- helpers.ts
|   |   |-- risk
|   |   |   `-- riskEngine.ts
|   |   |-- scheduler
|   |   |   |-- dueScanRunner.ts
|   |   |   `-- schedulerService.ts
|   |   |-- apiLogService.ts
|   |   |-- opportunityScanner.ts
|   |   |-- opportunityService.ts
|   |   |-- replenMonitorService.ts
|   |   |-- searchTemplates.ts
|   |   `-- settingsService.ts
|   |-- types
|   |   `-- domain.ts
|   |-- utils
|   |   |-- asyncHandler.ts
|   |   |-- cache.ts
|   |   |-- csrf.ts
|   |   |-- format.ts
|   |   |-- forms.ts
|   |   |-- http.ts
|   |   |-- pagination.ts
|   |   `-- redirect.ts
|   `-- views
|       |-- admin
|       |   `-- index.ejs
|       |-- dashboard
|       |   `-- index.ejs
|       |-- opportunities
|       |   |-- detail.ejs
|       |   `-- index.ejs
|       |-- partials
|       |   |-- flash.ejs
|       |   |-- footer.ejs
|       |   |-- head.ejs
|       |   `-- header.ejs
|       |-- replens
|       |   |-- form.ejs
|       |   `-- index.ejs
|       |-- searches
|       |   |-- form.ejs
|       |   `-- index.ejs
|       |-- settings
|       |   `-- index.ejs
|       `-- error.ejs
`-- test
    |-- extractPackCount.test.ts
    |-- matchConfidence.test.ts
    |-- normalizeTitle.test.ts
    |-- profitCalculator.test.ts
    `-- riskEngine.test.ts
```

## Database Model

The app keeps arbitrage data in SQLite through Prisma.

Core tables in the rebuilt model:

- `SavedSearch`
  This now behaves as a scan profile and stores the source and destination marketplace direction.
- `MonitoredProduct`
  Stores exact Amazon ASIN monitoring records, target buy prices, and the linked internal scan profile used for replenishment tracking.
- `MarketplaceListing`
  Stores normalized source or destination listings from either marketplace.
- `ListingSnapshot`
  Stores observed listing price and shipping history over time.
- `ListingMatch`
  Stores match confidence, method, reasons, and warnings.
- `ArbitrageOpportunity`
  Stores the current derived opportunity record used by the UI.
- `ArbitrageOpportunitySnapshot`
  Stores rescans and pricing history for each opportunity.
- `ArbitrageOpportunityStatusHistory`
  Stores workflow changes like `NEW`, `WATCH`, `BUY`, `REJECT`, and `REVIEW`.
- `ApiCacheEntry`
  Stores connector response cache entries in the database.
- Legacy tables
  Older one-way MVP tables remain present for compatibility during the transition.

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Copy the environment template

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client and apply migrations

```bash
npx prisma generate
npx prisma migrate deploy
```

4. Seed starter data

```bash
npm run db:seed
```

5. Start the app

```bash
npm run dev
```

6. Open

```text
http://localhost:3000
```

## Environment Variables

The app ships with `.env.example` containing:

```env
PORT=3000
DATABASE_URL="file:./dev.db"
NODE_ENV=development
INTERNAL_SCHEDULER_ENABLED=true
SCAN_LOCK_TIMEOUT_MINUTES=45
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_ENVIRONMENT=production
EBAY_NOTIFICATION_VERIFICATION_TOKEN=
AMAZON_SPAPI_CLIENT_ID=
AMAZON_SPAPI_CLIENT_SECRET=
AMAZON_SPAPI_REFRESH_TOKEN=
AMAZON_SPAPI_AWS_ACCESS_KEY_ID=
AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY=
AMAZON_SPAPI_AWS_REGION=us-east-1
AMAZON_MARKETPLACE_ID=A2EUQ1WTGCTBG2
APP_BASE_URL=http://localhost:3000
DEMO_MODE=true
```

Notes:

- `AMAZON_MARKETPLACE_ID` defaults to Amazon Canada: `A2EUQ1WTGCTBG2`
- `INTERNAL_SCHEDULER_ENABLED=true` keeps scheduled scans inside the web process
- `SCAN_LOCK_TIMEOUT_MINUTES` controls scan lease expiry
- secrets stay in environment variables, not in the settings table

## Demo Mode

Demo mode is now explicit.

It is active when either of these are true:

- `DEMO_MODE=true`
- the settings page has `Force explicit demo mode` enabled

When demo mode is active:

- the header shows a `Demo Mode` badge
- seeded sample profiles are available
- scans use fixtures from `data/fixtures`
- the UI still persists scans, snapshots, notes, and statuses to the database

Important:

- missing eBay or Amazon credentials no longer silently enable demo mode
- if a connector is required for a scan profile and its credentials are missing, the scan fails with a clear error

## How Scanning Works

Each scan profile has:

- source marketplace
- destination marketplace
- keywords
- optional brand/category/price filters
- profitability thresholds
- scan frequency

At scan time the app:

1. fetches source marketplace listings
2. stores or updates `MarketplaceListing`
3. writes a `ListingSnapshot`
4. attempts a destination match
5. calculates fees and profit
6. scores confidence and risk
7. updates or creates `ArbitrageOpportunity`
8. writes an `ArbitrageOpportunitySnapshot`

Supported directions today:

- `eBay.ca -> Amazon.ca`
- `Amazon.ca -> eBay.ca`

Current destination estimation behavior:

- `eBay -> Amazon` uses Amazon catalog, pricing, and fee estimates
- `Amazon -> eBay` uses active eBay listing comps and configurable eBay fee assumptions

## Suggested Search Templates

The app ships with built-in suggested scan-profile templates to help you start faster.

Current templates include examples such as:

- Nintendo controller flips
- Brother toner replenishment
- Sealed LEGO set scans
- Logitech office gear
- KitchenAid attachment flips
- YETI drinkware checks

These templates are curated starting points, not guaranteed winners. They are meant to mirror the manual sourcing patterns sellers often use:

- best-selling branded accessories
- replenishable consumables
- giftable lifestyle products
- products with cleaner brand/model matching

The app also seeds a small starter set of these templates on first boot if no scan profiles exist yet.

## Replen Monitor

The app now includes a dedicated replenishment workflow.

You can:

- paste one or more ASINs into the `Replens` page
- create exact-ASIN monitored items
- set a target buy price
- tune max shipping, minimum ROI, minimum profit, and scan frequency
- pause or resume a monitored ASIN
- run a manual scan for a monitored ASIN
- review the best profitable hit found for that ASIN

Under the hood, each monitored replen item owns a linked internal scan profile so it can reuse the same history, scheduler, and opportunity engine already used elsewhere in the app.

This is the first step toward a Replen Catcher style workflow:

- bulk ASIN import
- exact item monitoring
- persistent opportunity history
- replenishment-first sourcing

## Data Persistence

This rebuild is designed to keep history in the database.

Persisted records include:

- scan profiles
- monitored replen items
- source and destination listings
- listing snapshots
- match evidence
- opportunity records
- opportunity snapshots
- opportunity status history
- scan jobs
- API logs
- connector cache entries

This means rescans add history instead of only replacing a single current value.

## Railway Deployment

### Recommended MVP Deployment

For the current SQLite-based MVP, the simplest production setup is:

1. Create one Railway web service from this repository
2. Attach one persistent volume to that service
3. Mount it at `/data`
4. Set:

```env
NODE_ENV=production
DATABASE_URL=file:/data/railway.db
APP_BASE_URL=https://your-app.up.railway.app
AMAZON_MARKETPLACE_ID=A2EUQ1WTGCTBG2
EBAY_ENVIRONMENT=production
AMAZON_SPAPI_AWS_REGION=us-east-1
INTERNAL_SCHEDULER_ENABLED=true
SCAN_LOCK_TIMEOUT_MINUTES=45
DEMO_MODE=true
```

Then deploy.

### Railway Start Command

The production start command is:

```bash
prisma migrate deploy && node dist/src/server.js
```

The repo already exposes that through:

```bash
npm run railway:start
```

### Background Scanning On Railway

For the SQLite MVP, keep background scanning inside the main service:

```env
INTERNAL_SCHEDULER_ENABLED=true
```

That keeps the scheduler and the SQLite file in the same service and volume.

The repo also includes a one-shot due-scan runner:

```bash
npm run scan:due
npm run scan:due:build
npm run railway:scan-due
```

Use that runner when:

- you are running scans manually
- you are moving to a shared database such as Postgres
- you later split scanning into a dedicated scheduled service

For a separate Railway cron service, a shared database is the safer next step than trying to coordinate multiple services around one local SQLite file.

### Add Live Credentials Later

Once the UI is deployed, add:

```env
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_NOTIFICATION_VERIFICATION_TOKEN=...
AMAZON_SPAPI_CLIENT_ID=...
AMAZON_SPAPI_CLIENT_SECRET=...
AMAZON_SPAPI_REFRESH_TOKEN=...
AMAZON_SPAPI_AWS_ACCESS_KEY_ID=...
AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY=...
AMAZON_SPAPI_AWS_REGION=us-east-1
DEMO_MODE=false
```

## eBay Credentials

To enable live eBay Canada search:

1. Create an app at [developer.ebay.com](https://developer.ebay.com/)
2. Use the production keyset
3. Set:
   - `EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET`
   - `EBAY_ENVIRONMENT=production`

The app uses official eBay APIs only.

### eBay Account Deletion Notification

Production eBay apps may require a deletion notification endpoint. This app exposes:

```text
https://your-app.up.railway.app/webhooks/ebay/account-deletion
```

Set the same verification token in both places:

```env
EBAY_NOTIFICATION_VERIFICATION_TOKEN=your_32_to_80_character_token
```

## Amazon SP-API Credentials

To enable live Amazon.ca destination matching and pricing:

1. Create or use an Amazon SP-API application
2. Obtain:
   - `AMAZON_SPAPI_CLIENT_ID`
   - `AMAZON_SPAPI_CLIENT_SECRET`
   - `AMAZON_SPAPI_REFRESH_TOKEN`
3. Create AWS signing credentials:
   - `AMAZON_SPAPI_AWS_ACCESS_KEY_ID`
   - `AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY`
   - `AMAZON_SPAPI_AWS_REGION`
4. Keep:

```env
AMAZON_MARKETPLACE_ID=A2EUQ1WTGCTBG2
```

Live Amazon usage in this build includes:

- catalog search by identifier
- keyword fallback search
- pricing lookup
- fee estimate lookup
- Amazon source listing generation for `Amazon -> eBay` profiles

## Testing

Run all tests:

```bash
npm test
```

Current unit coverage includes:

- title normalization
- pack count extraction
- match confidence scoring
- profit calculation
- risk scoring

## Helpful Commands

```bash
npm run dev
npm run build
npm start
npm run db:seed
npm test
npx prisma generate
npx prisma migrate deploy
```

Optional scan commands:

```bash
npm run scan:due
npm run scan:due:build
npm run railway:scan-due
```

## Assumptions

- Single-user MVP
- Canada marketplaces only
- Amazon remains defaulted to `A2EUQ1WTGCTBG2`
- `Amazon -> eBay` currently uses active listing comps, not confirmed sold comps
- eBay fee assumptions for `Amazon -> eBay` are configurable in settings
- Legacy one-way tables remain in the schema during the transition
- Suggested templates are curated heuristics, not live best-seller rankings from a marketplace API

## Known Limitations

- No purchase automation
- No shipment creation
- No marketplace-wide sold-comps ingestion yet
- No browser automation or scraping
- No multi-user auth
- eBay sold-history data is not broadly available through this MVP
- `Amazon -> eBay` pricing confidence is lower than `eBay -> Amazon` because it relies on active comps rather than official sold-history access
- SQLite is correct for the MVP, but Postgres is the next step for multi-service workers and heavier analytics
