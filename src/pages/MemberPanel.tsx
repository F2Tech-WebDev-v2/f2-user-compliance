import { useState } from 'react';

/**
 * IT-F2-416 c/ee84fb8a (Mike 2026-09-22) — bulk-invite via template
 * user. Flow:
 *   1. Enter template-user email → GET /rest/admin/users/lookup-pools-
 *      for-email → GET /rest/admin/users/<username> → surface their
 *      current custom:scanners as checkboxes.
 *   2. Operator picks which scanners to clone onto new recipients.
 *   3. Paste recipient emails (comma / newline / whitespace-separated).
 *   4. Send → for each recipient, POST /rest/admin/users with
 *      { email, role: 'member', customers, scanners, send_magic_link:true }
 *      Each response line surfaces success/err.
 *
 * Backend endpoints are same-origin under the branded host — cookies
 * flow via credentials:'include'. Admin cookie required (F2AuthMiddleware
 * enforces role in {admin, client, client_admin} on POST /users).
 */

type Attribute = { Name: string; Value: string };
type LookupPool = { username?: string; pool_id?: string; pool_nickname?: string };
type SendResult = { email: string; ok: boolean; message: string };

const AUTH_BASE = ''; // same-origin — vercel.json /rest/* rewrite → f2-admin-service2

export function MemberPanel() {
  const [templateEmail, setTemplateEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanners, setScanners] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [customers, setCustomers] = useState<string[]>([]);
  const [recipients, setRecipients] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

  const lookup = async () => {
    const em = templateEmail.trim().toLowerCase();
    if (!em || !em.includes('@')) { setErr('Enter a valid email address'); return; }
    setErr(null); setLoading(true); setScanners(null); setChecked({}); setResults([]);
    try {
      // Step 1: find which pool(s) the user lives in
      const lookRes = await fetch(`${AUTH_BASE}/rest/admin/users/lookup-pools-for-email?email=${encodeURIComponent(em)}`, {
        credentials: 'include',
      });
      if (!lookRes.ok) throw new Error(`lookup HTTP ${lookRes.status}`);
      const lookBody = await lookRes.json();
      const pools: LookupPool[] = Array.isArray(lookBody?.pools) ? lookBody.pools : (Array.isArray(lookBody) ? lookBody : []);
      const first = pools[0];
      if (!first?.username) throw new Error('User not found in any Cognito pool');
      // Step 2: fetch the user's cached attributes
      const detRes = await fetch(`${AUTH_BASE}/rest/admin/users/${encodeURIComponent(first.username)}/cached${first.pool_id ? `?pool_id=${encodeURIComponent(first.pool_id)}` : ''}`, {
        credentials: 'include',
      });
      if (!detRes.ok) throw new Error(`details HTTP ${detRes.status}`);
      const detBody = await detRes.json();
      const attrs: Attribute[] = detBody?.UserAttributes || detBody?.attributes || [];
      const scanRaw = (attrs.find((a) => a?.Name === 'custom:scanners')?.Value || '').trim();
      const custRaw = (attrs.find((a) => a?.Name === 'custom:customers')?.Value || '').trim();
      const scannerList = scanRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const customerList = custRaw === '*' ? ['*'] : custRaw.split(',').map((s) => s.trim()).filter(Boolean);
      setScanners(scannerList);
      // default: pre-check all scanners
      const c: Record<string, boolean> = {};
      for (const s of scannerList) c[s] = true;
      setChecked(c);
      setCustomers(customerList);
    } catch (e: any) {
      setErr(e?.message || 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const parsedRecipients = recipients.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@'));

  const send = async () => {
    if (parsedRecipients.length === 0) { setErr('Paste at least one recipient email'); return; }
    const selectedScanners = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (selectedScanners.length === 0) { setErr('Select at least one scanner'); return; }
    if (customers.length === 0) { setErr('Template user has no customers claim — cannot infer target'); return; }
    setErr(null); setSending(true); setResults([]);
    const out: SendResult[] = [];
    for (const email of parsedRecipients) {
      try {
        const res = await fetch(`${AUTH_BASE}/rest/admin/users`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            role: 'member',
            customers: customers.join(','),
            scanners: selectedScanners.join(','),
            send_magic_link: true,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && !body?.err) {
          out.push({ email, ok: true, message: body?.message || 'invited' });
        } else {
          out.push({ email, ok: false, message: body?.err || `HTTP ${res.status}` });
        }
      } catch (e: any) {
        out.push({ email, ok: false, message: e?.message || 'request failed' });
      }
      setResults([...out]);
    }
    setSending(false);
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, color: '#e5e7eb' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Member — Bulk Invite</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9ca3af' }}>
          Enter an existing member&rsquo;s email to see the scanners they&rsquo;re entitled to, pick a subset, then paste the recipient emails to invite. Each recipient gets a magic-link invite branded to <code>scanners.f2-tech.ai</code>.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          placeholder="template user email (e.g. member@example.com)"
          value={templateEmail}
          onChange={(e) => setTemplateEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void lookup(); }}
          style={{
            flex: '1 1 320px', minWidth: 240, padding: '8px 12px',
            background: '#1f2937', color: '#e5e7eb',
            border: '1px solid #374151', borderRadius: 4, fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={lookup}
          disabled={loading || !templateEmail.trim()}
          style={{
            padding: '8px 16px', background: '#1e3a8a', color: 'white',
            border: 0, borderRadius: 4, fontSize: 13, cursor: loading ? 'wait' : 'pointer',
            opacity: loading || !templateEmail.trim() ? 0.5 : 1,
          }}
        >{loading ? 'Looking up…' : 'Look up scanners'}</button>
      </div>

      {err && (
        <div style={{ padding: 10, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 13 }}>
          {err}
        </div>
      )}

      {scanners && scanners.length > 0 && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
            Template user is entitled to <b>{scanners.length}</b> scanner{scanners.length === 1 ? '' : 's'} · customer{customers.length === 1 ? '' : 's'}: {customers.join(', ') || '(none)'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {scanners.map((s) => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!checked[s]}
                  onChange={(e) => setChecked({ ...checked, [s]: e.target.checked })}
                />
                <code style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 3, color: '#cbd5e1' }}>{s}</code>
              </label>
            ))}
          </div>
        </div>
      )}
      {scanners && scanners.length === 0 && (
        <div style={{ padding: 10, background: '#78350f22', border: '1px solid #78350f', borderRadius: 4, color: '#fbbf24', fontSize: 13 }}>
          Template user has no <code>custom:scanners</code> attribute set. Nothing to clone.
        </div>
      )}

      {scanners && scanners.length > 0 && (
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Recipient emails (comma / newline / whitespace-separated)</label>
          <textarea
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            rows={5}
            placeholder="alice@example.com&#10;bob@example.com&#10;carol@example.com"
            style={{
              width: '100%', padding: '8px 12px',
              background: '#1f2937', color: '#e5e7eb',
              border: '1px solid #374151', borderRadius: 4,
              fontSize: 13, fontFamily: 'monospace', resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
            {parsedRecipients.length} valid recipient email{parsedRecipients.length === 1 ? '' : 's'} detected.
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending || parsedRecipients.length === 0}
            style={{
              marginTop: 12, padding: '10px 20px',
              background: '#15803d', color: 'white',
              border: 0, borderRadius: 4, fontSize: 13, fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending || parsedRecipients.length === 0 ? 0.5 : 1,
            }}
          >{sending ? `Sending ${results.length + 1}/${parsedRecipients.length}…` : `Send ${parsedRecipients.length} invite${parsedRecipients.length === 1 ? '' : 's'}`}</button>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ background: '#0f172a', border: '1px solid #1f2937', borderRadius: 4, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Results ({results.filter((r) => r.ok).length} of {results.length} succeeded)</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((r) => (
              <li key={r.email} style={{ fontSize: 12, fontFamily: 'monospace', color: r.ok ? '#86efac' : '#fca5a5' }}>
                {r.ok ? '✓' : '✗'} {r.email} — {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
