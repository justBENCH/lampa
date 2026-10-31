# Project Instructions

## Project overview

This repository contains a browser-compatible Lampa plugin. The main plugin is `helper.js`; it is a standalone script loaded by Lampa, not a Node.js application.

`README.md` is the user-facing English installation and behavior guide. Keep it aligned with the actual plugin behavior and state clearly when a feature has not been verified in a live Lampa session.

## Understanding Lampa

This repository is an external plugin, not the Lampa application source. The app's runtime API is exposed through `window.Lampa`; plugins are injected as standalone scripts. For Lampa internals, use the upstream source and its plugin-development guide:

- Source: <https://github.com/yumata/lampa-source>
- English plugin guide: <https://github.com/yumata/lampa-source/tree/main/docs/en>
- Russian plugin guide: <https://github.com/yumata/lampa-source/tree/main/docs/ru>

Read the relevant guide and inspect the corresponding implementation before relying on an API. Start with these paths when tracing behavior:

- App startup and plugin readiness: `src/app.js`, `docs/en/01-getting-started.md`, `docs/en/02-lifecycle.md`.
- Global events and subscriptions: `src/utils/subscribe.js`, `src/services/events.js`, `src/app.js`, `docs/en/03-events.md`.
- Navigation, activities, registered components, and routes: `src/interaction/activity/activity.js`, `src/core/router.js`, `src/core/component.js`, `docs/en/07-navigation.md`.
- Full movie/series page: `src/components/full.js`, `src/components/full/`.
- Favorite and viewing-history lists: `src/components/favorite.js`, `src/components/watch_history.js`, `src/interaction/items/category/`, and `src/interaction/card/module/history.js`.
- Card instances and their interaction: `src/interaction/card.js`, `src/interaction/card/`, `src/interaction/items/category/module/`.
- Source selector and dialogs: `src/interaction/select.js`, `docs/en/06-ui-components.md`.
- Settings registration: `src/interaction/settings/`, `docs/en/08-settings.md`.
- Common integration failures: `docs/en/11-pitfalls.md`.

The upstream tree changes over time and may be newer than the Lampa build used by a user. Check the target app/build where possible; do not assume that the upstream `main` branch exactly matches a deployed Lampa instance. Older source snapshots elsewhere on the machine are historical evidence, not the authority for current API behavior.

### Investigation workflow

For a Lampa behavior change:

1. Identify the user-visible screen and the action that triggers it (focus, enter/click, back, playback, or settings change).
2. Trace that action through the source: route/activity → component creation → card or UI instance → callback/event → resulting route or state change.
3. Verify the exact event payload, callback order, and public API in current upstream source and the relevant guide. If app/build version matters, verify against the user's actual Lampa build before treating the behavior as certain.
4. Implement the smallest plugin-side hook that covers only the requested screen and action. Preserve normal behavior elsewhere and avoid replacing broad global handlers when a scoped component hook exists.
5. Update `README.md` and this file when the feature map, API references, or verification status changes.

Lampa's UI uses its own focus/navigation system, including jQuery custom events such as `hover:enter` and `hover:focus`. Do not assume native DOM click handlers or desktop-only keyboard behavior are sufficient for TV remotes. Check the controller/focus guidance in `docs/en/13-controller.md` when changing navigation.

## Files

- `helper.js` — the plugin implementation.
- `README.md` — installation, feature descriptions, dependencies, and verification notes.
- `LICENSE` — repository license; preserve it.
- `AGENTS.md` — project instructions for coding agents.
- `CLAUDE.md` — Claude Code entry point that imports these instructions.
- `.gitignore` — excludes local IDE metadata in `.idea/`.

The former `kp.js` Kinopoisk plugin was intentionally removed. Do not restore it unless the user requests it. This is not an npm project: do not add a package manifest, placeholder `index.js`, build system, or dependencies without a concrete need and user request.

## Navigating this repository

There is one runtime entry point: `helper.js`. It is a self-executing IIFE loaded directly by Lampa. There is no bundling, transpilation, module loader, package manager, or generated output. Make runtime changes in `helper.js`; do not create another plugin file or split the script unless the user asks or a concrete need justifies it. `README.md` describes what users install; `AGENTS.md` describes how agents should work; `CLAUDE.md` imports this file for Claude Code.

The implementation is organized in this order:

1. `installHistoryDirectOpen()` — viewing-history card entry behavior. It hooks history activities at `init` (and handles an already-open activity), scoped to `watch_history` and legacy `favorite` with `type === 'history'`.
2. `installDirectPlay()` — Online Mod detection and Play/Trailers button behavior on the full-card page.
3. HDrezka proxy section — constants (`REZKA_*`, `OWN_PROXY_URL`, `USER_AGENT`), storage/request/cookie helpers, login/logout flows, settings-button patching, and `installRezkaLogin()`.
4. Region fallback section — geo request (`probeRegion()`), LGBT list guard and toggle helpers, and `installRegionFix()`.
5. Adult-content section — `installAdultFix()` listens to full-page start and handles TMDB's `adult` flag.
6. Startup section — `retry()` installs each feature independently, retrying every 500 ms for up to 240 attempts. Keep installers independent so a missing optional API does not prevent other features from loading.

Useful landmarks are function names rather than line numbers; line numbers move as the plugin changes. Search with `rg -n '^    function |^    var [A-Z_]+ =' helper.js` to get the current map. The Online Mod storage keys and request conventions are defined next to the HDrezka helpers; read those definitions before changing login behavior.

The remote repository is <https://github.com/justBENCH/lampa>. GitHub Pages currently publishes the root of `main` at <https://justbench.github.io/lampa/>; check the live Pages settings/build before relying on this deployment state. The installable plugin URL is <https://justbench.github.io/lampa/helper.js>.

Before editing, inspect `git status` and preserve unrelated user changes. After editing, review the complete diff for the touched files. Avoid committing local `.idea` metadata. Pushing or deployment requires an explicit user request.

## Plugin behavior map

`helper.js` is an ES5-style IIFE and installs independent features with retry loops:

- `installDirectPlay()` — wraps Lampa's source selector to open the visible Online Mod source directly and moves Lampa's native Trailers button next to Play.
- `installHistoryDirectOpen()` — intercepts card entry in the current synchronized `watch_history` activity and the legacy `favorite` activity with type `history`, routing the selected card to its full page. It also patches cards if the plugin loads after the history screen. This feature has not been confirmed after the latest fix in a live Lampa session; do not describe it as verified until it is tested there.
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
