/* Ledger — renders everything from live sources (js/sources.js) and the
 * Action-built snapshot (data/snapshot.json). ledger.config.js only holds
 * account names. Nothing on the page is typed in by hand. */
(() => {
  "use strict";

  const C = window.LEDGER_CONFIG || {};
  const SRC = { ...(C.sources || {}) };
  const DISCORD_ID = C.discordServerId || "";
  const TZ = C.timezone || "";
  const L = window.LedgerSources;
  const LOCALE = C.locale || "en-US";
  const BASE = String(C.currency || "USD").toUpperCase();
  const REFRESH_MS = Math.max(20, Number(C.refreshSeconds) || 60) * 1000;
  const OWNER = location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || new URLSearchParams(location.search).has("setup");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ───────────── helpers ───────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const nf = (opts) => new Intl.NumberFormat(LOCALE, opts);
  const money = (n, cur = BASE) => {
    if (n == null || !Number.isFinite(n)) return "–";
    const crypto = cur === "BTC" || cur === "ETH";
    if (crypto) return `${nf({ maximumFractionDigits: n < 0.01 ? 6 : 4 }).format(n)} ${cur}`;
    const frac = Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2;
    try { return nf({ style: "currency", currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n); }
    catch { return `${nf({ maximumFractionDigits: 2 }).format(n)} ${cur}`; }
  };
  const compactMoney = (n) => { try { return nf({ style: "currency", currency: BASE, notation: "compact", maximumFractionDigits: 1 }).format(n); } catch { return String(Math.round(n)); } };
  const intFmt = (n) => nf({ maximumFractionDigits: 0 }).format(n);
  const dFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" });
  const fmtDate = (iso) => (iso ? dFmt.format(new Date(iso)) : "–");
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const ago = (iso) => {
    if (!iso) return "never";
    const s = Math.round((new Date(iso) - Date.now()) / 1000);
    const a = Math.abs(s);
    if (a < 45) return "just now";
    if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
    if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
    return fmtDate(iso);
  };
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  }
  const svgEl = (tag, attrs) => { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; };
  const safeUrl = (u) => {
    if (!u) return "";
    try { const url = new URL(u, location.href); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
  };
  const initials = (name) => String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  // Constant inline icon paths (never built from fetched data)
  const ICONS = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5h4a2 2 0 0 1 0 4h-4h4.5a2 2 0 0 1 0 4h-4.5zM11 7v2M11 16v1.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
    hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    up: '<path d="M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    discord: '<path d="M7 17c-2 0-4-1.2-4-1.2V8.5L5.6 6h12.8L21 8.5v7.3S19 17 17 17l-1-1.6"/><path d="M8.5 15.4c2.2 1 4.8 1 7 0"/><circle cx="9.5" cy="11.5" r="1"/><circle cx="14.5" cy="11.5" r="1"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    file: '<path d="M14 3H6v18h12V7zM14 3v4h4"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>',
  };
  // icon("receipt") → Lucide line icon · icon("brand:discord") → Simple Icons logo (see scripts/build-icons.mjs)
  const LIB = window.LEDGER_ICONS || { ui: {}, brand: {} };
  const icon = (name, cls = "i") => {
    const brand = String(name).startsWith("brand:") ? LIB.brand[name.slice(6)] : null;
    const s = svgEl("svg", { viewBox: "0 0 24 24", class: brand ? `${cls} brand` : cls, "aria-hidden": "true" });
    s.innerHTML = brand || LIB.ui[name] || ICONS[name] || LIB.ui.link || ICONS.link;
    return s;
  };

  /* ───────────── source catalogue ───────────── */
  const META = {
    opencollective: { label: "Open Collective", icon: "brand:opencollective", kind: "recurring", keyless: true, link: (v) => `https://opencollective.com/${v}/donate`, handle: (v) => `opencollective.com/${v}` },
    liberapay: { label: "Liberapay", icon: "brand:liberapay", kind: "recurring", keyless: true, link: (v) => `https://liberapay.com/${v}/donate`, handle: (v) => `liberapay.com/${v}` },
    githubSponsors: { label: "GitHub Sponsors", icon: "brand:githubsponsors", kind: "recurring", link: () => `https://github.com/sponsors/${C.github}`, handle: () => `github.com/sponsors/${C.github}`, secret: "SPONSORS_TOKEN (optional, for amounts)" },
    patreon: { label: "Patreon", icon: "brand:patreon", kind: "recurring", link: (v) => `https://www.patreon.com/${v}`, handle: (v) => `patreon.com/${v}`, secret: "PATREON_TOKEN" },
    buymeacoffee: { label: "Buy Me a Coffee", icon: "brand:buymeacoffee", kind: "one-time", link: (v) => `https://www.buymeacoffee.com/${v}`, handle: (v) => `buymeacoffee.com/${v}`, secret: "BMC_TOKEN" },
    kofi: { label: "Ko-fi", icon: "brand:kofi", kind: "one-time", link: (v) => `https://ko-fi.com/${v}`, handle: (v) => `ko-fi.com/${v}`, secret: "Ko-fi relay" },
    paypal: { label: "PayPal", icon: "brand:paypal", kind: "one-time", linkOnly: true, link: (v) => `https://paypal.me/${v}`, handle: (v) => `paypal.me/${v}` },
    bitcoin: { label: "Bitcoin", icon: "brand:bitcoin", kind: "crypto", keyless: true, address: true, link: (v) => `https://mempool.space/address/${v}` },
    ethereum: { label: "Ethereum", icon: "brand:ethereum", kind: "crypto", keyless: true, address: true, link: (v) => `https://eth.blockscout.com/address/${v}` },
  };
  const CONFIGURED = Object.keys(META).filter((id) => (id === "githubSponsors" ? SRC[id] && C.github : SRC[id]));
  const KEYLESS = {
    opencollective: (v) => L.openCollective(v), liberapay: (v) => L.liberapay(v),
    bitcoin: (v) => L.bitcoin(v), ethereum: (v) => L.ethereum(v),
  };

  /* ───────────── state ───────────── */
  const state = {
    ghLive: null, ghAt: 0, snap: null, snapErr: null, snapAt: 0,
    live: {}, liveErr: {}, discord: null, discordErr: null,
    usdPer: { USD: 1 }, fxOk: false,
    lastRefresh: null, refreshing: false, booted: false,
    prev: {}, seen: new Set(),
  };

  async function loadGitHub() {
    if (!C.github && !C.repo) return;
    try { state.ghLive = await L.github({ login: C.github, repo: C.repo, label: C.projectLabel || "funding", expenseLabel: C.expenseLabel || "expense" }); }
    catch (e) { state.ghLive = { errors: [e.message] }; }
    state.ghAt = Date.now();
  }
  async function loadSnapshot() {
    try { state.snap = await L.getJSON(`data/snapshot.json?t=${Date.now()}`, { cache: "no-store" }); state.snapErr = null; }
    catch (e) { state.snapErr = e.status === 404 ? "not generated yet" : location.protocol === "file:" ? "can't be read from file://" : e.message; }
    try { state.manual = await L.getJSON(`data/manual.json?t=${Date.now()}`, { cache: "no-store" }); } catch { state.manual = null; }
    state.snapAt = Date.now();
  }
  async function loadLive() {
    await Promise.all([
      ...CONFIGURED.filter((id) => KEYLESS[id]).map(async (id) => {
        try { state.live[id] = await KEYLESS[id](SRC[id]); delete state.liveErr[id]; }
        catch (e) { state.liveErr[id] = e.message; }
      }),
      DISCORD_ID ? L.discord(DISCORD_ID).then((d) => { state.discord = d; state.discordErr = null; }, (e) => { state.discordErr = e.message; }) : null,
      L.fiatRates().then((r) => { Object.assign(state.usdPer, r.usdPer); state.fxOk = true; }, () => {}),
    ]);
  }

  /* ───────────── merging & derived data ───────────── */
  function gh() {
    const live = state.ghLive || {}, snap = (state.snap && state.snap.github) || {};
    const errs = (live.errors || []).join(" ");
    const pick = (key, errKey) => (live[key] && (Array.isArray(live[key]) ? !errs.includes(errKey) : true) ? { v: live[key], mode: "live" }
      : snap[key] ? { v: snap[key], mode: "snapshot" } : { v: Array.isArray(live[key]) ? live[key] : null, mode: errs.includes(errKey) ? "error" : "live" });
    const profile = pick("profile", "profile:"), projects = pick("projects", "projects:"), drives = pick("drives", "drives:"), socials = pick("socials", "socials:"), repos = pick("repos", "repos:"), expenses = pick("expenses", "expenses:");
    return {
      profile: profile.v, projects: projects.v || [], drives: drives.v || [], socials: socials.v || [], repos: repos.v || [],
      expenses: expenses.v || [],
      status: snap.status || null,
      mode: profile.mode === "live" && projects.mode === "live" ? "live" : profile.v || projects.v ? "snapshot" : errs ? "error" : "pending",
      error: errs || null,
    };
  }

  function sources() {
    return CONFIGURED.map((id) => {
      const meta = META[id];
      if (meta.linkOnly) return { id, meta, mode: "link" };
      const live = state.live[id], snap = state.snap && state.snap.sources && state.snap.sources[id];
      if (live) return { id, meta, mode: "live", data: live };
      if (snap) return { id, meta, mode: "snapshot", data: snap, error: state.liveErr[id] || null };
      const err = state.liveErr[id] || (state.snap && state.snap.errors && state.snap.errors[id])
        || (!meta.keyless && state.snapErr ? `Sync snapshot ${state.snapErr}` : null)
        || (!meta.keyless && state.snap ? "Not in the latest sync yet" : null);
      return { id, meta, mode: err ? "error" : "pending", error: err };
    });
  }

  function derive() {
    const srcs = sources();
    const g = gh();
    const list = srcs.map((s) => ({ id: s.id, label: s.meta.label, data: s.data }));
    if (state.manual) list.push({ id: "manual", label: "Direct", data: L.manual(state.manual) });
    const S = L.summarize({ base: BASE, github: g, usdPer: state.usdPer, sources: list });
    return { ...S, srcs, gh: g };
  }

  /* ───────────── number animation (from previous value) ───────────── */
  function animateNumber(node, key, to, format) {
    const from = state.prev[key] ?? 0;
    state.prev[key] = to;
    if (REDUCED || from === to) { node.textContent = format(to); return; }
    const t0 = performance.now(), dur = from === 0 ? 1200 : 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      node.textContent = format(k === 1 ? to : from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const entering = (key) => { if (state.seen.has(key)) return ""; state.seen.add(key); return " enter"; };

  /* ───────────── header live pill ───────────── */
  function renderLivePill() {
    const t = $("#liveText"), pill = $("#livePill");
    pill.classList.toggle("busy", state.refreshing);
    if (state.refreshing && !state.booted) { t.textContent = "Connecting…"; return; }
    if (state.refreshing) { t.textContent = "Refreshing…"; return; }
    const errs = Object.keys(state.liveErr).length;
    pill.classList.toggle("warn", errs > 0);
    t.textContent = "Live";
    pill.title = `Updated ${state.lastRefresh ? ago(state.lastRefresh.toISOString()) : "–"} · click to refresh`;
  }

  /* ───────────── owner setup checklist ───────────── */
  function renderSetup(D) {
    const box = $("#setup");
    if (!OWNER) return;
    const items = [
      [!!D.gh.profile, "GitHub profile loads", D.gh.profile ? `@${D.gh.profile.login}` : D.gh.error || "Set github in ledger.config.js"],
      [D.gh.projects.length > 0, "Projects", D.gh.projects.length ? `${D.gh.projects.length} issue(s) labelled "${C.projectLabel || "funding"}"` : `Open an issue in ${C.repo} with the "${C.projectLabel || "funding"}" label and a "goal: $…" line`],
      [D.gh.drives.length > 0, "Drives", D.gh.drives.length ? `${D.gh.drives.length} milestone(s)` : `Optional: create a milestone with a due date and a "goal: $…" line`],
      [CONFIGURED.length > 0, "Donation sources", CONFIGURED.length ? CONFIGURED.map((id) => META[id].label).join(", ") : "Fill in sources in ledger.config.js"],
      ...D.srcs.filter((s) => s.mode === "error").map((s) => [false, s.meta.label, s.error + (s.meta.secret ? ` · needs ${s.meta.secret}` : "")]),
      [!!state.snap, "Sync snapshot", state.snap ? `Last changed ${ago(state.snap.generatedAt)}` : `data/snapshot.json ${state.snapErr || "missing"}: the "Sync ledger" Action creates it`],
      [D.expenses.length > 0, "Expenses & receipts", D.expenses.length ? `${D.expenses.length} expense(s)` : `Open an issue labelled "${C.expenseLabel || "expense"}" with an "amount: $…" line and attach the receipt`],
      [!!(state.snap && state.snap.youtube), "Videos", C.youtube ? (state.snap && state.snap.youtube ? `${state.snap.youtube.videos.length} videos from ${state.snap.youtube.title}` : (state.snap && state.snap.errors && state.snap.errors.youtube) || "Waiting for the next sync") : "Optional: set youtube (channel ID or @handle)"],
      [!!TZ, "Local-time widget", TZ || "Optional: set timezone"],
      [!!DISCORD_ID, "Discord widget", DISCORD_ID ? (state.discordErr ? `Error: ${state.discordErr}` : "Connected") : "Optional: set discordServerId"],
    ];
    const todo = items.filter((i) => !i[0]).length;
    box.hidden = false;
    box.replaceChildren(el("article", { class: "card setup-card" },
      el("div", { class: "card-head" },
        el("div", {}, el("div", { class: "tile-label" }, "Setup · only visible to you"),
          el("div", { class: "tile-strong" }, todo ? `${todo} thing${todo === 1 ? "" : "s"} left to connect` : "Everything is connected")),
        el("button", { class: "icon-btn", "aria-label": "Hide setup", onclick: () => { box.hidden = true; } }, icon("x"))),
      el("ul", { class: "setup-list" }, items.map(([ok, label, detail]) =>
        el("li", { class: ok ? "ok" : "" }, el("span", { class: "check" }, icon(ok ? "check" : "dot")), el("b", {}, label), el("span", { class: "muted" }, detail)))),
      el("p", { class: "fine" }, "Shown on localhost, file:// or with ?setup in the URL. Visitors never see this."),
    ));
  }

  /* ───────────── bento ───────────── */
  function tile(cls, ...kids) {
    const opts = kids[0] && kids[0].__go ? kids.shift() : null;
    return el("article", { class: `card tile ${cls}${opts ? " clickable" : ""}${entering("tile-" + cls.split(" ")[0])}`, "data-go": opts ? opts.go : null, tabindex: opts ? "0" : null, role: opts ? "button" : null, "aria-label": opts ? opts.label : null }, ...kids);
  }
  const go = (target, label) => ({ __go: true, go: target, label });
  const skel = (w = "60%", h = 14) => el("span", { class: "skel", style: `width:${w};height:${h}px` });

  function renderBento(D) {
    const bento = $("#bento");
    const tiles = [];
    const p = D.gh.profile;

    // Profile
    const avatar = el("div", { class: "avatar", "aria-hidden": "true" });
    if (p && safeUrl(p.avatar)) avatar.append(el("img", { src: safeUrl(p.avatar), alt: "", loading: "lazy" })); else if (p) avatar.textContent = initials(p.name);
    const status = D.gh.status && (D.gh.status.message || D.gh.status.emoji)
      ? el("span", { class: "status-pill" }, el("span", { class: "pulse" }), D.gh.status.message || "")
      : CONFIGURED.length ? el("span", { class: "status-pill" }, el("span", { class: "pulse" }), "Open to support") : null;
    tiles.push(tile("tile-profile span-2 row-2",
      el("div", { class: "profile-top" }, avatar, status),
      p ? el("h1", { class: "profile-name" }, p.name) : el("h1", { class: "profile-name" }, skel("70%", 44)),
      p ? el("p", { class: "profile-handle mono" }, `@${p.login}`, p.location ? ` · ${p.location}` : "", p.company ? ` · ${p.company}` : "") : skel("40%"),
      p ? (p.bio ? el("p", { class: "profile-tagline" }, p.bio) : null) : el("div", {}, skel("90%"), el("br"), skel("70%")),
      el("div", { class: "profile-cta" },
        el("a", { href: "#donate", class: "btn btn-primary" }, "Support my work", icon("arrow")),
        el("a", { href: "#contact", class: "btn btn-ghost" }, "Get in touch")),
    ));

    // Raised
    if (!D.parts.length) tiles.push(tile("tile-raised", go("#supporters", "Total raised"), el("div", { class: "tile-label" }, "Total raised"), el("div", { class: "big-number mono dim" }, "—"), el("div", { class: "tile-sub" }, "No sources connected yet")));
    else {
      const big = el("div", { class: "big-number mono" });
      const spark = svgEl("svg", { class: "sparkline", viewBox: "0 0 200 48", preserveAspectRatio: "none", "aria-hidden": "true" });
      const months = monthSeries(D.payments, 12);
      if (months.some((m) => m.total > 0)) {
        let run = 0; const pts = months.map((m) => (run += m.total));
        const max = Math.max(...pts, 1);
        const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 200, 44 - (v / max) * 40]);
        const d = xy.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("");
        spark.append(svgEl("path", { class: "area", d: `${d}L200,48L0,48Z` }), svgEl("path", { class: "line", d }));
      }
      tiles.push(tile("tile-raised", go("#supporters", "Total raised: see the ledger"), el("div", { class: "tile-label" }, "Total raised"), big,
        el("div", { class: "tile-sub" }, `from ${D.parts.map((x) => x.label).join(", ")}`), spark));
      animateNumber(big, "raised", D.raised, (v) => money(Math.round(v)));
    }

    // Recurring
    if (!D.recurringParts.length) tiles.push(tile("tile-recurring", go("#donate", "Recurring support"), el("div", { class: "tile-label" }, "Recurring"), el("div", { class: "big-number mono dim" }, "—"), el("div", { class: "tile-sub" }, "No recurring support yet")));
    else {
      const big = el("div", { class: "big-number mono" });
      tiles.push(tile("tile-recurring", go("#donate", "Recurring support: see platforms"), el("div", { class: "tile-label" }, "Recurring"), el("div", { class: "row baseline" }, big, el("span", { class: "per" }, "/mo")),
        el("div", { class: "tile-sub" }, D.recurringParts.map((x) => `${x.label} ${money(Math.round(x.value))}`).join(" · "))));
      animateNumber(big, "recurring", D.recurring, (v) => money(Math.round(v)));
    }

    // Supporters
    if (!(D.supporters > 0 || D.leaders.length)) tiles.push(tile("tile-supporters", go("#supporters", "Supporters"), el("div", { class: "tile-label" }, "Supporters"), el("div", { class: "big-number mono dim" }, "—"), el("div", { class: "tile-sub" }, "No supporters yet")));
    else {
      const big = el("div", { class: "big-number mono" });
      const stack = el("div", { class: "avatar-stack" }, D.leaders.slice(0, 5).map((s, i) => el("span", { title: s.name, style: `--n:${i}` }, initials(s.name))));
      if (D.leaders.length > 5) stack.append(el("span", { style: "--n:5" }, `+${D.leaders.length - 5}`));
      tiles.push(tile("tile-supporters", go("#supporters", "Supporters: see the leaderboard"), el("div", { class: "tile-label" }, "Supporters"), big, stack,
        el("div", { class: "tile-sub" }, D.supporterParts.length > 1 ? "across platforms" : D.supporterParts[0] ? `on ${D.supporterParts[0].label}` : "named supporters")));
      animateNumber(big, "supporters", D.supporters || D.leaders.length, (v) => intFmt(v));
    }

    // Current drive / goal
    const drive = D.drives.find((d) => d.phase === "live" && d.goal) || D.drives.find((d) => d.phase === "upcoming" && d.goal);
    const goal = !drive && D.goals[0];
    if (!drive && !goal) {
      const svg = svgEl("svg", { class: "ring", viewBox: "0 0 120 120", "aria-hidden": "true" });
      svg.append(svgEl("circle", { class: "ring-track", cx: 60, cy: 60, r: 52 }));
      tiles.push(tile("tile-drive span-2", go("#drives", "Funding drives"),
        el("div", { class: "tile-label" }, "Current drive"),
        el("div", { class: "ring-wrap" }, svg, el("div", { class: "ring-center" }, el("span", { class: "mono dim" }, "—"))),
        el("div", { class: "tile-drive-meta" }, el("div", { class: "tile-drive-title" }, "No active drive"), el("div", { class: "tile-sub" }, "Nothing running right now"))));
    } else {
      const pct = drive ? Math.min(1, drive.raised / drive.goal) : Math.min(1, goal.current / goal.target);
      const C2 = 2 * Math.PI * 52;
      const ring = svgEl("circle", { class: "ring-fill", cx: 60, cy: 60, r: 52 });
      const svg = svgEl("svg", { class: "ring", viewBox: "0 0 120 120", "aria-hidden": "true" });
      svg.append(svgEl("circle", { class: "ring-track", cx: 60, cy: 60, r: 52 }), ring);
      const pctEl = el("span", { class: "mono" });
      const sub = el("div", { class: "tile-sub mono", "data-countdown": drive && drive.end ? drive.end : "" });
      const t = tile("tile-drive span-2", go("#drives", "Current drive"),
        el("div", { class: "tile-label" }, drive ? "Current drive" : `${goal.source} goal`),
        el("div", { class: "ring-wrap" }, svg, el("div", { class: "ring-center" }, pctEl)),
        el("div", { class: "tile-drive-meta" },
          el("div", { class: "tile-drive-title" }, drive ? drive.title : goal.title),
          el("div", { class: "drive-mini-bar mono" }, drive ? `${money(drive.raised)} of ${money(drive.goal)}` : goalLine(goal)),
          sub));
      tiles.push(t);
      requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = String(C2 * (1 - pct)); }));
      ring.style.strokeDashoffset = String(C2 * (1 - (state.prev.ringPct ?? 0)));
      state.prev.ringPct = pct;
      animateNumber(pctEl, "drivePct", Math.round(pct * 100), (v) => `${Math.round(v)}%`);
    }

    // Clock
    if (TZ) tiles.push(tile("tile-clock", go("clock", "Switch 12/24-hour time"), el("div", { class: "tile-label" }, "My local time"),
      el("div", { class: "clock mono", id: "clock" }, "--:--"), el("div", { class: "tile-sub", id: "clockSub" })));
    else tiles.push(tile("tile-clock", el("div", { class: "tile-label" }, "My local time"), el("div", { class: "clock mono dim" }, "—"), el("div", { class: "tile-sub" }, "Timezone not set yet")));

    // Balance (raised minus spent)
    if (D.parts.length || D.expenses.length) {
      const big = el("div", { class: "big-number mono" });
      tiles.push(tile("tile-balance", go("#spending", "Balance: see spending"), el("div", { class: "tile-label" }, "Balance"), big,
        el("div", { class: "tile-sub" }, `${money(Math.round(D.raised))} in · ${money(Math.round(D.spent))} out`)));
      animateNumber(big, "balance", D.raised - D.spent, (v) => money(Math.round(v)));
    } else tiles.push(tile("tile-balance", el("div", { class: "tile-label" }, "Balance"), el("div", { class: "big-number mono dim" }, "—"), el("div", { class: "tile-sub" }, "Nothing in or out yet")));

    // Discord
    if (!DISCORD_ID) tiles.push(tile("tile-discord", el("div", { class: "tile-label" }, "Community"),
      el("div", { class: "discord-row" }, el("span", { class: "glyph" }, icon("brand:discord")),
        el("div", {}, el("div", { class: "tile-strong" }, "Discord"), el("div", { class: "tile-sub" }, "Not connected yet")))));
    if (DISCORD_ID) {
      const d = state.discord, invite = safeUrl(C.discordInvite) || safeUrl(d && d.invite) || safeUrl(state.snap && state.snap.discord && state.snap.discord.invite);
      tiles.push(tile("tile-discord", go(invite ? "discord" : "#contact", "Discord community"),
        el("div", { class: "tile-label" }, "Community"),
        el("div", { class: "discord-row" }, el("span", { class: "glyph" }, icon("brand:discord")),
          el("div", {}, el("div", { class: "tile-strong" }, d ? d.name : state.discordErr ? "Discord" : skel("70%")),
            el("div", { class: "tile-sub" }, d ? [el("span", { class: "online-dot" }), `${intFmt(d.online)} online now`] : state.discordErr ? "Widget unavailable" : skel("50%")))),
        invite ? el("a", { class: "btn btn-ghost btn-sm", href: invite, target: "_blank", rel: "noopener" }, "Join", icon("arrow")) : null));
    }

    // Sources status
    const rows = [
      (C.github || C.repo) && { label: "GitHub", mode: D.gh.mode, detail: D.gh.mode === "live" ? "profile · projects · drives" : D.gh.mode === "snapshot" ? `updated ${ago(state.snap && state.snap.github && state.snap.github.updatedAt)}` : D.gh.error },
      ...D.srcs.map((s) => ({
        label: s.meta.label, mode: s.mode,
        detail: s.mode === "live" ? "live" : s.mode === "snapshot" ? `updated ${ago(s.data.updatedAt)}` : s.mode === "link" ? "link only" : s.mode === "error" ? s.error : "loading…",
      })),
    ].filter(Boolean);
    tiles.push(tile("tile-sources span-all",
      el("div", { class: "card-head" }, el("div", { class: "tile-label" }, "Data sources"),
        el("button", { class: "btn btn-ghost btn-sm", onclick: () => refresh(true) }, icon("refresh"), "Refresh")),
      el("ul", { class: "src-list" }, rows.map((r) => el("li", {},
        el("span", { class: `src-dot ${r.mode}` }), el("span", { class: "src-name" }, r.label),
        el("span", { class: "src-detail", title: r.detail || "" }, modeLabel(r.mode), r.detail && r.mode !== "live" && r.mode !== "link" ? ` · ${r.detail}` : "")))),
    ));

    // The profile takes a 2×2 block; stretch the small tiles beside it so a sparse grid has no holes.
    const small = tiles.filter((t) => !t.classList.contains("tile-profile") && !t.classList.contains("span-all"));
    const cells = small.reduce((n, t) => n + (t.classList.contains("span-2") ? 2 : 1), 0);
    if (cells === 1) small[0].classList.add("span-2", "row-2");
    else if (cells === 2) small.forEach((t) => t.classList.add("span-2"));
    else if (cells === 3) small.find((t) => !t.classList.contains("span-2")).classList.add("span-2");
    bento.replaceChildren(...tiles);
    tickClock(); tickCountdowns();
  }
  const modeLabel = (m) => ({ live: "Live", snapshot: "Synced", link: "Link", error: "Error", pending: "Loading" }[m] || m);
  const goalLine = (g) => g.unit === "count"
    ? `${intFmt(g.current)} of ${intFmt(g.target)} sponsors`
    : `${money(g.current, g.sourceCurrency || BASE)} of ${money(g.target, g.sourceCurrency || BASE)}${g.period ? ` / ${g.period}` : ""}`;

  /* ───────────── clock & countdowns (ticked every second) ───────────── */
  let clockFmt, clock12 = false;
  function tickClock() {
    const clock = $("#clock"); if (!clock) return;
    try { clockFmt = clockFmt || new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: clock12 ? "h12" : "h23" }); }
    catch { clock.textContent = "Invalid timezone"; return; }
    const now = new Date();
    const parts = Object.fromEntries(clockFmt.formatToParts(now).map((x) => [x.type, x.value]));
    clock.replaceChildren(`${parts.hour}:${parts.minute}`, el("span", { class: "sec" }, `:${parts.second}${clock12 && parts.dayPeriod ? " " + parts.dayPeriod : ""}`));
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now)) % 24;
    const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
    let rel = "";
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
      const theirs = (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes())) / 6e4;
      const diff = Math.round(((theirs + now.getTimezoneOffset()) / 60) * 10) / 10;
      rel = diff === 0 ? "same time as you" : `${Math.abs(diff)}h ${diff > 0 ? "ahead of" : "behind"} you`;
    } catch {}
    $("#clockSub").textContent = [part, rel].filter(Boolean).join(" · ");
  }
  const span = (ms) => { ms = Math.max(0, ms); return [Math.floor(ms / 864e5), Math.floor((ms % 864e5) / 36e5), Math.floor((ms % 36e5) / 6e4), Math.floor((ms % 6e4) / 1e3)]; };
  function tickCountdowns() {
    $$("[data-countdown]").forEach((n) => {
      const end = n.dataset.countdown; if (!end) return;
      const [d, h, m, s] = span(new Date(end) - Date.now());
      n.textContent = new Date(end) < Date.now() ? `Ended ${fmtDate(end)}` : `Ends in ${d}d ${h}h ${m}m`;
    });
    $$("[data-cd-end]").forEach((box) => {
      const end = new Date(box.dataset.cdEnd), start = new Date(box.dataset.cdStart);
      const target = Date.now() < start ? start : end;
      const v = span(target - Date.now());
      $$(".cd-num", box).forEach((n, i) => { const t = String(v[i]).padStart(2, "0"); if (n.textContent !== t) n.textContent = t; });
    });
  }

  /* ───────────── projects ───────────── */
  const STATUS = { active: "Active", planned: "Planned", paused: "Paused", funded: "Funded", cancelled: "Closed" };
  let projectFilter = "all";
  const plain = (md) => String(md || "")
    .replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "").replace(/[*_`>]/g, "").replace(/^\s*[-+]\s+/gm, "• ").trim();
  const excerpt = (md, n = 180) => { const t = plain(md).split(/\n\s*\n/)[0].replace(/\s+/g, " "); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

  function renderProjects(D) {
    const grid = $("#projectGrid");
    const list = D.projects.slice().sort((a, b) => ["active", "planned", "paused", "funded", "cancelled"].indexOf(a.status) - ["active", "planned", "paused", "funded", "cancelled"].indexOf(b.status) || b.updatedAt.localeCompare(a.updatedAt));
    const present = [...new Set(list.map((p) => p.status))];
    const seg = $("#projectFilter");
    seg.hidden = present.length < 2;
    seg.replaceChildren(...["all", ...present].map((f) => el("button", { role: "tab", class: f === projectFilter ? "on" : "", "data-filter": f }, f === "all" ? "All" : STATUS[f] || f)));

    if (!showSection("#projects", list.length > 0, blank("#projectGrid", "folder", "No projects yet"))) return;
    grid.replaceChildren(...list.map((p) => {
      const pct = p.goal ? Math.min(100, (p.raised / p.goal) * 100) : null;
      const fill = el("i", { style: `width:${state.prev["pj" + p.number] ?? 0}%` });
      const card = el("article", {
        class: `card project clickable${entering("pj" + p.number)}${projectFilter !== "all" && p.status !== projectFilter ? " hide" : ""}`,
        tabindex: "0", role: "button", "data-status": p.status, "aria-label": p.title,
        onclick: () => openProject(p.number),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProject(p.number); } },
      },
        el("div", { class: "project-top" },
          el("span", { class: "badge", "data-s": p.status }, STATUS[p.status] || p.status),
          el("span", { class: "arrow-hint mono" }, `#${p.number}`, icon("arrow"))),
        el("h3", {}, p.title),
        p.body ? el("p", {}, excerpt(p.body)) : null,
        p.labels.length ? el("div", { class: "tags" }, p.labels.map((t) => el("span", { class: "tag" }, t))) : null,
        el("div", { class: "project-meta tile-sub" },
          el("span", { title: "👍 reactions on the issue" }, icon("up"), intFmt(p.upvotes)),
          el("span", { title: "comments" }, icon("chat"), intFmt(p.comments)),
          el("span", {}, `updated ${ago(p.updatedAt)}`)),
        el("div", { class: "progress" },
          el("div", { class: "progress-nums" },
            el("span", {}, el("strong", { class: "mono" }, money(p.raised)), p.goal ? el("span", { class: "muted" }, ` / ${money(p.goal)}`) : el("span", { class: "muted" }, " raised")),
            el("span", { class: "mono muted" }, pct != null ? `${Math.round(pct)}%` : `tag #${p.tag}`)),
          pct != null ? el("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) }, fill) : null),
      );
      if (pct != null) { requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; })); state.prev["pj" + p.number] = pct; }
      return card;
    }));
  }

  function openProject(number) {
    const D = current; const p = D.projects.find((x) => x.number === number); if (!p) return;
    const pct = p.goal ? Math.min(100, (p.raised / p.goal) * 100) : null;
    const fill = el("i");
    const named = new Set(p.payments.filter((x) => x.name).map((x) => x.name.toLowerCase())).size;
    $("#pmBody").replaceChildren(el("div", {},
      el("span", { class: "badge", "data-s": p.status }, STATUS[p.status] || p.status),
      el("h3", { class: "pm-title", id: "pmTitle" }, p.title),
      el("div", { class: "pm-details" }, plain(p.body).split(/\n\s*\n/).filter(Boolean).slice(0, 6).map((para) => el("p", {}, para))),
      pct != null ? el("div", { class: "bar thick" }, fill) : null,
      el("div", { class: "pm-stats" },
        el("div", { class: "pm-stat" }, el("b", {}, money(p.raised)), el("span", {}, "raised")),
        el("div", { class: "pm-stat" }, el("b", {}, p.goal ? money(Math.max(0, p.goal - p.raised)) : "–"), el("span", {}, p.goal ? "still needed" : "no goal set")),
        el("div", { class: "pm-stat" }, el("b", {}, intFmt(p.upvotes)), el("span", {}, "👍 on GitHub"))),
      el("p", { class: "fine" }, `To put money toward this, include #${p.tag} in your donation message.`),
      p.payments.length ? el("div", { class: "tile-label", style: "margin-top:16px" }, `Contributions · ${named} named`) : null,
      p.payments.length ? el("ul", { class: "pm-list" }, p.payments.slice(0, 8).map((x) =>
        el("li", {}, el("span", {}, x.name || "Anonymous", el("span", { class: "muted" }, ` · ${x.sourceLabel} · ${fmtDate(x.date)}`)), el("span", {}, x.value != null ? money(x.value) : money(x.amount, x.currency))))) : null,
      el("p", { class: "tile-sub", style: "margin:12px 0 16px" }, `Opened ${fmtDate(p.createdAt)} · updated ${ago(p.updatedAt)}`),
      el("div", { class: "pm-actions" },
        p.status !== "funded" && CONFIGURED.length ? el("a", { class: "btn btn-primary", href: "#donate", onclick: () => $("#projectModal").close() }, "Support this", icon("arrow")) : null,
        el("a", { class: "btn btn-ghost", href: safeUrl(p.url), target: "_blank", rel: "noopener" }, "Discuss on GitHub", icon("arrow")),
        p.payments.length ? el("button", { class: "btn btn-ghost", onclick: () => { $("#projectModal").close(); focusLedger("donation", `#${p.tag}`); } }, "See donations") : null),
    ));
    $("#projectModal").showModal();
    if (pct != null && pct >= 100) setTimeout(() => { const r = $("#projectModal .modal-inner").getBoundingClientRect(); celebrate(r.left + r.width / 2, r.top + 90, 34); }, 250);
    if (pct != null) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  }

  /* ───────────── drives & goals ───────────── */
  function renderDrives(D) {
    const list = $("#driveList");
    const order = { live: 0, upcoming: 1, ended: 2 };
    const drives = D.drives.slice().sort((a, b) => order[a.phase] - order[b.phase]);
    if (!showSection("#drives", drives.some((d) => d.phase !== "ended") || D.goals.length > 0, blank("#driveList", "target", "No funding drives yet"))) return;
    const cards = drives.map((d) => {
      const pct = d.goal ? Math.min(100, (d.raised / d.goal) * 100) : null;
      const fill = el("i", { style: `width:${state.prev["dr" + d.number] ?? 0}%` });
      const cd = d.end && d.phase !== "ended"
        ? el("div", { class: "countdown", "data-cd-end": d.end, "data-cd-start": d.start }, ["days", "hours", "min", "sec"].map((l) => el("div", { class: "cd-box" }, el("span", { class: "cd-num mono" }, "00"), el("span", { class: "cd-lab" }, l))))
        : null;
      if (pct != null) { requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; })); state.prev["dr" + d.number] = pct; }
      return el("article", { class: `card drive${entering("dr" + d.number)}` },
        el("div", {},
          el("span", { class: "badge", "data-s": d.phase === "live" ? "active" : d.phase === "ended" ? "funded" : "planned" }, d.phase === "live" ? "Live" : d.phase === "upcoming" ? "Upcoming" : "Ended"),
          el("h3", {}, d.title),
          d.description ? el("p", {}, excerpt(d.description, 220)) : null,
          d.linked.length ? el("p", { class: "tile-sub", style: "margin-top:6px" }, `Funds → ${d.linked.map((p) => p.title).join(", ")}`) : null,
          el("div", { class: "drive-progress" },
            el("div", { class: "progress-nums" },
              el("span", {}, el("strong", { class: "mono" }, money(d.raised)), d.goal ? el("span", { class: "muted" }, ` of ${money(d.goal)}`) : el("span", { class: "muted" }, " raised")),
              el("span", { class: "mono muted" }, pct != null ? `${Math.round(pct)}%` : "")),
            pct != null ? el("div", { class: "bar thick" }, fill) : null,
            el("div", { class: "drive-dates mono" }, el("span", {}, fmtDate(d.start)), el("span", {}, d.end ? fmtDate(d.end) : "no deadline")))),
        el("div", { class: "drive-side" },
          cd,
          el("div", { class: "drive-state" }, d.phase === "live" ? (d.end ? `until ${fmtDate(d.end)}` : "open-ended") : d.phase === "upcoming" ? `opens ${fmtDate(d.start)}` : `closed ${fmtDate(d.closedAt || d.end)}${d.goal && d.raised >= d.goal ? " · goal reached" : ""}`),
          d.phase !== "ended" && CONFIGURED.length ? el("a", { class: "btn btn-primary", href: "#donate" }, "Contribute", icon("arrow")) : null,
          el("a", { class: "btn btn-ghost btn-sm", href: safeUrl(d.url), target: "_blank", rel: "noopener" }, "Milestone on GitHub", icon("arrow"))));
    });
    const goalCards = D.goals.map((g, i) => {
      const pct = g.target ? Math.min(100, (g.current / g.target) * 100) : 0;
      const fill = el("i", { style: `width:${state.prev["gl" + i] ?? 0}%` });
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; })); state.prev["gl" + i] = pct;
      return el("article", { class: `card drive goal${entering("gl" + g.source)}` },
        el("div", {},
          el("span", { class: "badge", "data-s": "planned" }, `${g.source} goal`),
          el("h3", {}, g.title),
          el("div", { class: "drive-progress" },
            el("div", { class: "progress-nums" }, el("span", { class: "mono" }, goalLine(g)), el("span", { class: "mono muted" }, `${Math.round(pct)}%`)),
            el("div", { class: "bar thick" }, fill))),
        el("div", { class: "drive-side" },
          el("div", { class: "goal-pct mono" }, `${Math.round(pct)}%`),
          g.url ? el("a", { class: "btn btn-primary", href: safeUrl(g.url), target: "_blank", rel: "noopener" }, `Back it on ${g.source}`, icon("arrow")) : null));
    });
    list.replaceChildren(...cards, ...goalCards);
    tickCountdowns();
  }

  /* ───────────── chart ───────────── */
  function monthSeries(payments, n) {
    const t = new Date();
    let start;
    if (n === "all") {
      const first = payments.reduce((m, p) => (p.date && p.date < m ? p.date : m), t.toISOString());
      const fd = new Date(first); start = new Date(fd.getFullYear(), fd.getMonth(), 1);
    } else start = new Date(t.getFullYear(), t.getMonth() - (n - 1), 1);
    const out = [];
    for (let d = new Date(start); d <= t; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ key: monthKey(d), date: new Date(d), total: 0, count: 0 });
    const idx = Object.fromEntries(out.map((m, i) => [m.key, i]));
    for (const p of payments) {
      if (p.value == null || !p.date) continue;
      const i = idx[monthKey(new Date(p.date))];
      if (i != null) { out[i].total += p.value; out[i].count += 1; }
    }
    return out;
  }
  const niceMax = (v) => { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

  let chartRange = 12;
  function renderChart(D) {
    showSection("#supporters", true);
    const host = $("#chart");
    const data = monthSeries(D.payments, chartRange);
    const W = host.clientWidth || 600, H = host.clientHeight || 220;
    const padL = 48, padR = 4, padT = 16, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = niceMax(Math.max(...data.map((d) => d.total), 0));
    const y = (v) => padT + ih - (v / max) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Payments per month" });
    const grid = svgEl("g", { class: "grid" }), axis = svgEl("g", { class: "axis" });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = Math.round(y(v)) + 0.5;
      grid.append(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy }));
      const t = svgEl("text", { x: padL - 8, y: yy + 3.5, "text-anchor": "end" }); t.textContent = compactMoney(v); axis.append(t);
    }
    svg.append(grid, axis);
    const slot = iw / data.length;
    const bw = Math.max(3, Math.min(36, slot - Math.max(2, slot * 0.35)));
    const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));
    const mFmt = new Intl.DateTimeFormat(LOCALE, { month: "short" });
    const mFull = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
    const bars = svgEl("g", { class: "bars" });
    const maxIdx = data.reduce((bi, d, i) => (d.total > data[bi].total ? i : bi), 0);
    const first = !state.seen.has("chart"); state.seen.add("chart");
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2, x = cx - bw / 2;
      const h = d.total ? Math.max(3, padT + ih - y(d.total)) : 2;
      const top = padT + ih - h, r = Math.min(4, bw / 2, h);
      const hit = svgEl("rect", { class: "hit", x: padL + slot * i, y: padT, width: slot, height: ih, tabindex: "0", "aria-label": `${mFull.format(d.date)}: ${money(d.total)}` });
      const path = svgEl("path", { class: `bar-mark${d.total ? "" : " zero"}`, d: `M${x},${padT + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${padT + ih}Z` });
      if (first && !REDUCED) { path.style.transformOrigin = `${cx}px ${padT + ih}px`; path.style.transform = "scaleY(0)"; path.style.transition = `transform .8s cubic-bezier(.2,.8,.2,1) ${i * 30}ms, opacity .2s`; }
      const show = () => { const b = hit.getBoundingClientRect(); showTip(b.left + b.width / 2, host.getBoundingClientRect().top + (top / H) * host.clientHeight, money(d.total), `${mFull.format(d.date)} · ${d.count} payment${d.count === 1 ? "" : "s"}`); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", hideTip); hit.addEventListener("blur", hideTip);
      bars.append(hit, path);
      if ((data.length - 1 - i) % every === 0) { const t = svgEl("text", { x: cx, y: H - 6, "text-anchor": "middle" }); t.textContent = mFmt.format(d.date); axis.append(t); }
    });
    svg.append(bars);
    if (data[maxIdx].total > 0) {
      const d = data[maxIdx]; const t = svgEl("text", { class: "bar-label", x: padL + slot * maxIdx + slot / 2, y: y(d.total) - 6 }); t.textContent = compactMoney(d.total); svg.append(t);
    }
    host.replaceChildren(svg);
    if (first && !REDUCED) requestAnimationFrame(() => requestAnimationFrame(() => $$(".bar-mark", svg).forEach((p) => (p.style.transform = "scaleY(1)"))));
    $("#chartTotal").textContent = money(data.reduce((s, d) => s + d.total, 0));

    const notes = [];
    const noItems = D.srcs.filter((s) => s.data && !(s.data.payments || []).length && (s.data.recurring || s.data.received != null)).map((s) => s.meta.label);
    if (noItems.length) notes.push(`${noItems.join(" and ")} ${noItems.length > 1 ? "don't" : "doesn't"} publish individual payments, so ${noItems.length > 1 ? "they're" : "it's"} in the totals but not this chart.`);
    if (D.payments.some((p) => p.currency !== BASE)) notes.push(`Other currencies converted to ${BASE}${D.payments.some((p) => p.currency === "BTC" || p.currency === "ETH") ? "; crypto at today's price" : ""}.`);
    const partial = D.srcs.filter((s) => s.data && s.data.partial).map((s) => s.meta.label);
    if (partial.length) notes.push(`${partial.join(", ")}: most recent payments only.`);
    if (!D.payments.length) notes.unshift(CONFIGURED.length ? "No itemised payments yet." : "No donation sources connected yet.");
    $("#chartNote").textContent = notes.join(" ");
  }

  const tip = $("#tooltip");
  function showTip(x, y, strong, sub) { tip.replaceChildren(el("b", {}, strong), el("span", {}, sub)); tip.style.left = `${Math.min(window.innerWidth - 90, Math.max(90, x))}px`; tip.style.top = `${y}px`; tip.classList.add("show"); }
  function hideTip() { tip.classList.remove("show"); }

  /* ───────────── leaderboard ───────────── */
  function renderBoard(D) {
    const ol = $("#board");
    const top = D.leaders.slice(0, 5);
    $('[data-search="donor"]').hidden = D.leaders.length <= 5;
    if (!top.length) { ol.replaceChildren(el("li", { class: "board-empty tile-sub" }, "No supporters yet")); return; }
    const max = top[0].total || 1;
    ol.replaceChildren(...top.map((s) => {
      const fill = el("i");
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${(s.total / max) * 100}%`; }));
      return el("li", {},
        el("span", { class: "who" }, el("b", {}, s.name), el("span", {}, [...s.sources].join(", "), s.monthly ? ` · ${money(Math.round(s.monthly))}/mo` : "")),
        el("span", { class: "amt" }, money(Math.round(s.total))),
        el("span", { class: "mini" }, fill));
    }));
  }

  /* ───────────── shared helpers for row lists & search ───────────── */
  function highlight(text, q) {
    const s = String(text || "");
    if (!q) return document.createTextNode(s);
    const f = document.createDocumentFragment(); const lower = s.toLowerCase(); let i = 0, j;
    while ((j = lower.indexOf(q, i)) !== -1) { f.append(s.slice(i, j), el("mark", {}, s.slice(j, j + q.length))); i = j + q.length; }
    f.append(s.slice(i)); return f;
  }
  // One quiet row: date · title (+ sub) · meta · value
  const row = ({ date, title, sub, meta, value, extra, onclick, cls = "" }) => el("li", { class: `row${onclick ? " clickable" : ""} ${cls}`, onclick, tabindex: onclick ? "0" : null,
    onkeydown: onclick ? (e) => { if (e.key === "Enter") onclick(e); } : null },
    el("span", { class: "r-date mono" }, date || ""),
    el("span", { class: "r-main" }, el("b", {}, title), sub ? el("span", { class: "r-sub" }, sub) : null),
    el("span", { class: "r-meta" }, meta || "", extra || null),
    el("span", { class: "r-val mono" }, value || ""));
  const shortDate = (iso) => (iso ? new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric" }).format(new Date(iso)) : "");

  function renderRecent(D) {
    const list = $("#recentList");
    $('#supporters [data-search="donation"]').hidden = D.payments.length <= 8;
    if (!D.payments.length) { blank("#recentList", "coins", "No donations yet")(); return; }
    list.replaceChildren(...D.payments.slice(0, 8).map((p) => {
      const pr = D.projects.find((x) => p.tags.includes(x.tag));
      return row({
        date: shortDate(p.date), title: p.name || "Anonymous", sub: p.message || null,
        meta: [p.sourceLabel, pr && pr.title].filter(Boolean).join(" · "),
        value: p.value != null ? `${p.currency !== BASE ? "≈ " : ""}${money(p.value)}` : money(p.amount, p.currency),
        onclick: safeUrl(p.url) ? () => window.open(safeUrl(p.url), "_blank", "noopener") : null,
      });
    }));
  }

  /* ───────────── celebration (particles fly out and fade; no bounce) ───────────── */
  function celebrate(x, y, n = 26) {
    if (REDUCED) return;
    const colors = ["var(--good)", "var(--ink)", "var(--muted)", "var(--good)", "var(--warn)"];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5, d = 60 + Math.random() * 120, sz = 4 + Math.random() * 5;
      const p = el("i", { class: "spark", style: `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;background:${colors[i % colors.length]};border-radius:${i % 3 ? "50%" : "2px"}` });
      document.body.append(p);
      const anim = p.animate([
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.15)`, opacity: 0 },
      ], { duration: 900 + Math.random() * 600, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      anim.onfinish = () => p.remove();
    }
  }

  /* ───────────── Wins: milestones reached ───────────── */
  const WIN_ICON = { first: "heart", raised: "coin", donors: "users", project: "check", drive: "flag", goal: "trophy" };
  const winTitle = (m) => ({
    first: "First donation", raised: `${money(m.threshold)} raised`, donors: `${intFmt(m.threshold)} donors`,
    project: `Funded: ${m.title}`, drive: `Drive goal reached: ${m.title}`, goal: `${m.source} goal reached`,
  }[m.kind] || m.kind);
  const winDetail = (m) => ({
    first: `${m.name || "An anonymous supporter"} via ${m.source}`, raised: "Counted from itemised payments",
    donors: "People who've chipped in", project: m.goal ? `${money(m.goal)} goal met` : "Marked funded on GitHub",
    drive: `${money(m.goal)} goal met`, goal: m.title,
  }[m.kind] || "");
  const isNew = (m) => !m.date || Date.now() - new Date(m.date).getTime() < 30 * 864e5;
  let seenWins = new Set();
  try { seenWins = new Set(JSON.parse(localStorage.getItem("ledger-seen-wins") || "[]")); } catch {}
  let winsObserved = false;

  function renderWins(D) {
    if (!showSection("#wins", D.milestones.length > 0, blank("#winList", "wins", "No milestones yet"))) { $("#winNext").replaceChildren(); $('[data-search="milestone"]').hidden = true; return; }
    const n = D.next.raised;
    if (n) {
      const pct = Math.max(0, Math.min(1, (n.current - n.prev) / (n.threshold - n.prev)));
      const fill = el("i");
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct * 100}%`; }));
      $("#winNext").replaceChildren(
        el("div", { class: "next-line" }, el("span", { class: "tile-label" }, `Next · ${money(n.threshold)} raised`), el("span", { class: "mono muted" }, `${money(Math.round(n.current))} · ${Math.round(pct * 100)}%`)),
        el("div", { class: "bar slim" }, fill));
    } else $("#winNext").replaceChildren();
    $("#winList").replaceChildren(...D.milestones.slice(0, 6).map((m) => row({
      date: m.date ? shortDate(m.date) : "now", title: winTitle(m), meta: winDetail(m),
      extra: isNew(m) ? el("span", { class: "new-dot", title: "New" }) : null,
      cls: isNew(m) ? "is-new" : "", onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); celebrate(e.clientX || r.left + 60, e.clientY || r.top + r.height / 2); },
    })));
    $('[data-search="milestone"]').hidden = D.milestones.length <= 6;

    // A recent, unseen milestone celebrates once when the section comes into view.
    if (!winsObserved && "IntersectionObserver" in window) {
      winsObserved = true;
      const io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const fresh = current.milestones.find((m) => isNew(m) && !seenWins.has(m.id));
        if (!fresh) return;
        const first = $("#winList .row");
        if (first) { const r = first.getBoundingClientRect(); setTimeout(() => celebrate(r.left + 120, r.top + r.height / 2, 30), 300); }
        current.milestones.filter(isNew).forEach((m) => seenWins.add(m.id));
        try { localStorage.setItem("ledger-seen-wins", JSON.stringify([...seenWins].slice(-200))); } catch {}
      }, { threshold: 0.4 });
      io.observe($("#winList"));
    }
  }

  /* ───────────── Spending ───────────── */
  function renderSpending(D) {
    if (!showSection("#spending", D.expenses.length > 0, blank("#spendList", "receipt", "No expenses yet"))) { $("#spendSummary").replaceChildren(); $('[data-search="expense"]').hidden = true; return; }
    const receipts = D.expenses.reduce((t, e) => t + (e.receipts || []).length, 0);
    const cats = D.byCategory.slice(0, 5), totalC = cats.reduce((t, c) => t + c.value, 0) || 1;
    $("#spendSummary").replaceChildren(
      el("div", { class: "next-line" },
        el("span", {}, el("b", { class: "mono" }, money(Math.round(D.spent))), el("span", { class: "muted" }, ` spent · ${intFmt(D.expenses.length)} expense${D.expenses.length === 1 ? "" : "s"} · ${intFmt(receipts)} receipt${receipts === 1 ? "" : "s"}`)),
        D.raised > 0 ? el("span", { class: "mono muted" }, `${Math.round((D.spent / D.raised) * 100)}% of raised`) : null),
      cats.length > 1 ? el("div", { class: "lang-bar slim-bar" }, cats.map((c, i) => el("i", { style: `flex:${Math.max(c.value, totalC * 0.01)};--o:${1 - i * 0.16}`, title: `${c.category}: ${money(Math.round(c.value))}` }))) : null,
      cats.length > 1 ? el("ul", { class: "lang-list small" }, cats.map((c, i) => el("li", {}, el("span", { class: "lang-dot", style: `--o:${1 - i * 0.16}` }), c.category))) : null);
    $("#spendList").replaceChildren(...D.expenses.slice(0, 8).map((e) => row({
      date: shortDate(e.date), title: e.title, sub: [e.vendor, e.project && e.project.title].filter(Boolean).join(" · ") || null,
      meta: e.category || "",
      extra: receiptLink(e) || (e.receiptNote ? el("span", { class: "no-receipt" }, e.receiptNote) : null),
      value: e.currency !== BASE && e.value != null ? `≈ ${money(e.value)}` : money(e.amount, e.currency),
      onclick: (e.receipts || []).length ? () => openReceipt(e, 0) : safeUrl(e.url) ? () => window.open(safeUrl(e.url), "_blank", "noopener") : null,
    })));
    $('[data-search="expense"]').hidden = D.expenses.length <= 8;
  }

  let receiptCtx = null;
  function openReceipt(e, i) {
    const r = e.receipts[i]; if (!r) return;
    if (r.kind !== "image") { window.open(safeUrl(r.url), "_blank", "noopener"); return; }
    receiptCtx = { e, i };
    const n = e.receipts.length;
    $("#receiptBody").replaceChildren(
      el("div", { class: "receipt-stage" },
        el("img", { src: safeUrl(r.url), alt: `${r.name} for ${e.title}` }),
        n > 1 ? el("button", { class: "icon-btn rc-prev", "aria-label": "Previous receipt", onclick: () => openReceipt(e, (i - 1 + n) % n) }, icon("left")) : null,
        n > 1 ? el("button", { class: "icon-btn rc-next", "aria-label": "Next receipt", onclick: () => openReceipt(e, (i + 1) % n) }, icon("right")) : null),
      el("div", { class: "receipt-meta" },
        el("div", {}, el("b", {}, e.title), el("div", { class: "tile-sub" }, [fmtDate(e.date), e.vendor, n > 1 ? `${i + 1} of ${n}` : null].filter(Boolean).join(" · "))),
        el("span", { class: "mono exp-amt" }, money(e.amount, e.currency))),
      el("div", { class: "pm-actions" },
        el("a", { class: "btn btn-ghost btn-sm", href: safeUrl(r.url), target: "_blank", rel: "noopener" }, "Open original", icon("arrow")),
        safeUrl(e.url) ? el("a", { class: "btn btn-ghost btn-sm", href: safeUrl(e.url), target: "_blank", rel: "noopener" }, "View on GitHub", icon("arrow")) : null));
    const m = $("#receiptModal"); if (!m.open) m.showModal();
  }
  document.addEventListener("keydown", (ev) => {
    if (!receiptCtx || !$("#receiptModal").open) return;
    const n = receiptCtx.e.receipts.length;
    if (ev.key === "ArrowRight" && n > 1) openReceipt(receiptCtx.e, (receiptCtx.i + 1) % n);
    if (ev.key === "ArrowLeft" && n > 1) openReceipt(receiptCtx.e, (receiptCtx.i - 1 + n) % n);
  });

  /* ───────────── Search section: every record, with receipt links ───────────── */
  const LTYPES = [["all", "All"], ["donation", "Donations"], ["expense", "Expenses"], ["receipt", "Receipts"], ["donor", "Donors"], ["milestone", "Milestones"], ["project", "Projects"]];
  const ledger = { type: "all", shown: 20 };
  function receiptLink(e) {
    const r = (e.receipts || [])[0];
    if (!r) return null;
    return el("button", { class: "receipt-link", type: "button", onclick: (ev) => { ev.stopPropagation(); openReceipt(e, 0); } },
      icon(r.kind === "image" ? "image" : r.kind === "file" ? "file" : "receipt"), e.receipts.length > 1 ? `Receipts (${e.receipts.length})` : "Receipt");
  }
  function ledgerIndex(D) {
    const out = [];
    for (const p of D.payments) {
      const pr = D.projects.find((x) => p.tags.includes(x.tag));
      out.push({ type: "donation", date: p.date, title: p.name || "Anonymous", sub: [p.message, pr && `for ${pr.title}`].filter(Boolean).join(" · "), meta: p.sourceLabel,
        sign: "in", value: p.value, valueText: p.value != null ? money(p.value) : money(p.amount, p.currency), item: p, text: [p.name || "anonymous", p.message, p.sourceLabel, pr && pr.title].join(" ") });
    }
    for (const e of D.expenses) out.push({ type: (e.receipts || []).length ? "expense receipt" : "expense", date: e.date, title: e.title, sub: [e.vendor, e.project && `for ${e.project.title}`, e.note].filter(Boolean).join(" · "), meta: e.category || e.sourceLabel,
      sign: "out", value: e.value, valueText: money(e.amount, e.currency), item: e, receipt: e, text: [e.title, e.vendor, e.category, e.note, e.sourceLabel, e.project && e.project.title, (e.receipts || []).length ? "receipt" : ""].join(" ") });
    for (const d of D.leaders) out.push({ type: "donor", date: d.last, title: d.name, sub: `${d.count} gift${d.count === 1 ? "" : "s"}${d.monthly ? ` · ${money(Math.round(d.monthly))}/mo` : ""}`, meta: d.sources.join(", "),
      value: d.total, valueText: money(Math.round(d.total)), donor: d.name, text: [d.name, d.sources.join(" ")].join(" ") });
    for (const m of D.milestones) out.push({ type: "milestone", date: m.date, title: winTitle(m), sub: winDetail(m), meta: "Milestone", value: null, text: [winTitle(m), winDetail(m)].join(" ") });
    for (const p of D.projects) out.push({ type: "project", date: p.updatedAt, title: p.title, sub: p.goal ? `${money(p.raised)} of ${money(p.goal)}` : `#${p.tag}`, meta: STATUS[p.status] || p.status, value: p.raised, valueText: money(p.raised), project: p.number, text: [p.title, p.body, p.tag].join(" ") });
    return out.map((x) => ({ ...x, text: String(x.text || "").toLowerCase() }));
  }
  function renderSearch(D) {
    showSection("#search", true);
    const all = ledgerIndex(D);
    const q = $("#ledgerSearch").value.trim().toLowerCase();
    const hit = all.filter((x) => !q || x.text.includes(q) || x.title.toLowerCase().includes(q));
    const is = (x, t) => t === "all" || x.type.split(" ").includes(t);
    const count = (t) => hit.filter((x) => is(x, t)).length;
    $("#ledgerChips").replaceChildren(...LTYPES.filter(([t]) => t === "all" || count(t)).map(([t, label]) =>
      el("button", { type: "button", role: "tab", class: `chip${ledger.type === t ? " on" : ""}`, "aria-selected": String(ledger.type === t), onclick: () => { ledger.type = t; ledger.shown = 20; renderSearch(current); } },
        label, el("span", { class: "chip-n" }, count(t)))));
    if (ledger.type !== "all" && !count(ledger.type) && !q) ledger.type = "all";
    let rows = hit.filter((x) => is(x, ledger.type));
    const sort = $("#ledgerSort").value, time = (x) => (x.date ? new Date(x.date).getTime() : 0);
    if (sort === "big") rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    else if (sort === "old") rows.sort((a, b) => time(a) - time(b));
    else rows.sort((a, b) => time(b) - time(a));
    const box = $("#ledgerResults");
    if (!all.length) { blank("#ledgerResults", "search", "Nothing to search yet")(); $("#ledgerCount").textContent = ""; $("#ledgerMore").hidden = true; return; }
    box.replaceChildren(...(rows.length ? rows.slice(0, ledger.shown).map((x) => row({
      date: x.date ? shortDate(x.date) : "now",
      title: highlight(x.title, q), sub: x.sub ? highlight(x.sub, q) : null,
      meta: x.meta || "",
      extra: x.receipt ? (receiptLink(x.receipt) || el("span", { class: "no-receipt" }, x.receipt.receiptNote || "no receipt")) : null,
      value: x.valueText ? el("span", { class: x.sign === "in" ? "amt-in" : x.sign === "out" ? "amt-out" : "" }, `${x.sign === "in" ? "+" : x.sign === "out" ? "−" : ""}${x.valueText}`) : "",
      onclick: x.receipt && (x.receipt.receipts || []).length ? () => openReceipt(x.receipt, 0)
        : x.donor ? () => { $("#ledgerSearch").value = x.donor; ledger.type = "donation"; renderSearch(current); }
        : x.project ? () => openProject(x.project)
        : x.item && safeUrl(x.item.url) ? () => window.open(safeUrl(x.item.url), "_blank", "noopener") : null,
    })) : [el("li", { class: "blank-li" }, el("div", { class: "blank" }, el("span", { class: "blank-ic" }, icon("search")), `Nothing matches “${$("#ledgerSearch").value.trim()}”`))]));
    const inSum = rows.filter((x) => x.sign === "in").reduce((t, x) => t + (x.value || 0), 0), outSum = rows.filter((x) => x.sign === "out").reduce((t, x) => t + (x.value || 0), 0);
    $("#ledgerCount").textContent = rows.length ? [`${intFmt(rows.length)} result${rows.length === 1 ? "" : "s"}`, inSum ? `+${money(Math.round(inSum))}` : null, outSum ? `−${money(Math.round(outSum))}` : null].filter(Boolean).join(" · ") : "";
    $("#ledgerMore").hidden = rows.length <= ledger.shown;
  }
  function focusLedger(type = "all", q = "") {
    ledger.type = type; ledger.shown = 20; $("#ledgerSearch").value = q;
    renderSearch(current);
    $("#search").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
    setTimeout(() => $("#ledgerSearch").focus({ preventScroll: true }), REDUCED ? 0 : 450);
  }
  let ledgerT;
  $("#ledgerSearch").addEventListener("input", () => { clearTimeout(ledgerT); ledgerT = setTimeout(() => { ledger.shown = 20; renderSearch(current); }, 100); });
  $("#ledgerSort").addEventListener("change", () => renderSearch(current));
  $("#ledgerMore").addEventListener("click", () => { ledger.shown += 20; renderSearch(current); });

  /* ───────────── Videos ───────────── */
  function renderVideos() {
    const body = $("#videosBody");
    const yt = state.snap && state.snap.youtube;
    const vids = (yt && yt.videos) || [];
    if (!showSection("#videos", vids.length > 0, blank("#videosBody", "video", "No videos yet"))) return;
    $("#videosSub").textContent = `Latest uploads from ${yt.title || "my channel"}.`;
    const play = (box, v) => {
      if (box.querySelector("iframe")) return;
      box.replaceChildren(el("iframe", { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`, title: v.title, allow: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture", allowfullscreen: true, loading: "lazy" }));
    };
    const card = (v, big) => {
      const thumb = el("button", { class: "vthumb", "aria-label": `Play ${v.title}` },
        el("img", { src: safeUrl(`https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/${big ? "maxresdefault" : "hqdefault"}.jpg`), alt: "", loading: "lazy", onerror: (e) => { if (big && !e.target.dataset.fb) { e.target.dataset.fb = 1; e.target.src = `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg`; } } }),
        el("span", { class: "vplay" }, svgPlay()));
      thumb.addEventListener("click", (e) => { e.stopPropagation(); play(thumb, v); });
      return el("article", { class: `card video${big ? " featured" : ""}${entering("v" + v.id)}` }, thumb,
        el("div", { class: "vmeta" },
          el("h3", {}, v.title),
          el("div", { class: "tile-sub" }, ago(v.published), v.views != null ? ` · ${intFmt(v.views)} views` : "",
            " · ", el("a", { href: safeUrl(`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`), target: "_blank", rel: "noopener", class: "link-arrow" }, "YouTube ↗"))));
    };
    body.replaceChildren(card(vids[0], true), el("div", { class: "video-grid" }, vids.slice(1, 7).map((v) => card(v, false))),
      yt.url ? el("a", { class: "btn btn-ghost", href: safeUrl(yt.url), target: "_blank", rel: "noopener" }, icon("brand:youtube"), "Open channel", icon("arrow")) : null);
  }
  const svgPlay = () => { const s = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }); s.innerHTML = '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'; return s; };
  const navLink = (href) => $(`#nav > a[href="${href}"]`) || document.createElement("a");
  // Every section always renders. With no data it shows a plain empty card.
  const showSection = (id, hasData, onEmpty) => {
    const sec = $(id); if (sec) sec.hidden = false; navLink(id).hidden = false;
    if (!hasData && onEmpty) onEmpty();
    return hasData;
  };
  const blank = (container, ic, text) => () => {
    const box = $(container);
    const card = el("div", { class: "blank" }, el("span", { class: "blank-ic" }, icon(ic)), el("span", {}, text));
    box.replaceChildren(/^(OL|UL)$/.test(box.tagName) ? el("li", { class: "blank-li" }, card) : card);
  };

  /* ───────────── platforms ───────────── */
  let platformFilter = "all";
  const KIND = { recurring: "Recurring", "one-time": "One-time", crypto: "Crypto" };
  function platformStats(s, toBase) {
    const d = s.data; if (!d) return [];
    const out = [];
    if (s.meta.address) {
      out.push(["Received", `${money(d.received, d.currency)}${toBase(d.received, d.currency) != null ? ` ≈ ${money(Math.round(toBase(d.received, d.currency)))}` : ""}`]);
      if (d.supporters) out.push(["Senders", intFmt(d.supporters)]);
      return out;
    }
    const raised = d.received != null ? toBase(d.received, d.currency) : d.sumPayments ? (d.payments || []).reduce((t, p) => t + (toBase(p.amount, p.currency) || 0), 0) : null;
    if (raised != null) out.push(["Raised", money(Math.round(raised))]);
    if (d.recurring && d.recurring.amount > 0) out.push([d.recurring.period === "week" ? "Weekly" : "Monthly", money(d.recurring.amount, d.currency)]);
    if (Number.isFinite(d.supporters)) out.push(["Supporters", intFmt(d.supporters)]);
    if (d.balance != null && !s.meta.address) out.push(["Balance", money(Math.round(toBase(d.balance, d.currency) ?? d.balance))]);
    return out.slice(0, 3);
  }
  function renderPlatforms(D) {
    const grid = $("#platformGrid");
    const seg = $("#platformFilter");
    const kinds = [...new Set(D.srcs.map((s) => s.meta.kind))];
    seg.hidden = kinds.length < 2;
    seg.replaceChildren(...["all", ...kinds].map((k) => el("button", { role: "tab", class: k === platformFilter ? "on" : "", "data-filter": k }, k === "all" ? "All" : KIND[k])));
    if (!showSection("#donate", D.srcs.length > 0, blank("#platformGrid", "heart", "No donation links yet"))) return;
    grid.replaceChildren(...D.srcs.map((s) => {
      const v = SRC[s.id];
      const url = safeUrl(s.meta.link(v));
      const stats = platformStats(s, D.toBase);
      const chip = el("span", { class: `src-chip ${s.mode}` }, el("span", { class: `src-dot ${s.mode}` }),
        s.mode === "snapshot" ? `Synced ${ago(s.data.updatedAt)}` : modeLabel(s.mode));
      const kids = [
        el("div", { class: "platform-top" }, el("span", { class: "glyph" }, icon(s.meta.icon)), chip),
        el("div", {}, el("h3", {}, s.meta.label), !s.meta.address && s.meta.handle ? el("div", { class: "handle" }, s.meta.handle(v)) : null),
        stats.length ? el("dl", { class: "pstats" }, stats.map(([k, val]) => el("div", {}, el("dt", {}, k), el("dd", { class: "mono" }, val)))) : null,
        s.mode === "error" ? el("p", { class: "fine err" }, s.error) : s.data && s.data.note ? el("p", { class: "fine" }, s.data.note) : null,
      ];
      if (s.meta.address) {
        kids.push(el("div", { class: "addr" }, el("code", { title: v }, v),
          el("button", { class: "copy-mini", onclick: (e) => { e.preventDefault(); e.stopPropagation(); copy(v, `${s.meta.label} address copied`); } }, icon("copy"), "Copy")));
        kids.push(el("a", { class: "go", href: url, target: "_blank", rel: "noopener" }, el("span", {}, "View on explorer"), icon("arrow")));
        return el("article", { class: `card platform${entering("pf" + s.id)}${platformFilter !== "all" && s.meta.kind !== platformFilter ? " hide" : ""}`, "data-kind": s.meta.kind }, kids);
      }
      kids.push(el("div", { class: "go" }, el("span", {}, "Open"), icon("arrow")));
      return el("a", { class: `card platform clickable${entering("pf" + s.id)}${platformFilter !== "all" && s.meta.kind !== platformFilter ? " hide" : ""}`, href: url, target: "_blank", rel: "noopener", "data-kind": s.meta.kind }, kids);
    }));
  }

  /* ───────────── contact ───────────── */
  const socialIcon = (p) => (LIB.brand[p === "twitter" ? "x" : p] ? `brand:${p === "twitter" ? "x" : p}` : p === "website" ? "globe" : "at");
  const socialList = (D) => L.socialLinks({ profile: D.gh.profile, socials: D.gh.socials, overrides: C.socials })
    .map((x) => ({ ...x, url: safeUrl(x.url) })).filter((x) => x.url);
  function renderContact(D) {
    const grid = $("#contactGrid");
    const cards = [];
    const email = C.email || (D.gh.profile && D.gh.profile.email);
    if (email) cards.push(el("article", { class: `card contact-email${entering("c-email")}` },
      el("div", { class: "tile-label" }, "Email"),
      el("div", { class: "email-line mono" }, email),
      el("div", { class: "row gap-8" },
        el("button", { class: "btn btn-primary btn-sm", onclick: () => copy(email, "Email copied") }, icon("copy"), "Copy"),
        el("a", { class: "btn btn-ghost btn-sm", href: `mailto:${email}` }, "Compose"))));
    if (DISCORD_ID) {
      const d = state.discord, invite = safeUrl(C.discordInvite) || safeUrl(d && d.invite) || safeUrl(state.snap && state.snap.discord && state.snap.discord.invite);
      cards.push(el("article", { class: `card contact-discord${entering("c-discord")}` },
        el("div", { class: "tile-label" }, "Discord"),
        el("div", { class: "tile-strong" }, d ? d.name : "Discord server"),
        el("div", { class: "tile-sub" }, d ? [el("span", { class: "online-dot" }), `${intFmt(d.online)} online now`] : state.discordErr ? `Widget unavailable (${state.discordErr})` : "Loading…"),
        d && d.members.length ? el("div", { class: "discord-members" }, d.members.slice(0, 10).map((m) => el("span", {}, m.name))) : null,
        invite ? el("a", { class: "btn btn-primary btn-sm", href: invite, target: "_blank", rel: "noopener" }, "Join server", icon("arrow")) : null));
    }
    const socials = socialList(D);
    if (socials.length) cards.push(el("article", { class: `card contact-socials${entering("c-socials")}` },
      el("div", { class: "tile-label" }, "Socials"),
      el("ul", { class: "social-list" }, socials.map((s) => el("li", {}, el("a", { href: s.url, target: "_blank", rel: "noopener me" },
        el("span", { class: "sname" }, icon(socialIcon(s.provider)), s.name), el("span", { class: "shandle" }, s.handle, icon("arrow"))))))));
    grid.dataset.count = String(cards.length);
    if (!showSection("#contact", cards.length > 0, blank("#contactGrid", "mail", "No contact details yet"))) { grid.dataset.count = "1"; return; }
    grid.replaceChildren(...cards);
  }

  /* ───────────── footer ───────────── */
  function renderFooter(D) {
    const p = D.gh.profile;
    const brand = (p && p.company ? p.company.replace(/^@/, "") : p && p.name) || "";
    $("#footerBrand").textContent = brand ? `${brand} ${new Date().getFullYear()}` : "";
    const live = [D.gh.mode === "live" && "GitHub", ...D.srcs.filter((s) => s.mode === "live").map((s) => s.meta.label), state.discord && "Discord"].filter(Boolean);
    const synced = D.srcs.filter((s) => s.mode === "snapshot").map((s) => s.meta.label);
    $("#footerSources").textContent = [live.length ? `Live: ${live.join(", ")}` : null, synced.length ? `Synced: ${synced.join(", ")}` : null, state.snap ? `Sync data changed ${ago(state.snap.generatedAt)}` : null].filter(Boolean).join(" · ");
  }

  /* ───────────── copy, toast, theme ───────────── */
  let toastT;
  function toast(msg) { const t = $("#toast"); t.replaceChildren(icon("check"), msg); t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800); }
  function copy(text, msg) {
    const done = () => toast(msg || "Copied");
    const fallback = () => { const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand("copy"); done(); } catch { toast("Couldn't copy"); } ta.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  /* ───────────── font library (Google Fonts, loaded only when picked) ───────────── */
  const FONTS = {
    geist:     { label: "Geist", note: "Geist · Geist Mono", body: "Geist", display: "Geist", mono: "Geist Mono", q: "family=Geist:wght@300..700&family=Geist+Mono:wght@400..600" },
    inter:     { label: "Inter", note: "Inter Tight · Inter · JetBrains Mono", body: "Inter", display: "Inter Tight", mono: "JetBrains Mono", q: "family=Inter:wght@300..700&family=Inter+Tight:wght@500..700&family=JetBrains+Mono:wght@400..600" },
    editorial: { label: "Editorial", note: "Instrument Serif · Inter · JetBrains Mono", body: "Inter", display: "Instrument Serif", mono: "JetBrains Mono", displayWeight: 400, displayTrack: "-0.01em", q: "family=Instrument+Serif:ital@0;1&family=Inter:wght@300..700&family=JetBrains+Mono:wght@400..600" },
    grotesk:   { label: "Space Grotesk", note: "Space Grotesk · Space Mono", body: "Space Grotesk", display: "Space Grotesk", mono: "Space Mono", q: "family=Space+Grotesk:wght@300..700&family=Space+Mono:wght@400;700" },
    bricolage: { label: "Bricolage", note: "Bricolage Grotesque · Figtree · Martian Mono", body: "Figtree", display: "Bricolage Grotesque", mono: "Martian Mono", q: "family=Bricolage+Grotesque:wght@400..800&family=Figtree:wght@300..700&family=Martian+Mono:wght@400..600" },
    plex:      { label: "IBM Plex", note: "IBM Plex Sans · IBM Plex Mono", body: "IBM Plex Sans", display: "IBM Plex Sans", mono: "IBM Plex Mono", q: "family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600" },
    manrope:   { label: "Manrope", note: "Manrope · Fira Code", body: "Manrope", display: "Manrope", mono: "Fira Code", q: "family=Manrope:wght@300..800&family=Fira+Code:wght@400..600" },
    syne:      { label: "Syne", note: "Syne · DM Sans · DM Mono", body: "DM Sans", display: "Syne", mono: "DM Mono", q: "family=Syne:wght@500..800&family=DM+Sans:wght@300..700&family=DM+Mono:wght@400;500" },
    mono:      { label: "Terminal", note: "JetBrains Mono everywhere", body: "JetBrains Mono", display: "JetBrains Mono", mono: "JetBrains Mono", q: "family=JetBrains+Mono:wght@300..700" },
  };
  const DEFAULT_FONT = FONTS[C.font] ? C.font : "geist";
  const stack = (f, fallback) => `"${f}", ${fallback}`;
  function applyFont(key, persist) {
    const f = FONTS[key] || FONTS[DEFAULT_FONT];
    const id = `font-${key}`;
    if (key !== "geist" && !document.getElementById(id)) document.head.append(el("link", { id, rel: "stylesheet", href: `https://fonts.googleapis.com/css2?${f.q}&display=swap` }));
    const r = document.documentElement.style;
    r.setProperty("--font", stack(f.body, "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"));
    r.setProperty("--display", stack(f.display, "var(--font)"));
    r.setProperty("--mono", stack(f.mono, "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"));
    r.setProperty("--display-weight", String(f.displayWeight || 600));
    r.setProperty("--display-track", f.displayTrack || "-0.02em");
    document.documentElement.dataset.font = key;
    if (document.fonts) document.fonts.ready.then(() => { if (navApi) navApi.layout(); });
    if (persist) { try { if (key === DEFAULT_FONT) localStorage.removeItem("ledger-font"); else localStorage.setItem("ledger-font", key); } catch {} }
  }
  let savedFont = null; try { savedFont = localStorage.getItem("ledger-font"); } catch {}
  applyFont(FONTS[savedFont] ? savedFont : DEFAULT_FONT, false);

  const effectiveTheme = () => document.documentElement.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem("ledger-theme", next); } catch {} };
    if (document.startViewTransition && !REDUCED) document.startViewTransition(apply); else apply();
  }
  $("#themeToggle").addEventListener("click", toggleTheme);

  /* ───────────── site search (⌘K or "/"): sections, projects, links, actions ───────────── */
  const TYPES = [["page", "Sections"], ["project", "Projects"], ["link", "Links"], ["action", "Actions"]];
  const TYPE_LABEL = Object.fromEntries(TYPES);
  const scrollTo_ = (id) => () => { const x = $(id); if (x && !x.hidden) x.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }); };
  function searchIndex() {
    const D = current || derive();
    const items = [];
    const push = (o) => items.push({ ...o, text: [o.title, o.meta].filter(Boolean).join(" ").toLowerCase() });
    for (const [href, [label, ic]] of Object.entries(SECTIONS)) if ($(href) && !$(href).hidden) push({ type: "page", title: label, meta: "Section", ic, run: scrollTo_(href) });
    for (const p of D.projects) push({ type: "project", title: p.title, meta: [STATUS[p.status] || p.status, p.goal ? `${money(p.raised)} of ${money(p.goal)}` : null].filter(Boolean).join(" · "), ic: "folder", run: () => openProject(p.number) });
    for (const s of D.srcs) push(s.meta.address
      ? { type: "link", title: `${s.meta.label} address`, meta: "Copy to clipboard", ic: s.meta.icon, run: () => copy(SRC[s.id], `${s.meta.label} address copied`) }
      : { type: "link", title: s.meta.label, meta: s.meta.handle ? s.meta.handle(SRC[s.id]) : "Donate", ic: s.meta.icon, run: () => window.open(safeUrl(s.meta.link(SRC[s.id])), "_blank", "noopener") });
    for (const s of socialList(D)) push({ type: "link", title: s.name, meta: s.handle, ic: socialIcon(s.provider), run: () => window.open(s.url, "_blank", "noopener") });
    const email = C.email || (D.gh.profile && D.gh.profile.email);
    push({ type: "action", title: "Search donations & receipts", meta: "Jump to the Search section", ic: "receipt", run: () => focusLedger() });
    push({ type: "action", title: "Refresh live data", meta: "Fetch every source again", ic: "refresh", run: () => refresh(true) });
    push({ type: "action", title: "Toggle light / dark", meta: "Theme", ic: "sun", run: toggleTheme });
    if (email) push({ type: "action", title: "Copy email address", meta: email, ic: "copy", run: () => copy(email, "Email copied") });
    for (const [k, f] of Object.entries(FONTS)) push({ type: "action", title: `Font: ${f.label}${document.documentElement.dataset.font === k ? " ✓" : ""}`, meta: f.note, ic: "type", run: () => { applyFont(k, true); toast(`Font: ${f.label}`); } });
    return items;
  }
  function fuzzy(q, s) {
    if (!q) return 0; s = String(s || "").toLowerCase();
    const direct = s.indexOf(q); if (direct !== -1) return 1000 - direct;
    let si = 0, score = 0, streak = 0;
    for (const ch of q) { const j = s.indexOf(ch, si); if (j === -1) return -1; streak = j === si ? streak + 1 : 0; score += 1 + streak * 2; si = j + 1; }
    return score;
  }
  const pal = $("#palette"), palInput = $("#paletteInput"), palList = $("#paletteList");
  let palAll = [], palView = [], palSel = 0;
  function renderPalette() {
    const q = palInput.value.trim().toLowerCase();
    const scored = palAll.map((it) => ({ it, s: q ? Math.max(fuzzy(q, it.title), it.text.includes(q) ? 100 : -1) : 0 })).filter((x) => x.s >= 0);
    if (q) scored.sort((a, b) => b.s - a.s);
    palView = scored.map((x) => x.it);
    palSel = Math.min(palSel, Math.max(0, palView.length - 1));
    palList.replaceChildren();
    if (!palView.length) { palList.append(el("li", { class: "palette-empty" }, `Nothing found for “${palInput.value.trim()}”`)); return; }
    if (q) { palView.forEach((it, i) => palList.append(palRow(it, i, q))); return; }
    const ordered = []; let i = 0;
    for (const [ty, label] of TYPES) {
      const l = palView.filter((it) => it.type === ty); if (!l.length) continue;
      palList.append(el("li", { class: "palette-group", role: "presentation" }, label));
      for (const it of l) { ordered.push(it); palList.append(palRow(it, i++, q)); }
    }
    palView = ordered; markSel();
  }
  const palRow = (it, i, q) => el("li", { class: "palette-item", role: "option", "aria-selected": String(i === palSel), "data-i": i, onpointermove: () => { if (palSel !== i) { palSel = i; markSel(); } }, onclick: () => runPal(i) },
    el("span", { class: "pi-ic" }, icon(it.ic)),
    el("span", { class: "pi-main" }, el("span", { class: "pi-title" }, highlight(it.title, q)), it.meta ? el("span", { class: "pi-meta" }, highlight(it.meta, q)) : null));
  function markSel() { $$(".palette-item", palList).forEach((n) => n.setAttribute("aria-selected", String(Number(n.dataset.i) === palSel))); const cur = $(`.palette-item[data-i="${palSel}"]`, palList); if (cur) cur.scrollIntoView({ block: "nearest" }); }
  function runPal(i) { const it = palView[i]; if (!it || !it.run) return; pal.close(); setTimeout(it.run, 10); }
  function openPalette() { palAll = searchIndex(); if (!pal.open) pal.showModal(); palInput.value = ""; palSel = 0; renderPalette(); palInput.focus(); }
  palInput.addEventListener("input", () => { palSel = 0; renderPalette(); });
  palInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = (palSel - 1 + palView.length) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "Enter") { e.preventDefault(); runPal(palSel); }
  });
  $("#openPalette").addEventListener("click", () => openPalette());
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-search]"); if (b) { e.preventDefault(); focusLedger(b.dataset.search); } });
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $("#kbdHint").textContent = "Ctrl K";
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.open ? pal.close() : openPalette(); }
    else if (e.key === "/" && !typing && !pal.open) { e.preventDefault(); openPalette(); }
  });
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }));

  /* ───────────── nav, reveal, spotlight ───────────── */
  /* ───────────── top bar: priority nav + "More", mobile sheet, progress ───────────── */
  const SECTIONS = {
    "#overview": ["Overview", "home"], "#projects": ["Work", "folder"], "#drives": ["Drives", "target"],
    "#wins": ["Milestones", "wins"], "#supporters": ["Backers", "donors"], "#spending": ["Spending", "spending"],
    "#search": ["Search", "search"], "#videos": ["Videos", "video"], "#donate": ["Support", "heart"], "#contact": ["Contact", "mail"],
  };
  let navApi = null;
  function setupNav() {
    const bar = $("#topbar"), nav = $("#nav"), slot = $("#navSlot"), ind = $("#navIndicator");
    const more = $("#navMore"), moreBtn = $("#navMoreBtn"), menu = $("#navMenu");
    const sheet = $("#sheet"), menuBtn = $("#menuBtn"), progress = $("#scrollProgress");
    moreBtn.append(icon("down"));
    menuBtn.append(icon("menu"));
    const links = () => $$("#nav > a").filter((a) => !a.hidden);
    let active = null; // "#section" or null (overview)
    const slotOn = () => getComputedStyle(slot).display !== "none";

    // Fit as many links as the bar allows; the rest go under "More".
    function layout() {
      const all = links();
      all.forEach((a) => a.classList.remove("overflowed"));
      more.hidden = true;
      if (slotOn() && nav.scrollWidth > slot.clientWidth) {
        more.hidden = false;
        for (let i = all.length - 1; i >= 1 && nav.scrollWidth > slot.clientWidth; i--) all[i].classList.add("overflowed");
      }
      const over = all.filter((a) => a.classList.contains("overflowed"));
      if (!over.length) more.hidden = true;
      menu.replaceChildren(...over.map((a) => {
        const href = a.getAttribute("href"), [label, ic] = SECTIONS[href] || [a.textContent, "hash"];
        return el("a", { href, role: "menuitem", class: "nav-menu-item", onclick: () => closeMore() }, icon(ic), label);
      }));
      position();
    }
    // Slide the pill under the active link (or under "More" when the active one is tucked away).
    function position() {
      const all = links();
      const target = all.find((a) => a.getAttribute("href") === active) || null;
      const inMore = !!target && target.classList.contains("overflowed");
      all.forEach((l) => l.classList.toggle("active", l === target && !inMore));
      moreBtn.classList.toggle("active", inMore);
      $$(".nav-menu-item", menu).forEach((m) => m.classList.toggle("active", m.getAttribute("href") === active));
      $$(".sheet-item", sheet).forEach((m) => m.classList.toggle("active", m.getAttribute("href") === (active || "#overview")));
      $("#brandSub").textContent = (SECTIONS[active || "#overview"] || [""])[0];
      const anchor = inMore ? more : target;
      if (!anchor || !slotOn()) { ind.style.opacity = 0; return; }
      ind.style.opacity = 1; ind.style.width = `${anchor.offsetWidth}px`; ind.style.transform = `translateX(${anchor.offsetLeft}px)`;
    }
    function spy() {
      const y = window.scrollY;
      bar.classList.toggle("scrolled", y > 4);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
      const ids = ["#overview", ...links().map((a) => a.getAttribute("href"))];
      const secs = ids.map((id) => $(id)).filter((x) => x && !x.hidden);
      if (!secs.length) return;
      const line = y + window.innerHeight * 0.3;
      let cur = secs[0];
      for (const sec of secs) if (sec.offsetTop <= line) cur = sec;
      if (window.innerHeight + y >= document.documentElement.scrollHeight - 2) cur = secs[secs.length - 1];
      const next = cur.id === "overview" ? null : `#${cur.id}`;
      if (next !== active) { active = next; position(); }
    }

    // "More" dropdown
    const openMore = () => { more.classList.add("open"); moreBtn.setAttribute("aria-expanded", "true"); };
    const closeMore = () => { more.classList.remove("open"); moreBtn.setAttribute("aria-expanded", "false"); };
    moreBtn.addEventListener("click", (e) => { e.stopPropagation(); more.classList.contains("open") ? closeMore() : openMore(); });
    moreBtn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openMore(); const f = $(".nav-menu-item", menu); if (f) f.focus(); } });
    menu.addEventListener("keydown", (e) => {
      const items = $$(".nav-menu-item", menu), i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    });

    // Mobile / tablet sheet
    function buildSheet() {
      const ids = ["#overview", ...links().map((a) => a.getAttribute("href"))];
      $("#sheetGrid").replaceChildren(...ids.map((href, i) => {
        const [label, ic] = SECTIONS[href] || [href, "hash"];
        return el("a", { href, class: `sheet-item${(active || "#overview") === href ? " active" : ""}`, onclick: () => closeSheet() },
          el("span", { class: "num" }, String(i).padStart(2, "0")), icon(ic), el("span", {}, label));
      }));
      $("#sheetActions").replaceChildren(
        el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { closeSheet(); openPalette(); } }, icon("search"), "Search"),
        el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => toggleTheme() }, icon("sun"), "Theme"),
        el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { closeSheet(); refresh(true); } }, icon("refresh"), "Refresh"));
    }
    const openSheet = () => { buildSheet(); sheet.hidden = false; bar.classList.add("sheet-open"); menuBtn.setAttribute("aria-expanded", "true"); menuBtn.replaceChildren(icon("close")); const f = $(".sheet-item", sheet); if (f) f.focus({ preventScroll: true }); };
    const closeSheet = () => { if (sheet.hidden) return; sheet.hidden = true; bar.classList.remove("sheet-open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.replaceChildren(icon("menu")); };
    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); sheet.hidden ? openSheet() : closeSheet(); });

    document.addEventListener("click", (e) => {
      if (!more.contains(e.target)) closeMore();
      if (!sheet.hidden && !sheet.contains(e.target) && e.target !== menuBtn) closeSheet();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (more.classList.contains("open")) { closeMore(); moreBtn.focus(); } if (!sheet.hidden) { closeSheet(); menuBtn.focus(); } } });

    let raf;
    window.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
    window.addEventListener("resize", () => { layout(); if (!slotOn()) closeMore(); else closeSheet(); spy(); });
    if ("ResizeObserver" in window) new ResizeObserver(() => layout()).observe(slot);
    if (document.fonts) document.fonts.ready.then(() => { layout(); spy(); });
    navApi = { layout: () => { layout(); spy(); } };
    layout(); spy();
  }
  function setupReveal() {
    const items = $$(".reveal");
    if (REDUCED || !("IntersectionObserver" in window)) { items.forEach((n) => n.classList.add("in")); return; }
    const io = new IntersectionObserver((es) => es.filter((e) => e.isIntersecting).forEach((e) => { e.target.classList.add("in"); io.unobserve(e.target); }), { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    items.forEach((n) => io.observe(n));
  }
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest && e.target.closest(".card"); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty("--mx", `${e.clientX - r.left}px`); c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ───────────── click flair: light burst + press, no bounce ───────────── */
  const FLAIR = ".card, .btn, .seg button, .icon-btn, .kbd-btn, .live-pill, .copy-mini, .palette-item";
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const t = e.target.closest && e.target.closest(FLAIR); if (!t) return;
    t.classList.add("pressing");
    if (REDUCED) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const ring = el("span", { class: "burst", style: `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px` });
    t.append(ring);
    ring.addEventListener("animationend", () => ring.remove());
    t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
  });
  const release = () => $$(".pressing").forEach((n) => n.classList.remove("pressing"));
  document.addEventListener("pointerup", release); document.addEventListener("pointercancel", release); document.addEventListener("dragstart", release);
  document.addEventListener("animationend", (e) => { if (e.animationName === "flash") e.target.classList.remove("flash"); });

  function tileGo(t) {
    const target = t.dataset.go;
    if (target === "clock") { clock12 = !clock12; clockFmt = null; tickClock(); toast(clock12 ? "12-hour time" : "24-hour time"); return; }
    if (target === "discord") {
      const d = state.discord, invite = safeUrl(C.discordInvite) || safeUrl(d && d.invite) || safeUrl(state.snap && state.snap.discord && state.snap.discord.invite);
      if (invite) window.open(invite, "_blank", "noopener"); return;
    }
    const sec = $(target); if (sec && !sec.hidden) sec.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-go]"); if (!t || e.target.closest("a, button")) return;
    tileGo(t);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = document.activeElement; if (!t || !t.dataset || !t.dataset.go) return;
    e.preventDefault(); tileGo(t);
  });

  /* ───────────── controls ───────────── */
  function segmented(root, onChange) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", String(x === b)); });
      onChange(b.dataset.filter ?? b.dataset.range);
    });
  }
  segmented($("#projectFilter"), (f) => { projectFilter = f; $$(".project").forEach((c) => c.classList.toggle("hide", f !== "all" && c.dataset.status !== f)); });
  segmented($("#platformFilter"), (f) => { platformFilter = f; $$(".platform").forEach((c) => c.classList.toggle("hide", f !== "all" && c.dataset.kind !== f)); });
  segmented($("#chartRange"), (r) => { chartRange = r === "all" ? "all" : Number(r); renderChart(current); });
  $("#livePill").addEventListener("click", () => refresh(true));

  /* ───────────── render + refresh loop ───────────── */
  let current = null;
  function renderAll() {
    current = derive();
    const D = current;
    const p = D.gh.profile;
    if (p) {
      $("#brandName").textContent = p.name; document.title = `${p.name} · Ledger`;
      const mark = $("#brandMark");
      if (safeUrl(p.avatar) && !mark.querySelector("img")) { mark.classList.add("has-img"); mark.replaceChildren(el("img", { src: safeUrl(p.avatar), alt: "", width: "28", height: "28" })); }
    }
    renderSetup(D); renderBento(D); renderProjects(D); renderDrives(D); renderWins(D); renderChart(D); renderBoard(D); renderRecent(D); renderSpending(D); renderVideos(); renderSearch(D); renderPlatforms(D); renderContact(D); renderFooter(D); renderLivePill();
    // Number the visible sections 01, 02, … so hidden ones leave no gaps.
    $$("main > section:not([hidden]) .eyebrow").forEach((e, i) => { e.textContent = String(i + 1).padStart(2, "0"); });
    if (navApi) navApi.layout();
  }

  async function refresh(manual) {
    if (state.refreshing) return;
    state.refreshing = true; renderLivePill();
    const jobs = [loadLive()];
    // GitHub's unauthenticated limit is 60 requests/hour per visitor, so refetch it every 10 min at most.
    if (!state.ghAt || Date.now() - state.ghAt > 10 * 60e3 || (manual && Date.now() - state.ghAt > 60e3)) jobs.push(loadGitHub());
    if (!state.snapAt || Date.now() - state.snapAt > 5 * 60e3 || manual) jobs.push(loadSnapshot());
    // Render as soon as GitHub lands so the profile isn't blank while slower sources load.
    if (!state.booted) jobs[jobs.length > 1 ? 1 : 0].then(() => renderAll());
    await Promise.all(jobs);
    state.refreshing = false; state.booted = true; state.lastRefresh = new Date();
    renderAll();
    if (manual === true) toast("Live data refreshed");
  }

  setupNav(); setupReveal();
  renderAll();
  refresh(false);
  setInterval(() => { if (!document.hidden) refresh(false); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && state.lastRefresh && Date.now() - state.lastRefresh > REFRESH_MS) refresh(false); });
  setInterval(() => { tickClock(); tickCountdowns(); renderLivePill(); }, 1000);
  if ("ResizeObserver" in window) { let w = $("#chart").clientWidth, t; new ResizeObserver(() => { const nw = $("#chart").clientWidth; if (nw !== w) { w = nw; clearTimeout(t); t = setTimeout(() => current && renderChart(current), 80); } }).observe($("#chart")); }
})();
