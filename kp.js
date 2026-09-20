(function () {
    'use strict';

    var VERSION = '1.5.12';
    var BUILD = '2026-09-20-17-45';

    console.log('[KP UI v' + VERSION + '] VERSION:', VERSION);
    console.log('[KP UI v' + VERSION + '] BUILD:', BUILD);

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=1.5.12';

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

    function getCurrentCard() {
        var event = getCurrentEvent();

        if (!event) {
            error('NO ACTIVE EVENT');
            return null;
        }

        var card = null;

        try {
            if (event.object && event.object.card) {
                card = event.object.card;
            }

            if (!card && event.card) {
                card = event.card;
            }
        } catch (e) {
            error('CARD READ ERROR:', e);
        }

        if (!card) {
            error('CURRENT CARD NOT FOUND');
            return null;
        }

        log('CURRENT CARD:', {
            id: card.id,
            title: card.title,
            year: card.year,
            source: card.source,
            imdb_id: card.imdb_id
        });

        return card;
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

    function getKPIdFromResult(item) {
        if (!item) {
            return null;
        }

        if (item.kinopoisk_id) {
            return String(item.kinopoisk_id);
        }

        if (item.id) {
            var id = String(item.id);

            if (id.indexOf('KP_') === 0) {
                return id.substring(3);
            }

            if (/^\d+$/.test(id)) {
                return id;
            }
        }

        return null;
    }

    function normalizeSearchResults(data) {
        if (!data) {
            return [];
        }

        if (Array.isArray(data)) {
            return data;
        }

        if (data.results && Array.isArray(data.results)) {
            return data.results;
        }

        if (
            data.body &&
            data.body.results &&
            Array.isArray(data.body.results)
        ) {
            return data.body.results;
        }

        return [];
    }

    function findBestKPResult(results, card) {
        if (!results.length) {
            return null;
        }

        var title =
            card.title
                ? String(card.title).trim().toLowerCase()
                : '';

        var year =
            card.year
                ? String(card.year)
                : '';

        log('SEARCH RESULTS:', results.length);

        /*
         * 1. Сначала точное название + год.
         */
        for (var i = 0; i < results.length; i++) {
            var item = results[i];

            if (!item) {
                continue;
            }

            var itemTitle =
                item.title
                    ? String(item.title).trim().toLowerCase()
                    : '';

            var itemYear =
                item.year
                    ? String(item.year)
                    : '';

            if (
                title &&
                itemTitle === title &&
                year &&
                itemYear === year
            ) {
                log(
                    'EXACT KP MATCH:',
                    item.title,
                    item.year,
                    getKPIdFromResult(item)
                );

                return item;
            }
        }

        /*
         * 2. Название + год выпуска в диапазоне.
         */
        for (var j = 0; j < results.length; j++) {
            var candidate = results[j];

            if (!candidate) {
                continue;
            }

            var candidateYear =
                candidate.year
                    ? String(candidate.year)
                    : '';

            if (
                title &&
                candidate.title &&
                String(candidate.title)
                    .trim()
                    .toLowerCase() === title
            ) {
                if (
                    !year ||
                    candidateYear === year
                ) {
                    log(
                        'TITLE MATCH:',
                        candidate.title,
                        candidate.year,
                        getKPIdFromResult(candidate)
                    );

                    return candidate;
                }
            }
        }

        /*
         * 3. Если точного совпадения нет —
         * первый результат.
         */
        log(
            'FALLBACK KP RESULT:',
            results[0].title,
            results[0].year,
            getKPIdFromResult(results[0])
        );

        return results[0];
    }

    function searchKP(card, callback) {
        if (
            !Lampa.Api ||
            !Lampa.Api.sources ||
            !Lampa.Api.sources.KP
        ) {
            error('KP SOURCE NOT READY');
            callback(null);
            return;
        }

        var KP = Lampa.Api.sources.KP;

        if (
            typeof KP.discovery !== 'function'
        ) {
            error('KP DISCOVERY NOT FOUND');
            callback(null);
            return;
        }

        var discovery;

        try {
            discovery = KP.discovery();
        } catch (e) {
            error('KP DISCOVERY CREATE ERROR:', e);
            callback(null);
            return;
        }

        if (
            !discovery ||
            typeof discovery.search !== 'function'
        ) {
            error('KP DISCOVERY SEARCH NOT FOUND');
            callback(null);
            return;
        }

        var query =
            card.title
                ? String(card.title).trim()
                : '';

        if (!query) {
            error('CARD TITLE EMPTY');
            callback(null);
            return;
        }

        log(
            'KP SEARCH:',
            query,
            '| YEAR:',
            card.year
        );

        try {
            discovery.search(
                {
                    query: query,
                    page: 1
                },
                function (data) {
                    var results =
                        normalizeSearchResults(data);

                    var best =
                        findBestKPResult(
                            results,
                            card
                        );

                    if (!best) {
                        error('KP SEARCH EMPTY');
                        callback(null);
                        return;
                    }

                    var kpId =
                        getKPIdFromResult(best);

                    if (!kpId) {
                        error(
                            'KP ID NOT FOUND IN RESULT:',
                            best
                        );

                        callback(null);
                        return;
                    }

                    log(
                        'KP ID FROM SEARCH:',
                        kpId
                    );

                    callback(kpId);
                },
                function (e) {
                    error(
                        'KP SEARCH ERROR:',
                        e
                    );

                    callback(null);
                }
            );
        } catch (e) {
            error(
                'KP SEARCH EXCEPTION:',
                e
            );

            callback(null);
        }
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

                    log(
                        'KP FULL RESULT:',
                        count
                    );

                    callback(json);
                },
                function (e) {
                    error(
                        'KP FULL ERROR:',
                        e
                    );

                    callback(null);
                }
            );
        } catch (e) {
            error(
                'KP FULL EXCEPTION:',
                e
            );

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

                if (
                    !item.kinopoisk_id &&
                    item.id
                ) {
                    var match =
                        String(item.id).match(
                            /^KP_(.+)$/
                        );

                    if (match) {
                        item.kinopoisk_id =
                            match[1];
                    }
                }

                return item;
            });
    }

    function findRecommendations(root) {
        if (
            !root ||
            !root.find
        ) {
            return $();
        }

        var result = $();

        root
            .find('.items-line')
            .each(function () {
                var title =
                    $(this)
                        .find(
                            '.items-line__title'
                        )
                        .first()
                        .text()
                        .trim()
                        .toLowerCase();

                if (
                    title === 'рекомендации'
                ) {
                    result = $(this);
                    return false;
                }
            });

        return result;
    }

    function findSimilar(root) {
        if (
            !root ||
            !root.find
        ) {
            return $();
        }

        var result = $();

        root
            .find('.items-line')
            .each(function () {
                var title =
                    $(this)
                        .find(
                            '.items-line__title'
                        )
                        .first()
                        .text()
                        .trim()
                        .toLowerCase();

                if (
                    title === 'похожие'
                ) {
                    result = $(this);
                    return false;
                }
            });

        return result;
    }

    function createNativeMain(results) {
        if (
            !Lampa.Maker ||
            typeof Lampa.Maker.make !==
                'function'
        ) {
            error(
                'Lampa.Maker.make NOT FOUND'
            );

            return null;
        }

        log(
            'CREATE NATIVE MAIN:',
            results.length
        );

        var main;

        try {
            main =
                Lampa.Maker.make(
                    'Main',
                    {
                        title:
                            'Рекомендации Кинопоиска',
                        results:
                            results
                    }
                );
        } catch (e) {
            error(
                'MAIN CREATE ERROR:',
                e
            );

            return null;
        }

        if (!main) {
            error(
                'MAIN INSTANCE EMPTY'
            );

            return null;
        }

        log('MAIN CREATED');

        try {
            main.use({
                onCreate: function () {
                    log('MAIN onCreate');

                    this.build([
                        {
                            title:
                                'Рекомендации Кинопоиска',
                            results:
                                results
                        }
                    ]);
                },

                onInstance: function (
                    item,
                    data
                ) {
                    item.use({
                        onInstance: function (
                            card,
                            cardData
                        ) {
                            card.use({
                                onlyEnter:
                                    function () {
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

                                onFocus:
                                    function () {
                                        try {
                                            Background.change(
                                                Utils.cardImgBackground(
                                                    cardData
                                                )
                                            );
                                        } catch (
                                            e
                                        ) {}
                                    }
                            });
                        }
                    });
                }
            });
        } catch (e) {
            error(
                'MAIN USE ERROR:',
                e
            );

            return null;
        }

        return main;
    }

    function mountNativeMain(
        root,
        results
    ) {
        if (mounted) {
            log('ALREADY MOUNTED');
            return;
        }

        var recommendations =
            findRecommendations(root);

        if (!recommendations.length) {
            error(
                'NATIVE RECOMMENDATIONS NOT FOUND'
            );

            return;
        }

        var similar =
            findSimilar(root);

        log(
            'NATIVE RECOMMENDATIONS FOUND'
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

        try {
            if (
                typeof main.create ===
                'function'
            ) {
                log('CALL MAIN.CREATE');
                main.create();
            }
        } catch (e) {
            error(
                'MAIN.CREATE ERROR:',
                e
            );
        }

        setTimeout(
            function () {
                var element = null;

                try {
                    if (
                        typeof main.render ===
                        'function'
                    ) {
                        var rendered =
                            main.render();

                        if (
                            rendered &&
                            rendered.jquery
                        ) {
                            element =
                                rendered[0];
                        } else if (
                            rendered instanceof
                            HTMLElement
                        ) {
                            element =
                                rendered;
                        } else if (
                            rendered &&
                            rendered[0] instanceof
                            HTMLElement
                        ) {
                            element =
                                rendered[0];
                        }
                    }
                } catch (e) {
                    error(
                        'MAIN.RENDER ERROR:',
                        e
                    );
                }

                if (!element) {
                    error(
                        'MAIN ELEMENT NOT FOUND'
                    );

                    try {
                        log(
                            'MAIN KEYS:',
                            Object.keys(main)
                        );
                    } catch (e) {}

                    return;
                }

                var parent =
                    recommendations
                        .parent()[0];

                if (!parent) {
                    error(
                        'RECOMMENDATIONS PARENT NOT FOUND'
                    );

                    return;
                }

                if (
                    similar.length &&
                    similar.parent()[0] ===
                    parent
                ) {
                    parent.insertBefore(
                        element,
                        similar[0]
                    );
                } else {
                    parent.insertBefore(
                        element,
                        recommendations[0]
                            .nextSibling
                    );
                }

                mounted = true;

                log(
                    'NATIVE MAIN MOUNTED'
                );
            },
            500
        );
    }

    function startKP(root) {
        if (
            loading ||
            mounted
        ) {
            return;
        }

        loading = true;

        log('START PIPELINE');

        var card =
            getCurrentCard();

        if (!card) {
            loading = false;
            return;
        }

        loadKPSource(
            function (ready) {
                if (!ready) {
                    loading = false;
                    return;
                }

                searchKP(
                    card,
                    function (kpId) {
                        if (!kpId) {
                            error(
                                'KP ID NOT FOUND'
                            );

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

    function handleFull(e) {
        if (
            !e ||
            e.type !== 'complite'
        ) {
            return;
        }

        if (
            !e.object ||
            !e.object.activity ||
            typeof e.object.activity.render !==
                'function'
        ) {
            error(
                'FULL ACTIVITY RENDER NOT FOUND'
            );

            return;
        }

        var root =
            e.object.activity.render();

        if (
            !root ||
            !root.find
        ) {
            error(
                'FULL ROOT NOT FOUND'
            );

            return;
        }

        mounted = false;
        loading = false;

        log('FULL COMPLITE');

        waitFor(
            function () {
                return findRecommendations(
                    root
                ).length
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
            log(
                'LISTENER.FOLLOW READY'
            );

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
    }

    if (window.__KP_UI_1512__) {
        console.log(
            '[KP UI v' +
            VERSION +
            '] ALREADY INSTALLED'
        );

        return;
    }

    window.__KP_UI_1512__ = true;

    try {
        init();
    } catch (e) {
        error(
            'INIT FATAL:',
            e &&
            (
                e.stack ||
                e.message ||
                e
            )
        );
    }
})();
