# Project Instructions

## Project overview

This repository contains a browser-compatible Lampa plugin. The main plugin is `helper.js`; it is a standalone script loaded by Lampa, not a Node.js application.

`README.md` is the user-facing English installation and behavior guide. Keep it aligned with the actual plugin behavior and state clearly when a feature has not been verified in a live Lampa session.

## Files

- `helper.js` — the plugin implementation.
- `README.md` — installation, feature descriptions, dependencies, and verification notes.
- `LICENSE` — repository license; preserve it.
- `AGENTS.md` — project instructions for coding agents.
- `CLAUDE.md` — Claude Code entry point that imports these instructions.

The former `kp.js` Kinopoisk plugin was intentionally removed. Do not restore it unless the user requests it. This is not an npm project: do not add a package manifest, placeholder `index.js`, build system, or dependencies without a concrete need and user request.

## Plugin behavior map

`helper.js` is an ES5-style IIFE and installs independent features with retry loops:

- `installDirectPlay()` — wraps Lampa's source selector to open the visible Online Mod source directly and moves Lampa's native Trailers button next to Play.
- `installHistoryDirectOpen()` — intercepts card entry only in the `favorite` activity with type `history`, routing the selected card to its full page. This feature has not been confirmed in a live Lampa session; do not describe it as verified until it is tested there.
- `installRezkaLogin()` and helpers — adapts Online Mod's HDrezka login/logout to its alternative proxy, fixes the mirror to `kvk.zone`, and configures `OWN_PROXY_URL` on non-Android platforms.
- `installRegionFix()` — adjusts RU/BY region checks based on the geo lookup and manages the LGBT content toggle/list behavior.
- `installAdultFix()` — clears TMDB's `adult` flag on full-card start after the user has confirmed adult content in Lampa settings.

Online Mod is a separate required plugin for direct playback and HDrezka functionality. Its current URL is documented in `README.md` and `helper.js`.

## Implementation rules

- Keep the plugin compatible with older TV browser engines. Use ES5 syntax: `var`, function expressions, and no modules, classes, arrow functions, optional chaining, or newer collection APIs.
- Keep each patch narrowly scoped. Preserve normal Lampa behavior when a feature is unavailable, its source/button is hidden, or required APIs are not ready.
- Make installers safe to retry and safe against duplicate listeners or wrappers. Follow the existing markers and retry pattern.
- Do not rename or change Online Mod/Lampa storage keys, mirror values, request formats, or proxy behavior without checking the owning code and documenting the change.
- Never log or commit usernames, passwords, session cookies, or other account data. Treat changes to `OWN_PROXY_URL` and proxy host allowlists as security-sensitive and document their effect.
- Prefer existing public Lampa APIs. Before relying on an API or event shape, inspect its current implementation or an authoritative source; older local source snapshots may be stale.
- Keep comments and user-facing documentation in English. Update `README.md` when user-visible behavior, installation, dependencies, or verification state changes.

## Verification

- There is no build or test setup in this repository. Do not invent a package/test framework for routine changes.
- Do not add or run tests unless the user asks for testing or verification.
- When the user asks to verify a change, inspect the diff and run only checks that are supported by the repository. Live behavior claims require testing in Lampa; source inspection alone is not live verification.
- Do not publish, push, or deploy changes unless the user explicitly asks.
