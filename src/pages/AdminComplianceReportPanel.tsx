import { useEffect, useState } from 'react';

/**
 * IT-F2-400 c/b31091c7 (Mike 2026-09-23): iframe the full admin
 * compliance-report page (admin.f2-tech.ai/admin/compliance-report)
 * with the current branded customer's slug preset on the ?customers=
 * query param. The Angular component reads that param on init and
 * pre-selects it in the customer filter (line 284-286 of the
 * compliance-report.component.ts source).
 *
 * Iframe over a native port keeps ALL the report logic (36-col NYSE
 * Exhibit B, TSV copy-to-clipboard, pipe-delimited download, per-user
 * pro-access toggle, view-mode switching between users / counts / login
 * periods / employees) without a Phase-2 port — the panel is the
 * "full-featured" report surface Mike named as complement to the
 * f2-compliance-report SPA's simpler port.
 */

type Brand = { slug: string; isCustomerBrand?: boolean };

const ADMIN_URL_BASE = 'https://admin.f2-tech.ai/admin/compliance-report';

export function AdminComplianceReportPanel() {
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const host = window.location.hostname;
        const res = await fetch(`/rest/api/brand-config?host=${encodeURIComponent(host)}`);
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        if (body && typeof body.slug === 'string') setBrand(body as Brand);
      } catch { /* no-op */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const url = brand?.isCustomerBrand && brand?.slug
    ? `${ADMIN_URL_BASE}?customers=${encodeURIComponent(brand.slug)}`
    : ADMIN_URL_BASE;

  return (
    <iframe
      src={url}
      title="Admin compliance report — Exhibit B / SIP"
      key={url}
      style={{ flex: 1, width: '100%', border: 0, background: 'white' }}
    />
  );
}
