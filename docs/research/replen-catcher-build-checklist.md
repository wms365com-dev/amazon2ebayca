# Replen Catcher Style Build Checklist

Based on:

- [Replen Catcher public feature promises](./replen-catcher-promises.md)
- Current state of this app as of April 29, 2026

This checklist translates the public Replen Catcher benchmark into a practical build order for our product.

## Product Goal

Move from a general marketplace arbitrage analyzer into a seller workflow tool with three clear modes:

1. Discovery
2. Replens monitoring
3. Action queue

In product terms:

- `Suggested searches` become discovery
- `Replens` become exact-item monitoring
- `Opportunities` become the action queue for sourcing decisions

## What We Already Have

These capabilities are already present or partially present in the current codebase:

- marketplace-neutral arbitrage data model
- eBay.ca to Amazon.ca scan flow
- Amazon.ca to eBay.ca scan flow
- database-backed listing and opportunity history
- scheduled rescans
- risk scoring and confidence scoring
- saved scan profiles
- suggested starter searches

These are strong foundations. The remaining work is mostly product workflow, precision, and monitoring UX.

## Priority 1: Core Replens Monitoring

This is the highest-value next milestone.

### Must Have

- bulk ASIN import
- monitored replens list page
- exact ASIN monitoring workflow
- target buy price per monitored item
- per-item thresholds:
  - min ROI
  - min profit
  - max shipping
- per-item active / paused status
- per-item scan frequency
- manual scan now action
- view opportunities filtered to one monitored ASIN

### Why It Matters

This is the closest feature set to the core Replen Catcher value proposition.

Without this, the app is still mainly a scanner.
With this, it becomes a monitoring system.

### Acceptance Criteria

- user can paste ASINs in bulk
- app stores those items in the database
- each monitored item can generate eBay-to-Amazon opportunities
- user can set a target buy price
- user can pause, resume, edit, and rescan a monitored item

## Priority 2: Hit Queue And Alerts

Once monitored replens exist, the next step is surfacing the best hits automatically.

### Must Have

- dedicated `Replen Hits` or filtered opportunity view
- alert status like:
  - new hit
  - still profitable
  - below target
  - stale
- notification triggers when:
  - net profit exceeds threshold
  - ROI exceeds threshold
  - price falls below target buy price
- email alert or digest mode
- dashboard widget for fresh replen hits

### Why It Matters

Monitoring without alerting still requires manual checking.
This phase turns stored data into action.

### Acceptance Criteria

- new profitable replen hits are easy to spot
- user can see only fresh opportunities
- app can notify when an item crosses a configured threshold

## Priority 3: Match Quality And Correction Workflow

This is where the tool becomes more trustworthy at scale.

### Must Have

- mismatch review queue
- approve / reject / correct a bad Amazon-eBay match
- pack-count mismatch handling
- variant mismatch handling
- manual destination override
- remembered corrections for future scans

### Why It Matters

Replen Catcher strongly markets mismatch fixing.
If we want users to trust the system, we need an explicit correction workflow instead of only hidden confidence scores.

### Acceptance Criteria

- user can see low-confidence matches
- user can correct a mismatch manually
- future scans reuse that correction when possible

## Priority 4: Seller Intelligence

This phase moves the product from "scanner" to "seller operating system."

### Must Have

- top seller priority list
- seller-defined favorites / hot items
- opportunity ranking weighted by:
  - prior sales velocity
  - profit
  - confidence
  - sourcing frequency
- notes on why an item matters
- restock cadence tracking

### Better Version Later

- import top sellers from Amazon account history
- assign `priority` or `speed mode` to specific ASINs

### Why It Matters

Not all profitable items matter equally.
Top sellers need speed.

## Priority 5: Amazon Account Connected Workflow

This is powerful, but should come after the core monitoring loop works well.

### Must Have

- import seller catalog or tracked ASIN set
- import Amazon orders into replens tracking
- restriction / gating status placeholder per ASIN
- account-level flags for do-not-buy items

### Why It Matters

This removes manual ASIN entry and makes the system follow the seller’s real business, not just a research list.

### Acceptance Criteria

- user can load ASINs from account data instead of pasting everything
- app can mark some items as restricted / manual review

## Priority 6: Auction And Best Offer Sourcing

This is strategically useful, but not the first thing to build.

### Must Have

- auction-enabled monitoring profile type
- ending-soon filter
- bid-window highlighting
- best-offer-ready tag
- auction-specific risk warnings

### Why It Matters

Auctions are a differentiated sourcing channel, but they introduce more complexity and urgency.

## Priority 7: Specialty Utilities

These are useful once the main workflow is strong.

### Candidates

- books counterfeit check flow
- category-specific calculators
- brand restriction heuristics
- supplier / seller trust scoring
- duplicate suppression across replens and discovery

## Recommended Build Order

If we want the fastest path to a competitive product, build in this order:

1. Core replens monitoring
2. Hit queue and alerts
3. Match correction workflow
4. Seller intelligence / priority items
5. Amazon account connected workflows
6. Auction support
7. Specialty utilities

## Suggested Phase Labels

These can be used as milestones in GitHub or Railway deployment notes.

### Phase A: Replens Core

- bulk import
- monitored list
- target buy price
- exact ASIN monitoring

### Phase B: Alerting

- hit queue
- alerts
- stale hit handling

### Phase C: Trust Layer

- mismatch review
- manual overrides
- correction memory

### Phase D: Seller OS

- top sellers
- account sync
- restrictions

### Phase E: Advanced Sourcing

- auctions
- best offer
- category tools

## What We Should Build Next

The single best next implementation target is:

`Bulk ASIN import + monitored replens list + target buy price editing`

That is the smallest feature set that most clearly shifts the product toward the Replen Catcher model.

## What We Should Not Overbuild Yet

- full multi-user auth
- shipment creation
- purchase automation
- browser scraping
- AI-heavy decision agents
- category-specific specialty tools before the core replens loop is reliable

## Success Metric For The Next Milestone

We should consider the next milestone successful when a seller can:

1. import a set of Amazon ASINs
2. set target buy prices
3. let the app monitor eBay automatically
4. open a single queue of profitable replen hits
5. review or correct mismatches without leaving the app
