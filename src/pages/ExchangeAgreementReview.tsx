import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * IT-F2-416 c/4ba98c26 (Mike 2026-09-22): "exchange agreement review is
 * barely feature complete with the view button of the agreement,
 * selecting multiple users approving pro/non pro or declined button
 * live status etc". Phase 2 lift — the panel now matches the Angular
 * counterpart's feature set:
 *
 *   1. Row-checkbox selection + top action-bar (Approve Pro / Approve
 *      Non-Pro / Decline) that fires against every selected row.
 *   2. Bulk-decline reason input; button greys until a reason is typed.
 *   3. Per-row View button → modal showing raw agreement JSON + inline
 *      Approve Pro / Approve Non-Pro / Decline footer buttons.
 *   4. Live status via EventSource on /rest/admin/users-live/stream —
 *      debounced refetch on `entitlement_changed` envelopes so a review
 *      decision fired by ANY admin surfaces here without a manual reload.
 *   5. Customer scoping via brand-config on customer-branded hosts,
 *      fleet-wide on the F2 hub (matches the Angular default behavior).
 *
 * Endpoints (all under /rest/user/data-agreements/admin, cookie-authed
 * via the f2-members Vercel proxy on scanners.f2-tech.ai):
 *   POST /exhibit-b                          — row set
 *   POST /review {user_id,customer,decision,reason?,pro_override?}
 *   GET  /agreement/?user=<uid>&customer=<c> — full single row
 *   SSE  /admin/users-live/stream            — entitlement_changed
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
  REVIEW_REASON?: string;
  REVIEW_REVIEWED_AT?: string;
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

type Decision = 'approved' | 'declined';

function rowKey(r: ExhibitRow): string {
  const uid = String(r.USER_ID_INTERNAL || r.USER_ID || r.SUBSCRIBERS_EMAIL_ADDRESS || '');
  return `${uid}|${String(r.CUSTOMER || '')}`;
}

export function ExchangeAgreementReview() {
  const [rows, setRows] = useState<ExhibitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  const [brand, setBrand] = useState<Brand | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [viewRow, setViewRow] = useState<ExhibitRow | null>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const gridApiRef = useRef<any>(null);
  const liveTimerRef = useRef<any>(null);

  const showToast = useCallback((kind: 'ok' | 'err' | 'warn', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

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
      } catch { /* fleet-wide fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
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
      const raw: ExhibitRow[] = Array.isArray(body?.rows) ? body.rows : [];
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
      setErr(e?.message || 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // EventSource on the users-live SSE bridge. Any entitlement_changed
  // envelope schedules a debounced refetch so a decision fired from
  // another admin surface (or another tab) syncs here within a beat.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let closed = false;
    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource('/rest/admin/users-live/stream', { withCredentials: true });
        es.onmessage = (ev) => {
          try {
            const env = JSON.parse(ev.data || '{}');
            if (env?.op === 'entitlement_changed') {
              if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
              liveTimerRef.current = setTimeout(() => { void load(); }, 400);
            }
          } catch { /* ignore malformed envelope */ }
        };
        es.onerror = () => {
          try { es?.close(); } catch { /* ignore */ }
          if (!closed) setTimeout(connect, 3000);
        };
      } catch {
        if (!closed) setTimeout(connect, 5000);
      }
    };
    connect();
    return () => {
      closed = true;
      try { es?.close(); } catch { /* ignore */ }
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, [load]);

  const scoped = useMemo<ExhibitRow[]>(() => {
    if (!brand || !brand.isCustomerBrand || !brand.slug) return rows;
    const want = brand.slug.toLowerCase();
    return rows.filter((r) => String(r.CUSTOMER || '').toLowerCase() === want);
  }, [rows, brand]);

  const setBusy = useCallback((key: string, on: boolean) => {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const submitReview = useCallback(async (
    row: ExhibitRow, decision: Decision, reason: string | undefined, proOverride: boolean | undefined,
  ): Promise<boolean> => {
    const user_id = row.USER_ID_INTERNAL || row.USER_ID;
    const customer = row.CUSTOMER;
    if (!user_id || !customer) {
      showToast('err', 'missing user_id or customer on row');
      return false;
    }
    const body: any = { user_id, customer, decision };
    if (reason) body.reason = reason;
    if (typeof proOverride === 'boolean') body.pro_override = proOverride;
    try {
      const res = await fetch('/rest/user/data-agreements/admin/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j?.err || j?.success === false) throw new Error(j?.err || 'server did not confirm');
      return true;
    } catch (e: any) {
      showToast('err', `${decision} failed: ${e?.message || 'unknown'}`);
      return false;
    }
  }, [showToast]);

  const runSingle = useCallback(async (
    row: ExhibitRow, decision: Decision, proOverride?: boolean,
  ) => {
    const key = rowKey(row);
    if (busyKeys.has(key)) return;
    let reason = bulkReason.trim();
    if (decision === 'declined' && !reason) {
      showToast('warn', 'Enter a decline reason at the top before declining.');
      return;
    }
    setBusy(key, true);
    try {
      const ok = await submitReview(row, decision, reason || undefined, proOverride);
      if (ok) {
        showToast('ok', decision === 'approved'
          ? (proOverride === true ? 'Approved as Pro.' : proOverride === false ? 'Approved as Non-Pro.' : 'Approved.')
          : 'Declined — user stays in delayed data mode.');
        await load();
        if (viewRow && rowKey(viewRow) === key) closeView();
      }
    } finally {
      setBusy(key, false);
    }
  }, [busyKeys, bulkReason, submitReview, load, showToast, setBusy, viewRow]);

  const runBulk = useCallback(async (decision: Decision, proOverride?: boolean) => {
    if (bulkBusy) return;
    const targets = scoped.filter((r) => selected.has(rowKey(r)));
    if (targets.length === 0) return;
    const reason = bulkReason.trim();
    if (decision === 'declined' && !reason) {
      showToast('warn', 'Enter a decline reason before bulk decline.');
      return;
    }
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      const key = rowKey(r);
      setBusy(key, true);
      const success = await submitReview(r, decision, reason || undefined, proOverride);
      setBusy(key, false);
      if (success) ok++; else fail++;
    }
    setBulkBusy(false);
    const noun = decision === 'approved'
      ? (proOverride === true ? 'approved as Pro' : proOverride === false ? 'approved as Non-Pro' : 'approved')
      : 'declined';
    showToast(fail > 0 ? 'warn' : 'ok', `Bulk ${noun}: ${ok} succeeded${fail ? `, ${fail} failed` : ''}.`);
    setSelected(new Set());
    await load();
  }, [scoped, selected, bulkReason, bulkBusy, submitReview, showToast, setBusy, load]);

  const openView = useCallback(async (row: ExhibitRow) => {
    setViewRow(row);
    setViewDetail(null);
    setViewLoading(true);
    try {
      const user_id = row.USER_ID_INTERNAL || row.USER_ID;
      const customer = row.CUSTOMER;
      if (!user_id || !customer) throw new Error('missing user_id or customer');
      const url = `/rest/user/data-agreements/admin/agreement/?user=${encodeURIComponent(user_id)}&customer=${encodeURIComponent(customer)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.err) throw new Error(body.err);
      setViewDetail(body);
    } catch (e: any) {
      setViewDetail({ err: e?.message || 'failed to load agreement' });
    } finally {
      setViewLoading(false);
    }
  }, []);

  const closeView = useCallback(() => {
    setViewRow(null);
    setViewDetail(null);
    setViewLoading(false);
  }, []);

  const toggleRow = useCallback((key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    if (!on) { setSelected(new Set()); return; }
    setSelected(new Set(scoped.map(rowKey)));
  }, [scoped]);

  const colDefs = useMemo<ColDef<ExhibitRow>[]>(() => [
    {
      headerName: '',
      colId: 'sel',
      width: 48,
      pinned: 'left',
      sortable: false,
      filter: false,
      suppressMovable: true,
      headerComponentParams: {},
      headerComponent: () => null, // custom header rendered outside — checkbox in body
      cellRenderer: (p: any) => {
        const key = rowKey(p.data);
        const checked = selected.has(key);
        const busy = busyKeys.has(key);
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={busy || bulkBusy}
            onChange={(e) => toggleRow(key, e.target.checked)}
          />
        ) as any;
      },
    },
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
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 100,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <button
          type="button"
          onClick={() => openView(p.data)}
          style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 4,
            background: '#374151', color: '#e5e7eb', border: '1px solid #4b5563',
            cursor: 'pointer',
          }}
        >View</button>
      ) as any,
    },
  ], [selected, busyKeys, bulkBusy, toggleRow, openView]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true, sortable: true, filter: true,
  }), []);

  const pending  = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'pending').length;
  const approved = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'approved').length;
  const declined = scoped.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'declined').length;

  const selCount = selected.size;
  const allChecked = scoped.length > 0 && selCount === scoped.length;
  const declineDisabled = bulkBusy || selCount === 0 || !bulkReason.trim();
  const approveDisabled = bulkBusy || selCount === 0;

  const scopeLabel = brand?.isCustomerBrand && brand?.slug
    ? `scoped to ${brand.name || brand.slug}`
    : 'fleet-wide';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1, color: '#e5e7eb', background: '#0b1220' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Exchange Agreement Review</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Native port of the Angular <code>/admin/exchange-agreement-review</code> panel. Live-refresh via <code>users-live</code> SSE — any decision made elsewhere reflects here within a beat.
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

      {/* Bulk action bar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, background: '#111827', border: '1px solid #1f2937', borderRadius: 6,
      }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
          <span>Select all {scoped.length ? `(${scoped.length})` : ''}</span>
        </label>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{selCount} selected</span>
        <input
          type="text"
          placeholder="Decline reason (required for decline)"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          style={{ flex: '1 1 260px', minWidth: 180 }}
        />
        <button
          type="button"
          disabled={approveDisabled}
          onClick={() => runBulk('approved', true)}
          style={_btn('#1e3a8a', approveDisabled)}
          title="Approve as Pro (delayed data)"
        >Approve as Pro</button>
        <button
          type="button"
          disabled={approveDisabled}
          onClick={() => runBulk('approved', false)}
          style={_btn('#15803d', approveDisabled)}
          title="Approve as Non-Pro (live data granted)"
        >Approve as Non-Pro</button>
        <button
          type="button"
          disabled={declineDisabled}
          onClick={() => runBulk('declined')}
          style={_btn('#7f1d1d', declineDisabled)}
        >Decline</button>
      </div>

      {err && <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>Error: {err}</div>}

      <div className="ag-theme-quartz-dark" style={{ flex: 1, minHeight: 400, background: '#0b0f19' }}>
        <AgGridReact<ExhibitRow>
          rowData={scoped}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => rowKey(p.data)}
          onGridReady={(e) => { gridApiRef.current = e.api; }}
          suppressCellFocus={true}
          rowHeight={30}
          headerHeight={32}
        />
      </div>

      {viewRow && (
        <div
          onClick={closeView}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 90vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              background: '#0f172a', color: '#e5e7eb', border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {viewRow.SUBSCRIBERS_EMAIL_ADDRESS || viewRow.USER_ID_INTERNAL || viewRow.USER_ID || '(no email)'}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {viewRow.CUSTOMER || '—'} · status <b>{viewRow.REVIEW_STATUS || '—'}</b> · {viewRow.PRO_STATUS || '—'}
                </div>
              </div>
              <button type="button" onClick={closeView} style={_btn('#374151', false)}>Close</button>
            </div>
            <div style={{ padding: 16, overflow: 'auto', flex: 1, fontSize: 12 }}>
              {viewLoading && <div style={{ color: '#9ca3af' }}>Loading agreement…</div>}
              {!viewLoading && viewDetail?.err && (
                <div style={{ color: '#fecaca' }}>Error: {viewDetail.err}</div>
              )}
              {!viewLoading && viewDetail && !viewDetail.err && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#cbd5e1', fontFamily: 'monospace' }}>
                  {JSON.stringify(viewDetail, null, 2)}
                </pre>
              )}
            </div>
            <div style={{
              padding: '10px 16px', borderTop: '1px solid #1f2937',
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 'auto' }}>
                Uses the top-of-panel decline reason.
              </span>
              <button
                type="button"
                disabled={busyKeys.has(rowKey(viewRow))}
                onClick={() => runSingle(viewRow, 'approved', true)}
                style={_btn('#1e3a8a', busyKeys.has(rowKey(viewRow)))}
              >Approve as Pro</button>
              <button
                type="button"
                disabled={busyKeys.has(rowKey(viewRow))}
                onClick={() => runSingle(viewRow, 'approved', false)}
                style={_btn('#15803d', busyKeys.has(rowKey(viewRow)))}
              >Approve as Non-Pro</button>
              <button
                type="button"
                disabled={busyKeys.has(rowKey(viewRow)) || !bulkReason.trim()}
                onClick={() => runSingle(viewRow, 'declined')}
                style={_btn('#7f1d1d', busyKeys.has(rowKey(viewRow)) || !bulkReason.trim())}
              >Decline</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 60,
          padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: toast.kind === 'ok' ? '#065f46' : toast.kind === 'warn' ? '#78350f' : '#7f1d1d',
          color: '#f3f4f6', border: '1px solid rgba(255,255,255,0.1)',
          maxWidth: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>{toast.text}</div>
      )}
    </div>
  );
}

function _btn(bg: string, disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12, padding: '6px 12px', borderRadius: 4,
    background: disabled ? '#374151' : bg,
    color: disabled ? '#6b7280' : '#f3f4f6',
    border: `1px solid ${disabled ? '#4b5563' : 'rgba(255,255,255,0.1)'}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
  };
}

function _fmtIso(v: any): string {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 16).replace('T', ' ') + ' UTC';
  return s;
}
