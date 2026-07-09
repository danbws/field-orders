# RouteLine — Product Brief

> **Take the order in the cooler, not the parking lot** — every order captured
> offline, priced right, and on the manager's dashboard the second there's a bar
> of signal.
>
> **No signal is not the same as no sale.**

RouteLine is offline-first order capture for US food & beverage distributors and
DSD (direct-store-delivery) route reps — the people who take reorders in walk-in
coolers, stockroom basements, and loading docks where there's no signal.

---

## Positioning

Field reps lose orders in the gap between the shelf and the truck. They scribble
counts on a paper pad in the cooler, then re-key them in the parking lot (or that
night, or never). RouteLine closes that gap: the order is captured **where the
count happens**, works with zero connectivity, is **priced from the catalog — not
the rep's memory**, and lands on the manager's dashboard the instant a bar of
signal returns.

One job, done well: **capture the reorder, correctly, no matter the signal.**

---

## ICP (Ideal Customer Profile)

- **Who:** owner, sales manager, or ops manager at a small regional distributor or
  DSD operation.
- **Verticals:** craft beverage (beer / cider / non-alc / kombucha), coffee
  roasters, specialty & ethnic foods, artisan bakery, produce.
- **Size:** ~\$1M–\$40M revenue, **3–25 field reps**.
- **Today's stack:** paper order pads, texts and photos to the office, or a shared
  spreadsheet — all re-keyed by hand into QuickBooks. Orders get dropped,
  transposed, or priced wrong; the manager has no same-day visibility.
- **Trigger to buy:** a mis-keyed or lost order that cost real money, a rep who
  quit and took their pad with them, or growth past the point where "text me the
  order" scales.

---

## Pricing (per-seat)

| Plan | Price | For | Key features |
|------|-------|-----|--------------|
| **Starter** | **\$29 / rep / mo** (min 2 reps) | Solo/small crews replacing paper | Offline capture, idempotent sync, product catalog, rep + manager summary |
| **Pro** | **\$49 / rep / mo** | Growing teams that need control | Everything in Starter + **customer price lists**, order **approvals**, **CSV / QuickBooks export**, **roles** |
| **Business** | **\$79 / rep / mo + \$299 base** | Multi-location operations | Everything in Pro + **multi-warehouse**, **API access**, **route planning** |

**Annual billing: −20%.** Priced per active seat so it scales with the route
count, not with a CRM's per-feature upsell ladder.

---

## Three differentiators

1. **True cooler-grade offline.** Orders get a device-minted UUID and sync in
   **idempotent batches**. A dropped connection mid-sync can never duplicate an
   order and can never lose one — the device holds it until the server
   acknowledges. Most "mobile CRMs" degrade to a spinner without signal;
   RouteLine is designed for the basement.

2. **Server-authoritative per-customer pricing.** The **catalog is the source of
   truth** — reps can't fat-finger a price or quietly discount a line. On sync the
   server overwrites each line's price and name from the catalog and rejects
   unknown SKUs outright. *(This week's feature; per-customer price lists land in
   P1.)*

3. **10-minute setup, one job done well.** No implementation project, no annual
   contract, no CRM to administer. RouteLine does field order capture — versus
   **SPOTIO / Repsly / Pepperi**, which are CRM-heavy platforms with annual
   commitments and a setup consultant. You're taking orders the same afternoon.

---

## Brand identity

**Tone:** grounded, reassuring, no-nonsense. Talks like a route manager, not a
SaaS growth deck.

**Palette**

| Token | Hex | Use |
|-------|-----|-----|
| Ink | `#14211C` | Primary text, headers, app chrome |
| Route Green | `#1F8A5B` | **Synced / success**, primary actions |
| Signal Amber | `#F5A524` | **Waiting-to-sync / offline heartbeat** |
| Alert Clay | `#D9483B` | Errors, destructive (remove/reject) |
| Bone | `#F6F4EE` | App background / surfaces |
| Slate | `#6B7A73` | Muted text, metadata |

The emotional core is the **offline heartbeat**: anything not yet on the server
pulses in **Signal Amber**; the moment it's confirmed, it turns **Route Green**.
The rep never has to wonder whether an order made it.

**Type**

- **Space Grotesk** — headings, wordmark.
- **Inter** (with **tabular figures**) — body, order totals, quantities, so
  numbers stay column-true.

**Logo concept:** a rounded route-pin teardrop whose negative space forms a
**checkmark** — *captured + located*. The single-color app icon is legible on
both the **amber "pending"** and **green "synced"** states, so the icon itself
reads the sync status.

---

## Roadmap to sellable

### P0 — SaaS shell (must-have before first paying customer)
- **Auth + rep API tokens** (no more open endpoints).
- **Organization multi-tenant model** — `org_id` on every table, every query
  scoped to the caller's org. *(Not attempted this session — deliberately
  deferred; see note below.)*
- **Rep vs admin roles.**
- **Real PWA** — service worker + web app manifest + **IndexedDB** outbox,
  replacing the current `localStorage` demo store; installable, works fully
  offline.
- **Server-authoritative pricing** — ✅ *shipped this commit.*

> **Security note (this session):** we did **not** add auth or tenancy yet. Until
> P0 auth lands, `/api/sync`, `/api/orders`, and `/api/summary/by-rep` are open
> endpoints. This session added cheap guardrails — a **max batch size (500)** on
> `/sync`, **bounded pagination** (limit ≤ 500) on `/orders`, and moved catalog
> **seeding out of the `GET /products` read path** into startup — but multi-tenant
> isolation and authentication remain the top P0 item and the gate to selling.

### P1 — Revenue & real catalog
- **Stripe per-seat billing** (Starter / Pro / Business, annual −20%).
- **Real `Customer` entity** + **per-customer price lists** (Pro).
- **Admin catalog CRUD** (products, prices, SKUs).
- **Pagination + date filters** across list/summary endpoints.
- **QuickBooks / CSV export.**
- **Alembic migrations** (replace `create_all` bootstrap).

### P2 — Route operations
- **Route / visit planning** (Business).
- **Order status lifecycle** (draft → submitted → approved → fulfilled).
- **Proof of delivery** — signature / photo capture.
- **Admin dashboard** rebuilt in **Next.js + shadcn/ui**.
