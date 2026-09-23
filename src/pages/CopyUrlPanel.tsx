import { useState } from 'react';

/**
 * IT-F2-400 c/cba0380a (Mike 2026-09-23): reusable "copy this URL +
 * paste into a private window" panel. Same shape as
 * DisplacementDemoPanel (c/a5e11fc9) but generic — takes the URL,
 * title, and step list as props so any nav item can point at it.
 *
 * Pattern: read-only URL box + Copy button + numbered steps + a
 * "why private window" hint. Zero embedded browsing context — the
 * whole point is that the audit demo runs in a clean incognito
 * session with a different user's credentials.
 */

export type CopyUrlPanelProps = {
  title: string;
  subtitle?: string;
  url: string;
  steps: string[];
  note?: string;
};

export function CopyUrlPanel({ title, subtitle, url, steps, note }: CopyUrlPanelProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
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
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        {subtitle && (
          <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>{subtitle}</p>
        )}
      </div>

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          URL
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <code style={{ flex: '1 1 400px', minWidth: 0, background: '#0f172a', padding: '8px 12px', borderRadius: 4, fontSize: 13, color: '#cbd5e1', border: '1px solid #1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {url}
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
        <h2 style={{ margin: 0, fontSize: 15, color: '#e5e7eb', marginBottom: 8 }}>How to run this</h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
          {steps.map((s, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: s }} />
          ))}
        </ol>
      </div>

      {note && (
        <div style={{ padding: 12, background: '#0b3a52', border: '1px solid #164e63', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}
          dangerouslySetInnerHTML={{ __html: note }}
        />
      )}
    </div>
  );
}
