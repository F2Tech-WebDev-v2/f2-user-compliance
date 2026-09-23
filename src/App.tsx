import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AccountMenu } from 'f2tech-shared/account-menu';
import { Dashboard } from './pages/Dashboard';
import { MemberPanel } from './pages/MemberPanel';
import { ExchangeAgreementReview } from './pages/ExchangeAgreementReview';
import { OnboardingPanel } from './pages/OnboardingPanel';
import { AcceptInvitePanel } from './pages/AcceptInvitePanel';
import { DisplacementDemoPanel } from './pages/DisplacementDemoPanel';
import { ScannerHandoffPanel } from './pages/ScannerHandoffPanel';
import { CopyUrlPanel } from './pages/CopyUrlPanel';
import { AdminComplianceReportPanel } from './pages/AdminComplianceReportPanel';
import { useMe } from './api/me';
import { setTokenBundle } from './auth/session';

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

type NavKind = 'overview' | 'member' | 'iframe' | 'agreement-review' | 'onboarding' | 'accept-invite' | 'displacement-demo' | 'scanner-handoff' | 'copy-url-members-home' | 'admin-compliance-report';

type NavItem = {
  n: number | string | null; // null = overview / no bubble; number = agenda step; string = special (e.g. 'M' for Member)
  label: string;
  title: string;
  src: string | null; // null = render local component
  kind?: NavKind;
  slug: string; // stable URL slug per tab (?tab=<slug>) for hard-refresh
  subs?: NavItem[]; // c/feafab54 — nested sub-navigation
  // c/5c731529 (Mike 2026-09-23) — additional query params to set on
  // the URL when this sub is activated. Used e.g. to preset the
  // ExchangeAgreementReview `status` filter (?status=all) so the
  // admin-edit-user sub lands on the full user list instead of the
  // default "pending" review queue.
  queryDefaults?: Record<string, string>;
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
      { n: null, slug: 'onboarding-admin-users',   label: 'Admin Users panel',             title: 'F2 Compliance Report — Users tab (exhibit-b row source) via scanners.f2-tech.ai/scans/f2-compliance-report', src: 'https://scanners.f2-tech.ai/scans/f2-compliance-report', kind: 'iframe' },
      { n: null, slug: 'onboarding-accept-invite', label: 'Set password + name (invitee)', title: 'Paste an invite magic link → run the set-password + name flow in an isolated frame', src: null, kind: 'accept-invite' },
    ],
  },

  {
    n: 3, slug: 'entitlement', label: 'Entitlement System',
    title: 'Exchange Agreement Review (native React port)',
    src: null, kind: 'agreement-review',
    // Step 3 body: per-user permissioning (enable/modify/remove) +
    // simultaneous-access prevention (live-session displacement).
    subs: [
      { n: null, slug: 'entitlement-review',    label: 'Exchange Agreement Review',     title: 'Review + approve/decline user Exchange Agreements (native panel) — filters on pending', src: null, kind: 'agreement-review', queryDefaults: { status: 'pending' } },
      { n: null, slug: 'entitlement-user-edit', label: 'Admin · edit user',   title: 'Exchange Agreement Review — full user list (per Mike c/5c731529: preset status=all)', src: null, kind: 'agreement-review', queryDefaults: { status: 'all' } },
      { n: null, slug: 'entitlement-displaced', label: 'Live-session displacement demo', title: 'Two side-by-side frames of the Gap Up / Down scanner — log the same user into both to demo displacement', src: null, kind: 'displacement-demo' },
    ],
  },

  {
    n: 4, slug: 'reporting', label: 'Reporting',
    title: 'Compliance Report · Counts by Month',
    src: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month', kind: 'iframe',
    // Step 4 body: monthly report + who has access + audit of system
    // changes.
    subs: [
      { n: null, slug: 'reporting-counts-month', label: 'Counts by Month',    title: 'Compliance Report · Counts by Month (monthly submission report)', src: 'https://scanners.f2-tech.ai/scans/f2-compliance-report?tab=counts-by-month', kind: 'iframe' },
      { n: null, slug: 'reporting-exhibit-b',    label: 'Exhibit B / SIP',    title: 'Compliance Report · Exhibit B (NYSE §9.2 Pro subscribers — same row source as the Users tab)', src: 'https://scanners.f2-tech.ai/scans/f2-compliance-report?tab=users', kind: 'iframe' },
      // c/b31091c7 (Mike 2026-09-23) — full admin compliance-report
      // page iframed. Carries all its logic (36-col NYSE submission,
      // TSV copy-to-clipboard, pipe-delimited download, view-mode
      // switching). Wrapper resolves brand.slug + presets ?customers=
      // so the customer filter is prefilled per the current branded
      // domain.
      { n: null, slug: 'reporting-exhibit-b-full', label: 'Exhibit B / SIP (full)', title: 'Admin compliance report — full 36-col NYSE submission + TSV/pipe download (from admin.f2-tech.ai)', src: null, kind: 'admin-compliance-report' },
      { n: null, slug: 'reporting-access',       label: 'Access review history', title: 'Compliance Report · Login Periods (per-user first login → last login span)', src: 'https://scanners.f2-tech.ai/scans/f2-compliance-report?tab=login-periods', kind: 'iframe' },
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
      { n: null, slug: 'application-gap-scanner',  label: 'F2 Gap Up / Down (scanner)',  title: 'F2 Gap Up / Down — loads via a fresh scanner-sid so the frame skips the login prompt entirely', src: 'f2-gap-up-down', kind: 'scanner-handoff' },
      { n: null, slug: 'application-members-home', label: 'Members portal (catalog)',    title: 'Copy the customer-branded domain root — paste in a private window to demo the branded scanner catalog (per Mike c/cba0380a + c/b538ce09)', src: null, kind: 'copy-url-members-home' },
    ],
  },

  // c/199c2e28 (Mike 2026-09-23) — Member nav removed from the
  // sidebar. Its bulk-invite-via-template functionality was subsumed
  // by OnboardingPanel; the standalone "Member" bubble was surplus.
  // MemberPanel.tsx stays in the tree for now in case Mike wants it
  // back — dead-code sweep can drop it later.
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
      // c/5c731529 — apply per-nav-item queryDefaults ONLY when the
      // param isn't already in the URL. Lets sub-items preset filters
      // (e.g. ?status=all on Admin · edit user) without clobbering a
      // deep-link the user pasted in explicitly.
      const activeNav = activeItem(sel);
      const defaults = activeNav?.queryDefaults;
      if (defaults) {
        for (const [k, v] of Object.entries(defaults)) {
          if (!url.searchParams.has(k)) url.searchParams.set(k, v);
        }
      }
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
        <span style={{ fontSize: 12, color: '#9ca3af' }}>NYSE compliance walkthrough dashboard</span>
        {/* c/b6978add (Mike 2026-09-23) — shared account coin on the
            right. Fleet-standard f2tech-shared/account-menu — hover
            reveals identity, click opens the Change-password / Sign-out
            dropdown. Same pattern every other SPA in the fleet. */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <AccountCoin />
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <aside style={{
          width: 280, minWidth: 280, background: '#0f172a', borderRight: '1px solid #1f2937',
          display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', overflow: 'auto',
        }}>
          <div style={{ padding: '6px 16px 10px', fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Walkthrough steps
          </div>
          {NAV_ITEMS.map((n, idx) => {
            const isParentActive = sel.parent === idx && sel.sub == null;
            const anySubActive   = sel.parent === idx && sel.sub != null;
            // c/a0c0f2b7 (Mike 2026-09-23) — subs always visible by default
            // so users can see the whole tree at a glance instead of
            // having to click into each parent to reveal targets.
            const expanded       = !!(n.subs && n.subs.length > 0);
            // c/3d6ac31e (Mike 2026-09-23) — numbered parent bullets
            // (#1 … #5) are display-only headers, not clickable. Only the
            // sub-items open a destination. Overview + Member bubbles
            // (non-numeric bubble) stay clickable since they don't have
            // subs to represent them.
            const isNumberedParent = typeof n.n === 'number';
            const parentIsButton = !isNumberedParent;
            const parentSharedStyle: CSSProperties = {
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 16px',
              color: (isParentActive || anySubActive) ? '#f3f4f6' : '#cbd5e1',
              background: isParentActive ? '#1e293b' : 'transparent',
              border: 'none',
              borderLeft: `3px solid ${isParentActive ? '#60a5fa' : 'transparent'}`,
              textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
              cursor: parentIsButton ? 'pointer' : 'default',
              transition: 'background .12s, border-color .12s, color .12s',
            };
            return (
              <div key={idx}>
                {parentIsButton ? (
                  <button
                    type="button"
                    onClick={() => setSel({ parent: idx, sub: null })}
                    title={n.title}
                    style={parentSharedStyle}
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
                ) : (
                  <div title={n.title} style={{ ...parentSharedStyle, cursor: 'default', userSelect: 'none' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%',
                      background: bubbleBg(n),
                      color: '#e5e7eb',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{n.n as number}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                  </div>
                )}

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
          ) : active.kind === 'accept-invite' ? (
            <AcceptInvitePanel />
          ) : active.kind === 'displacement-demo' ? (
            <DisplacementDemoPanel />
          ) : active.kind === 'scanner-handoff' ? (
            <ScannerHandoffPanel scannerId={active.src!} title={active.title} />
          ) : active.kind === 'admin-compliance-report' ? (
            <AdminComplianceReportPanel />
          ) : active.kind === 'copy-url-members-home' ? (
            <CopyUrlPanel
              title="Members portal — branded scanner catalog"
              subtitle="The customer&rsquo;s own branded domain root (per c/b538ce09 — F2 customer → scanners.f2-tech.ai/, other customers → their branded scanner hub without any /slug suffix). Shows the scanner tiles + tier chip surface an end-user sees on login. To demo, run it in a private window with the demo user's credentials."
              url={typeof window !== 'undefined' ? window.location.origin + '/' : (active.src || '')}
              steps={[
                'Click <b>Copy URL</b> above.',
                'Open a <b>private / incognito</b> browser window (so the dashboard&rsquo;s admin session doesn&rsquo;t auto-authenticate you into a different view).',
                'Paste the URL into the address bar. Log in with the demo user&rsquo;s credentials when the members portal prompts you.',
                'You&rsquo;ll land on the F2-branded scanner catalog with a tier chip in the header — the same experience an end-user sees post-login.',
              ]}
              note={"<b>Why private / incognito?</b> The compliance dashboard is already authenticated at <code>.f2-tech.ai</code>. Loading the members portal in the same window would carry the admin&rsquo;s session cookies and show the admin&rsquo;s tile list instead of the demo user&rsquo;s. A private window gives you a fresh cookie jar."}
            />
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

// c/b6978add (Mike 2026-09-23) — account coin wrapper. Fleet-standard
// f2tech-shared React AccountMenu (same widget f2-gap-up-down, f2-
// tracker, f2-admin, etc. use). Identity decoded from the in-memory
// id_token via useMe; sign-out clears the token bundle + POSTs the
// backend logout endpoint + bounces to the branded members home.
function AccountCoin() {
  const me = useMe();
  return (
    <AccountMenu
      email={me.email}
      firstName={me.firstName}
      lastName={me.lastName}
      agreementUrl={null}
      onChangePassword={() => {
        window.location.href = 'https://members.f2-tech.ai/change-password';
      }}
      onSignOut={() => {
        // Same shape as f2-gap-up-down IT-F2-421 c/34d2db3c —
        // /rest/api/logout on SessionController is the correct endpoint;
        // /rest/auth/logout 404s on f2-admin-service.
        fetch('/rest/api/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
          .catch(() => { /* best-effort */ })
          .finally(() => {
            setTokenBundle(null);
            window.location.href = 'https://members.f2-tech.ai/';
          });
      }}
    />
  );
}

