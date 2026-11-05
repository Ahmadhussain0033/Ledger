# How this ledger works

Nothing on the site or the README is typed in by hand. [`ledger.config.js`](../ledger.config.js) only holds **account names**. Every number, name, project and video is pulled from those accounts.

```text
                       ┌──────────────── in the visitor's browser, every 60 s ───────────────┐
 ledger.config.js ───► │ GitHub profile · repos · issues (projects) · milestones (drives)    │
 (account names)       │ Open Collective · Liberapay · Bitcoin · Ethereum · Discord · FX     │──► the site
                       └──────────────────────────────────────────────────────────────────────┘
                       ┌──────────────── GitHub Action "Sync ledger", every 30 min ──────────┐
                       │ GitHub Sponsors · Patreon · Buy Me a Coffee · Ko-fi (webhook)       │──► data/snapshot.json ──► site + README.md
                       │ YouTube · contribution heatmap · pinned repos · fallback copies     │
                       └──────────────────────────────────────────────────────────────────────┘
```

On the site, each source shows a coloured dot: **green** = fetched live just now, **yellow** = from the last Action sync, **red** = failed (the reason is shown).

---

## 1. Turn the site on

1. **Settings → Pages → Deploy from a branch → `main` / `(root)`.** The site goes live at `https://<you>.github.io/Ledger/`.
2. **Actions tab → enable workflows** if GitHub asks. Then open **Sync ledger → Run workflow** once. That writes `data/snapshot.json` and rebuilds `README.md`.

> GitHub pauses scheduled workflows after 60 days without repo activity. If the README stops updating, press **Run workflow** again.

## 2. Projects = GitHub issues

Open an issue in this repo, add the **`funding`** label, and put these lines anywhere in the description:

```text
goal: $2400
tag: workstation
```

- The title, description, 👍 reactions and comments show on the card. Visitors can upvote to show interest.
- **Status:** open = Active. Add a `planned` or `paused` label to change that. Close the issue as *completed* = Funded; close it as *not planned* = hidden.
- **Raised:** any donation whose message contains `#workstation` counts toward it. Without a `tag:` line, the tag is the issue number (`#12`).

## 3. Drives = milestones

Create a milestone with a **due date** and `goal: $1500` in its description. It shows a live countdown.

- If issues are attached to the milestone, only donations tagged for those projects count.
- Otherwise every donation between the milestone's creation and its due date counts.

Platform goals (GitHub Sponsors, Liberapay) appear next to the drives automatically.

## 4. Expenses & receipts = issues too

Open an issue with the **`expense`** label. The title is what you bought. Add these lines:

```text
amount: $129.99
vendor: Newegg
category: hardware
tag: workstation        (optional: counts it against that project)
date: 2026-10-12        (optional: defaults to when the issue was opened)
```

Drag the receipt photo or PDF into the issue. It shows up as a **Receipt** button on the site, with an image viewer. Open Collective expenses are pulled in automatically, each linked to its public expense page.

## 5. Milestones

Nothing to set up. Milestones are worked out from your payments:

- the first donation
- $100, $250, $500, $1k … raised
- 10, 25, 50 … donors
- funded projects and finished drives
- platform goals reached

Clicking one plays a small celebration, and new ones celebrate once for each visitor.

## 6. Donation platforms

Fill in the names under `sources` in `ledger.config.js`. Only what you fill in appears.

| Platform | Config | Extra setup | What shows |
|---|---|---|---|
| Open Collective | `opencollective: "slug"` | none | raised, balance, contributors, every contribution |
| Liberapay | `liberapay: "user"` | none | weekly income, patrons, goal |
| Bitcoin | `bitcoin: "bc1…"` | none (use an address only for donations) | every incoming payment |
| Ethereum | `ethereum: "0x…"` | none | incoming transfers |
| GitHub Sponsors | `githubSponsors: true` | optional secret `SPONSORS_TOKEN`: classic PAT with `read:user`. Without it, only the sponsor count and goal show | sponsors, monthly income, lifetime totals, goal |
| Patreon | `patreon: "name"` | secret `PATREON_TOKEN`: [creator access token](https://www.patreon.com/portal/registration/register-clients); variable `PATREON_CURRENCY` if not USD | patrons, monthly, lifetime total. Names hidden unless `privacy.showPatreonNames` |
| Buy Me a Coffee | `buymeacoffee: "user"` | secret `BMC_TOKEN` from [developers.buymeacoffee.com](https://developers.buymeacoffee.com) | every public coffee + message, memberships |
| Ko-fi | `kofi: "user"` | deploy the relay (below) | every payment from now on |
| PayPal | `paypal: "name"` | none | link only (PayPal has no public feed) |

Secrets go in **Settings → Secrets and variables → Actions**.

### Ko-fi relay

Ko-fi has no API; it can only *send* a webhook. [`relay/kofi-worker.js`](../relay/kofi-worker.js) is a tiny Cloudflare Worker that receives it and forwards it to this repo.

1. Create a Worker at [dash.cloudflare.com](https://dash.cloudflare.com) and paste the file in.
2. Add these variables to the Worker:
   - `KOFI_VERIFICATION_TOKEN`: from Ko-fi → Settings → API.
   - `GITHUB_TOKEN`: a fine-grained PAT for this repo only, with *Contents: Read and write*.
   - `GITHUB_REPO`: `owner/Ledger`.
3. Paste the Worker URL into Ko-fi → Settings → API → Webhook URL. Ko-fi's "Send test" button should add a row to `data/kofi.json`.

Private Ko-fi supporters stay anonymous, and emails are never stored.

## 7. Everything else

| Setting | What it does |
|---|---|
| `youtube` | channel ID (`UC…`) or `@handle`: Videos section, latest uploads with view counts |
| `discordServerId` | Discord → Server Settings → Widget → enable. Shows the live online count |
| `timezone` | e.g. `Asia/Karachi`: the local-time tile ("5h ahead of you") |
| `font` | the default font pairing: `geist`, `inter`, `editorial`, `grotesk`, `bricolage`, `plex`, `manrope`, `syne` or `mono`. Visitors can try the others with ⌘K → Fonts |
| `socials` | handles that override your GitHub profile links, e.g. `instagram: "theahemod"` |
| `email` | blank uses the public email on your GitHub profile |
| `currency` | everything is converted to this; crypto at today's price |
| socials | come from your GitHub profile's social links. Edit them on GitHub |

## Icons

UI icons come from [Lucide](https://lucide.dev) (1,500+ icons), and brand logos from [Simple Icons](https://simpleicons.org) (3,000+). Both are bundled into `js/icons.js`. To add one, put its name in `scripts/build-icons.mjs`, run `node scripts/build-icons.mjs`, then use it as `icon("name")` or `icon("brand:slug")`.

## Checking your setup

Open the site with **`?setup`** at the end of the URL (or run it locally). A checklist shows what's connected and what isn't. Visitors never see it.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Files

```text
index.html, styles.css    the page
js/sources.js             every public API adapter + the shared totals math
js/app.js                 rendering, refresh loop, interactions, fonts
js/icons.js               generated icon bundle (Lucide + Simple Icons)
ledger.config.js          your account names (the only file you edit)
scripts/sync.mjs          the Action's fetcher (token sources, YouTube, heatmap)
scripts/readme.mjs        rebuilds README.md + docs/readme/*.svg from the data
scripts/kofi-append.mjs   records a Ko-fi payment
scripts/build-icons.mjs   rebuilds js/icons.js
relay/kofi-worker.js      Ko-fi webhook → GitHub relay
data/snapshot.json        written by the Action (don't edit)
```
