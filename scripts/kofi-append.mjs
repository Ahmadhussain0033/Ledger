// Appends one Ko-fi donation (forwarded by relay/kofi-worker.js through a
// repository_dispatch event) to data/kofi.json. Emails are never stored.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const p = JSON.parse(process.env.KOFI_PAYLOAD || "{}");
const amount = Number(p.amount);
if (!p.id || !p.date || !Number.isFinite(amount) || amount <= 0) {
  console.error("Ignoring malformed Ko-fi payload:", JSON.stringify(p));
  process.exit(0);
}
const clean = (s, n) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
const entry = {
  id: String(p.id).slice(0, 80),
  date: new Date(p.date).toISOString(),
  amount,
  currency: clean(p.currency, 3)?.toUpperCase() || "USD",
  type: clean(p.type, 40),
  name: clean(p.name, 80),
  message: clean(p.message, 500),
  subscription: !!p.subscription,
};

const file = new URL("../data/kofi.json", import.meta.url);
let list = [];
try { list = JSON.parse(await readFile(file, "utf8")); } catch { list = []; }
if (list.some((e) => e.id === entry.id)) { console.log(`Ko-fi ${entry.id} already recorded`); process.exit(0); }
list.push(entry);
list.sort((a, b) => a.date.localeCompare(b.date));
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(file, JSON.stringify(list, null, 2) + "\n");
console.log(`Recorded Ko-fi ${entry.type || "payment"} of ${entry.amount} ${entry.currency}`);
