import { useState } from 'react';

/**
 * IT-F2-421 c/a5e11fc9 (Mike 2026-09-23): Live-Session Displacement
 * demo. Previous version (c/339ac8f0) tried to split the main panel
 * into two credentialless iframes so the auditor could log the same
 * user into both. Browser support for credentialless is Chromium-first
 * and Firefox pre-138 shares cookies across same-eTLD+1 embeds — so
 * we couldn't reliably isolate. Simpler UX: give the auditor the
 * scanner URL + a Copy button + instructions to run the demo in a
 * private/incognito window with two tabs.
 */

const SCANNER_URL = 'https://scanners.f2-tech.ai/scans/f2-gap-up-down';

export function DisplacementDemoPanel() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SCANNER_URL);
      } else {
        // Fallback for browsers without Clipboard API: temp textarea +
        // document.execCommand('copy'). Deprecated but still ubiquitous
        // and works in every browser we support.
        const ta = document.createElement('textarea');
        ta.value = SCANNER_URL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* best-effort */ }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 24, maxWidth: 760, color: '#e5e7eb', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Live-Session Displacement Demo</h1>
        <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>
          Every user account is entitled to exactly one live-data session at a time. Opening a second window on the same account boots the first one to delayed data. Follow the steps below to see the switch fire in real time.
        </p>
      </div>

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Scanner URL
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: '1 1 400px', minWidth: 0, background: '#0f172a', padding: '8px 12px', borderRadius: 4, fontSize: 13, color: '#cbd5e1', border: '1px solid #1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {SCANNER_URL}
          </code>
          <button
            type="button"
            onClick={copy}
            style={{
              padding: '8px 16px',
              background: copied ? '#15803d' : '#1e3a8a',
              color: 'white',
              border: 0, borderRadius: 4, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              minWidth: 90,
              transition: 'background .12s',
            }}
          >{copied ? 'Copied ✓' : 'Copy URL'}</button>
        </div>
      </div>

      <div>
        <h2 style={{ margin: 0, fontSize: 15, color: '#e5e7eb', marginBottom: 8 }}>How to run the demo</h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
          <li>Click <b>Copy URL</b> above.</li>
          <li>Open a <b>private / incognito</b> browser window (so this dashboard&rsquo;s session doesn&rsquo;t interfere).</li>
          <li>Paste the URL into the address bar. Log in as the demo user when the members portal prompts you.</li>
          <li>Once you&rsquo;re on the scanner and the live-data chip in the corner reads <b>Live</b>, open a <b>second tab</b> in the same private window and paste the URL again. Log in as the <i>same</i> user.</li>
          <li>Switch back to the first tab. The live-data chip flips to <b>Delayed (displaced)</b>, a banner explains that another session took over, and the row updates freeze.</li>
          <li>Click <b>Take over</b> on the banner to reclaim the live slot. The other tab flips to displaced.</li>
        </ol>
      </div>

      <div style={{ padding: 12, background: '#0b3a52', border: '1px solid #164e63', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}>
        <b style={{ color: '#e0f2fe' }}>Why private / incognito?</b> Regular browser tabs share cookies for <code>.f2-tech.ai</code>, so a second tab on the same host would ride the first tab&rsquo;s session and never trigger the displacement path. Private browsing gives each window its own fresh cookie jar, which is the behavior real end-users see when they hit the scanner from two devices or two separate accounts.
      </div>
    </div>
  );
}
