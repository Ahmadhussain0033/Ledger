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
  const META_RE = /^[ \t]*(goal|tag|currency|amount|category|vendor|date)[ \t]*:[ \t]*(.+?)[ \t]*$/gim;
  function parseMeta(text) {
    const out = {};
    String(text || "").replace(META_RE, (_, k, v) => { out[k.toLowerCase()] = v.trim(); return ""; });
    for (const k of ["goal", "amount"]) {
      if (out[k] == null) continue;
      const n = Number(String(out[k]).replace(/[^0-9.]/g, ""));
      out[k] = Number.isFinite(n) && n > 0 ? n : null;
    }
    if (out.currency) out.currency = out.currency.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || null;
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

  // Receipts attached to an issue: images (markdown or <img>) and uploaded files/PDFs.
  function receiptsOf(text) {
    const out = [], seen = new Set();
    const add = (url, name, kind) => {
      if (!/^https:\/\//.test(url) || seen.has(url)) return;
      seen.add(url); out.push({ url, name: name || "Receipt", kind });
    };
    const t = String(text || "");
    for (const m of t.matchAll(/!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g)) add(m[2], m[1], "image");
    for (const m of t.matchAll(/<img[^>]+src="([^"]+)"[^>]*?(?:alt="([^"]*)")?[^>]*>/gi)) add(m[1], m[2], "image");
    for (const m of t.matchAll(/(?<!!)\[([^\]]+)\]\((https:\/\/github\.com\/user-attachments\/files\/[^)\s]+|[^)\s]+\.pdf)\)/gi)) add(m[2], m[1], "file");
    for (const m of t.matchAll(/^\s*(https:\/\/github\.com\/user-attachments\/assets\/\S+)\s*$/gm)) add(m[1], "Receipt", "image");
    return out;
  }
  const stripReceipts = (text) => String(text || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<img[^>]*>/gi, "")
    .replace(/^\s*https:\/\/github\.com\/user-attachments\/assets\/\S+\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  /* ─────────── GitHub (profile, socials, projects, drives, expenses) ─────────── */
  async function github({ login, repo, label = "funding", expenseLabel = "expense", headers = {} }) {
    const h = { Accept: "application/vnd.github+json", ...headers };
    const out = { updatedAt: nowISO(), profile: null, socials: [], projects: [], drives: [], expenses: [], errors: [] };
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

      tasks.push(getJSON(`${GH}/repos/${repo}/issues?labels=${encodeURIComponent(expenseLabel)}&state=all&per_page=100`, { headers: h }).then((list) => {
        out.expenses = list.filter((i) => !i.pull_request).map((i) => {
          const meta = parseMeta(i.body);
          const labels = i.labels.map((l) => (typeof l === "string" ? l : l.name)).filter((n) => n && n.toLowerCase() !== expenseLabel.toLowerCase());
          const when = meta.date && !Number.isNaN(Date.parse(meta.date)) ? new Date(meta.date).toISOString() : i.created_at;
          return {
            id: `gh-${i.number}`, number: i.number, title: i.title, url: i.html_url, source: "github",
            date: when, amount: meta.amount ?? null, currency: meta.currency || null,
            tag: meta.tag || null, category: meta.category || labels[0] || null, vendor: meta.vendor || null,
            note: stripReceipts(stripMeta(i.body)), receipts: receiptsOf(i.body),
          };
        });
      }).catch((e) => out.errors.push(`expenses: ${e.message}`)));
    }

    await Promise.all(tasks);
    return out;
  }

  /* ─────────── Open Collective (public GraphQL) ─────────── */
  async function openCollective(slug) {
    const query = `query($slug:String!){ account(slug:$slug){ name slug currency
      stats{ balance{valueInCents currency} totalAmountReceived{valueInCents currency} contributorsCount }
      transactions(limit:100, type:CREDIT, kind:[CONTRIBUTION]){ totalCount nodes{ id createdAt amount{valueInCents currency} description fromAccount{ name slug } } } }
      expenses(account:{slug:$slug}, limit:100, status:[PAID]){ totalCount nodes{ legacyId description amount currency createdAt type tags payee{ name } } } }`;
    const j = await getJSON("https://api.opencollective.com/graphql/v2", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { slug } }),
    });
    if (j.errors && j.errors.length) throw new Error(j.errors[0].message);
    const a = j.data && j.data.account;
    if (!a) throw new Error(`Open Collective account "${slug}" not found`);
    const cur = a.currency;
    const tx = a.transactions || { nodes: [], totalCount: 0 };
    const ex = j.data.expenses || { nodes: [], totalCount: 0 };
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
      expenses: ex.nodes.map((e) => {
        const url = `https://opencollective.com/${a.slug}/expenses/${e.legacyId}`;
        const tags = (e.tags || []).map((t) => String(t).toLowerCase());
        return {
          id: `oc-ex-${e.legacyId}`, title: e.description, date: e.createdAt, amount: e.amount / 100, currency: e.currency,
          vendor: e.payee ? e.payee.name : null, category: tags[0] || String(e.type || "").toLowerCase() || null, tags,
          url, receipts: [{ url, name: "Expense on Open Collective", kind: "link" }], note: null,
        };
      }),
      expensesPartial: ex.totalCount > ex.nodes.length,
      partial: tx.totalCount > tx.nodes.length,
      note: tx.totalCount > tx.nodes.length ? `Showing the latest ${tx.nodes.length} of ${tx.totalCount} contributions` : null,
    };
  }

  /* ─────────── Direct entries (data/manual.json) ───────────
   * Money that doesn't come through a platform: cash, bank transfers, and any
   * sample rows (marked "sample": true). Each expense may carry a receipt URL.
   */
  function manual(json) {
    const j = json || {};
    const kind = (u) => (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u) || /user-attachments\/assets\//.test(u) ? "image" : /\.pdf(\?|$)/i.test(u) ? "file" : "link");
    const payments = (j.donations || []).filter((d) => d && Number(d.amount) > 0 && d.date).map((d, i) => ({
      id: `manual-${d.id || i}`, date: new Date(d.date).toISOString(), amount: Number(d.amount), currency: (d.currency || "USD").toUpperCase(),
      name: d.anonymous || !d.name ? null : String(d.name), message: d.message || null, url: d.url || null, sample: !!d.sample,
    }));
    const expenses = (j.expenses || []).filter((e) => e && Number(e.amount) > 0 && e.date).map((e, i) => {
      const urls = [].concat(e.receipt || [], e.receipts || []).filter((u) => /^https:\/\//.test(u));
      return {
        id: `manual-ex-${e.id || i}`, title: e.title || "Expense", date: new Date(e.date).toISOString(), amount: Number(e.amount),
        currency: (e.currency || "USD").toUpperCase(), vendor: e.vendor || null, category: e.category || null, tag: e.tag ? String(e.tag).replace(/^#/, "").toLowerCase() : null,
        note: e.note || null, url: urls[0] || null, receipts: urls.map((u) => ({ url: u, name: "Receipt", kind: kind(u) })), sample: !!e.sample,
      };
    });
    const named = new Set(payments.filter((p) => p.name).map((p) => p.name.toLowerCase()));
    return {
      id: "manual", label: "Direct", url: null, updatedAt: nowISO(), currency: payments[0] ? payments[0].currency : "USD",
      received: null, sumPayments: true, balance: null, supporters: named.size + payments.filter((p) => !p.name).length || null,
      recurring: null, goal: null, payments, backers: [], expenses, partial: false, note: null,
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
    const add = (name, value, src, monthly, date) => {
      if (!name || value == null) return;
      const k = name.trim().toLowerCase();
      const b = board.get(k) || { name: name.trim(), total: 0, count: 0, monthly: 0, sources: [], first: null, last: null };
      b.total += value; b.count += 1; b.monthly += monthly || 0; if (!b.sources.includes(src)) b.sources.push(src);
      if (date) { if (!b.first || date < b.first) b.first = date; if (!b.last || date > b.last) b.last = date; }
      board.set(k, b);
    };
    for (const s of withData) {
      if (s.data.backers && s.data.backers.length) for (const b of s.data.backers) add(b.name, toBase(b.lifetime, s.data.currency), s.label, toBase(b.monthly, s.data.currency), b.since || null);
      else for (const p of payments) if (p.source === s.id) add(p.name, p.value, s.label, 0, p.date);
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

    /* expenses & receipts */
    const expenses = [
      ...(g.expenses || []).map((e) => ({ ...e, source: "github", sourceLabel: "GitHub" })),
      ...withData.flatMap((s) => (s.data.expenses || []).map((e) => ({ ...e, source: s.id, sourceLabel: s.label }))),
    ].filter((e) => e.amount != null).map((e) => {
      const cur = e.currency || base;
      const tags = [...new Set([...(e.tags || []), ...(e.tag ? [e.tag] : [])])];
      const project = projects.find((p) => tags.includes(p.tag)) || null;
      return { ...e, currency: cur, value: toBase(e.amount, cur), tags, project: project ? { number: project.number, title: project.title, tag: project.tag } : null };
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const spent = expenses.reduce((t, e) => t + (e.value || 0), 0);
    const byCategory = [...expenses.reduce((m, e) => { const k = e.category || "uncategorised"; m.set(k, (m.get(k) || 0) + (e.value || 0)); return m; }, new Map())]
      .map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);
    for (const p of projects) { p.spent = expenses.filter((e) => e.tags.includes(p.tag)).reduce((t, e) => t + (e.value || 0), 0); }
    const expensesPartial = withData.some((s) => s.data.expensesPartial);

    /* milestones, worked out from dated payments (oldest first) */
    const milestones = [];
    const asc = payments.filter((p) => p.value != null && p.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (asc.length) milestones.push({ id: "first-gift", kind: "first", date: asc[0].date, name: asc[0].name, source: asc[0].sourceLabel, value: asc[0].value });
    const RAISED = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
    const COUNT = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    let run = 0, ri = 0, ci = 0; const who = new Set(); let anon = 0;
    for (const p of asc) {
      run += p.value;
      while (ri < RAISED.length && run >= RAISED[ri]) { milestones.push({ id: `raised-${RAISED[ri]}`, kind: "raised", threshold: RAISED[ri], date: p.date }); ri++; }
      if (p.name) who.add(p.name.trim().toLowerCase()); else anon++;
      while (ci < COUNT.length && who.size + anon >= COUNT[ci]) { milestones.push({ id: `donors-${COUNT[ci]}`, kind: "donors", threshold: COUNT[ci], date: p.date }); ci++; }
    }
    const next = {
      raised: ri < RAISED.length && asc.length ? { threshold: RAISED[ri], current: run, prev: ri ? RAISED[ri - 1] : 0 } : null,
      donors: ci < COUNT.length && asc.length ? { threshold: COUNT[ci], current: who.size + anon, prev: ci ? COUNT[ci - 1] : 0 } : null,
    };
    for (const p of projects) {
      if (!p.goal && p.status !== "funded") continue;
      let c = 0, hit = null;
      if (p.goal) for (const x of p.payments.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) { c += x.value || 0; if (c >= p.goal) { hit = x.date; break; } }
      if (hit || p.status === "funded") milestones.push({ id: `project-${p.number}`, kind: "project", title: p.title, url: p.url, goal: p.goal, date: hit || p.closedAt || p.updatedAt });
    }
    for (const d of drives) {
      if (!d.goal) continue;
      let c = 0;
      for (const x of d.payments.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) { c += x.value || 0; if (c >= d.goal) { milestones.push({ id: `drive-${d.number}`, kind: "drive", title: d.title, url: d.url, goal: d.goal, date: x.date }); break; } }
    }
    for (const gl of goals) if (gl.target && gl.current >= gl.target) milestones.push({ id: `goal-${gl.sourceId}`, kind: "goal", title: gl.title, source: gl.source, url: gl.url, date: null });
    // Newest first; on the same moment, the one reached later (bigger threshold) first.
    milestones.forEach((m, i) => { m.order = i; });
    milestones.sort((a, b) => ((b.date ? new Date(b.date).getTime() : now) - (a.date ? new Date(a.date).getTime() : now)) || (b.order - a.order));

    return {
      base, toBase, payments, parts, raised: parts.reduce((t, p) => t + p.value, 0),
      recurringParts, recurring: recurringParts.reduce((t, p) => t + p.value, 0),
      supporterParts, supporters: supporterParts.reduce((t, p) => t + p.value, 0),
      leaders: [...board.values()].sort((a, b) => b.total - a.total), projects, drives, goals,
      expenses, spent, byCategory, expensesPartial, milestones, next,
    };
  }

  /* ─────────── social links ─────────── */
  const SOCIAL = {
    instagram: ["Instagram", (h) => `https://www.instagram.com/${h}/`],
    twitter: ["X", (h) => `https://x.com/${h}`], x: ["X", (h) => `https://x.com/${h}`],
    youtube: ["YouTube", (h) => `https://www.youtube.com/@${h}`],
    tiktok: ["TikTok", (h) => `https://www.tiktok.com/@${h}`],
    linkedin: ["LinkedIn", (h) => `https://www.linkedin.com/in/${h}`],
    threads: ["Threads", (h) => `https://www.threads.net/@${h}`],
    bluesky: ["Bluesky", (h) => `https://bsky.app/profile/${h}`],
    twitch: ["Twitch", (h) => `https://www.twitch.tv/${h}`],
    reddit: ["Reddit", (h) => `https://www.reddit.com/user/${h}`],
    facebook: ["Facebook", (h) => `https://www.facebook.com/${h}`],
    mastodon: ["Mastodon", null], npm: ["npm", (h) => `https://www.npmjs.com/~${h}`],
  };
  // [{ provider, name, handle, url }] — GitHub profile first, config overrides replace the same platform.
  function socialLinks({ profile = null, socials = [], overrides = {} } = {}) {
    const out = [], seen = new Set();
    const push = (provider, name, handle, url) => {
      if (!/^https?:\/\//.test(url || "")) return;
      const key = url.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return; seen.add(key);
      out.push({ provider, name, handle, url });
    };
    const over = Object.fromEntries(Object.entries(overrides || {}).filter(([, v]) => v).map(([k, v]) => [k.toLowerCase() === "x" ? "twitter" : k.toLowerCase(), String(v).trim().replace(/^@/, "")]));
    if (profile && profile.url) push("github", "GitHub", `@${profile.login}`, profile.url);
    for (const [prov, h] of Object.entries(over)) {
      const def = SOCIAL[prov];
      if (/^https?:\/\//.test(h)) push(prov, def ? def[0] : prov, h.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), h);
      else if (def && def[1]) push(prov, def[0], `@${h}`, def[1](h));
    }
    for (const s of socials || []) {
      if (over[s.provider]) continue;
      let host = "", handle = s.url;
      try { const u = new URL(s.url); host = u.hostname.replace(/^www\./, ""); handle = u.pathname.replace(/^\/|\/$/g, "").split("/").pop() || host; } catch {}
      const def = SOCIAL[s.provider];
      push(s.provider, def ? def[0] : host || s.provider, s.provider === "linkedin" ? handle : `@${handle.replace(/^@/, "")}`, s.url);
    }
    if (profile && profile.twitter && !over.twitter) push("twitter", "X", `@${profile.twitter}`, `https://x.com/${profile.twitter}`);
    if (profile && profile.blog) push("website", "Website", profile.blog.replace(/^https?:\/\//, "").replace(/\/$/, ""), /^https?:/.test(profile.blog) ? profile.blog : `https://${profile.blog}`);
    return out;
  }

  root.LedgerSources = { github, openCollective, liberapay, bitcoin, ethereum, discord, fiatRates, summarize, socialLinks, manual, parseMeta, stripMeta, receiptsOf, getJSON };
})(typeof window !== "undefined" ? window : globalThis);
