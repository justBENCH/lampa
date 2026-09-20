```javascript
/* Online Mod Direct Play + Kinopoisk Recommendations v1.2.0
 *
 * Install alongside:
 * https://nb557.github.io/plugins/online_mod.js
 *
 * Optional:
 * https://nb557.github.io/plugins/kp_source.js
 *
 * Features:
 * - Opens Online Mod directly from the source button
 * - Moves Trailer after Play
 * - Adds Kinopoisk recommendations to movie/series cards
 * - Uses kp_source.js when installed
 * - Uses Kinopoisk API fallback when kp_source.js is absent
 */
(function () {
    'use strict';

    var CACHE_TIME = 1000 * 60 * 60;
    var CACHE_SIZE = 100;

    var kpCache = {};
    var kpRequest = null;

    var KP_API = 'https://kinopoiskapiunofficial.tech/';
    var KP_PROXY = 'https://cors.kp556.workers.dev:8443/';
    var KP_KEY = '2a4a0808-81a3-40ae-b0d3-e11335ede616';

    /*
     * ---------------------------------------------------------
     * Helpers
     * ---------------------------------------------------------
     */

    function getLampa() {
        return window.Lampa;
    }

    function hasKPSource() {
        var Lampa = getLampa();

        return !!(
            window.kp_source_plugin &&
            Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        );
    }

    function cacheGet(key) {
        var item = kpCache[key];

        if (!item) return null;

        if (Date.now() - item.timestamp > CACHE_TIME) {
            delete kpCache[key];
            return null;
        }

        return item.value;
    }

    function cacheSet(key, value) {
        var keys = Object.keys(kpCache);

        if (keys.length >= CACHE_SIZE) {
            var oldestKey = keys[0];
            var oldestTime = kpCache[oldestKey].timestamp;

            keys.forEach(function (key) {
                if (kpCache[key].timestamp < oldestTime) {
                    oldestTime = kpCache[key].timestamp;
                    oldestKey = key;
                }
            });

            delete kpCache[oldestKey];
        }

        kpCache[key] = {
            timestamp: Date.now(),
            value: value
        };
    }

    function cleanTitle(title) {
        return String(title || '')
            .replace(/[\s.,:;’'`!?]+/g, ' ')
            .trim();
    }

    function normalizeTitle(title) {
        return cleanTitle(title)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-');
    }

    function titlesMatch(a, b) {
        a = normalizeTitle(a);
        b = normalizeTitle(b);

        if (!a || !b) return false;

        return a === b ||
            a.indexOf(b) !== -1 ||
            b.indexOf(a) !== -1;
    }

    function getYear(card) {
        if (!card) return '';

        if (card.release_date) {
            return String(card.release_date).substring(0, 4);
        }

        if (card.first_air_date) {
            return String(card.first_air_date).substring(0, 4);
        }

        if (card.year) {
            return String(card.year).substring(0, 4);
        }

        return '';
    }

    function getTitle(card) {
        if (!card) return '';

        return card.title ||
            card.name ||
            card.original_title ||
            card.original_name ||
            '';
    }

    function convertKPElement(elem) {
        if (!elem) return null;

        var Lampa = getLampa();

        var type =
            !elem.type ||
            elem.type === 'FILM' ||
            elem.type === 'VIDEO'
                ? 'movie'
                : 'tv';

        var id = elem.kinopoiskId || elem.filmId || 0;

        if (!id) return null;

        var title =
            elem.nameRu ||
            elem.nameEn ||
            elem.nameOriginal ||
            '';

        var originalTitle =
            elem.nameOriginal ||
            elem.nameEn ||
            elem.nameRu ||
            '';

        var rating =
            Number(elem.rating) ||
            Number(elem.ratingKinopoisk) ||
            0;

        var result = {
            source: 'KP',
            type: type,
            adult: false,

            id: 'KP_' + id,

            title: title,
            original_title: originalTitle,

            overview:
                elem.description ||
                elem.shortDescription ||
                '',

            img:
                elem.posterUrlPreview ||
                elem.posterUrl ||
                '',

            background_image:
                elem.coverUrl ||
                elem.posterUrl ||
                elem.posterUrlPreview ||
                '',

            genres: [],
            production_companies: [],
            production_countries: [],

            vote_average: rating,
            vote_count:
                elem.ratingVoteCount ||
                elem.ratingKinopoiskVoteCount ||
                0,

            kinopoisk_id: id,
            kp_rating: rating,

            imdb_id: elem.imdbId || '',
            imdb_rating: elem.ratingImdb || 0
        };

        if (elem.genres) {
            result.genres = elem.genres.map(function (genre) {
                return {
                    id: 0,
                    name: genre.genre || '',
                    url: ''
                };
            });
        }

        if (elem.countries) {
            result.production_countries =
                elem.countries.map(function (country) {
                    return {
                        name: country.country || ''
                    };
                });
        }

        if (type === 'tv') {
            result.name = title;
            result.original_name = originalTitle;
            result.first_air_date =
                elem.startYear ||
                elem.year ||
                '';
        } else {
            result.release_date =
                elem.year ||
                '';
        }

        /*
         * We deliberately keep this lightweight.
         * The recommendation cards don't need seasons/persons/etc.
         */

        return result;
    }

    /*
     * ---------------------------------------------------------
     * Direct API fallback
     * ---------------------------------------------------------
     */

    function kpRequestApi(method, callback, error) {
        var Lampa = getLampa();

        if (!Lampa || !Lampa.Reguest) {
            if (error) error();
            return;
        }

        var network = new Lampa.Reguest();

        var url = KP_API + method;

        network.timeout(15000);

        network.silent(
            url,
            function (json) {
                callback(json);
            },
            function (a, c) {
                /*
                 * If the direct request fails, try proxy.
                 */

                network.timeout(15000);

                network.silent(
                    KP_PROXY + url,
                    function (json) {
                        callback(json);
                    },
                    function () {
                        if (error) error(a, c);
                    },
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

    function kpSearchFallback(card, callback) {
        var title = getTitle(card);

        if (!title) {
            callback(null);
            return;
        }

        var year = getYear(card);

        var query =
            'api/v2.1/films/search-by-keyword' +
            '?keyword=' +
            encodeURIComponent(cleanTitle(title)) +
            '&page=1';

        kpRequestApi(
            query,
            function (json) {
                var items =
                    json &&
                    (
                        json.films ||
                        json.items ||
                        []
                    );

                if (!items.length) {
                    callback(null);
                    return;
                }

                var best = null;

                /*
                 * First try exact title + year.
                 */

                for (var i = 0; i < items.length; i++) {
                    var item = items[i];

                    var itemTitle =
                        item.nameRu ||
                        item.nameEn ||
                        item.nameOriginal ||
                        '';

                    var itemYear = String(item.year || '');

                    if (
                        titlesMatch(itemTitle, title) &&
                        (!year || itemYear.indexOf(year) === 0)
                    ) {
                        best = item;
                        break;
                    }
                }

                /*
                 * Then title-only.
                 */

                if (!best) {
                    for (var j = 0; j < items.length; j++) {
                        var candidate = items[j];

                        var candidateTitle =
                            candidate.nameRu ||
                            candidate.nameEn ||
                            candidate.nameOriginal ||
                            '';

                        if (titlesMatch(candidateTitle, title)) {
                            best = candidate;
                            break;
                        }
                    }
                }

                /*
                 * Finally use first result.
                 */

                if (!best) best = items[0];

                if (!best) {
                    callback(null);
                    return;
                }

                var kpId =
                    best.kinopoiskId ||
                    best.filmId;

                if (!kpId) {
                    callback(null);
                    return;
                }

                callback(kpId);
            },
            function () {
                callback(null);
            }
        );
    }

    function getSimilarFallback(kpId, callback) {
        if (!kpId) {
            callback([]);
            return;
        }

        var cacheKey = 'similar_' + kpId;
        var cached = cacheGet(cacheKey);

        if (cached) {
            callback(cached);
            return;
        }

        kpRequestApi(
            'api/v2.2/films/' + kpId + '/similars',
            function (json) {
                var items =
                    json &&
                    (
                        json.items ||
                        json.films ||
                        []
                    );

                var results = items
                    .map(convertKPElement)
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
     * ---------------------------------------------------------
     * KP source integration
     * ---------------------------------------------------------
     */

    function getSimilarFromKPSource(card, callback) {
        var Lampa = getLampa();

        if (!hasKPSource()) {
            callback([]);
            return;
        }

        var KP = Lampa.Api.sources.KP;

        /*
         * If current card is already a KP card,
         * we can use its ID directly.
         */

        if (card.kinopoisk_id) {
            KP.full(
                {
                    card: card
                },
                function (json) {
                    var results =
                        json &&
                        json.simular &&
                        json.simular.results;

                    callback(results || []);
                },
                function () {
                    callback([]);
                }
            );

            return;
        }

        /*
         * Current card is TMDB/CUB/etc.
         * Search KP first.
         */

        KP.search(
            {
                query: encodeURIComponent(getTitle(card)),
                page: 1
            },
            function (groups) {
                var results = [];

                if (Array.isArray(groups)) {
                    groups.forEach(function (group) {
                        if (
                            group &&
                            Array.isArray(group.results)
                        ) {
                            results = results.concat(group.results);
                        }
                    });
                }

                if (!results.length) {
                    callback([]);
                    return;
                }

                var title = getTitle(card);
                var year = getYear(card);

                var best = null;

                /*
                 * Exact title + year.
                 */

                for (var i = 0; i < results.length; i++) {
                    var item = results[i];

                    var itemYear =
                        getYear(item);

                    if (
                        titlesMatch(
                            getTitle(item),
                            title
                        ) &&
                        (
                            !year ||
                            !itemYear ||
                            itemYear === year
                        )
                    ) {
                        best = item;
                        break;
                    }
                }

                /*
                 * Exact title.
                 */

                if (!best) {
                    for (var j = 0; j < results.length; j++) {
                        if (
                            titlesMatch(
                                getTitle(results[j]),
                                title
                            )
                        ) {
                            best = results[j];
                            break;
                        }
                    }
                }

                if (!best) best = results[0];

                if (
                    !best ||
                    !best.kinopoisk_id
                ) {
                    callback([]);
                    return;
                }

                KP.full(
                    {
                        card: best
                    },
                    function (json) {
                        var similar =
                            json &&
                            json.simular &&
                            json.simular.results;

                        callback(similar || []);
                    },
                    function () {
                        callback([]);
                    }
                );
            },
            function () {
                callback([]);
            }
        );
    }

    function getRecommendations(card, callback) {
        if (!card) {
            callback([]);
            return;
        }

        var title = getTitle(card);
        var year = getYear(card);

        var key =
            normalizeTitle(title) +
            '_' +
            year;

        var cached = cacheGet(key);

        if (cached) {
            callback(cached);
            return;
        }

        /*
         * Use existing kp_source whenever available.
         */

        if (hasKPSource()) {
            getSimilarFromKPSource(
                card,
                function (results) {
                    results = (results || []).slice(0, 20);

                    cacheSet(key, results);

                    callback(results);
                }
            );

            return;
        }

        /*
         * No kp_source -> own fallback.
         */

        kpSearchFallback(
            card,
            function (kpId) {
                if (!kpId) {
                    callback([]);
                    return;
                }

                getSimilarFallback(
                    kpId,
                    function (results) {
                        results = (results || []).slice(0, 20);

                        cacheSet(key, results);

                        callback(results);
                    }
                );
            }
        );
    }

    /*
     * ---------------------------------------------------------
     * Add recommendations to current full card
     * ---------------------------------------------------------
     */

    function addRecommendations(event) {
        var Lampa = getLampa();

        if (!Lampa || !event || event.type !== 'complite') {
            return;
        }

        if (
            !event.object ||
            !event.object.activity ||
            typeof event.object.activity.render !== 'function'
        ) {
            return;
        }

        var activity = event.object.activity;

        var card =
            event.data ||
            event.object.card ||
            event.object.data ||
            event.object;

        /*
         * Try common locations used by Lampa.
         */

        if (!card || typeof card !== 'object') {
            return;
        }

        var root = activity.render();

        if (!root || typeof root.find !== 'function') {
            return;
        }

        /*
         * Don't add the block twice.
         */

        if (root.find('.helper-kp-recommendations').length) {
            return;
        }

        /*
         * We need the actual movie card.
         * In most Lampa versions it is available here.
         */

        var possibleCard =
            card.card ||
            card.movie ||
            card;

        if (!getTitle(possibleCard)) {
            return;
        }

        getRecommendations(
            possibleCard,
            function (items) {
                if (!items || !items.length) {
                    return;
                }

                /*
                 * At this point recommendations are loaded.
                 *
                 * Instead of modifying Lampa's internal Status,
                 * create a standard Lampa row.
                 */

                var container =
                    root.find('.full-start__body');

                if (!container.length) {
                    container =
                        root.find('.full-start-new__body');
                }

                if (!container.length) {
                    return;
                }

                var section =
                    $('<div class="helper-kp-recommendations"></div>');

                var title =
                    $('<div class="helper-kp-recommendations__title">Кинопоиск</div>');

                var row =
                    $('<div class="helper-kp-recommendations__row"></div>');

                items.forEach(function (item) {
                    if (!item || !item.id) return;

                    var cardEl =
                        $('<div class="helper-kp-recommendations__card"></div>');

                    var image =
                        $('<img class="helper-kp-recommendations__image">');

                    image.attr(
                        'src',
                        item.img || ''
                    );

                    var name =
                        $('<div class="helper-kp-recommendations__name"></div>');

                    name.text(
                        item.title ||
                        item.original_title ||
                        ''
                    );

                    cardEl.append(image);
                    cardEl.append(name);

                    cardEl.on(
                        'hover:focus',
                        function () {
                            row
                                .find('.helper-kp-recommendations__card')
                                .removeClass('focus');

                            cardEl.addClass('focus');
                        }
                    );

                    cardEl.on(
                        'click',
                        function () {
                            /*
                             * Open recommendation using normal Lampa
                             * Activity navigation.
                             */

                            try {
                                Lampa.Activity.push({
                                    component: 'full',
                                    id: item.id,
                                    method: 'full',
                                    card: item
                                });
                            } catch (e) {
                                try {
                                    Lampa.Activity.push({
                                        component: 'full',
                                        card: item
                                    });
                                } catch (e2) {}
                            }
                        }
                    );

                    row.append(cardEl);
                });

                section.append(title);
                section.append(row);

                container.append(section);

                /*
                 * Make first recommendation focusable.
                 */

                var first =
                    row.find(
                        '.helper-kp-recommendations__card'
                    ).first();

                if (first.length) {
                    first.addClass('focus');
                }
            }
        );
    }

    /*
     * ---------------------------------------------------------
     * Styles
     * ---------------------------------------------------------
     */

    function addStyles() {
        if ($('#helper-kp-recommendations-style').length) {
            return;
        }

        var style = `
            <style id="helper-kp-recommendations-style">

                .helper-kp-recommendations {
                    width: 100%;
                    margin-top: 2em;
                    padding-bottom: 2em;
                }

                .helper-kp-recommendations__title {
                    font-size: 1.4em;
                    font-weight: 500;
                    margin-bottom: 0.8em;
                }

                .helper-kp-recommendations__row {
                    display: flex;
                    gap: 1em;
                    overflow: hidden;
                }

                .helper-kp-recommendations__card {
                    flex: 0 0 9em;
                    width: 9em;
                    min-width: 9em;
                    cursor: pointer;
                    border-radius: 0.35em;
                    overflow: hidden;
                    opacity: .9;
                    transform: scale(1);
                    transition: transform .15s ease,
                                opacity .15s ease;
                }

                .helper-kp-recommendations__card.focus {
                    opacity: 1;
                    transform: scale(1.04);
                }

                .helper-kp-recommendations__image {
                    display: block;
                    width: 100%;
                    height: 13em;
                    object-fit: cover;
                    background: rgba(255,255,255,.05);
                }

                .helper-kp-recommendations__name {
                    padding-top: .4em;
                    font-size: .8em;
                    line-height: 1.2;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

            </style>
        `;

        $('head').append(style);
    }

    /*
     * ---------------------------------------------------------
     * Existing Direct Play functionality
     * ---------------------------------------------------------
     */

    function installDirectPlay() {
        var Lampa = window.Lampa;

        if (
            !Lampa ||
            !Lampa.Select ||
            !Lampa.Lang ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !== 'function'
        ) {
            return false;
        }

        var original = Lampa.Select.show;

        if (typeof original !== 'function') {
            return false;
        }

        if (original.onlineModDirectPlay) {
            return true;
        }

        function show(options) {
            if (
                options &&
                options.title ===
                    Lampa.Lang.translate(
                        'settings_rest_source'
                    ) &&
                Array.isArray(options.items) &&
                typeof options.onSelect === 'function'
            ) {
                for (
                    var i = 0;
                    i < options.items.length;
                    i++
                ) {
                    var item = options.items[i];

                    if (
                        item &&
                        !item.hide &&
                        item.btn &&
                        typeof item.btn.is === 'function' &&
                        item.btn.is(
                            '.full-start__button.view--online_mod'
                        ) &&
                        !item.btn.is('.hide')
                    ) {
                        return options.onSelect(item);
                    }
                }
            }

            return original.apply(this, arguments);
        }

        show.onlineModDirectPlay = true;

        Lampa.Select.show = show;

        /*
         * Move Trailer after Play.
         */

        Lampa.Listener.follow(
            'full',
            function (event) {
                if (
                    !event ||
                    event.type !== 'complite' ||
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
                    typeof root.find !== 'function'
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

                trailers.insertAfter(play);

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

        return true;
    }

    /*
     * ---------------------------------------------------------
     * Installation
     * ---------------------------------------------------------
     */

    function install() {
        var Lampa = window.Lampa;

        if (!Lampa) {
            return false;
        }

        addStyles();

        installDirectPlay();

        /*
         * Wait until Lampa's full activity is available.
         */

        if (
            Lampa.Listener &&
            typeof Lampa.Listener.follow === 'function'
        ) {
            if (!window.helperKpRecommendationsInstalled) {
                window.helperKpRecommendationsInstalled = true;

                Lampa.Listener.follow(
                    'full',
                    function (event) {
                        /*
                         * Give the normal Lampa card a moment
                         * to finish rendering.
                         */

                        if (
                            event &&
                            event.type === 'complite'
                        ) {
                            setTimeout(
                                function () {
                                    addRecommendations(event);
                                },
                                250
                            );
                        }
                    }
                );
            }
        }

        return true;
    }

    /*
     * Lampa may load asynchronously.
     */

    if (!install()) {
        var attempts = 0;

        var timer = setInterval(
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
```
