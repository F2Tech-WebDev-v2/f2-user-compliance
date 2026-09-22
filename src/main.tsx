import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthGate } from './auth/AuthGate';
import './index.css';

// IT-F2-416 c/c3bd2483 (Mike 2026-09-22): mirror the f2-gap-up-down
// pattern — if we land on the raw f2-user-compliance.vercel.app host,
// hard-redirect to the customer-branded canonical
// scanners.f2-tech.ai/scans/f2-user-compliance preserving path + query
// + hash. Members portal middleware proxies /scans/<slug>/* to the
// vercel.app internally per Customers.f2.vercel.scanner_proxy_target_urls.
const VERCEL_HOST_RE = /^f2-user-compliance(-[a-z0-9-]+)?\.vercel\.app$/i;
const BRANDED_HOST = 'scanners.f2-tech.ai';
const BRANDED_MOUNT = '/scans/f2-user-compliance';

const host = window.location.hostname;
if (VERCEL_HOST_RE.test(host)) {
  const rest = window.location.pathname.replace(/^\/+/, '');
  const target = `https://${BRANDED_HOST}${BRANDED_MOUNT}${rest ? '/' + rest : ''}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
} else {
  // BrowserRouter basename — served at scanners.f2-tech.ai/scans/
  // f2-user-compliance/* through the members proxy; treat that mount
  // point as root so <Link to="/"> stays inside the SPA.
  const basename = window.location.pathname.startsWith(BRANDED_MOUNT) ? BRANDED_MOUNT : undefined;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename={basename}>
        <AuthGate>
          <App />
        </AuthGate>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
