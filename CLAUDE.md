# Repo notes for Claude

- **Git workflow:** commit and push directly to `main`. Do not create side branches or pull requests unless asked.
- **Site data:** all personal content lives in `data.js`. Totals are computed from `contributions`, so never hard-code them elsewhere.
- **Style:** grayscale only. Colors are tokens in `styles.css` (`:root` plus dark-mode overrides).
- **README images:** `docs/*-light.png` / `docs/*-dark.png` are 2x element screenshots with the `.grain` overlay hidden, saved as 8-bit grayscale PNGs.
