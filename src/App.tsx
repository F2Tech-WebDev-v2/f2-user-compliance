import { Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';

/**
 * IT-F2-416 checklist-item #5 + item 95fac632 (Mike 2026-09-22 c/60f82674):
 * "The apps sold be listed down the side like the add min app". Refactored
 * the 5-card grid dashboard into a persistent left-sidebar layout matching
 * the f2-admin app pattern:
 *   - fixed-width dark sidebar down the left (240px), one row per audit-
 *     agenda step, click opens the destination app in a new tab
 *   - main content stays with the walkthrough overview + note-to-reviewers
 *
 * All destinations still use the members.f2-tech.ai handoff so the auditor
 * lands with a valid scanner sid (no re-login mid-demo).
 */

const NAV_ITEMS: { n: number; label: string; href: string; title: string }[] = [
  { n: 1, label: 'Data Flow & Dissemination', title: 'Compliance Review · Feed Routing', href: 'https://members.f2-tech.ai/f2/f2-compliance-review?next=/feed-routing' },
  { n: 2, label: 'Onboarding Process',        title: 'Admin · Users panel',              href: 'https://admin.f2-tech.ai/admin/users' },
  { n: 3, label: 'Entitlement System',        title: 'Admin · Users panel',              href: 'https://admin.f2-tech.ai/admin/users' },
  { n: 4, label: 'Reporting',                 title: 'Compliance Report · Counts by Month', href: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month' },
  { n: 5, label: 'Application(s)',            title: 'Compliance Review · Overview',     href: 'https://members.f2-tech.ai/f2/f2-compliance-review' },
];

export function App() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ background: '#1f2937', padding: '12px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          F2 User Compliance
        </Link>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>NYSE audit walkthrough dashboard</span>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left sidebar — one row per audit-agenda step. Opens external
            destination in a new tab; no active-state (external links, not
            router routes). Matches f2-admin's persistent left-nav column. */}
        <aside style={{
          width: 260, minWidth: 260, background: '#0f172a', borderRight: '1px solid #1f2937',
          display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0', overflow: 'auto',
        }}>
          <div style={{ padding: '6px 16px 10px', fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Audit agenda
          </div>
          {NAV_ITEMS.map((n) => (
            <a
              key={n.n}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              title={n.title}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', color: '#cbd5e1', textDecoration: 'none',
                fontSize: 13, borderLeft: '3px solid transparent',
                transition: 'background .12s, border-color .12s, color .12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#1e293b';
                (e.currentTarget as HTMLElement).style.borderLeftColor = '#60a5fa';
                (e.currentTarget as HTMLElement).style.color = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent';
                (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: '50%',
                background: '#1e3a8a', color: '#e5e7eb',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>{n.n}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', opacity: 0.5, flexShrink: 0 }} aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          ))}
        </aside>
        <main style={{ flex: 1, padding: '20px', width: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <Dashboard />
        </main>
      </div>
      <footer style={{ padding: '12px 20px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderTop: '1px solid #374151' }}>
        F2 User Compliance — internal use only.
      </footer>
    </div>
  );
}
