// Builds README.md (and the cards in docs/readme/) from data/snapshot.json, so
// the repo page shows the same live ledger as the site. Run by the "Sync ledger"
// Action after scripts/sync.mjs. Every image has a dark and a light version.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import vm from "node:vm";

const require = createRequire(import.meta.url);
require("../js/sources.js");
const L = globalThis.LedgerSources;
const root = new URL("../", import.meta.url);
const env = process.env;

const box = { window: {} };
vm.runInNewContext(await readFile(env.LEDGER_CONFIG_FILE || new URL("ledger.config.js", root), "utf8"), box);
const C = box.window.LEDGER_CONFIG || {};
const SRC = C.sources || {};
const snap = JSON.parse(await readFile(env.SNAPSHOT_IN || new URL("data/snapshot.json", root), "utf8"));
const OUT = env.README_OUT_DIR ? new URL(`file://${env.README_OUT_DIR.replace(/\/?$/, "/")}`) : root;
const IMG_DIR = "docs/readme";

const BASE = String(C.currency || "USD").toUpperCase();
const LOCALE = C.locale || "en-US";
const g = snap.github || {};
const P = g.profile || null;
const LABELS = { opencollective: "Open Collective", liberapay: "Liberapay", githubSponsors: "GitHub Sponsors", patreon: "Patreon", buymeacoffee: "Buy Me a Coffee", kofi: "Ko-fi", paypal: "PayPal", bitcoin: "Bitcoin", ethereum: "Ethereum" };
const sources = Object.entries(snap.sources || {}).map(([id, data]) => ({ id, label: LABELS[id] || id, data }));
const D = L.summarize({ base: BASE, github: g, sources, usdPer: (snap.rates && snap.rates.usdPer) || { USD: 1 } });
const siteUrl = C.siteUrl || (C.github && C.repo ? `https://${C.github.toLowerCase()}.github.io/${C.repo.split("/")[1]}/` : null);

/* ───────────── formatting ───────────── */
const money = (n, cur = BASE) => {
  if (n == null || !Number.isFinite(n)) return "–";
  if (cur === "BTC" || cur === "ETH") return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: n < 0.01 ? 6 : 4 }).format(n)} ${cur}`;
  const frac = Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2;
  try { return new Intl.NumberFormat(LOCALE, { style: "currency", currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n); }
  catch { return `${n.toFixed(2)} ${cur}`; }
};
const int = (n) => new Intl.NumberFormat(LOCALE).format(n || 0);
const date = (iso) => (iso ? new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "–");
const xml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const md = (s) => String(s ?? "").replace(/[|<>\[\]\\`*_]/g, (c) => `\\${c}`).replace(/\n/g, " ");
const attr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const plain = (s) => String(s || "").replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^#+\s*/gm, "").replace(/[*_`>]/g, "").trim();
const firstPara = (s, n) => { const t = plain(s).split(/\n\s*\n/)[0].replace(/\s+/g, " "); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
// Rough text metrics so SVG text can be wrapped/truncated without a browser.
const width = (s, size, mono) => String(s).length * size * (mono ? 0.6 : 0.54);
const fit = (s, size, max, mono) => { s = String(s); while (s.length > 1 && width(s, size, mono) > max) s = s.slice(0, -2) + "…"; return s; };
const wrap = (s, size, max, lines) => {
  const out = []; let cur = "";
  for (const w of String(s).split(/\s+/)) {
    if (width(cur ? `${cur} ${w}` : w, size) > max) { out.push(cur); cur = w; if (out.length === lines) break; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && plain(s).length > out.join(" ").length) out[lines - 1] = fit(out[lines - 1] + "…", size, max);
  return out.filter(Boolean);
};

/* ───────────── SVG theme ───────────── */
const T = {
  dark: { bg: "#0b0b0b", surface: "#121212", line: "#262626", ink: "#f0f0f0", ink2: "#c8c8c8", muted: "#8c8c8c", faint: "#4d4d4d", fill: "#f0f0f0", fillInk: "#0b0b0b", soft: "#2a2a2a", good: "#3fb950", warn: "#d29922", bad: "#f85149", hm: ["#1b1b1b", "#0e4429", "#006d32", "#26a641", "#39d353"] },
  light: { bg: "#f3f3f3", surface: "#ffffff", line: "#e3e3e3", ink: "#0f0f0f", ink2: "#3a3a3a", muted: "#6e6e6e", faint: "#bdbdbd", fill: "#111111", fillInk: "#ffffff", soft: "#e2e2e2", good: "#1a7f37", warn: "#9a6700", bad: "#cf222e", hm: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
};
const SANS = "Geist, Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const frame = (w, h, t, body, { grid = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${grid ? `<pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${t.line}" stroke-width="1"/></pattern><linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="${t.surface}"/><stop offset=".6" stop-color="${t.surface}" stop-opacity=".25"/><stop offset="1" stop-color="${t.surface}" stop-opacity="0"/></linearGradient>` : ""}<clipPath id="r"><rect width="${w}" height="${h}" rx="20"/></clipPath></defs>
<g clip-path="url(#r)"><rect width="${w}" height="${h}" fill="${t.surface}"/>${grid ? `<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#f)"/>` : ""}</g>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="19.5" fill="none" stroke="${t.line}"/>
<g font-family="${SANS}">${body}</g></svg>
`;
const text = (x, y, s, { size = 16, fill, weight = 400, mono = false, anchor = "start", ls = 0, upper = false } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" ${mono ? `font-family="${MONO}"` : ""} font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ""}>${xml(upper ? String(s).toUpperCase() : s)}</text>`;
const label = (x, y, s, t) => text(x, y, s, { size: 12.5, fill: t.muted, weight: 500, ls: 1.4, upper: true });
const bar = (x, y, w, h, pct, t) => {
  const p = Math.max(0, Math.min(1, pct || 0));
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${t.soft}"/>` + (p > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(h, w * p)}" height="${h}" rx="${h / 2}" fill="${p >= 1 ? t.good : t.fill}"/>` : "");
};
const badge = (x, y, s, t, kind = "line") => {
  const w = width(s, 11.5, true) + 22;
  const col = { good: t.good, warn: t.warn, bad: t.bad, solid: t.fill, line: t.ink2 }[kind];
  return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="${kind === "solid" ? t.fill : "none"}" stroke="${kind === "solid" ? t.fill : col}" stroke-opacity="${kind === "line" ? 0.35 : 0.6}"/>` +
    text(x + w / 2, y + 15, s, { size: 11.5, mono: true, fill: kind === "solid" ? t.fillInk : col, anchor: "middle", upper: true, ls: 0.6 });
};

const files = new Map(); // relative path -> content
const both = (name, render) => { for (const mode of ["dark", "light"]) files.set(`${IMG_DIR}/${name}-${mode}.svg`, render(T[mode])); return name; };
const pic = (name, alt, w = "100%") => `<picture><source media="(prefers-color-scheme: dark)" srcset="${IMG_DIR}/${name}-dark.svg"><img alt="${attr(alt)}" src="${IMG_DIR}/${name}-light.svg" width="${w}"></picture>`;

/* ───────────── avatar (embedded, GitHub blocks external images inside SVG) ───────────── */
let avatar = null;
if (P && P.avatar) {
  try {
    const r = await fetch(`${P.avatar}${P.avatar.includes("?") ? "&" : "?"}s=200`);
    if (r.ok) avatar = `data:${r.headers.get("content-type") || "image/png"};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {}
}
const initials = (n) => String(n || "?").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

/* ───────────── monthly series (real payments only) ───────────── */
function months(n) {
  const now = new Date(); const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, d, total: 0, count: 0 }); }
  const idx = Object.fromEntries(out.map((m, i) => [m.key, i]));
  for (const p of D.payments) { if (p.value == null) continue; const d = new Date(p.date); const i = idx[`${d.getFullYear()}-${d.getMonth()}`]; if (i != null) { out[i].total += p.value; out[i].count++; } }
  return out;
}

/* ═════════════ sections ═════════════ */
const parts = [];
const configured = Object.keys(LABELS).filter((id) => (id === "githubSponsors" ? SRC[id] && C.github : SRC[id]));
const liveCount = sources.length + (P ? 1 : 0);

// ── Header card
const name = P ? P.name : C.github || "Ledger";
const bio = P && P.bio ? P.bio : "";
const bioLines = wrap(bio, 19, 640, 2);
const headerH = 330;
both("header", (t) => {
  const av = avatar
    ? `<clipPath id="av"><rect x="56" y="56" width="88" height="88" rx="22"/></clipPath><filter id="gs"><feColorMatrix type="saturate" values="0"/></filter><image href="${avatar}" x="56" y="56" width="88" height="88" clip-path="url(#av)" filter="url(#gs)"/>`
    : `<rect x="56" y="56" width="88" height="88" rx="22" fill="${t.fill}"/>${text(100, 112, initials(name), { size: 30, weight: 600, fill: t.fillInk, anchor: "middle" })}`;
  const status = g.status && g.status.message ? g.status.message : configured.length ? "Open to support" : null;
  const statusSvg = status ? (() => { const w = width(status, 13.5) + 44; return `<rect x="160" y="88" width="${w}" height="30" rx="15" fill="none" stroke="${t.line}"/><circle cx="178" cy="103" r="4" fill="${t.good}"/>${text(190, 108, fit(status, 13.5, 380), { size: 13.5, fill: t.ink2 })}`; })() : "";
  // Right side: a real mini-chart (monthly payments, else last 26 weeks of contributions)
  let deco = "";
  const ms = months(12);
  if (ms.some((m) => m.total > 0)) {
    const max = Math.max(...ms.map((m) => m.total));
    deco = label(856, 92, "Payments · 12 months", t) + ms.map((m, i) => { const h = m.total ? Math.max(4, (m.total / max) * 150) : 3; return `<rect x="${856 + i * 30}" y="${262 - h}" width="20" height="${h}" rx="4" fill="${m.total ? t.fill : t.soft}"/>`; }).join("");
  } else if (g.contributions && g.contributions.weeks) {
    const wk = g.contributions.weeks.slice(-26).map((w) => w.days.reduce((s, d) => s + d.count, 0));
    const max = Math.max(...wk, 1);
    deco = label(856, 92, "Contributions · 26 weeks", t) + wk.map((v, i) => { const h = v ? Math.max(4, (v / max) * 150) : 3; return `<rect x="${856 + i * 13.6}" y="${262 - h}" width="9" height="${h}" rx="3" fill="${v ? t.good : t.soft}"/>`; }).join("");
  }
  return frame(1280, headerH, t,
    av + statusSvg +
    text(56, 214, fit(name, 64, 760), { size: 64, weight: 600, fill: t.ink, ls: -2.5 }) +
    text(58, 250, [P ? `@${P.login}` : "", P && P.location, P && P.company].filter(Boolean).join("  ·  "), { size: 16, mono: true, fill: t.muted }) +
    bioLines.map((l, i) => text(56, 288 + i * 26, l, { size: 19, fill: t.ink2 })).join("") + deco, { grid: true });
});
parts.push(`<div align="center">\n\n${pic("header", `${name}${bio ? ` · ${bio}` : ""}`)}\n`);

// ── Badge row (shields.io renders these live)
const shields = [];
const sh = (labelTxt, msg, logo) => `https://img.shields.io/badge/${encodeURIComponent(labelTxt).replace(/-/g, "--")}-${encodeURIComponent(msg).replace(/-/g, "--")}-111111?style=for-the-badge&labelColor=2b2b2b${logo ? `&logo=${logo}&logoColor=white` : ""}`;
if (siteUrl) shields.push(`<a href="${attr(siteUrl)}"><img alt="Live site" src="${sh("live", "site", "")}"></a>`);
if (C.github) shields.push(`<a href="https://github.com/${attr(C.github)}"><img alt="GitHub followers" src="https://img.shields.io/github/followers/${encodeURIComponent(C.github)}?style=for-the-badge&logo=github&logoColor=white&label=followers&color=111111&labelColor=2b2b2b"></a>`);
if (C.discordServerId) shields.push(`<a href="${attr(C.discordInvite || (snap.discord && snap.discord.invite) || "#contact")}"><img alt="Discord" src="https://img.shields.io/discord/${encodeURIComponent(C.discordServerId)}?style=for-the-badge&logo=discord&logoColor=white&label=online&color=111111&labelColor=2b2b2b"></a>`);
if (snap.youtube) shields.push(`<a href="${attr(snap.youtube.url)}"><img alt="YouTube" src="${sh("youtube", snap.youtube.title || "channel", "youtube")}"></a>`);
if (shields.length) parts.push(`${shields.join("\n")}\n`);

// ── Stats strip
const stats = [];
if (D.parts.length) stats.push(["Total raised", money(Math.round(D.raised)), `from ${D.parts.length} source${D.parts.length === 1 ? "" : "s"}`]);
if (D.recurringParts.length) stats.push(["Recurring", `${money(Math.round(D.recurring))}/mo`, D.recurringParts.map((p) => p.label).join(" · ")]);
if (D.supporters > 0 || D.leaders.length) stats.push(["Supporters", int(D.supporters || D.leaders.length), D.supporterParts.length > 1 ? "across platforms" : "and counting"]);
const openProjects = D.projects.filter((p) => p.status === "active" || p.status === "planned");
if (D.projects.length) stats.push(["Projects", int(openProjects.length), `${D.projects.filter((p) => p.status === "funded").length} funded so far`]);
if (g.contributions) stats.push(["Contributions", int(g.contributions.total), "on GitHub in the last year"]);
// While there's little funding data, round the strip out with real GitHub numbers.
const repoList = g.repos || [];
if (stats.length < 4 && P) stats.push(["Public repos", int(P.repos), `${int(repoList.reduce((t, r) => t + (r.stars || 0), 0))} stars earned`]);
if (stats.length < 4 && P) stats.push(["Followers", int(P.followers), `following ${int(P.following)}`]);
if (stats.length) {
  both("stats", (t) => {
    const cw = 1280 / stats.length;
    return frame(1280, 150, t, stats.map(([l, v, s], i) => {
      const x = i * cw + 36;
      return (i ? `<line x1="${i * cw}" y1="28" x2="${i * cw}" y2="122" stroke="${t.line}"/>` : "") + label(x, 46, l, t) +
        text(x, 94, fit(v, 40, cw - 60, true), { size: 40, mono: true, weight: 500, fill: t.ink, ls: -1.5 }) + text(x, 122, fit(s, 14, cw - 60), { size: 14, fill: t.muted });
    }).join(""));
  });
  parts.push(`${pic("stats", stats.map((s) => `${s[0]}: ${s[1]}`).join(", "))}\n`);
}
parts.push(`</div>\n`);

// helper for section headings in the site's style
let secN = 0;
const heading = (title, sub) => { secN++; return `\n## \`${String(secN).padStart(2, "0")}\` · ${title}\n${sub ? `\n<sub>${sub}</sub>\n` : ""}`; };

// ── Projects
const STATUS = { active: ["Active", "solid"], planned: ["Planned", "line"], paused: ["Paused", "warn"], funded: ["Funded", "good"], cancelled: ["Closed", "bad"] };
const projOrder = ["active", "planned", "paused", "funded", "cancelled"];
const projects = D.projects.filter((p) => p.status !== "cancelled").sort((a, b) => projOrder.indexOf(a.status) - projOrder.indexOf(b.status)).slice(0, 8);
if (projects.length) {
  parts.push(heading("What I'm working on", `Each card is a GitHub issue. Put <code>#tag</code> in your donation message to fund a specific one.`));
  const cells = projects.map((p) => {
    const pct = p.goal ? p.raised / p.goal : null;
    both(`project-${p.number}`, (t) => {
      const [st, kind] = STATUS[p.status] || [p.status, "line"];
      const desc = wrap(firstPara(p.body, 200), 15, 560, 2);
      return frame(620, 210, t,
        badge(28, 26, st, t, kind) + text(592, 42, `#${p.number}`, { size: 13, mono: true, fill: t.muted, anchor: "end" }) +
        text(28, 84, fit(p.title, 24, 564), { size: 24, weight: 600, fill: t.ink, ls: -0.6 }) +
        desc.map((l, i) => text(28, 112 + i * 21, l, { size: 15, fill: t.muted })).join("") +
        text(28, 178, money(p.raised), { size: 18, mono: true, weight: 500, fill: t.ink }) +
        (p.goal ? text(28 + width(money(p.raised), 18, true) + 6, 178, `/ ${money(p.goal)}`, { size: 14, mono: true, fill: t.muted }) : text(28 + width(money(p.raised), 18, true) + 6, 178, "raised", { size: 14, fill: t.muted })) +
        text(592, 178, pct != null ? `${Math.round(pct * 100)}%` : `👍 ${p.upvotes}`, { size: 14, mono: true, fill: t.muted, anchor: "end" }) +
        (pct != null ? bar(28, 188, 564, 7, pct, t) : ""));
    });
    return `<td width="50%" valign="top"><a href="${attr(p.url)}">${pic(`project-${p.number}`, `${p.title}: ${money(p.raised)}${p.goal ? ` of ${money(p.goal)}` : ""}`)}</a></td>`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>\n${cells[i]}\n${cells[i + 1] || "<td></td>"}\n</tr>`);
  parts.push(`\n<table>\n${rows.join("\n")}\n</table>\n`);
}

// ── Drives & goals
const drives = D.drives.filter((d) => d.phase !== "ended");
if (drives.length || D.goals.length) {
  parts.push(heading("Funding drives & goals"));
  for (const d of drives) {
    const pct = d.goal ? d.raised / d.goal : null;
    both(`drive-${d.number}`, (t) => frame(1280, 150, t,
      badge(32, 28, d.phase === "live" ? "Live" : "Upcoming", t, d.phase === "live" ? "good" : "line") +
      text(1248, 44, d.end ? `${d.phase === "live" ? "ends" : "opens"} ${date(d.phase === "live" ? d.end : d.start)}` : "open-ended", { size: 14, mono: true, fill: t.muted, anchor: "end" }) +
      text(32, 88, fit(d.title, 28, 900), { size: 28, weight: 600, fill: t.ink, ls: -0.8 }) +
      text(32, 122, `${money(d.raised)}${d.goal ? ` of ${money(d.goal)}` : " raised"}`, { size: 16, mono: true, fill: t.ink2 }) +
      (pct != null ? bar(420, 112, 700, 10, pct, t) + text(1248, 122, `${Math.round(pct * 100)}%`, { size: 16, mono: true, fill: t.ink, anchor: "end" }) : "")));
    parts.push(`<a href="${attr(d.url)}">${pic(`drive-${d.number}`, `${d.title}: ${money(d.raised)}${d.goal ? ` of ${money(d.goal)}` : ""}`)}</a>\n`);
  }
  D.goals.forEach((gl, i) => {
    const pct = gl.target ? gl.current / gl.target : 0;
    const line = gl.unit === "count" ? `${int(gl.current)} of ${int(gl.target)} sponsors` : `${money(gl.current, gl.sourceCurrency)} of ${money(gl.target, gl.sourceCurrency)}${gl.period ? ` / ${gl.period}` : ""}`;
    both(`goal-${gl.sourceId}`, (t) => frame(1280, 120, t,
      badge(32, 26, `${gl.source} goal`, t, "line") + text(32, 86, fit(gl.title, 24, 560), { size: 24, weight: 600, fill: t.ink, ls: -0.6 }) +
      text(640, 66, line, { size: 15, mono: true, fill: t.ink2 }) + bar(640, 80, 480, 10, pct, t) +
      text(1248, 90, `${Math.round(pct * 100)}%`, { size: 22, mono: true, fill: t.ink, anchor: "end" })));
    parts.push(`<a href="${attr(gl.url || "#")}">${pic(`goal-${gl.sourceId}`, `${gl.title}: ${line}`)}</a>\n`);
  });
}

// ── Ways to support
const supportLinks = {
  githubSponsors: [`https://github.com/sponsors/${C.github}`, "githubsponsors"],
  patreon: [`https://www.patreon.com/${SRC.patreon}`, "patreon"],
  kofi: [`https://ko-fi.com/${SRC.kofi}`, "kofi"],
  buymeacoffee: [`https://www.buymeacoffee.com/${SRC.buymeacoffee}`, "buymeacoffee"],
  opencollective: [`https://opencollective.com/${SRC.opencollective}/donate`, "opencollective"],
  liberapay: [`https://liberapay.com/${SRC.liberapay}/donate`, "liberapay"],
  paypal: [`https://paypal.me/${SRC.paypal}`, "paypal"],
};
const btns = configured.filter((id) => supportLinks[id]).map((id) => {
  const [url, logo] = supportLinks[id];
  const s = sources.find((x) => x.id === id);
  const extra = s && s.data && Number.isFinite(s.data.supporters) && s.data.supporters > 0 ? `${s.data.supporters} supporters` : "support";
  return `<a href="${attr(url)}"><img alt="${attr(LABELS[id])}" src="https://img.shields.io/badge/${encodeURIComponent(LABELS[id]).replace(/-/g, "--")}-${encodeURIComponent(extra)}-111111?style=for-the-badge&logo=${logo}&logoColor=white&labelColor=2b2b2b"></a>`;
});
const wallets = ["bitcoin", "ethereum"].filter((id) => SRC[id]).map((id) => {
  const s = sources.find((x) => x.id === id);
  const recv = s && s.data ? ` · received ${money(s.data.received, s.data.currency)}` : "";
  return `**${LABELS[id]}**${recv}\n\`\`\`\n${SRC[id]}\n\`\`\``;
});
if (btns.length || wallets.length) {
  parts.push(heading("Ways to support", "Every platform below feeds the numbers on this page automatically."));
  if (btns.length) parts.push(`\n<p>\n${btns.join("\n")}\n</p>\n`);
  if (wallets.length) parts.push(`\n${wallets.join("\n\n")}\n`);
}

// ── Supporters
if (D.payments.length || D.leaders.length) {
  parts.push(heading("People who've helped", "Thank you. Anonymous gifts count toward the totals but are never named."));
  const ms = months(12);
  if (ms.some((m) => m.total > 0)) {
    both("chart", (t) => {
      const W = 1280, H = 300, pl = 72, pr = 32, pt = 70, pb = 44, iw = W - pl - pr, ih = H - pt - pb;
      const raw = Math.max(...ms.map((m) => m.total)); const pw = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / pw;
      const max = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pw;
      const slot = iw / ms.length, bw = Math.min(44, slot * 0.62);
      const mFmt = new Intl.DateTimeFormat(LOCALE, { month: "short" });
      const compact = (v) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: BASE, notation: "compact", maximumFractionDigits: 1 }).format(v);
      let out = label(32, 40, "Payments per month", t) + text(1248, 42, money(Math.round(ms.reduce((s, m) => s + m.total, 0))), { size: 22, mono: true, fill: t.ink, anchor: "end" });
      for (let i = 0; i <= 4; i++) { const y = pt + ih - (ih * i) / 4; out += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${t.line}"/>` + text(pl - 10, y + 4, compact((max * i) / 4), { size: 11, mono: true, fill: t.muted, anchor: "end" }); }
      ms.forEach((m, i) => {
        const h = m.total ? Math.max(3, (m.total / max) * ih) : 2, x = pl + slot * i + (slot - bw) / 2, y = pt + ih - h, r = Math.min(4, bw / 2, h);
        out += `<path d="M${x},${pt + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${pt + ih}Z" fill="${m.total ? t.fill : t.soft}"/>`;
        out += text(x + bw / 2, H - 16, mFmt.format(m.d), { size: 11, mono: true, fill: t.muted, anchor: "middle" });
      });
      return frame(W, H, t, out);
    });
    parts.push(`\n${pic("chart", "Payments per month over the last 12 months")}\n`);
  }
  if (D.leaders.length) {
    parts.push(`\n**Top supporters**\n\n| | Name | Total | Via |\n|---:|---|---:|---|\n${D.leaders.slice(0, 10).map((s, i) => `| ${i + 1} | ${md(s.name)} | ${money(Math.round(s.total))}${s.monthly ? ` <sub>(${money(Math.round(s.monthly))}/mo)</sub>` : ""} | ${md(s.sources.join(", "))} |`).join("\n")}\n`);
  }
  if (D.payments.length) {
    parts.push(`\n<details>\n<summary><b>Latest payments</b></summary>\n\n| Date | From | Message | Source | Amount |\n|---|---|---|---|---:|\n${D.payments.slice(0, 15).map((p) => `| ${date(p.date)} | ${md(p.name || "Anonymous")} | ${md(p.message ? p.message.slice(0, 80) : "")} | ${md(p.sourceLabel)} | ${p.value != null ? `${p.currency !== BASE ? "≈ " : ""}${money(p.value)}` : money(p.amount, p.currency)} |`).join("\n")}\n\n</details>\n`);
  }
}

// ── Videos
const vids = (snap.youtube && snap.youtube.videos) || [];
if (vids.length) {
  parts.push(heading("Latest videos", `From <a href="${attr(snap.youtube.url)}">${xml(snap.youtube.title || "my channel")}</a>.`));
  const v6 = vids.slice(0, 6);
  const rows = [];
  for (let i = 0; i < v6.length; i += 3) rows.push(`<tr>\n${v6.slice(i, i + 3).map((v) => `<td width="33%" valign="top"><a href="https://www.youtube.com/watch?v=${attr(v.id)}"><img alt="${attr(v.title)}" src="https://i.ytimg.com/vi/${attr(v.id)}/hqdefault.jpg" width="100%"></a><br><sub><b>${xml(v.title)}</b><br>${date(v.published)}${v.views != null ? ` · ${int(v.views)} views` : ""}</sub></td>`).join("\n")}\n</tr>`);
  parts.push(`\n<table>\n${rows.join("\n")}\n</table>\n`);
}

// ── GitHub
const repos = g.repos || [];
if (g.contributions || repos.length) {
  parts.push(heading("On GitHub"));
  if (g.contributions && g.contributions.weeks) {
    both("contributions", (t) => {
      const weeks = g.contributions.weeks.slice(-53), cell = 18, gap = 4, x0 = 40, y0 = 78;
      const H = y0 + 7 * (cell + gap) + 30;
      let out = label(40, 42, "Contributions · last year", t) + text(1240, 44, int(g.contributions.total), { size: 22, mono: true, fill: t.ink, anchor: "end" });
      const mFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" }); let last = -1;
      weeks.forEach((w, wi) => {
        const f = w.days[0]; if (f) { const m = new Date(f.date + "T00:00:00Z").getUTCMonth(); if (m !== last && wi < weeks.length - 2) { out += text(x0 + wi * (cell + gap), y0 - 10, mFmt.format(new Date(f.date + "T00:00:00Z")), { size: 11, mono: true, fill: t.muted }); last = m; } }
        for (const d of w.days) { const dow = new Date(d.date + "T00:00:00Z").getUTCDay(); out += `<rect x="${x0 + wi * (cell + gap)}" y="${y0 + dow * (cell + gap)}" width="${cell}" height="${cell}" rx="4" fill="${t.hm[d.level] || t.hm[0]}"/>`; }
      });
      return frame(1280, H, t, out);
    });
    parts.push(`\n${pic("contributions", `${g.contributions.total} contributions in the last year`)}\n`);
  }
  const featured = (g.pinned && g.pinned.length ? g.pinned : repos.filter((r) => !r.archived).sort((a, b) => b.stars - a.stars || String(b.pushedAt).localeCompare(String(a.pushedAt)))).slice(0, 6);
  if (featured.length) {
    const cells = featured.map((r, i) => {
      both(`repo-${i}`, (t) => {
        const d = wrap(r.description || "No description", 14, 520, 2);
        return frame(600, 150, t,
          text(28, 50, fit(r.name, 19, 420, true), { size: 19, mono: true, weight: 600, fill: t.ink }) +
          text(572, 50, r.pushedAt ? date(r.pushedAt) : "", { size: 12, mono: true, fill: t.muted, anchor: "end" }) +
          d.map((l, k) => text(28, 80 + k * 20, l, { size: 14, fill: t.muted })).join("") +
          text(28, 128, [r.language, `★ ${int(r.stars)}`, r.forks ? `⑂ ${int(r.forks)}` : null].filter(Boolean).join("   ·   "), { size: 13, mono: true, fill: t.ink2 }));
      });
      return `<td width="50%" valign="top"><a href="${attr(r.url)}">${pic(`repo-${i}`, `${r.name}: ${r.description || ""}`)}</a></td>`;
    });
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>\n${cells[i]}\n${cells[i + 1] || "<td></td>"}\n</tr>`);
    parts.push(`\n<table>\n${rows.join("\n")}\n</table>\n`);
  }
}

// ── Contact
const contact = [];
const email = C.email || (P && P.email);
if (P) contact.push(`<a href="${attr(P.url)}"><img alt="GitHub" src="${sh("GitHub", `@${P.login}`, "github")}"></a>`);
if (email) contact.push(`<a href="mailto:${attr(email)}"><img alt="Email" src="${sh("email", email, "maildotru")}"></a>`);
if (C.discordServerId) contact.push(`<a href="${attr(C.discordInvite || (snap.discord && snap.discord.invite) || "")}"><img alt="Discord" src="https://img.shields.io/discord/${encodeURIComponent(C.discordServerId)}?style=for-the-badge&logo=discord&logoColor=white&label=discord&color=111111&labelColor=2b2b2b"></a>`);
const PROV = { twitter: ["X", "x"], linkedin: ["LinkedIn", "linkedin"], youtube: ["YouTube", "youtube"], instagram: ["Instagram", "instagram"], mastodon: ["Mastodon", "mastodon"], bluesky: ["Bluesky", "bluesky"], reddit: ["Reddit", "reddit"], twitch: ["Twitch", "twitch"], facebook: ["Facebook", "facebook"], npm: ["npm", "npm"] };
for (const s of g.socials || []) {
  const [n, logo] = PROV[s.provider] || [(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.provider; } })(), ""];
  const handle = (() => { try { return new URL(s.url).pathname.replace(/^\/|\/$/g, "").split("/").pop() || n; } catch { return n; } })();
  contact.push(`<a href="${attr(s.url)}"><img alt="${attr(n)}" src="${sh(n, handle, logo)}"></a>`);
}
if (P && P.twitter && !(g.socials || []).some((s) => s.provider === "twitter")) contact.push(`<a href="https://x.com/${attr(P.twitter)}"><img alt="X" src="${sh("X", `@${P.twitter}`, "x")}"></a>`);
if (P && P.blog) contact.push(`<a href="${attr(/^https?:/.test(P.blog) ? P.blog : `https://${P.blog}`)}"><img alt="Website" src="${sh("web", P.blog.replace(/^https?:\/\//, "").replace(/\/$/, ""), "")}"></a>`);
if (contact.length) {
  parts.push(heading("Get in touch"));
  parts.push(`\n<p>\n${contact.join("\n")}\n</p>\n`);
}

// ── Footer
parts.push(`\n---\n\n<div align="center">\n<sub>This page rebuilds itself from ${liveCount} live source${liveCount === 1 ? "" : "s"}${siteUrl ? ` · <a href="${attr(siteUrl)}">open the interactive version</a>` : ""} · <a href="docs/SETUP.md">how it works</a></sub>\n</div>\n`);

/* ───────────── write ───────────── */
const readme = parts.join("\n");
await rm(new URL(`${IMG_DIR}/`, OUT), { recursive: true, force: true });
await mkdir(new URL(`${IMG_DIR}/`, OUT), { recursive: true });
for (const [path, content] of files) await writeFile(new URL(path, OUT), content);
await writeFile(new URL("README.md", OUT), readme);
console.log(`README.md written with ${files.size} images (${[...files.keys()].map((f) => f.split("/").pop().replace(/-(dark|light)\.svg$/, "")).filter((v, i, a) => a.indexOf(v) === i).join(", ")})`);
