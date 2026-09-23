/**
 * IT-F2-416 checklist #5 + item 95fac632 (Mike c/60f82674 2026-09-22):
 * Sidebar-nav refactor. Cards moved to the left sidebar (see App.tsx);
 * this component is now the read-only walkthrough overview that stays
 * visible next to the sidebar.
 */

const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: 'Data Flow and Dissemination',
    body: 'Overview + demonstration of how data usage is tracked from content delivery through servers, applications, and end users. Feed-routing verification surfaces exchange → tier → user paths.',
  },
  {
    n: 2,
    title: 'Onboarding Process',
    body: 'Overview + walkthrough of new-user onboarding. Setup a test user via the admin Users panel (bulk-add / add-user modal), triggers the temp-password + set-password + first-name/last-name flow.',
  },
  {
    n: 3,
    title: 'Entitlement System & Controls',
    body: 'Overview of the entitlement system + demonstrate per-user permissioning: enable NYSE product entitlements, modify them, remove them. Also demonstrate simultaneous-access prevention (live-session displacement).',
  },
  {
    n: 4,
    title: 'Reporting',
    body: 'Overview of the reporting process + who has access + how system changes are captured. Generate a monthly report for a random month within the review period.',
  },
  {
    n: 5,
    title: 'Application(s)',
    body: 'Demonstrate how the applications display / use the NYSE data products (CTA Network A and CTA Network B). Overview tab surfaces the tier + scanner catalog + live/delayed indicators.',
  },
];

export function Dashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: '#e5e7eb' }}>NYSE Compliance Walkthrough</h1>
        <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>
          Use the sidebar to jump into the F2 app that supports each step. All links carry the members-portal sid handoff so there&rsquo;s no re-login mid-demo.
        </p>
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((s) => (
          <li key={s.n} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            padding: 14, background: '#111827', border: '1px solid #1f2937', borderRadius: 6,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: '50%',
              background: '#1e3a8a', color: '#e5e7eb',
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>{s.n}</span>
            <div>
              <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 600 }}>{s.title}</div>
              <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div style={{ padding: 12, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, fontSize: 12, color: '#94a3b8' }}>
        <b>Note to reviewers:</b> If any walkthrough step needs a non-production surface, we can point the corresponding sidebar link at a QA / test environment. Reach out to your F2 contact and we&rsquo;ll swap the destination URL.
      </div>
    </div>
  );
}
