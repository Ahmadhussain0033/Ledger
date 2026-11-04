/* Ledger — renders everything from live sources (js/sources.js) and the
 * Action-built snapshot (data/snapshot.json). ledger.config.js only holds
 * account names. Nothing on the page is typed in by hand. */
(() => {
  "use strict";

  const C = window.LEDGER_CONFIG || {};
  const SRC = C.sources || {};
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
  };
  const icon = (name, cls = "i") => { const s = svgEl("svg", { viewBox: "0 0 24 24", class: cls, "aria-hidden": "true" }); s.innerHTML = ICONS[name] || ICONS.link; return s; };

  /* ───────────── source catalogue ───────────── */
  const META = {
    opencollective: { label: "Open Collective", icon: "heart", kind: "recurring", keyless: true, link: (v) => `https://opencollective.com/${v}/donate`, handle: (v) => `opencollective.com/${v}` },
    liberapay: { label: "Liberapay", icon: "repeat", kind: "recurring", keyless: true, link: (v) => `https://liberapay.com/${v}/donate`, handle: (v) => `liberapay.com/${v}` },
    githubSponsors: { label: "GitHub Sponsors", icon: "code", kind: "recurring", link: () => `https://github.com/sponsors/${C.github}`, handle: () => `github.com/sponsors/${C.github}`, secret: "SPONSORS_TOKEN (optional, for amounts)" },
    patreon: { label: "Patreon", icon: "repeat", kind: "recurring", link: (v) => `https://www.patreon.com/${v}`, handle: (v) => `patreon.com/${v}`, secret: "PATREON_TOKEN" },
    buymeacoffee: { label: "Buy Me a Coffee", icon: "coffee", kind: "one-time", link: (v) => `https://www.buymeacoffee.com/${v}`, handle: (v) => `buymeacoffee.com/${v}`, secret: "BMC_TOKEN" },
    kofi: { label: "Ko-fi", icon: "coffee", kind: "one-time", link: (v) => `https://ko-fi.com/${v}`, handle: (v) => `ko-fi.com/${v}`, secret: "Ko-fi relay" },
    paypal: { label: "PayPal", icon: "wallet", kind: "one-time", linkOnly: true, link: (v) => `https://paypal.me/${v}`, handle: (v) => `paypal.me/${v}` },
    bitcoin: { label: "Bitcoin", icon: "coin", kind: "crypto", keyless: true, address: true, link: (v) => `https://mempool.space/address/${v}` },
    ethereum: { label: "Ethereum", icon: "coin", kind: "crypto", keyless: true, address: true, link: (v) => `https://eth.blockscout.com/address/${v}` },
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
    try { state.ghLive = await L.github({ login: C.github, repo: C.repo, label: C.projectLabel || "funding" }); }
    catch (e) { state.ghLive = { errors: [e.message] }; }
    state.ghAt = Date.now();
  }
  async function loadSnapshot() {
    try { state.snap = await L.getJSON(`data/snapshot.json?t=${Date.now()}`, { cache: "no-store" }); state.snapErr = null; }
    catch (e) { state.snapErr = e.status === 404 ? "not generated yet" : location.protocol === "file:" ? "can't be read from file://" : e.message; }
    state.snapAt = Date.now();
  }
  async function loadLive() {
    await Promise.all([
      ...CONFIGURED.filter((id) => KEYLESS[id]).map(async (id) => {
        try { state.live[id] = await KEYLESS[id](SRC[id]); delete state.liveErr[id]; }
        catch (e) { state.liveErr[id] = e.message; }
      }),
      C.discordServerId ? L.discord(C.discordServerId).then((d) => { state.discord = d; state.discordErr = null; }, (e) => { state.discordErr = e.message; }) : null,
      L.fiatRates().then((r) => { Object.assign(state.usdPer, r.usdPer); state.fxOk = true; }, () => {}),
    ]);
  }

  /* ───────────── merging & derived data ───────────── */
  function gh() {
    const live = state.ghLive || {}, snap = (state.snap && state.snap.github) || {};
    const errs = (live.errors || []).join(" ");
    const pick = (key, errKey) => (live[key] && (Array.isArray(live[key]) ? !errs.includes(errKey) : true) ? { v: live[key], mode: "live" }
      : snap[key] ? { v: snap[key], mode: "snapshot" } : { v: Array.isArray(live[key]) ? live[key] : null, mode: errs.includes(errKey) ? "error" : "live" });
    const profile = pick("profile", "profile:"), projects = pick("projects", "projects:"), drives = pick("drives", "drives:"), socials = pick("socials", "socials:"), repos = pick("repos", "repos:");
    return {
      profile: profile.v, projects: projects.v || [], drives: drives.v || [], socials: socials.v || [], repos: repos.v || [],
      contributions: snap.contributions || null, pinned: snap.pinned || [],
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
    const S = L.summarize({ base: BASE, github: g, usdPer: state.usdPer, sources: srcs.map((s) => ({ id: s.id, label: s.meta.label, data: s.data })) });
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
    t.textContent = `Live · ${state.lastRefresh ? ago(state.lastRefresh.toISOString()) : "–"}`;
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
      [!!(state.snap && state.snap.youtube), "Videos", C.youtube ? (state.snap && state.snap.youtube ? `${state.snap.youtube.videos.length} videos from ${state.snap.youtube.title}` : (state.snap && state.snap.errors && state.snap.errors.youtube) || "Waiting for the next sync") : "Optional: set youtube (channel ID or @handle)"],
      [!!D.gh.contributions, "Contribution heatmap", D.gh.contributions ? `${intFmt(D.gh.contributions.total)} contributions` : "Filled in by the sync Action"],
      [!!C.timezone, "Local-time widget", C.timezone || "Optional: set timezone"],
      [!!C.discordServerId, "Discord widget", C.discordServerId ? (state.discordErr ? `Error: ${state.discordErr}` : "Connected") : "Optional: set discordServerId"],
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
        CONFIGURED.length ? el("a", { href: "#donate", class: "btn btn-primary" }, "Support my work", icon("arrow")) : null,
        el("a", { href: "#contact", class: "btn btn-ghost" }, "Get in touch")),
    ));

    // Raised
    if (D.parts.length) {
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
    if (D.recurringParts.length) {
      const big = el("div", { class: "big-number mono" });
      tiles.push(tile("tile-recurring", go("#donate", "Recurring support: see platforms"), el("div", { class: "tile-label" }, "Recurring"), el("div", { class: "row baseline" }, big, el("span", { class: "per" }, "/mo")),
        el("div", { class: "tile-sub" }, D.recurringParts.map((x) => `${x.label} ${money(Math.round(x.value))}`).join(" · "))));
      animateNumber(big, "recurring", D.recurring, (v) => money(Math.round(v)));
    }

    // Supporters
    if (D.supporters > 0 || D.leaders.length) {
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
    if (drive || goal) {
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
    if (C.timezone) tiles.push(tile("tile-clock", go("clock", "Switch 12/24-hour time"), el("div", { class: "tile-label" }, "My local time"),
      el("div", { class: "clock mono", id: "clock" }, "--:--"), el("div", { class: "tile-sub", id: "clockSub" })));

    // GitHub
    if (p) {
      const repos = el("span", { class: "mono gh-num" }), fol = el("span", { class: "mono gh-num" });
      tiles.push(tile("tile-github", go("#github", "GitHub: see repositories"), el("div", { class: "tile-label" }, "GitHub"),
        el("div", { class: "gh-stats" }, el("div", {}, repos, el("span", { class: "tile-sub" }, "repos")), el("div", {}, fol, el("span", { class: "tile-sub" }, "followers"))),
        el("a", { class: "tile-sub link-arrow", href: safeUrl(p.url), target: "_blank", rel: "noopener" }, "View profile →")));
      animateNumber(repos, "repos", p.repos || 0, intFmt);
      animateNumber(fol, "followers", p.followers || 0, intFmt);
    }

    // Discord
    if (C.discordServerId) {
      const d = state.discord, invite = safeUrl(C.discordInvite) || safeUrl(d && d.invite) || safeUrl(state.snap && state.snap.discord && state.snap.discord.invite);
      tiles.push(tile("tile-discord", go(invite ? "discord" : "#contact", "Discord community"),
        el("div", { class: "tile-label" }, "Community"),
        el("div", { class: "discord-row" }, el("span", { class: "glyph" }, icon("discord")),
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
    try { clockFmt = clockFmt || new Intl.DateTimeFormat(LOCALE, { timeZone: C.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: clock12 ? "h12" : "h23" }); }
    catch { clock.textContent = "Invalid timezone"; return; }
    const now = new Date();
    const parts = Object.fromEntries(clockFmt.formatToParts(now).map((x) => [x.type, x.value]));
    clock.replaceChildren(`${parts.hour}:${parts.minute}`, el("span", { class: "sec" }, `:${parts.second}${clock12 && parts.dayPeriod ? " " + parts.dayPeriod : ""}`));
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, hour: "numeric", hourCycle: "h23" }).format(now)) % 24;
    const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
    let rel = "";
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
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

    if (!showSection("#projects", list.length > 0)) return;
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
        p.payments.length ? el("button", { class: "btn btn-ghost", onclick: () => { $("#projectModal").close(); tableState.project = p.tag; $("#tableProject").value = p.tag; renderTable(current, true); $("#supporters").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }); } }, "See in ledger") : null),
    ));
    $("#projectModal").showModal();
    if (pct != null) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  }

  /* ───────────── drives & goals ───────────── */
  function renderDrives(D) {
    const list = $("#driveList");
    const order = { live: 0, upcoming: 1, ended: 2 };
    const drives = D.drives.slice().sort((a, b) => order[a.phase] - order[b.phase]);
    if (!showSection("#drives", drives.some((d) => d.phase !== "ended") || D.goals.length > 0)) return;
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
    if (!showSection("#supporters", D.srcs.some((s) => s.data))) return;
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
    const top = D.leaders.slice(0, 6);
    if (!top.length) { ol.replaceChildren(el("li", { class: "board-empty tile-sub" }, CONFIGURED.length ? "No named supporters yet. Anonymous gifts still count toward the totals." : "No donation sources connected yet.")); return; }
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

  /* ───────────── ledger table ───────────── */
  const PAGE = 12;
  const tableState = { shown: PAGE, project: "" };
  function highlight(text, q) {
    const s = String(text || "");
    if (!q) return document.createTextNode(s);
    const f = document.createDocumentFragment(); const lower = s.toLowerCase(); let i = 0, j;
    while ((j = lower.indexOf(q, i)) !== -1) { f.append(s.slice(i, j), el("mark", {}, s.slice(j, j + q.length))); i = j + q.length; }
    f.append(s.slice(i)); return f;
  }
  function syncSelect(sel, options) {
    const v = sel.value;
    sel.replaceChildren(...options.map(([val, label]) => el("option", { value: val }, label)));
    sel.value = options.some(([val]) => val === v) ? v : "";
    sel.closest(".select-wrap").hidden = options.length <= 2;
  }
  function renderTable(D, reset) {
    if (reset) tableState.shown = PAGE;
    const bySource = [...new Set(D.payments.map((p) => p.source))];
    syncSelect($("#tableSource"), [["", "All sources"], ...bySource.map((id) => [id, META[id].label])]);
    syncSelect($("#tableProject"), [["", "All projects"], ...D.projects.filter((p) => p.payments.length).map((p) => [p.tag, p.title])]);
    if (tableState.project) $("#tableProject").value = tableState.project;
    const q = $("#tableSearch").value.trim().toLowerCase();
    const sf = $("#tableSource").value, pf = $("#tableProject").value;
    const projOf = (p) => D.projects.find((x) => p.tags.includes(x.tag));
    const [key, dir] = $("#tableSort").value.split("-");
    const rows = D.payments.filter((p) => {
      if (sf && p.source !== sf) return false;
      if (pf && !p.tags.includes(pf)) return false;
      if (!q) return true;
      const pr = projOf(p);
      return [p.name || "anonymous", p.message, p.sourceLabel, pr && pr.title].some((v) => String(v || "").toLowerCase().includes(q));
    });
    const cmp = { date: (a, b) => String(a.date).localeCompare(String(b.date)), amount: (a, b) => (a.value ?? 0) - (b.value ?? 0), name: (a, b) => (a.name || "~").localeCompare(b.name || "~") }[key];
    rows.sort((a, b) => (dir === "desc" ? -1 : 1) * cmp(a, b));
    const body = $("#tableBody");
    if (!rows.length) {
      body.replaceChildren(el("tr", { class: "no-results" }, el("td", { colspan: "5" }, D.payments.length ? "Nothing matches that search." : CONFIGURED.length ? "No itemised payments from the connected sources yet." : "No donation sources connected yet.")));
    } else {
      body.replaceChildren(...rows.slice(0, tableState.shown).map((p) => {
        const pr = projOf(p);
        const converted = p.currency !== BASE;
        return el("tr", {},
          el("td", { class: "date" }, fmtDate(p.date)),
          el("td", {}, p.name ? highlight(p.name, q) : el("span", { class: "anon" }, highlight("Anonymous", q)),
            p.message ? el("span", { class: "note" }, highlight(p.message, q)) : null),
          el("td", { class: "for" }, pr ? highlight(pr.title, q) : el("span", { class: "muted" }, "General")),
          el("td", { class: "via" }, safeUrl(p.url) ? el("a", { href: safeUrl(p.url), target: "_blank", rel: "noopener", class: "src-link" }, highlight(p.sourceLabel, q), icon("arrow")) : highlight(p.sourceLabel, q)),
          el("td", { class: "num" }, p.value != null ? `${converted ? "≈ " : ""}${money(p.value)}` : money(p.amount, p.currency),
            converted && p.value != null ? el("span", { class: "orig" }, money(p.amount, p.currency)) : null));
      }));
    }
    const sum = rows.reduce((s, p) => s + (p.value || 0), 0);
    $("#tableCount").textContent = rows.length ? `${Math.min(tableState.shown, rows.length)} of ${rows.length} · ${money(sum)}` : "";
    $("#tableMore").hidden = rows.length <= tableState.shown;
  }

  /* ───────────── GitHub section ───────────── */
  function renderGitHub(D) {
    const body = $("#githubBody");
    const g = D.gh, repos = g.repos || [], cal = g.contributions;
    if (!showSection("#github", !!(repos.length || cal || g.pinned.length))) return;
    const parts = [];

    if (cal && cal.weeks && cal.weeks.length) {
      const cell = 11, gap = 3, weeks = cal.weeks.slice(-53);
      const W = weeks.length * (cell + gap), H = 7 * (cell + gap) + 18;
      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "heatmap", role: "img", "aria-label": `${cal.total} contributions in the last year` });
      const mFmt = new Intl.DateTimeFormat(LOCALE, { month: "short" });
      let lastMonth = -1;
      weeks.forEach((w, wi) => {
        const firstDay = w.days[0];
        if (firstDay) { const m = new Date(firstDay.date).getMonth(); if (m !== lastMonth && wi < weeks.length - 2) { const t = svgEl("text", { x: wi * (cell + gap), y: 10, class: "hm-month" }); t.textContent = mFmt.format(new Date(firstDay.date)); svg.append(t); lastMonth = m; } }
        w.days.forEach((d) => {
          const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
          const r = svgEl("rect", { x: wi * (cell + gap), y: 18 + dow * (cell + gap), width: cell, height: cell, rx: 2.5, class: `hm l${d.level}`, tabindex: "-1" });
          r.addEventListener("pointerenter", () => { const b = r.getBoundingClientRect(); showTip(b.left + b.width / 2, b.top, `${d.count} contribution${d.count === 1 ? "" : "s"}`, fmtDate(d.date + "T12:00:00Z")); });
          r.addEventListener("pointerleave", hideTip);
          svg.append(r);
        });
      });
      parts.push(el("article", { class: `card gh-heat${entering("gh-heat")}` },
        el("div", { class: "card-head" },
          el("div", {}, el("div", { class: "tile-label" }, "Contributions · last year"), el("div", { class: "chart-total mono" }, intFmt(cal.total))),
          el("div", { class: "hm-legend tile-sub" }, "Less", [0, 1, 2, 3, 4].map((l) => el("i", { class: `l${l}` })), "More")),
        el("div", { class: "heat-scroll" }, svg)));
    }

    const langs = {};
    for (const r of repos) if (r.language && !r.archived) langs[r.language] = (langs[r.language] || 0) + 1;
    const langList = Object.entries(langs).sort((a, b) => b[1] - a[1]);
    const totalL = langList.reduce((t, [, n]) => t + n, 0);
    const stars = repos.reduce((t, r) => t + (r.stars || 0), 0);
    const stats = el("article", { class: `card gh-stats-card${entering("gh-stats")}` },
      el("div", { class: "tile-label" }, "At a glance"),
      el("dl", { class: "pstats big" },
        el("div", {}, el("dt", {}, "Public repos"), el("dd", { class: "mono" }, intFmt(g.profile ? g.profile.repos : repos.length))),
        el("div", {}, el("dt", {}, "Stars earned"), el("dd", { class: "mono" }, intFmt(stars))),
        el("div", {}, el("dt", {}, "Followers"), el("dd", { class: "mono" }, intFmt(g.profile ? g.profile.followers : 0)))),
      langList.length ? el("div", { class: "lang-bar", role: "img", "aria-label": "Languages by repository count" }, langList.slice(0, 6).map(([n, c], i) => el("i", { style: `flex:${c};--o:${1 - i * 0.14}`, title: `${n} · ${c} repo${c === 1 ? "" : "s"}` }))) : null,
      langList.length ? el("ul", { class: "lang-list" }, langList.slice(0, 6).map(([n, c], i) => el("li", {}, el("span", { class: "lang-dot", style: `--o:${1 - i * 0.14}` }), n, el("span", { class: "muted mono" }, `${Math.round((c / totalL) * 100)}%`)))) : null);

    const featured = g.pinned.length ? g.pinned : repos.filter((r) => !r.archived).slice().sort((a, b) => (b.stars - a.stars) || b.pushedAt.localeCompare(a.pushedAt)).slice(0, 6);
    const repoCards = featured.map((r) => el("a", { class: `card repo clickable${entering("repo" + r.name)}`, href: safeUrl(r.url), target: "_blank", rel: "noopener" },
      el("div", { class: "repo-top" }, el("span", { class: "glyph sm" }, icon("folder")), el("span", { class: "tile-sub mono" }, r.pushedAt ? ago(r.pushedAt) : "")),
      el("h3", { class: "mono" }, r.name),
      r.description ? el("p", {}, r.description) : el("p", { class: "muted" }, "No description"),
      el("div", { class: "repo-meta tile-sub" },
        r.language ? el("span", {}, el("span", { class: "lang-dot" }), r.language) : null,
        el("span", {}, "★ ", intFmt(r.stars || 0)),
        r.forks ? el("span", {}, "⑂ ", intFmt(r.forks)) : null)));

    const recent = repos.slice().sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).slice(0, 5);
    const activity = recent.length ? el("article", { class: `card gh-recent${entering("gh-recent")}` },
      el("div", { class: "tile-label" }, "Recently pushed"),
      el("ul", { class: "recent-list" }, recent.map((r) => el("li", {}, el("a", { href: safeUrl(r.url), target: "_blank", rel: "noopener" },
        el("span", { class: "mono" }, r.name), el("span", { class: "tile-sub" }, ago(r.pushedAt))))))) : null;

    body.replaceChildren(...parts,
      el("div", { class: "gh-row" }, stats, activity),
      repoCards.length ? el("div", { class: "tile-label gh-sub" }, g.pinned.length ? "Pinned" : "Top repositories") : null,
      repoCards.length ? el("div", { class: "repo-grid" }, repoCards) : null);
  }

  /* ───────────── Videos ───────────── */
  function renderVideos() {
    const body = $("#videosBody");
    const yt = state.snap && state.snap.youtube;
    const vids = (yt && yt.videos) || [];
    if (!showSection("#videos", vids.length > 0)) return;
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
      yt.url ? el("a", { class: "btn btn-ghost", href: safeUrl(yt.url), target: "_blank", rel: "noopener" }, "Open channel", icon("arrow")) : null);
  }
  const svgPlay = () => { const s = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }); s.innerHTML = '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>'; return s; };
  const navLink = (href) => $(`#nav a[href="${href}"]`) || document.createElement("a");
  // Sections with nothing real to show are removed (with their nav link), never padded with placeholders.
  const showSection = (id, show) => { const sec = $(id); if (sec) sec.hidden = !show; navLink(id).hidden = !show; return show; };

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
    if (!showSection("#donate", D.srcs.length > 0)) return;
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
  const PROVIDERS = { twitter: "X", linkedin: "LinkedIn", youtube: "YouTube", instagram: "Instagram", mastodon: "Mastodon", bluesky: "Bluesky", reddit: "Reddit", twitch: "Twitch", facebook: "Facebook", npm: "npm", hometown: "Website" };
  function socialList(D) {
    const p = D.gh.profile; const seen = new Set(); const out = [];
    const push = (name, handle, url) => { const u = safeUrl(url); if (!u || seen.has(u.replace(/\/$/, ""))) return; seen.add(u.replace(/\/$/, "")); out.push({ name, handle, url: u }); };
    if (p) push("GitHub", `@${p.login}`, p.url);
    for (const s of D.gh.socials) {
      let host = ""; try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch {}
      const handle = (() => { try { const u = new URL(s.url); return u.pathname.replace(/^\/|\/$/g, "") || host; } catch { return s.url; } })();
      push(PROVIDERS[s.provider] || host || s.provider, handle.startsWith("@") || s.provider === "linkedin" ? handle : `@${handle.split("/").pop()}`, s.url);
    }
    if (p && p.twitter) push("X", `@${p.twitter}`, `https://x.com/${p.twitter}`);
    if (p && p.blog) push("Website", p.blog.replace(/^https?:\/\//, "").replace(/\/$/, ""), /^https?:/.test(p.blog) ? p.blog : `https://${p.blog}`);
    return out;
  }
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
    if (C.discordServerId) {
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
        el("span", { class: "sname" }, s.name), el("span", { class: "shandle" }, s.handle, icon("arrow"))))))));
    grid.dataset.count = String(cards.length);
    if (!showSection("#contact", cards.length > 0 || !state.booted)) return;
    grid.replaceChildren(...cards);
  }

  /* ───────────── footer ───────────── */
  function renderFooter(D) {
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
  const effectiveTheme = () => document.documentElement.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem("ledger-theme", next); } catch {} };
    if (document.startViewTransition && !REDUCED) document.startViewTransition(apply); else apply();
  }
  $("#themeToggle").addEventListener("click", toggleTheme);

  /* ───────────── command palette ───────────── */
  function paletteItems() {
    const D = current || derive();
    const go = (id) => () => $(id).scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
    const email = C.email || (D.gh.profile && D.gh.profile.email);
    return [
      ...[["#overview", "Overview"], ["#projects", "Projects"], ["#drives", "Drives & goals"], ["#supporters", "Supporters & ledger"], ["#videos", "Videos"], ["#github", "GitHub"], ["#donate", "Ways to support"], ["#contact", "Contact"]].filter(([id]) => !$(id).hidden).map(([id, label]) => ({ group: "Sections", label, sub: id, ic: "hash", run: go(id) })),
      ...D.projects.map((p) => ({ group: "Projects", label: p.title, sub: p.goal ? `${money(p.raised)} / ${money(p.goal)}` : `#${p.number}`, ic: "folder", run: () => openProject(p.number) })),
      ...D.srcs.map((s) => s.meta.address
        ? { group: "Donate", label: `Copy ${s.meta.label} address`, sub: SRC[s.id], ic: "copy", run: () => copy(SRC[s.id], `${s.meta.label} address copied`) }
        : { group: "Donate", label: s.meta.label, sub: s.meta.handle ? s.meta.handle(SRC[s.id]) : "", ic: s.meta.icon, run: () => window.open(safeUrl(s.meta.link(SRC[s.id])), "_blank", "noopener") }),
      ...socialList(D).map((s) => ({ group: "Socials", label: s.name, sub: s.handle, ic: "at", run: () => window.open(s.url, "_blank", "noopener") })),
      { group: "Actions", label: "Refresh live data", sub: "now", ic: "refresh", run: () => refresh(true) },
      { group: "Actions", label: "Toggle light / dark", sub: "theme", ic: "sun", run: toggleTheme },
      email ? { group: "Actions", label: "Copy email address", sub: email, ic: "copy", run: () => copy(email, "Email copied") } : null,
    ].filter(Boolean);
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
    palView = palAll.map((it) => ({ it, s: Math.max(fuzzy(q, it.label), fuzzy(q, it.sub) - 50, fuzzy(q, it.group) - 100) })).filter((x) => x.s >= 0).sort((a, b) => (q ? b.s - a.s : 0)).map((x) => x.it);
    palSel = Math.min(palSel, Math.max(0, palView.length - 1));
    palList.replaceChildren();
    if (!palView.length) { palList.append(el("li", { class: "palette-empty" }, "No results")); return; }
    let lastGroup = null;
    palView.forEach((it, i) => {
      if (!q && it.group !== lastGroup) { palList.append(el("li", { class: "palette-group", role: "presentation" }, it.group)); lastGroup = it.group; }
      palList.append(el("li", { class: "palette-item", role: "option", "aria-selected": String(i === palSel), "data-i": i, onpointermove: () => { if (palSel !== i) { palSel = i; markSel(); } }, onclick: () => runPal(i) },
        el("span", { class: "pi-ic" }, icon(it.ic)), el("span", {}, it.label), it.sub ? el("span", { class: "pi-sub" }, it.sub) : null));
    });
  }
  function markSel() { $$(".palette-item", palList).forEach((n) => n.setAttribute("aria-selected", String(Number(n.dataset.i) === palSel))); const cur = $(`.palette-item[data-i="${palSel}"]`, palList); if (cur) cur.scrollIntoView({ block: "nearest" }); }
  function runPal(i) { const it = palView[i]; if (!it) return; pal.close(); setTimeout(it.run, 10); }
  function openPalette() { if (pal.open) return; palAll = paletteItems(); palInput.value = ""; palSel = 0; renderPalette(); pal.showModal(); palInput.focus(); }
  palInput.addEventListener("input", () => { palSel = 0; renderPalette(); });
  palInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = (palSel - 1 + palView.length) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "Enter") { e.preventDefault(); runPal(palSel); }
  });
  $("#openPalette").addEventListener("click", openPalette);
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $("#kbdHint").textContent = "Ctrl K";
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.open ? pal.close() : openPalette(); }
    else if (e.key === "/" && !typing && !pal.open) { e.preventDefault(); openPalette(); }
  });
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }));

  /* ───────────── nav, reveal, spotlight ───────────── */
  function setupNav() {
    const links = $$("#nav a"), ind = $("#navIndicator"), bar = $("#topbar");
    const move = (a) => { links.forEach((l) => l.classList.toggle("active", l === a)); if (!a) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.width = `${a.offsetWidth}px`; ind.style.transform = `translateX(${a.offsetLeft}px)`; };
    const spy = () => {
      const sections = links.filter((l) => !l.hidden).map((l) => $(l.getAttribute("href"))).filter((x) => x && !x.hidden);
      if (!sections.length) return;
      bar.classList.toggle("scrolled", window.scrollY > 4);
      const y = window.scrollY + window.innerHeight * 0.3; let cur = sections[0];
      for (const s of sections) if (s.offsetTop <= y) cur = s;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = sections[sections.length - 1];
      move(links.find((l) => l.getAttribute("href") === `#${cur.id}`));
    };
    let raf; window.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
    window.addEventListener("resize", spy); if (document.fonts) document.fonts.ready.then(spy); spy();
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
  let searchT;
  $("#tableSearch").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(() => renderTable(current, true), 120); });
  $("#tableSource").addEventListener("change", () => renderTable(current, true));
  $("#tableProject").addEventListener("change", () => { tableState.project = $("#tableProject").value; renderTable(current, true); });
  $("#tableSort").addEventListener("change", () => renderTable(current, true));
  $("#tableMore").addEventListener("click", () => { tableState.shown += PAGE; renderTable(current, false); });
  $("#livePill").addEventListener("click", () => refresh(true));

  /* ───────────── render + refresh loop ───────────── */
  let current = null;
  function renderAll() {
    current = derive();
    const D = current;
    const p = D.gh.profile;
    if (p) { $("#brandName").textContent = p.name; document.title = `${p.name} · Ledger`; }
    renderSetup(D); renderBento(D); renderProjects(D); renderDrives(D); renderChart(D); renderBoard(D); renderTable(D, false); renderVideos(); renderGitHub(D); renderPlatforms(D); renderContact(D); renderFooter(D); renderLivePill();
    // Number the visible sections 01, 02, … so hidden ones leave no gaps.
    $$("main > section:not([hidden]) .eyebrow").forEach((e, i) => { e.textContent = String(i + 1).padStart(2, "0"); });
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
