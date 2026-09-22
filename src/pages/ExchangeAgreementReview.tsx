import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * IT-F2-416 c/52b5b499 + c/4fc8e2a7 (Mike 2026-09-22): port of the
 * Angular /admin/exchange-agreement-review panel as a native React page
 * inside f2-user-compliance. NOT a standalone scanner spin-out — Mike
 * corrected: "it needs to be ripped out of the admin app and become a
 * part of https://scanners.f2-tech.ai/scans/f2-user-compliance".
 *
 * Backend: POST /rest/user/data-agreements/admin/exhibit-b (in
 * f2-admin-service{,2} DataAgreementsController; scanners.f2-tech.ai
 * proxies /rest/* to f2-admin-service2 same-origin so cookies flow).
 * IT-F2-416 c/161b0843 fix — the initial port used /rest/admin/exhibit-b
 * which is a 404; correct mount is under /user/data-agreements/.
 *
 * IT-F2-416 c/3d869cc9 (Mike 2026-09-22): "Missing fields and not
 * filtered to customer domain". Two fixes:
 *   1. Angular columns use SUBSCRIBERS_EMAIL_ADDRESS / SUBSCRIBERS_
 *      FIRST_NAME / SUBSCRIBERS_LAST_NAME / EDITED_AT — my earlier port
 *      used EMAIL / FIRST_NAME / LAST_NAME which are shape-wrong per the
 *      exhibit-b service, so the grid cells were blank. Fields now match
 *      the Angular counterpart exactly, with USER_ID_INTERNAL / USER_ID
 *      as the email fallback per line 261 of the .ts.
 *   2. When served from a customer-branded host, rows are scoped to the
 *      current customer via /rest/api/brand-config (isCustomerBrand=true
 *      → filter to CUSTOMER == brand.slug). On the f2 hub host (raw
 *      scanners.f2-tech.ai) the list stays fleet-wide (matches the
 *      Angular default — see .ts line 494 "No customer/date-range
 *      filters here — the review queue is fleet-wide by default").
 *
 * Approve / decline / view-history actions land in phase 2 (checklist
 * item 703492b1); this is the read-only surface Mike can eyeball first.
 */

type ExhibitRow = {
  USER_ID?: string;
  USER_ID_INTERNAL?: string;
  SUBSCRIBERS_EMAIL_ADDRESS?: string;
  SUBSCRIBERS_FIRST_NAME?: string;
  SUBSCRIBERS_LAST_NAME?: string;
  CUSTOMER?: string;
  PRO_STATUS?: string;
  REVIEW_STATUS?: string;
  DATE_AND_TIME_STAMP?: string;
  EARLIEST_DATE?: string;
  EDITED_AT?: string;
  [k: string]: any;
};

type Brand = {
  slug: string;
  name?: string;
  isCustomerBrand?: boolean;
};

export function ExchangeAgreementReview() {
  const [rows, setRows] = useState<ExhibitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  const [brand, setBrand] = useState<Brand | null>(null);
  const gridApiRef = useRef<any>(null);

  // Fetch brand-config once on mount; only cares about the slug + the
  // isCustomerBrand flag. Failure is silent — the grid falls back to
  // fleet-wide (matches Angular default behavior).
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
      } catch {
        // no-op — fleet-wide fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setErr(null);
      try {
        const res = await fetch('/rest/user/data-agreements/admin/exhibit-b', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const raw: ExhibitRow[] = Array.isArray(body?.rows) ? body.rows : [];
        // Sort: pending review first, then declined, then approved,
        // newest submission first within group.
        const rank: Record<string, number> = { pending: 0, declined: 1, approved: 2 };
        raw.sort((a, b) => {
          const ra = rank[String(a.REVIEW_STATUS || '').toLowerCase()] ?? 3;
          const rb = rank[String(b.REVIEW_STATUS || '').toLowerCase()] ?? 3;
          if (ra !== rb) return ra - rb;
          return String(b.DATE_AND_TIME_STAMP || b.EARLIEST_DATE || '').localeCompare(String(a.DATE_AND_TIME_STAMP || a.EARLIEST_DATE || ''));
        });
        setRows(raw);
        setAsOf(new Date().toISOString());
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const scoped = useMemo<ExhibitRow[]>(() => {
    if (!brand || !brand.isCustomerBrand || !brand.slug) return rows;
    const want = brand.slug.toLowerCase();
    return rows.filter((r) => String(r.CUSTOMER || '').toLowerCase() === want);
  }, [rows, brand]);

  const colDefs = useMemo<ColDef<ExhibitRow>[]>(() => [
    {
      headerName: 'Email',
      colId: 'email',
      width: 260,
      pinned: 'left',
      filter: 'agTextColumnFilter',
      valueGetter: (p: any) =>
        p.data?.SUBSCRIBERS_EMAIL_ADDRESS || p.data?.USER_ID_INTERNAL || p.data?.USER_ID || '',
      cellStyle: { fontFamily: 'monospace' } as any,
    },
    { field: 'SUBSCRIBERS_FIRST_NAME', headerName: 'First Name', width: 130, filter: 'agTextColumnFilter' },
    { field: 'SUBSCRIBERS_LAST_NAME',  headerName: 'Last Name',  width: 130, filter: 'agTextColumnFilter' },
    { field: 'CUSTOMER', headerName: 'Customer', width: 120, filter: 'agTextColumnFilter' },
    {
      field: 'PRO_STATUS', headerName: 'Application', width: 120, filter: 'agTextColumnFilter',
      cellStyle: (p: any) => {
        const v = p.value;
        if (v === 'Pro')     return { color: '#60a5fa', fontWeight: 600 } as any;
        if (v === 'Non-Pro') return { color: '#34d399', fontWeight: 600 } as any;
        return { color: '#6b7280' } as any;
      },
    },
    {
      field: 'REVIEW_STATUS', headerName: 'Status', width: 120, filter: 'agTextColumnFilter',
      cellStyle: (p: any) => {
        const s = String(p.value || '').toLowerCase();
        if (s === 'pending')  return { color: '#fbbf24', fontWeight: 600 } as any;
        if (s === 'approved') return { color: '#34d399', fontWeight: 600 } as any;
        if (s === 'declined') return { color: '#f87171', fontWeight: 600 } as any;
        return null;
      },
    },
    {
      headerName: 'Submitted',
      colId: 'submitted',
      width: 180,
      valueGetter: (p: any) => p.data?.DATE_AND_TIME_STAMP || p.data?.EARLIEST_DATE || null,
      valueFormatter: (p: any) => _fmtIso(p.value),
    },
    {
      headerName: 'Last Edited',
      colId: 'edited',
      width: 180,
      valueGetter: (p: any) => p.data?.EDITED_AT || null,
      valueFormatter: (p: any) => _fmtIso(p.value),
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true, sortable: true, filter: true,
  }), []);

  const pending  = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'pending').length;
  const approved = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'approved').length;
  const declined = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'declined').length;

  const scopeLabel = brand?.isCustomerBrand && brand?.slug
    ? `scoped to ${brand.name || brand.slug}`
    : 'fleet-wide';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1, color: '#e5e7eb', background: '#0b1220' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Exchange Agreement Review</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Native port of the Angular <code>/admin/exchange-agreement-review</code> panel. Row actions (approve / decline / view history) land in the phase-2 ship — this is the read-only pass so you can eyeball the list.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><b style={{ color: '#fbbf24' }}>{pending}</b> pending</span>
        <span><b style={{ color: '#34d399' }}>{approved}</b> approved</span>
        <span><b style={{ color: '#f87171' }}>{declined}</b> declined</span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
          background: brand?.isCustomerBrand ? '#1e3a8a' : '#334155',
          color: '#e5e7eb', fontSize: 11, fontWeight: 600,
        }}>{scopeLabel}</span>
        <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
          {loading ? 'Loading…' : `${scoped.length} total · as of ${asOf.slice(11, 19)} UTC`}
        </span>
      </div>
      {err && <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>Error: {err}</div>}
      <div className="ag-theme-quartz-dark" style={{ flex: 1, minHeight: 400, background: '#0b0f19' }}>
        <AgGridReact<ExhibitRow>
          rowData={scoped}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => {
            const uid = String(p.data.USER_ID_INTERNAL || p.data.USER_ID || p.data.SUBSCRIBERS_EMAIL_ADDRESS || '');
            return `${uid}|${String(p.data.CUSTOMER || '')}`;
          }}
          onGridReady={(e) => { gridApiRef.current = e.api; }}
          suppressCellFocus={true}
          rowHeight={28}
          headerHeight={30}
        />
      </div>
    </div>
  );
}

function _fmtIso(v: any): string {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16).replace('T', ' ') + ' UTC';
  return s;
}
