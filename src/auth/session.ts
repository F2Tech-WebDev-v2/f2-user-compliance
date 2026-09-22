// In-memory id_token store + fetch wrapper. Cookies from
// f2-admin-service2.f2-tech.ai (Domain=.f2-tech.ai) can't be set on
// f2-user-compliance.vercel.app — different registered domain, browser
// rejects cross-origin Set-Cookie. So we hold the token bundle in-memory
// after redeem-session and attach it as Authorization: Bearer on every
// authenticated fetch. Same shape as chart-service and other bearer
// callers in the fleet.
//
// 401 auto-refresh (Mike c/8a5e6042 IT-F2-400): id_tokens are 1h; a
// long-lived compliance session (auditor pulling a dossier for 90 min)
// will 401 on the next fetch after the token expires. authFetch catches
// that, calls /api/refresh with the in-memory refresh_token, stashes the
// fresh bundle, and retries once. Matches f2-members AuthContext
// refreshCookies() pattern (cookies fleet-wide, body here since we're
// bearer-only on the vercel.app origin).

import { env } from '../env';

type TokenBundle = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  [k: string]: any;
};

let _bundle: TokenBundle | null = null;

export function setTokenBundle(b: TokenBundle | null): void {
  _bundle = b;
}

export function getIdToken(): string | null {
  return _bundle?.id_token || null;
}

export function hasSession(): boolean {
  return !!_bundle?.id_token;
}

// IT-F2-416 c/2f4fe1a7 (Mike 2026-09-22): per-tab claim gating.
// custom:claims is a stringified JSON array Cognito stores on each
// user — each entry is { scanner: "<slug>", <feature_key>: "true"|"false", ... }.
// SoT for the feature keys lives on Scanners.f2-user-compliance.
// {claims_schema, features} — 14 tab keys + pro_tier_gate. Admin role
// bypasses the gate entirely.
const SCANNER_SLUG = 'f2-user-compliance';
let _cachedClaims: Record<string, string> | null = null;
let _cachedClaimsToken: string | null = null;

function _decodeIdTokenPayload(idToken: string): any | null {
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch { return null; }
}

/**
 * Parse the current user's claims scoped to this scanner. Returns an
 * object like { overview: "true", dossier: "false", ... } or {} when
 * the user has no claims. Cached per id_token so callers can invoke
 * per-render without JSON parsing on every read.
 */
export function getScannerClaims(): Record<string, string> {
  const tok = getIdToken();
  if (!tok) { _cachedClaims = null; _cachedClaimsToken = null; return {}; }
  if (_cachedClaims && _cachedClaimsToken === tok) return _cachedClaims;
  const payload = _decodeIdTokenPayload(tok);
  const raw = payload?.['custom:claims'];
  let parsed: any[] = [];
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { parsed = []; }
  const match = Array.isArray(parsed)
    ? parsed.find((e: any) => e && typeof e === 'object' && e.scanner === SCANNER_SLUG)
    : null;
  const claims: Record<string, string> = {};
  if (match && typeof match === 'object') {
    for (const [k, v] of Object.entries(match)) {
      if (k === 'scanner') continue;
      claims[k] = String(v);
    }
  }
  _cachedClaims = claims;
  _cachedClaimsToken = tok;
  return claims;
}

/** True if the current user is an admin (bypasses per-tab gating). */
export function isAdmin(): boolean {
  const tok = getIdToken();
  if (!tok) return false;
  const payload = _decodeIdTokenPayload(tok);
  const role = String(payload?.['custom:role'] || '').trim().toLowerCase();
  return role === 'admin';
}

/**
 * True if the current user can see the given tab. Admin bypass first,
 * then check the scanner-scoped claim. Missing claim (never granted) =
 * false = hidden. Matches the SoT default on Scanners.<slug>.claims_schema.
 */
export function hasTabClaim(key: string): boolean {
  if (isAdmin()) return true;
  const claims = getScannerClaims();
  return claims[key] === 'true';
}

// In-flight refresh dedup — many concurrent fetches all 401'ing at once
// (e.g. Dossier fanning out 4 fetches after the token expired) must not
// each fire their own refresh. First 401 owns the refresh; the rest await
// the same promise and retry against the fresh token.
let _inflightRefresh: Promise<boolean> | null = null;

async function refreshBundle(): Promise<boolean> {
  const refresh_token = _bundle?.refresh_token;
  if (!refresh_token) return false;
  try {
    // Bearer-friendly refresh endpoint that takes refreshToken in body
    // (SsoController.refreshSession — used across scanner SPAs). The
    // cookie-based /api/refresh doesn't work here because f2-tech.ai
    // cookies don't reach the *.vercel.app origin.
    const res = await fetch(`${env.AUTH_BASE}/auth/refresh-scanner-session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh_token }),
    });
    if (!res.ok) return false;
    const fresh = await res.json();
    if (!fresh?.id_token) return false;
    // Cognito refresh may or may not rotate the refresh_token; keep the
    // old one when the server doesn't hand back a fresh one.
    _bundle = { ..._bundle, ...fresh, refresh_token: fresh.refresh_token || refresh_token };
    return true;
  } catch {
    return false;
  }
}

// Drop-in fetch replacement. Attaches Authorization: Bearer <id_token>
// when a token is present; on a 401 response, transparently refreshes
// the bundle and retries once. credentials:'include' stays for any
// future cookie-based path.
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const build = (): RequestInit => {
    const headers = new Headers(init?.headers || {});
    const tok = getIdToken();
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    return { credentials: 'include', ...(init || {}), headers };
  };
  const first = await fetch(input, build());
  if (first.status !== 401) return first;
  // 401 — attempt one refresh + one retry. Dedup concurrent refresh
  // attempts so the whole SPA converges on the fresh token together.
  if (!_inflightRefresh) {
    _inflightRefresh = refreshBundle().finally(() => { _inflightRefresh = null; });
  }
  const refreshed = await _inflightRefresh;
  if (!refreshed) return first;
  return fetch(input, build());
}
