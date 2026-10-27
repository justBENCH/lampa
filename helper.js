/* Online Mod Direct Play v1.6.2
 * Install alongside https://nb557.github.io/plugins/online_mod.js
 *
 * 1. Play opens Online Mod directly, skipping the "Source" menu.
 * 2. The native Trailers button is moved right after Play.
 * 3. HDrezka login through your own proxy. Online Mod's "Log in to HDrezka"
 *    button posts straight to <mirror>/ajax/login/, which browsers and web
 *    views (lampa.mx, Media Station X, TV browsers) block by CORS. When Online
 *    Mod's alternative proxy is set (online_mod_proxy_other +
 *    online_mod_proxy_other_url), the same button and its status dot log in
 *    through that proxy instead, store the session cookies and switch Online
 *    Mod's HDrezka proxy on. "Log out of HDrezka" then clears those cookies.
 *    On Android, or with no alternative proxy set, both buttons keep Online
 *    Mod's original behaviour. No third-party proxy is ever used.
 * 4. HDrezka mirror is fixed to kvk.zone: rezka.ag and hdrezka.ag are behind
 *    an Anubis bot check, kvk.zone is not. The "HDrezka mirror" field is
 *    removed from Online Mod's settings and the value is set on every start.
 * 5. Online Mod switches its HDrezka proxy off on every start (initStorage,
 *    outside debug mode). While the alternative proxy is set, it is switched
 *    back on right after that, otherwise every HDrezka request goes direct and
 *    fails with "no network connection".
 * 6. Outside Android the alternative proxy itself is set on every start:
 *    "Use alternative proxy" = on and the URL below. Online Mod also routes
 *    Filmix site requests through it, so the proxy must allow filmix.gg.
 * 7. Region fallback. Lampa asks geo.<cub_domain> for the country and, when
 *    that request fails or returns garbage, assumes "ru". Its LGBT block
 *    (Lampa.VPN.is(['ru', 'by'])) then hides films regardless of the user's
 *    "allow" setting. The helper asks the same service itself (https, then
 *    http) and answers RU/BY checks with that result; if the region cannot
 *    be determined, RU/BY checks answer "no" and the user's setting decides.
 *    A genuine RU/BY answer from the service keeps Lampa's behaviour.
 * 8. Age confirmation that sticks. "I am 18 or older" stores
 *    adult_content_view = true, but Lampa only applies it to its own keyword
 *    check; films that TMDB itself marks adult keep the warning forever.
 *    After confirmation the helper clears that mark when the card starts.
 *
 * Uses Lampa's existing buttons; no provider or player overrides.
 */
(function () {
    'use strict';

    var TAG = '[Online Mod Direct Play]';


    function installDirectPlay() {
        var Lampa = window.Lampa;
        if (!Lampa || !Lampa.Select || !Lampa.Lang ||
            !Lampa.Listener || typeof Lampa.Listener.follow !== 'function') return false;

        var original = Lampa.Select.show;
        if (typeof original !== 'function') return false;
        if (original.onlineModDirectPlay) return true;

        function show(options) {
            if (options &&
                options.title === Lampa.Lang.translate('settings_rest_source') &&
                Array.isArray(options.items) &&
                typeof options.onSelect === 'function') {
                for (var i = 0; i < options.items.length; i++) {
                    var item = options.items[i];
                    if (item && !item.hide && item.btn &&
                        typeof item.btn.is === 'function' &&
                        item.btn.is('.full-start__button.view--online_mod') &&
                        !item.btn.is('.hide')) {
                        // The normal menu uses this same callback to open Online Mod.
                        return options.onSelect(item);
                    }
                }
            }
            return original.apply(this, arguments);
        }

        show.onlineModDirectPlay = true;
        Lampa.Select.show = show;

        // Move the original button, preserving Lampa's trailer handler.
        // The full event runs before controller navigation is collected.
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite' || !event.object ||
                !event.object.activity || typeof event.object.activity.render !== 'function') return;
            var root = event.object.activity.render();
            if (!root || typeof root.find !== 'function') return;
            var play = root.find('.full-start-new__buttons .button--play');
            var trailers = root.find('.buttons--container .view--trailer').not('.hide');
            if (!play.length || !trailers.length) return;
            trailers.insertAfter(play);
            trailers.on('hover:focus', function () {
                if (event.link && event.link.items && event.link.items[0]) {
                    event.link.items[0].last = this;
                }
            });
        });
        return true;
    }

    /* ---------- HDrezka login through the user's own proxy ---------- */

    var REZKA_COMPONENT = 'online_mod_rezka2';
    var REZKA_MIRROR_PARAM = 'online_mod_rezka2_mirror';
    // rezka.ag and hdrezka.ag answer every URL, login included, with an Anubis
    // bot check; kvk.zone does not (checked 27.10.2026).
    var REZKA_MIRROR = 'kvk.zone';
    // Our Deno Deploy proxy (nb557's deno_worker.js with a host allowlist).
    // A Cloudflare Worker does not work: kvk.zone answers every film page
    // requested from Cloudflare with an empty 500.
    var OWN_PROXY_URL = 'https://weird-perch-5180.justbench.deno.net/';
    var REZKA_LOGIN = 'online_mod_rezka2_login';
    var REZKA_LOGOUT = 'online_mod_rezka2_logout';
    var REZKA_COOKIE = 'online_mod_rezka2_cookie';
    var REZKA_STATUS = 'online_mod_rezka2_status';
    // Same value as Utils.baseUserAgent() in Online Mod.
    var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

    function storage() {
        return window.Lampa.Storage;
    }

    function notify(text) {
        window.Lampa.Noty.show(text);
    }

    function rezkaMirror() {
        return 'https://' + REZKA_MIRROR;
    }

    // Online Mod reads the mirror from storage for every HDrezka request, so
    // the fixed mirror is written there. With its HDrezka proxy on, Online Mod
    // uses the mirror only when online_mod_proxy_rezka2_mirror is on;
    // otherwise it falls back to rezka.ag.
    function forceMirror() {
        if (storage().get(REZKA_MIRROR_PARAM, '') !== REZKA_MIRROR) storage().set(REZKA_MIRROR_PARAM, REZKA_MIRROR);
        if (storage().field('online_mod_proxy_rezka2_mirror') !== true) storage().set('online_mod_proxy_rezka2_mirror', 'true');
    }

    // Only Online Mod's alternative proxy (the user's own) is used; there is
    // deliberately no fallback to a third-party proxy.
    function ownProxy() {
        if (storage().field('online_mod_proxy_other') !== true) return '';
        var url = String(storage().field('online_mod_proxy_other_url') || '').trim();
        if (!/^https?:\/\/[^\/]/.test(url)) return '';
        return url.charAt(url.length - 1) === '/' ? url : url + '/';
    }

    function isAndroid() {
        var Lampa = window.Lampa;
        return !!(Lampa.Platform && typeof Lampa.Platform.is === 'function' &&
            Lampa.Platform.is('android'));
    }

    function useOwnLogin() {
        return !isAndroid() && !!ownProxy();
    }

    // Online Mod reads both values on every request, so writing them at start
    // is enough. On Android its native login works without a proxy.
    function forceOwnProxy() {
        if (isAndroid()) return;
        if (storage().field('online_mod_proxy_other') !== true) storage().set('online_mod_proxy_other', 'true');
        if (storage().field('online_mod_proxy_other_url') !== OWN_PROXY_URL) storage().set('online_mod_proxy_other_url', OWN_PROXY_URL);
    }

    // Online Mod's proxyLink(link, proxy, enc, 'enc2t').
    function proxyLink(link, proxy, enc) {
        var posEnd = link.lastIndexOf('?');
        var posStart = link.lastIndexOf('://');
        if (posEnd === -1 || posEnd <= posStart) posEnd = link.length;
        if (posStart === -1) posStart = -3;
        var name = link.substring(posStart + 3, posEnd);
        posStart = name.lastIndexOf('/');
        name = posStart !== -1 ? name.substring(posStart + 1) : '';
        return proxy + 'enc2/' + encodeURIComponent(btoa(enc + link)) + '/' + name + '?jacred.test';
    }

    function parseJson(value) {
        if (typeof value !== 'string') return value || {};
        try {
            return JSON.parse(value);
        } catch (e) {
            return {};
        }
    }

    // The site returns the error either as a string or as {field: text}.
    function messageText(message) {
        if (!message) return '';
        if (typeof message === 'string') return message;
        var parts = [];
        for (var key in message) {
            if (Object.prototype.hasOwnProperty.call(message, key) && message[key]) {
                parts.push(String(message[key]));
            }
        }
        return parts.join('; ');
    }

    function collectCookies(headers) {
        var list = headers && (headers['set-cookie'] || headers['Set-Cookie']);
        if (!list) return '';
        if (typeof list === 'string') list = [list];
        if (!list.forEach) return '';

        var values = {};
        var order = [];
        list.forEach(function (line) {
            var parts = String(line).split(';')[0].split('=');
            var key = parts.shift();
            var value = parts.join('=');
            if (!key) return;
            if (value === 'deleted') {
                delete values[key];
                return;
            }
            if (!(key in values)) order.push(key);
            values[key] = value || '';
        });

        // Online Mod keeps PHPSESSID out of the stored value and adds its own.
        var cookies = [];
        order.forEach(function (key) {
            if (key !== 'PHPSESSID' && key in values) cookies.push(key + '=' + values[key]);
        });
        return cookies.join('; ');
    }

    function proxyRequest(method, link, enc, body, done) {
        var xhr = new XMLHttpRequest();
        var finished = false;

        function end(error, json) {
            if (finished) return;
            finished = true;
            done(error, json);
        }

        xhr.open(method, proxyLink(link, ownProxy(), enc), true);
        xhr.timeout = 15000;
        if (body) xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onerror = function () { end('прокси недоступен (сеть)'); };
        xhr.ontimeout = function () { end('прокси не ответил за 15 с'); };
        xhr.onload = function () {
            if (xhr.status !== 200) end('прокси вернул HTTP ' + xhr.status);
            else end(null, parseJson(xhr.responseText));
        };
        xhr.send(body || null);
    }

    function rezkaLogin(success, error) {
        var name = String(storage().get('online_mod_rezka2_name', '') || '');
        var pass = String(storage().get('online_mod_rezka2_password', '') || '');
        if (!name || !pass) {
            notify('HDrezka: укажите логин и пароль');
            error();
            return;
        }

        var enc = 'param/User-Agent=' + encodeURIComponent(USER_AGENT) + '/cookie_plus/param/Cookie=/';
        var body = 'login_name=' + encodeURIComponent(name) +
            '&login_password=' + encodeURIComponent(pass) + '&login_not_save=0';

        proxyRequest('POST', rezkaMirror() + '/ajax/login/', enc, body, function (failure, json) {
            if (failure) {
                notify('HDrezka: ' + failure);
                error();
                return;
            }

            var reply = parseJson(json.body);
            if (!reply.success) {
                storage().set(REZKA_STATUS, 'false');
                notify('HDrezka: ' + (messageText(reply.message) || 'сайт не принял вход'));
                error();
                return;
            }

            var cookies = collectCookies(json.headers);
            if (!cookies) {
                notify('HDrezka: вход принят, но сайт не вернул куки');
                error();
                return;
            }

            storage().set(REZKA_COOKIE, cookies);
            storage().set(REZKA_STATUS, 'true');
            // Outside Android Online Mod sends the stored cookies only through
            // its HDrezka proxy, and only to the mirror when this flag is on.
            storage().set('online_mod_proxy_rezka2', 'true');
            storage().set('online_mod_proxy_rezka2_mirror', 'true');
            notify('HDrezka: вход выполнен. Перезапустите Lampa.');
            success();
        });
    }

    function rezkaLogout(success) {
        var cookies = String(storage().get(REZKA_COOKIE, '') || '');
        storage().set(REZKA_COOKIE, '');
        storage().set(REZKA_STATUS, 'false');
        notify('HDrezka: выход выполнен');
        success();

        // Best effort: also end the session on the site. The result does not
        // matter, the local cookies are already gone.
        if (cookies && ownProxy()) {
            var enc = 'param/User-Agent=' + encodeURIComponent(USER_AGENT) + '/' +
                'param/Cookie=' + encodeURIComponent(cookies) + '/';
            proxyRequest('GET', rezkaMirror() + '/logout/', enc, null, function () {});
        }
    }

    function setStatus(item, state) {
        if (!item) return;
        $('.settings-param__status', item).removeClass('active error wait').addClass(state);
    }

    // Wraps one Online Mod button: keeps its onRender (which adds the status
    // dot), and replaces onChange only while our login applies.
    function patchButton(param, action, showLoggedIn) {
        if (!param || param.onlineModDirectPlay) return;
        var originalRender = param.onRender;
        var originalChange = param.onChange;
        var item = null;

        param.onRender = function (element) {
            item = element;
            if (typeof originalRender === 'function') originalRender.apply(this, arguments);
            if (showLoggedIn && useOwnLogin() && storage().get(REZKA_STATUS, '') === 'true' &&
                storage().get(REZKA_COOKIE, '')) {
                setStatus(item, 'active');
            }
        };

        param.onChange = function () {
            if (!useOwnLogin()) {
                if (typeof originalChange === 'function') return originalChange.apply(this, arguments);
                return;
            }
            setStatus(item, 'wait');
            action(function () {
                setStatus(item, 'active');
            }, function () {
                setStatus(item, 'error');
            });
        };

        param.onlineModDirectPlay = true;
    }

    function installRezkaLogin() {
        var Lampa = window.Lampa;
        if (!window.appready || !Lampa || !Lampa.Storage || !Lampa.Noty ||
            !Lampa.SettingsApi || typeof Lampa.SettingsApi.getParam !== 'function') return false;

        var params = Lampa.SettingsApi.getParam(REZKA_COMPONENT);
        if (!Array.isArray(params) || !params.length) return false;

        var login = null;
        var logout = null;
        params.forEach(function (param) {
            var name = param && param.param && param.param.name;
            if (name === REZKA_LOGIN) login = param;
            if (name === REZKA_LOGOUT) logout = param;
        });
        if (!login) return false;

        forceOwnProxy();
        forceMirror();
        // Runs after Online Mod's initStorage(), which resets this flag.
        if (useOwnLogin()) storage().set('online_mod_proxy_rezka2', 'true');
        // getParam returns Lampa's own list, so removing the entry hides the
        // field everywhere the settings are built.
        for (var i = params.length - 1; i >= 0; i--) {
            if (params[i] && params[i].param && params[i].param.name === REZKA_MIRROR_PARAM) params.splice(i, 1);
        }

        patchButton(login, rezkaLogin, true);
        if (logout) patchButton(logout, rezkaLogout, false);
        console.log(TAG, 'HDrezka login patched');
        return true;
    }

    /* ---------- region fallback ---------- */

    var geoRegion = null;      // two-letter code from our own probe, or null
    var geoFinished = false;   // our probe has ended (with or without a code)

    function probeRegion() {
        var Lampa = window.Lampa;
        var domain = Lampa.Manifest && Lampa.Manifest.cub_domain;
        if (!domain) {
            geoFinished = true;
            return;
        }
        var urls = ['https://geo.' + domain, 'http://geo.' + domain];

        function attempt(index) {
            if (index >= urls.length) {
                geoFinished = true;
                console.log(TAG, 'region unknown, RU/BY checks follow the user setting');
                return;
            }
            var xhr = new XMLHttpRequest();
            var done = false;
            function next() {
                if (done) return;
                done = true;
                attempt(index + 1);
            }
            try {
                xhr.open('GET', urls[index], true);
            } catch (e) {
                next();
                return;
            }
            xhr.timeout = 8000;
            xhr.onerror = next;
            xhr.ontimeout = next;
            xhr.onload = function () {
                var code = String(xhr.responseText || '').trim().toLowerCase();
                if (xhr.status === 200 && /^[a-z]{2}$/.test(code)) {
                    if (done) return;
                    done = true;
                    geoRegion = code;
                    geoFinished = true;
                    console.log(TAG, 'region', code);
                } else {
                    next();
                }
            };
            xhr.send();
        }

        attempt(0);
    }

    function installRegionFix() {
        var Lampa = window.Lampa;
        if (!Lampa || !Lampa.VPN || typeof Lampa.VPN.is !== 'function' || !Lampa.Manifest) return false;
        if (Lampa.VPN.is.onlineModDirectPlay) return true;

        var originalIs = Lampa.VPN.is;
        var patchedIs = function (list) {
            var asksRuBy = Array.isArray(list) && (list.indexOf('ru') !== -1 || list.indexOf('by') !== -1);
            if (asksRuBy && geoFinished) {
                if (geoRegion) return list.indexOf(geoRegion) !== -1;
                return false;
            }
            return originalIs.apply(this, arguments);
        };
        patchedIs.onlineModDirectPlay = true;
        // Lampa's own modules call this same object (exported as Lampa.VPN).
        Lampa.VPN.is = patchedIs;
        probeRegion();
        return true;
    }

    /* ---------- age confirmation ---------- */

    function installAdultFix() {
        var Lampa = window.Lampa;
        if (!Lampa || !Lampa.Storage || !Lampa.Listener || typeof Lampa.Listener.follow !== 'function') return false;

        // Lampa sends "start" after setting data.movie.adult and before it
        // builds the description block that shows the warning.
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'start' || !event.data || !event.data.movie) return;
            if (Lampa.Storage.field('adult_content_view') === true && event.data.movie.adult) {
                event.data.movie.adult = false;
            }
        });
        return true;
    }

    /* ---------- start ---------- */

    // Lampa and Online Mod finish loading on their own schedule, so each part
    // retries until its API is ready (up to 2 minutes).
    function retry(install) {
        if (install()) return;
        var attempts = 0;
        var timer = setInterval(function () {
            if (install() || ++attempts >= 240) clearInterval(timer);
        }, 500);
    }

    retry(installDirectPlay);
    retry(installRezkaLogin);
    retry(installRegionFix);
    retry(installAdultFix);
}());
