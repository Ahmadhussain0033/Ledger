/* Ledger: renders everything from window.LEDGER (data.js). No build step. */
(() => {
  "use strict";

  const D = window.LEDGER || {};
  const profile = D.profile || {};
  const contacts = D.contacts || {};
  const projects = Array.isArray(D.projects) ? D.projects : [];
  const drives = Array.isArray(D.drives) ? D.drives : [];
  const platforms = Array.isArray(D.platforms) ? D.platforms : [];
  const contributions = (Array.isArray(D.contributions) ? D.contributions : [])
    .filter((c) => c && Number.isFinite(Number(c.amount)) && c.date)
    .map((c, i) => ({ ...c, amount: Number(c.amount), _i: i, _anon: !!c.anonymous || !String(c.name || "").trim() }));
  const LOCALE = D.locale || "en-US";
  const CURRENCY = D.currency || "USD";

  /* ───────────── helpers ───────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const moneyFmt = (max) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: max });
  const money0 = moneyFmt(0);
  const money2 = moneyFmt(2);
  const money = (n) => (Number.isInteger(n) ? money0 : money2).format(n);
  const compactMoney = (n) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, notation: "compact", maximumFractionDigits: 1 }).format(n);

  const parseDate = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const dShort = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" });
  const fmtDate = (s) => dShort.format(parseDate(s));
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v; // ONLY used with constant icon strings below
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "style") n.style.cssText = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  }
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    return n;
  };
  const safeUrl = (u) => {
    if (!u) return "";
    try { const url = new URL(u, location.href); return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : ""; }
    catch { return ""; }
  };
  const initials = (name) => String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  // Constant inline icon set (never built from data)
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
  };
  const icon = (name, cls = "i") => {
    const s = svgEl("svg", { viewBox: "0 0 24 24", class: cls, "aria-hidden": "true" });
    s.innerHTML = ICONS[name] || ICONS.link;
    return s;
  };

  /* ───────────── derived data ───────────── */
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const projectTitle = (id) => (id && projectById[id] ? projectById[id].title : "General support");
  const contribTotal = contributions.reduce((s, c) => s + c.amount, 0);
  const externalTotal = projects.reduce((s, p) => s + (Number(p.raisedExternal) || 0), 0);
  const grandTotal = contribTotal + externalTotal;

  const projectRaised = (p) =>
    contributions.filter((c) => c.project === p.id).reduce((s, c) => s + c.amount, 0) + (Number(p.raisedExternal) || 0);

  const driveRaised = (d) => {
    const a = parseDate(d.start), b = parseDate(d.end);
    return contributions
      .filter((c) => { const t = parseDate(c.date); return t >= a && t <= b && (!d.project || c.project === d.project); })
      .reduce((s, c) => s + c.amount, 0);
  };
  const driveState = (d) => {
    const now = new Date();
    const start = parseDate(d.start);
    const end = parseDate(d.end); end.setHours(23, 59, 59, 999);
    if (now < start) return { state: "upcoming", target: start };
    if (now <= end) return { state: "live", target: end };
    return { state: "ended", target: end };
  };
  const currentDrive = () =>
    drives.find((d) => driveState(d).state === "live") ||
    drives.filter((d) => driveState(d).state === "upcoming").sort((a, b) => parseDate(a.start) - parseDate(b.start))[0] ||
    drives.slice().sort((a, b) => parseDate(b.end) - parseDate(a.end))[0];

  // Supporters aggregated by case-insensitive name; anonymous excluded from named list
  const supporters = (() => {
    const m = new Map();
    for (const c of contributions) {
      if (c._anon) continue;
      const key = c.name.trim().toLowerCase();
      const s = m.get(key) || { name: c.name.trim(), total: 0, count: 0, last: c.date };
      s.total += c.amount; s.count += 1; if (c.date > s.last) s.last = c.date;
      m.set(key, s);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  })();
  const anonCount = contributions.filter((c) => c._anon).length;

  /* ───────────── text bindings ───────────── */
  $$("[data-bind]").forEach((n) => {
    const v = get(D, n.dataset.bind);
    if (v == null || v === "") { if (n.dataset.bind !== "profile.name") n.hidden = true; return; }
    n.textContent = v;
  });
  if (profile.name) document.title = `${profile.name} · Ledger`;
  if (!profile.location) { const h = $(".profile-handle"); if (h) h.textContent = profile.handle ? `@${profile.handle}` : ""; }
  if (D.demo) $("#demoPill").hidden = false;

  const av = $("#avatar");
  if (profile.avatar && safeUrl(profile.avatar)) av.style.backgroundImage = `url("${safeUrl(profile.avatar).replace(/"/g, "%22")}")`;
  else av.textContent = initials(profile.name);

  /* ───────────── count-up ───────────── */
  function countUp(node, to, format) {
    if (REDUCED) { node.textContent = format(to); return; }
    const dur = 1300, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 4);
      node.textContent = format(k === 1 ? to : Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const onVisible = (node, fn) => {
    if (!("IntersectionObserver" in window)) return fn();
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { threshold: 0.3 });
    io.observe(node);
  };

  /* ───────────── bento ───────────── */
  function renderBento() {
    const tot = $("#statTotal");
    onVisible(tot, () => countUp(tot, grandTotal, (v) => money0.format(v)));
    $("#statTotalSub").textContent = `across ${contributions.length} contribution${contributions.length === 1 ? "" : "s"}` +
      (externalTotal ? ` + ${money(externalTotal)} external` : "");

    // Sparkline: cumulative total over the last 12 months
    const sp = $("#sparkline");
    const months = monthSeries(12);
    let run = contributions.filter((c) => parseDate(c.date) < months[0].date).reduce((s, c) => s + c.amount, 0);
    const pts = months.map((m) => (run += m.total));
    const max = Math.max(...pts, 1), min = Math.min(...pts);
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * 200, 44 - ((v - min) / (max - min || 1)) * 40]);
    const dLine = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    sp.append(svgEl("path", { class: "area", d: `${dLine}L200,48L0,48Z` }));
    const line = svgEl("path", { class: "line", d: dLine });
    sp.append(line);
    if (!REDUCED) {
      const len = 400;
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      onVisible(sp, () => { line.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)"; line.style.strokeDashoffset = 0; });
    }

    // Supporters
    const sup = $("#statSupporters");
    onVisible(sup, () => countUp(sup, supporters.length, (v) => String(v)));
    const stack = $("#avatarStack");
    supporters.slice(0, 5).forEach((s, i) => stack.append(el("span", { title: s.name, style: `--n:${i}` }, initials(s.name))));
    if (supporters.length > 5) stack.append(el("span", { style: "--n:5" }, `+${supporters.length - 5}`));
    if (anonCount) stack.after(el("div", { class: "tile-sub", style: "margin-top:8px" }, `+ ${anonCount} anonymous gift${anonCount === 1 ? "" : "s"}`));

    // Drive ring
    const d = currentDrive();
    if (!d) { $("#tileDrive").querySelector(".ring-wrap").style.opacity = ".4"; }
    else {
      const raised = driveRaised(d), pct = d.goal ? Math.min(1, raised / d.goal) : 0;
      $("#tileDriveTitle").textContent = d.title;
      const meta = $("#tileDrive .tile-drive-meta");
      meta.insertBefore(el("div", { class: "drive-mini-bar mono" }, `${money(raised)} of ${money(d.goal)}`), $("#tileDriveCountdown"));
      const C = 2 * Math.PI * 52;
      const ring = $("#ringFill");
      onVisible(ring, () => { ring.style.strokeDashoffset = String(C * (1 - pct)); countUp($("#ringPct"), Math.round(pct * 100), (v) => `${v}%`); });
      const cd = $("#tileDriveCountdown");
      const tick = () => {
        const st = driveState(d);
        const ms = st.target - new Date();
        cd.textContent = st.state === "ended" ? `Ended ${fmtDate(d.end)}` : `${st.state === "live" ? "Ends" : "Starts"} in ${humanSpan(ms)}`;
      };
      tick(); setInterval(tick, 1000);
      $("#tileDrive").classList.add("clickable");
      $("#tileDrive").addEventListener("click", () => $("#drives").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }));
    }

    // Clock
    renderClock();

    // Discord
    const dc = contacts.discord;
    if (!dc || (!dc.invite && !dc.serverId)) { $("#tileDiscord").remove(); $("#discordCard").remove(); }
    else {
      const inv = safeUrl(dc.invite);
      $("#discordName").textContent = dc.name || "Discord";
      $("#discordName2").textContent = dc.name || "Discord";
      $("#discordOnline2").textContent = "Hang out, ask questions, follow progress.";
      [$("#discordJoin"), $("#discordJoin2")].forEach((a) => { if (inv) a.href = inv; else a.hidden = true; });
      if (dc.serverId) loadDiscord(dc);
    }

    // GitHub
    if (!contacts.github) $("#tileGithub").remove();
    else {
      const u = encodeURIComponent(contacts.github);
      $("#ghLink").href = `https://github.com/${u}`;
      fetch(`https://api.github.com/users/${u}`, { headers: { Accept: "application/vnd.github+json" } })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j) => {
          countUp($("#ghRepos"), Number(j.public_repos) || 0, String);
          countUp($("#ghFollowers"), Number(j.followers) || 0, String);
        })
        .catch(() => { $("#ghRepos").textContent = "–"; $("#ghFollowers").textContent = "–"; });
    }
  }

  function humanSpan(ms) {
    ms = Math.max(0, ms);
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  }

  function renderClock() {
    const tz = profile.timezone;
    let fmt;
    try { fmt = new Intl.DateTimeFormat(LOCALE, { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
    catch { fmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
    const clock = $("#clock"), sub = $("#clockSub");
    const hm = el("span"), sec = el("span", { class: "sec" });
    clock.replaceChildren(hm, sec);
    const offsetMin = (date, zone) => {
      try {
        const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          .formatToParts(date).map((x) => [x.type, x.value]));
        return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes())) / 6e4;
      } catch { return null; }
    };
    const tick = () => {
      const now = new Date();
      const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
      hm.textContent = `${parts.hour}:${parts.minute}`;
      sec.textContent = `:${parts.second}`;
      const h = Number(parts.hour) % 24;
      const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
      let rel = "";
      if (tz) {
        const theirs = offsetMin(now, tz), mine = -now.getTimezoneOffset();
        if (theirs != null) {
          const diff = (theirs - mine) / 60;
          rel = diff === 0 ? "same time as you" : `${Math.abs(diff)}h ${diff > 0 ? "ahead of" : "behind"} you`;
        }
      }
      sub.textContent = [part, rel].filter(Boolean).join(" · ");
    };
    tick(); setInterval(tick, 1000);
  }

  function loadDiscord(dc) {
    fetch(`https://discord.com/api/guilds/${encodeURIComponent(dc.serverId)}/widget.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        const n = Number(j.presence_count) || 0;
        const line = () => { const f = document.createDocumentFragment(); f.append(el("span", { class: "online-dot" }), `${n} online now`); return f; };
        $("#discordOnline").replaceChildren(line());
        $("#discordOnline2").replaceChildren(line());
        if (j.name && !dc.name) { $("#discordName").textContent = j.name; $("#discordName2").textContent = j.name; }
        const inv = safeUrl(dc.invite) || safeUrl(j.instant_invite);
        if (inv) [$("#discordJoin"), $("#discordJoin2")].forEach((a) => { a.href = inv; a.hidden = false; });
        const box = $("#discordMembers");
        (j.members || []).slice(0, 10).forEach((m) => box.append(el("span", {}, String(m.username || "member"))));
      })
      .catch(() => { /* widget disabled or offline: keep the static card */ });
  }

  /* ───────────── projects ───────────── */
  const STATUS_LABEL = { active: "Active", planned: "Planned", funded: "Funded", paused: "Paused" };

  function renderProjects() {
    const grid = $("#projectGrid");
    if (!projects.length) { grid.append(el("div", { class: "empty" }, "No projects yet. Add some in data.js.")); return; }
    const order = { active: 0, planned: 1, paused: 2, funded: 3 };
    projects.slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)).forEach((p) => {
      const raised = projectRaised(p), goal = Number(p.goal) || 0;
      const pct = goal ? Math.min(100, (raised / goal) * 100) : 0;
      const fill = el("i");
      const card = el("article", {
        class: "card project clickable reveal", tabindex: "0", role: "button", "data-status": p.status || "active",
        "aria-label": `${p.title}: ${money(raised)} of ${money(goal)}`,
        onclick: () => openProject(p),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProject(p); } },
      },
        el("div", { class: "project-top" },
          el("span", { class: "badge", "data-s": p.status || "active" }, STATUS_LABEL[p.status] || p.status || "Active"),
          el("span", { class: "arrow-hint" }, "Details", icon("arrow"))),
        el("h3", {}, p.title),
        p.summary ? el("p", {}, p.summary) : null,
        p.tags && p.tags.length ? el("div", { class: "tags" }, p.tags.map((t) => el("span", { class: "tag" }, t))) : null,
        el("div", { class: "progress" },
          el("div", { class: "progress-nums" },
            el("span", {}, el("strong", { class: "mono" }, money(raised)), el("span", { class: "muted" }, ` / ${money(goal)}`)),
            el("span", { class: "mono muted" }, `${Math.round(pct)}%`)),
          el("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) }, fill)),
      );
      grid.append(card);
      onVisible(card, () => { fill.style.width = `${pct}%`; });
    });

    segmented($("#projectFilter"), (f) => {
      $$(".project", grid).forEach((c) => c.classList.toggle("hide", f !== "all" && c.dataset.status !== f));
    });
  }

  function openProject(p) {
    const raised = projectRaised(p), goal = Number(p.goal) || 0;
    const pct = goal ? Math.min(100, (raised / goal) * 100) : 0;
    const list = contributions.filter((c) => c.project === p.id).sort((a, b) => b.date.localeCompare(a.date));
    const backers = new Set(list.filter((c) => !c._anon).map((c) => c.name.trim().toLowerCase())).size;
    const fill = el("i");
    const link = safeUrl(p.link);
    const body = el("div", {},
      el("span", { class: "badge", "data-s": p.status || "active" }, STATUS_LABEL[p.status] || p.status || "Active"),
      el("h3", { class: "pm-title", id: "pmTitle" }, p.title),
      el("p", { class: "pm-details" }, p.details || p.summary || ""),
      el("div", { class: "bar thick" }, fill),
      el("div", { class: "pm-stats" },
        el("div", { class: "pm-stat" }, el("b", {}, money(raised)), el("span", {}, "raised")),
        el("div", { class: "pm-stat" }, el("b", {}, money(Math.max(0, goal - raised))), el("span", {}, "still needed")),
        el("div", { class: "pm-stat" }, el("b", {}, String(backers)), el("span", {}, `named backer${backers === 1 ? "" : "s"}`))),
      list.length ? el("div", { class: "tile-label" }, "Contributions") : null,
      list.length ? el("ul", { class: "pm-list" }, list.slice(0, 8).map((c) =>
        el("li", {}, el("span", {}, c._anon ? "Anonymous" : c.name, el("span", { class: "muted" }, ` · ${fmtDate(c.date)}`)), el("span", {}, money(c.amount))))) : null,
      list.length > 8 ? el("p", { class: "tile-sub", style: "margin:-12px 0 16px" }, `+ ${list.length - 8} more in the ledger below`) : null,
      p.updated ? el("p", { class: "tile-sub", style: "margin-bottom:16px" }, `Last updated ${fmtDate(p.updated)}`) : null,
      el("div", { class: "pm-actions" },
        p.status !== "funded" ? el("a", { class: "btn btn-primary", href: "#donate", onclick: () => $("#projectModal").close() }, "Support this", icon("arrow")) : null,
        link ? el("a", { class: "btn btn-ghost", href: link, target: "_blank", rel: "noopener" }, "Project link", icon("arrow")) : null,
        el("button", { class: "btn btn-ghost", onclick: () => { $("#projectModal").close(); $("#tableProject").value = p.id; renderTable(true); $("#supporters").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }); } }, "See in ledger")),
    );
    $("#pmBody").replaceChildren(body);
    const m = $("#projectModal");
    m.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; }));
  }

  /* ───────────── drives ───────────── */
  function renderDrives() {
    const list = $("#driveList");
    if (!drives.length) { list.append(el("div", { class: "empty" }, "No funding drives right now.")); return; }
    const rank = { live: 0, upcoming: 1, ended: 2 };
    drives.slice().sort((a, b) => rank[driveState(a).state] - rank[driveState(b).state]).forEach((d) => {
      const raised = driveRaised(d), goal = Number(d.goal) || 0;
      const pct = goal ? Math.min(100, (raised / goal) * 100) : 0;
      const st = driveState(d);
      const fill = el("i");
      const nums = ["days", "hours", "min", "sec"].map((l) => { const n = el("span", { class: "cd-num mono" }, "00"); return { n, box: el("div", { class: "cd-box" }, n, el("span", { class: "cd-lab" }, l)) }; });
      const stateLine = el("div", { class: "drive-state" });
      const link = safeUrl(d.link);
      const card = el("article", { class: "card drive reveal" },
        el("div", {},
          el("span", { class: "badge", "data-s": st.state === "live" ? "active" : st.state === "ended" ? "funded" : "planned" },
            st.state === "live" ? "Live" : st.state === "upcoming" ? "Upcoming" : "Ended"),
          el("h3", {}, d.title),
          d.description ? el("p", {}, d.description) : null,
          d.project && projectById[d.project] ? el("p", { class: "tile-sub", style: "margin-top:6px" }, `Funds → ${projectById[d.project].title}`) : null,
          el("div", { class: "drive-progress" },
            el("div", { class: "progress-nums" },
              el("span", {}, el("strong", { class: "mono" }, money(raised)), el("span", { class: "muted" }, ` of ${money(goal)}`)),
              el("span", { class: "mono muted" }, `${Math.round(pct)}%`)),
            el("div", { class: "bar thick" }, fill),
            el("div", { class: "drive-dates mono" }, el("span", {}, fmtDate(d.start)), el("span", {}, fmtDate(d.end))))),
        el("div", { class: "drive-side" },
          el("div", { class: "countdown" }, nums.map((x) => x.box)),
          stateLine,
          st.state !== "ended" ? el("a", { class: "btn btn-primary", href: link || "#donate", ...(link ? { target: "_blank", rel: "noopener" } : {}) }, "Contribute to this drive", icon("arrow")) : null),
      );
      list.append(card);
      onVisible(card, () => { fill.style.width = `${pct}%`; });
      const tick = () => {
        const s = driveState(d);
        const ms = Math.max(0, s.target - new Date());
        const v = [Math.floor(ms / 864e5), Math.floor((ms % 864e5) / 36e5), Math.floor((ms % 36e5) / 6e4), Math.floor((ms % 6e4) / 1e3)];
        nums.forEach((x, i) => { const t = String(v[i]).padStart(2, "0"); if (x.n.textContent !== t) x.n.textContent = t; });
        stateLine.textContent = s.state === "live" ? `until ${fmtDate(d.end)}` : s.state === "upcoming" ? `until it opens on ${fmtDate(d.start)}` : `Closed on ${fmtDate(d.end)}${raised >= goal ? " · goal reached" : ""}`;
      };
      tick(); if (st.state !== "ended") setInterval(tick, 1000);
    });
  }

  /* ───────────── chart ───────────── */
  function monthSeries(n) {
    const t = today();
    let start;
    if (n === "all") {
      const first = contributions.reduce((m, c) => (c.date < m ? c.date : m), monthKey(t) + "-01");
      const fd = parseDate(first);
      start = new Date(fd.getFullYear(), fd.getMonth(), 1);
    } else start = new Date(t.getFullYear(), t.getMonth() - (n - 1), 1);
    const out = [];
    for (let d = new Date(start); d <= t; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ key: monthKey(d), date: new Date(d), total: 0, count: 0 });
    const idx = Object.fromEntries(out.map((m, i) => [m.key, i]));
    for (const c of contributions) { const i = idx[c.date.slice(0, 7)]; if (i != null) { out[i].total += c.amount; out[i].count += 1; } }
    return out;
  }
  const niceMax = (v) => { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

  let chartRange = 12;
  function renderChart() {
    const host = $("#chart");
    const data = monthSeries(chartRange);
    const W = host.clientWidth || 600, H = host.clientHeight || 220;
    const padL = 44, padR = 4, padT = 16, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const max = niceMax(Math.max(...data.map((d) => d.total), 0));
    const y = (v) => padT + ih - (v / max) * ih;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Monthly contributions bar chart" });

    const grid = svgEl("g", { class: "grid" }), axis = svgEl("g", { class: "axis" });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = Math.round(y(v)) + 0.5;
      grid.append(svgEl("line", { x1: padL, x2: W - padR, y1: yy, y2: yy }));
      const t = svgEl("text", { x: padL - 8, y: yy + 3.5, "text-anchor": "end" }); t.textContent = compactMoney(v); axis.append(t);
    }
    svg.append(grid, axis);

    const slot = iw / data.length;
    const bw = Math.max(4, Math.min(36, slot - Math.max(2, slot * 0.35)));
    const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));
    const mFmt = new Intl.DateTimeFormat(LOCALE, { month: "short" });
    const mFull = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
    const bars = svgEl("g", { class: "bars" });
    const maxIdx = data.reduce((bi, d, i) => (d.total > data[bi].total ? i : bi), 0);

    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2, x = cx - bw / 2;
      const h = d.total ? Math.max(3, padT + ih - y(d.total)) : 2;
      const top = padT + ih - h, r = Math.min(4, bw / 2, h);
      const hit = svgEl("rect", { class: "hit", x: padL + slot * i, y: padT, width: slot, height: ih, tabindex: "0", "aria-label": `${mFull.format(d.date)}: ${money(d.total)}` });
      const path = svgEl("path", {
        class: `bar-mark${d.total ? "" : " zero"}`,
        d: `M${x},${padT + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${padT + ih}Z`,
      });
      if (!REDUCED) { path.style.transformOrigin = `${cx}px ${padT + ih}px`; path.style.transform = "scaleY(0)"; path.style.transition = `transform .8s cubic-bezier(.2,.8,.2,1) ${i * 30}ms, opacity .2s`; }
      const show = () => {
        const b = hit.getBoundingClientRect();
        showTip(b.left + b.width / 2, host.getBoundingClientRect().top + (top / H) * host.clientHeight,
          money(d.total), `${mFull.format(d.date)} · ${d.count} gift${d.count === 1 ? "" : "s"}`);
      };
      hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", hideTip); hit.addEventListener("blur", hideTip);
      bars.append(hit, path);
      if ((data.length - 1 - i) % every === 0) { // anchor labels on the current month
        const t = svgEl("text", { x: cx, y: H - 6, "text-anchor": "middle" }); t.textContent = mFmt.format(d.date); axis.append(t);
      }
    });
    svg.append(bars);
    // Direct label only on the peak month (selective labeling)
    if (data[maxIdx].total > 0) {
      const d = data[maxIdx], cx = padL + slot * maxIdx + slot / 2;
      const t = svgEl("text", { class: "bar-label", x: cx, y: y(d.total) - 6 }); t.textContent = compactMoney(d.total); svg.append(t);
    }
    host.replaceChildren(svg);
    if (!REDUCED) requestAnimationFrame(() => requestAnimationFrame(() => $$(".bar-mark", svg).forEach((p) => (p.style.transform = "scaleY(1)"))));
    $("#chartTotal").textContent = money(data.reduce((s, d) => s + d.total, 0));
  }

  const tip = $("#tooltip");
  function showTip(x, y, strong, sub) {
    tip.replaceChildren(el("b", {}, strong), el("span", {}, sub));
    tip.style.left = `${Math.min(window.innerWidth - 90, Math.max(90, x))}px`;
    tip.style.top = `${y}px`;
    tip.classList.add("show");
  }
  function hideTip() { tip.classList.remove("show"); }

  /* ───────────── leaderboard ───────────── */
  function renderBoard() {
    const ol = $("#board");
    const top = supporters.slice(0, 6);
    if (!top.length) { ol.append(el("li", { class: "tile-sub" }, "No named supporters yet.")); return; }
    const max = top[0].total;
    top.forEach((s) => {
      const fill = el("i");
      ol.append(el("li", {},
        el("span", { class: "who" }, el("b", {}, s.name), el("span", {}, `${s.count} gift${s.count === 1 ? "" : "s"} · last ${fmtDate(s.last)}`)),
        el("span", { class: "amt" }, money(s.total)),
        el("span", { class: "mini" }, fill)));
      onVisible(ol, () => { fill.style.width = `${(s.total / max) * 100}%`; });
    });
  }

  /* ───────────── ledger table ───────────── */
  const PAGE = 10;
  let shown = PAGE;
  function highlight(text, q) {
    const s = String(text || "");
    if (!q) return document.createTextNode(s);
    const f = document.createDocumentFragment();
    const lower = s.toLowerCase(); let i = 0, j;
    while ((j = lower.indexOf(q, i)) !== -1) { f.append(s.slice(i, j), el("mark", {}, s.slice(j, j + q.length))); i = j + q.length; }
    f.append(s.slice(i));
    return f;
  }
  function renderTable(reset) {
    if (reset) shown = PAGE;
    const q = $("#tableSearch").value.trim().toLowerCase();
    const pf = $("#tableProject").value;
    const [key, dir] = $("#tableSort").value.split("-");
    let rows = contributions.filter((c) => {
      if (pf === "__general" ? c.project && projectById[c.project] : pf && c.project !== pf) return false;
      if (!q) return true;
      return [c._anon ? "anonymous" : c.name, c.note, c.platform, projectTitle(c.project)].some((v) => String(v || "").toLowerCase().includes(q));
    });
    const cmp = {
      date: (a, b) => a.date.localeCompare(b.date) || a._i - b._i,
      amount: (a, b) => a.amount - b.amount,
      name: (a, b) => (a._anon ? "~" : a.name).localeCompare(b._anon ? "~" : b.name),
    }[key];
    rows.sort((a, b) => (dir === "desc" ? -1 : 1) * cmp(a, b));
    const sum = rows.reduce((s, c) => s + c.amount, 0);
    const body = $("#tableBody");
    if (!rows.length) body.replaceChildren(el("tr", { class: "no-results" }, el("td", { colspan: "5" }, "Nothing matches that search.")));
    else body.replaceChildren(...rows.slice(0, shown).map((c, i) => el("tr", { class: "new", style: `animation-delay:${Math.min(i, 12) * 18}ms` },
      el("td", { class: "date" }, fmtDate(c.date)),
      el("td", {}, c._anon ? el("span", { class: "anon" }, highlight("Anonymous", q)) : highlight(c.name, q),
        c.note ? el("span", { class: "note" }, highlight(c.note, q)) : null),
      el("td", { class: "for" }, highlight(projectTitle(c.project), q)),
      el("td", { class: "via" }, highlight(c.platform || "–", q)),
      el("td", { class: "num" }, money(c.amount)))));
    $("#tableCount").textContent = `${Math.min(shown, rows.length)} of ${rows.length} · ${money(sum)}`;
    $("#tableMore").hidden = rows.length <= shown;
  }
  function setupTable() {
    const sel = $("#tableProject");
    sel.append(el("option", { value: "" }, "All projects"));
    if (contributions.some((c) => !c.project || !projectById[c.project])) sel.append(el("option", { value: "__general" }, "General support"));
    projects.forEach((p) => sel.append(el("option", { value: p.id }, p.title)));
    let t;
    $("#tableSearch").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => renderTable(true), 120); });
    sel.addEventListener("change", () => renderTable(true));
    $("#tableSort").addEventListener("change", () => renderTable(true));
    $("#tableMore").addEventListener("click", () => { shown += PAGE; renderTable(false); });
    renderTable(true);
  }

  /* ───────────── platforms ───────────── */
  const KIND_LABEL = { recurring: "Recurring", "one-time": "One-time", crypto: "Crypto" };
  function renderPlatforms() {
    const grid = $("#platformGrid");
    if (!platforms.length) { grid.append(el("div", { class: "empty" }, "No donation links yet.")); return; }
    platforms.forEach((p) => {
      const url = safeUrl(p.url);
      const kids = [
        el("div", { class: "platform-top" },
          el("span", { class: "glyph" }, icon(p.icon || (p.kind === "crypto" ? "coin" : "heart"))),
          el("span", { class: "badge", "data-s": "planned" }, KIND_LABEL[p.kind] || p.kind || "Link")),
        el("div", {}, el("h3", {}, p.name), p.handle ? el("div", { class: "handle" }, p.handle) : null),
        p.note ? el("p", {}, p.note) : null,
      ];
      if (p.address) {
        kids.push(el("div", { class: "addr" }, el("code", { title: p.address }, p.address),
          el("button", { class: "copy-mini", onclick: (e) => { e.preventDefault(); e.stopPropagation(); copy(p.address, `${p.name} address copied`); } }, icon("copy"), "Copy")));
      } else if (url) kids.push(el("div", { class: "go" }, el("span", {}, "Open"), icon("arrow")));
      const card = url && !p.address
        ? el("a", { class: "card platform clickable reveal", href: url, target: "_blank", rel: "noopener", "data-kind": p.kind || "" }, kids)
        : el("article", { class: "card platform reveal", "data-kind": p.kind || "" }, kids);
      grid.append(card);
    });
    const kinds = new Set(platforms.map((p) => p.kind));
    $$("#platformFilter button").forEach((b) => { if (b.dataset.filter !== "all" && !kinds.has(b.dataset.filter)) b.remove(); });
    if ($$("#platformFilter button").length <= 2) $("#platformFilter").remove();
    else segmented($("#platformFilter"), (f) => $$(".platform", grid).forEach((c) => c.classList.toggle("hide", f !== "all" && c.dataset.kind !== f)));
  }

  /* ───────────── contact ───────────── */
  function renderContact() {
    if (!contacts.email) $("#emailCard").remove();
    else {
      $("#emailText").textContent = contacts.email;
      $("#copyEmail").addEventListener("click", () => copy(contacts.email, "Email copied"));
      $("#mailtoEmail").href = `mailto:${encodeURIComponent(contacts.email).replace(/%40/g, "@")}`;
    }
    const ul = $("#socialList");
    (contacts.socials || []).forEach((s) => {
      const url = safeUrl(s.url);
      if (!url) return;
      ul.append(el("li", {}, el("a", { href: url, target: "_blank", rel: "noopener me" },
        el("span", { class: "sname" }, s.name),
        el("span", { class: "shandle" }, s.handle || "", icon("arrow")))));
    });
    if (!ul.children.length) ul.closest(".card").remove();
  }

  /* ───────────── segmented control ───────────── */
  function segmented(root, onChange) {
    if (!root) return;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      onChange(b.dataset.filter ?? b.dataset.range);
    });
  }

  /* ───────────── copy & toast ───────────── */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.replaceChildren(icon("check"), msg);
    t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function copy(text, msg) {
    const done = () => toast(msg || "Copied");
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      const ta = el("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch { toast("Couldn't copy"); }
      ta.remove();
    }
  }

  /* ───────────── theme ───────────── */
  function effectiveTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function toggleTheme() {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem("ledger-theme", next); } catch {} };
    if (document.startViewTransition && !REDUCED) document.startViewTransition(apply); else apply();
  }
  $("#themeToggle").addEventListener("click", toggleTheme);

  /* ───────────── command palette ───────────── */
  function paletteItems() {
    const go = (id) => () => $(id).scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
    const items = [
      ...[["#overview", "Overview"], ["#projects", "Projects"], ["#drives", "Funding drives"], ["#supporters", "Supporters & ledger"], ["#donate", "Ways to support"], ["#contact", "Contact"]]
        .filter(([id]) => $(id)).map(([id, label]) => ({ group: "Sections", label, sub: id, ic: "hash", run: go(id) })),
      ...projects.map((p) => ({ group: "Projects", label: p.title, sub: `${money(projectRaised(p))} / ${money(Number(p.goal) || 0)}`, ic: "folder", run: () => openProject(p) })),
      ...platforms.map((p) => p.address
        ? { group: "Donate", label: `Copy ${p.name} address`, sub: p.handle || "", ic: "copy", run: () => copy(p.address, `${p.name} address copied`) }
        : safeUrl(p.url) ? { group: "Donate", label: p.name, sub: p.handle || "", ic: p.icon || "heart", run: () => window.open(safeUrl(p.url), "_blank", "noopener") } : null),
      ...(contacts.socials || []).filter((s) => safeUrl(s.url)).map((s) => ({ group: "Socials", label: s.name, sub: s.handle || "", ic: "at", run: () => window.open(safeUrl(s.url), "_blank", "noopener") })),
      { group: "Actions", label: "Toggle light / dark", sub: "theme", ic: "sun", run: toggleTheme },
      contacts.email ? { group: "Actions", label: "Copy email address", sub: contacts.email, ic: "copy", run: () => copy(contacts.email, "Email copied") } : null,
      contacts.discord && safeUrl(contacts.discord.invite) ? { group: "Actions", label: "Join Discord", sub: contacts.discord.name || "", ic: "chat", run: () => window.open(safeUrl(contacts.discord.invite), "_blank", "noopener") } : null,
    ];
    return items.filter(Boolean);
  }
  // Subsequence fuzzy score: higher is better, -1 means no match
  function fuzzy(q, s) {
    if (!q) return 0;
    s = s.toLowerCase();
    const direct = s.indexOf(q);
    if (direct !== -1) return 1000 - direct;
    let si = 0, score = 0, streak = 0;
    for (const ch of q) {
      const j = s.indexOf(ch, si);
      if (j === -1) return -1;
      streak = j === si ? streak + 1 : 0; score += 1 + streak * 2; si = j + 1;
    }
    return score;
  }
  const pal = $("#palette"), palInput = $("#paletteInput"), palList = $("#paletteList");
  let palAll = [], palView = [], palSel = 0;
  function renderPalette() {
    const q = palInput.value.trim().toLowerCase();
    palView = palAll.map((it) => ({ it, s: Math.max(fuzzy(q, it.label), fuzzy(q, it.sub || "") - 50, fuzzy(q, it.group) - 100) }))
      .filter((x) => x.s >= 0).sort((a, b) => (q ? b.s - a.s : 0)).map((x) => x.it);
    palSel = Math.min(palSel, Math.max(0, palView.length - 1));
    palList.replaceChildren();
    if (!palView.length) { palList.append(el("li", { class: "palette-empty" }, "No results")); return; }
    let lastGroup = null;
    palView.forEach((it, i) => {
      if (!q && it.group !== lastGroup) { palList.append(el("li", { class: "palette-group", role: "presentation" }, it.group)); lastGroup = it.group; }
      palList.append(el("li", {
        class: "palette-item", role: "option", "aria-selected": String(i === palSel), "data-i": i,
        onpointermove: () => { if (palSel !== i) { palSel = i; markSel(); } },
        onclick: () => runPal(i),
      }, el("span", { class: "pi-ic" }, icon(it.ic)), el("span", {}, it.label), it.sub ? el("span", { class: "pi-sub" }, it.sub) : null));
    });
  }
  function markSel() {
    $$(".palette-item", palList).forEach((n) => n.setAttribute("aria-selected", String(Number(n.dataset.i) === palSel)));
    const cur = $(`.palette-item[data-i="${palSel}"]`, palList); if (cur) cur.scrollIntoView({ block: "nearest" });
  }
  function runPal(i) { const it = palView[i]; if (!it) return; pal.close(); setTimeout(it.run, 10); }
  function openPalette() {
    if (pal.open) return;
    palAll = paletteItems(); palInput.value = ""; palSel = 0; renderPalette();
    pal.showModal(); palInput.focus();
  }
  palInput.addEventListener("input", () => { palSel = 0; renderPalette(); });
  palInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = (palSel - 1 + palView.length) % Math.max(1, palView.length); markSel(); }
    else if (e.key === "Enter") { e.preventDefault(); runPal(palSel); }
  });
  $("#openPalette").addEventListener("click", openPalette);
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $("#kbdHint").textContent = "Ctrl K";
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.open ? pal.close() : openPalette(); }
    else if (e.key === "/" && !typing && !pal.open) { e.preventDefault(); openPalette(); }
  });
  // Click on backdrop closes dialogs
  $$("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); }));

  /* ───────────── nav: scroll spy + sliding pill ───────────── */
  function setupNav() {
    const links = $$("#nav a"), ind = $("#navIndicator"), bar = $("#topbar");
    const move = (a) => {
      links.forEach((l) => l.classList.toggle("active", l === a));
      if (!a) { ind.style.opacity = 0; return; }
      ind.style.opacity = 1; ind.style.width = `${a.offsetWidth}px`; ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const sections = links.map((l) => $(l.getAttribute("href"))).filter(Boolean);
    const spy = () => {
      bar.classList.toggle("scrolled", window.scrollY > 4);
      const y = window.scrollY + window.innerHeight * 0.3;
      let cur = sections[0];
      for (const s of sections) if (s.offsetTop <= y) cur = s;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = sections[sections.length - 1];
      move(links.find((l) => l.getAttribute("href") === `#${cur.id}`));
    };
    let raf;
    window.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
    window.addEventListener("resize", spy);
    document.fonts?.ready.then(spy);
    spy();
  }

  /* ───────────── reveal + spotlight ───────────── */
  function setupReveal() {
    const items = $$(".reveal");
    if (REDUCED || !("IntersectionObserver" in window)) { items.forEach((n) => n.classList.add("in")); return; }
    const io = new IntersectionObserver((es) => {
      es.filter((e) => e.isIntersecting).forEach((e) => {
        const sib = $$(".reveal", e.target.parentElement).filter((n) => !n.classList.contains("in"));
        e.target.style.transitionDelay = `${Math.min(sib.indexOf(e.target), 6) * 60}ms`;
        e.target.classList.add("in");
        io.unobserve(e.target);
        setTimeout(() => (e.target.style.transitionDelay = ""), 1200);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    items.forEach((n) => io.observe(n));
  }
  document.addEventListener("pointermove", (e) => {
    const c = e.target.closest?.(".card"); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ───────────── footer ───────────── */
  function renderFooter() {
    const dates = [...contributions.map((c) => c.date), ...projects.map((p) => p.updated).filter(Boolean)];
    const last = dates.sort().pop();
    $("#lastUpdated").textContent = last ? `Last updated ${fmtDate(last)}` : "";
  }

  /* ───────────── boot ───────────── */
  renderBento();
  renderProjects();
  renderDrives();
  renderBoard();
  setupTable();
  renderPlatforms();
  renderContact();
  renderFooter();
  setupNav();
  setupReveal();

  segmented($("#chartRange"), (r) => { chartRange = r === "all" ? "all" : Number(r); renderChart(); });
  renderChart();
  if ("ResizeObserver" in window) {
    let w = $("#chart").clientWidth, t;
    new ResizeObserver(() => { const nw = $("#chart").clientWidth; if (nw !== w) { w = nw; clearTimeout(t); t = setTimeout(renderChart, 80); } }).observe($("#chart"));
  }
})();
