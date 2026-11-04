/*
 * ─────────────────────────────────────────────────────────────
 *  LEDGER CONFIG — account names only. No amounts, no people.
 * ─────────────────────────────────────────────────────────────
 *  Every number on the site is fetched from these accounts:
 *    • live in the visitor's browser (keyless public APIs), or
 *    • every 30 min by the "Sync ledger" GitHub Action (token APIs).
 *  Leave anything blank to switch it off; nothing is shown for it.
 *
 *  Projects = issues in `repo` with the `projectLabel` label.
 *  Drives   = milestones in `repo` (with a due date).
 *  Put "goal: $2400" (and optionally "tag: workstation") on its own
 *  line in the issue/milestone description. Donations whose message
 *  contains "#workstation" are counted toward that project.
 */
window.LEDGER_CONFIG = {
  github: "ahmadhussain0033",            // profile, avatar, bio, socials, followers
  repo: "ahmadhussain0033/Ledger",       // where project issues + drive milestones live
  projectLabel: "funding",

  currency: "USD",                       // everything is converted to this
  locale: "en-US",
  timezone: "",                          // IANA name, e.g. "America/New_York" → local-time widget
  email: "",                             // blank → public email on your GitHub profile, if any

  youtube: "",                           // channel ID ("UC…") or @handle → Videos section (synced by the Action)
  siteUrl: "",                           // blank → https://<github>.github.io/<repo>/

  discordServerId: "",                   // enable Server Settings → Widget in Discord first
  discordInvite: "",                     // optional; otherwise the widget's own invite is used

  sources: {
    // Live in the browser, no keys needed:
    opencollective: "",                  // collective slug
    liberapay: "",                       // username
    bitcoin: "",                         // address (use one only for donations)
    ethereum: "",                        // address
    // Synced by the GitHub Action (add the secret named in the README):
    githubSponsors: false,               // true once your Sponsors profile is live
    patreon: "",                         // vanity name  · needs PATREON_TOKEN
    buymeacoffee: "",                    // username     · needs BMC_TOKEN
    kofi: "",                            // username     · needs the Ko-fi relay (relay/kofi-worker.js)
    // Link only (no public data feed exists):
    paypal: "",                          // paypal.me name
  },

  privacy: {
    showPatreonNames: false,             // Patreon has no per-patron privacy flag, so names are hidden unless you opt in
  },

  refreshSeconds: 60,                    // how often live sources re-fetch while the page is open
};
