import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';

/**
 * IT-F2-416 checklist-item #5 (Mike 2026-09-22): F2 User Compliance
 * dashboard. Single-page landing that walks an NYSE auditor through
 * the 5-step demo agenda (Data Flow, Onboarding, Entitlements,
 * Reporting, Applications). Each card deep-links to the app that
 * supports the corresponding step. React + Vite + bearer-auth via
 * f2-members sid-handoff (AuthGate + session.ts inherited from the
 * f2-compliance-report scaffold).
 *
 * Registered as scanner slug `f2-user-compliance` with client=f2 and
 * RoleAccess=admin so only F2 admins land here.
 */
export function App() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ background: '#1f2937', padding: '12px 20px', borderBottom: '1px solid #374151', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Link to="/" style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          F2 User Compliance
        </Link>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>NYSE audit walkthrough dashboard</span>
      </header>
      <main style={{ flex: 1, padding: '20px', width: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer style={{ padding: '12px 20px', textAlign: 'center', fontSize: 12, color: '#6b7280', borderTop: '1px solid #374151' }}>
        F2 User Compliance — internal use only.
      </footer>
    </div>
  );
}
