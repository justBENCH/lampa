(function () {
    'use strict';

    var VERSION = '1.1.2';
    var BUILD = '2026-09-20-18-35';
    var PLUGIN = 'kp_recommendations_test';

    var START_TIME = performance.now();

    console.log('[KP UI] ========================================');
    console.log('[KP UI] VERSION:', VERSION);
    console.log('[KP UI] BUILD:', BUILD);
    console.log('[KP UI] START:', new Date().toISOString());
    console.log('[KP UI] ========================================');

    function elapsed() {
        return Math.round(
            performance.now() - START_TIME
        );
    }

    function log() {
        var args =
            Array.prototype.slice.call(arguments);

        args.unshift(
            '[T+' + elapsed() + 'ms]',
            '[KP UI v' + VERSION + ']'
        );

        console.log.apply(
            console,
            args
        );
    }

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
        'https://nb557.github.io/plugins/kp_source.js?v=112';

    var activeJobs = [];

    function loadKP(callback) {
        if (
            window.kp_source_plugin &&
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log(
                'KP ALREADY LOADED'
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
                    'KP SOURCE NETWORK LOADED'
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
                    object[names[i]];
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

            if (!object) {
                continue;
            }

            if (!result.kp) {
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

            if (!result.tmdb) {
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

            if (!result.imdb) {
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
                .replace(/"/g, '') +
            '". ' +
            '?item wdt:P2603 ?kp. ' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql' +
            '?query=' +
            encodeURIComponent(query) +
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

                    if (!response.ok) {
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

                    if (!bindings.length) {
                        log(
                            'WIKIDATA KP ID NOT FOUND'
                        );

                        callback(null);

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

                    callback(null);
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

                    callback([]);

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

                callback([]);
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

        if (poster) {
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

    function createLine(
        results
    ) {
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

        var body =
            line.find(
                '.mapping--line'
            );

        results.forEach(
            function (item) {
                body.append(
                    createCard(item)
                );
            }
        );

        return line;
    }

    function findFullRoot(
        activity
    ) {
        if (
            !activity ||
            typeof activity.render !==
                'function'
        ) {
            return null;
        }

        var root =
            activity.render();

        if (
            !root ||
            typeof root.find !==
                'function'
        ) {
            return null;
        }

        return root;
    }

    function mountResults(
        activity,
        results,
        reason
    ) {
        var root =
            findFullRoot(
                activity
            );

        if (!root) {
            log(
                'MOUNT FAILED: NO ROOT'
            );

            return false;
        }

        var existing =
            root.find(
                '.kp-recommendations-line'
            );

        if (existing.length) {
            log(
                'ROW ALREADY EXISTS:',
                reason
            );

            return true;
        }

        var line =
            createLine(
                results
            );

        /*
         * Ставим именно между нативными
         * "Рекомендации" и "Похожие".
         */
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

            log(
                'ROW INSERTED BEFORE "Похожие":',
                reason
            );
        } else {
            /*
             * Запасной вариант:
             * после последней native строки.
             */
            var rows =
                root.find(
                    '.items-line'
                );

            if (rows.length) {
                rows
                    .last()
                    .after(line);

                log(
                    'ROW INSERTED AFTER LAST LINE:',
                    reason
                );
            } else {
                log(
                    'NO ITEMS-LINE FOUND'
                );

                return false;
            }
        }

        var actual =
            root.find(
                '.kp-recommendations-line'
            );

        log(
            'ROW COUNT AFTER INSERT:',
            actual.length
        );

        if (
            actual.length
        ) {
            log(
                'CARD COUNT:',
                actual
                    .find('.card')
                    .length
            );

            log(
                'CONNECTED:',
                !!(
                    actual[0] &&
                    document.documentElement.contains(
                        actual[0]
                    )
                )
            );

            return true;
        }

        return false;
    }

    function startDomWatch(
        activity,
        results
    ) {
        log(
            'DOM WATCH START'
        );

        var attempts = 0;
        var maxAttempts = 100;

        function check() {
            attempts++;

            var root =
                findFullRoot(
                    activity
                );

            if (!root) {
                return;
            }

            var exists =
                root.find(
                    '.kp-recommendations-line'
                ).length;

            if (!exists) {
                log(
                    'ROW MISSING -> REMOUNT',
                    attempts
                );

                mountResults(
                    activity,
                    results,
                    'watch #' + attempts
                );
            }

            if (
                attempts >= maxAttempts
            ) {
                clearInterval(
                    timer
                );

                log(
                    'DOM WATCH STOP'
                );
            }
        }

        check();

        var timer =
            setInterval(
                check,
                100
            );

        activeJobs.push(
            timer
        );

        /*
         * Дополнительно ловим мгновенную
         * перерисовку Lampa.
         */
        if (
            window.MutationObserver &&
            document.body
        ) {
            var observer =
                new MutationObserver(
                    function () {
                        var root =
                            findFullRoot(
                                activity
                            );

                        if (!root) {
                            return;
                        }

                        if (
                            !root.find(
                                '.kp-recommendations-line'
                            ).length
                        ) {
                            mountResults(
                                activity,
                                results,
                                'mutation'
                            );
                        }
                    }
                );

            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true
                }
            );

            setTimeout(
                function () {
                    observer.disconnect();

                    log(
                        'MUTATION WATCH STOP'
                    );
                },
                10000
            );
        }
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

        if (install.done) {
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

                var activity =
                    event.object.activity;

                log(
                    'FULL COMPLETE EVENT'
                );

                var root =
                    findFullRoot(
                        activity
                    );

                if (!root) {
                    return;
                }

                if (
                    root.find(
                        '.kp-recommendations-line'
                    ).length
                ) {
                    return;
                }

                log(
                    'CURRENT CARD:',
                    {
                        title:
                            root
                                .find(
                                    '.full-start-new__title'
                                )
                                .first()
                                .text()
                                .trim()
                    }
                );

                var ids =
                    extractIds(
                        event
                    );

                log(
                    'IDS FROM LAMPA:',
                    ids
                );

                var kpReady =
                    false;

                var wikidataReady =
                    false;

                var directKpId =
                    ids.kp || null;

                var wikidataKpId =
                    null;

                function tryContinue() {
                    if (
                        !kpReady ||
                        !wikidataReady
                    ) {
                        return;
                    }

                    var finalKpId =
                        directKpId ||
                        wikidataKpId;

                    if (!finalKpId) {
                        log(
                            'NO KP ID'
                        );

                        return;
                    }

                    log(
                        'FINAL KP ID:',
                        finalKpId
                    );

                    getKPFull(
                        finalKpId,
                        function (results) {
                            log(
                                'TOTAL PIPELINE:',
                                Math.round(
                                    performance.now() -
                                    eventStart
                                ) + 'ms'
                            );

                            log(
                                'RESULTS READY:',
                                results.length
                            );

                            /*
                             * Вставляем в актуальный DOM.
                             */
                            mountResults(
                                activity,
                                results,
                                'results'
                            );

                            /*
                             * И следим за Lampa,
                             * чтобы она не удалила строку.
                             */
                            startDomWatch(
                                activity,
                                results
                            );
                        }
                    );
                }

                /*
                 * KP source.
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
                if (ids.imdb) {
                    getKpIdFromWikidata(
                        ids.imdb,
                        function (value) {
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

    if (!install()) {
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
