import { useEffect, useState } from 'react';
import { env } from '../env';
import { setTokenBundle, authFetch } from './session';

// SID-based entry auth for f2-user-compliance. Mike (IT-F2-400 items
// 591230fc + 0bf1671d + 589a5693):
//   - Program is denied unless entered with ?sid=<opaque>. If no SID and
//     no valid session, bounce to members.f2-tech.ai/f2 — no self-serve
//     login here.
//   - SID must disappear from the URL as soon as absorbed.
//   - Access role is enforced via SoT (Scanners.<slug>.RoleAccess) on
//     BOTH sides:
//       members portal only mints a scanner-sid for users whose role
//       meets RoleAccess — so a valid redeem = SPA-side authorization
//       (implicit gate).
//       Backend endpoints re-check via ScannersService.
//       caller_can_access_scanner(userData, slug) — no hardwired role
//       list, all reads driven by the Scanners row.
//
// Flow (matches f2-members scanner-sid handoff pattern):
//   1. Read ?sid= from URL.
//   2. If present: POST /auth/redeem-session {sid}. On 2xx, strip sid.
//   3. If absent: POST /auth/mint-sid-from-cookies (F5 recovery for
//      logged-in admins landing directly). On 2xx, redeem the returned
//      sid, then strip URL. On 401, try /api/refresh + retry.
//   4. Verify authorization by probing /rest/admin/scanners/<slug>/meta
//      + one gated endpoint. If the gate 401s, the caller's role doesn't
//      meet Scanners.<slug>.RoleAccess → bounce.
//   5. Any terminal failure → window.location = MEMBERS_PORTAL.

// c/ffeb9be4 (Mike 2026-09-23) — customer-branded scanner hosts must
// NEVER bounce cross-host to members.f2-tech.ai for auth. Compute the
// login URL against the CURRENT origin so users land on
// scanners.f2-tech.ai/login (or whichever branded scanner hub the
// customer is on) with a proper ?next= back to the original path.
function computeLoginUrl(): string {
  if (typeof window === 'undefined') return '/login';
  const nextPath = window.location.pathname + window.location.search + window.location.hash;
  return `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`;
}
const SCANNER_SLUG = 'f2-user-compliance';

type Phase = 'checking' | 'authenticated' | 'redirecting';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [msg, setMsg] = useState('Verifying access…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('sid');

      const proceed = async () => {
        // After redeem, verify SoT gate. A 401 from any /admin/* endpoint
        // means the caller's Cognito role doesn't meet Scanners.<slug>.
        // RoleAccess — bounce rather than let every view fail with 401s.
        setMsg('Checking role access…');
        const allowed = await probeSoTGate();
        if (cancelled) return;
        if (allowed) {
          setPhase('authenticated');
        } else {
          bounce(setPhase, setMsg, "Your role doesn't grant access to compliance review.");
        }
      };

      if (sid) {
        setMsg('Redeeming session…');
        const ok = await redeem(sid);
        if (cancelled) return;
        if (ok) {
          stripSidFromUrl();
          await proceed();
          return;
        }
        // Bad sid → bounce
        bounce(setPhase, setMsg, 'Session token invalid or expired.');
        return;
      }

      // No sid — try F5-recovery from existing cookies
      setMsg('Checking existing session…');
      const minted = await mintSidFromCookies();
      if (cancelled) return;
      if (minted) {
        const ok = await redeem(minted);
        if (cancelled) return;
        if (ok) {
          await proceed();
          return;
        }
      }

      // Try refresh once, then mint again
      const refreshed = await refreshCookies();
      if (cancelled) return;
      if (refreshed) {
        const minted2 = await mintSidFromCookies();
        if (cancelled) return;
        if (minted2) {
          const ok = await redeem(minted2);
          if (cancelled) return;
          if (ok) {
            await proceed();
            return;
          }
        }
      }

      bounce(setPhase, setMsg, 'No active session — redirecting to members portal.');
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'authenticated') return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#e5e7eb' }}>
      <div style={{ padding: 24, background: '#111827', border: '1px solid #374151', borderRadius: 8, textAlign: 'center', maxWidth: 440 }}>
        <h2 style={{ margin: 0, fontSize: 18, marginBottom: 8 }}>F2 User Compliance</h2>
        <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>{msg}</p>
        {phase === 'redirecting' && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
            If you're not redirected in a moment, <a href={computeLoginUrl()} style={{ color: '#60a5fa' }}>click here</a>.
          </p>
        )}
      </div>
    </div>
  );
}

async function redeem(sid: string): Promise<boolean> {
  try {
    const res = await fetch(`${env.AUTH_BASE}/auth/redeem-session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid }),
    });
    if (!res.ok) return false;
    // Stash the token bundle in-memory. Cookies alone don't work
    // because f2-tech.ai cookies can't be Set-Cookie'd onto a
    // *.vercel.app origin; we ride Authorization: Bearer instead.
    const bundle = await res.json();
    if (!bundle?.id_token) return false;
    setTokenBundle(bundle);
    return true;
  } catch {
    return false;
  }
}

async function mintSidFromCookies(): Promise<string | null> {
  try {
    const res = await fetch(`${env.AUTH_BASE}/auth/mint-sid-from-cookies`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.sid === 'string' && body.sid.length > 0 ? body.sid : null;
  } catch {
    return null;
  }
}

// After redeem, probe one gated endpoint to verify the caller's role
// meets Scanners.<slug>.RoleAccess. Uses login-events search which is
// cheap and doesn't require any real filter; a 401 = SoT gate blocked.
async function probeSoTGate(): Promise<boolean> {
  try {
    // First fetch scanner meta (public) — makes sure the scanner exists
    // and is enabled. Fail-open if the meta endpoint 404s (deployment lag).
    const metaRes = await fetch(`${env.AUTH_BASE}/rest/admin/scanners/${encodeURIComponent(SCANNER_SLUG)}/meta`, {
      credentials: 'include',
    });
    if (metaRes.status === 404) return true; // pre-deploy tolerance
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta?.Enabled === false) return false;
    }
    // Probe a gated endpoint. login-events summary is cheap + covered by
    // caller_can_access_scanner. Uses authFetch to attach the in-memory
    // id_token as Authorization: Bearer — the cookie path is broken on
    // *.vercel.app origin (Domain mismatch).
    const probeRes = await authFetch(`${env.AUTH_BASE}/rest/api/admin/login-events/summary`);
    if (probeRes.status === 401 || probeRes.status === 403) return false;
    // Any 2xx (or opaque 5xx we don't want to lock the user out on) = allow.
    return true;
  } catch {
    return true; // fail-open on network hiccup — endpoints will re-check
  }
}

async function refreshCookies(): Promise<boolean> {
  try {
    const res = await fetch(`${env.AUTH_BASE}/api/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

function stripSidFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('sid');
    const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') + url.hash;
    window.history.replaceState(null, '', clean);
  } catch {
    // no-op — best-effort
  }
}

function bounce(setPhase: (p: Phase) => void, setMsg: (m: string) => void, why: string) {
  setPhase('redirecting');
  setMsg(why);
  // Short delay so the user sees why they're being bounced.
  // Same-origin login — never cross-host, per c/ffeb9be4.
  setTimeout(() => {
    window.location.href = computeLoginUrl();
  }, 900);
}
