import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * IT-F2-416 c/5df72319 (Mike 2026-09-23): Onboarding tab replaces the
 * admin.f2-tech.ai iframe with a native panel. Flow:
 *   1. Fetch admin's `custom:customers` from /rest/api/me + the
 *      allowed scanner catalog from /rest/admin/scanners.
 *   2. Operator checks scanner(s) to grant (e.g. f2-gap-up-down) and
 *      pastes a list of recipient emails.
 *   3. Preview grid shows one row per recipient with a Send-email
 *      button and a Copy-magic-link button — either lands the user in
 *      Cognito and either SES-sends the branded Welcome / Set-Password
 *      email OR mints the invite URL and copies it to the clipboard.
 *   4. Each row shows its own status (idle → sending → sent / copied
 *      / error) so the operator can retry per-row without re-typing.
 *
 * Backend:
 *   POST /rest/admin/users                     — create + optionally SES-send
 *   POST /rest/admin/users/:username/mint-magic-link — mint invite URL only
 *   GET  /rest/admin/scanners                  — scanner catalog (scoped)
 *   GET  /rest/api/me                          — admin's role + customers
 * All cookie-authed via same-origin proxy on scanners.f2-tech.ai →
 * f2-admin-service2.
 */

type Scanner = {
  Slug?: string; slug?: string;
  Name?: string; name?: string;
  Client?: string; client?: string;
  RoleAccess?: string;
  admin_only?: boolean;
  Enabled?: boolean;
};

type Me = {
  role?: string;
  is_admin?: boolean;
  customers?: string | string[];
  email?: string;
  [k: string]: any;
};

type Brand = { slug: string; name?: string; isCustomerBrand?: boolean };

type RowState = 'idle' | 'sending' | 'copying' | 'sent' | 'copied' | 'error';

type Row = {
  email: string;
  state: RowState;
  message?: string;
  link?: string;
};

function parseCustomers(v: any): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof v === 'string') return v === '*' ? ['*'] : v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function scanSlug(s: Scanner): string {
  return String(s.Slug || s.slug || '').trim();
}

function scanName(s: Scanner): string {
  return String(s.Name || s.name || scanSlug(s) || '').trim();
}

export function OnboardingPanel() {
  const [me, setMe] = useState<Me | null>(null);
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [scannerFilter, setScannerFilter] = useState('');
  const [manualScanners, setManualScanners] = useState('');
  const [customerOverride, setCustomerOverride] = useState('');
  const [emails, setEmails] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setLoadErr(null);
      try {
        const [meRes, scanRes] = await Promise.all([
          fetch('/rest/api/me', { credentials: 'include' }),
          fetch('/rest/admin/scanners', { credentials: 'include' }),
        ]);
        if (!meRes.ok) throw new Error(`me HTTP ${meRes.status}`);
        const meBody = await meRes.json();
        if (cancelled) return;
        setMe(meBody);
        if (!scanRes.ok) {
          setLoadErr(`scanners HTTP ${scanRes.status} — pick from the manual slug entry below`);
          return;
        }
        const scanBody = await scanRes.json();
        if (cancelled) return;
        // Backend returns EITHER an array (happy path) OR {err:'…'} on
        // scope failures — surface the message so it isn't a silent empty.
        if (scanBody && typeof scanBody === 'object' && !Array.isArray(scanBody) && scanBody.err) {
          setLoadErr(`scanners: ${scanBody.err} — pick from the manual slug entry below`);
          return;
        }
        const list: Scanner[] = Array.isArray(scanBody) ? scanBody
          : Array.isArray(scanBody?.rows) ? scanBody.rows
          : Array.isArray(scanBody?.scanners) ? scanBody.scanners
          : [];
        // Hide disabled / admin-only from the picker — even admin-tier
        // callers wouldn't invite a member onto them.
        const visible = list.filter((s) => {
          if (s?.admin_only === true) return false;
          if (s?.Enabled === false) return false;
          if (String(s?.RoleAccess || '').toLowerCase() === 'disabled') return false;
          return !!scanSlug(s);
        });
        visible.sort((a, b) => scanSlug(a).localeCompare(scanSlug(b)));
        setScanners(visible);
        if (visible.length === 0) {
          setLoadErr('scanner catalog returned empty — pick from the manual slug entry below');
        }
      } catch (e: any) {
        if (!cancelled) setLoadErr(e?.message || 'failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adminCustomers = useMemo(() => parseCustomers(me?.customers), [me]);
  // Effective customers to grant to the invitee:
  //   1. Branded host → use that customer's slug (canonical target).
  //   2. Otherwise honor customerOverride typed in the UI.
  //   3. Otherwise the admin's own scope, minus '*' wildcard.
  const customers = useMemo(() => {
    if (brand?.isCustomerBrand && brand?.slug) return [brand.slug];
    const typed = customerOverride.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (typed.length) return typed;
    return adminCustomers.filter((c) => c !== '*');
  }, [brand, customerOverride, adminCustomers]);

  const filteredScanners = useMemo(() => {
    const q = scannerFilter.trim().toLowerCase();
    if (!q) return scanners;
    return scanners.filter((s) => {
      const slug = scanSlug(s).toLowerCase();
      const name = scanName(s).toLowerCase();
      const cust = String(s.Client || s.client || '').toLowerCase();
      return slug.includes(q) || name.includes(q) || cust.includes(q);
    });
  }, [scanners, scannerFilter]);

  const parsedEmails = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of emails.split(/[\s,;]+/)) {
      const em = raw.trim().toLowerCase();
      if (!em.includes('@') || !em.includes('.')) continue;
      if (seen.has(em)) continue;
      seen.add(em);
      out.push(em);
    }
    return out;
  }, [emails]);

  const selectedScanners = useMemo(() => {
    const set = new Set<string>();
    for (const [k, v] of Object.entries(checked)) if (v) set.add(k);
    for (const raw of manualScanners.split(/[\s,;]+/)) {
      const s = raw.trim();
      if (s) set.add(s);
    }
    return Array.from(set);
  }, [checked, manualScanners]);

  const rebuildPreview = useCallback(() => {
    setRows(parsedEmails.map((email) => ({ email, state: 'idle' as RowState })));
  }, [parsedEmails]);

  useEffect(() => { rebuildPreview(); }, [rebuildPreview]);

  const setRowState = useCallback((email: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => r.email === email ? { ...r, ...patch } : r));
  }, []);

  const createUser = useCallback(async (email: string, sendMagicLink: boolean): Promise<{ err?: string; username?: string; pool_id?: string }> => {
    if (customers.length === 0) return { err: 'no customer scope resolved — type target customer slug(s) below' };
    if (selectedScanners.length === 0) return { err: 'select at least one scanner' };
    const body = {
      email,
      role: 'member',
      customers: customers.join(','),
      scanners: selectedScanners.join(','),
      send_magic_link: sendMagicLink,
    };
    try {
      const res = await fetch('/rest/admin/users', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.err) return { err: j?.err || `HTTP ${res.status}` };
      const username = j?.Username || j?.username || j?.user?.Username || j?.user?.username || email;
      const pool_id = j?.pool_id || j?.PoolId || j?.user?.pool_id;
      return { username, pool_id };
    } catch (e: any) {
      return { err: e?.message || 'create failed' };
    }
  }, [customers, selectedScanners]);

  const sendEmailFor = useCallback(async (email: string) => {
    setRowState(email, { state: 'sending', message: undefined, link: undefined });
    const created = await createUser(email, true);
    if (created.err) {
      setRowState(email, { state: 'error', message: created.err });
      return;
    }
    setRowState(email, { state: 'sent', message: 'Magic-link email sent.' });
  }, [createUser, setRowState]);

  const copyLinkFor = useCallback(async (email: string) => {
    setRowState(email, { state: 'copying', message: undefined, link: undefined });
    // Step 1: create the user WITHOUT sending an email (send_magic_link:false).
    const created = await createUser(email, false);
    if (created.err) {
      setRowState(email, { state: 'error', message: created.err });
      return;
    }
    // Step 2: mint an invite URL for the just-created user.
    try {
      const url = `/rest/admin/users/${encodeURIComponent(created.username || email)}/mint-magic-link`;
      const res = await fetch(url, {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(created.pool_id ? { pool_id: created.pool_id } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.err || !j?.url) {
        setRowState(email, { state: 'error', message: j?.err || `mint HTTP ${res.status}` });
        return;
      }
      try {
        await navigator.clipboard.writeText(j.url);
        setRowState(email, { state: 'copied', message: 'Link copied to clipboard.', link: j.url });
      } catch {
        setRowState(email, { state: 'copied', message: 'Link ready (clipboard blocked — see below).', link: j.url });
      }
    } catch (e: any) {
      setRowState(email, { state: 'error', message: e?.message || 'mint failed' });
    }
  }, [createUser, setRowState]);

  const runAllSend = useCallback(async () => {
    for (const r of rows) {
      if (r.state === 'sent') continue;
      await sendEmailFor(r.email);
    }
  }, [rows, sendEmailFor]);

  const noReady = rows.length === 0 || selectedScanners.length === 0 || customers.length === 0;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, flex: 1, color: '#e5e7eb', background: '#0b1220', overflow: 'auto' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>
          {brand?.isCustomerBrand && brand?.slug
            ? `${brand.name || brand.slug} — Onboarding Members — Bulk Invite`
            : 'Onboarding Members — Bulk Invite'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Pick the scanner(s) to grant, paste a list of recipient emails, then use the per-row buttons to either send the branded magic-link email or copy the invite URL to your clipboard (for Slack / SMS / manual handoff).
        </p>
      </div>

      {loadErr && (
        <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>
          {loadErr}
        </div>
      )}

      {/* Scanner picker */}
      <section style={{
        background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: 12,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>Scanners</div>
          <input
            type="text"
            placeholder="filter catalog…"
            value={scannerFilter}
            onChange={(e) => setScannerFilter(e.target.value)}
            style={{ flex: '0 1 220px', minWidth: 140 }}
          />
          <input
            type="text"
            placeholder="or type scanner slug(s) manually — comma-separated"
            value={manualScanners}
            onChange={(e) => setManualScanners(e.target.value)}
            style={{ flex: '1 1 260px', minWidth: 200 }}
          />
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            {selectedScanners.length} selected {scanners.length > 0 ? `(of ${scanners.length} in catalog)` : ''}
          </span>
          {(selectedScanners.length > 0 || manualScanners) && (
            <button
              type="button"
              onClick={() => { setChecked({}); setManualScanners(''); }}
              style={{ fontSize: 11, background: 'transparent', border: 'none', color: '#9ca3af', textDecoration: 'underline', cursor: 'pointer' }}
            >Clear</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280' }}>
            Customer scope: {customers.length ? customers.join(', ') : '(none — set below)'}
          </span>
        </div>

        {/* Customer override — used when the admin has custom:customers='*'
            (wildcard, empty effective scope) or when we're on the F2 hub
            and need to target a specific customer for the invite. Hidden
            when we're on a branded customer host (brand.slug wins). */}
        {!brand?.isCustomerBrand && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: '#9ca3af' }}>
              Target customer slug(s) (optional; overrides your <code>custom:customers</code>):
            </label>
            <input
              type="text"
              placeholder="e.g. f2, oxfordclub — comma-separated"
              value={customerOverride}
              onChange={(e) => setCustomerOverride(e.target.value)}
              style={{ flex: '1 1 300px', minWidth: 240 }}
            />
          </div>
        )}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '4px 12px',
          maxHeight: 200, overflow: 'auto', paddingRight: 8,
        }}>
          {loading && <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading scanners…</div>}
          {!loading && filteredScanners.length === 0 && (
            <div style={{ fontSize: 12, color: '#6b7280' }}>No scanners match.</div>
          )}
          {filteredScanners.map((s) => {
            const slug = scanSlug(s);
            const name = scanName(s);
            return (
              <label key={slug} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!checked[slug]}
                  onChange={(e) => setChecked({ ...checked, [slug]: e.target.checked })}
                />
                <code style={{ background: '#0f172a', padding: '1px 6px', borderRadius: 3, color: '#cbd5e1' }}>{slug}</code>
                {name !== slug && <span style={{ color: '#9ca3af' }}>· {name}</span>}
              </label>
            );
          })}
        </div>
      </section>

      {/* Emails input */}
      <section>
        <label style={{ display: 'block', fontSize: 12, color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}>
          Recipient emails
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={5}
          placeholder="alice@example.com&#10;bob@example.com&#10;carol@example.com"
          style={{
            width: '100%', padding: '8px 12px', fontFamily: 'monospace',
            fontSize: 12, resize: 'vertical',
          }}
        />
        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
          {parsedEmails.length} valid recipient email{parsedEmails.length === 1 ? '' : 's'} detected.
        </div>
      </section>

      {/* Preview + send-all */}
      <section style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>Preview ({rows.length})</div>
          <button
            type="button"
            onClick={runAllSend}
            disabled={noReady || rows.every((r) => r.state === 'sent')}
            style={{
              marginLeft: 'auto', padding: '6px 14px', borderRadius: 4,
              background: noReady ? '#374151' : '#15803d', color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, fontWeight: 600,
              cursor: noReady ? 'not-allowed' : 'pointer',
            }}
            title="Send the branded email to every row that hasn't sent yet"
          >Send email to all</button>
        </div>
        {rows.length === 0 && (
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Paste recipient emails above to build the preview.
          </div>
        )}
        {rows.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map((r) => (
              <li key={r.email} style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '6px 8px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 4,
              }}>
                <span style={{ flex: '1 1 240px', minWidth: 200, fontSize: 12, fontFamily: 'monospace', color: '#e5e7eb' }}>
                  {r.email}
                </span>
                <StateBadge state={r.state} />
                <button
                  type="button"
                  disabled={noReady || r.state === 'sending' || r.state === 'copying'}
                  onClick={() => sendEmailFor(r.email)}
                  style={_btn('#15803d', noReady || r.state === 'sending' || r.state === 'copying')}
                  title="POST /admin/users {send_magic_link:true} — SES-sends the branded Welcome email"
                >Send email</button>
                <button
                  type="button"
                  disabled={noReady || r.state === 'sending' || r.state === 'copying'}
                  onClick={() => copyLinkFor(r.email)}
                  style={_btn('#1e3a8a', noReady || r.state === 'sending' || r.state === 'copying')}
                  title="Create user then mint invite URL — copies to clipboard, no email send"
                >Copy magic link</button>
                {r.message && (
                  <span style={{
                    flexBasis: '100%', fontSize: 11,
                    color: r.state === 'error' ? '#fca5a5' : '#9ca3af',
                  }}>{r.message}</span>
                )}
                {r.link && r.state === 'copied' && (
                  <span style={{
                    flexBasis: '100%', fontSize: 11, fontFamily: 'monospace',
                    color: '#93c5fd', wordBreak: 'break-all',
                  }}>{r.link}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {noReady && rows.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#fbbf24' }}>
            {selectedScanners.length === 0
              ? 'Pick at least one scanner before sending.'
              : customers.length === 0
                ? 'Your admin login has no custom:customers scope — cannot invite.'
                : ''}
          </div>
        )}
      </section>
    </div>
  );
}

function StateBadge(props: { state: RowState }) {
  const { state } = props;
  if (state === 'idle') return null;
  const map: Record<RowState, { label: string; bg: string; color: string }> = {
    idle:    { label: '',        bg: '',        color: ''        },
    sending: { label: 'Sending…', bg: '#78350f', color: '#fbbf24' },
    copying: { label: 'Minting…', bg: '#78350f', color: '#fbbf24' },
    sent:    { label: 'Sent',     bg: '#065f46', color: '#6ee7b7' },
    copied:  { label: 'Copied',   bg: '#1e3a8a', color: '#93c5fd' },
    error:   { label: 'Error',    bg: '#7f1d1d', color: '#fca5a5' },
  };
  const cfg = map[state];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>{cfg.label}</span>
  );
}

function _btn(bg: string, disabled: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: '4px 10px', borderRadius: 4,
    background: disabled ? '#374151' : bg,
    color: disabled ? '#6b7280' : '#f3f4f6',
    border: `1px solid ${disabled ? '#4b5563' : 'rgba(255,255,255,0.1)'}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600,
  };
}
