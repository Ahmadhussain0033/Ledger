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
// Direct entries (cash, transfers) from data/manual.json
try { sources.push({ id: "manual", label: "Direct", data: L.manual(JSON.parse(await readFile(env.MANUAL_IN || new URL("data/manual.json", root), "utf8"))) }); } catch {}
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
const balance = D.raised - D.spent;

// ── Header card: who, status, and a real mini-chart of money in per month
const name = P ? P.name : C.github || "Ledger";
const bio = P && P.bio ? P.bio : "";
const bioLines = wrap(bio, 19, 640, 2);
both("header", (t) => {
  const av = avatar
    ? `<clipPath id="av"><rect x="56" y="56" width="88" height="88" rx="22"/></clipPath><filter id="gs"><feColorMatrix type="saturate" values="0"/></filter><image href="${avatar}" x="56" y="56" width="88" height="88" clip-path="url(#av)" filter="url(#gs)"/>`
    : `<rect x="56" y="56" width="88" height="88" rx="22" fill="${t.fill}"/>${text(100, 112, initials(name), { size: 30, weight: 600, fill: t.fillInk, anchor: "middle" })}`;
  const status = g.status && g.status.message ? g.status.message : "Open to support";
  const sw = width(status, 13.5) + 44;
  const statusSvg = `<rect x="160" y="88" width="${sw}" height="30" rx="15" fill="none" stroke="${t.line}"/><circle cx="178" cy="103" r="4" fill="${t.good}"/>${text(190, 108, fit(status, 13.5, 380), { size: 13.5, fill: t.ink2 })}`;
  const ms = months(12);
  let deco = "";
  if (ms.some((m) => m.total > 0)) {
    const max = Math.max(...ms.map((m) => m.total));
    deco = label(856, 92, "Money in · 12 months", t) + ms.map((m, i) => { const h = m.total ? Math.max(4, (m.total / max) * 150) : 3; return `<rect x="${856 + i * 30}" y="${262 - h}" width="20" height="${h}" rx="4" fill="${m.total ? t.fill : t.soft}"/>`; }).join("");
  }
  return frame(1280, 330, t,
    av + statusSvg +
    text(56, 214, fit(name, 64, 760), { size: 64, weight: 600, fill: t.ink, ls: -2.5 }) +
    text(58, 250, [P ? `@${P.login}` : "", P && P.location, P && P.company].filter(Boolean).join("  ·  "), { size: 16, mono: true, fill: t.muted }) +
    bioLines.map((l, i) => text(56, 288 + i * 26, l, { size: 19, fill: t.ink2 })).join("") + deco, { grid: true });
});
parts.push(`<div align="center">\n\n${pic("header", `${name}${bio ? ` · ${bio}` : ""}`)}\n`);

// ── Buttons: the live site and every way to give (shields render live)
const sh = (labelTxt, msg, logo) => `https://img.shields.io/badge/${encodeURIComponent(labelTxt).replace(/-/g, "--")}-${encodeURIComponent(msg).replace(/-/g, "--")}-111111?style=for-the-badge&labelColor=2b2b2b${logo ? `&logo=${logo}&logoColor=white` : ""}`;
const supportLinks = {
  githubSponsors: [`https://github.com/sponsors/${C.github}`, "githubsponsors"], patreon: [`https://www.patreon.com/${SRC.patreon}`, "patreon"],
  kofi: [`https://ko-fi.com/${SRC.kofi}`, "kofi"], buymeacoffee: [`https://www.buymeacoffee.com/${SRC.buymeacoffee}`, "buymeacoffee"],
  opencollective: [`https://opencollective.com/${SRC.opencollective}/donate`, "opencollective"], liberapay: [`https://liberapay.com/${SRC.liberapay}/donate`, "liberapay"],
  paypal: [`https://paypal.me/${SRC.paypal}`, "paypal"],
};
const buttons = [];
if (siteUrl) buttons.push(`<a href="${attr(siteUrl)}"><img alt="Open the live ledger" src="${sh("open", "live ledger", "")}"></a>`);
for (const id of configured) if (supportLinks[id]) buttons.push(`<a href="${attr(supportLinks[id][0])}"><img alt="${attr(LABELS[id])}" src="${sh("support on", LABELS[id], supportLinks[id][1])}"></a>`);
if (C.discordServerId) buttons.push(`<a href="${attr(C.discordInvite || (snap.discord && snap.discord.invite) || "#")}"><img alt="Discord" src="https://img.shields.io/discord/${encodeURIComponent(C.discordServerId)}?style=for-the-badge&logo=discord&logoColor=white&label=online&color=111111&labelColor=2b2b2b"></a>`);
if (buttons.length) parts.push(`${buttons.join("\n")}\n`);
parts.push(`</div>\n`);

// ── Intro
parts.push(`\n> **My open ledger.** What I'm building, what it costs, who's chipped in, and where every dollar goes. Every number here is pulled from the source and refreshed automatically.\n`);

// ── Money card: balance, in, out, supporters, and how much of the money in has gone out
if (D.parts.length || D.expenses.length) {
  both("money", (t) => {
    const cells = [["Money in", money(Math.round(D.raised)), t.good], ["Money out", money(Math.round(D.spent)), t.ink], ["Supporters", int(D.supporters || D.leaders.length), t.ink]];
    const share = D.raised > 0 ? Math.min(1, D.spent / D.raised) : 0;
    let out = label(40, 52, "Balance", t) + text(40, 112, money(Math.round(balance)), { size: 56, mono: true, weight: 500, fill: t.ink, ls: -2 });
    cells.forEach(([l, v, col], i) => {
      const x = 560 + i * 240;
      out += `<line x1="${x - 32}" y1="34" x2="${x - 32}" y2="118" stroke="${t.line}"/>` + label(x, 52, l, t) + text(x, 100, fit(v, 32, 200, true), { size: 32, mono: true, weight: 500, fill: col, ls: -1 });
    });
    out += `<rect x="40" y="148" width="1200" height="6" rx="3" fill="${t.soft}"/>`;
    if (D.raised > 0) out += `<rect x="40" y="148" width="${Math.max(6, 1200 * share)}" height="6" rx="3" fill="${t.fill}"/>`;
    out += text(40, 182, D.raised > 0 ? `${Math.round(share * 100)}% of the money in has been spent` : "Nothing in yet", { size: 13.5, fill: t.muted });
    return frame(1280, 206, t, out);
  });
  parts.push(`\n${pic("money", `Balance ${money(Math.round(balance))}: ${money(Math.round(D.raised))} in, ${money(Math.round(D.spent))} out`)}\n`);
}

let secN = 0;
const heading = (title, sub) => { secN++; return `\n## \`${String(secN).padStart(2, "0")}\` · ${title}\n${sub ? `\n<sub>${sub}</sub>\n` : ""}`; };

// ── The ledger: latest money in and out, with receipts
const entries = [
  ...D.payments.map((p) => ({ date: p.date, who: p.name || "Anonymous", note: [p.message, p.sourceLabel].filter(Boolean).join(" · "), sign: "+", value: p.value, amount: p.amount, currency: p.currency, receipts: null })),
  ...D.expenses.map((e) => ({ date: e.date, who: e.title, note: [e.vendor, e.category].filter(Boolean).join(" · "), sign: "−", value: e.value, amount: e.amount, currency: e.currency, receipts: e.receipts || [], receiptNote: e.receiptNote })),
].sort((a, b) => String(b.date).localeCompare(String(a.date)));
if (entries.length) {
  parts.push(heading("The ledger", `Latest money in and out.${siteUrl ? ` Search the full history and every receipt on the <a href="${attr(siteUrl)}#search">live ledger</a>.` : ""}`));
  const amt = (x) => `${x.sign}${x.value != null ? money(x.value) : money(x.amount, x.currency)}`;
  const rc = (x) => (x.receipts == null ? "" : x.receipts.length ? x.receipts.map((r, i) => `[receipt${x.receipts.length > 1 ? ` ${i + 1}` : ""}](${r.url})`).join(" ") : `<sub>${md(x.receiptNote || "none yet")}</sub>`);
  parts.push(`\n| Date | | Entry | Amount | Receipt |\n|---|:-:|---|--:|:-:|\n${entries.slice(0, 12).map((x) => `| ${date(x.date)} | ${x.sign === "+" ? "in" : "out"} | **${md(x.who)}**${x.note ? ` <sub>${md(x.note)}</sub>` : ""} | ${amt(x)} | ${rc(x)} |`).join("\n")}\n`);
  if (D.byCategory.length > 1) parts.push(`\n<sub>Spent by category: ${D.byCategory.slice(0, 5).map((c) => `<code>${xml(c.category)}</code> ${money(Math.round(c.value))}`).join(" · ")}</sub>\n`);
}

// ── What I'm working on
const STATUS = { active: ["Active", "solid"], planned: ["Planned", "line"], paused: ["Paused", "warn"], funded: ["Funded", "good"], cancelled: ["Closed", "bad"] };
const projOrder = ["active", "planned", "paused", "funded", "cancelled"];
const projects = D.projects.filter((p) => p.status !== "cancelled").sort((a, b) => projOrder.indexOf(a.status) - projOrder.indexOf(b.status)).slice(0, 8);
if (projects.length) {
  parts.push(heading("What I'm working on", `Put <code>#tag</code> in your donation message to fund a specific one.`));
  const cells = projects.map((p) => {
    const pct = p.goal ? p.raised / p.goal : null;
    both(`project-${p.number}`, (t) => {
      const [st, kind] = STATUS[p.status] || [p.status, "line"];
      const desc = wrap(firstPara(p.body, 200), 15, 560, 2);
      return frame(620, 210, t,
        badge(28, 26, st, t, kind) + text(592, 42, `#${p.tag}`, { size: 13, mono: true, fill: t.muted, anchor: "end" }) +
        text(28, 84, fit(p.title, 24, 564), { size: 24, weight: 600, fill: t.ink, ls: -0.6 }) +
        desc.map((l, i) => text(28, 112 + i * 21, l, { size: 15, fill: t.muted })).join("") +
        text(28, 178, money(p.raised), { size: 18, mono: true, weight: 500, fill: t.ink }) +
        text(28 + width(money(p.raised), 18, true) + 6, 178, p.goal ? `/ ${money(p.goal)}` : "raised", { size: 14, mono: !!p.goal, fill: t.muted }) +
        (pct != null ? text(592, 178, `${Math.round(pct * 100)}%`, { size: 14, mono: true, fill: t.muted, anchor: "end" }) + bar(28, 188, 564, 7, pct, t) : ""));
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
  for (const gl of D.goals) {
    const pct = gl.target ? gl.current / gl.target : 0;
    const line = gl.unit === "count" ? `${int(gl.current)} of ${int(gl.target)} sponsors` : `${money(gl.current, gl.sourceCurrency)} of ${money(gl.target, gl.sourceCurrency)}${gl.period ? ` / ${gl.period}` : ""}`;
    both(`goal-${gl.sourceId}`, (t) => frame(1280, 120, t,
      badge(32, 26, `${gl.source} goal`, t, "line") + text(32, 86, fit(gl.title, 24, 560), { size: 24, weight: 600, fill: t.ink, ls: -0.6 }) +
      text(640, 66, line, { size: 15, mono: true, fill: t.ink2 }) + bar(640, 80, 480, 10, pct, t) +
      text(1248, 90, `${Math.round(pct * 100)}%`, { size: 22, mono: true, fill: t.ink, anchor: "end" })));
    parts.push(`<a href="${attr(gl.url || "#")}">${pic(`goal-${gl.sourceId}`, `${gl.title}: ${line}`)}</a>\n`);
  }
}

// ── Milestones: a strip of the latest wins and progress to the next one
if (D.milestones.length) {
  const WIN = {
    first: (m) => `First donation`, raised: (m) => `${money(m.threshold)} raised`, donors: (m) => `${int(m.threshold)} donors`,
    project: (m) => `Funded: ${m.title}`, drive: (m) => `Drive done: ${m.title}`, goal: (m) => `${m.source} goal reached`,
  };
  parts.push(heading("Milestones"));
  const ms = D.milestones.slice(0, 4).reverse();
  const n = D.next.raised;
  both("milestones", (t) => {
    const W = 1280, x0 = 60, x1 = n ? 1000 : 1220, y = 92;
    let out = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${t.line}" stroke-width="2"/>`;
    ms.forEach((m, i) => {
      const x = ms.length === 1 ? x0 : x0 + (i * (x1 - x0)) / Math.max(1, ms.length - 1 + (n ? 1 : 0));
      out += `<circle cx="${x}" cy="${y}" r="7" fill="${t.good}"/>` + text(x, y - 26, (WIN[m.kind] || (() => m.kind))(m), { size: 16, weight: 600, fill: t.ink, anchor: i === 0 ? "start" : "middle" }) +
        text(x, y + 36, m.date ? date(m.date) : "now", { size: 12.5, mono: true, fill: t.muted, anchor: i === 0 ? "start" : "middle" });
    });
    if (n) {
      const pct = Math.max(0, Math.min(1, (n.current - n.prev) / (n.threshold - n.prev)));
      out += `<line x1="${x1}" y1="${y}" x2="${1220}" y2="${y}" stroke="${t.line}" stroke-width="2" stroke-dasharray="4 6"/>` +
        `<circle cx="1220" cy="${y}" r="7" fill="none" stroke="${t.faint}" stroke-width="2"/>` +
        text(1220, y - 26, `Next: ${money(n.threshold)}`, { size: 16, weight: 600, fill: t.ink2, anchor: "end" }) +
        text(1220, y + 36, `${Math.round(pct * 100)}% there`, { size: 12.5, mono: true, fill: t.muted, anchor: "end" });
    }
    return frame(W, 160, t, out);
  });
  parts.push(`\n${pic("milestones", D.milestones.slice(0, 4).map((m) => (WIN[m.kind] || (() => m.kind))(m)).join(", "))}\n`);
}

// ── Supporters
if (D.leaders.length || D.payments.length) {
  parts.push(heading("Supporters", "Thank you. Anonymous gifts count toward the totals but are never named."));
  const anon = D.payments.filter((p) => !p.name);
  if (D.leaders.length) parts.push(`\n| | Name | Total | Gifts |\n|--:|---|--:|--:|\n${D.leaders.slice(0, 8).map((s, i) => `| ${i + 1} | **${md(s.name)}** | ${money(Math.round(s.total))}${s.monthly ? ` <sub>${money(Math.round(s.monthly))}/mo</sub>` : ""} | ${s.count} |`).join("\n")}\n`);
  if (anon.length) parts.push(`\n<sub>Plus ${anon.length} anonymous gift${anon.length === 1 ? "" : "s"} totalling ${money(Math.round(anon.reduce((t, p) => t + (p.value || 0), 0)))}.</sub>\n`);
}

// ── Ways to support (crypto addresses; platform buttons are at the top)
const wallets = ["bitcoin", "ethereum"].filter((id) => SRC[id]);
if (wallets.length) {
  parts.push(heading("Crypto"));
  parts.push(`\n${wallets.map((id) => `**${LABELS[id]}**\n\`\`\`\n${SRC[id]}\n\`\`\``).join("\n\n")}\n`);
}

// ── Videos
const vids = (snap.youtube && snap.youtube.videos) || [];
if (vids.length) {
  parts.push(heading("Latest videos", `From <a href="${attr(snap.youtube.url)}">${xml(snap.youtube.title || "my channel")}</a>.`));
  const v6 = vids.slice(0, 3);
  parts.push(`\n<table>\n<tr>\n${v6.map((v) => `<td width="33%" valign="top"><a href="https://www.youtube.com/watch?v=${attr(v.id)}"><img alt="${attr(v.title)}" src="https://i.ytimg.com/vi/${attr(v.id)}/hqdefault.jpg" width="100%"></a><br><sub><b>${xml(v.title)}</b><br>${date(v.published)}</sub></td>`).join("\n")}\n</tr>\n</table>\n`);
}

// ── Get in touch
const contact = [];
const email = C.email || (P && P.email);
const LOGO = { github: "github", twitter: "x", instagram: "instagram", youtube: "youtube", tiktok: "tiktok", linkedin: "linkedin", threads: "threads", bluesky: "bluesky", twitch: "twitch", reddit: "reddit", facebook: "facebook", mastodon: "mastodon", npm: "npm" };
if (email) contact.push(`<a href="mailto:${attr(email)}"><img alt="Email" src="${sh("email", email, "maildotru")}"></a>`);
for (const x of L.socialLinks({ profile: P, socials: g.socials, overrides: C.socials })) contact.push(`<a href="${attr(x.url)}"><img alt="${attr(x.name)}" src="${sh(x.name, x.handle, LOGO[x.provider] || "")}"></a>`);
if (contact.length) parts.push(heading("Get in touch"), `\n<p>\n${contact.join("\n")}\n</p>\n`);

// ── Footer
const brand = (P && P.company ? P.company.replace(/^@/, "") : P && P.name) || "";
if (brand) parts.push(`\n---\n\n<div align="center">\n<sub><b>${xml(brand)} ${new Date().getFullYear()}</b></sub>\n</div>\n`);

/* ───────────── write ───────────── */
const readme = parts.join("\n");
await rm(new URL(`${IMG_DIR}/`, OUT), { recursive: true, force: true });
await mkdir(new URL(`${IMG_DIR}/`, OUT), { recursive: true });
for (const [path, content] of files) await writeFile(new URL(path, OUT), content);
await writeFile(new URL("README.md", OUT), readme);
console.log(`README.md written with ${files.size} images (${[...files.keys()].map((f) => f.split("/").pop().replace(/-(dark|light)\.svg$/, "")).filter((v, i, a) => a.indexOf(v) === i).join(", ")})`);
