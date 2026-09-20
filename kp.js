/* Kinopoisk Similar for Lampa v1.5.2
 * BUILD: 2026-09-20-18-50
 *
 * TMDB detail
 * -> IMDb
 * -> Wikidata
 * -> KP ID
 * -> native kp_source.js
 * -> KP.full()
 * -> simular
 * -> native Lampa Card
 */

(function () {
    'use strict';

    var VERSION = '1.5.2';
    var BUILD = '2026-09-20-18-50';
    var PREFIX = '[KP UI v' + VERSION + ']';

    console.log(PREFIX + ' VERSION:', VERSION);
    console.log(PREFIX + ' BUILD:', BUILD);

    var Lampa = window.Lampa;

    if (!Lampa) {
        console.log(PREFIX + ' LAMPA NOT FOUND');
        return;
    }

    var currentKey = null;
    var working = false;
    var kpSourceLoading = null;
    var nativeCards = [];

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        console.log.apply(console, args);
    }

    function elapsed(start) {
        return Date.now() - start;
    }

    /*
     * =========================================================
     * KP SOURCE
     * =========================================================
     */

    function isKPReady() {
        return !!(
            window.kp_source_plugin ||
            (
                Lampa.Api &&
                Lampa.Api.sources &&
                Lampa.Api.sources.KP
            )
        );
    }

    function loadKPSource() {
        if (isKPReady()) {
            log('KP SOURCE ALREADY READY');

            return Promise.resolve(true);
        }

        if (kpSourceLoading) {
            return kpSourceLoading;
        }

        kpSourceLoading = new Promise(function (resolve) {
            log('KP SOURCE LOAD START');

            var script =
                document.createElement('script');

            script.src =
                'https://raw.githubusercontent.com/nb557/plugins/master/kp_source.js?v=' +
                Date.now();

            script.onload = function () {
                log('KP SOURCE NETWORK LOADED');

                var attempts = 0;

                var timer =
                    setInterval(
                        function () {
                            attempts++;

                            if (isKPReady()) {
                                clearInterval(timer);

                                log(
                                    'KP SOURCE REGISTERED'
                                );

                                resolve(true);
                                return;
                            }

                            if (attempts >= 50) {
                                clearInterval(timer);

                                log(
                                    'KP SOURCE REGISTER TIMEOUT'
                                );

                                resolve(false);
                            }
                        },
                        100
                    );
            };

            script.onerror = function (error) {
                log(
                    'KP SOURCE LOAD ERROR:',
                    error
                );

                resolve(false);
            };

            document.head.appendChild(script);
        });

        return kpSourceLoading;
    }

    /*
     * =========================================================
     * KP FULL
     * =========================================================
     */

    function loadKPFull(kpId) {
        return new Promise(
            function (resolve, reject) {
                if (
                    !Lampa.Api ||
                    !Lampa.Api.sources ||
                    !Lampa.Api.sources.KP
                ) {
                    reject(
                        new Error(
                            'KP source unavailable'
                        )
                    );

                    return;
                }

                var KP =
                    Lampa.Api.sources.KP;

                log(
                    'KP FULL START:',
                    kpId
                );

                var params = {
                    card: {
                        id: 'KP_' + kpId,
                        source: 'KP',
                        kinopoisk_id: kpId
                    }
                };

                var started =
                    Date.now();

                try {
                    KP.full(
                        params,
                        function (response) {
                            log(
                                'KP FULL COMPLETE:',
                                elapsed(started) + 'ms'
                            );

                            log(
                                'KP FULL RESPONSE:',
                                response
                            );

                            resolve(
                                response
                            );
                        },
                        function (error) {
                            log(
                                'KP FULL ERROR:',
                                error
                            );

                            reject(
                                error
                            );
                        }
                    );
                } catch (error) {
                    log(
                        'KP FULL EXCEPTION:',
                        error
                    );

                    reject(error);
                }
            }
        );
    }

    /*
     * =========================================================
     * WIKIDATA
     * =========================================================
     */

    function getWikidataKpId(imdbId) {
        var query =
            'SELECT ?item ?kp WHERE {' +
            '?item wdt:P345 "' +
            imdbId +
            '". ' +
            '?item wdt:P2603 ?kp.' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql' +
            '?query=' +
            encodeURIComponent(query) +
            '&format=json';

        log(
            'WIKIDATA SPARQL START:',
            imdbId
        );

        return fetch(
            url,
            {
                headers: {
                    Accept:
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

                    return response.json();
                }
            )
            .then(
                function (data) {
                    var bindings =
                        data &&
                        data.results &&
                        data.results.bindings;

                    if (
                        !bindings ||
                        !bindings.length
                    ) {
                        log(
                            'WIKIDATA KP ID NOT FOUND'
                        );

                        return null;
                    }

                    var kp =
                        bindings[0] &&
                        bindings[0].kp &&
                        bindings[0].kp.value;

                    log(
                        'WIKIDATA KP ID:',
                        kp
                    );

                    return kp
                        ? String(kp)
                        : null;
                }
            );
    }

    function getKpId(card) {
        var kp =
            card.kinopoisk_id ||
            card.kp_id ||
            card.kinopoisk;

        if (kp) {
            log(
                'KP ID FROM LAMPA:',
                kp
            );

            return Promise.resolve(
                String(kp)
            );
        }

        var imdb =
            card.imdb_id ||
            card.imdb;

        log(
            'IMDB FOUND:',
            imdb
        );

        if (!imdb) {
            return Promise.resolve(null);
        }

        return getWikidataKpId(
            imdb
        );
    }

    /*
     * =========================================================
     * NATIVE LAMPA CARD
     * =========================================================
     */

    function createNativeCard(item) {
        var kpId =
            item.kinopoiskId ||
            item.filmId ||
            item.id;

        if (!kpId) {
            log(
                'CARD SKIP: NO KP ID',
                item
            );

            return null;
        }

        var title =
            item.nameRu ||
            item.nameEn ||
            item.nameOriginal ||
            'Без названия';

        var year =
            item.year ||
            (
                item.releaseDate
                    ? String(
                        item.releaseDate
                    ).slice(0, 4)
                    : ''
            );

        var poster =
            item.posterUrlPreview ||
            item.posterUrl ||
            item.posterUrlOriginal ||
            '';

        var rating =
            item.ratingKinopoisk !== undefined &&
            item.ratingKinopoisk !== null
                ? item.ratingKinopoisk
                : (
                    item.ratingImdb !== undefined &&
                    item.ratingImdb !== null
                        ? item.ratingImdb
                        : ''
                );

        var data = {
            id: 'KP_' + kpId,

            source: 'KP',

            kinopoisk_id: kpId,

            title: title,

            original_title:
                item.nameOriginal ||
                item.nameEn ||
                title,

            name: title,

            original_name:
                item.nameOriginal ||
                item.nameEn ||
                title,

            year: year,

            poster: poster,
            img: poster,
            background_image: poster,

            vote_average: rating,
            rating: rating,

            type: 'movie',
            media_type: 'movie'
        };

        log(
            'CREATE CARD:',
            title,
            '| YEAR:',
            year,
            '| KP:',
            kpId
        );

        if (
            !Lampa.Maker ||
            typeof Lampa.Maker.make !== 'function'
        ) {
            log(
                'ERROR: Lampa.Maker unavailable'
            );

            return null;
        }

        var card;

        try {
            card =
                Lampa.Maker.make(
                    'Card',
                    data,
                    function (module) {
                        module.only(
                            'Create',
                            'Callback'
                        );
                    }
                );
        } catch (error) {
            log(
                'CARD CREATE ERROR:',
                error
            );

            return null;
        }

        if (!card) {
            log(
                'CARD IS NULL'
            );

            return null;
        }

        if (
            typeof card.use ===
            'function'
        ) {
            card.use({
                onFocus: function () {
                    log(
                        'CARD FOCUS:',
                        title,
                        '| KP:',
                        kpId
                    );
                },

                onEnter: function () {
                    log(
                        'CARD ENTER:',
                        title,
                        '| KP:',
                        kpId
                    );

                    if (
                        Lampa.Router &&
                        typeof Lampa.Router.call ===
                            'function'
                    ) {
                        Lampa.Router.call(
                            'full',
                            data
                        );
                    }
                }
            });
        }

        nativeCards.push(card);

        return card;
    }

    /*
     * =========================================================
     * ROW
     * =========================================================
     */

    function clearNativeCards() {
        nativeCards = [];
    }

    function buildNativeRow(items) {
        var row =
            document.createElement('div');

        row.className =
            'items-line layer--visible layer--render kp-similar-line';

        row.setAttribute(
            'data-kp-version',
            VERSION
        );

        row.innerHTML =
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
            '</div>';

        var body =
            row.querySelector(
                '.mapping--line'
            );

        clearNativeCards();

        for (
            var i = 0;
            i < items.length;
            i++
        ) {
            var card =
                createNativeCard(
                    items[i]
                );

            if (!card) {
                continue;
            }

            var element = null;

            try {
                if (
                    typeof card.render ===
                        'function'
                ) {
                    element =
                        card.render();
                }
            } catch (error) {
                log(
                    'CARD RENDER ERROR:',
                    error
                );
            }

            if (
                !element &&
                card.el
            ) {
                element =
                    card.el;
            }

            if (
                !element &&
                card.html
            ) {
                element =
                    card.html;
            }

            if (
                element &&
                element.jquery
            ) {
                element =
                    element[0];
            }

            if (
                element &&
                element.nodeType
            ) {
                body.appendChild(
                    element
                );

                log(
                    'CARD APPENDED:',
                    i + 1,
                    '/',
                    items.length
                );
            } else {
                log(
                    'CARD ELEMENT NOT FOUND:',
                    i
                );
            }
        }

        log(
            'NATIVE CARD COUNT:',
            body.querySelectorAll(
                '.card'
            ).length
        );

        return row;
    }

    /*
     * =========================================================
     * DOM
     * =========================================================
     */

    function removeOldRows() {
        var rows =
            document.querySelectorAll(
                '.kp-similar-line'
            );

        for (
            var i = 0;
            i < rows.length;
            i++
        ) {
            rows[i].remove();
        }

        clearNativeCards();
    }

    function getVisibleRows() {
        var rows =
            document.querySelectorAll(
                '.items-line'
            );

        var result = [];

        for (
            var i = 0;
            i < rows.length;
            i++
        ) {
            var row =
                rows[i];

            if (!row.offsetParent) {
                continue;
            }

            var rect =
                row.getBoundingClientRect();

            if (
                rect.width > 0 &&
                rect.height > 0
            ) {
                result.push(row);
            }
        }

        return result;
    }

    function getRowTitle(row) {
        var title =
            row.querySelector(
                '.items-line__title'
            );

        return title
            ? title.textContent.trim()
            : '';
    }

    function findRows() {
        var rows =
            getVisibleRows();

        var result = {
            similar: null,
            recommendations: null,
            actors: null,
            director: null
        };

        for (
            var i = 0;
            i < rows.length;
            i++
        ) {
            var title =
                getRowTitle(
                    rows[i]
                ).toLowerCase();

            if (
                title.indexOf(
                    'похожие'
                ) !== -1
            ) {
                result.similar =
                    rows[i];
            }

            if (
                title ===
                'рекомендации'
            ) {
                result.recommendations =
                    rows[i];
            }

            if (
                title.indexOf(
                    'актёр'
                ) !== -1 ||
                title.indexOf(
                    'актер'
                ) !== -1
            ) {
                result.actors =
                    rows[i];
            }

            if (
                title.indexOf(
                    'режиссёр'
                ) !== -1 ||
                title.indexOf(
                    'режиссер'
                ) !== -1
            ) {
                result.director =
                    rows[i];
            }
        }

        return result;
    }

    function insertRow(
        row,
        start,
        attempt
    ) {
        attempt =
            attempt || 0;

        var found =
            findRows();

        log(
            'DOM CHECK #' +
            attempt +
            ':',
            'similar=' +
            !!found.similar,
            'recommendations=' +
            !!found.recommendations,
            'actors=' +
            !!found.actors,
            'director=' +
            !!found.director
        );

        if (
            found.similar
        ) {
            found.similar.insertAdjacentElement(
                'afterend',
                row
            );

            log(
                'ROW INSERTED AFTER Похожие'
            );
        } else if (
            found.recommendations
        ) {
            found.recommendations.insertAdjacentElement(
                'beforebegin',
                row
            );

            log(
                'ROW INSERTED BEFORE Рекомендации'
            );
        } else if (
            found.director
        ) {
            found.director.insertAdjacentElement(
                'beforebegin',
                row
            );

            log(
                'ROW INSERTED BEFORE Режиссёр'
            );
        } else if (
            found.actors
        ) {
            found.actors.insertAdjacentElement(
                'beforebegin',
                row
            );

            log(
                'ROW INSERTED BEFORE Актёры'
            );
        } else if (
            attempt < 60
        ) {
            setTimeout(
                function () {
                    insertRow(
                        row,
                        start,
                        attempt + 1
                    );
                },
                250
            );

            return;
        } else {
            log(
                'DOM ROW TIMEOUT'
            );

            return;
        }

        log(
            'ROW CONNECTED:',
            row.isConnected
        );

        log(
            'NATIVE CARD DOM COUNT:',
            row.querySelectorAll(
                '.card'
            ).length
        );

        var rect =
            row.getBoundingClientRect();

        log(
            'ROW RECT:',
            rect.width,
            rect.height
        );

        log(
            'TOTAL:',
            elapsed(start) + 'ms'
        );
    }

    /*
     * =========================================================
     * MAIN
     * =========================================================
     */

    function process(event) {
        var start =
            Date.now();

        if (working) {
            log(
                'ALREADY WORKING'
            );

            return;
        }

        log(
            'FULL COMPLETE EVENT'
        );

        var card =
            event &&
            event.object &&
            event.object.card;

        log(
            'CURRENT CARD:',
            card
        );

        if (!card) {
            return;
        }

        var key =
            (card.id || '') +
            '|' +
            (card.title || '') +
            '|' +
            (card.year || '');

        if (
            currentKey === key
        ) {
            log(
                'SAME CARD, SKIP'
            );

            return;
        }

        currentKey =
            key;

        working =
            true;

        removeOldRows();

        getKpId(card)
            .then(
                function (kpId) {
                    if (!kpId) {
                        throw new Error(
                            'Kinopoisk ID not found'
                        );
                    }

                    log(
                        'FINAL KP ID:',
                        kpId
                    );

                    return loadKPSource()
                        .then(
                            function (ready) {
                                if (!ready) {
                                    throw new Error(
                                        'KP source not registered'
                                    );
                                }

                                log(
                                    'KP SOURCE READY'
                                );

                                return loadKPFull(
                                    kpId
                                );
                            }
                        );
                }
            )
            .then(
                function (response) {
                    var similar =
                        response &&
                        response.simular &&
                        response.simular.results;

                    if (
                        !Array.isArray(
                            similar
                        )
                    ) {
                        similar = [];
                    }

                    log(
                        'RAW SIMILAR COUNT:',
                        similar.length
                    );

                    log(
                        'SIMILAR ITEMS:',
                        similar
                    );

                    log(
                        'TOTAL PIPELINE:',
                        elapsed(start) +
                        'ms'
                    );

                    if (!similar.length) {
                        log(
                            'NO SIMILARS'
                        );

                        return;
                    }

                    var row =
                        buildNativeRow(
                            similar
                        );

                    log(
                        'NATIVE ROW BUILT'
                    );

                    insertRow(
                        row,
                        start,
                        0
                    );
                }
            )
            .catch(
                function (error) {
                    log(
                        'PIPELINE ERROR:',
                        error &&
                        error.message
                            ? error.message
                            : error
                    );
                }
            )
            .finally(
                function () {
                    working =
                        false;
                }
            );
    }

    /*
     * =========================================================
     * LISTENER
     * =========================================================
     */

    if (
        Lampa.Listener &&
        typeof Lampa.Listener.follow ===
            'function'
    ) {
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

                setTimeout(
                    function () {
                        process(event);
                    },
                    50
                );
            }
        );

        log(
            'LISTENER INSTALLED'
        );
    } else {
        log(
            'Lampa.Listener unavailable'
        );
    }

}());
