import { useEffect, useRef, useState } from 'react';

/**
 * IT-F2-421 c/077182bf (Mike 2026-09-23): Set-password panel — paste-a-
 * magic-link box at the top; loading the pasted URL renders the accept-
 * invite / set-password flow in a credentialless iframe below so the
 * demo runs in a fresh browser context (no leaked cookies from the
 * currently-signed-in admin session in the parent tab).
 *
 * "Credentialless" iframes strip storage + cookies for the embedded
 * origin — required here because the compliance dashboard is already
 * authenticated at members.f2-tech.ai / scanners.f2-tech.ai, and
 * without isolation the pasted magic-link's redeem step would collide
 * with the parent's session cookies and land the demo user on the
 * signed-in dashboard instead of the set-password wizard.
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
  // re-run the demo without changing the URL (e.g. after landing on
  // the wrong step in the flow). React keys off it via `key`.
  const [reloadNonce, setReloadNonce] = useState(0);

  // c/03512c28 (Mike 2026-09-23) — belt-and-suspenders attribute set.
  // Some React 18 builds warn on unknown lowercase DOM props even
  // though the attribute still lands; explicit setAttribute on mount
  // guarantees the browser sees `credentialless` regardless of prop-
  // passing behavior. Anonymous-browsing partition is what stops the
  // iframe's cookies + storage from leaking into the parent tab.
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (iframeRef.current) iframeRef.current.setAttribute('credentialless', '');
  }, [loadedUrl, reloadNonce]);

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
          The pasted link opens below in an isolated (credentialless) iframe so the demo runs in a fresh browser context — no bleed from the dashboard&rsquo;s current session.
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
            ref={iframeRef}
            // credentialless is set imperatively in the effect above so
            // it lands regardless of React's typed-prop passthrough.
            src={loadedUrl}
            key={`${loadedUrl}#${reloadNonce}`}
            title="Set-password / accept-invite flow"
            style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
            referrerPolicy="no-referrer"
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
