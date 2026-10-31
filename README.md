# Lampa Helper

A single Lampa plugin, [`helper.js`](helper.js) (version 1.8.1). It adds playback, viewing-history, region, age-confirmation, and Online Mod fixes.

## Install

1. Enable GitHub Pages in **Settings → Pages**. Select **Deploy from a branch**, then choose `main` and `/ (root)`.
2. In Lampa, open **Settings → Extensions → Add plugin** and enter the direct HTTPS URL to `helper.js`:

   ```text
   https://justbench.github.io/lampa/helper.js
   ```

3. Reload Lampa.

Add the plugin separately in each browser or Lampa device where you want to use it. To remove it, delete it from Extensions and reload Lampa.

## Features

### Playback and trailers

- The Play button opens the installed Online Mod directly when its source is available and visible. Otherwise, Lampa shows its regular source menu.
- Lampa's native Trailers button is moved next to Play, retaining its original handler.
- Online Mod is a separate plugin and must remain installed: <https://nb557.github.io/plugins/online_mod.js>.

### Viewing history

Selecting a movie or series card in Lampa's viewing history opens its full page directly instead of opening the per-day viewing-history panel. This behavior was added in version 1.8.0 and updated in 1.8.1 to cover Lampa's synchronized history screen. It has not yet been verified in a live Lampa session.

### HDrezka login through a proxy

The helper adapts Online Mod's HDrezka login buttons for browsers and web views where a direct cross-origin login request is blocked. It uses Online Mod's alternative proxy, stores the session cookies through that proxy, and enables the HDrezka proxy after login. Logout clears the stored cookies and attempts to end the site session.

On non-Android devices, the helper enables Online Mod's alternative proxy and sets its URL from `OWN_PROXY_URL` in `helper.js`. The HDrezka mirror is fixed to `kvk.zone`. Online Mod may also route Filmix requests through the alternative proxy, so a custom proxy must allow `filmix.gg` and `filmixapp.cyou` as well as the required HDrezka hosts. On Android, Online Mod's native login behavior is preserved.

To use a different proxy, update `OWN_PROXY_URL` and make sure the proxy is configured with a host allowlist. The helper does not provide or configure the proxy server itself. Online Mod's username and password are sent through the configured proxy to the selected mirror.

### Region handling

Lampa falls back to the Russian region when its geo lookup fails or returns an invalid value. The helper checks the same geo service over HTTPS, then HTTP, and adjusts Lampa's RU/BY region checks using the result. If the lookup fails, those checks return false and Lampa's user settings determine the behavior. Other region checks are left unchanged.

Outside RU/BY, the helper prevents Lampa's LGBT keyword and catalog-list checks from running unless **Block LGBT content** is enabled. It also restores that setting when Lampa hides it based on its region result.

### Adult-content confirmation

After **I am 18 or older** is confirmed (`adult_content_view = true`), the helper clears TMDB's `adult` flag when the full card starts. This removes the adult-content warning and poster badge that Lampa's keyword-only confirmation does not clear.

## Compatibility and verification

The code uses ES5 syntax for older TV browsers and retries installation while Lampa APIs and Online Mod settings become available. Changes to those APIs may require updates.

The Online Mod Play-menu and Trailers behavior was previously checked in a local web build. The viewing-history handling, including the 1.8.1 synchronized-history fix, has not been tested in Lampa. TV-device compatibility and actual video playback have not been verified.
