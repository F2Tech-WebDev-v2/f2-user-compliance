/**
 * IT-F2-416 (Mike checklist item 5, 2026-09-22): F2 User Compliance
 * dashboard. Landing page that walks an NYSE auditor through the
 * demo of our compliance apps, one card per audit-agenda step.
 *
 * Cards deep-link to the apps that support each step:
 *   1. Data Flow & Dissemination      → f2-compliance-review (Feed Routing tab)
 *   2. Onboarding Process             → f2-admin Users panel (bulk-add)
 *   3. Entitlement System & Controls  → f2-admin Users panel (edit user)
 *   4. Reporting                       → f2-compliance-report
 *   5. Applications (CTA A/B display)  → f2-compliance-review (Overview)
 *
 * All destinations use the branded members.f2-tech.ai handoff so the
 * auditor lands with a valid scanner sid (no re-login mid-demo).
 */
const STEPS: {
  n: number;
  title: string;
  body: string;
  href: string;
  cta: string;
}[] = [
  {
    n: 1,
    title: 'Data Flow and Dissemination',
    body: 'Overview + demonstration of how data usage is tracked from content delivery through servers, applications, and end users. Feed-routing verification surfaces exchange → tier → user paths.',
    href: 'https://members.f2-tech.ai/f2/f2-compliance-review?next=/feed-routing',
    cta: 'Open Feed Routing Verification →',
  },
  {
    n: 2,
    title: 'Onboarding Process',
    body: 'Overview + walkthrough of new-user onboarding. Setup a test user via the admin Users panel (bulk-add / add-user modal), triggers the temp-password + set-password + first-name/last-name flow.',
    href: 'https://admin.f2-tech.ai/admin/users',
    cta: 'Open Users panel →',
  },
  {
    n: 3,
    title: 'Entitlement System & Controls',
    body: 'Overview of the entitlement system + demonstrate per-user permissioning: enable NYSE product entitlements, modify them, remove them. Also demonstrate simultaneous-access prevention (live-session displacement).',
    href: 'https://admin.f2-tech.ai/admin/users',
    cta: 'Open Users panel →',
  },
  {
    n: 4,
    title: 'Reporting',
    body: 'Overview of the reporting process + who has access + how system changes are captured. Generate a monthly report for a random month within the review period.',
    href: 'https://members.f2-tech.ai/f2/f2-compliance-report?next=/counts-by-month',
    cta: 'Open Compliance Report → Counts by Month →',
  },
  {
    n: 5,
    title: 'Application(s)',
    body: 'Demonstrate how the applications display / use the NYSE data products (CTA Network A and CTA Network B). Overview tab surfaces the tier + scanner catalog + live/delayed indicators.',
    href: 'https://members.f2-tech.ai/f2/f2-compliance-review',
    cta: 'Open Compliance Review Overview →',
  },
];

export function Dashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: '#e5e7eb' }}>NYSE Audit Walkthrough — Agenda</h1>
        <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>
          Each card below opens the F2 app that supports the corresponding audit-agenda step. All links carry the members-portal sid handoff so no re-login mid-demo.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {STEPS.map((s) => (
          <a
            key={s.n}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 16,
              background: '#111827',
              border: '1px solid #374151',
              borderRadius: 6,
              textDecoration: 'none',
              transition: 'border-color .12s, background .12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#60a5fa'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#374151'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#1e3a8a',
                color: '#e5e7eb',
                fontSize: 13,
                fontWeight: 700,
              }}>{s.n}</span>
              <h2 style={{ margin: 0, fontSize: 15, color: '#e5e7eb' }}>{s.title}</h2>
            </div>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>{s.body}</p>
            <span style={{ marginTop: 'auto', color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>{s.cta}</span>
          </a>
        ))}
      </div>
      <div style={{ padding: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, fontSize: 12, color: '#94a3b8' }}>
        <b>Note to reviewers:</b> If any walkthrough step needs a non-production surface, we can point the corresponding link at a QA / test environment. Reach out to your F2 contact and we&rsquo;ll swap the destination URL on this dashboard.
      </div>
    </div>
  );
}
