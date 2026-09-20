(function () {
    'use strict';

    var VERSION = '1.1.0';
    var BUILD = '2026-09-20-18-15';
    var PLUGIN = 'kp_recommendations_test';

    var START_TIME = performance.now();

    function elapsed() {
        return Math.round(
            performance.now() - START_TIME
        );
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);

        args.unshift(
            '[T+' + elapsed() + 'ms]',
            '[KP UI v' + VERSION + ']'
        );

        console.log.apply(
            console,
            args
        );
    }

    console.log(
        '[KP UI] VERSION:',
        VERSION
    );

    console.log(
        '[KP UI] BUILD:',
        BUILD
    );

    console.log(
        '[KP UI] START:',
        new Date().toISOString()
    );

    if (
        window[PLUGIN] &&
        window[PLUGIN].version === VERSION
    ) {
        console.log(
            '[KP UI] ALREADY INSTALLED:',
            VERSION
        );

        return;
    }

    window[PLUGIN] = {
        version: VERSION
    };

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=110';

    function loadKP(callback) {
        if (
            window.kp_source_plugin &&
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log(
                'KP already loaded'
            );

            callback();

            return;
        }

        log(
            'KP LOAD START'
        );

        var script =
            document.createElement('script');

        script.src =
            KP_SOURCE_URL;

        script.onload =
            function () {
                log(
                    'kp_source.js NETWORK LOADED'
                );

                var attempts = 0;

                var timer =
                    setInterval(
                        function () {
                            attempts++;

                            if (
                                window.kp_source_plugin &&
                                Lampa.Api &&
                                Lampa.Api.sources &&
                                Lampa.Api.sources.KP
                            ) {
                                clearInterval(timer);

                                log(
                                    'KP SOURCE REGISTERED'
                                );

                                callback();

                                return;
                            }

                            if (
                                attempts >= 40
                            ) {
                                clearInterval(timer);

                                log(
                                    'KP REGISTRATION TIMEOUT'
                                );
                            }
                        },
                        100
                    );
            };

        script.onerror =
            function () {
                log(
                    'KP SOURCE LOAD ERROR'
                );
            };

        document.head.appendChild(
            script
        );
    }

    function getCurrentCard(root) {
        var title = '';
        var year = '';

        var titleEl =
            root.find(
                '.full-start-new__title'
            );

        if (
            titleEl.length
        ) {
            title =
                titleEl
                    .first()
                    .text()
                    .trim();
        }

        var head =
            root.find(
                '.full-start-new__head'
            );

        if (
            head.length
        ) {
            var match =
                head
                    .first()
                    .text()
                    .match(
                        /\b(19|20)\d{2}\b/
                    );

            if (
                match
            ) {
                year =
                    match[0];
            }
        }

        if (
            !year
        ) {
            var text =
                root.text();

            var fallback =
                text.match(
                    /\b(19|20)\d{2}\b/
                );

            if (
                fallback
            ) {
                year =
                    fallback[0];
            }
        }

        return {
            title: title,
            year: year
        };
    }

    function getValue(
        object,
        names
    ) {
        if (
            !object ||
            typeof object !== 'object'
        ) {
            return null;
        }

        for (
            var i = 0;
            i < names.length;
            i++
        ) {
            var value;

            try {
                value =
                    object[
                        names[i]
                    ];
            } catch (e) {
                continue;
            }

            if (
                value !== null &&
                value !== undefined &&
                String(value) !== ''
            ) {
                return value;
            }
        }

        return null;
    }

    function extractIds(event) {
        var objects = [
            event &&
                event.object &&
                event.object.card,

            event &&
                event.object &&
                event.object.movie,

            event &&
                event.object,

            event &&
                event.link
        ];

        var result = {
            tmdb: null,
            kp: null,
            imdb: null
        };

        for (
            var i = 0;
            i < objects.length;
            i++
        ) {
            var object =
                objects[i];

            if (
                !object
            ) {
                continue;
            }

            if (
                !result.kp
            ) {
                result.kp =
                    getValue(
                        object,
                        [
                            'kinopoisk_id',
                            'kinopoiskId',
                            'kp_id',
                            'kpId'
                        ]
                    );
            }

            if (
                !result.tmdb
            ) {
                result.tmdb =
                    getValue(
                        object,
                        [
                            'tmdb_id',
                            'tmdbId',
                            'id_tmdb',
                            'tmdb'
                        ]
                    );
            }

            if (
                !result.imdb
            ) {
                result.imdb =
                    getValue(
                        object,
                        [
                            'imdb_id',
                            'imdbId',
                            'imdb'
                        ]
                    );
            }
        }

        return result;
    }

    function getKpIdFromWikidata(
        imdbId,
        callback
    ) {
        log(
            'WIKIDATA START:',
            imdbId
        );

        var query =
            'SELECT ?item ?kp WHERE {' +
            '?item wdt:P345 "' +
            String(imdbId)
                .replace(
                    /"/g,
                    ''
                ) +
            '". ' +
            '?item wdt:P2603 ?kp. ' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql' +
            '?query=' +
            encodeURIComponent(
                query
            ) +
            '&format=json';

        fetch(
            url,
            {
                method: 'GET',
                headers: {
                    'Accept':
                        'application/sparql-results+json'
                }
            }
        )
            .then(
                function (response) {
                    log(
                        'WIKIDATA HTTP:',
                        response.status
                    );

                    if (
                        !response.ok
                    ) {
                        throw new Error(
                            'HTTP ' +
                            response.status
                        );
                    }

                    return response.json();
                }
            )
            .then(
                function (json) {
                    var bindings =
                        json &&
                        json.results &&
                        Array.isArray(
                            json.results.bindings
                        )
                            ? json.results.bindings
                            : [];

                    if (
                        !bindings.length
                    ) {
                        log(
                            'WIKIDATA KP ID NOT FOUND'
                        );

                        callback(
                            null
                        );

                        return;
                    }

                    var kp =
                        bindings[0].kp &&
                        bindings[0].kp.value;

                    log(
                        'WIKIDATA KP ID:',
                        kp
                    );

                    callback(
                        kp || null
                    );
                }
            )
            .catch(
                function (error) {
                    log(
                        'WIKIDATA ERROR:',
                        error
                    );

                    callback(
                        null
                    );
                }
            );
    }

    function getKPFull(
        kpId,
        callback
    ) {
        log(
            'KP FULL START:',
            kpId
        );

        Lampa.Api.sources.KP.full(
            {
                card: {
                    source: 'KP',
                    kinopoisk_id:
                        kpId
                }
            },

            function (json) {
                log(
                    'KP FULL RESPONSE'
                );

                if (
                    !json ||
                    !json.simular ||
                    !Array.isArray(
                        json.simular.results
                    )
                ) {
                    log(
                        'KP SIMILAR DATA EMPTY'
                    );

                    callback(
                        []
                    );

                    return;
                }

                log(
                    'SIMILAR COUNT:',
                    json
                        .simular
                        .results
                        .length
                );

                callback(
                    json
                        .simular
                        .results
                );
            },

            function (error) {
                log(
                    'KP FULL ERROR:',
                    error
                );

                callback(
                    []
                );
            }
        );
    }

    function getTitle(item) {
        return (
            item.title ||
            item.name ||
            item.nameRu ||
            item.original_title ||
            item.original_name ||
            'Без названия'
        );
    }

    function getYear(item) {
        return (
            item.year ||
            item.release_year ||
            (
                item.release_date
                    ? String(
                        item.release_date
                    ).slice(
                        0,
                        4
                    )
                    : ''
            )
        );
    }

    function getPoster(item) {
        return (
            item.img ||
            item.poster ||
            item.poster_path ||
            item.poster_url ||
            item.posterUrl ||
            item.posterUrlPreview ||
            ''
        );
    }

    function getVote(item) {
        return (
            item.vote ||
            item.rating ||
            item.rating_kp ||
            item.ratingKinopoisk ||
            ''
        );
    }

    function createCard(item) {
        var title =
            getTitle(item);

        var year =
            getYear(item);

        var poster =
            getPoster(item);

        var vote =
            getVote(item);

        var card =
            $(
                '<div class="card selector layer--visible layer--render card--loaded">' +
                    '<div class="card__view">' +
                        '<img class="card__img">' +
                        '<div class="card__icons">' +
                            '<div class="card__icons-inner"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="card__title"></div>' +
                    '<div class="card__age"></div>' +
                '</div>'
            );

        card
            .find(
                '.card__title'
            )
            .text(
                title
            );

        card
            .find(
                '.card__age'
            )
            .text(
                year
            );

        if (
            poster
        ) {
            card
                .find(
                    '.card__img'
                )
                .attr(
                    'src',
                    poster
                )
                .on(
                    'error',
                    function () {
                        this.src =
                            './img/img_broken.svg';
                    }
                );
        } else {
            card
                .find(
                    '.card__img'
                )
                .attr(
                    'src',
                    './img/img_broken.svg'
                );
        }

        if (
            vote !== '' &&
            vote !== null &&
            vote !== undefined
        ) {
            card
                .find(
                    '.card__view'
                )
                .append(
                    $(
                        '<div class="card__vote"></div>'
                    ).text(
                        vote
                    )
                );
        }

        card.on(
            'hover:enter',
            function () {
                log(
                    'SELECT:',
                    title,
                    year
                );
            }
        );

        return card;
    }

    function createLine() {
        var line =
            $(
                '<div class="items-line layer--visible layer--render items-line--type-default kp-recommendations-line">' +
                    '<div class="items-line__head">' +
                        '<div class="items-line__title">' +
                            'Рекомендации Кинопоиска' +
                        '</div>' +
                    '</div>' +
                    '<div class="items-line__body">' +
                        '<div class="scroll scroll--horizontal">' +
                            '<div class="scroll__content">' +
                                '<div class="scroll__body mapping--line">' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );

        return line;
    }

    function showLoading(
        root
    ) {
        root
            .find(
                '.kp-recommendations-line'
            )
            .remove();

        var line =
            createLine();

        line
            .find(
                '.items-line__title'
            )
            .text(
                'Рекомендации Кинопоиска'
            );

        line
            .find(
                '.mapping--line'
            )
            .html(
                '<div class="kp-loading">' +
                    'Загрузка...' +
                '</div>'
            );

        var similarTitle =
            root
                .find(
                    '.items-line__title'
                )
                .filter(
                    function () {
                        return (
                            $(this)
                                .text()
                                .trim() ===
                            'Похожие'
                        );
                    }
                )
                .first();

        if (
            similarTitle.length
        ) {
            similarTitle
                .closest(
                    '.items-line'
                )
                .before(
                    line
                );
        } else {
            root.append(
                line
            );
        }

        log(
            'UI LOADING ROW INSERTED'
        );
    }

    function renderResults(
        root,
        results
    ) {
        var line =
            root.find(
                '.kp-recommendations-line'
            );

        if (
            !line.length
        ) {
            return;
        }

        var body =
            line.find(
                '.mapping--line'
            );

        body.empty();

        if (
            !results ||
            !results.length
        ) {
            line
                .find(
                    '.items-line__title'
                )
                .text(
                    'Рекомендации Кинопоиска'
                );

            body.html(
                '<div class="kp-loading">' +
                    'Нет рекомендаций' +
                '</div>'
            );

            log(
                'UI EMPTY'
            );

            return;
        }

        results.forEach(
            function (item) {
                body.append(
                    createCard(
                        item
                    )
                );
            }
        );

        log(
            'UI RESULTS RENDERED:',
            results.length
        );
    }

    function install() {
        if (
            !window.Lampa ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !==
                'function'
        ) {
            return false;
        }

        if (
            install.done
        ) {
            return true;
        }

        install.done = true;

        log(
            'PLUGIN INSTALLED'
        );

        Lampa.Listener.follow(
            'full',
            function (event) {
                if (
                    !event ||
                    event.type !==
                        'complite' ||
                    !event.object ||
                    !event.object.activity ||
                    typeof event.object.activity.render !==
                        'function'
                ) {
                    return;
                }

                var eventStart =
                    performance.now();

                log(
                    'FULL COMPLETE EVENT'
                );

                var root =
                    event.object.activity.render();

                if (
                    !root ||
                    typeof root.find !==
                        'function'
                ) {
                    return;
                }

                if (
                    root.find(
                        '.kp-recommendations-line'
                    ).length
                ) {
                    return;
                }

                var card =
                    getCurrentCard(
                        root
                    );

                log(
                    'CURRENT CARD:',
                    card
                );

                var ids =
                    extractIds(
                        event
                    );

                log(
                    'IDS FROM LAMPA:',
                    ids
                );

                /*
                 * Сразу показываем UI.
                 */
                showLoading(
                    root
                );

                /*
                 * KP source и Wikidata
                 * запускаем параллельно.
                 */
                var kpReady =
                    false;

                var kpId =
                    ids.kp || null;

                var wikidataReady =
                    false;

                var wikidataKpId =
                    null;

                function tryContinue() {
                    if (
                        !wikidataReady ||
                        !kpReady
                    ) {
                        return;
                    }

                    var finalKpId =
                        kpId ||
                        wikidataKpId;

                    if (
                        !finalKpId
                    ) {
                        log(
                            'NO KP ID'
                        );

                        renderResults(
                            root,
                            []
                        );

                        return;
                    }

                    log(
                        'FINAL KP ID:',
                        finalKpId
                    );

                    getKPFull(
                        finalKpId,
                        function (
                            results
                        ) {
                            log(
                                'TOTAL PIPELINE:',
                                Math.round(
                                    performance.now() -
                                    eventStart
                                ) +
                                'ms'
                            );

                            renderResults(
                                root,
                                results
                            );
                        }
                    );
                }

                /*
                 * KP source load.
                 */
                loadKP(
                    function () {
                        kpReady =
                            true;

                        log(
                            'KP READY'
                        );

                        tryContinue();
                    }
                );

                /*
                 * IMDb -> Wikidata.
                 */
                if (
                    ids.imdb
                ) {
                    getKpIdFromWikidata(
                        ids.imdb,
                        function (
                            value
                        ) {
                            wikidataKpId =
                                value;

                            wikidataReady =
                                true;

                            log(
                                'WIKIDATA READY'
                            );

                            tryContinue();
                        }
                    );
                } else {
                    wikidataReady =
                        true;

                    tryContinue();
                }
            }
        );

        return true;
    }

    if (
        !install()
    ) {
        var attempts = 0;

        var timer =
            setInterval(
                function () {
                    attempts++;

                    if (
                        install() ||
                        attempts >= 120
                    ) {
                        clearInterval(
                            timer
                        );
                    }
                },
                500
            );
    }

}());
