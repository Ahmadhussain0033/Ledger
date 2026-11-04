# Ledger

A single-page, grayscale dashboard showing what I'm working on, what it costs, who has helped, and how to reach me.

No build step and no dependencies: plain HTML, CSS and JS.

## Edit your info

**Everything lives in [`data.js`](data.js).** Open it, replace the sample values, then set `demo: false` to hide the "sample data" badge.

| Section | What to edit in `data.js` |
|---|---|
| Header / profile | `profile`: name, handle, tagline, timezone, avatar URL, status |
| What I'm working on | `projects`: title, goal, status (`active` / `planned` / `funded` / `paused`), tags |
| Funding drives | `drives`: goal, `start` / `end` dates, optional linked `project` |
| Supporters ledger | `contributions`: one row per payment (name, amount, date, project, platform, note, `anonymous`) |
| Ways to support | `platforms`: donation links; crypto entries take an `address` and get a copy button |
| Contact | `contacts`: email, Discord, GitHub username, socials |

**How the totals work:** project progress, drive progress, total raised, supporter count, the monthly chart and the leaderboard are all computed from `contributions`. Log a payment once and every widget updates. Money you don't want to log row by row can go in a project's `raisedExternal`.

### Optional live widgets
- **Discord online count:** put your server ID in `contacts.discord.serverId` and turn on *Server Settings → Widget → Enable Server Widget* in Discord.
- **GitHub stats:** set `contacts.github` to your username. It uses the public GitHub API (no key needed; the API is rate-limited per visitor IP).

## Features
- Bento overview: total raised with sparkline, supporters, live drive ring with countdown, local-time clock, Discord, GitHub
- Project cards with filters, animated progress, and a detail modal
- Funding drives with a live countdown
- Monthly contributions chart (6M / 12M / All) with hover and keyboard tooltips
- Searchable, sortable, filterable contributions ledger
- Command palette: `⌘K` / `Ctrl K` or `/`
- Light and dark themes (follows your system; the toggle is remembered)
- Responsive down to phone width; respects reduced-motion settings

## Run locally
Open `index.html` in a browser. Or serve the folder:

```bash
python3 -m http.server 8000
```

## Publish with GitHub Pages
Repo **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch and `/ (root)`. The site goes live at `https://<username>.github.io/Ledger/`.
