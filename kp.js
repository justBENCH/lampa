/* KP Recommendations for Lampa v1.5.6
 * 2026-09-20
 *
 * full:complite
 * -> wait native Recommendations
 * -> IMDb
 * -> Wikidata
 * -> KP source
 * -> KP.full()
 * -> native-like DOM cards
 */
(function () {
    'use strict';

    var VERSION = '1.5.6';
    var BUILD = '2026-09-20-19-20';

    console.log('[KP UI v' + VERSION + '] VERSION:', VERSION);
    console.log('[KP UI v' + VERSION + '] BUILD:', BUILD);

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=' + Date.now();

    var kpLoaded = false;
    var kpLoading = false;

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

    function getCurrentCard(event) {
        if (!event || !event.object) return null;

        if (event.object.card) {
            return event.object.card;
        }

        if (event.object.params && event.object.params.card) {
            return event.object.params.card;
        }

        return null;
    }

    function getImdbId(card) {
        if (!card) return '';

        return (
            card.imdb_id ||
            card.imdbId ||
            card.imdb ||
            ''
        );
    }

    function getRoot(event) {
        if (
            !event ||
            !event.object ||
            !event.object.activity ||
            typeof event.object.activity.render !== 'function'
        ) {
            return null;
        }

        try {
            return event.object.activity.render();
        } catch (e) {
            return null;
        }
    }

    function findNativeRecommendations(root) {
        if (!root || !root.find) return null;

        var lines = root.find('.items-line').toArray();

        for (var i = 0; i < lines.length; i++) {
            var title = $(lines[i])
                .find('.items-line__title')
                .first()
                .text()
                .trim()
                .toLowerCase();

            if (
                title === 'рекомендации' ||
                title.indexOf('рекомендации') !== -1
            ) {
                return lines[i];
            }
        }

        return null;
    }

    function waitForNativeRecommendations(event, callback) {
        var activity =
            event &&
            event.object &&
            event.object.activity;

        if (
            !activity ||
            typeof activity.render !== 'function'
        ) {
            error('ACTIVITY RENDER NOT FOUND');
            return;
        }

        var started = Date.now();
        var finished = false;
        var observer = null;
        var timer = null;

        log('WAIT NATIVE RECOMMENDATIONS START');

        function stop() {
            if (finished) return;

            finished = true;

            if (observer) {
                try {
                    observer.disconnect();
                } catch (e) {}
            }

            if (timer) {
                clearInterval(timer);
            }
        }

        function check(source) {
            if (finished) return;

            var root;

            try {
                root = activity.render();
            } catch (e) {
                return;
            }

            if (!root || !root.find) {
                return;
            }

            var native =
                findNativeRecommendations(root);

            if (native) {
                stop();

                log(
                    'NATIVE RECOMMENDATIONS FOUND:',
                    source,
                    'after',
                    Date.now() - started + 'ms'
                );

                log(
                    'NATIVE RECOMMENDATIONS CONNECTED:',
                    !!$(native).closest('body').length
                );

                callback(root, native);
            }
        }

        check('initial');

        if (finished) return;

        try {
            var initialRoot = activity.render();

            if (
                initialRoot &&
                initialRoot[0] &&
                window.MutationObserver
            ) {
                observer =
                    new MutationObserver(
                        function () {
                            check('mutation');
                        }
                    );

                observer.observe(
                    initialRoot[0],
                    {
                        childList: true,
                        subtree: true
                    }
                );

                log(
                    'NATIVE RECOMMENDATIONS OBSERVER START'
                );
            }
        } catch (e) {
            error(
                'MUTATION OBSERVER ERROR:',
                e
            );
        }

        timer = setInterval(
            function () {
                check('poll');

                if (
                    !finished &&
                    Date.now() - started >= 30000
                ) {
                    stop();

                    error(
                        'NATIVE RECOMMENDATIONS TIMEOUT: 30s'
                    );
                }
            },
            300
        );
    }

    function loadKPSource(done) {
        if (
            kpLoaded &&
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log('KP SOURCE ALREADY READY');
            done();
            return;
        }

        if (kpLoading) {
            var attempts = 0;

            var waitTimer =
                setInterval(
                    function () {
                        if (
                            window.Lampa &&
                            Lampa.Api &&
                            Lampa.Api.sources &&
                            Lampa.Api.sources.KP
                        ) {
                            clearInterval(
                                waitTimer
                            );

                            kpLoaded = true;

                            log(
                                'KP SOURCE READY AFTER WAIT'
                            );

                            done();
                        } else if (
                            ++attempts >= 60
                        ) {
                            clearInterval(
                                waitTimer
                            );

                            error(
                                'KP SOURCE WAIT TIMEOUT'
                            );
                        }
                    },
                    250
                );

            return;
        }

        kpLoading = true;

        log('KP SOURCE LOAD START');
        log(
            'KP SOURCE URL:',
            KP_SOURCE_URL
        );

        var script =
            document.createElement(
                'script'
            );

        script.onload = function () {
            log(
                'KP SOURCE NETWORK LOADED'
            );

            var attempts = 0;

            var timer =
                setInterval(
                    function () {
                        if (
                            window.Lampa &&
                            Lampa.Api &&
                            Lampa.Api.sources &&
                            Lampa.Api.sources.KP
                        ) {
                            clearInterval(
                                timer
                            );

                            kpLoaded = true;
                            kpLoading = false;

                            log(
                                'KP SOURCE REGISTERED'
                            );

                            log(
                                'KP SOURCE READY'
                            );

                            done();
                        } else if (
                            ++attempts >= 40
                        ) {
                            clearInterval(
                                timer
                            );

                            kpLoading = false;

                            error(
                                'KP SOURCE REGISTER ERROR'
                            );
                        }
                    },
                    250
                );
        };

        script.onerror =
            function (e) {
                kpLoading = false;

                error(
                    'KP SOURCE LOAD ERROR:',
                    e
                );
            };

        script.src =
            KP_SOURCE_URL;

        document.head.appendChild(
            script
        );
    }

    function findKPIdByIMDb(
        imdbId,
        callback
    ) {
        if (!imdbId) {
            callback(null);
            return;
        }

        log(
            'WIKIDATA SPARQL START:',
            imdbId
        );

        var query =
            'SELECT ?item ?kp WHERE {' +
            ' ?item wdt:P345 "' +
            imdbId.replace(
                /"/g,
                '\\"'
            ) +
            '".' +
            ' ?item wdt:P2603 ?kp.' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql?format=json&query=' +
            encodeURIComponent(query);

        var request =
            new Lampa.Reguest();

        request.silent(
            url,
            function (json) {
                log(
                    'WIKIDATA HTTP: 200'
                );

                try {
                    var bindings =
                        json &&
                        json.results &&
                        json.results.bindings
                            ? json.results.bindings
                            : [];

                    if (!bindings.length) {
                        log(
                            'WIKIDATA KP ID: NOT FOUND'
                        );

                        callback(null);
                        return;
                    }

                    var kp =
                        bindings[0].kp &&
                        bindings[0].kp.value
                            ? bindings[0].kp.value
                            : '';

                    log(
                        'WIKIDATA KP ID:',
                        kp || 'NOT FOUND'
                    );

                    callback(
                        kp || null
                    );
                } catch (e) {
                    error(
                        'WIKIDATA PARSE ERROR:',
                        e
                    );

                    callback(null);
                }
            },
            function (a, b) {
                error(
                    'WIKIDATA ERROR:',
                    a,
                    b
                );

                callback(null);
            }
        );
    }

    function escapeHtml(value) {
        return String(
            value == null ? '' : value
        )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function createNativeCard(data) {
        var title =
            data.title ||
            data.name ||
            data.original_title ||
            data.original_name ||
            'Без названия';

        var year =
            data.release_date ||
            data.first_air_date ||
            data.year ||
            '';

        year =
            String(year).slice(0, 4);

        var img =
            data.img ||
            data.poster_path ||
            '';

        var rating =
            data.vote_average ||
            data.kp_rating ||
            0;

        rating =
            Number(rating) || 0;

        var ratingText =
            rating > 0
                ? rating.toFixed(1)
                : '';

        var card =
            $(
                '<div class="card selector layer--visible layer--render card--loaded kp-ui-card">' +
                    '<div class="card__view">' +
                        '<img class="card__img" loading="lazy">' +
                        '<div class="card__icons">' +
                            '<div class="card__icons-inner"></div>' +
                        '</div>' +
                        (
                            ratingText
                                ? '<div class="card__vote">' +
                                    escapeHtml(
                                        ratingText
                                    ) +
                                  '</div>'
                                : ''
                        ) +
                    '</div>' +
                    '<div class="card__title">' +
                        escapeHtml(title) +
                    '</div>' +
                    (
                        year
                            ? '<div class="card__age">' +
                                escapeHtml(
                                    year
                                ) +
                              '</div>'
                            : ''
                    ) +
                '</div>'
            );

        if (img) {
            card
                .find('.card__img')
                .attr(
                    'src',
                    img
                );
        }

        /*
         * Сохраняем объект фильма прямо на DOM.
         */
        card[0].kpData =
            data;

        /*
         * Клик мышкой.
         */
        card.on(
            'click',
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                log(
                    'CARD CLICK:',
                    title,
                    '|',
                    data.id
                );

                try {
                    Router.call(
                        'full',
                        data
                    );
                } catch (e) {
                    error(
                        'ROUTER ERROR:',
                        e
                    );
                }
            }
        );

        /*
         * Фокус пультом / клавиатурой.
         */
        card.on(
            'hover:focus',
            function () {
                try {
                    if (
                        window.Background &&
                        typeof Background.change ===
                            'function'
                    ) {
                        Background.change(
                            Lampa.Utils
                                .cardImgBackground(
                                    data
                                )
                        );
                    }
                } catch (e) {}

                try {
                    if (
                        event &&
                        event.link &&
                        event.link.items &&
                        event.link.items[0]
                    ) {
                        event.link.items[0].last =
                            this;
                    }
                } catch (e) {}
            }
        );

        return card;
    }

    function createRow(results) {
        var row =
            $(
                '<div class="items-line kp-recommendations-line layer--visible layer--render">'
            );

        row.attr(
            'data-kp-ui-version',
            VERSION
        );

        var head =
            $(
                '<div class="items-line__head">' +
                    '<div class="items-line__title">' +
                        'Рекомендации Кинопоиска' +
                    '</div>' +
                '</div>'
            );

        var body =
            $(
                '<div class="items-line__body"></div>'
            );

        var scroll =
            $(
                '<div class="scroll scroll--horizontal"></div>'
            );

        var content =
            $(
                '<div class="scroll__content"></div>'
            );

        var mapping =
            $(
                '<div class="scroll__body mapping--line"></div>'
            );

        var cardCount = 0;

        for (
            var i = 0;
            i < results.length;
            i++
        ) {
            var card =
                createNativeCard(
                    results[i]
                );

            if (!card) {
                continue;
            }

            mapping.append(
                card
            );

            cardCount++;
        }

        content.append(
            mapping
        );

        scroll.append(
            content
        );

        body.append(
            scroll
        );

        row.append(
            head
        );

        row.append(
            body
        );

        log(
            'NATIVE CARD DOM COUNT:',
            cardCount
        );

        return {
            row: row,
            cardCount: cardCount
        };
    }

    function renderResults(
        results,
        root,
        nativeRecommendations
    ) {
        if (
            !results ||
            !results.length
        ) {
            error(
                'NO RESULTS TO RENDER'
            );

            return;
        }

        var old =
            root.find(
                '.kp-recommendations-line[data-kp-ui-version="' +
                    VERSION +
                    '"]'
            );

        if (old.length) {
            old.remove();

            log(
                'OLD ROW REMOVED'
            );
        }

        var built =
            createRow(
                results
            );

        if (!built ||
            !built.row) {
            error(
                'ROW BUILD FAILED'
            );

            return;
        }

        var row =
            built.row;

        /*
         * Главное изменение v1.5.6:
         * карточки уже являются настоящими DOM-элементами.
         */
        $(row).insertAfter(
            nativeRecommendations
        );

        log(
            'ROW INSERTED AFTER NATIVE Рекомендации'
        );

        log(
            'ROW CONNECTED:',
            !!row.closest('body').length
        );

        log(
            'ROW CARD COUNT:',
            row.find('.card').length
        );

        /*
         * Проверяем итоговый DOM.
         */
        var timerAttempts = 0;

        var timer =
            setInterval(
                function () {
                    timerAttempts++;

                    var exists =
                        root.find(
                            '.kp-recommendations-line[data-kp-ui-version="' +
                                VERSION +
                                '"]'
                        );

                    log(
                        'DOM WATCH #' +
                            timerAttempts +
                            ': ROW=' +
                            exists.length +
                            ' CARDS=' +
                            exists.find(
                                '.card'
                            ).length
                    );

                    if (
                        !exists.length
                    ) {
                        var currentNative =
                            findNativeRecommendations(
                                root
                            );

                        if (
                            currentNative
                        ) {
                            $(row).insertAfter(
                                currentNative
                            );

                            log(
                                'ROW REINSERTED'
                            );
                        }
                    }

                    if (
                        timerAttempts >= 10
                    ) {
                        clearInterval(
                            timer
                        );
                    }
                },
                500
            );
    }

    function startPipeline(
        event,
        root,
        nativeRecommendations
    ) {
        var card =
            getCurrentCard(
                event
            );

        if (!card) {
            error(
                'CURRENT CARD NOT FOUND'
            );

            return;
        }

        log(
            'CURRENT CARD:',
            card
        );

        var imdbId =
            getImdbId(
                card
            );

        if (!imdbId) {
            error(
                'IMDB ID NOT FOUND'
            );

            return;
        }

        log(
            'IMDB FOUND:',
            imdbId
        );

        loadKPSource(
            function () {
                findKPIdByIMDb(
                    imdbId,
                    function (kpId) {
                        if (!kpId) {
                            error(
                                'FINAL KP ID NOT FOUND'
                            );

                            return;
                        }

                        log(
                            'FINAL KP ID:',
                            kpId
                        );

                        var params = {
                            card: {
                                source: 'KP',
                                id:
                                    'KP_' +
                                    kpId,
                                kinopoisk_id:
                                    kpId,
                                title:
                                    card.title ||
                                    '',
                                type:
                                    card.type ||
                                    'movie'
                            }
                        };

                        log(
                            'KP FULL START:',
                            kpId
                        );

                        var started =
                            Date.now();

                        try {
                            Lampa.Api
                                .sources
                                .KP
                                .full(
                                    params,
                                    function (
                                        response
                                    ) {
                                        log(
                                            'KP FULL COMPLETE:',
                                            Date.now() -
                                                started +
                                                'ms'
                                        );

                                        log(
                                            'KP FULL RESPONSE:',
                                            response
                                        );

                                        var results =
                                            response &&
                                            response.simular &&
                                            Array.isArray(
                                                response
                                                    .simular
                                                    .results
                                            )
                                                ? response
                                                      .simular
                                                      .results
                                                : [];

                                        log(
                                            'RAW SIMILAR COUNT:',
                                            results.length
                                        );

                                        log(
                                            'SIMILAR ITEMS:',
                                            results
                                        );

                                        renderResults(
                                            results,
                                            root,
                                            nativeRecommendations
                                        );

                                        log(
                                            'TOTAL:',
                                            Date.now() -
                                                started +
                                                'ms'
                                        );
                                    },
                                    function (
                                        a,
                                        b
                                    ) {
                                        error(
                                            'KP FULL ERROR:',
                                            a,
                                            b
                                        );
                                    }
                                );
                        } catch (e) {
                            error(
                                'KP FULL EXCEPTION:',
                                e
                            );
                        }
                    }
                );
            }
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
            window.__kp_ui_156_installed
        ) {
            return true;
        }

        window.__kp_ui_156_installed =
            true;

        Lampa.Listener.follow(
            'full',
            function (event) {
                if (
                    !event ||
                    event.type !==
                        'complite'
                ) {
                    return;
                }

                if (
                    !event.object ||
                    !event.object.activity
                ) {
                    return;
                }

                log(
                    'FULL COMPLETE EVENT'
                );

                /*
                 * Не запускаем KP здесь.
                 * Сначала ждём нативные рекомендации.
                 */
                waitForNativeRecommendations(
                    event,
                    function (
                        root,
                        nativeRecommendations
                    ) {
                        log(
                            'NATIVE RECOMMENDATIONS READY'
                        );

                        startPipeline(
                            event,
                            root,
                            nativeRecommendations
                        );
                    }
                );
            }
        );

        log(
            'PLUGIN INSTALLED'
        );

        return true;
    }

    var attempts = 0;

    var installTimer =
        setInterval(
            function () {
                if (
                    install() ||
                    ++attempts >= 120
                ) {
                    clearInterval(
                        installTimer
                    );
                }
            },
            500
        );
}());
