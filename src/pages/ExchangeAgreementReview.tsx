import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule, ModuleRegistry, type ColDef, type GridApi,
} from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * IT-F2-416 c/c53f1818 + c/0995933e + c/13c6a6cb + c/f788ab2e + c/69941d2d
 * (Mike 2026-09-22 → 2026-09-23): full parity re-lift with the Angular
 * /admin/exchange-agreement-review reference.
 *
 * Feature list ported (each keyed by comment id):
 *   c/c53f1818 — structured View modal (Contact & Address / Employer /
 *                Employment / 11 Question Answers / Agreements Accepted
 *                / Reason input / Copy JSON) instead of raw JSON dump.
 *   c/0995933e — grid renders dark. Root fix: v33 quartz layout rules
 *                target .ag-theme-quartz only; the dark variant class
 *                alone gets vars but no layout — so we apply BOTH
 *                classes AND set data-ag-theme-mode="dark".
 *   c/13c6a6cb — per-column floating filters + top toolbar (Filter
 *                dropdown, free-text Search, Refresh, Export CSV) + Re-
 *                eval bulk button.
 *   c/f788ab2e — "missing features when you brought it over" — covered
 *                by everything above.
 *   c/69941d2d — hide the Customer grid column when the panel is
 *                already scoped to a single customer (brand-driven);
 *                fleet-wide shows Customer.
 *
 * Layered on the earlier ships (multi-select bulk actions, SSE live-
 * refresh, brand-config scoping, mint-then-EventSource for SSE).
 *
 * Endpoints under /rest/user/data-agreements/admin (cookie-authed via
 * f2-members Vercel proxy on scanners.f2-tech.ai):
 *   POST /exhibit-b                          — row set
 *   POST /review {user_id,customer,decision,reason?,pro_override?}
 *   POST /reeval {user_id,customer}          — re-derive Pro
 *   GET  /agreement?user=<uid>&customer=<c>  — full single row
 * Plus /admin/users-live/stream(-token) for entitlement_changed pushes.
 */

type QuestionKey =
  | 'personal_use' | 'business_use' | 'registered_sec' | 'registered_agency'
  | 'perform_functions' | 'investment_advice' | 'asset_manager'
  | 'capital_usage' | 'entity_trading' | 'profit_sharing' | 'benefits_exchange';

const QUESTIONS: { key: QuestionKey; label: string }[] = [
  { key: 'personal_use',      label: 'Uses market data for personal, non-business use' },
  { key: 'business_use',      label: 'Uses market data for business use' },
  { key: 'registered_sec',    label: 'Registered with the SEC' },
  { key: 'registered_agency', label: 'Registered with a US state agency (CFTC, NFA, MSRB, state commission)' },
  { key: 'perform_functions', label: 'Performs financial-services functions requiring registration' },
  { key: 'investment_advice', label: 'Provides investment advice for compensation' },
  { key: 'asset_manager',     label: 'Manages assets for others' },
  { key: 'capital_usage',     label: 'Uses market data with capital of others' },
  { key: 'entity_trading',    label: 'Trades on behalf of an entity' },
  { key: 'profit_sharing',    label: 'Shares in profits from market-data-based trading' },
  { key: 'benefits_exchange', label: 'Receives benefits from an exchange for market-data use' },
];

type ExhibitRow = {
  USER_ID?: string;
  USER_ID_INTERNAL?: string;
  SUBSCRIBERS_EMAIL_ADDRESS?: string;
  SUBSCRIBERS_FIRST_NAME?: string;
  SUBSCRIBERS_LAST_NAME?: string;
  SUBSCRIBERS_TELEPHONE_NUMBER?: string;
  SUBSCRIBERS_COUNTRY?: string;
  SUBSCRIBERS_OCCUPATION?: string;
  SUBSCRIBERS_EMPLOYMENT_FUNCTION?: string;
  'SUBSCRIBERS_TITLE/POSITION'?: string;
  EMPLOYERS_NAME?: string;
  EMPLOYERS_ADDRESS?: string;
  EMPLOYERS_CITY?: string;
  EMPLOYERS_STATE?: string;
  EMPLOYERS_ZIP_CODE?: string;
  EMPLOYERS_COUNTRY?: string;
  CUSTOMER?: string;
  PRO_STATUS?: string;
  REVIEW_STATUS?: string;
  REVIEW_REASON?: string;
  DATE_AND_TIME_STAMP?: string;
  EARLIEST_DATE?: string;
  EDITED_AT?: string;
  APPLICATION_DETAIL?: {
    address?: string; city?: string; state?: string; zip_code?: string; country?: string;
    outside_us?: any; employer_outside_us?: any;
    employment_status?: string; other_employment?: string;
    questions?: Partial<Record<QuestionKey, any>>;
    agree_to_forms?: boolean; agree_to_terms?: boolean; agree_to_notify?: boolean;
    agree_to_signature?: boolean; electronic_signature?: string;
  };
  [k: string]: any;
};

type Brand = { slug: string; name?: string; isCustomerBrand?: boolean };
type Decision = 'approved' | 'declined';
type ReviewFilter = 'all' | 'pending' | 'approved' | 'declined';

function rowKey(r: ExhibitRow): string {
  const uid = String(r.USER_ID_INTERNAL || r.USER_ID || r.SUBSCRIBERS_EMAIL_ADDRESS || '');
  return `${uid}|${String(r.CUSTOMER || '')}`;
}

function yesNo(v: any): 'Yes' | 'No' | '—' {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'yes' || s === 'true' || v === true) return 'Yes';
  if (s === 'no' || s === 'false' || v === false) return 'No';
  return '—';
}

function statusChip(row: ExhibitRow): { label: string; bg: string; color: string } {
  const s = String(row?.REVIEW_STATUS || 'pending').toLowerCase();
  if (s === 'approved') {
    const pro = row?.PRO_STATUS === 'Pro';
    return pro
      ? { label: 'Pro — Approved',     bg: '#1e3a8a', color: '#93c5fd' }
      : { label: 'Non-Pro — Approved', bg: '#065f46', color: '#6ee7b7' };
  }
  if (s === 'declined') return { label: 'Declined', bg: '#7f1d1d', color: '#fca5a5' };
  return { label: 'Pending Review', bg: '#374151', color: '#e5e7eb' };
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
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewRow, setViewRow] = useState<ExhibitRow | null>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewReason, setViewReason] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const gridApiRef = useRef<GridApi | null>(null);
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
      } catch { /* fleet-wide */ }
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

  // SSE — mint then connect, re-mint before TTL.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let closed = false;
    let renewTimer: any = null;
    const mint = async (): Promise<string | null> => {
      try {
        const r = await fetch('/rest/admin/users-live/stream-token', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!r.ok) return null;
        const j = await r.json();
        return typeof j?.token === 'string' && j.token ? j.token : null;
      } catch { return null; }
    };
    const connect = async () => {
      if (closed) return;
      const token = await mint();
      if (closed) return;
      if (!token) { renewTimer = setTimeout(connect, 8000); return; }
      try {
        es = new EventSource(`/rest/admin/users-live/stream?token=${encodeURIComponent(token)}`);
        es.onmessage = (ev) => {
          try {
            const env = JSON.parse(ev.data || '{}');
            if (env?.op === 'entitlement_changed') {
              if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
              liveTimerRef.current = setTimeout(() => { void load(); }, 400);
            }
          } catch { /* ignore */ }
        };
        es.onerror = () => {
          try { es?.close(); } catch { /* ignore */ }
          es = null;
          if (!closed) renewTimer = setTimeout(connect, 3000);
        };
        renewTimer = setTimeout(() => {
          try { es?.close(); } catch { /* ignore */ }
          es = null;
          if (!closed) void connect();
        }, 55000);
      } catch {
        if (!closed) renewTimer = setTimeout(connect, 5000);
      }
    };
    void connect();
    return () => {
      closed = true;
      try { es?.close(); } catch { /* ignore */ }
      if (renewTimer) clearTimeout(renewTimer);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, [load]);

  const scopedByCustomer = useMemo<ExhibitRow[]>(() => {
    if (!brand || !brand.isCustomerBrand || !brand.slug) return rows;
    const want = brand.slug.toLowerCase();
    return rows.filter((r) => String(r.CUSTOMER || '').toLowerCase() === want);
  }, [rows, brand]);

  // Apply top-toolbar review-filter + free-text search before feeding
  // the grid. The grid's per-column floating filters layer on top.
  const filtered = useMemo<ExhibitRow[]>(() => {
    let out = scopedByCustomer;
    if (reviewFilter !== 'all') {
      out = out.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === reviewFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const hay = [
          r.SUBSCRIBERS_EMAIL_ADDRESS, r.USER_ID_INTERNAL, r.USER_ID,
          r.SUBSCRIBERS_FIRST_NAME, r.SUBSCRIBERS_LAST_NAME, r.CUSTOMER,
        ].map((x) => String(x || '').toLowerCase()).join('|');
        return hay.includes(q);
      });
    }
    return out;
  }, [scopedByCustomer, reviewFilter, searchQuery]);

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
    if (!user_id || !customer) { showToast('err', 'missing user_id or customer on row'); return false; }
    const body: any = { user_id, customer, decision };
    if (reason) body.reason = reason;
    if (typeof proOverride === 'boolean') body.pro_override = proOverride;
    try {
      const res = await fetch('/rest/user/data-agreements/admin/review', {
        method: 'POST', credentials: 'include',
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

  const submitReeval = useCallback(async (row: ExhibitRow): Promise<{ ok: boolean; before?: any; after?: any }> => {
    const user_id = row.USER_ID_INTERNAL || row.USER_ID;
    const customer = row.CUSTOMER;
    if (!user_id || !customer) { showToast('err', 'missing user_id or customer on row'); return { ok: false }; }
    try {
      const res = await fetch('/rest/user/data-agreements/admin/reeval', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id, customer }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j?.err || j?.success === false) throw new Error(j?.err || 'server did not confirm');
      return { ok: true, before: j.before, after: j.after };
    } catch (e: any) {
      showToast('err', `re-eval failed: ${e?.message || 'unknown'}`);
      return { ok: false };
    }
  }, [showToast]);

  const runSingle = useCallback(async (
    row: ExhibitRow, decision: Decision, proOverride?: boolean, reasonOverride?: string,
  ) => {
    const key = rowKey(row);
    if (busyKeys.has(key)) return;
    const reason = (reasonOverride ?? bulkReason).trim();
    if (decision === 'declined' && !reason) {
      showToast('warn', 'Enter a decline reason.');
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
    } finally { setBusy(key, false); }
  }, [busyKeys, bulkReason, submitReview, load, showToast, setBusy, viewRow]);

  const runBulk = useCallback(async (decision: Decision, proOverride?: boolean) => {
    if (bulkBusy) return;
    const targets = filtered.filter((r) => selected.has(rowKey(r)));
    if (targets.length === 0) return;
    const reason = bulkReason.trim();
    if (decision === 'declined' && !reason) { showToast('warn', 'Enter a decline reason.'); return; }
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
  }, [filtered, selected, bulkReason, bulkBusy, submitReview, showToast, setBusy, load]);

  const runReevalBulk = useCallback(async () => {
    if (bulkBusy) return;
    const targets = filtered.filter((r) => selected.has(rowKey(r)));
    if (targets.length === 0) return;
    setBulkBusy(true);
    let changed = 0, unchanged = 0, fail = 0;
    for (const r of targets) {
      const key = rowKey(r);
      setBusy(key, true);
      const res = await submitReeval(r);
      setBusy(key, false);
      if (!res.ok) { fail++; continue; }
      const flip = res.before?.pro_access !== res.after?.pro_access
        || res.before?.live_data_access !== res.after?.live_data_access;
      if (flip) changed++; else unchanged++;
    }
    setBulkBusy(false);
    showToast(fail > 0 ? 'warn' : 'ok', `Re-eval: ${changed} changed · ${unchanged} unchanged${fail ? ` · ${fail} failed` : ''}.`);
    setSelected(new Set());
    await load();
  }, [filtered, selected, bulkBusy, submitReeval, showToast, setBusy, load]);

  const openView = useCallback(async (row: ExhibitRow) => {
    setViewRow(row);
    setViewDetail(null);
    setViewLoading(true);
    setViewReason('');
    try {
      const user_id = row.USER_ID_INTERNAL || row.USER_ID;
      const customer = row.CUSTOMER;
      if (!user_id || !customer) throw new Error('missing user_id or customer');
      const url = `/rest/user/data-agreements/admin/agreement?user=${encodeURIComponent(user_id)}&customer=${encodeURIComponent(customer)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.err) throw new Error(body.err);
      setViewDetail(body);
    } catch (e: any) {
      setViewDetail({ err: e?.message || 'failed to load agreement' });
    } finally { setViewLoading(false); }
  }, []);

  const closeView = useCallback(() => {
    setViewRow(null);
    setViewDetail(null);
    setViewLoading(false);
    setViewReason('');
  }, []);

  const copyJson = useCallback(() => {
    const payload = viewDetail && !viewDetail.err ? viewDetail : viewRow;
    try {
      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      showToast('ok', 'Agreement JSON copied to clipboard.');
    } catch {
      showToast('err', 'Copy failed — clipboard access blocked.');
    }
  }, [viewDetail, viewRow, showToast]);

  const toggleRow = useCallback((key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    if (!on) { setSelected(new Set()); return; }
    setSelected(new Set(filtered.map(rowKey)));
  }, [filtered]);

  const exportCsv = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    api.exportDataAsCsv({
      fileName: `agreement-review-${reviewFilter}-${stamp}.csv`,
      onlySelectedAllFiltered: false,
      allColumns: false,
    });
    showToast('ok', 'CSV export downloaded.');
  }, [reviewFilter, showToast]);

  const hideCustomer = !!(brand?.isCustomerBrand && brand?.slug);

  const colDefs = useMemo<ColDef<ExhibitRow>[]>(() => [
    {
      headerName: '',
      colId: 'sel',
      width: 44,
      pinned: 'left',
      sortable: false,
      filter: false,
      suppressMovable: true,
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
      floatingFilter: true,
      valueGetter: (p: any) =>
        p.data?.SUBSCRIBERS_EMAIL_ADDRESS || p.data?.USER_ID_INTERNAL || p.data?.USER_ID || '',
      cellStyle: { fontFamily: 'monospace' } as any,
    },
    { field: 'SUBSCRIBERS_FIRST_NAME', headerName: 'First Name', width: 130, filter: 'agTextColumnFilter', floatingFilter: true },
    { field: 'SUBSCRIBERS_LAST_NAME',  headerName: 'Last Name',  width: 130, filter: 'agTextColumnFilter', floatingFilter: true },
    // Customer column hidden when the panel is scoped to a specific
    // customer (c/69941d2d) — the badge in the header already tells
    // you which customer's rows you're looking at.
    ...(hideCustomer ? [] : [{
      field: 'CUSTOMER', headerName: 'Customer', width: 120,
      filter: 'agTextColumnFilter', floatingFilter: true,
    } as ColDef<ExhibitRow>]),
    {
      headerName: 'Submitted',
      colId: 'submitted',
      width: 180,
      filter: 'agDateColumnFilter',
      floatingFilter: true,
      valueGetter: (p: any) => p.data?.DATE_AND_TIME_STAMP || p.data?.EARLIEST_DATE || null,
      valueFormatter: (p: any) => _fmtIso(p.value),
    },
    {
      headerName: 'Last Edited',
      colId: 'edited',
      width: 180,
      filter: 'agDateColumnFilter',
      floatingFilter: true,
      valueGetter: (p: any) => p.data?.EDITED_AT || null,
      valueFormatter: (p: any) => _fmtIso(p.value),
    },
    {
      field: 'PRO_STATUS', headerName: 'Application', width: 130,
      filter: 'agTextColumnFilter', floatingFilter: true,
      cellStyle: (p: any) => {
        const v = p.value;
        if (v === 'Pro')     return { color: '#60a5fa', fontWeight: 600 } as any;
        if (v === 'Non-Pro') return { color: '#34d399', fontWeight: 600 } as any;
        return { color: '#6b7280' } as any;
      },
    },
    {
      field: 'REVIEW_STATUS', headerName: 'Status', width: 150,
      filter: 'agTextColumnFilter', floatingFilter: true,
      cellRenderer: (p: any) => {
        const chip = statusChip(p.data);
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
            fontSize: 11, fontWeight: 600, background: chip.bg, color: chip.color,
          }}>{chip.label}</span>
        ) as any;
      },
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 130,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => {
        const key = rowKey(p.data);
        const busy = busyKeys.has(key) || bulkBusy;
        return (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(key, true);
                const res = await submitReeval(p.data);
                setBusy(key, false);
                if (res.ok) {
                  const flip = res.before?.pro_access !== res.after?.pro_access
                    || res.before?.live_data_access !== res.after?.live_data_access;
                  showToast('ok', flip ? 'Re-eval: classification changed.' : 'Re-eval: no change.');
                  await load();
                }
              }}
              title="Re-derive Pro status from stored answers"
              style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 3,
                background: busy ? '#4b5563' : '#374151', color: '#e5e7eb',
                border: '1px solid #4b5563', cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >⟳</button>
            <button
              type="button"
              onClick={() => openView(p.data)}
              style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 3,
                background: '#374151', color: '#e5e7eb',
                border: '1px solid #4b5563', cursor: 'pointer',
              }}
            >View</button>
          </span>
        ) as any;
      },
    },
  ], [selected, busyKeys, bulkBusy, toggleRow, openView, submitReeval, setBusy, showToast, load, hideCustomer]);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true, sortable: true, filter: true,
  }), []);

  const pending  = scopedByCustomer.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'pending').length;
  const approved = scopedByCustomer.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'approved').length;
  const declined = scopedByCustomer.filter((r) => String(r.REVIEW_STATUS || '').toLowerCase() === 'declined').length;

  const selCount = selected.size;
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(rowKey(r)));
  const declineDisabled = bulkBusy || selCount === 0 || !bulkReason.trim();
  const approveDisabled = bulkBusy || selCount === 0;
  const reevalDisabled  = bulkBusy || selCount === 0;

  const scopeLabel = brand?.isCustomerBrand && brand?.slug
    ? `scoped to ${brand.name || brand.slug}`
    : 'fleet-wide';

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1, color: '#e5e7eb', background: '#0b1220' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Exchange Agreement Review</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Approve grants live data (Cognito <code>custom:live_data_access</code> flip); decline revokes it and reverts to delayed-data mode. All decisions land in <code>F2-ADMIN.ReviewAudit</code>. Panel updates live from any admin.
        </p>
      </div>

      {/* Top toolbar — filter + search + counts + refresh + export */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          Filter:
          <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value as ReviewFilter)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
            <option value="all">All</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          Search:
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="email / name / customer / user id"
            style={{ width: 260 }}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} style={{
              fontSize: 11, padding: '2px 8px', background: '#374151', border: '1px solid #4b5563',
              borderRadius: 3, color: '#e5e7eb', cursor: 'pointer',
            }}>clear</button>
          )}
        </label>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
        {pending > 0 && (
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: '#dc2626', color: '#fff',
          }}>{pending} pending</span>
        )}
        <span><b style={{ color: '#fbbf24' }}>{pending}</b> <span style={{ color: '#9ca3af' }}>pending</span></span>
        <span><b style={{ color: '#34d399' }}>{approved}</b> <span style={{ color: '#9ca3af' }}>approved</span></span>
        <span><b style={{ color: '#f87171' }}>{declined}</b> <span style={{ color: '#9ca3af' }}>declined</span></span>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
          background: brand?.isCustomerBrand ? '#1e3a8a' : '#334155',
          color: '#e5e7eb', fontSize: 11, fontWeight: 600,
        }}>{scopeLabel}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          <button type="button" onClick={() => void load()} disabled={loading} style={_btn('#374151', loading)}>
            ⟳ Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || filtered.length === 0} style={_btn('#374151', loading || filtered.length === 0)}>
            ↓ Export CSV
          </button>
        </span>
      </div>

      {/* Bulk action bar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, background: '#111827', border: '1px solid #1f2937', borderRadius: 6,
      }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
          <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} />
          <span>Select all {filtered.length ? `(${filtered.length})` : ''}</span>
        </label>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{selCount} selected</span>
        {selCount > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy}
            style={{
              fontSize: 11, background: 'transparent', border: 'none', color: '#9ca3af',
              textDecoration: 'underline', cursor: bulkBusy ? 'not-allowed' : 'pointer',
            }}
          >Clear selection</button>
        )}
        <input
          type="text"
          placeholder="Reason (required to Decline; optional for Approve)"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 180 }}
        />
        <button type="button" disabled={approveDisabled} onClick={() => runBulk('approved', true)}   style={_btn('#1e3a8a', approveDisabled)}>Approve as Pro{selCount > 0 ? ` (${selCount})` : ''}</button>
        <button type="button" disabled={approveDisabled} onClick={() => runBulk('approved', false)}  style={_btn('#15803d', approveDisabled)}>Approve as Non-Pro{selCount > 0 ? ` (${selCount})` : ''}</button>
        <button type="button" disabled={declineDisabled} onClick={() => runBulk('declined')}         style={_btn('#7f1d1d', declineDisabled)}>Decline{selCount > 0 ? ` (${selCount})` : ''}</button>
        <button type="button" disabled={reevalDisabled}  onClick={runReevalBulk}                     style={_btn('#374151', reevalDisabled)}>⟳ Re-eval{selCount > 0 ? ` (${selCount})` : ''}</button>
        {bulkBusy && <span style={{ fontSize: 12, color: '#9ca3af' }}>Applying…</span>}
      </div>

      {err && <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>Error: {err}</div>}

      <div className="ag-theme-quartz ag-theme-quartz-dark" data-ag-theme-mode="dark" style={{ flex: 1, minHeight: 400 }}>
        <AgGridReact<ExhibitRow>
          rowData={filtered}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => rowKey(p.data)}
          onGridReady={(e) => { gridApiRef.current = e.api; }}
          suppressCellFocus={true}
          rowHeight={30}
          headerHeight={32}
          floatingFiltersHeight={30}
        />
      </div>

      {viewRow && (
        <ViewModal
          row={viewRow}
          detail={viewDetail}
          loading={viewLoading}
          busy={busyKeys.has(rowKey(viewRow))}
          reason={viewReason}
          onReason={setViewReason}
          onClose={closeView}
          onCopyJson={copyJson}
          onApprovePro={() => runSingle(viewRow, 'approved', true, viewReason)}
          onApproveNonPro={() => runSingle(viewRow, 'approved', false, viewReason)}
          onDecline={() => runSingle(viewRow, 'declined', undefined, viewReason)}
        />
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

/* ── View modal ────────────────────────────────────────────────── */

function ViewModal(props: {
  row: ExhibitRow;
  detail: any;
  loading: boolean;
  busy: boolean;
  reason: string;
  onReason: (v: string) => void;
  onClose: () => void;
  onCopyJson: () => void;
  onApprovePro: () => void;
  onApproveNonPro: () => void;
  onDecline: () => void;
}) {
  const { row, detail, loading, busy, reason } = props;
  // Merge the row (Exhibit-B projection) with detail (full agreement)
  // so we can prefer detail fields when available.
  const merged = useMemo<ExhibitRow>(() => {
    if (detail && !detail.err && typeof detail === 'object') {
      return { ...row, ...detail } as ExhibitRow;
    }
    return row;
  }, [row, detail]);
  const app = merged.APPLICATION_DETAIL || {};
  const questions = (app.questions || {}) as Partial<Record<QuestionKey, any>>;
  const chip = statusChip(merged);
  const submitted = merged.DATE_AND_TIME_STAMP || merged.EARLIEST_DATE || null;

  return (
    <div
      onClick={props.onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          background: '#0f172a', color: '#e5e7eb', border: '1px solid #1f2937',
          borderRadius: 8, overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1f2937', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {(merged.SUBSCRIBERS_FIRST_NAME || '') + ' ' + (merged.SUBSCRIBERS_LAST_NAME || '')}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              <span style={{ fontFamily: 'monospace' }}>{merged.SUBSCRIBERS_EMAIL_ADDRESS || '—'}</span>
              {' · Customer: '}<b>{merged.CUSTOMER || '—'}</b>
              {' · Submitted: '}{submitted ? _fmtIso(submitted) : '—'}
            </div>
          </div>
          <span style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: chip.bg, color: chip.color, whiteSpace: 'nowrap',
          }}>{chip.label}</span>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflow: 'auto', flex: 1, fontSize: 13 }}>
          {loading && <div style={{ color: '#9ca3af' }}>Loading agreement…</div>}
          {!loading && detail?.err && (
            <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 12 }}>
              Error: {detail.err}
            </div>
          )}
          {!loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Section title="Contact & Address">
                <TwoCol>
                  <Field label="Phone" v={merged.SUBSCRIBERS_TELEPHONE_NUMBER} />
                  <Field label="Outside US" v={yesNo(app.outside_us)} highlight />
                  <Field label="Street" v={app.address} colSpan={2} />
                  <Field label="City" v={app.city} />
                  <Field label="State" v={app.state} />
                  <Field label="Zip" v={app.zip_code} />
                  <Field label="Country" v={app.country || merged.SUBSCRIBERS_COUNTRY} />
                </TwoCol>
              </Section>
              <Section title="Employer">
                <TwoCol>
                  <Field label="Name" v={merged.EMPLOYERS_NAME} colSpan={2} />
                  <Field label="Address" v={merged.EMPLOYERS_ADDRESS} colSpan={2} />
                  <Field label="City" v={merged.EMPLOYERS_CITY} />
                  <Field label="State" v={merged.EMPLOYERS_STATE} />
                  <Field label="Zip" v={merged.EMPLOYERS_ZIP_CODE} />
                  <Field label="Country" v={merged.EMPLOYERS_COUNTRY} />
                  <Field label="Employer outside US" v={yesNo(app.employer_outside_us)} highlight colSpan={2} />
                </TwoCol>
              </Section>
              <Section title="Employment">
                <TwoCol>
                  <Field label="Status" v={app.employment_status} />
                  <Field label="Occupation" v={merged.SUBSCRIBERS_OCCUPATION} />
                  <Field label="Job title" v={merged['SUBSCRIBERS_TITLE/POSITION']} />
                  <Field label="Function" v={merged.SUBSCRIBERS_EMPLOYMENT_FUNCTION} />
                  <Field label="Other" v={app.other_employment} colSpan={2} />
                </TwoCol>
              </Section>
              <Section title="Question Answers">
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
                  {QUESTIONS.map((q) => {
                    const v = yesNo(questions[q.key]);
                    const color = v === 'Yes' ? '#34d399' : v === 'No' ? '#f87171' : '#6b7280';
                    return (
                      <li key={q.key} style={{
                        display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between',
                        padding: '6px 0', borderBottom: '1px solid #1f2937',
                      }}>
                        <span style={{ color: '#cbd5e1' }}>{q.label}</span>
                        <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>{v}</span>
                      </li>
                    );
                  })}
                </ul>
              </Section>
              <Section title="Agreements Accepted">
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li><Small label="Forms">{app.agree_to_forms ? 'Yes' : 'No'}</Small></li>
                  <li><Small label="Terms">{app.agree_to_terms ? 'Yes' : 'No'}</Small></li>
                  <li><Small label="Notify">{app.agree_to_notify ? 'Yes' : 'No'}</Small></li>
                  <li><Small label="Signature">{app.agree_to_signature ? 'Yes' : 'No'}</Small></li>
                  <li><Small label="Electronic signature"><span style={{ fontFamily: 'monospace' }}>{app.electronic_signature || '—'}</span></Small></li>
                </ul>
              </Section>
              <Section title="Reason (required for decline)">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => props.onReason(e.target.value)}
                  disabled={busy}
                  placeholder="Optional for approve, required for decline"
                  style={{ width: '100%' }}
                />
              </Section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #1f2937',
          display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8,
        }}>
          <button type="button" onClick={props.onClose} style={_btn('#374151', false)}>Close</button>
          <button type="button" onClick={props.onCopyJson} style={_btn('#374151', false)} title="Copy full agreement JSON">Copy JSON</button>
          <button type="button" disabled={busy} onClick={props.onApprovePro}    style={_btn('#1e3a8a', busy)}>Approve as Pro</button>
          <button type="button" disabled={busy} onClick={props.onApproveNonPro} style={_btn('#15803d', busy)}>Approve as Non-Pro</button>
          <button type="button" disabled={busy || !reason.trim()} onClick={props.onDecline} style={_btn('#7f1d1d', busy || !reason.trim())}>Decline</button>
        </div>
      </div>
    </div>
  );
}

/* ── little presentational helpers, kept in-file to keep the port
   as a single-file diff. */

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 style={{
        margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: '#9ca3af',
      }}>{props.title}</h4>
      {props.children}
    </section>
  );
}

function TwoCol(props: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12.5,
    }}>{props.children}</div>
  );
}

function Field(props: { label: string; v?: any; colSpan?: 1 | 2; highlight?: boolean }) {
  const val = props.v == null || props.v === '' ? '—' : String(props.v);
  const isDash = val === '—';
  return (
    <div style={{
      gridColumn: props.colSpan === 2 ? '1 / -1' : undefined,
      color: '#e5e7eb',
      padding: '2px 0',
    }}>
      <span style={{ color: '#6b7280' }}>{props.label}: </span>
      <span style={{
        color: isDash ? '#6b7280'
          : props.highlight && val === 'Yes' ? '#34d399'
          : props.highlight && val === 'No' ? '#f87171'
          : '#e5e7eb',
        fontWeight: props.highlight ? 600 : 400,
      }}>{val}</span>
    </div>
  );
}

function Small(props: { label: string; children: React.ReactNode }) {
  return (
    <span>
      <span style={{ color: '#6b7280' }}>{props.label}: </span>
      <span>{props.children}</span>
    </span>
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
