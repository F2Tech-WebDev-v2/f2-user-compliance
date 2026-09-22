// Auth-base URL for f2-admin-service. Same pattern as f2-members.
// Prod is proxied same-origin via vercel.json rewrites (see /rest/*).
export const env = {
  AUTH_BASE: (import.meta as any).env?.VITE_AUTH_BASE || '',
};
