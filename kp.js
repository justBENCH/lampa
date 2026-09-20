(function () {
    'use strict';

    var VERSION = '1.0.7';
    var BUILD = '2026-09-20-18-25';
    var PLUGIN = 'kp_recommendations_test';

    console.log('[KP UI] ========================================');
    console.log('[KP UI] VERSION:', VERSION);
    console.log('[KP UI] BUILD:', BUILD);
    console.log('[KP UI] ========================================');

    if (window[PLUGIN] && window[PLUGIN].version === VERSION) {
        console.log('[KP UI] ALREADY INSTALLED:', VERSION);
        return;
    }

    window[PLUGIN] = {
        version: VERSION
    };

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=107';

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

        script.src =
            KP_SOURCE_URL;

        script.onload =
            function () {
                log('kp_source.js loaded');

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

        script.onerror =
            function () {
                log(
                    'ERROR loading kp_source.js'
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

    /*
     * Ищем TMDB ID и уже готовый KP ID
     * в реальном объекте Lampa.
     */
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
                            'imdbId'
                        ]
                    );
            }
        }

        return result;
    }

    /*
     * Пробуем получить TMDB full через уже
     * подключённый Lampa TMDB source.
     *
     * В разных версиях Lampa сигнатура может
     * немного отличаться, поэтому пробуем
     * несколько вариантов.
     */
    function getTMDBData(tmdbId, callback) {
        var tmdb =
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.tmdb;

        if (!tmdb) {
            log(
                'TMDB source unavailable'
            );

            callback(null);
            return;
        }

        log(
            'TMDB SOURCE:',
            tmdb
        );

        if (
            typeof tmdb.full === 'function'
        ) {
            log(
                'Calling TMDB.full(...)'
            );

            try {
                tmdb.full(
                    {
                        card: {
                            source: 'tmdb',
                            id: tmdbId,
                            tmdb_id: tmdbId
                        }
                    },
                    function (json) {
                        log(
                            'TMDB FULL RESPONSE:',
                            json
                        );

                        callback(json);
                    },
                    function (error) {
                        log(
                            'TMDB FULL ERROR:',
                            error
                        );

                        callback(null);
                    }
                );

                return;
            } catch (error) {
                log(
                    'TMDB.full EXCEPTION:',
                    error
                );
            }
        }

        if (
            typeof tmdb.get === 'function'
        ) {
            log(
                'Calling TMDB.get(...)'
            );

            try {
                tmdb.get(
                    tmdbId,
                    function (json) {
                        log(
                            'TMDB GET RESPONSE:',
                            json
                        );

                        callback(json);
                    },
                    function (error) {
                        log(
                            'TMDB.get ERROR:',
                            error
                        );

                        callback(null);
                    }
                );

                return;
            } catch (error2) {
                log(
                    'TMDB.get EXCEPTION:',
                    error2
                );
            }
        }

        log(
            'No usable TMDB method'
        );

        callback(null);
    }

    /*
     * Рекурсивно ищем KP ID в ответе TMDB.
     */
    function findKpId(object, path, visited) {
        if (
            object === null ||
            object === undefined ||
            typeof object !== 'object'
        ) {
            return null;
        }

        if (!visited) {
            visited = [];
        }

        if (
            visited.indexOf(object) !== -1
        ) {
            return null;
        }

        visited.push(object);

        var keys;

        try {
            keys =
                Object.keys(object);
        } catch (e) {
            return null;
        }

        for (
            var i = 0;
            i < keys.length;
            i++
        ) {
            var key =
                keys[i];

            var lower =
                key.toLowerCase();

            var value;

            try {
                value =
                    object[key];
            } catch (e2) {
                continue;
            }

            if (
                lower === 'kinopoisk_id' ||
                lower === 'kinopoiskid' ||
                lower === 'kp_id' ||
                lower === 'kpid'
            ) {
                if (
                    value !== null &&
                    value !== undefined &&
                    String(value) !== ''
                ) {
                    log(
                        'KP ID FOUND:',
                        value,
                        'PATH:',
                        path + '.' + key
                    );

                    return value;
                }
            }
        }

        for (
            var j = 0;
            j < keys.length;
            j++
        ) {
            var key2 =
                keys[j];

            var value2;

            try {
                value2 =
                    object[key2];
            } catch (e3) {
                continue;
            }

            if (
                !value2 ||
                typeof value2 !== 'object'
            ) {
                continue;
            }

            var found =
                findKpId(
                    value2,
                    path + '.' + key2,
                    visited
                );

            if (found) {
                return found;
            }
        }

        return null;
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
            createLine(
                results
            );

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
                 * Вариант 1:
                 * KP ID уже есть.
                 */
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

                /*
                 * Вариант 2:
                 * Есть TMDB ID.
                 */
                if (ids.tmdb) {
                    log(
                        'TMDB ID:',
                        ids.tmdb
                    );

                    loadKP(
                        function () {
                            getTMDBData(
                                ids.tmdb,
                                function (
                                    tmdbJson
                                ) {
                                    if (
                                        !tmdbJson
                                    ) {
                                        log(
                                            'TMDB DATA EMPTY'
                                        );

                                        return;
                                    }

                                    var kpId =
                                        findKpId(
                                            tmdbJson,
                                            'tmdb'
                                        );

                                    if (
                                        !kpId
                                    ) {
                                        log(
                                            'KP ID NOT FOUND IN TMDB RESPONSE'
                                        );

                                        return;
                                    }

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
                    'NO TMDB ID / KP ID FOUND'
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
