/* Online Mod Direct Play + Kinopoisk Recommendations v1.2.0 */
(function () {
    'use strict';

    var Lampa = window.Lampa;

    if (!Lampa) return;

    var installed = false;

    var CACHE_TIME = 60 * 60 * 1000;
    var cache = {};

    var KP_API = 'https://kinopoiskapiunofficial.tech/';
    var KP_PROXY = 'https://cors.kp556.workers.dev:8443/';
    var KP_KEY = '2a4a0808-81a3-40ae-b0d3-e11335ede616';

    /*
     * =========================================================
     * CACHE
     * =========================================================
     */

    function cacheGet(key) {
        var item = cache[key];

        if (!item) return null;

        if (Date.now() - item.time > CACHE_TIME) {
            delete cache[key];
            return null;
        }

        return item.value;
    }

    function cacheSet(key, value) {
        cache[key] = {
            time: Date.now(),
            value: value
        };
    }

    /*
     * =========================================================
     * CARD HELPERS
     * =========================================================
     */

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

    function normalizeTitle(title) {
        return String(title || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\s.,:;!?'"`’]+/g, ' ')
            .replace(/[\-‐-‒–—―]+/g, '-')
            .trim();
    }

    function titleMatch(a, b) {
        a = normalizeTitle(a);
        b = normalizeTitle(b);

        if (!a || !b) return false;

        return (
            a === b ||
            a.indexOf(b) !== -1 ||
            b.indexOf(a) !== -1
        );
    }

    /*
     * =========================================================
     * CHECK KP SOURCE
     * =========================================================
     */

    function getKPSource() {
        if (
            window.kp_source_plugin &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            return Lampa.Api.sources.KP;
        }

        return null;
    }

    /*
     * =========================================================
     * KP SOURCE SEARCH
     * =========================================================
     *
     * Реальный kp_source использует:
     *
     * KP.discovery().search(...)
     *
     */

    function searchUsingKPSource(card, callback) {
        var KP = getKPSource();

        if (!KP || typeof KP.discovery !== 'function') {
            callback(null);
            return;
        }

        var discovery;

        try {
            discovery = KP.discovery();
        } catch (e) {
            callback(null);
            return;
        }

        if (
            !discovery ||
            typeof discovery.search !== 'function'
        ) {
            callback(null);
            return;
        }

        var title = getTitle(card);

        discovery.search(
            {
                query: encodeURIComponent(title),
                page: 1
            },
            function (data) {
                var results = [];

                /*
                 * discovery.search() у kp_source
                 * возвращает массив блоков.
                 */

                if (Array.isArray(data)) {
                    data.forEach(function (part) {
                        if (
                            part &&
                            Array.isArray(part.results)
                        ) {
                            results = results.concat(
                                part.results
                            );
                        }
                    });
                }

                if (!results.length) {
                    callback(null);
                    return;
                }

                var year = getYear(card);
                var best = null;

                /*
                 * Сначала название + год.
                 */

                for (var i = 0; i < results.length; i++) {
                    var item = results[i];

                    if (
                        titleMatch(
                            getTitle(item),
                            title
                        ) &&
                        (
                            !year ||
                            !getYear(item) ||
                            getYear(item) === year
                        )
                    ) {
                        best = item;
                        break;
                    }
                }

                /*
                 * Потом только название.
                 */

                if (!best) {
                    for (
                        var j = 0;
                        j < results.length;
                        j++
                    ) {
                        if (
                            titleMatch(
                                getTitle(results[j]),
                                title
                            )
                        ) {
                            best = results[j];
                            break;
                        }
                    }
                }

                /*
                 * Если ничего идеально не нашли —
                 * берём первый результат.
                 */

                if (!best) {
                    best = results[0];
                }

                if (
                    !best ||
                    !best.kinopoisk_id
                ) {
                    callback(null);
                    return;
                }

                callback(best);
            },
            function () {
                callback(null);
            }
        );
    }

    /*
     * =========================================================
     * FALLBACK API
     * =========================================================
     */

    function kpRequest(method, success, error) {
        var network = new Lampa.Reguest();

        var url = KP_API + method;

        network.timeout(15000);

        network.silent(
            url,
            success,
            function (a, c) {
                /*
                 * Прямой запрос не прошёл —
                 * пробуем proxy.
                 */

                network.timeout(15000);

                network.silent(
                    KP_PROXY + url,
                    success,
                    error,
                    false,
                    {
                        headers: {
                            'X-API-KEY': KP_KEY
                        }
                    }
                );
            },
            false,
            {
                headers: {
                    'X-API-KEY': KP_KEY
                }
            }
        );
    }

    function searchFallback(card, callback) {
        var title = getTitle(card);

        if (!title) {
            callback(null);
            return;
        }

        var url =
            'api/v2.1/films/search-by-keyword' +
            '?keyword=' +
            encodeURIComponent(title) +
            '&page=1';

        kpRequest(
            url,
            function (json) {
                var results =
                    json &&
                    (
                        json.films ||
                        json.items ||
                        []
                    );

                if (!results.length) {
                    callback(null);
                    return;
                }

                var year = getYear(card);
                var best = null;

                /*
                 * Название + год
                 */

                for (
                    var i = 0;
                    i < results.length;
                    i++
                ) {
                    var item = results[i];

                    var itemTitle =
                        item.nameRu ||
                        item.nameEn ||
                        item.nameOriginal ||
                        '';

                    if (
                        titleMatch(
                            itemTitle,
                            title
                        ) &&
                        (
                            !year ||
                            String(item.year || '') === year
                        )
                    ) {
                        best = item;
                        break;
                    }
                }

                /*
                 * Только название
                 */

                if (!best) {
                    for (
                        var j = 0;
                        j < results.length;
                        j++
                    ) {
                        var candidate =
                            results[j];

                        var candidateTitle =
                            candidate.nameRu ||
                            candidate.nameEn ||
                            candidate.nameOriginal ||
                            '';

                        if (
                            titleMatch(
                                candidateTitle,
                                title
                            )
                        ) {
                            best = candidate;
                            break;
                        }
                    }
                }

                if (!best) {
                    best = results[0];
                }

                if (!best) {
                    callback(null);
                    return;
                }

                var id =
                    best.kinopoiskId ||
                    best.filmId;

                if (!id) {
                    callback(null);
                    return;
                }

                callback(id);
            },
            function () {
                callback(null);
            }
        );
    }

    /*
     * =========================================================
     * GET SIMILARS
     * =========================================================
     */

    function getSimilarById(id, callback) {
        if (!id) {
            callback([]);
            return;
        }

        var cacheKey = 'kp_similar_' + id;

        var cached = cacheGet(cacheKey);

        if (cached) {
            callback(cached);
            return;
        }

        kpRequest(
            'api/v2.2/films/' + id + '/similars',
            function (json) {
                var items =
                    json &&
                    (
                        json.items ||
                        json.films ||
                        []
                    );

                var results = items
                    .map(function (item) {
                        return convertKPCard(item);
                    })
                    .filter(function (item) {
                        return !!item;
                    })
                    .slice(0, 20);

                cacheSet(cacheKey, results);

                callback(results);
            },
            function () {
                callback([]);
            }
        );
    }

    /*
     * =========================================================
     * CONVERT KP CARD
     * =========================================================
     */

    function convertKPCard(item) {
        if (!item) return null;

        var id =
            item.kinopoiskId ||
            item.filmId;

        if (!id) return null;

        var type =
            !item.type ||
            item.type === 'FILM' ||
            item.type === 'VIDEO'
                ? 'movie'
                : 'tv';

        var title =
            item.nameRu ||
            item.nameEn ||
            item.nameOriginal ||
            '';

        var original =
            item.nameOriginal ||
            item.nameEn ||
            item.nameRu ||
            '';

        var rating =
            Number(item.ratingKinopoisk) ||
            Number(item.rating) ||
            0;

        var card = {
            source: 'KP',

            type: type,

            id: 'KP_' + id,

            title: title,
            original_title: original,

            name: title,
            original_name: original,

            overview:
                item.description ||
                item.shortDescription ||
                '',

            img:
                item.posterUrlPreview ||
                item.posterUrl ||
                '',

            background_image:
                item.coverUrl ||
                item.posterUrl ||
                '',

            vote_average: rating,

            vote_count:
                item.ratingVoteCount ||
                item.ratingKinopoiskVoteCount ||
                0,

            kp_rating: rating,

            kinopoisk_id: id,

            imdb_id:
                item.imdbId ||
                '',

            imdb_rating:
                item.ratingImdb ||
                0
        };

        if (type === 'tv') {
            card.first_air_date =
                item.startYear ||
                item.year ||
                '';
        } else {
            card.release_date =
                item.year ||
                '';
        }

        return card;
    }

    /*
     * =========================================================
     * MAIN RECOMMENDATIONS
     * =========================================================
     */

    function getRecommendations(card, callback) {
        if (!card) {
            callback([]);
            return;
        }

        var title = getTitle(card);
        var year = getYear(card);

        if (!title) {
            callback([]);
            return;
        }

        var key =
            'kp_rec_' +
            normalizeTitle(title) +
            '_' +
            year;

        var cached = cacheGet(key);

        if (cached) {
            callback(cached);
            return;
        }

        /*
         * -----------------------------------------------------
         * 1. kp_source установлен
         * -----------------------------------------------------
         */

        if (getKPSource()) {
            searchUsingKPSource(
                card,
                function (kpCard) {
                    if (
                        !kpCard ||
                        !kpCard.kinopoisk_id
                    ) {
                        callback([]);
                        return;
                    }

                    var KP = getKPSource();

                    /*
                     * Используем РЕАЛЬНЫЙ full()
                     * из kp_source.
                     *
                     * Он сам получает:
                     * - film
                     * - staff
                     * - sequels
                     * - similars
                     */

                    KP.full(
                        {
                            card: kpCard
                        },
                        function (json) {
                            var results =
                                json &&
                                json.simular &&
                                json.simular.results;

                            results =
                                Array.isArray(results)
                                    ? results.slice(0, 20)
                                    : [];

                            cacheSet(
                                key,
                                results
                            );

                            callback(results);
                        },
                        function () {
                            callback([]);
                        }
                    );
                }
            );

            return;
        }

        /*
         * -----------------------------------------------------
         * 2. kp_source отсутствует
         * -----------------------------------------------------
         */

        searchFallback(
            card,
            function (kpId) {
                if (!kpId) {
                    callback([]);
                    return;
                }

                getSimilarById(
                    kpId,
                    function (results) {
                        cacheSet(
                            key,
                            results
                        );

                        callback(results);
                    }
                );
            }
        );
    }

    /*
     * =========================================================
     * OPEN KP CARD
     * =========================================================
     */

    function openCard(card) {
        if (!card) return;

        /*
         * Сначала пытаемся открыть стандартным способом.
         */

        try {
            Lampa.Activity.push({
                component: 'full',
                card: card
            });

            return;
        } catch (e) {}

        /*
         * Fallback.
         */

        try {
            Lampa.Activity.push({
                component: 'full',
                method: 'full',
                card: card,
                id: card.id
            });
        } catch (e2) {}
    }

    /*
     * =========================================================
     * RENDER RECOMMENDATIONS
     * =========================================================
     */

    function renderRecommendations(event, card) {
        if (
            !event ||
            !event.object ||
            !event.object.activity
        ) {
            return;
        }

        var activity =
            event.object.activity;

        if (
            typeof activity.render !==
            'function'
        ) {
            return;
        }

        var root = activity.render();

        if (
            !root ||
            typeof root.find !== 'function'
        ) {
            return;
        }

        /*
         * Не создавать второй раз.
         */

        if (
            root.find(
                '.helper-kp-recommendations'
            ).length
        ) {
            return;
        }

        getRecommendations(
            card,
            function (items) {
                if (!items || !items.length) {
                    return;
                }

                var body =
                    root.find(
                        '.full-start-new__body'
                    );

                if (!body.length) {
                    body =
                        root.find(
                            '.full-start__body'
                        );
                }

                if (!body.length) {
                    return;
                }

                var section = $(
                    '<div class="helper-kp-recommendations"></div>'
                );

                var heading = $(
                    '<div class="helper-kp-recommendations__title selector">Кинопоиск</div>'
                );

                var row = $(
                    '<div class="helper-kp-recommendations__row"></div>'
                );

                items.forEach(
                    function (item) {
                        var element = $(
                            '<div class="helper-kp-card selector"></div>'
                        );

                        var image = $(
                            '<div class="helper-kp-card__image"></div>'
                        );

                        image.css(
                            'background-image',
                            'url("' +
                            (
                                item.img ||
                                ''
                            ) +
                            '")'
                        );

                        var name = $(
                            '<div class="helper-kp-card__name"></div>'
                        );

                        name.text(
                            item.title ||
                            item.name ||
                            ''
                        );

                        element.append(image);
                        element.append(name);

                        element.on(
                            'hover:enter',
                            function () {
                                openCard(item);
                            }
                        );

                        element.on(
                            'click',
                            function () {
                                openCard(item);
                            }
                        );

                        row.append(element);
                    }
                );

                section.append(heading);
                section.append(row);

                /*
                 * Добавляем в конец карточки.
                 */

                body.append(section);
            }
        );
    }

    /*
     * =========================================================
     * STYLES
     * =========================================================
     */

    function addStyles() {
        if (
            $('#helper-kp-style').length
        ) {
            return;
        }

        $('head').append(
            '<style id="helper-kp-style">' +

            '.helper-kp-recommendations{' +
                'width:100%;' +
                'margin-top:2em;' +
                'padding-bottom:2em;' +
            '}' +

            '.helper-kp-recommendations__title{' +
                'font-size:1.35em;' +
                'font-weight:500;' +
                'margin-bottom:.8em;' +
            '}' +

            '.helper-kp-recommendations__row{' +
                'display:flex;' +
                'gap:1em;' +
                'overflow:hidden;' +
            '}' +

            '.helper-kp-card{' +
                'width:9em;' +
                'min-width:9em;' +
                'border-radius:.35em;' +
                'overflow:hidden;' +
                'cursor:pointer;' +
            '}' +

            '.helper-kp-card__image{' +
                'width:9em;' +
                'height:13em;' +
                'background-size:cover;' +
                'background-position:center;' +
                'background-color:rgba(255,255,255,.05);' +
            '}' +

            '.helper-kp-card__name{' +
                'font-size:.8em;' +
                'line-height:1.2;' +
                'margin-top:.35em;' +
                'white-space:nowrap;' +
                'overflow:hidden;' +
                'text-overflow:ellipsis;' +
            '}' +

            '</style>'
        );
    }

    /*
     * =========================================================
     * YOUR EXISTING DIRECT PLAY
     * =========================================================
     */

    function installDirectPlay() {
        var original =
            Lampa.Select &&
            Lampa.Select.show;

        if (
            !Lampa.Select ||
            typeof original !==
                'function'
        ) {
            return false;
        }

        if (
            original.onlineModDirectPlay
        ) {
            return true;
        }

        function show(options) {
            if (
                options &&
                options.title ===
                    Lampa.Lang.translate(
                        'settings_rest_source'
                    ) &&
                Array.isArray(
                    options.items
                ) &&
                typeof options.onSelect ===
                    'function'
            ) {
                for (
                    var i = 0;
                    i < options.items.length;
                    i++
                ) {
                    var item =
                        options.items[i];

                    if (
                        item &&
                        !item.hide &&
                        item.btn &&
                        typeof item.btn.is ===
                            'function' &&
                        item.btn.is(
                            '.full-start__button.view--online_mod'
                        ) &&
                        !item.btn.is(
                            '.hide'
                        )
                    ) {
                        return options.onSelect(
                            item
                        );
                    }
                }
            }

            return original.apply(
                this,
                arguments
            );
        }

        show.onlineModDirectPlay =
            true;

        Lampa.Select.show = show;

        return true;
    }

    /*
     * =========================================================
     * TRAILER POSITION
     * =========================================================
     */

    function installTrailerMove() {
        if (
            window.helperTrailerMoveInstalled
        ) {
            return;
        }

        window.helperTrailerMoveInstalled =
            true;

        Lampa.Listener.follow(
            'full',
            function (event) {
                if (
                    !event ||
                    event.type !==
                        'complite' ||
                    !event.object ||
                    !event.object.activity
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

                var play =
                    root.find(
                        '.full-start-new__buttons .button--play'
                    );

                var trailers =
                    root
                        .find(
                            '.buttons--container .view--trailer'
                        )
                        .not('.hide');

                if (
                    !play.length ||
                    !trailers.length
                ) {
                    return;
                }

                trailers.insertAfter(
                    play
                );

                trailers.on(
                    'hover:focus',
                    function () {
                        if (
                            event.link &&
                            event.link.items &&
                            event.link.items[0]
                        ) {
                            event.link.items[0].last =
                                this;
                        }
                    }
                );
            }
        );
    }

    /*
     * =========================================================
     * FULL LISTENER
     * =========================================================
     */

    function installFullListener() {
        if (
            window.helperKPFullInstalled
        ) {
            return;
        }

        window.helperKPFullInstalled =
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

                /*
                 * В разных версиях Lampa карточка
                 * может находиться в разных местах.
                 */

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

                if (
                    !card ||
                    !getTitle(card)
                ) {
                    return;
                }

                /*
                 * Небольшая задержка:
                 * даём штатной карточке закончить
                 * построение DOM.
                 */

                setTimeout(
                    function () {
                        renderRecommendations(
                            event,
                            card
                        );
                    },
                    300
                );
            }
        );
    }

    /*
     * =========================================================
     * INSTALL
     * =========================================================
     */

    function install() {
        if (installed) {
            return true;
        }

        Lampa =
            window.Lampa;

        if (
            !Lampa ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !==
                'function'
        ) {
            return false;
        }

        addStyles();

        installDirectPlay();

        installTrailerMove();

        installFullListener();

        installed = true;

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
