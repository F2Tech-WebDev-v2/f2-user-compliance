import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// f2-compliance-review — NYSE Market Data Vendor of Record audit-trail viewer.
// Deployed to Vercel; auth via f2-admin-service (compliance_officer role).
export default defineConfig({
  plugins: [react()],
  server: { port: 5183 },
});
