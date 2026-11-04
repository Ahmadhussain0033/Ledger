/*
 * ─────────────────────────────────────────────────────────────
 *  LEDGER DATA — this is the only file you need to edit.
 * ─────────────────────────────────────────────────────────────
 *  • Dates are ISO strings: "YYYY-MM-DD".
 *  • Amounts are plain numbers in `currency` (no symbols).
 *  • Project totals, drive totals, supporter counts and the
 *    chart are all COMPUTED from `contributions` below, so the
 *    contribution list is the single source of truth.
 *  • Everything currently filled in is SAMPLE DATA. Replace it,
 *    then set `demo: false` to hide the "sample data" badge.
 *  • Delete any field you don't want; the page hides empty bits.
 */
window.LEDGER = {
  demo: true,

  currency: "USD",
  locale: "en-US",

  profile: {
    name: "Ahmad Hussain",
    handle: "ahmadhussain0033",
    tagline: "Building things in the open. This page tracks what I'm working on, what it costs, and who has helped.",
    location: "Earth",
    timezone: "America/New_York",   // IANA name; powers the local-time widget
    avatar: "",                       // image URL, or leave "" for initials
    status: "Open to support",       // shown as a live pill in the header
    responseTime: "Usually replies within a day",
  },

  /*
   * Projects: things that need money.
   * status: "active" | "planned" | "funded" | "paused"
   * raisedExternal: money raised that is NOT logged in `contributions`
   *                 (optional; added on top of the computed total)
   */
  projects: [
    {
      id: "workstation",
      title: "Dev workstation upgrade",
      summary: "A machine that can compile, render and run local models without melting.",
      details: "Current laptop is 7 years old and thermal-throttles on every build. Budget covers CPU, 64 GB RAM, a 2 TB NVMe and a decent monitor. Receipts will be posted here once purchased.",
      status: "active",
      goal: 2400,
      raisedExternal: 0,
      tags: ["hardware", "productivity"],
      link: "",
      updated: "2026-10-28",
    },
    {
      id: "hosting",
      title: "Hosting & infrastructure",
      summary: "Servers, domains and storage for every public project for one year.",
      details: "Covers a small VPS, object storage, two domains and CI minutes. Anything left over rolls into next year's bill.",
      status: "active",
      goal: 600,
      raisedExternal: 0,
      tags: ["infra", "recurring"],
      link: "",
      updated: "2026-10-12",
    },
    {
      id: "course",
      title: "Certification & coursework",
      summary: "Exam fees and course materials for a professional certification.",
      details: "Exam voucher plus official practice material. Planned for early next year.",
      status: "planned",
      goal: 450,
      raisedExternal: 0,
      tags: ["education"],
      link: "",
      updated: "2026-09-30",
    },
    {
      id: "mic",
      title: "Audio setup",
      summary: "Microphone and interface for tutorials and streams.",
      details: "Fully funded. Thank you to everyone who chipped in.",
      status: "funded",
      goal: 300,
      raisedExternal: 0,
      tags: ["hardware", "content"],
      link: "",
      updated: "2026-06-02",
    },
  ],

  /*
   * Funding drives: time-boxed pushes. Progress counts contributions
   * dated between `start` and `end` (inclusive). If `project` is set,
   * only contributions to that project count.
   */
  drives: [
    {
      id: "winter-2026",
      title: "Winter build drive",
      description: "Get the workstation funded before the new year.",
      goal: 1500,
      start: "2026-10-01",
      end: "2026-12-31",
      project: "workstation",
      link: "",
    },
  ],

  /*
   * Contributions: one row per payment received.
   * project:   a project `id` from above, or "" for general support
   * anonymous: true hides the name everywhere on the page
   */
  contributions: [
    { name: "night_owl",      amount: 25,  date: "2025-12-03", project: "mic",         platform: "Ko-fi",           note: "for the mic!" },
    { name: "Jordan",         amount: 50,  date: "2025-12-19", project: "mic",         platform: "PayPal",          note: "" },
    { name: "",               amount: 10,  date: "2026-01-07", project: "",            platform: "Ko-fi",           note: "", anonymous: true },
    { name: "pixelpusher",    amount: 75,  date: "2026-01-22", project: "mic",         platform: "GitHub Sponsors", note: "keep shipping" },
    { name: "Sam R.",         amount: 40,  date: "2026-02-11", project: "mic",         platform: "Patreon",         note: "" },
    { name: "night_owl",      amount: 25,  date: "2026-03-02", project: "hosting",     platform: "Ko-fi",           note: "" },
    { name: "Taylor",         amount: 110, date: "2026-03-28", project: "mic",         platform: "PayPal",          note: "finish it off" },
    { name: "",               amount: 20,  date: "2026-04-09", project: "hosting",     platform: "Ko-fi",           note: "", anonymous: true },
    { name: "Sam R.",         amount: 40,  date: "2026-05-11", project: "hosting",     platform: "Patreon",         note: "" },
    { name: "deltav",         amount: 150, date: "2026-06-17", project: "workstation", platform: "GitHub Sponsors", note: "" },
    { name: "night_owl",      amount: 25,  date: "2026-07-02", project: "hosting",     platform: "Ko-fi",           note: "" },
    { name: "Morgan",         amount: 60,  date: "2026-07-25", project: "",            platform: "PayPal",          note: "general fund" },
    { name: "pixelpusher",    amount: 75,  date: "2026-08-14", project: "workstation", platform: "GitHub Sponsors", note: "" },
    { name: "Sam R.",         amount: 40,  date: "2026-09-11", project: "hosting",     platform: "Patreon",         note: "" },
    { name: "Jordan",         amount: 200, date: "2026-10-04", project: "workstation", platform: "PayPal",          note: "for the build drive" },
    { name: "",               amount: 35,  date: "2026-10-15", project: "workstation", platform: "Ko-fi",           note: "", anonymous: true },
    { name: "deltav",         amount: 150, date: "2026-10-21", project: "workstation", platform: "GitHub Sponsors", note: "round two" },
    { name: "Riley",          amount: 30,  date: "2026-10-30", project: "hosting",     platform: "Ko-fi",           note: "" },
    { name: "Taylor",         amount: 120, date: "2026-11-02", project: "workstation", platform: "PayPal",          note: "" },
  ],

  /*
   * Donation platforms.
   * kind: "recurring" | "one-time" | "crypto"
   * icon: heart | coffee | repeat | wallet | code | coin | link
   * For crypto, put the wallet in `address`; the page adds a copy button.
   */
  platforms: [
    { name: "GitHub Sponsors", handle: "@ahmadhussain0033", url: "https://github.com/sponsors/ahmadhussain0033", kind: "recurring", icon: "code",   note: "Monthly or one-time. No fees." },
    { name: "Ko-fi",           handle: "ko-fi.com/yourname", url: "https://ko-fi.com/",                          kind: "one-time",  icon: "coffee", note: "Quick one-off tips." },
    { name: "Patreon",         handle: "patreon.com/yourname", url: "https://www.patreon.com/",                 kind: "recurring", icon: "repeat", note: "Monthly tiers with updates." },
    { name: "PayPal",          handle: "paypal.me/yourname", url: "https://www.paypal.com/",                     kind: "one-time",  icon: "wallet", note: "Direct transfer." },
    { name: "Bitcoin",         handle: "BTC", url: "", address: "bc1qexampleaddressreplacewithyourown0000", kind: "crypto", icon: "coin", note: "On-chain only." },
  ],

  /*
   * Contacts & socials.
   * discord.serverId: optional. If your server has "Server Widget" enabled
   * (Server Settings → Widget), the page shows a live online-member count.
   * github: optional username for the live GitHub widget.
   */
  contacts: {
    email: "you@example.com",
    discord: {
      name: "My Discord server",
      invite: "https://discord.gg/",
      serverId: "",
    },
    github: "ahmadhussain0033",
    socials: [
      { name: "GitHub",    handle: "@ahmadhussain0033", url: "https://github.com/ahmadhussain0033" },
      { name: "X",         handle: "@yourhandle",       url: "https://x.com/" },
      { name: "Instagram", handle: "@yourhandle",       url: "https://instagram.com/" },
      { name: "YouTube",   handle: "@yourchannel",      url: "https://youtube.com/" },
      { name: "LinkedIn",  handle: "in/yourname",       url: "https://linkedin.com/" },
    ],
  },
};
