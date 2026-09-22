import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { MemberPanel } from './pages/MemberPanel';
import { ExchangeAgreementReview } from './pages/ExchangeAgreementReview';

/**
 * IT-F2-416 item 95fac632 (Mike c/60f82674) + c/7d0c754e:
 * Sidebar-nav layout matching f2-admin, PLUS: sidebar items now iframe
 * their destination inside the main panel rather than opening in a new
 * tab. Click "Data Flow & Dissemination" → iframe of the compliance-
 * review feed-routing page fills the right panel. Overview stays as
 * the default (index 0) with the walkthrough intro + note-to-reviewers.
 *
 * All destination URLs still use members.f2-tech.ai handoff so the
 * embedded page can authenticate against its cookie/session.
 */

type NavItem = {
  n: number | string | null; // null = overview; number = agenda step; string = special (e.g. 'M' for Member)
  label: string;
  title: string;
  src: string | null; // null = render local component
  kind?: 'overview' | 'member' | 'iframe' | 'agreement-review';
  // IT-F2-416 c/10219ddd — stable URL slug per tab so hard-refresh
  // (?tab=<slug>) restores selection.
  slug: string;
};

const NAV_ITEMS: NavItem[] = [
  { n: null, slug: 'overview',    label: 'Overview',                    title: 'Walkthrough overview',                     src: null, kind: 'overview' },
  { n: 1,    slug: 'data-flow',   label: 'Data Flow & Dissemination',   title: 'Compliance Review · Feed Routing',        src: 'https://members.f2-tech.ai/f2/f2-compliance-review?next=/feed-routing', kind: 'iframe' },
  { n: 2,    slug: 'onboarding',  label: 'Onboarding Process',          title: 'Admin · Users panel',                     src: 'https://admin.f2-tech.ai/admin/users', kind: 'iframe' },
  { n: 3,    slug: 'entitlement', label: 'Entitlement System',          title: 'Exchange Agreement Review (native React port)',       src: null, kind: 'agreement-review' },
  { n: 4,    slug: 'reporting',   label: 'Reporting',                   title: 'Compliance Report · Counts by Month',     src: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month', kind: 'iframe' },
  { n: 5,    slug: 'application', label: 'Application(s)',              title: 'F2 Gap Up / Down (F2 market-data scanner)', src: 'https://scanners.f2-tech.ai/scans/f2-gap-up-down', kind: 'iframe' },
  { n: 'M',  slug: 'member',      label: 'Member',                      title: 'Bulk-invite members (clone entitlements from a template user)', src: null, kind: 'member' },
];

export function App() {
  const [activeIdx, setActiveIdx] = useState<number>(() => {
    try {
      const slug = new URLSearchParams(window.location.search).get('tab');
      if (!slug) return 0;
      const idx = NAV_ITEMS.findIndex((n) => n.slug === slug);
      return idx >= 0 ? idx : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try {
      const slug = NAV_ITEMS[activeIdx]?.slug;
      const url = new URL(window.location.href);
      if (!slug || slug === 'overview') url.searchParams.delete('tab');
      else url.searchParams.set('tab', slug);
      const next = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
      window.history.replaceState(null, '', next);
    } catch {
      // best-effort only
    }
  }, [activeIdx]);
  const active = NAV_ITEMS[activeIdx];
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ background: '#1f2937', padding: '12px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Link to="/" onClick={() => setActiveIdx(0)} style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          F2 User Compliance
        </Link>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>NYSE audit walkthrough dashboard</span>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <aside style={{
          width: 260, minWidth: 260, background: '#0f172a', borderRight: '1px solid #1f2937',
          display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', overflow: 'auto',
        }}>
          <div style={{ padding: '6px 16px 10px', fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Audit agenda
          </div>
          {NAV_ITEMS.map((n, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                title={n.title}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px',
                  color: isActive ? '#f3f4f6' : '#cbd5e1',
                  background: isActive ? '#1e293b' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${isActive ? '#60a5fa' : 'transparent'}`,
                  textAlign: 'left', fontSize: 13, fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'background .12s, border-color .12s, color .12s',
                }}
                onMouseEnter={(e) => {
                  if (isActive) return;
                  (e.currentTarget as HTMLElement).style.background = '#1e293b';
                  (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  if (isActive) return;
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  background: n.kind === 'overview' ? '#374151' : n.kind === 'member' ? '#15803d' : '#1e3a8a',
                  color: '#e5e7eb',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{n.n == null ? '·' : n.n}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
              </button>
            );
          })}
          {/* Open-in-new-tab escape hatch for the currently-selected item.
              Iframes work for most destinations but a few may X-Frame-
              deny (admin.f2-tech.ai / others); this lets the auditor
              still get to the surface without abandoning the walkthrough. */}
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
