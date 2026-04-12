# eBay Canada to Amazon.ca FBA Analyzer

Production-ready MVP for sourcing profitable products from eBay Canada and evaluating whether they can be resold on Amazon.ca via FBA.

The app is built for speed and reliability first:

- Backend: Node.js, Express, TypeScript
- Database: SQLite + Prisma
- Frontend: EJS server-rendered pages + minimal vanilla JS
- Scheduling: `node-cron` plus a Railway-friendly one-shot scan runner
- Validation: Zod
- Logging: pino
- Testing: Vitest
- Deployment target: Railway

## What It Does

The MVP supports this workflow:

1. Create a saved eBay Canada search profile.
2. Run a scan manually or let scheduled scans run automatically.
3. Normalize eBay listing data.
4. Attempt to match each listing to an Amazon.ca ASIN.
5. Pull price and fee signals.
6. Estimate inbound, prep, label, and optional sales tax costs.
7. Calculate total landed cost, net profit, margin, ROI, and break-even.
8. Score risk and match confidence.
9. Review opportunities in a sortable/filterable table.
10. Mark opportunities as `NEW`, `WATCH`, `BUY`, `REJECT`, or `REVIEW`.

If live credentials are missing, the app automatically falls back to demo fixtures so you can preview the UI and full workflow without blocking on setup.

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
|   |   `-- 202604120001_scan_leases
|   |       `-- migration.sql
|   |-- schema.prisma
|   `-- seed.ts
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

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Initialize the SQLite database and Prisma client:

```bash
npx prisma generate
npx prisma migrate deploy
```

4. Start the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

### Optional Production-Style Local Run

```bash
npm run build
npm start
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
- `INTERNAL_SCHEDULER_ENABLED=true` keeps the original in-process scheduler active
- `SCAN_LOCK_TIMEOUT_MINUTES` controls how long a saved search stays leased before another worker can safely take over
- `DEMO_MODE=true` forces fixtures even if credentials exist
- UI-editable operational settings are stored in SQLite, but secrets remain environment-only

## Demo Mode

Demo mode is active when any of these are true:

- `DEMO_MODE=true`
- eBay credentials are missing
- Amazon SP-API credentials are missing
- the in-app settings page has `Force demo mode` enabled

When demo mode is active:

- the header shows a `Demo Mode` badge
- a default saved search is auto-seeded on first boot
- scans use JSON fixtures from `data/fixtures`
- the full UI still works, including scanning, opportunity scoring, notes, and status changes

This lets you validate the product flow without live API access.

## Data Storage on Railway

The app already stores listings and scan results locally through Prisma + SQLite.

With a Railway volume mounted at `/data` and:

```env
DATABASE_URL=file:/data/railway.db
```

the following records persist across deploys and restarts:

- saved searches
- eBay listings
- Amazon matches
- opportunities
- status history
- scan jobs
- API logs
- app settings

For this MVP, volume-backed SQLite is enough. If you later need multi-user scale or stronger reporting workflows, Railway Postgres is the natural next step.

## Railway Deployment

### Web Service

1. Create a new Railway project from this repository.
2. Add a persistent volume and mount it to `/data`.
3. Set these variables on the web service:

```env
NODE_ENV=production
DATABASE_URL=file:/data/railway.db
APP_BASE_URL=https://your-app.up.railway.app
AMAZON_MARKETPLACE_ID=A2EUQ1WTGCTBG2
DEMO_MODE=true
EBAY_ENVIRONMENT=production
AMAZON_SPAPI_AWS_REGION=us-east-1
INTERNAL_SCHEDULER_ENABLED=false
SCAN_LOCK_TIMEOUT_MINUTES=45
```

Add live credentials when ready:

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
```

4. Railway uses `railway.json`:

- build command: `npm install && npm run build`
- start command: `npm run railway:start`

5. `npm run railway:start` runs:

```bash
prisma migrate deploy && node dist/src/server.js
```

That ensures the bundled migrations are applied before the app starts.

### Reliable Background Scanning on Railway

The app now includes a one-shot due-scan worker designed for Railway Cron or a dedicated worker service.

Commands:

```bash
npm run scan:due
npm run scan:due:build
npm run railway:scan-due
```

The production worker command is:

```bash
prisma migrate deploy && node dist/src/jobs/runDueScans.js
```

Recommended Railway pattern:

1. Keep the main web service running with `INTERNAL_SCHEDULER_ENABLED=false`.
2. Create a second scheduled Railway service or cron job from the same repo.
3. Give it the same environment variables and the same mounted `/data` volume path.
4. Set its start or cron command to `npm run railway:scan-due`.
5. Choose the schedule you want, such as every 5 or 15 minutes.

Why this is safer:

- scans are persisted in SQLite on the Railway volume
- a database-backed scan lease prevents overlapping runs across multiple Railway processes
- the worker exits after each sweep, which is a better fit for scheduled execution than relying only on an always-on web process

### Fast Preview Option

If you only want to preview the UI on Railway first, set:

```env
DEMO_MODE=true
```

and omit all API credentials.

## eBay Credentials

To enable live eBay Canada Browse API searches:

1. Create an account at [developer.ebay.com](https://developer.ebay.com/).
2. Create an application and obtain:
   - `EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET`
3. Use `production` keys for real marketplace searches.
4. Set:
   - `EBAY_ENVIRONMENT=production`

The app uses the official Buy Browse API with Canada-focused assumptions:

- `X-EBAY-C-MARKETPLACE-ID: EBAY_CA`
- Canada location filtering
- fixed-price bias by default

### eBay Marketplace Account Deletion Notification

eBay production apps may require a deletion notification endpoint. This app exposes:

```text
https://your-app.up.railway.app/webhooks/ebay/account-deletion
```

Use the same value for Railway and eBay:

```env
EBAY_NOTIFICATION_VERIFICATION_TOKEN=your_32_to_80_character_token
```

## Amazon SP-API Credentials

To enable live Amazon.ca matching, pricing, and fee estimates:

1. Enroll as an Amazon SP-API developer.
2. Create or use an SP-API application.
3. Obtain:
   - `AMAZON_SPAPI_CLIENT_ID`
   - `AMAZON_SPAPI_CLIENT_SECRET`
   - `AMAZON_SPAPI_REFRESH_TOKEN`
4. Create AWS IAM credentials for signing:
   - `AMAZON_SPAPI_AWS_ACCESS_KEY_ID`
   - `AMAZON_SPAPI_AWS_SECRET_ACCESS_KEY`
   - `AMAZON_SPAPI_AWS_REGION`
5. Keep `AMAZON_MARKETPLACE_ID=A2EUQ1WTGCTBG2` unless you intentionally target a different marketplace.

The current live integration path is:

- Catalog search by identifier
- Catalog search by keywords fallback
- Product pricing lookup
- FBA fee estimate lookup

## Validation and Safety Notes

- Forms use Zod validation before persistence.
- Hidden CSRF token fields are used for POST forms.
- Inputs are sanitized before being written.
- Outbound API requests use timeouts, retry/backoff, and file caching.
- Failures are logged to `ApiLog` and surfaced in the UI instead of crashing the entire scan.
- Background scans use a database-backed lease so the same saved search is not processed twice at the same time.

## Testing

Included unit tests cover:

- title normalization
- pack count extraction
- match confidence scoring
- profit calculation
- risk scoring

Run:

```bash
npm test
```

## Reasonable MVP Assumptions

These were intentionally chosen to keep the app stable and deployable:

- Single-user MVP with a `User` model already in place for future auth expansion
- Sales tax, when enabled, is folded into `otherCostEstimate`
- Saved-search background scanning can run either in-process or from a dedicated Railway worker
- Secrets are environment-only and displayed as status, not editable values, in the settings UI
- Demo fixtures are intentionally small and curated rather than trying to simulate the full live marketplaces
- Amazon price estimation prefers featured/landed offer price when present

## Known Limitations

- No Amazon shipment creation yet
- No purchasing automation
- No scraping or browser automation
- No image similarity matching yet, only a placeholder risk flag
- Restriction/gating checks are rule-based placeholders, not full account-level eligibility checks
- Duplicate suppression is basic and keyed primarily by saved search + eBay listing
- SQLite on Railway requires a mounted volume
- Live Amazon SP-API responses vary by catalog shape, so some edge-case catalog attributes may need extra normalization later

## Helpful Commands

```bash
npm run dev
npm run build
npm start
npm run scan:due
npm run scan:due:build
npm run railway:scan-due
npm test
npm run db:seed
npx prisma generate
npx prisma migrate deploy
```
