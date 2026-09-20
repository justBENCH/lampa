/* Lampa KP Recommendations DEBUG v1.2.1 */
(function () {
    'use strict';

    var PREFIX = '[KP DEBUG]';

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        console.log.apply(console, args);
    }

    function error() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX + ' ERROR');
        console.error.apply(console, args);
    }

    function getTitle(card) {
        if (!card) return '';

        return (
            card.title ||
            card.name ||
            card.original_title ||
            card.original_name ||
            ''
        );
    }

    function getYear(card) {
        if (!card) return '';

        var date =
            card.release_date ||
            card.first_air_date ||
            card.year ||
            '';

        return String(date).substring(0, 4);
    }

    function inspectCard(card) {
        log('==============================');
        log('CARD:', card);
        log('TITLE:', getTitle(card));
        log('YEAR:', getYear(card));

        if (card) {
            log('SOURCE:', card.source);
            log('ID:', card.id);
            log('TMDB ID:', card.tmdb_id);
            log('KP ID:', card.kinopoisk_id);
            log('TYPE:', card.type);
        }
    }

    function getKPSource() {
        var Lampa = window.Lampa;

        var exists = !!(
            window.kp_source_plugin &&
            Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        );

        log('kp_source installed:', exists);
        log('window.kp_source_plugin:', window.kp_source_plugin);

        if (
            Lampa &&
            Lampa.Api &&
            Lampa.Api.sources
        ) {
            log(
                'Lampa.Api.sources:',
                Object.keys(Lampa.Api.sources)
            );
        }

        return exists
            ? Lampa.Api.sources.KP
            : null;
    }

    function testKP(card) {
        var KP = getKPSource();

        if (!KP) {
            log('STOP: kp_source is NOT installed');

            /*
             * Проверяем fallback API.
             */
            testFallback(card);

            return;
        }

        log('KP SOURCE OBJECT:', KP);
        log(
            'KP methods:',
            Object.keys(KP)
        );

        if (
            typeof KP.discovery !==
            'function'
        ) {
            error(
                'KP.discovery() does not exist'
            );

            return;
        }

        var discovery;

        try {
            discovery = KP.discovery();
        } catch (e) {
            error(
                'KP.discovery() exception:',
                e
            );

            return;
        }

        log(
            'KP discovery:',
            discovery
        );

        if (
            !discovery ||
            typeof discovery.search !==
            'function'
        ) {
            error(
                'KP discovery.search() does not exist'
            );

            return;
        }

        var title = getTitle(card);

        log(
            'KP SEARCH TITLE:',
            title
        );

        discovery.search(
            {
                query: encodeURIComponent(title),
                page: 1
            },
            function (data) {
                log(
                    'KP SEARCH RESULT:',
                    data
                );

                if (!Array.isArray(data)) {
                    error(
                        'KP search result is not array'
                    );

                    return;
                }

                var results = [];

                data.forEach(
                    function (part, index) {
                        log(
                            'KP SEARCH PART ' +
                            index +
                            ':',
                            part
                        );

                        if (
                            part &&
                            Array.isArray(
                                part.results
                            )
                        ) {
                            results =
                                results.concat(
                                    part.results
                                );
                        }
                    }
                );

                log(
                    'KP TOTAL SEARCH RESULTS:',
                    results.length
                );

                results.forEach(
                    function (item, index) {
                        log(
                            'KP RESULT #' +
                            index,
                            {
                                id:
                                    item &&
                                    item.kinopoisk_id,

                                title:
                                    getTitle(item),

                                year:
                                    getYear(item),

                                item: item
                            }
                        );
                    }
                );

                if (!results.length) {
                    error(
                        'KP search returned ZERO results'
                    );

                    return;
                }

                var target =
                    results[0];

                var year =
                    getYear(card);

                for (
                    var i = 0;
                    i < results.length;
                    i++
                ) {
                    var candidate =
                        results[i];

                    if (
                        getTitle(candidate)
                            .toLowerCase()
                            .indexOf(
                                title.toLowerCase()
                            ) !== -1 &&
                        (
                            !year ||
                            !getYear(candidate) ||
                            getYear(candidate) === year
                        )
                    ) {
                        target = candidate;
                        break;
                    }
                }

                log(
                    'SELECTED KP RESULT:',
                    target
                );

                if (
                    !target ||
                    !target.kinopoisk_id
                ) {
                    error(
                        'Selected result has NO kinopoisk_id'
                    );

                    return;
                }

                log(
                    'SELECTED KP ID:',
                    target.kinopoisk_id
                );

                testKPFull(
                    KP,
                    target
                );
            },
            function () {
                error(
                    'KP SEARCH ERROR'
                );
            }
        );
    }

    function testKPFull(KP, card) {
        log(
            'CALLING KP.full()...',
            card
        );

        KP.full(
            {
                card: card
            },
            function (json) {
                log(
                    'KP FULL RESULT:',
                    json
                );

                if (!json) {
                    error(
                        'KP.full returned EMPTY'
                    );

                    return;
                }

                log(
                    'KP SIMULAR:',
                    json.simular
                );

                if (
                    json.simular &&
                    Array.isArray(
                        json.simular.results
                    )
                ) {
                    log(
                        'KP SIMILARS COUNT:',
                        json.simular.results.length
                    );

                    json.simular.results.forEach(
                        function (item, index) {
                            log(
                                'SIMILAR #' +
                                index,
                                item
                            );
                        }
                    );

                    log(
                        'SUCCESS: KP recommendations received!'
                    );
                } else {
                    error(
                        'KP FULL HAS NO simular.results'
                    );
                }
            },
            function (a, b) {
                error(
                    'KP.full ERROR:',
                    a,
                    b
                );
            }
        );
    }

    /*
     * =========================================================
     * FALLBACK
     * =========================================================
     */

    function testFallback(card) {
        var Lampa = window.Lampa;

        log(
            'Testing fallback API...'
        );

        if (!Lampa || !Lampa.Reguest) {
            error(
                'Lampa.Reguest unavailable'
            );

            return;
        }

        var title = getTitle(card);

        var url =
            'https://kinopoiskapiunofficial.tech/' +
            'api/v2.1/films/search-by-keyword' +
            '?keyword=' +
            encodeURIComponent(title) +
            '&page=1';

        log(
            'FALLBACK SEARCH URL:',
            url
        );

        var request =
            new Lampa.Reguest();

        request.timeout(15000);

        request.silent(
            url,
            function (json) {
                log(
                    'FALLBACK SEARCH RESULT:',
                    json
                );

                var items =
                    json &&
                    (
                        json.films ||
                        json.items ||
                        []
                    );

                log(
                    'FALLBACK RESULTS COUNT:',
                    items.length
                );

                if (!items.length) {
                    error(
                        'Fallback returned ZERO results'
                    );

                    return;
                }

                var item =
                    items[0];

                log(
                    'FALLBACK FIRST RESULT:',
                    item
                );

                var kpId =
                    item.kinopoiskId ||
                    item.filmId;

                log(
                    'FALLBACK KP ID:',
                    kpId
                );

                if (!kpId) {
                    error(
                        'Fallback result has no KP ID'
                    );

                    return;
                }

                testFallbackSimilar(
                    request,
                    kpId
                );
            },
            function (a, b) {
                error(
                    'FALLBACK SEARCH ERROR:',
                    a,
                    b
                );
            },
            false,
            {
                headers: {
                    'X-API-KEY':
                        '2a4a0808-81a3-40ae-b0d3-e11335ede616'
                }
            }
        );
    }

    function testFallbackSimilar(
        request,
        kpId
    ) {
        var url =
            'https://kinopoiskapiunofficial.tech/' +
            'api/v2.2/films/' +
            kpId +
            '/similars';

        log(
            'FALLBACK SIMILARS URL:',
            url
        );

        request.timeout(15000);

        request.silent(
            url,
            function (json) {
                log(
                    'FALLBACK SIMILARS RESULT:',
                    json
                );

                if (
                    json &&
                    Array.isArray(
                        json.items
                    )
                ) {
                    log(
                        'FALLBACK SIMILARS COUNT:',
                        json.items.length
                    );
                }
            },
            function (a, b) {
                error(
                    'FALLBACK SIMILARS ERROR:',
                    a,
                    b
                );
            },
            false,
            {
                headers: {
                    'X-API-KEY':
                        '2a4a0808-81a3-40ae-b0d3-e11335ede616'
                }
            }
        );
    }

    /*
     * =========================================================
     * LISTENER
     * =========================================================
     */

    function install() {
        var Lampa = window.Lampa;

        if (
            !Lampa ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !==
            'function'
        ) {
            return false;
        }

        if (
            window.helperKPDebugInstalled
        ) {
            return true;
        }

        window.helperKPDebugInstalled =
            true;

        log(
            'DEBUG HELPER INSTALLED'
        );

        Lampa.Listener.follow(
            'full',
            function (event) {
                log(
                    'FULL EVENT:',
                    event
                );

                if (
                    !event ||
                    event.type !==
                    'complite'
                ) {
                    return;
                }

                log(
                    'FULL COMPLITE EVENT'
                );

                /*
                 * Проверяем ВСЕ потенциальные места,
                 * где Lampa могла сохранить карточку.
                 */

                var candidates = {
                    event_data:
                        event.data,

                    event_object_card:
                        event.object &&
                        event.object.card,

                    event_object_data:
                        event.object &&
                        event.object.data,

                    event_object:
                        event.object,

                    event_link:
                        event.link
                };

                log(
                    'CARD CANDIDATES:',
                    candidates
                );

                var card =
                    event.data ||
                    (
                        event.object &&
                        event.object.card
                    ) ||
                    (
                        event.object &&
                        event.object.data
                    );

                if (!card) {
                    log(
                        'No direct card found. Trying activity...'
                    );

                    try {
                        var activity =
                            event.object &&
                            event.object.activity;

                        if (
                            activity
                        ) {
                            log(
                                'ACTIVITY:',
                                activity
                            );

                            log(
                                'ACTIVITY PARAMS:',
                                activity.params
                            );

                            log(
                                'ACTIVITY CARD:',
                                activity.card
                            );

                            card =
                                activity.card ||
                                (
                                    activity.params &&
                                    activity.params.card
                                );
                        }
                    } catch (e) {
                        error(
                            'Activity inspection error:',
                            e
                        );
                    }
                }

                if (!card) {
                    error(
                        'NO CARD FOUND'
                    );

                    return;
                }

                inspectCard(card);

                testKP(card);
            }
        );

        return true;
    }

    if (!install()) {
        var attempts = 0;

        var timer =
            setInterval(
                function () {
                    if (
                        install() ||
                        ++attempts >= 120
                    ) {
                        clearInterval(timer);
                    }
                },
                500
            );
    }
})();
