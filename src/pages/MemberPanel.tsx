import { useEffect, useMemo, useState } from 'react';

/**
 * IT-F2-416 c/ee84fb8a (Mike 2026-09-22) — bulk-invite via template user.
 *
 * c/07dc9567 (Mike 2026-09-23): scope everything to the CURRENT
 * customer's Cognito pool based on domain branding — same SoT-driven
 * pool pattern as OnboardingPanel c/d1450627. Flow:
 *   1. Fetch brand-config for window.location.hostname → derive
 *      cognito_pool_id + customer slug.
 *   2. Enter template-user email → GET /users/lookup-pools-for-email
 *      but IGNORE hits outside the branded pool (surface an error the
 *      operator can act on rather than silently cloning from a
 *      neighbor customer's pool).
 *   3. Show template user's custom:scanners as checkboxes.
 *   4. Paste recipient emails → POST /admin/users with pool_id +
 *      customers=[brand.slug] so the new user is planted in the
 *      correct customer's pool, not the fleet-wide fallback.
 *
 * The old cross-pool lookup lit up when scanners.f2-tech.ai was used
 * to invite for an oxford-club or f2 template user — the invites
 * ended up in the wrong customer's pool.
 */

type Attribute = { Name: string; Value: string };
type LookupPool = { username?: string; pool_id?: string; pool_nickname?: string };
type SendResult = { email: string; ok: boolean; message: string };
type Brand = {
  slug: string;
  name?: string;
  isCustomerBrand?: boolean;
  cognito_pool_id?: string | null;
};

const AUTH_BASE = ''; // same-origin — vercel.json /rest/* rewrite → f2-admin-service2

export function MemberPanel() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [templateEmail, setTemplateEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanners, setScanners] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [templateUsername, setTemplateUsername] = useState<string | null>(null);
  const [recipients, setRecipients] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);

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

  // Effective customer scope for cloned invites: branded host uses that
  // customer's slug; the raw F2 hub falls back to the branded slug the
  // brand-config returned (defaults to 'f2' on scanners.f2-tech.ai).
  const customers = useMemo(() => {
    if (brand?.slug) return [brand.slug];
    return [];
  }, [brand]);

  const targetPoolId = brand?.cognito_pool_id || null;
  const brandLabel = brand?.name || brand?.slug || 'F2';

  const lookup = async () => {
    const em = templateEmail.trim().toLowerCase();
    if (!em || !em.includes('@')) { setErr('Enter a valid email address'); return; }
    setErr(null); setLoading(true); setScanners(null); setChecked({}); setResults([]); setTemplateUsername(null);
    try {
      const lookRes = await fetch(`${AUTH_BASE}/rest/admin/users/lookup-pools-for-email?email=${encodeURIComponent(em)}`, {
        credentials: 'include',
      });
      if (!lookRes.ok) throw new Error(`lookup HTTP ${lookRes.status}`);
      const lookBody = await lookRes.json();
      const pools: LookupPool[] = Array.isArray(lookBody?.pools) ? lookBody.pools : (Array.isArray(lookBody) ? lookBody : []);
      if (pools.length === 0) {
        throw new Error(`Template user not found in any Cognito pool. Only members already provisioned in ${brandLabel}'s pool can be used as a template here.`);
      }

      // c/07dc9567 — restrict template pick to the branded customer's
      // pool. If the email exists in the target pool, use that entry;
      // otherwise surface an actionable error naming which pool(s)
      // they actually live in.
      let picked: LookupPool | null = null;
      if (targetPoolId) {
        picked = pools.find((p) => (p?.pool_id || '').trim() === targetPoolId) || null;
        if (!picked) {
          const other = pools.map((p) => p?.pool_nickname || p?.pool_id || '?').filter(Boolean).join(', ');
          throw new Error(`Template user isn't in ${brandLabel}'s Cognito pool (${targetPoolId}). Found in: ${other || 'unknown pool'}. Pick a template user provisioned under this customer.`);
        }
      } else {
        // No per-customer pool set on this brand yet — accept the
        // first hit (legacy F2 fleet behavior).
        picked = pools[0];
      }
      if (!picked?.username) throw new Error('Template user record missing username');
      setTemplateUsername(picked.username);

      const detRes = await fetch(`${AUTH_BASE}/rest/admin/users/${encodeURIComponent(picked.username)}/cached${picked.pool_id ? `?pool_id=${encodeURIComponent(picked.pool_id)}` : ''}`, {
        credentials: 'include',
      });
      if (!detRes.ok) throw new Error(`details HTTP ${detRes.status}`);
      const detBody = await detRes.json();
      const attrs: Attribute[] = detBody?.UserAttributes || detBody?.attributes || [];
      const scanRaw = (attrs.find((a) => a?.Name === 'custom:scanners')?.Value || '').trim();
      const scannerList = scanRaw.split(',').map((s) => s.trim()).filter(Boolean);
      setScanners(scannerList);
      const c: Record<string, boolean> = {};
      for (const s of scannerList) c[s] = true;
      setChecked(c);
    } catch (e: any) {
      setErr(e?.message || 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const parsedRecipients = recipients.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes('@'));
  const inviteHost = typeof window !== 'undefined' ? window.location.origin : '';

  const send = async () => {
    if (parsedRecipients.length === 0) { setErr('Paste at least one recipient email'); return; }
    const selectedScanners = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (selectedScanners.length === 0) { setErr('Select at least one scanner'); return; }
    if (customers.length === 0) { setErr('No branded customer resolved from the current domain — the template panel needs a branded host to know which pool to target.'); return; }
    setErr(null); setSending(true); setResults([]);
    const out: SendResult[] = [];
    for (const email of parsedRecipients) {
      try {
        const body: any = {
          email,
          role: 'member',
          customers: customers.join(','),
          scanners: selectedScanners.join(','),
          send_magic_link: true,
        };
        // c/07dc9567 — force the new user into the branded customer's
        // pool via explicit pool_id (same as Onboarding). Without this
        // the backend falls back to customer-directory resolution which
        // is a subset of the same guarantee — pass both belt+suspenders.
        if (targetPoolId) body.pool_id = targetPoolId;
        if (inviteHost) body.invite_host = inviteHost;
        const res = await fetch(`${AUTH_BASE}/rest/admin/users`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && !j?.err) {
          out.push({ email, ok: true, message: j?.message || 'invited' });
        } else {
          out.push({ email, ok: false, message: j?.err || `HTTP ${res.status}` });
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
        <h1 style={{ margin: 0, fontSize: 20 }}>{brandLabel} — Member Bulk Invite</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9ca3af' }}>
          Enter an existing {brandLabel} member&rsquo;s email to see the scanners they&rsquo;re entitled to, pick a subset, then paste the recipient emails to invite. Each recipient is planted directly in <b>{brandLabel}&rsquo;s</b> Cognito pool and gets a magic-link invite branded to this domain.
        </p>
      </div>

      {/* Target-pool banner — mirrors OnboardingPanel c/33e215f5 so the
          operator sees which pool everything is scoped to before typing. */}
      <div style={{
        padding: '10px 12px', background: '#0b3a52', border: '1px solid #164e63',
        borderRadius: 4, fontSize: 12, color: '#cbd5e1',
      }}>
        <div style={{ fontWeight: 600, color: '#e0f2fe', marginBottom: 2 }}>
          Target pool: {brandLabel} ({targetPoolId ? <code>{targetPoolId}</code> : 'legacy fleet fallback'})
        </div>
        <div>
          Both the template lookup and every invite send below are restricted to this pool. Switch branded domains (e.g. an <code>oxford-club</code> host) to target another customer.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="email"
          placeholder="template user email (must be in the target pool)"
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
            Template <code>{templateUsername}</code> is entitled to <b>{scanners.length}</b> scanner{scanners.length === 1 ? '' : 's'} in the {brandLabel} pool.
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
            {parsedRecipients.length} valid recipient email{parsedRecipients.length === 1 ? '' : 's'} detected. Each will be planted in the <b>{brandLabel}</b> pool.
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
