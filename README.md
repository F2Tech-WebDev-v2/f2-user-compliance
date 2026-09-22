# f2-compliance-review

NYSE Market Data Vendor of Record — compliance audit review surface.

Isolated from `f2-admin` operator surface per Mike directive 2026-09-16 IT-F2-391 clar `8540580a`.
Reads audit-trail data (LoginEvents, ReviewAudit, Exchange_Agreements, Scanners) from
`f2-admin-service` via server-side JWT auth + `compliance_officer` role gate.

## Views

**Live:**
- Overview — landing page with all planned views
- Audit Trail — per-user LoginEvents timeline (login / displaced / logout / timeout / websocket_idle_timeout)

**Planned:**
- Sample-Testing Dossier — 4-query dossier generator for a random 3-year sample
- Exhibit B Monthly Report — NYSE §4.2.5 27-column export
- Pro-Tier Realtime Gate — per-customer toggle + bulk-backfill trigger
- Scanners NYSE Product Mapping — Scanners.<slug>.nyse_products SoT editor
- ReviewAudit History — admin decision log with before/after diffs

## Backend

Talks to `f2-admin-service2.f2-tech.ai/rest/api/*` (proxied same-origin via `vercel.json`).
See `src/env.ts` + `vercel.json` rewrites.

## Auth

Requires an authenticated `compliance_officer` (or `admin`) session on `f2-admin-service2` — same
Cognito flow as f2-admin. First-visit: sign into f2-admin-service, then reload the compliance
app; cookies flow via `credentials: 'include'`.

## Dev

```
npm install
npm run dev
```

## Deploy

Vercel-connected; `main` auto-deploys to production. Domain `f2-compliance-review.vercel.app`.
