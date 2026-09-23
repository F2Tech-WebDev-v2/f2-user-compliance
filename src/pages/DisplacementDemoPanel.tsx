import { useEffect, useRef, useState } from 'react';

/**
 * IT-F2-421 c/339ac8f0 (Mike 2026-09-23): Live-session displacement
 * demo. Splits the main panel into two side-by-side credentialless
 * iframes both pointing at f2-gap-up-down. The auditor logs the same
 * user into both frames — the second login triggers backend
 * displacement, which pushes the "displaced" chip + banner into the
 * first frame while the second stays live.
 *
 * Credentialless iframes each get their own opaque browsing context
 * (no shared cookies with the parent OR each other), so the two
 * frames behave like two independent incognito windows. The
 * displacement machinery is WebSocket-broadcast keyed by the logged-
 * in user identity — cookie isolation between frames doesn't defeat
 * it. Both frames must be authenticated as the SAME test user for
 * the demo to fire.
 */

const SCANNER_URL = 'https://scanners.f2-tech.ai/scans/f2-gap-up-down';

function FrameCard({ side }: { side: 'A' | 'B' }) {
  const [nonce, setNonce] = useState(0);
  // c/03512c28 — imperative attribute set for guaranteed anonymous-
  // browsing partition (see AcceptInvitePanel for the same pattern).
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    const el = iframeRef.current;
    if (!el) return;
    el.setAttribute('credentialless', '');
    // c/8a1b276c — Firefox-specific opt-out of the ambient cookie jar.
    (el as any).disableCookies = true;
  }, [nonce]);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: side === 'A' ? '1px solid #1f2937' : 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 12px', background: '#0f172a', borderBottom: '1px solid #1f2937',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          background: side === 'A' ? '#1e3a8a' : '#7c2d12',
          color: '#e5e7eb', fontSize: 11, fontWeight: 700,
        }}>{side}</span>
        <span style={{ fontSize: 12, color: '#e5e7eb', fontWeight: 600 }}>Frame {side}</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>
          isolated · {side === 'A' ? 'log in first — will get displaced when B logs in' : 'log in as the same user — takes over the live slot'}
        </span>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          style={{
            marginLeft: 'auto', padding: '4px 10px', fontSize: 11,
            background: '#374151', color: '#e5e7eb', border: 0, borderRadius: 3, cursor: 'pointer',
          }}
          title="Force reload this frame"
        >Reload</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: '#0b0f19' }}>
        <iframe
          ref={iframeRef}
          src={SCANNER_URL}
          key={`${side}#${nonce}`}
          title={`Live-displacement demo · Frame ${side}`}
          style={{ width: '100%', height: '100%', border: 0, background: 'white' }}
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

export function DisplacementDemoPanel() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 16px', background: '#0f172a', borderBottom: '1px solid #1f2937', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#cbd5e1' }}>
          <b style={{ color: '#e5e7eb' }}>How to demo:</b> log the same test user into <b>Frame A</b> first, wait until you see live data. Then log the same user into <b>Frame B</b>. Frame A should switch to the displaced state (grey chip + banner) while Frame B stays live.
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <FrameCard side="A" />
        <FrameCard side="B" />
      </div>
    </div>
  );
}
