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
 * MVP: fetch exhibit-b rows + render in ag-grid with the fleet
 * quartz-dark theme. Approve / decline actions land in a follow-up
 * (checklist item 703492b1); this is the read-only surface Mike can
 * eyeball first.
 *
 * Backend: POST /rest/user/data-agreements/admin/exhibit-b (in
 * f2-admin-service{,2} DataAgreementsController; scanners.f2-tech.ai
 * proxies /rest/* to f2-admin-service2 same-origin so cookies flow).
 * IT-F2-416 c/161b0843 fix — the initial port had /rest/admin/exhibit-b
 * which is a 404 route; the real controller mount is under /user/
 * data-agreements/. Angular counterpart calls the same absolute path.
 */

type ExhibitRow = {
  USERNAME?: string;
  EMAIL?: string;
  FIRST_NAME?: string;
  LAST_NAME?: string;
  CUSTOMER?: string;
  PRO_STATUS?: string;
  REVIEW_STATUS?: string;
  COMPLETED?: string | boolean;
  DATE_AND_TIME_STAMP?: string;
  EARLIEST_DATE?: string;
  [k: string]: any;
};

export function ExchangeAgreementReview() {
  const [rows, setRows] = useState<ExhibitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  const gridApiRef = useRef<any>(null);

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

  const colDefs = useMemo<ColDef<ExhibitRow>[]>(() => [
    { field: 'EMAIL', headerName: 'Email', width: 240, pinned: 'left', filter: 'agTextColumnFilter' },
    { field: 'FIRST_NAME', headerName: 'First', width: 110, filter: 'agTextColumnFilter' },
    { field: 'LAST_NAME', headerName: 'Last', width: 110, filter: 'agTextColumnFilter' },
    { field: 'CUSTOMER', headerName: 'Customer', width: 120, filter: 'agTextColumnFilter' },
    { field: 'PRO_STATUS', headerName: 'Pro', width: 90, filter: 'agTextColumnFilter' },
    {
      field: 'REVIEW_STATUS', headerName: 'Review', width: 110, filter: 'agTextColumnFilter',
      cellStyle: (p: any) => {
        const s = String(p.value || '').toLowerCase();
        if (s === 'pending')  return { color: '#fbbf24', fontWeight: 600 } as any;
        if (s === 'approved') return { color: '#34d399', fontWeight: 600 } as any;
        if (s === 'declined') return { color: '#f87171', fontWeight: 600 } as any;
        return null;
      },
    },
    { field: 'COMPLETED', headerName: 'Completed', width: 110, valueFormatter: (p) => (p.value ? '✓' : '') },
    { field: 'DATE_AND_TIME_STAMP', headerName: 'Submitted', width: 190, valueFormatter: (p) => _fmtIso(p.value) },
    { field: 'EARLIEST_DATE', headerName: 'First seen', width: 190, valueFormatter: (p) => _fmtIso(p.value) },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true, sortable: true, filter: true,
  }), []);

  const pending = rows.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'pending').length;
  const approved = rows.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'approved').length;
  const declined = rows.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'declined').length;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1, color: '#e5e7eb' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Exchange Agreement Review</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Native port of the Angular <code>/admin/exchange-agreement-review</code> panel. Row actions (approve / decline / view history) land in the phase-2 ship — this is the read-only pass so you can eyeball the list.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
        <span><b style={{ color: '#fbbf24' }}>{pending}</b> pending</span>
        <span><b style={{ color: '#34d399' }}>{approved}</b> approved</span>
        <span><b style={{ color: '#f87171' }}>{declined}</b> declined</span>
        <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
          {loading ? 'Loading…' : `${rows.length} total · as of ${asOf.slice(11, 19)} UTC`}
        </span>
      </div>
      {err && <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>Error: {err}</div>}
      <div className="ag-theme-quartz-dark" style={{ flex: 1, minHeight: 400, background: '#0b0f19' }}>
        <AgGridReact<ExhibitRow>
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => `${String(p.data.EMAIL || p.data.USERNAME)}::${String(p.data.CUSTOMER || '')}`}
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
  // Try to render as YYYY-MM-DD HH:MM UTC
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16).replace('T', ' ') + ' UTC';
  return s;
}
