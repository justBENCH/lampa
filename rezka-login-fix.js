/* HDrezka Login Fix v1.0.0
 * Install alongside https://nb557.github.io/plugins/online_mod.js
 *
 * Problem: Online Mod's "Log in to HDrezka" button sends a direct POST from the
 * page to <mirror>/ajax/login/. In browsers and web views (lampa.mx, Media
 * Station X, TV browsers) the mirror does not allow cross-origin requests with
 * credentials, so CORS blocks the reply and Lampa shows "no network connection".
 *
 * Online Mod already has a proxy-based login (the "Fill cookies for HDrezka"
 * button), but it only shows that button on Android or in debug mode. This
 * plugin adds an equivalent button for every platform. It works ONLY through
 * your own proxy, set in Online Mod as "Use alternative proxy" + "Alternative
 * proxy" (online_mod_proxy_other / online_mod_proxy_other_url), for example a
 * Cloudflare Worker running nb557's cloudflare_worker.js. It never falls back
 * to a third-party proxy. On success it:
 *   1. stores the session cookies in "online_mod_rezka2_cookie";
 *   2. turns on Online Mod's HDrezka proxy ("online_mod_proxy_rezka2") and
 *      tells it to use the configured mirror ("online_mod_proxy_rezka2_mirror"),
 *      because outside Android Online Mod sends the stored cookies only
 *      through that proxy.
 *
 * The login and password are read from Online Mod's settings and sent only to
 * your proxy. Nothing is logged. To undo: remove the plugin, press "Log out of
 * HDrezka" and turn off the HDrezka proxy in Online Mod's proxy settings.
 */
(function () {
    'use strict';

    var VERSION = '1.0.0';
    var TAG = '[Rezka login fix v' + VERSION + ']';
    var COMPONENT = 'online_mod_rezka2';
    var PARAM = 'online_mod_rezka2_login_fix';
    var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

    if (window.__REZKA_LOGIN_FIX__) return;
    window.__REZKA_LOGIN_FIX__ = true;

    function storage() {
        return window.Lampa.Storage;
    }

    function notify(text) {
        console.log(TAG, text);
        window.Lampa.Noty.show(text);
    }

    // Same rules as Utils.rezka2Mirror() in Online Mod.
    function mirror() {
        var url = String(storage().get('online_mod_rezka2_mirror', '') || '');
        if (!url) return 'https://kvk.zone';
        if (url.indexOf('http') !== 0) url = 'https://' + url;
        return url.replace(/\/+$/, '');
    }

    // Only the user's own proxy from Online Mod's settings is used; there is
    // deliberately no fallback to a third-party proxy.
    function ownProxy() {
        if (storage().field('online_mod_proxy_other') !== true) return '';
        var url = String(storage().field('online_mod_proxy_other_url') || '').trim();
        if (!/^https?:\/\/[^\/]/.test(url)) return '';
        return url.charAt(url.length - 1) === '/' ? url : url + '/';
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

    function login(success, error) {
        var name = String(storage().get('online_mod_rezka2_name', '') || '');
        var pass = String(storage().get('online_mod_rezka2_password', '') || '');
        if (!name || !pass) {
            notify('HDrezka: укажите логин и пароль выше');
            error();
            return;
        }

        var proxy = ownProxy();
        if (!proxy) {
            notify('HDrezka: включите «Использовать альтернативный прокси» в Online Mod и укажите адрес своего прокси');
            error();
            return;
        }

        var host = mirror();
        var enc = 'param/User-Agent=' + encodeURIComponent(USER_AGENT) + '/' +
            'cookie_plus/param/Cookie=/';
        var xhr = new XMLHttpRequest();
        var finished = false;

        function fail(text) {
            if (finished) return;
            finished = true;
            notify(text);
            error();
        }

        xhr.open('POST', proxyLink(host + '/ajax/login/', proxy, enc), true);
        xhr.timeout = 15000;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onerror = function () { fail('HDrezka: прокси недоступен (сеть)'); };
        xhr.ontimeout = function () { fail('HDrezka: прокси не ответил за 15 с'); };
        xhr.onload = function () {
            if (finished) return;
            if (xhr.status !== 200) {
                fail('HDrezka: прокси вернул HTTP ' + xhr.status);
                return;
            }

            var json = parseJson(xhr.responseText);
            var body = parseJson(json.body);
            if (!body.success) {
                fail('HDrezka: ' + (messageText(body.message) || 'сайт не принял вход'));
                return;
            }

            var cookies = collectCookies(json.headers);
            if (!cookies) {
                fail('HDrezka: вход принят, но сайт не вернул куки');
                return;
            }

            finished = true;
            storage().set('online_mod_rezka2_cookie', cookies);
            storage().set('online_mod_rezka2_status', 'true');
            storage().set('online_mod_proxy_rezka2', 'true');
            storage().set('online_mod_proxy_rezka2_mirror', 'true');
            notify('HDrezka: вход выполнен, куки сохранены. Перезапустите Lampa.');
            success();
        };

        xhr.send('login_name=' + encodeURIComponent(name) +
            '&login_password=' + encodeURIComponent(pass) + '&login_not_save=0');
    }

    function addButton() {
        var Lampa = window.Lampa;
        var holder = {};

        Lampa.SettingsApi.addParam({
            component: COMPONENT,
            param: {name: PARAM, type: 'button'},
            field: {
                name: 'Войти в HDrezka через прокси (фикс)',
                description: 'Через ваш альтернативный прокси Online Mod, если обычный вход пишет «Нет подключения к сети»'
            },
            onRender: function (item) {
                holder.item = item;
                if (!item.find('.settings-param__status').length) {
                    item.append('<div class="settings-param__status"></div>');
                }
            },
            onChange: function () {
                var status = $('.settings-param__status', holder.item)
                    .removeClass('active error wait').addClass('wait');
                login(function () {
                    status.removeClass('active error wait').addClass('active');
                }, function () {
                    status.removeClass('active error wait').addClass('error');
                });
            }
        });
    }

    function ready() {
        var Lampa = window.Lampa;
        return !!(window.appready && Lampa && Lampa.Storage && Lampa.Noty &&
            Lampa.SettingsApi && typeof Lampa.SettingsApi.getComponent === 'function' &&
            Lampa.SettingsApi.getComponent(COMPONENT));
    }

    // Online Mod creates its HDrezka settings component on its own schedule,
    // so wait for that component rather than for Lampa alone.
    var attempts = 0;
    var timer = setInterval(function () {
        if (ready()) {
            clearInterval(timer);
            addButton();
            console.log(TAG, 'READY');
        } else if (++attempts >= 240) {
            clearInterval(timer);
            console.log(TAG, 'HDrezka settings of Online Mod not found');
        }
    }, 500);
}());
