(function () {
    'use strict';

    var VERSION = '1.5.9';
    var BUILD = '2026-09-20-17-00';

    console.log('[KP UI v' + VERSION + '] VERSION:', VERSION);
    console.log('[KP UI v' + VERSION + '] BUILD:', BUILD);

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=1.5.9';

    var WIKIDATA_API =
        'https://query.wikidata.org/sparql';

    var WIKIDATA_ENTITY =
        'https://www.wikidata.org/wiki/Special:EntityData/';

    var mounted = false;
    var loading = false;

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[KP UI v' + VERSION + ']');
        console.log.apply(console, args);
    }

    function error() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[KP UI v' + VERSION + ']');
        console.error.apply(console, args);
    }

    function waitFor(check, callback, timeout) {
        var started = Date.now();
        timeout = timeout || 20000;

        function tick() {
            var result = false;

            try {
                result = check();
            } catch (e) {}

            if (result) {
                callback(result);
                return;
            }

            if (Date.now() - started >= timeout) {
                callback(null);
                return;
            }

            setTimeout(tick, 300);
        }

        tick();
    }

    function getCurrentEvent() {
        var result = null;

        try {
            if (Lampa.Activity && Lampa.Activity.active) {
                result = Lampa.Activity.active();
            }
        } catch (e) {}

        return result;
    }

    function findIMDb(value, visited) {
        if (!value || typeof value !== 'object') return null;

        visited = visited || [];

        if (visited.indexOf(value) >= 0) return null;
        visited.push(value);

        if (visited.length > 1000) return null;

        if (typeof value.imdb_id === 'string' &&
            /^tt\d+$/i.test(value.imdb_id)) {
            return value.imdb_id;
        }

        if (typeof value.imdb === 'string' &&
            /^tt\d+$/i.test(value.imdb)) {
            return value.imdb;
        }

        if (typeof value.imdb_id === 'number') {
            return String(value.imdb_id);
        }

        var keys;

        try {
            keys = Object.keys(value);
        } catch (e) {
            return null;
        }

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];

            if (
                key === 'parent' ||
                key === 'activity' ||
                key === 'component' ||
                key === 'link'
            ) {
                continue;
            }

            var found = findIMDb(value[key], visited);

            if (found) return found;
        }

        return null;
    }

    function getIMDb() {
        var event = getCurrentEvent();

        if (!event) {
            log('NO ACTIVE EVENT');
            return null;
        }

        var imdb = findIMDb(event, []);

        log('IMDb:', imdb);

        return imdb;
    }

    function wikidataRequest(url, callback, failed) {
        fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/sparql-results+json'
            }
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }

                return response.json();
            })
            .then(callback)
            .catch(function (e) {
                error('WIKIDATA ERROR:', e);

                if (failed) failed(e);
            });
    }

    function imdbToWikidata(imdb, callback) {
        if (!imdb) {
            callback(null);
            return;
        }

        var query =
            'SELECT ?item WHERE {' +
            '?item wdt:P345 "' +
            imdb.replace(/"/g, '\\"') +
            '".' +
            '} LIMIT 1';

        var url =
            WIKIDATA_API +
            '?query=' +
            encodeURIComponent(query) +
            '&format=json';

        log('WIKIDATA IMDb → QID:', imdb);

        wikidataRequest(url, function (json) {
            try {
                var bindings =
                    json.results &&
                    json.results.bindings;

                if (!bindings || !bindings.length) {
                    log('WIKIDATA QID NOT FOUND');
                    callback(null);
                    return;
                }

                var uri = bindings[0].item.value;
                var qid = uri.split('/').pop();

                log('WIKIDATA QID:', qid);

                callback(qid);
            } catch (e) {
                error('WIKIDATA PARSE ERROR:', e);
                callback(null);
            }
        }, function () {
            callback(null);
        });
    }

    function wikidataToKP(qid, callback) {
        if (!qid) {
            callback(null);
            return;
        }

        var url =
            WIKIDATA_ENTITY +
            encodeURIComponent(qid) +
            '.json';

        log('WIKIDATA → KP:', qid);

        wikidataRequest(url, function (json) {
            try {
                var entity =
                    json.entities &&
                    json.entities[qid];

                if (!entity || !entity.claims) {
                    log('NO WIKIDATA ENTITY');
                    callback(null);
                    return;
                }

                var claims = entity.claims.P2603;

                if (!claims || !claims.length) {
                    log('KP PROPERTY P2603 NOT FOUND');
                    callback(null);
                    return;
                }

                for (var i = 0; i < claims.length; i++) {
                    var datavalue =
                        claims[i].mainsnak &&
                        claims[i].mainsnak.datavalue;

                    if (!datavalue) continue;

                    var value = datavalue.value;

                    if (typeof value === 'string') {
                        log('KP ID:', value);
                        callback(value);
                        return;
                    }

                    if (
                        value &&
                        typeof value === 'object' &&
                        value.id
                    ) {
                        log('KP ID:', value.id);
                        callback(value.id);
                        return;
                    }
                }

                log('KP ID NOT FOUND');
                callback(null);

            } catch (e) {
                error('WIKIDATA ENTITY ERROR:', e);
                callback(null);
            }
        }, function () {
            callback(null);
        });
    }

    function loadKPSource(callback) {
        if (
            window.kp_source_plugin &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log('KP SOURCE ALREADY LOADED');
            callback(true);
            return;
        }

        log('LOAD KP SOURCE:', KP_SOURCE_URL);

        var script = document.createElement('script');

        script.src =
            KP_SOURCE_URL +
            '&t=' +
            Date.now();

        script.onload = function () {
            log('KP SOURCE SCRIPT LOADED');

            waitFor(function () {
                return (
                    window.kp_source_plugin &&
                    Lampa.Api &&
                    Lampa.Api.sources &&
                    Lampa.Api.sources.KP
                );
            }, function (ready) {
                if (ready) {
                    log('KP SOURCE READY');
                    callback(true);
                } else {
                    error('KP SOURCE TIMEOUT');
                    callback(false);
                }
            }, 10000);
        };

        script.onerror = function () {
            error('KP SOURCE SCRIPT ERROR');
            callback(false);
        };

        document.head.appendChild(script);
    }

    function getKPFull(kpId, callback) {
        if (
            !Lampa.Api ||
            !Lampa.Api.sources ||
            !Lampa.Api.sources.KP
        ) {
            error('KP SOURCE IS NOT READY');
            callback(null);
            return;
        }

        log('KP FULL:', kpId);

        var oldCard = null;

        try {
            oldCard = Lampa.Activity.active();
        } catch (e) {}

        var card = {
            source: 'KP',
            kinopoisk_id: String(kpId),
            id: 'KP_' + kpId,
            title: '',
            url: ''
        };

        try {
            Lampa.Api.sources.KP.full({
                card: card
            }, function (json) {
                log(
                    'KP FULL RESULT:',
                    json && json.simular && json.simular.results
                        ? json.simular.results.length
                        : 0
                );

                callback(json);
            }, function (e) {
                error('KP FULL ERROR:', e);
                callback(null);
            });
        } catch (e) {
            error('KP FULL EXCEPTION:', e);
            callback(null);
        }
    }

    function normalizeResults(json) {
        if (!json) return [];

        var results =
            json.simular &&
            json.simular.results;

        if (!Array.isArray(results)) {
            return [];
        }

        return results
            .filter(function (item) {
                return item && item.title;
            })
            .map(function (item) {
                item.source = 'KP';

                if (!item.kinopoisk_id && item.id) {
                    var match =
                        String(item.id).match(/^KP_(.+)$/);

                    if (match) {
                        item.kinopoisk_id = match[1];
                    }
                }

                return item;
            });
    }

    function getRowsRoot() {
        var active = document.querySelector(
            '.activity__body'
        );

        if (active) return active;

        return document.body;
    }

    function getNativeRecommendations() {
        var rows = document.querySelectorAll(
            '.items-line'
        );

        for (var i = 0; i < rows.length; i++) {
            var title =
                rows[i].querySelector(
                    '.items-line__title'
                );

            if (!title) continue;

            if (
                title.textContent
                    .trim()
                    .toLowerCase() === 'рекомендации'
            ) {
                return rows[i];
            }
        }

        return null;
    }

    function getNativeSimilar() {
        var rows = document.querySelectorAll(
            '.items-line'
        );

        for (var i = 0; i < rows.length; i++) {
            var title =
                rows[i].querySelector(
                    '.items-line__title'
                );

            if (!title) continue;

            if (
                title.textContent
                    .trim()
                    .toLowerCase() === 'похожие'
            ) {
                return rows[i];
            }
        }

        return null;
    }

    function mountNativeMain(results) {
        if (mounted) {
            log('ALREADY MOUNTED');
            return;
        }

        if (
            !Lampa.Maker ||
            !Lampa.Maker.make
        ) {
            error('Lampa.Maker NOT FOUND');
            return;
        }

        log('CREATE NATIVE MAIN:', results.length);

        var main;

        try {
            main = Lampa.Maker.make('Main', {
                title: 'Рекомендации Кинопоиска',
                results: results
            });
        } catch (e) {
            error('MAIN CREATE ERROR:', e);
            return;
        }

        if (!main) {
            error('MAIN INSTANCE IS EMPTY');
            return;
        }

        main.use({
            onInstance: function (item, data) {
                item.use({
                    onInstance: function (card, cardData) {
                        card.use({
                            onlyEnter: function () {
                                Router.call(
                                    'full',
                                    cardData
                                );
                            },

                            onFocus: function () {
                                try {
                                    Background.change(
                                        Utils.cardImgBackground(
                                            cardData
                                        )
                                    );
                                } catch (e) {}
                            }
                        });
                    }
                });
            }
        });

        var nativeRecommendations =
            getNativeRecommendations();

        var nativeSimilar =
            getNativeSimilar();

        if (!nativeRecommendations) {
            error('NATIVE RECOMMENDATIONS NOT FOUND');
            return;
        }

        log(
            'NATIVE RECOMMENDATIONS FOUND'
        );

        /*
         * Main itself is responsible for creating
         * Line → Card through Lampa's modular system.
         */
        var rendered = null;

        try {
            if (typeof main.render === 'function') {
                rendered = main.render();
            }
        } catch (e) {
            error('MAIN RENDER ERROR:', e);
        }

        if (!rendered) {
            try {
                if (main.el) rendered = main.el;
                else if (main.html) rendered = main.html;
                else if (main.body) rendered = main.body;
            } catch (e) {}
        }

        if (!rendered) {
            error('MAIN HAS NO RENDERED ELEMENT');
            log(
                'MAIN KEYS:',
                Object.keys(main)
            );
            return;
        }

        var element;

        try {
            if (rendered.jquery) {
                element = rendered[0];
            } else if (
                rendered instanceof HTMLElement
            ) {
                element = rendered;
            } else if (
                rendered[0] instanceof HTMLElement
            ) {
                element = rendered[0];
            }
        } catch (e) {}

        if (!element) {
            error('MAIN ELEMENT NOT FOUND');
            return;
        }

        var parent =
            nativeRecommendations.parentNode ||
            getRowsRoot();

        if (nativeSimilar &&
            nativeSimilar.parentNode === parent) {
            parent.insertBefore(
                element,
                nativeSimilar
            );
        } else {
            parent.insertBefore(
                element,
                nativeRecommendations.nextSibling
            );
        }

        mounted = true;

        log(
            'NATIVE MAIN MOUNTED:',
            element
        );
    }

    function startKP() {
        if (loading || mounted) return;

        loading = true;

        log('START PIPELINE');

        var imdb = getIMDb();

        if (!imdb) {
            error('IMDb NOT FOUND');
            loading = false;
            return;
        }

        imdbToWikidata(imdb, function (qid) {
            if (!qid) {
                error('QID NOT FOUND');
                loading = false;
                return;
            }

            wikidataToKP(qid, function (kpId) {
                if (!kpId) {
                    error('KP ID NOT FOUND');
                    loading = false;
                    return;
                }

                loadKPSource(function (ready) {
                    if (!ready) {
                        loading = false;
                        return;
                    }

                    getKPFull(kpId, function (json) {
                        var results =
                            normalizeResults(json);

                        log(
                            'SIMILAR RESULTS:',
                            results.length
                        );

                        if (!results.length) {
                            error(
                                'NO KP SIMILAR RESULTS'
                            );

                            loading = false;
                            return;
                        }

                        mountNativeMain(results);

                        loading = false;
                    });
                });
            });
        });
    }

    function waitForPage() {
        log('WAIT FOR NATIVE RECOMMENDATIONS');

        waitFor(function () {
            return getNativeRecommendations();
        }, function (row) {
            if (!row) {
                error(
                    'RECOMMENDATIONS TIMEOUT'
                );
                return;
            }

            log(
                'RECOMMENDATIONS READY'
            );

            startKP();
        }, 20000);
    }

    function onActivityChange() {
        mounted = false;
        loading = false;

        setTimeout(function () {
            var active =
                document.querySelector(
                    '.activity__body'
                );

            if (!active) return;

            var title =
                document.querySelector(
                    '.full__title'
                );

            if (!title) return;

            log(
                'DETAIL PAGE DETECTED:',
                title.textContent.trim()
            );

            waitForPage();
        }, 500);
    }

    function init() {
        log('INIT');
        log(
            'LAMPA DIGITAL:',
            Lampa.Manifest &&
            Lampa.Manifest.app_digital
        );

        if (
            Lampa.Manifest &&
            Lampa.Manifest.app_digital &&
            Lampa.Manifest.app_digital < 300
        ) {
            error(
                'LAMPA < 3.0 — MODULAR MAIN UNSUPPORTED'
            );
            return;
        }

        if (Lampa.Listener) {
            Lampa.Listener.on(
                'activity:back',
                function () {
                    mounted = false;
                    loading = false;
                }
            );

            Lampa.Listener.on(
                'activity:start',
                function () {
                    onActivityChange();
                }
            );
        }

        waitForPage();
    }

    if (window.__KP_UI_159__) {
        console.log(
            '[KP UI v' + VERSION + '] ALREADY INSTALLED'
        );
        return;
    }

    window.__KP_UI_159__ = true;

    init();

})();
