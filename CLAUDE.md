# Repo notes for Claude

- **Git workflow:** commit and push directly to `main`. Do not create side branches or pull requests unless asked.
- **No hand-typed or sample data anywhere.** Every number, name, project, video and supporter comes from a live source (`js/sources.js`, browser) or the "Sync ledger" Action (`scripts/sync.mjs` → `data/snapshot.json`). `ledger.config.js` holds account names only. Sections without data stay hidden.
- **Totals math lives in one place:** `LedgerSources.summarize()` in `js/sources.js`. The site and the README generator both call it.
- **README.md is generated** by `scripts/readme.mjs` (cards in `docs/readme/`, dark + light). Don't hand-edit it; change the generator. It is about the owner's content, not the code. Code/setup docs live in `docs/SETUP.md`.
- **Style:** dark by default, grayscale plus semantic green/yellow/red only (live/synced/error, funded/paused/closed, heatmap). Tokens are in `styles.css`. Click flair is a light burst + press-in with no overshoot or wobble.
- **Privacy:** never publish emails; anonymous/private supporters stay unnamed; Patreon names are opt-in.
