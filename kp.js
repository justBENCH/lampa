(function () {
    'use strict';

    var VERSION = '1.5.10';
    var BUILD = '2026-09-20-17-20';

    console.log('[KP UI v' + VERSION + '] VERSION:', VERSION);
    console.log('[KP UI v' + VERSION + '] BUILD:', BUILD);

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=1.5.10';

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
            } catch (e) {
                error('WAIT CHECK ERROR:', e);
            }

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
        try {
            if (
                Lampa.Activity &&
                typeof Lampa.Activity.active === 'function'
            ) {
                return Lampa.Activity.active();
            }
        } catch (e) {
            error('ACTIVITY ACTIVE ERROR:', e);
        }

        return null;
    }

    function findIMDb(value, visited) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        visited = visited || [];

        if (visited.indexOf(value) >= 0) {
            return null;
        }

        visited.push(value);

        if (visited.length > 1500) {
            return null;
        }

        if (
            typeof value.imdb_id === 'string' &&
            /^tt\d+$/i.test(value.imdb_id)
        ) {
            return value.imdb_id;
        }

        if (
            typeof value.imdb === 'string' &&
            /^tt\d+$/i.test(value.imdb)
        ) {
            return value.imdb;
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

            if (found) {
                return found;
            }
        }

        return null;
    }

    function getIMDb() {
        var event = getCurrentEvent();

        if (!event) {
            error('NO ACTIVE EVENT');
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
                Accept: 'application/sparql-results+json'
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

                if (failed) {
                    failed(e);
                }
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

        wikidataRequest(
            url,
            function (json) {
                try {
                    var bindings =
                        json.results &&
                        json.results.bindings;

                    if (!bindings || !bindings.length) {
                        error('WIKIDATA QID NOT FOUND');
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
            },
            function () {
                callback(null);
            }
        );
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

        wikidataRequest(
            url,
            function (json) {
                try {
                    var entity =
                        json.entities &&
                        json.entities[qid];

                    if (!entity || !entity.claims) {
                        error('NO WIKIDATA ENTITY');
                        callback(null);
                        return;
                    }

                    var claims = entity.claims.P2603;

                    if (!claims || !claims.length) {
                        error('KP PROPERTY P2603 NOT FOUND');
                        callback(null);
                        return;
                    }

                    for (var i = 0; i < claims.length; i++) {
                        var datavalue =
                            claims[i].mainsnak &&
                            claims[i].mainsnak.datavalue;

                        if (!datavalue) {
                            continue;
                        }

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

                    error('KP ID NOT FOUND');
                    callback(null);
                } catch (e) {
                    error('WIKIDATA ENTITY ERROR:', e);
                    callback(null);
                }
            },
            function () {
                callback(null);
            }
        );
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

            waitFor(
                function () {
                    return (
                        window.kp_source_plugin &&
                        Lampa.Api &&
                        Lampa.Api.sources &&
                        Lampa.Api.sources.KP
                    );
                },
                function (ready) {
                    if (ready) {
                        log('KP SOURCE READY');
                        callback(true);
                    } else {
                        error('KP SOURCE TIMEOUT');
                        callback(false);
                    }
                },
                10000
            );
        };

        script.onerror = function (e) {
            error('KP SOURCE SCRIPT ERROR:', e);
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

        var card = {
            source: 'KP',
            kinopoisk_id: String(kpId),
            id: 'KP_' + kpId,
            title: ''
        };

        try {
            Lampa.Api.sources.KP.full(
                {
                    card: card
                },
                function (json) {
                    var count =
                        json &&
                        json.simular &&
                        json.simular.results
                            ? json.simular.results.length
                            : 0;

                    log('KP FULL RESULT:', count);

                    callback(json);
                },
                function (e) {
                    error('KP FULL ERROR:', e);
                    callback(null);
                }
            );
        } catch (e) {
            error('KP FULL EXCEPTION:', e);
            callback(null);
        }
    }

    function normalizeResults(json) {
        if (!json) {
            return [];
        }

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

    function findRecommendations(root) {
        if (!root || !root.find) {
            return $();
        }

        var result = $();

        root.find('.items-line').each(function () {
            var title =
                $(this)
                    .find('.items-line__title')
                    .first()
                    .text()
                    .trim()
                    .toLowerCase();

            if (title === 'рекомендации') {
                result = $(this);
                return false;
            }
        });

        return result;
    }

    function findSimilar(root) {
        if (!root || !root.find) {
            return $();
        }

        var result = $();

        root.find('.items-line').each(function () {
            var title =
                $(this)
                    .find('.items-line__title')
                    .first()
                    .text()
                    .trim()
                    .toLowerCase();

            if (title === 'похожие') {
                result = $(this);
                return false;
            }
        });

        return result;
    }

    function createNativeMain(results) {
        if (
            !Lampa.Maker ||
            typeof Lampa.Maker.make !== 'function'
        ) {
            error('Lampa.Maker.make NOT FOUND');
            return null;
        }

        log(
            'CREATE NATIVE MAIN:',
            results.length
        );

        var main;

        try {
            main = Lampa.Maker.make(
                'Main',
                {
                    title: 'Рекомендации Кинопоиска',
                    results: results
                }
            );
        } catch (e) {
            error('MAIN CREATE ERROR:', e);
            return null;
        }

        if (!main) {
            error('MAIN INSTANCE EMPTY');
            return null;
        }

        log('MAIN CREATED');

        try {
            main.use({
                onCreate: function () {
                    log('MAIN onCreate');

                    this.build([
                        {
                            title: 'Рекомендации Кинопоиска',
                            results: results
                        }
                    ]);
                },

                onInstance: function (item, data) {
                    item.use({
                        onInstance: function (card, cardData) {
                            card.use({
                                onlyEnter: function () {
                                    log(
                                        'CARD ENTER:',
                                        cardData &&
                                            cardData.title
                                    );

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
        } catch (e) {
            error('MAIN USE ERROR:', e);
            return null;
        }

        return main;
    }

    function mountNativeMain(root, results) {
        if (mounted) {
            log('ALREADY MOUNTED');
            return;
        }

        var recommendations =
            findRecommendations(root);

        if (!recommendations.length) {
            error('NATIVE RECOMMENDATIONS NOT FOUND');
            return;
        }

        var similar =
            findSimilar(root);

        log(
            'NATIVE RECOMMENDATIONS FOUND:',
            recommendations.length
        );

        log(
            'NATIVE SIMILAR FOUND:',
            similar.length
        );

        var main =
            createNativeMain(results);

        if (!main) {
            return;
        }

        waitFor(
            function () {
                try {
                    var rendered =
                        typeof main.render === 'function'
                            ? main.render()
                            : null;

                    if (!rendered) {
                        return false;
                    }

                    return rendered;
                } catch (e) {
                    return false;
                }
            },
            function (rendered) {
                if (!rendered) {
                    error('MAIN RENDER TIMEOUT');
                    return;
                }

                log('MAIN RENDERED');

                var element = null;

                try {
                    if (
                        rendered &&
                        rendered.jquery
                    ) {
                        element = rendered[0];
                    } else if (
                        rendered instanceof HTMLElement
                    ) {
                        element = rendered;
                    } else if (
                        rendered &&
                        rendered[0] instanceof HTMLElement
                    ) {
                        element = rendered[0];
                    }
                } catch (e) {
                    error(
                        'MAIN ELEMENT PARSE ERROR:',
                        e
                    );
                }

                if (!element) {
                    error('MAIN ELEMENT NOT FOUND');

                    try {
                        log(
                            'MAIN KEYS:',
                            Object.keys(main)
                        );
                    } catch (e) {}

                    return;
                }

                var parent =
                    recommendations.parent()[0];

                if (!parent) {
                    error('RECOMMENDATIONS PARENT NOT FOUND');
                    return;
                }

                if (
                    similar.length &&
                    similar.parent()[0] === parent
                ) {
                    parent.insertBefore(
                        element,
                        similar[0]
                    );
                } else {
                    parent.insertBefore(
                        element,
                        recommendations[0].nextSibling
                    );
                }

                mounted = true;

                log(
                    'NATIVE MAIN MOUNTED'
                );
            },
            5000
        );
    }

    function startKP(root) {
        if (loading || mounted) {
            return;
        }

        loading = true;

        log('START PIPELINE');

        var imdb = getIMDb();

        if (!imdb) {
            error('IMDb NOT FOUND');
            loading = false;
            return;
        }

        imdbToWikidata(
            imdb,
            function (qid) {
                if (!qid) {
                    error('QID NOT FOUND');
                    loading = false;
                    return;
                }

                wikidataToKP(
                    qid,
                    function (kpId) {
                        if (!kpId) {
                            error('KP ID NOT FOUND');
                            loading = false;
                            return;
                        }

                        loadKPSource(
                            function (ready) {
                                if (!ready) {
                                    loading = false;
                                    return;
                                }

                                getKPFull(
                                    kpId,
                                    function (json) {
                                        var results =
                                            normalizeResults(
                                                json
                                            );

                                        log(
                                            'SIMILAR RESULTS:',
                                            results.length
                                        );

                                        if (
                                            !results.length
                                        ) {
                                            error(
                                                'NO KP SIMILAR RESULTS'
                                            );

                                            loading = false;
                                            return;
                                        }

                                        mountNativeMain(
                                            root,
                                            results
                                        );

                                        loading = false;
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    }

    function handleFull(e) {
        if (!e || e.type !== 'complite') {
            return;
        }

        if (
            !e.object ||
            !e.object.activity ||
            typeof e.object.activity.render !==
                'function'
        ) {
            error('FULL ACTIVITY RENDER NOT FOUND');
            return;
        }

        var root =
            e.object.activity.render();

        if (!root || !root.find) {
            error('FULL ROOT NOT FOUND');
            return;
        }

        mounted = false;
        loading = false;

        log('FULL COMPLITE');

        waitFor(
            function () {
                return findRecommendations(root).length
                    ? root
                    : false;
            },
            function (readyRoot) {
                if (!readyRoot) {
                    error(
                        'RECOMMENDATIONS TIMEOUT'
                    );
                    return;
                }

                log(
                    'RECOMMENDATIONS READY'
                );

                startKP(readyRoot);
            },
            20000
        );
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

        if (
            Lampa.Listener &&
            typeof Lampa.Listener.follow ===
                'function'
        ) {
            log('LISTENER.FOLLOW READY');

            Lampa.Listener.follow(
                'full',
                handleFull
            );

            log(
                'LISTENER FULL REGISTERED'
            );
        } else {
            error(
                'Lampa.Listener.follow NOT FOUND'
            );
        }

        if (window.appready) {
            log('APP ALREADY READY');
        }
    }

    if (window.__KP_UI_1510__) {
        console.log(
            '[KP UI v' +
                VERSION +
                '] ALREADY INSTALLED'
        );
        return;
    }

    window.__KP_UI_1510__ = true;

    try {
        init();
    } catch (e) {
        error(
            'INIT FATAL:',
            e && (e.stack || e.message || e)
        );
    }
})();
