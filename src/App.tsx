import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { MemberPanel } from './pages/MemberPanel';
import { ExchangeAgreementReview } from './pages/ExchangeAgreementReview';
import { OnboardingPanel } from './pages/OnboardingPanel';

/**
 * IT-F2-416 item 95fac632 (Mike c/60f82674) + c/7d0c754e + c/feafab54:
 * Sidebar-nav layout matching f2-admin; sidebar items iframe their
 * destination inside the main panel rather than opening in a new tab.
 * Overview stays as the default (index 0) with the walkthrough intro.
 *
 * c/feafab54 (2026-09-23 Mike): expand numbered agenda steps into
 * sub-items so the auditor can click straight to the app/panel that
 * fulfills that step. Step 1 stays flat with a single "See diagram"
 * sub that jumps back to Overview.
 *
 * All destination URLs still use members.f2-tech.ai / scanners.f2-tech.ai
 * handoff so the embedded page can authenticate against its
 * cookie/session.
 */

type NavKind = 'overview' | 'member' | 'iframe' | 'agreement-review' | 'onboarding';

type NavItem = {
  n: number | string | null; // null = overview / no bubble; number = agenda step; string = special (e.g. 'M' for Member)
  label: string;
  title: string;
  src: string | null; // null = render local component
  kind?: NavKind;
  slug: string; // stable URL slug per tab (?tab=<slug>) for hard-refresh
  subs?: NavItem[]; // c/feafab54 — nested sub-navigation
};

const NAV_ITEMS: NavItem[] = [
  { n: null, slug: 'overview', label: 'Overview', title: 'Walkthrough overview', src: null, kind: 'overview' },

  {
    n: 1, slug: 'data-flow', label: 'Data Flow & Dissemination',
    title: 'Compliance Review · Feed Routing',
    src: 'https://members.f2-tech.ai/f2/f2-compliance-review?next=/feed-routing', kind: 'iframe',
    // Step 1 sub-nav per Mike: single "See diagram" jump back to overview.
    subs: [
      { n: null, slug: 'data-flow-diagram', label: 'See diagram', title: 'Walkthrough overview diagram (Dashboard)', src: null, kind: 'overview' },
    ],
  },

  {
    n: 2, slug: 'onboarding', label: 'Onboarding Process',
    title: 'Bulk-invite recipients — send email or copy magic link per user',
    src: null, kind: 'onboarding',
    // Step 2 body: "Setup a test user via the admin Users panel
    // (bulk-add / add-user modal), triggers the temp-password +
    // set-password + first-name/last-name flow."
    subs: [
      { n: null, slug: 'onboarding-bulk-invite',   label: 'Bulk-invite (this app)',        title: 'Bulk-invite recipients — send email or copy magic link per user', src: null, kind: 'onboarding' },
      { n: null, slug: 'onboarding-admin-users',   label: 'Admin Users panel',             title: 'Admin · Users (bulk-add / add-user modal)', src: 'https://admin.f2-tech.ai/admin/users', kind: 'iframe' },
      { n: null, slug: 'onboarding-accept-invite', label: 'Set password + name (invitee)', title: 'Members portal · accept-invite (invitee sets password + first/last name)', src: 'https://members.f2-tech.ai/accept-invite', kind: 'iframe' },
    ],
  },

  {
    n: 3, slug: 'entitlement', label: 'Entitlement System',
    title: 'Exchange Agreement Review (native React port)',
    src: null, kind: 'agreement-review',
    // Step 3 body: per-user permissioning (enable/modify/remove) +
    // simultaneous-access prevention (live-session displacement).
    subs: [
      { n: null, slug: 'entitlement-review',    label: 'Exchange Agreement Review',     title: 'Review + approve/decline user Exchange Agreements (native panel)', src: null, kind: 'agreement-review' },
      { n: null, slug: 'entitlement-user-edit', label: 'Admin · edit user',   title: 'Admin · Users panel — enable/modify/remove NYSE entitlements directly on the user record', src: 'https://admin.f2-tech.ai/admin/users', kind: 'iframe' },
      { n: null, slug: 'entitlement-displaced', label: 'Live-session displacement demo', title: 'F2 Gap Up / Down — open in a second tab to trigger the displaced state', src: 'https://scanners.f2-tech.ai/scans/f2-gap-up-down', kind: 'iframe' },
    ],
  },

  {
    n: 4, slug: 'reporting', label: 'Reporting',
    title: 'Compliance Report · Counts by Month',
    src: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month', kind: 'iframe',
    // Step 4 body: monthly report + who has access + audit of system
    // changes.
    subs: [
      { n: null, slug: 'reporting-counts-month', label: 'Counts by Month',    title: 'Compliance Report · Counts by Month (monthly submission report)', src: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month', kind: 'iframe' },
      { n: null, slug: 'reporting-exhibit-b',    label: 'Exhibit B / SIP',    title: 'Compliance Report · Exhibit B (NYSE §9.2 Pro subscribers)', src: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/exhibit-b', kind: 'iframe' },
      { n: null, slug: 'reporting-access',       label: 'Admin access audit', title: 'Admin · Users panel (who has admin access + role)', src: 'https://admin.f2-tech.ai/admin/users', kind: 'iframe' },
    ],
  },

  {
    n: 5, slug: 'application', label: 'Application(s)',
    title: 'F2 Gap Up / Down (F2 market-data scanner)',
    src: 'https://scanners.f2-tech.ai/scans/f2-gap-up-down', kind: 'iframe',
    // Step 5 body: applications displaying NYSE data products (CTA
    // Network A + B) with tier + scanner catalog + live/delayed
    // indicators.
    subs: [
      { n: null, slug: 'application-gap-scanner',  label: 'F2 Gap Up / Down (scanner)',  title: 'F2 Gap Up / Down (F2 market-data scanner) — live/delayed data chip + realtime rows', src: 'https://scanners.f2-tech.ai/scans/f2-gap-up-down', kind: 'iframe' },
      { n: null, slug: 'application-members-home', label: 'Members portal (catalog)',    title: 'Members portal — scanner catalog + tier chip surface', src: 'https://members.f2-tech.ai/f2', kind: 'iframe' },
    ],
  },

  { n: 'M', slug: 'member', label: 'Member', title: 'Bulk-invite members (clone entitlements from a template user)', src: null, kind: 'member' },
];

// Flattened lookup for slug → (parentIdx, subIdx?) so URL persistence
// resolves both top-level and sub-item slugs.
type Selection = { parent: number; sub: number | null };
function selectionFromSlug(slug: string | null): Selection {
  if (!slug) return { parent: 0, sub: null };
  for (let p = 0; p < NAV_ITEMS.length; p++) {
    if (NAV_ITEMS[p].slug === slug) return { parent: p, sub: null };
    const subs = NAV_ITEMS[p].subs || [];
    for (let s = 0; s < subs.length; s++) {
      if (subs[s].slug === slug) return { parent: p, sub: s };
    }
  }
  return { parent: 0, sub: null };
}
function slugFromSelection(sel: Selection): string {
  const parent = NAV_ITEMS[sel.parent];
  if (!parent) return 'overview';
  if (sel.sub == null) return parent.slug;
  return parent.subs?.[sel.sub]?.slug || parent.slug;
}
function activeItem(sel: Selection): NavItem {
  const parent = NAV_ITEMS[sel.parent];
  if (sel.sub == null) return parent;
  return parent.subs?.[sel.sub] || parent;
}

export function App() {
  // IT-F2-416 c/006e5ad7 — force tab title + favicon to F2-User-
  // Compliance identity on mount (stops PWA-scope or SW-cached
  // customer branding from leaking into the tab).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let brandName: string | null = null;
      try {
        const host = window.location.hostname;
        const r = await fetch(`/rest/api/brand-config?host=${encodeURIComponent(host)}`);
        if (r.ok) {
          const b = await r.json();
          if (b?.isCustomerBrand && typeof b?.name === 'string') brandName = b.name;
        }
      } catch { /* fleet-wide fallback */ }
      if (cancelled) return;
      const title = brandName ? `${brandName} — F2 User Compliance` : 'F2 User Compliance';
      document.title = title;
      try {
        for (const l of Array.from(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'))) {
          l.parentElement?.removeChild(l);
        }
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1e3a8a"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#f3f4f6" text-anchor="middle">F2</text></svg>';
        const link = document.createElement('link');
        link.setAttribute('rel', 'icon');
        link.setAttribute('type', 'image/svg+xml');
        link.setAttribute('href', `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        document.head.appendChild(link);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const [sel, setSel] = useState<Selection>(() => {
    try {
      const slug = new URLSearchParams(window.location.search).get('tab');
      return selectionFromSlug(slug);
    } catch {
      return { parent: 0, sub: null };
    }
  });
  useEffect(() => {
    try {
      const slug = slugFromSelection(sel);
      const url = new URL(window.location.href);
      if (!slug || slug === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', slug);
      const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
      window.history.replaceState(null, '', next);
    } catch { /* best-effort */ }
  }, [sel]);

  const active = activeItem(sel);

  const bubbleBg = (n: NavItem) =>
    n.kind === 'overview' ? '#374151'
    : n.kind === 'member'   ? '#15803d'
    : '#1e3a8a';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ background: '#1f2937', padding: '12px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Link to="/" onClick={() => setSel({ parent: 0, sub: null })} style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          F2 User Compliance
        </Link>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>NYSE audit walkthrough dashboard</span>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <aside style={{
          width: 280, minWidth: 280, background: '#0f172a', borderRight: '1px solid #1f2937',
          display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', overflow: 'auto',
        }}>
          <div style={{ padding: '6px 16px 10px', fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Audit agenda
          </div>
          {NAV_ITEMS.map((n, idx) => {
            const isParentActive = sel.parent === idx && sel.sub == null;
            const anySubActive   = sel.parent === idx && sel.sub != null;
            // c/a0c0f2b7 (Mike 2026-09-23) — subs always visible by default
            // so the auditor can see the whole tree at a glance instead of
            // having to click into each parent to reveal targets.
            const expanded       = !!(n.subs && n.subs.length > 0);
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setSel({ parent: idx, sub: null })}
                  title={n.title}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 16px',
                    color: (isParentActive || anySubActive) ? '#f3f4f6' : '#cbd5e1',
                    background: isParentActive ? '#1e293b' : 'transparent',
                    border: 'none',
                    borderLeft: `3px solid ${isParentActive ? '#60a5fa' : 'transparent'}`,
                    textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background .12s, border-color .12s, color .12s',
                  }}
                  onMouseEnter={(e) => {
                    if (isParentActive) return;
                    (e.currentTarget as HTMLElement).style.background = '#1e293b';
                    (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    if (isParentActive) return;
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = (anySubActive ? '#f3f4f6' : '#cbd5e1');
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%',
                    background: bubbleBg(n),
                    color: '#e5e7eb',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{n.n == null ? '·' : n.n}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                </button>

                {expanded && n.subs && n.subs.map((sub, subIdx) => {
                  const isSubActive = sel.parent === idx && sel.sub === subIdx;
                  return (
                    <button
                      key={subIdx}
                      type="button"
                      onClick={() => setSel({ parent: idx, sub: subIdx })}
                      title={sub.title}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 16px 7px 44px',
                        color: isSubActive ? '#f3f4f6' : '#94a3b8',
                        background: isSubActive ? '#172033' : 'transparent',
                        border: 'none',
                        borderLeft: `3px solid ${isSubActive ? '#60a5fa' : 'transparent'}`,
                        textAlign: 'left', fontSize: 12, fontFamily: 'inherit',
                        cursor: 'pointer',
                        transition: 'background .12s, border-color .12s, color .12s',
                      }}
                      onMouseEnter={(e) => {
                        if (isSubActive) return;
                        (e.currentTarget as HTMLElement).style.background = '#172033';
                        (e.currentTarget as HTMLElement).style.color = '#e5e7eb';
                      }}
                      onMouseLeave={(e) => {
                        if (isSubActive) return;
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                      }}
                    >
                      <span style={{
                        width: 4, height: 4, borderRadius: '50%',
                        background: isSubActive ? '#60a5fa' : '#475569',
                        flexShrink: 0,
                      }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {/* Open-in-new-tab escape hatch for the currently-selected item
              when it's an iframe (some destinations X-Frame-deny). */}
          {active.src && active.kind === 'iframe' && (
            <a
              href={active.src}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', fontSize: 11, color: '#6b7280',
                textDecoration: 'none', borderTop: '1px solid #1f2937',
              }}
              title="Open the current destination in a new tab"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open in new tab
            </a>
          )}
        </aside>
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {active.kind === 'overview' ? (
            <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
              <Dashboard />
            </div>
          ) : active.kind === 'member' ? (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <MemberPanel />
            </div>
          ) : active.kind === 'agreement-review' ? (
            <ExchangeAgreementReview />
          ) : active.kind === 'onboarding' ? (
            <OnboardingPanel />
          ) : (
            <iframe
              src={active.src!}
              title={active.title}
              key={active.src}
              style={{ flex: 1, width: '100%', border: 0, background: 'white' }}
            />
          )}
        </main>
      </div>
      <footer style={{ padding: '12px 20px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderTop: '1px solid #374151' }}>
        F2 User Compliance — internal use only.
      </footer>
    </div>
  );
}
