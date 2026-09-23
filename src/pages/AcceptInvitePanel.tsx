import { useState } from 'react';

/**
 * IT-F2-421 c/077182bf (Mike 2026-09-23): Set-password panel — paste-a-
 * magic-link box at the top; the pasted URL loads in the iframe below.
 *
 * c/61e5a3f5 (Mike 2026-09-23): dropped the private-iframe (credential-
 * less / disableCookies) treatment. Cross-browser isolation for a same-
 * eTLD+1 embed is a browser-version minefield (Firefox pre-138 ignores
 * credentialless, Safari doesn't ship it, Chrome partitions same-site
 * frames but only with the attribute set); Mike accepted that the demo
 * runs with the parent-tab session flowing in. Panel structure is
 * unchanged — just a plain iframe now.
 */

// Whitelist the origins that legitimately serve magic-link URLs so a
// stray paste can't turn this panel into an open redirector into
// arbitrary sites. Matches the fleet's members-portal hosts.
const ALLOWED_HOST_SUFFIXES = ['.f2-tech.ai', '.f2-tech.com'];

function isAllowedMagicLinkUrl(raw: string): { ok: boolean; url?: string; reason?: string } {
  const s = (raw || '').trim();
  if (!s) return { ok: false, reason: 'paste the magic link URL first' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, reason: 'not a valid URL' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'URL must be http(s)' };
  const host = u.hostname.toLowerCase();
  const okHost = ALLOWED_HOST_SUFFIXES.some((suf) => host.endsWith(suf)) || host === 'localhost';
  if (!okHost) return { ok: false, reason: `only members-portal hosts allowed (${ALLOWED_HOST_SUFFIXES.join(', ')})` };
  return { ok: true, url: u.toString() };
}

export function AcceptInvitePanel() {
  const [pasted, setPasted] = useState('');
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Bump this to force-remount the iframe when the operator wants to
  // re-run the demo without changing the URL. React keys off it via `key`.
  const [reloadNonce, setReloadNonce] = useState(0);

  const load = () => {
    const v = isAllowedMagicLinkUrl(pasted);
    if (!v.ok) { setErr(v.reason || 'invalid URL'); return; }
    setErr(null);
    setLoadedUrl(v.url!);
    setReloadNonce((n) => n + 1);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 16, background: '#0f172a', borderBottom: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600, minWidth: 130 }}>
            Paste magic link
          </label>
          <input
            type="url"
            placeholder="https://members.f2-tech.ai/accept-invite?..."
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            style={{
              flex: '1 1 400px', minWidth: 280, padding: '8px 12px',
              background: '#1f2937', color: '#e5e7eb',
              border: '1px solid #374151', borderRadius: 4, fontSize: 13, fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            onClick={load}
            disabled={!pasted.trim()}
            style={{
              padding: '8px 16px', background: '#1e3a8a', color: 'white',
              border: 0, borderRadius: 4, fontSize: 13, cursor: pasted.trim() ? 'pointer' : 'not-allowed',
              opacity: pasted.trim() ? 1 : 0.5, fontWeight: 600,
            }}
          >Open</button>
          {loadedUrl && (
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              style={{
                padding: '8px 12px', background: '#374151', color: 'white',
                border: 0, borderRadius: 4, fontSize: 12, cursor: 'pointer',
              }}
              title="Force the iframe to reload from scratch"
            >Reload</button>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          The pasted link opens below in the panel iframe.
        </div>
        {err && (
          <div style={{ padding: 8, background: '#3f1a1a', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fecaca', fontSize: 12 }}>
            {err}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, background: '#0b0f19', position: 'relative' }}>
        {loadedUrl ? (
          <iframe
            src={loadedUrl}
            key={`${loadedUrl}#${reloadNonce}`}
            title="Set-password / accept-invite flow"
            style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', height: '100%', color: '#6b7280', fontSize: 13,
          }}>
            Paste an invite magic link above to run the set-password + name flow here.
          </div>
        )}
      </div>
    </div>
  );
}
