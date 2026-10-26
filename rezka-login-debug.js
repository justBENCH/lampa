/* HDrezka Login Debug v1.1.0
 * Temporary diagnostic plugin for Online Mod. Remove it after the check.
 *
 * What it does (once per Lampa start, ~4 s after the app is ready):
 *   1. Repeats the same request as the "Log in to HDrezka" button:
 *      POST <mirror>/ajax/login/ with the login and password saved in Lampa.
 *   2. Shows the HTTP status and the first part of the server reply as a Lampa
 *      notification and prints the same to the browser console.
 *   3. If the request fails with HTTP 0, probes the mirror with a plain
 *      no-cors request to tell "site unreachable" from "blocked by CORS".
 *
 * The password is never shown or logged. Data is sent only to the mirror host
 * configured in Online Mod (https://kvk.zone when it is empty).
 */
(function () {
    'use strict';

    var TAG = '[Rezka login debug]';

    if (window.__REZKA_LOGIN_DEBUG__) return;
    window.__REZKA_LOGIN_DEBUG__ = true;

    function mirror() {
        var url = String(window.Lampa.Storage.get('online_mod_rezka2_mirror', '') || '');
        if (!url) return 'https://kvk.zone';
        if (url.indexOf('http') !== 0) url = 'https://' + url;
        return url.replace(/\/+$/, '');
    }

    function short(text) {
        text = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        return text.length > 160 ? text.substring(0, 160) + '...' : text;
    }

    function report(message) {
        console.log(TAG, message);
        try {
            window.Lampa.Noty.show(TAG + ' ' + message, {time: 15000});
        } catch (e) {
            window.Lampa.Noty.show(TAG + ' ' + message);
        }
    }

    // A no-cors request succeeds (opaque response) whenever the host answers
    // at all, so a pass here means the failure above was CORS, not the network.
    function probe(host, cb) {
        if (typeof window.fetch !== 'function') {
            cb('fetch is not supported on this device');
            return;
        }
        var finished = false;
        function end(text) {
            if (finished) return;
            finished = true;
            cb(text);
        }
        setTimeout(function () { end('no answer in 10 s'); }, 10000);
        window.fetch(host + '/', {mode: 'no-cors', cache: 'no-store'}).then(function () {
            end('site is reachable, so the login request was blocked by CORS');
        }, function () {
            end('site is NOT reachable from this device');
        });
    }

    function run() {
        var Lampa = window.Lampa;
        var host = mirror();
        var name = String(Lampa.Storage.get('online_mod_rezka2_name', '') || '');
        var pass = String(Lampa.Storage.get('online_mod_rezka2_password', '') || '');

        if (!name || !pass) {
            report('login or password is empty in Online Mod settings');
            return;
        }

        var xhr = new XMLHttpRequest();
        var started = Date.now();
        var done = false;

        function finish(kind) {
            if (done) return;
            done = true;
            var ms = Date.now() - started;
            var body = '';
            try { body = xhr.responseText; } catch (e) { body = ''; }
            var text = kind + ' | mirror: ' + host + ' | HTTP ' + xhr.status +
                ' | ' + ms + ' ms | reply: ' + (short(body) || '(empty)');
            if (xhr.status === 0) {
                probe(host, function (result) { report(text + ' | probe: ' + result); });
            } else {
                report(text);
            }
        }

        xhr.open('POST', host + '/ajax/login/', true);
        xhr.withCredentials = true;
        xhr.timeout = 15000;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.onload = function () { finish('answered'); };
        xhr.onerror = function () { finish('network error (blocked, CORS or no connection)'); };
        xhr.ontimeout = function () { finish('timeout'); };
        xhr.send('login_name=' + encodeURIComponent(name) +
            '&login_password=' + encodeURIComponent(pass) + '&login_not_save=0');

        console.log(TAG, 'request sent to', host + '/ajax/login/');
    }

    var attempts = 0;
    var timer = setInterval(function () {
        var Lampa = window.Lampa;
        var ready = window.appready && Lampa && Lampa.Storage && Lampa.Noty;
        if (ready) {
            clearInterval(timer);
            setTimeout(run, 4000);
        } else if (++attempts >= 120) {
            clearInterval(timer);
        }
    }, 500);
}());
