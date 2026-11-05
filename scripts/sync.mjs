// Sync job: runs in GitHub Actions (see .github/workflows/sync.yml).
// Fetches every source that needs a private token, plus a fallback copy of
// the keyless ones, and writes data/snapshot.json. Tokens never reach the page.
//
// Env (all optional; a source without its token is skipped):
//   GITHUB_TOKEN     provided by Actions; GitHub profile/issues/milestones/status
//   SPONSORS_TOKEN   classic PAT with read:user (amounts + sponsor list); falls back to GITHUB_TOKEN for public counts/goal
//   PATREON_TOKEN    Patreon creator access token
//   PATREON_CURRENCY currency of your Patreon campaign (default USD)
//   BMC_TOKEN        Buy Me a Coffee API token
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const require = createRequire(import.meta.url);
require("../js/sources.js");
const S = globalThis.LedgerSources;
const root = new URL("../", import.meta.url);
const env = process.env;

// Load ledger.config.js (a browser script) without a browser.
const box = { window: {} };
vm.runInNewContext(await readFile(env.LEDGER_CONFIG_FILE || new URL("ledger.config.js", root), "utf8"), box);
const C = box.window.LEDGER_CONFIG || {};
const src = C.sources || {};
const nowISO = () => new Date().toISOString();

const snapshot = { generatedAt: nowISO(), github: null, youtube: null, discord: null, rates: null, sources: {}, errors: {} };
const attempt = async (key, fn) => {
  try { const v = await fn(); if (v) snapshot.sources[key] = v; }
  catch (e) { snapshot.errors[key] = e.message; console.error(`✗ ${key}: ${e.message}`); }
};

/* ─────────── GitHub GraphQL helper ─────────── */
async function gql(token, query, variables) {
  const j = await S.getJSON("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "ledger-sync" },
    body: JSON.stringify({ query, variables }),
  });
  if (j.errors && j.errors.length) { const e = new Error(j.errors.map((x) => x.message).join("; ")); e.gql = j.errors; throw e; }
  return j.data;
}

/* ─────────── GitHub profile, projects, drives, status ─────────── */
if (C.github || C.repo) {
  const headers = env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}`, "User-Agent": "ledger-sync" } : { "User-Agent": "ledger-sync" };
  const g = await S.github({ login: C.github, repo: C.repo, label: C.projectLabel || "funding", expenseLabel: C.expenseLabel || "expense", headers });
  if (C.github && env.GITHUB_TOKEN) {
    try {
      const d = await gql(env.GITHUB_TOKEN, `query($l:String!){ user(login:$l){ status{ message emoji indicatesLimitedAvailability } } }`, { l: C.github });
      g.status = d.user && d.user.status ? d.user.status : null;
    } catch (e) { g.errors.push(`status: ${e.message}`); }
    try {
      const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
      const d = await gql(env.GITHUB_TOKEN, `query($l:String!){ user(login:$l){
        contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } } }
        pinnedItems(first:6, types:REPOSITORY){ nodes{ ... on Repository{ name description url homepageUrl stargazerCount forkCount pushedAt isArchived primaryLanguage{ name } } } } } }`, { l: C.github });
      const cal = d.user.contributionsCollection.contributionCalendar;
      g.contributions = {
        total: cal.totalContributions,
        weeks: cal.weeks.map((w) => ({ days: w.contributionDays.map((x) => ({ date: x.date, count: x.contributionCount, level: LEVEL[x.contributionLevel] ?? 0 })) })),
      };
      g.pinned = d.user.pinnedItems.nodes.map((r) => ({
        name: r.name, description: r.description, url: r.url, homepage: r.homepageUrl, stars: r.stargazerCount,
        forks: r.forkCount, pushedAt: r.pushedAt, archived: r.isArchived, language: r.primaryLanguage && r.primaryLanguage.name,
      }));
    } catch (e) { g.errors.push(`contributions: ${e.message}`); }
  }
  snapshot.github = g;
  if (g.errors.length) snapshot.errors.github = g.errors.join("; ");
}

/* ─────────── GitHub Sponsors ─────────── */
const ENTITY = `sponsorEntity{ ... on User{ login name } ... on Organization{ login name } }`;
async function githubSponsors(login) {
  const personal = !!env.SPONSORS_TOKEN;
  const token = env.SPONSORS_TOKEN || env.GITHUB_TOKEN;
  if (!token) throw new Error("no token available");
  const base = `hasSponsorsListing sponsorsListing{ url activeGoal{ kind targetValue percentComplete title } } sponsors{ totalCount }`;
  const full = `${base} monthlyEstimatedSponsorsIncomeInCents
    sponsorshipsAsMaintainer(first:100, activeOnly:false, includePrivate:true){ nodes{ createdAt isActive isOneTimePayment privacyLevel tier{ monthlyPriceInCents isOneTime } ${ENTITY} } }`;
  const life = `lifetimeReceivedSponsorshipValues(first:100){ nodes{ amountInCents sponsor{ ... on User{ login name } ... on Organization{ login name } } } }`;
  let u;
  if (personal) {
    try { u = (await gql(token, `query($l:String!){ user(login:$l){ ${full} ${life} } }`, { l: login })).user; }
    catch (e) { console.warn(`Sponsors lifetime values unavailable (${e.message}); retrying without them`); u = (await gql(token, `query($l:String!){ user(login:$l){ ${full} } }`, { l: login })).user; }
  } else {
    u = (await gql(token, `query($l:String!){ user(login:$l){ ${base} } }`, { l: login })).user;
  }
  if (!u || !u.hasSponsorsListing) throw new Error(`${login} has no GitHub Sponsors profile`);

  const ships = (u.sponsorshipsAsMaintainer && u.sponsorshipsAsMaintainer.nodes) || [];
  const privateLogins = new Set(ships.filter((s) => s.privacyLevel === "PRIVATE" && s.sponsorEntity).map((s) => s.sponsorEntity.login));
  const display = (ent, priv) => (priv || !ent ? null : ent.name || ent.login);
  const g = u.sponsorsListing && u.sponsorsListing.activeGoal;
  const monthlyNow = new Map(ships.filter((s) => s.isActive && !s.isOneTimePayment && s.sponsorEntity).map((s) => [s.sponsorEntity.login, s.tier.monthlyPriceInCents / 100]));
  const lifetime = u.lifetimeReceivedSponsorshipValues ? u.lifetimeReceivedSponsorshipValues.nodes : null;

  return {
    id: "githubSponsors", label: "GitHub Sponsors", url: `https://github.com/sponsors/${login}`, updatedAt: nowISO(),
    currency: "USD",
    received: lifetime ? lifetime.reduce((s, n) => s + n.amountInCents / 100, 0) : null,
    balance: null,
    supporters: u.sponsors.totalCount,
    recurring: u.monthlyEstimatedSponsorsIncomeInCents != null ? { amount: u.monthlyEstimatedSponsorsIncomeInCents / 100, period: "month" } : null,
    goal: g ? {
      title: g.title || "GitHub Sponsors goal",
      target: g.targetValue, current: Math.round((g.targetValue * g.percentComplete) / 100),
      unit: g.kind === "TOTAL_SPONSORS_COUNT" ? "count" : "money", period: g.kind === "MONTHLY_SPONSORSHIP_AMOUNT" ? "month" : null,
      currency: "USD", url: `https://github.com/sponsors/${login}`,
    } : null,
    // One-time sponsorships are single real payments; monthly ones are listed as backers (GitHub doesn't expose each charge).
    payments: ships.filter((s) => s.isOneTimePayment).map((s, i) => ({
      id: `ghs-${s.createdAt}-${i}`, date: s.createdAt, amount: s.tier.monthlyPriceInCents / 100, currency: "USD",
      name: display(s.sponsorEntity, s.privacyLevel === "PRIVATE"), message: "One-time sponsorship", url: null,
    })),
    backers: lifetime ? lifetime.map((n) => ({
      name: display(n.sponsor, n.sponsor && privateLogins.has(n.sponsor.login)),
      lifetime: n.amountInCents / 100, monthly: n.sponsor ? monthlyNow.get(n.sponsor.login) || 0 : 0, since: null,
    })) : [],
    partial: false,
    note: personal ? null : "Add a SPONSORS_TOKEN secret to show amounts",
  };
}

/* ─────────── Patreon ─────────── */
async function patreon(token) {
  const h = { headers: { Authorization: `Bearer ${token}`, "User-Agent": "ledger-sync" } };
  const camp = await S.getJSON("https://www.patreon.com/api/oauth2/v2/campaigns?fields%5Bcampaign%5D=patron_count,url,vanity", h);
  const c = camp.data && camp.data[0];
  if (!c) throw new Error("no Patreon campaign on this token");
  const members = [];
  let next = `https://www.patreon.com/api/oauth2/v2/campaigns/${c.id}/members?fields%5Bmember%5D=full_name,patron_status,currently_entitled_amount_cents,lifetime_support_cents,pledge_relationship_start&page%5Bcount%5D=1000`;
  while (next) { const j = await S.getJSON(next, h); members.push(...j.data.map((m) => m.attributes)); next = j.links && j.links.next; }
  const showNames = !!(C.privacy && C.privacy.showPatreonNames);
  const active = members.filter((m) => m.patron_status === "active_patron");
  return {
    id: "patreon", label: "Patreon", url: c.attributes.url || `https://www.patreon.com/${src.patreon || ""}`, updatedAt: nowISO(),
    currency: env.PATREON_CURRENCY || "USD",
    received: members.reduce((s, m) => s + (m.lifetime_support_cents || 0) / 100, 0),
    balance: null,
    supporters: active.length,
    recurring: { amount: active.reduce((s, m) => s + (m.currently_entitled_amount_cents || 0) / 100, 0), period: "month" },
    goal: null, payments: [],
    backers: members.filter((m) => m.lifetime_support_cents > 0).map((m) => ({
      name: showNames ? m.full_name : null, lifetime: m.lifetime_support_cents / 100,
      monthly: m.patron_status === "active_patron" ? (m.currently_entitled_amount_cents || 0) / 100 : 0, since: m.pledge_relationship_start,
    })),
    partial: false,
    note: showNames ? null : "Patron names hidden (privacy.showPatreonNames)",
  };
}

/* ─────────── Buy Me a Coffee ─────────── */
async function buyMeACoffee(token) {
  const h = { headers: { Authorization: `Bearer ${token}`, "User-Agent": "ledger-sync" } };
  const all = [];
  let next = "https://developers.buymeacoffee.com/api/v1/supporters";
  for (let i = 0; next && i < 50; i++) { const j = await S.getJSON(next, h); all.push(...(j.data || [])); next = j.next_page_url; }
  let subs = [];
  try {
    let n = "https://developers.buymeacoffee.com/api/v1/subscriptions?status=active";
    for (let i = 0; n && i < 20; i++) { const j = await S.getJSON(n, h); subs.push(...(j.data || [])); n = j.next_page_url; }
  } catch (e) { console.warn(`BMC subscriptions unavailable: ${e.message}`); }
  const toISO = (s) => (s ? new Date(String(s).replace(" ", "T") + (String(s).includes("Z") ? "" : "Z")).toISOString() : nowISO());
  const payments = all.filter((p) => !Number(p.is_refunded)).map((p) => {
    const pub = Number(p.support_visibility) === 1;
    return {
      id: `bmc-${p.support_id}`, date: toISO(p.support_created_on),
      amount: Number(p.support_coffees || 1) * Number(p.support_coffee_price || 0), currency: p.support_currency || "USD",
      name: pub ? p.supporter_name || null : null, message: pub ? p.support_note || null : null, url: null,
    };
  });
  const monthly = subs.filter((s) => !Number(s.subscription_is_cancelled)).reduce((sum, s) => {
    const amt = Number(s.subscription_coffee_price || 0) * Number(s.subscription_coffee_num || 1);
    return sum + (String(s.subscription_duration_type).toLowerCase().startsWith("year") ? amt / 12 : amt);
  }, 0);
  const named = new Set(payments.filter((p) => p.name).map((p) => p.name.toLowerCase()));
  return {
    id: "buymeacoffee", label: "Buy Me a Coffee", url: `https://www.buymeacoffee.com/${src.buymeacoffee || ""}`, updatedAt: nowISO(),
    currency: payments[0] ? payments[0].currency : "USD",
    received: null, sumPayments: true, balance: null,
    supporters: named.size + payments.filter((p) => !p.name).length,
    recurring: subs.length ? { amount: monthly, period: "month" } : null,
    goal: null, payments, backers: [], partial: false, note: null,
  };
}

/* ─────────── Ko-fi (events recorded by the webhook relay) ─────────── */
async function kofi() {
  let events = [];
  try { events = JSON.parse(await readFile(new URL("data/kofi.json", root), "utf8")); } catch { events = []; }
  const named = new Set(events.filter((p) => p.name).map((p) => p.name.toLowerCase()));
  return {
    id: "kofi", label: "Ko-fi", url: `https://ko-fi.com/${src.kofi}`, updatedAt: nowISO(),
    currency: events[0] ? events[0].currency : "USD",
    received: null, sumPayments: true, balance: null,
    supporters: named.size + events.filter((p) => !p.name).length,
    recurring: null, goal: null,
    payments: events.map((e) => ({ id: `kofi-${e.id}`, date: e.date, amount: e.amount, currency: e.currency, name: e.name, message: e.message, url: null })),
    backers: [], partial: false,
    note: events.length ? null : "Waiting for the first Ko-fi webhook",
  };
}

/* ─────────── YouTube (public RSS feed, no key) ─────────── */
async function youtube(ref) {
  let channelId = String(ref).trim();
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    const handle = channelId.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/^@?/, "@");
    const res = await fetch(`https://www.youtube.com/${handle}`, { headers: { "User-Agent": "Mozilla/5.0 (ledger-sync)", "Accept-Language": "en" } });
    if (!res.ok) throw new Error(`YouTube ${handle}: ${res.status}`);
    const html = await res.text();
    const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) || html.match(/"externalId":"(UC[\w-]{22})"/);
    if (!m) throw new Error(`Couldn't find the channel ID for ${handle}`);
    channelId = m[1];
  }
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!res.ok) throw new Error(`YouTube feed: ${res.status}`);
  const xml = await res.text();
  const unxml = (t) => String(t || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const tag = (src, name) => { const m = src.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? unxml(m[1].trim()) : null; };
  const head = xml.split("<entry>")[0];
  const videos = xml.split("<entry>").slice(1).map((e) => {
    const views = e.match(/<media:statistics views="(\d+)"/);
    return {
      id: tag(e, "yt:videoId"), title: tag(e, "title"), published: tag(e, "published"),
      views: views ? Number(views[1]) : null,
      description: (tag(e, "media:description") || "").slice(0, 280),
    };
  }).filter((v) => v.id && !/^\s*#shorts/i.test(v.title || ""));
  return { channelId, title: tag(head, "title"), url: `https://www.youtube.com/channel/${channelId}`, updatedAt: nowISO(), videos: videos.slice(0, 12) };
}

/* ─────────── run ─────────── */
if (src.githubSponsors && C.github) await attempt("githubSponsors", () => githubSponsors(C.github));
if (src.patreon && env.PATREON_TOKEN) await attempt("patreon", () => patreon(env.PATREON_TOKEN));
else if (src.patreon) snapshot.errors.patreon = "PATREON_TOKEN secret not set";
if (src.buymeacoffee && env.BMC_TOKEN) await attempt("buymeacoffee", () => buyMeACoffee(env.BMC_TOKEN));
else if (src.buymeacoffee) snapshot.errors.buymeacoffee = "BMC_TOKEN secret not set";
if (src.kofi) await attempt("kofi", kofi);

// Fallback copies of the keyless sources (the page prefers its own live fetch).
if (src.opencollective) await attempt("opencollective", () => S.openCollective(src.opencollective));
if (src.liberapay) await attempt("liberapay", () => S.liberapay(src.liberapay));
if (src.bitcoin) await attempt("bitcoin", () => S.bitcoin(src.bitcoin));
if (src.ethereum) await attempt("ethereum", () => S.ethereum(src.ethereum));
if (C.youtube) { try { snapshot.youtube = await youtube(C.youtube); } catch (e) { snapshot.errors.youtube = e.message; console.error(`✗ youtube: ${e.message}`); } }
try { const r = await S.fiatRates(); snapshot.rates = { date: r.date, usdPer: r.usdPer }; } catch (e) { snapshot.errors.rates = e.message; }
if (C.discordServerId) { try { const d = await S.discord(C.discordServerId); snapshot.discord = { name: d.name, invite: d.invite }; } catch (e) { snapshot.errors.discord = e.message; } }

/* ─────────── write only when something real changed ─────────── */
const VOLATILE = new Set(["generatedAt", "updatedAt", "price", "rates", "views"]);
const stable = (o) => JSON.stringify(o, (k, v) => (VOLATILE.has(k) ? undefined : v));
const outFile = env.SNAPSHOT_OUT || new URL("data/snapshot.json", root);
let prev = null;
try { prev = JSON.parse(await readFile(outFile, "utf8")); } catch {}
if (prev && stable(prev) === stable(snapshot)) {
  console.log("No changes in source data; snapshot left as is.");
} else {
  if (!env.SNAPSHOT_OUT) await mkdir(new URL("data/", root), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${env.SNAPSHOT_OUT || "data/snapshot.json"} · sources: ${Object.keys(snapshot.sources).join(", ") || "none"} · errors: ${Object.keys(snapshot.errors).join(", ") || "none"}`);
}
