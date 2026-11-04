/*
 * Ledger data sources — shared by the browser (js/app.js) and the sync job
 * (scripts/sync.mjs). Every function here talks to a PUBLIC, keyless API.
 *
 * All adapters return a "source" object in one shape:
 * {
 *   id, label, url,
 *   updatedAt:  ISO string,
 *   currency:   currency of the amounts below ("USD", "EUR", "BTC", "ETH", …),
 *   received:   lifetime amount received, or null if the platform doesn't expose it,
 *   balance:    current balance, or null,
 *   supporters: number of supporters/patrons, or null,
 *   recurring:  { amount, period: "week" | "month" } or null,
 *   goal:       { title, target, current, unit: "money" | "count", period } or null,
 *   payments:   [{ id, date, amount, currency, name, message, url }]   (name null = anonymous)
 *   backers:    [{ name, lifetime, monthly, since }]                   (for platforms without payment history)
 *   partial:    true when only the most recent payments could be listed,
 *   note:       short caveat shown in the UI, or null
 * }
 */
(function (root) {
  "use strict";

  const GH = "https://api.github.com";

  async function getJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = new Error(`${res.status} ${res.statusText || ""} from ${new URL(url).host}`.trim());
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  const nowISO = () => new Date().toISOString();

  /* ─────────── issue / milestone metadata ───────────
   * Lines like these anywhere in an issue body or milestone description:
   *   goal: $2,400
   *   tag: workstation
   * are read as metadata and hidden from the displayed text.
   */
  const META_RE = /^[ \t]*(goal|tag|currency)[ \t]*:[ \t]*(.+?)[ \t]*$/gim;
  function parseMeta(text) {
    const out = {};
    String(text || "").replace(META_RE, (_, k, v) => { out[k.toLowerCase()] = v.trim(); return ""; });
    if (out.goal != null) {
      const n = Number(String(out.goal).replace(/[^0-9.]/g, ""));
      out.goal = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (out.tag) out.tag = out.tag.replace(/^#/, "").toLowerCase();
    return out;
  }
  function stripMeta(text) {
    return String(text || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(META_RE, "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* ─────────── GitHub (profile, socials, projects, drives) ─────────── */
  async function github({ login, repo, label = "funding", headers = {} }) {
    const h = { Accept: "application/vnd.github+json", ...headers };
    const out = { updatedAt: nowISO(), profile: null, socials: [], repos: [], projects: [], drives: [], errors: [] };
    const tasks = [];

    if (login) {
      tasks.push(getJSON(`${GH}/users/${encodeURIComponent(login)}`, { headers: h }).then((u) => {
        out.profile = {
          login: u.login, name: u.name || u.login, avatar: u.avatar_url, bio: u.bio, location: u.location,
          blog: u.blog, email: u.email, twitter: u.twitter_username, company: u.company,
          followers: u.followers, following: u.following, repos: u.public_repos, url: u.html_url,
          hireable: u.hireable, createdAt: u.created_at,
        };
      }).catch((e) => out.errors.push(`profile: ${e.message}`)));
      tasks.push(getJSON(`${GH}/users/${encodeURIComponent(login)}/social_accounts`, { headers: h }).then((s) => {
        out.socials = (Array.isArray(s) ? s : []).map((x) => ({ provider: x.provider, url: x.url }));
      }).catch((e) => out.errors.push(`socials: ${e.message}`)));
    }

    if (login) {
      tasks.push(getJSON(`${GH}/users/${encodeURIComponent(login)}/repos?sort=pushed&per_page=100&type=owner`, { headers: h }).then((list) => {
        out.repos = list.filter((r) => !r.fork && !r.private).map((r) => ({
          name: r.name, description: r.description, url: r.html_url, homepage: r.homepage, language: r.language,
          stars: r.stargazers_count, forks: r.forks_count, topics: r.topics || [], pushedAt: r.pushed_at, archived: r.archived,
        }));
      }).catch((e) => out.errors.push(`repos: ${e.message}`)));
    }

    if (repo) {
      tasks.push(getJSON(`${GH}/repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100`, { headers: h }).then((list) => {
        out.projects = list.filter((i) => !i.pull_request).map((i) => {
          const meta = parseMeta(i.body);
          const labels = i.labels.map((l) => (typeof l === "string" ? l : l.name)).filter((n) => n && n.toLowerCase() !== label.toLowerCase());
          const lower = labels.map((l) => l.toLowerCase());
          let status = "active";
          if (i.state === "closed") status = i.state_reason === "not_planned" ? "cancelled" : "funded";
          else if (lower.includes("paused")) status = "paused";
          else if (lower.includes("planned")) status = "planned";
          return {
            number: i.number, title: i.title, url: i.html_url, status,
            body: stripMeta(i.body), goal: meta.goal ?? null, tag: meta.tag || String(i.number),
            labels: labels.filter((l) => !["active", "planned", "paused"].includes(l.toLowerCase())),
            createdAt: i.created_at, updatedAt: i.updated_at, closedAt: i.closed_at,
            comments: i.comments, upvotes: (i.reactions && i.reactions["+1"]) || 0,
            milestone: i.milestone ? i.milestone.number : null,
          };
        });
      }).catch((e) => out.errors.push(`projects: ${e.message}`)));

      tasks.push(getJSON(`${GH}/repos/${repo}/milestones?state=all&per_page=100`, { headers: h }).then((list) => {
        out.drives = list.map((m) => {
          const meta = parseMeta(m.description);
          return {
            number: m.number, title: m.title, url: m.html_url, description: stripMeta(m.description),
            goal: meta.goal ?? null, start: m.created_at, end: m.due_on, state: m.state,
            closedAt: m.closed_at, openIssues: m.open_issues, closedIssues: m.closed_issues,
          };
        });
      }).catch((e) => out.errors.push(`drives: ${e.message}`)));
    }

    await Promise.all(tasks);
    return out;
  }

  /* ─────────── Open Collective (public GraphQL) ─────────── */
  async function openCollective(slug) {
    const query = `query($slug:String!){ account(slug:$slug){ name slug currency
      stats{ balance{valueInCents currency} totalAmountReceived{valueInCents currency} contributorsCount }
      transactions(limit:100, type:CREDIT, kind:[CONTRIBUTION]){ totalCount nodes{ id createdAt amount{valueInCents currency} description fromAccount{ name slug } } } } }`;
    const j = await getJSON("https://api.opencollective.com/graphql/v2", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { slug } }),
    });
    if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
    const a = j.data && j.data.account;
    if (!a) throw new Error(`Open Collective account "${slug}" not found`);
    const cur = a.currency;
    const tx = a.transactions || { nodes: [], totalCount: 0 };
    return {
      id: "opencollective", label: "Open Collective", url: `https://opencollective.com/${a.slug}`, updatedAt: nowISO(),
      currency: cur,
      received: a.stats.totalAmountReceived.valueInCents / 100,
      balance: a.stats.balance.valueInCents / 100,
      supporters: a.stats.contributorsCount,
      recurring: null, goal: null,
      payments: tx.nodes.map((t) => ({
        id: `oc-${t.id}`, date: t.createdAt, amount: t.amount.valueInCents / 100, currency: t.amount.currency,
        name: t.fromAccount ? t.fromAccount.name : null, message: t.description || null,
        url: t.fromAccount ? `https://opencollective.com/${t.fromAccount.slug}` : null,
      })),
      backers: [],
      partial: tx.totalCount > tx.nodes.length,
      note: tx.totalCount > tx.nodes.length ? `Showing the latest ${tx.nodes.length} of ${tx.totalCount} contributions` : null,
    };
  }

  /* ─────────── Liberapay (public.json) ─────────── */
  async function liberapay(user) {
    const j = await getJSON(`https://liberapay.com/${encodeURIComponent(user)}/public.json`);
    const r = j.receiving || null;
    return {
      id: "liberapay", label: "Liberapay", url: `https://liberapay.com/${encodeURIComponent(user)}`, updatedAt: nowISO(),
      currency: r ? r.currency : "EUR",
      received: null, balance: null,
      supporters: Number.isFinite(j.npatrons) ? j.npatrons : null,
      recurring: r ? { amount: Number(r.amount), period: "week" } : null,
      goal: j.goal ? { title: "Liberapay weekly goal", target: Number(j.goal.amount), current: r ? Number(r.amount) : 0, unit: "money", period: "week", currency: j.goal.currency, url: `https://liberapay.com/${encodeURIComponent(user)}` } : null,
      payments: [], backers: [], partial: false,
      note: "Liberapay publishes weekly income and patron count, not individual payments",
    };
  }

  /* ─────────── Bitcoin (mempool.space) ─────────── */
  async function bitcoin(address) {
    const base = "https://mempool.space/api";
    const [info, txs, prices] = await Promise.all([
      getJSON(`${base}/address/${address}`),
      getJSON(`${base}/address/${address}/txs`),
      getJSON(`${base}/v1/prices`).catch(() => null),
    ]);
    const sats = (n) => n / 1e8;
    const payments = [];
    for (const t of txs) {
      const inSum = t.vout.filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + o.value, 0);
      const outSum = t.vin.filter((i) => i.prevout && i.prevout.scriptpubkey_address === address).reduce((s, i) => s + i.prevout.value, 0);
      const net = inSum - outSum;
      if (net <= 0) continue; // outgoing / self-transfer
      payments.push({
        id: `btc-${t.txid}`,
        date: t.status && t.status.block_time ? new Date(t.status.block_time * 1000).toISOString() : nowISO(),
        amount: sats(net), currency: "BTC", name: null,
        message: t.status && t.status.confirmed ? null : "Unconfirmed",
        url: `https://mempool.space/tx/${t.txid}`,
      });
    }
    const funded = info.chain_stats.funded_txo_sum + info.mempool_stats.funded_txo_sum;
    const spent = info.chain_stats.spent_txo_sum + info.mempool_stats.spent_txo_sum;
    return {
      id: "bitcoin", label: "Bitcoin", url: `https://mempool.space/address/${address}`, updatedAt: nowISO(),
      currency: "BTC", received: sats(funded), balance: sats(funded - spent),
      supporters: null, recurring: null, goal: null, payments, backers: [],
      partial: info.chain_stats.tx_count + info.mempool_stats.tx_count > txs.length,
      price: prices ? { USD: prices.USD } : null,
      note: "Valued at today's BTC price",
    };
  }

  /* ─────────── Ethereum (Blockscout) ─────────── */
  async function ethereum(address) {
    const base = "https://eth.blockscout.com/api/v2";
    const info = await getJSON(`${base}/addresses/${address}`);
    const payments = [];
    let params = "", pages = 0, more = false;
    do {
      const j = await getJSON(`${base}/addresses/${address}/transactions?filter=to${params}`);
      for (const t of j.items || []) {
        const v = Number(t.value) / 1e18;
        if (!(v > 0) || t.status !== "ok" || !t.to || t.to.hash.toLowerCase() !== address.toLowerCase()) continue;
        payments.push({
          id: `eth-${t.hash}`, date: t.timestamp, amount: v, currency: "ETH",
          name: (t.from && t.from.ens_domain_name) || null, message: null,
          url: `https://eth.blockscout.com/tx/${t.hash}`, from: t.from ? t.from.hash.toLowerCase() : null,
        });
      }
      more = !!j.next_page_params;
      params = more ? "&" + new URLSearchParams(j.next_page_params).toString() : "";
      pages++;
    } while (more && pages < 3);
    return {
      id: "ethereum", label: "Ethereum", url: `https://eth.blockscout.com/address/${address}`, updatedAt: nowISO(),
      currency: "ETH", received: payments.reduce((s, p) => s + p.amount, 0),
      balance: Number(info.coin_balance || 0) / 1e18,
      supporters: new Set(payments.map((p) => p.from).filter(Boolean)).size,
      recurring: null, goal: null, payments, backers: [],
      partial: more, price: info.exchange_rate ? { USD: Number(info.exchange_rate) } : null,
      note: more ? "Received total covers the latest incoming transfers only · valued at today's ETH price" : "Valued at today's ETH price",
    };
  }

  /* ─────────── Discord (server widget) ─────────── */
  async function discord(serverId) {
    const j = await getJSON(`https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`);
    return {
      updatedAt: nowISO(), name: j.name, invite: j.instant_invite || null,
      online: Number(j.presence_count) || 0,
      members: (j.members || []).slice(0, 12).map((m) => ({ name: m.username, status: m.status })),
    };
  }

  /* ─────────── Exchange rates ─────────── */
  // Returns { usdPer: { USD: 1, EUR: 1.12, … } } (value of 1 unit in USD)
  async function fiatRates() {
    const j = await getJSON("https://api.frankfurter.dev/v1/latest?base=USD");
    const usdPer = { USD: 1 };
    for (const [c, r] of Object.entries(j.rates || {})) if (r > 0) usdPer[c] = 1 / r;
    return { date: j.date, usdPer };
  }

  /* ─────────── summarize: one calculation for the site AND the README ───────────
   * github:  { projects, drives }
   * sources: [{ id, label, data }]  (data = a source object, see top of file)
   * usdPer:  { USD: 1, EUR: 1.12, BTC: 80000, … }  value of one unit in USD
   */
  function summarize({ base = "USD", github: g = {}, sources = [], usdPer = { USD: 1 }, now = Date.now() }) {
    base = String(base).toUpperCase();
    const rates = { USD: 1, ...usdPer };
    for (const s of sources) if (s.data && s.data.price && s.data.price.USD) rates[s.data.currency] = s.data.price.USD;
    const toBase = (amount, cur) => {
      if (amount == null || !Number.isFinite(Number(amount))) return null;
      cur = String(cur || base).toUpperCase();
      if (cur === base) return Number(amount);
      const u = rates[cur], b = rates[base];
      return u && b ? (Number(amount) * u) / b : null;
    };
    const tagsOf = (msg) => (String(msg || "").match(/#[\p{L}\p{N}_-]+/gu) || []).map((t) => t.slice(1).toLowerCase());
    const withData = sources.filter((s) => s.data);

    const payments = withData.flatMap((s) => (s.data.payments || []).map((p) => ({
      ...p, source: s.id, sourceLabel: s.label, value: toBase(p.amount, p.currency), tags: tagsOf(p.message),
    }))).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const parts = [];
    for (const s of withData) {
      const d = s.data;
      let v = null;
      if (d.received != null) v = toBase(d.received, d.currency);
      else if (d.sumPayments) v = payments.filter((p) => p.source === s.id && p.value != null).reduce((t, p) => t + p.value, 0);
      if (v != null) parts.push({ id: s.id, label: s.label, value: v });
    }
    const recurringParts = withData.filter((s) => s.data.recurring && s.data.recurring.amount > 0).map((s) => {
      const r = s.data.recurring, m = toBase(r.amount, s.data.currency);
      return { id: s.id, label: s.label, value: m == null ? null : r.period === "week" ? (m * 52) / 12 : m };
    }).filter((p) => p.value != null);
    const supporterParts = withData.filter((s) => Number.isFinite(s.data.supporters) && s.data.supporters > 0).map((s) => ({ id: s.id, label: s.label, value: s.data.supporters }));

    // Leaderboard: per source, lifetime backer totals when the platform gives them, else summed payments.
    const board = new Map();
    const add = (name, value, src, monthly) => {
      if (!name || value == null) return;
      const k = name.trim().toLowerCase();
      const b = board.get(k) || { name: name.trim(), total: 0, count: 0, monthly: 0, sources: [] };
      b.total += value; b.count += 1; b.monthly += monthly || 0; if (!b.sources.includes(src)) b.sources.push(src);
      board.set(k, b);
    };
    for (const s of withData) {
      if (s.data.backers && s.data.backers.length) for (const b of s.data.backers) add(b.name, toBase(b.lifetime, s.data.currency), s.label, toBase(b.monthly, s.data.currency));
      else for (const p of payments) if (p.source === s.id) add(p.name, p.value, s.label, 0);
    }

    const projects = (g.projects || []).map((p) => {
      const matched = payments.filter((x) => x.tags.includes(p.tag));
      return { ...p, payments: matched, raised: matched.reduce((t, x) => t + (x.value || 0), 0) };
    });
    const drives = (g.drives || []).filter((d) => d.end || d.state === "open").map((d) => {
      const start = new Date(d.start).getTime(), end = d.end ? new Date(d.end).getTime() : null;
      const linked = projects.filter((p) => p.milestone === d.number);
      const tags = new Set(linked.map((p) => p.tag));
      const inWindow = payments.filter((x) => { const t = new Date(x.date).getTime(); return t >= start && (end == null || t <= end) && (!tags.size || x.tags.some((tg) => tags.has(tg))); });
      let phase = "live";
      if (d.state === "closed" || (end && now > end)) phase = "ended"; else if (now < start) phase = "upcoming";
      return { ...d, phase, linked, payments: inWindow, raised: inWindow.reduce((t, x) => t + (x.value || 0), 0) };
    });
    const goals = withData.filter((s) => s.data.goal).map((s) => ({ ...s.data.goal, source: s.label, sourceId: s.id, sourceCurrency: s.data.goal.currency || s.data.currency }));

    return {
      base, toBase, payments, parts, raised: parts.reduce((t, p) => t + p.value, 0),
      recurringParts, recurring: recurringParts.reduce((t, p) => t + p.value, 0),
      supporterParts, supporters: supporterParts.reduce((t, p) => t + p.value, 0),
      leaders: [...board.values()].sort((a, b) => b.total - a.total), projects, drives, goals,
    };
  }

  root.LedgerSources = { github, openCollective, liberapay, bitcoin, ethereum, discord, fiatRates, summarize, parseMeta, stripMeta, getJSON };
})(typeof window !== "undefined" ? window : globalThis);
