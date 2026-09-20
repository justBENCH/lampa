(function () {
    'use strict';

    var VERSION = '1.0.9';
    var BUILD = '2026-09-20-18-05';
    var PLUGIN = 'kp_recommendations_test';

    console.log('[KP UI] ========================================');
    console.log('[KP UI] VERSION:', VERSION);
    console.log('[KP UI] BUILD:', BUILD);
    console.log('[KP UI] ========================================');

    if (
        window[PLUGIN] &&
        window[PLUGIN].version === VERSION
    ) {
        console.log('[KP UI] ALREADY INSTALLED:', VERSION);
        return;
    }

    window[PLUGIN] = {
        version: VERSION
    };

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=109';

    function log() {
        var args = Array.prototype.slice.call(arguments);

        args.unshift(
            '[KP UI v' + VERSION + ']'
        );

        console.log.apply(
            console,
            args
        );
    }

    function loadKP(callback) {
        if (
            window.kp_source_plugin &&
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log('KP already loaded');
            callback();
            return;
        }

        log('Loading kp_source.js');

        var script =
            document.createElement('script');

        script.src = KP_SOURCE_URL;

        script.onload = function () {
            log('kp_source.js loaded');

            var attempts = 0;

            var timer = setInterval(
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
                            'KP source registered'
                        );

                        callback();
                        return;
                    }

                    if (attempts >= 40) {
                        clearInterval(timer);

                        log(
                            'KP registration timeout'
                        );
                    }
                },
                250
            );
        };

        script.onerror = function () {
            log(
                'ERROR loading kp_source.js'
            );
        };

        document.head.appendChild(script);
    }

    function getCurrentCard(root) {
        var title = '';
        var year = '';

        var titleEl =
            root.find(
                '.full-start-new__title'
            );

        if (titleEl.length) {
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

        if (head.length) {
            var match =
                head
                    .first()
                    .text()
                    .match(
                        /\b(19|20)\d{2}\b/
                    );

            if (match) {
                year = match[0];
            }
        }

        if (!year) {
            var text =
                root.text();

            var fallback =
                text.match(
                    /\b(19|20)\d{2}\b/
                );

            if (fallback) {
                year = fallback[0];
            }
        }

        return {
            title: title,
            year: year
        };
    }

    function getValue(object, names) {
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
            'WIKIDATA LOOKUP IMDb:',
            imdbId
        );

        /*
         * P345  = IMDb ID
         * P2603 = Kinopoisk film ID
         */
        var query =
            'SELECT ?item ?kp WHERE {' +
            '?item wdt:P345 "' +
            String(imdbId).replace(/"/g, '') +
            '". ' +
            '?item wdt:P2603 ?kp. ' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql' +
            '?query=' +
            encodeURIComponent(query) +
            '&format=json';

        log(
            'WIKIDATA URL:',
            url
        );

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
                    log(
                        'WIKIDATA RESPONSE:',
                        json
                    );

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
                            'WIKIDATA: KP ID NOT FOUND'
                        );

                        callback(null);
                        return;
                    }

                    var kp =
                        bindings[0].kp &&
                        bindings[0].kp.value;

                    if (!kp) {
                        log(
                            'WIKIDATA: EMPTY KP ID'
                        );

                        callback(null);
                        return;
                    }

                    log(
                        'WIKIDATA KP ID:',
                        kp
                    );

                    callback(kp);
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
            'KINOPOSK ID:',
            kpId
        );

        log(
            'Calling KP.full(...)'
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
                    'KP FULL RESPONSE:',
                    json
                );

                if (
                    !json ||
                    !json.simular ||
                    !Array.isArray(
                        json.simular.results
                    )
                ) {
                    log(
                        'ERROR: No simular results'
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
                    ).slice(0, 4)
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
            .find('.card__title')
            .text(title);

        card
            .find('.card__age')
            .text(year);

        if (poster) {
            card
                .find('.card__img')
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
                .find('.card__img')
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
                .find('.card__view')
                .append(
                    $(
                        '<div class="card__vote"></div>'
                    ).text(vote)
                );
        }

        card.on(
            'hover:enter',
            function () {
                log(
                    'SELECT:',
                    title,
                    year,
                    item
                );
            }
        );

        return card;
    }

    function createLine(results) {
        var line =
            $(
                '<div class="items-line layer--visible layer--render items-line--type-default">' +
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

    function insertLine(
        root,
        results
    ) {
        root
            .find(
                '.kp-recommendations-line'
            )
            .remove();

        if (
            !results ||
            !results.length
        ) {
            log(
                'Nothing to render'
            );

            return;
        }

        var line =
            createLine(results);

        line.addClass(
            'kp-recommendations-line'
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
                .closest('.items-line')
                .before(line);

            log(
                'Inserted before "Похожие"'
            );
        } else {
            root.append(line);

            log(
                '"Похожие" not found'
            );
        }

        log(
            'KP UI RENDERED'
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
                    getCurrentCard(root);

                log(
                    'CURRENT CARD:',
                    card
                );

                var ids =
                    extractIds(event);

                log(
                    'IDS FROM LAMPA:',
                    ids
                );

                if (ids.kp) {
                    loadKP(
                        function () {
                            getKPFull(
                                ids.kp,
                                function (
                                    results
                                ) {
                                    insertLine(
                                        root,
                                        results
                                    );
                                }
                            );
                        }
                    );

                    return;
                }

                if (ids.imdb) {
                    log(
                        'IMDb FOUND:',
                        ids.imdb
                    );

                    getKpIdFromWikidata(
                        ids.imdb,
                        function (kpId) {
                            if (!kpId) {
                                log(
                                    'NO KP ID FROM IMDb'
                                );

                                return;
                            }

                            loadKP(
                                function () {
                                    getKPFull(
                                        kpId,
                                        function (
                                            results
                                        ) {
                                            insertLine(
                                                root,
                                                results
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );

                    return;
                }

                log(
                    'NO KP ID / IMDb ID FOUND'
                );
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
                        clearInterval(timer);
                    }
                },
                500
            );
    }

}());
