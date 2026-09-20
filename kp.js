(function () {
    'use strict';

    var VERSION = '1.3.0';
    var BUILD = '2026-09-20-18-40';
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

    /*
     * Актуальный proxy из kp_source.js
     */
    var KP_PROXY =
        'https://cors.kp556.workers.dev/';

    var KP_API =
        'https://kinopoiskapiunofficial.tech/';

    /*
     * Это те же значения, которые сейчас
     * используются внутри kp_source.js.
     *
     * Ключ восстанавливается локально,
     * напрямую в коде его не храним.
     */
    function startsWith(
        str,
        search
    ) {
        return (
            String(str)
                .lastIndexOf(
                    search,
                    0
                ) === 0
        );
    }

    function salt(input) {
        var str =
            (input || '') + '';

        var hash = 0;

        for (
            var i = 0;
            i < str.length;
            i++
        ) {
            var c =
                str.charCodeAt(i);

            hash =
                (hash << 5) -
                hash +
                c;

            hash =
                hash & hash;
        }

        var result = '';

        for (
            var _i = 0,
                j = 32 - 3;
            j >= 0;
            _i += 3,
            j -= 3
        ) {
            var x =
                (
                    (
                        hash >>> _i & 7
                    ) << 3
                ) +
                (
                    hash >>> j & 7
                );

            result +=
                String.fromCharCode(
                    x < 26
                        ? 97 + x
                        : x < 52
                            ? 39 + x
                            : x - 4
                );
        }

        return result;
    }

    function decodeSecret(
        input,
        password
    ) {
        var result = '';

        password =
            (password || '') + '';

        if (
            input &&
            password
        ) {
            var hash =
                salt(
                    '123456789' +
                    password
                );

            while (
                hash.length <
                input.length
            ) {
                hash += hash;
            }

            var i = 0;

            while (
                i < input.length
            ) {
                result +=
                    String.fromCharCode(
                        input[i] ^
                        hash.charCodeAt(i)
                    );

                i++;
            }
        }

        return result;
    }

    /*
     * Текущий ключ из kp_source.js.
     */
    var KP_KEY =
        decodeSecret(
            [
                46,112,67,90,
                13,115,6,112,
                126,67,41,122,
                16,66,0,37,
                5,37,126,73,
                127,39,17,66,
                82,34,80,35,
                99,22,44,117,
                70,12,2,113
            ],
            atob('MUtQcGFzc3dvcmQ=')
        );

    log(
        'API CONFIG READY'
    );

    /*
     * Универсальный GET через Lampa.Reguest.
     */
    function request(
        url,
        callback,
        errorCallback
    ) {
        var network =
            new Lampa.Reguest();

        network.timeout(
            10000
        );

        network.silent(
            url,
            function (json) {
                callback(
                    json
                );
            },
            function (a, c) {
                if (
                    errorCallback
                ) {
                    errorCallback(
                        a,
                        c
                    );
                }
            },
            false,
            {
                headers: {
                    'X-API-KEY':
                        KP_KEY
                }
            }
        );
    }

    /*
     * IMDb -> Wikidata -> KP.
     */
    function getKpIdFromWikidata(
        imdbId,
        callback
    ) {
        log(
            'WIKIDATA START:',
            imdbId
        );

        var finished =
            false;

        function finish(
            value
        ) {
            if (finished) {
                return;
            }

            finished = true;

            callback(
                value
            );
        }

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

        /*
         * Таймаут Wikidata.
         */
        setTimeout(
            function () {
                if (!finished) {
                    log(
                        'WIKIDATA TIMEOUT'
                    );

                    finish(
                        null
                    );
                }
            },
            5000
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

                        finish(
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

                    finish(
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

                    finish(
                        null
                    );
                }
            );
    }

    /*
     * Прямой запрос similars.
     *
     * ВАЖНО:
     * Больше не вызываем KP.full(),
     * поэтому sequels_and_prequels 404
     * больше не задерживает рекомендации.
     */
    function getKPSimilars(
        kpId,
        callback
    ) {
        var apiUrl =
            'api/v2.2/films/' +
            encodeURIComponent(
                kpId
            ) +
            '/similars';

        var proxyUrl =
            KP_PROXY +
            KP_API +
            apiUrl;

        log(
            'SIMILARS REQUEST:',
            apiUrl
        );

        log(
            'SIMILARS REQUEST START'
        );

        request(
            proxyUrl,
            function (json) {
                log(
                    'SIMILARS RESPONSE:',
                    json
                );

                var items =
                    json &&
                    Array.isArray(
                        json.items
                    )
                        ? json.items
                        : [];

                log(
                    'RAW SIMILARS COUNT:',
                    items.length
                );

                callback(
                    items
                );
            },
            function (
                error,
                text
            ) {
                log(
                    'SIMILARS ERROR:',
                    error,
                    text
                );

                callback(
                    []
                );
            }
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

    function convertItem(
        item
    ) {
        var kpId =
            getValue(
                item,
                [
                    'kinopoiskId',
                    'filmId',
                    'kinopoisk_id'
                ]
            );

        var type =
            (
                !item.type ||
                item.type === 'FILM' ||
                item.type === 'VIDEO'
            )
                ? 'movie'
                : 'tv';

        var title =
            item.nameRu ||
            item.nameEn ||
            item.nameOriginal ||
            '';

        var originalTitle =
            item.nameOriginal ||
            item.nameEn ||
            item.nameRu ||
            '';

        var poster =
            item.posterUrlPreview ||
            item.posterUrl ||
            '';

        var year =
            item.year ||
            '';

        return {
            source: 'KP',

            type: type,

            adult: false,

            id:
                'KP_' +
                kpId,

            title:
                title,

            original_title:
                originalTitle,

            overview:
                item.description ||
                item.shortDescription ||
                '',

            img:
                poster,

            background_image:
                item.coverUrl ||
                item.posterUrl ||
                poster,

            release_date:
                String(
                    year || ''
                ),

            year:
                year,

            vote_average:
                +item.rating ||
                +item.ratingKinopoisk ||
                0,

            kp_rating:
                +item.rating ||
                +item.ratingKinopoisk ||
                0,

            vote_count:
                item.ratingVoteCount ||
                item.ratingKinopoiskVoteCount ||
                0,

            kinopoisk_id:
                kpId,

            imdb_id:
                item.imdbId ||
                '',

            imdb_rating:
                +item.ratingImdb ||
                0
        };
    }

    function getTitle(
        item
    ) {
        return (
            item.title ||
            item.name ||
            item.nameRu ||
            item.original_title ||
            item.original_name ||
            'Без названия'
        );
    }

    function getYear(
        item
    ) {
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

    function getPoster(
        item
    ) {
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

    function getVote(
        item
    ) {
        return (
            item.vote_average ||
            item.vote ||
            item.rating ||
            item.rating_kp ||
            item.ratingKinopoisk ||
            ''
        );
    }

    function openCard(
        item
    ) {
        var data =
            convertItem(
                item
            );

        log(
            'OPEN KP CARD:',
            data.kinopoisk_id,
            data.title
        );

        if (
            window.Router &&
            typeof Router.call ===
                'function'
        ) {
            Router.call(
                'full',
                data
            );

            return;
        }

        log(
            'ROUTER.CALL UNAVAILABLE'
        );
    }

    function createCard(
        item
    ) {
        var title =
            getTitle(
                item
            );

        var year =
            getYear(
                item
            );

        var poster =
            getPoster(
                item
            );

        var vote =
            getVote(
                item
            );

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
                openCard(
                    item
                );
            }
        );

        card.on(
            'click',
            function () {
                openCard(
                    item
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
                    createCard(
                        item
                    )
                );
            }
        );

        return line;
    }

    function insertLine(
        root,
        line
    ) {
        var rows =
            root.find(
                '.items-line'
            );

        var similar =
            null;

        var director =
            null;

        var recommendations =
            null;

        rows.each(
            function () {
                var row =
                    $(this);

                var title =
                    row
                        .find(
                            '.items-line__title'
                        )
                        .first()
                        .text()
                        .trim();

                if (
                    title ===
                    'Похожие'
                ) {
                    similar =
                        row;
                }

                if (
                    title ===
                    'Режиссёр' ||
                    title ===
                    'Режиссеры'
                ) {
                    director =
                        row;
                }

                if (
                    title ===
                    'Рекомендации'
                ) {
                    recommendations =
                        row;
                }
            }
        );

        /*
         * Основной вариант:
         *
         * Похожие
         * Рекомендации Кинопоиска
         * Режиссёр
         */
        if (
            similar &&
            similar.length
        ) {
            similar.after(
                line
            );

            log(
                'INSERT AFTER "Похожие"'
            );

            return;
        }

        /*
         * Если Похожие отсутствует:
         *
         * Рекомендации Кинопоиска
         * Режиссёр
         */
        if (
            director &&
            director.length
        ) {
            director.before(
                line
            );

            log(
                'INSERT BEFORE "Режиссёр"'
            );

            return;
        }

        /*
         * Последний вариант —
         * перед обычными Рекомендациями.
         */
        if (
            recommendations &&
            recommendations.length
        ) {
            recommendations.before(
                line
            );

            log(
                'INSERT BEFORE "Рекомендации"'
            );

            return;
        }

        root.append(
            line
        );

        log(
            'INSERT ROOT FALLBACK'
        );
    }

    function render(
        activity,
        results
    ) {
        if (
            !activity ||
            typeof activity.render !==
                'function'
        ) {
            return;
        }

        var root =
            activity.render();

        if (
            !root ||
            typeof root.find !==
                'function'
        ) {
            return;
        }

        root
            .find(
                '.kp-recommendations-line'
            )
            .remove();

        var line =
            createLine(
                results
            );

        insertLine(
            root,
            line
        );

        var check =
            root.find(
                '.kp-recommendations-line'
            );

        log(
            'ROW COUNT:',
            check.length
        );

        log(
            'CARD COUNT:',
            check
                .find('.card')
                .length
        );

        log(
            'CONNECTED:',
            !!(
                check.length &&
                check[0] &&
                document.documentElement.contains(
                    check[0]
                )
            )
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

        install.done =
            true;

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

                var root =
                    activity.render();

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

                log(
                    'FULL COMPLETE EVENT'
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
                 * Уже есть KP ID.
                 */
                if (
                    ids.kp
                ) {
                    log(
                        'DIRECT KP ID:',
                        ids.kp
                    );

                    getKPSimilars(
                        ids.kp,
                        function (
                            raw
                        ) {
                            var results =
                                raw.map(
                                    convertItem
                                );

                            log(
                                'TOTAL PIPELINE:',
                                Math.round(
                                    performance.now() -
                                    eventStart
                                ) + 'ms'
                            );

                            render(
                                activity,
                                results
                            );
                        }
                    );

                    return;
                }

                /*
                 * IMDb -> Wikidata.
                 */
                if (
                    !ids.imdb
                ) {
                    log(
                        'NO IMDb ID'
                    );

                    return;
                }

                log(
                    'IMDb FOUND:',
                    ids.imdb
                );

                getKpIdFromWikidata(
                    ids.imdb,
                    function (
                        kpId
                    ) {
                        if (
                            !kpId
                        ) {
                            log(
                                'NO KP ID'
                            );

                            return;
                        }

                        log(
                            'FINAL KP ID:',
                            kpId
                        );

                        getKPSimilars(
                            kpId,
                            function (
                                raw
                            ) {
                                var results =
                                    raw.map(
                                        convertItem
                                    );

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

                                render(
                                    activity,
                                    results
                                );
                            }
                        );
                    }
                );
            }
        );

        return true;
    }

    function extractIds(
        event
    ) {
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
