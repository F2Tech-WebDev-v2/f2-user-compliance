// IT-F2-421 c/b6978add (Mike 2026-09-23): identity for the account
// coin. Mirrors f2-gap-up-down/src/api/me.ts — decode from the in-
// memory id_token instead of a /me round-trip. Cognito's id_token
// carries email + given_name + family_name already; we're bearer-only
// so a network call would just parrot back the same claims.

import { useEffect, useState } from 'react';
import { getIdToken } from '../auth/session';

export type MeState = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

const EMPTY: MeState = { email: null, firstName: null, lastName: null };

function _decode(idToken: string | null): MeState {
  if (!idToken) return EMPTY;
  try {
    const parts = idToken.split('.');
    if (parts.length < 2) return EMPTY;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload: any = JSON.parse(atob(b64 + pad));
    const first = payload.given_name || payload['custom:first_name'] || payload.name || null;
    const last = payload.family_name || payload['custom:last_name'] || null;
    const email = typeof payload.email === 'string' ? payload.email : null;
    return { email, firstName: first, lastName: last };
  } catch {
    return EMPTY;
  }
}

export function useMe(): MeState {
  const [state, setState] = useState<MeState>(() => _decode(getIdToken()));
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const next = _decode(getIdToken());
      setState((prev) => {
        if (prev.email === next.email && prev.firstName === next.firstName && prev.lastName === next.lastName) return prev;
        return next;
      });
      tries += 1;
      if (tries < 20 && (!next.email || !next.firstName)) setTimeout(tick, 250);
    };
    tick();
    return () => { cancelled = true; };
  }, []);
  return state;
}
