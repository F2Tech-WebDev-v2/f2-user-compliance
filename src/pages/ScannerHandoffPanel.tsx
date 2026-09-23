import { useEffect, useState } from 'react';
import { getIdToken } from '../auth/session';

/**
 * IT-F2-421 c/c037fdb1 (Mike 2026-09-23): iframe a scanner via a
 * server-minted SID so the embedded page skips its login prompt.
 *
 * Flow:
 *   1. Read the compliance dashboard's in-memory id_token.
 *   2. POST /rest/auth/mint-scanner-sid { token, scannerId } — backend
 *      re-validates the token, resolves Scanners.<slug>.AppUrl, stashes
 *      a bundle in Redis keyed by an opaque 43-char sid, returns
 *      { url: "<AppUrl>?sid=<sid>" }.
 *   3. Render an iframe with that URL. The destination SPA's AuthGate
 *      picks up ?sid= and redeems it (no login screen).
 *
 * Handles loading + error states; on error surfaces the reason
 * inline so the operator can act without opening DevTools.
 */

export function ScannerHandoffPanel({ scannerId, title }: { scannerId: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Bumping this on Reload force-mints a NEW sid + remounts the iframe,
  // which is useful when the sid has been consumed (single-use redeem)
  // or a stale token needs re-validation.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    setUrl(null);
    (async () => {
      const token = getIdToken();
      if (!token) {
        setErr('No in-memory id_token. Refresh the dashboard to re-authenticate.');
        return;
      }
      try {
        const res = await fetch('/rest/auth/mint-scanner-sid', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, scannerId, idToken: token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          setErr(`mint-scanner-sid HTTP ${res.status} — ${body.slice(0, 200)}`);
          return;
        }
        const body = await res.json();
        const target = typeof body?.url === 'string' ? body.url : null;
        if (!target) {
          setErr('mint-scanner-sid returned no url');
          return;
        }
        setUrl(target);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'mint-scanner-sid failed');
      }
    })();
    return () => { cancelled = true; };
  }, [scannerId, nonce]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {(err || !url) && (
        <div style={{ padding: '10px 16px', background: '#0f172a', borderBottom: '1px solid #1f2937', fontSize: 12, color: '#9ca3af', display: 'flex', gap: 12, alignItems: 'center' }}>
          {err ? (
            <>
              <span style={{ color: '#fca5a5' }}>Handoff failed: {err}</span>
              <button
                type="button"
                onClick={() => setNonce((n) => n + 1)}
                style={{ padding: '4px 10px', fontSize: 11, background: '#374151', color: 'white', border: 0, borderRadius: 3, cursor: 'pointer' }}
              >Retry</button>
            </>
          ) : (
            <span>Minting scanner session…</span>
          )}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, background: '#0b0f19' }}>
        {url && (
          <iframe
            src={url}
            key={url}
            title={title}
            style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
          />
        )}
      </div>
    </div>
  );
}
