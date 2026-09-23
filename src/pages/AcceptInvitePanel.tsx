/**
 * IT-F2-421 c/077182bf → c/c8e38fa4 (Mike 2026-09-23) —
 * Set-password / accept-invite instructions panel.
 *
 * Original UI (c/077182bf): paste-a-magic-link box that iframed the
 * accept-invite flow. Dropped per c/c8e38fa4: "set password page
 * instead of iframe will be another page with directions to take
 * your email or magic link and paste it into a private browser and
 * follow the directions". The iframe was subject to browser cookie-
 * isolation quirks (Firefox pre-138 shared cookies with the parent),
 * which polluted the demo. Directions-only surface is what Mike
 * wants — the auditor runs the flow themselves in a clean private
 * window.
 */

export function AcceptInvitePanel() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 24, maxWidth: 760, color: '#e5e7eb', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20 }}>Set password + name (invitee flow)</h1>
        <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 13 }}>
          Demonstrates the first-time invitee experience: temp password → set new password → capture first / last name. The flow runs on the members portal against the invited user&rsquo;s account, so it needs to happen in a session that <b>isn&rsquo;t</b> the admin&rsquo;s current one.
        </p>
      </div>

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          What you need
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
          <li>An invited user&rsquo;s <b>email address</b> (they must exist in the pool from Step 2 · Onboarding), <b>or</b></li>
          <li>Their <b>magic-link URL</b> (from the "Copy magic link" button on the Onboarding panel, or from the SES-delivered invitation email).</li>
        </ul>
      </div>

      <div>
        <h2 style={{ margin: 0, fontSize: 15, color: '#e5e7eb', marginBottom: 8 }}>How to run the demo</h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
          <li>Open a <b>private / incognito</b> browser window. The compliance dashboard&rsquo;s admin session must NOT be active in the demo window — otherwise the members portal treats the visit as the admin, not the invitee, and the set-password flow never fires.</li>
          <li>
            <b>If you have the magic-link URL:</b> paste it into the address bar. Members portal recognizes the invite token and drops you straight into set-password.<br />
            <b>If you have only the email:</b> paste <code>https://members.f2-tech.ai/login</code>, choose "Forgot password" or the invite-resend flow — depending on which pool the account was minted in.
          </li>
          <li>Set a password. Complete the first-name / last-name capture form.</li>
          <li>You&rsquo;ll land on the members-portal scanner catalog for that user&rsquo;s brand. That&rsquo;s the end-user post-login surface — same catalog Step 5 · Applications demos.</li>
        </ol>
      </div>

      <div style={{ padding: 12, background: '#0b3a52', border: '1px solid #164e63', borderRadius: 4, fontSize: 12, color: '#cbd5e1' }}>
        <b style={{ color: '#e0f2fe' }}>Why private / incognito?</b> The compliance dashboard is signed in as an admin at <code>.f2-tech.ai</code>. That cookie is domain-shared: loading a members-portal URL in the same window carries the admin&rsquo;s session and shows the admin&rsquo;s dashboard instead of the invitee&rsquo;s set-password prompt. A private window gives you a fresh cookie jar, so the invited user&rsquo;s magic-link redeem lands in a clean session.
      </div>
    </div>
  );
}
