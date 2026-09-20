/* Kinopoisk Similar for Lampa v1.4.2
 * BUILD: 2026-09-20-18-35
 *
 * TMDB detail -> IMDb -> Wikidata SPARQL -> KP ID -> KP /similars
 * Uses Lampa.Reguest exactly like kp_source.js.
 * Waits for native Lampa rows before inserting.
 */

(function () {
    'use strict';

    var VERSION = '1.4.2';
    var BUILD = '2026-09-20-18-35';
    var PREFIX = '[KP UI v' + VERSION + ']';

    console.log(PREFIX + ' VERSION:', VERSION);
    console.log(PREFIX + ' BUILD:', BUILD);

    var Lampa = window.Lampa;

    if (!Lampa) {
        console.log(PREFIX, 'Lampa not found');
        return;
    }

    var currentKey = null;
    var working = false;

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        console.log.apply(console, args);
    }

    function now() {
        return Date.now();
    }

    function elapsed(start) {
        return now() - start;
    }

    function decodeSecret(arr, key) {
        var result = '';
        var password = (key || '') + '';

        if (!arr || !password) return result;

        var hash = '';

        function salt(input) {
            var str = (input || '') + '';
            var hashValue = 0;

            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);
                hashValue =
                    (hashValue << 5) -
                    hashValue +
                    c;

                hashValue =
                    hashValue & hashValue;
            }

            var resultSalt = '';

            for (
                var j = 32 - 3, x = 0;
                j >= 0;
                x += 3, j -= 3
            ) {
                var value =
                    (
                        ((hashValue >>> x) & 7) << 3
                    ) +
                    ((hashValue >>> j) & 7);

                resultSalt += String.fromCharCode(
                    value < 26
                        ? 97 + value
                        : value < 52
                            ? 39 + value
                            : value - 4
                );
            }

            return resultSalt;
        }

        hash =
            salt(
                '123456789' +
                password
            );

        while (
            hash.length < arr.length
        ) {
            hash += hash;
        }

        for (
            var index = 0;
            index < arr.length;
            index++
        ) {
            result += String.fromCharCode(
                arr[index] ^
                hash.charCodeAt(index)
            );
        }

        return result;
    }

    /*
     * Exact decoder/key from current kp_source.js
     */
    var KP_API_KEY = decodeSecret(
        [
            46, 112, 67, 90, 13, 115, 6, 112,
            126, 67, 41, 122, 16, 66, 0, 37,
            5, 37, 126, 73, 127, 39, 17, 66,
            82, 34, 80, 35, 99, 22, 44, 117,
            70, 12, 2, 113
        ],
        atob('MUtQcGFzc3dvcmQ=')
    );

    var KP_PROXY =
        'https://cors.kp556.workers.dev/';

    var KP_API =
        'https://kinopoiskapiunofficial.tech/';

    /*
     * Use Lampa's native request implementation.
     */
    var network =
        typeof Lampa.Reguest === 'function'
            ? new Lampa.Reguest()
            : null;

    if (!network) {
        log(
            'ERROR: Lampa.Reguest unavailable'
        );
    } else {
        log(
            'Lampa.Reguest READY'
        );
    }

    function request(url, success, error) {
        if (!network) {
            error(
                new Error(
                    'Lampa.Reguest unavailable'
                )
            );

            return;
        }

        network.timeout(20000);

        network.silent(
            url,
            function (json) {
                success(json);
            },
            function (a, c) {
                log(
                    'REQUEST ERROR:',
                    a
                );

                error(a, c);
            },
            false,
            {
                headers: {
                    'X-API-KEY':
                        KP_API_KEY
                }
            }
        );
    }

    function getCard(event) {
        if (
            !event ||
            !event.object
        ) {
            return null;
        }

        if (event.object.card) {
            return event.object.card;
        }

        if (
            event.object.params &&
            event.object.params.card
        ) {
            return event.object.params.card;
        }

        return null;
    }

    function getIds(card) {
        return {
            tmdb:
                card &&
                (
                    card.tmdb_id ||
                    card.tmdb ||
                    (
                        card.source === 'tmdb'
                            ? card.id
                            : null
                    )
                ),

            kp:
                card &&
                (
                    card.kinopoisk_id ||
                    card.kp_id ||
                    card.kinopoisk ||
                    null
                ),

            imdb:
                card &&
                (
                    card.imdb_id ||
                    card.imdb ||
                    null
                )
        };
    }

    function getWikidataKpId(
        imdbId
    ) {
        if (!imdbId) {
            log(
                'NO IMDB ID'
            );

            return Promise.resolve(null);
        }

        log(
            'WIKIDATA SPARQL START:',
            imdbId
        );

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

        return fetch(
            url,
            {
                headers: {
                    'Accept':
                        'application/sparql-results+json'
                }
            }
        )
            .then(function (response) {
                log(
                    'WIKIDATA SPARQL HTTP:',
                    response.status
                );

                if (!response.ok) {
                    throw new Error(
                        'Wikidata HTTP ' +
                        response.status
                    );
                }

                return response.json();
            })
            .then(function (data) {
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

                if (!kp) {
                    log(
                        'WIKIDATA KP VALUE EMPTY'
                    );

                    return null;
                }

                log(
                    'WIKIDATA KP ID:',
                    kp
                );

                return String(kp);
            })
            .catch(function (error) {
                log(
                    'WIKIDATA ERROR:',
                    error &&
                    error.message
                        ? error.message
                        : error
                );

                return null;
            });
    }

    function getKpId(card) {
        var ids =
            getIds(card);

        log(
            'IDS FROM LAMPA:',
            ids
        );

        if (ids.kp) {
            log(
                'KP ID FROM LAMPA:',
                ids.kp
            );

            return Promise.resolve(
                String(ids.kp)
            );
        }

        if (!ids.imdb) {
            log(
                'NO IMDB ID'
            );

            return Promise.resolve(null);
        }

        log(
            'IMDB FOUND:',
            ids.imdb
        );

        return getWikidataKpId(
            ids.imdb
        );
    }

    function loadSimilars(
        kpId
    ) {
        var url =
            KP_PROXY +
            KP_API +
            'api/v2.2/films/' +
            encodeURIComponent(kpId) +
            '/similars';

        log(
            'SIMILARS REQUEST:',
            url
        );

        log(
            'SIMILARS REQUEST START'
        );

        return new Promise(
            function (
                resolve,
                reject
            ) {
                request(
                    url,
                    function (
                        response
                    ) {
                        log(
                            'SIMILARS RESPONSE:',
                            response
                        );

                        var items =
                            response &&
                            Array.isArray(
                                response.items
                            )
                                ? response.items
                                : [];

                        log(
                            'RAW SIMILARS COUNT:',
                            items.length
                        );

                        resolve(
                            items
                        );
                    },
                    function (
                        error
                    ) {
                        log(
                            'SIMILARS REQUEST ERROR:',
                            error
                        );

                        reject(
                            error
                        );
                    }
                );
            }
        );
    }

    function escapeHtml(
        value
    ) {
        return String(
            value == null
                ? ''
                : value
        )
            .replace(
                /&/g,
                '&amp;'
            )
            .replace(
                /</g,
                '&lt;'
            )
            .replace(
                />/g,
                '&gt;'
            )
            .replace(
                /"/g,
                '&quot;'
            )
            .replace(
                /'/g,
                '&#039;'
            );
    }

    function buildData(
        item
    ) {
        var kpId =
            item.kinopoiskId ||
            item.filmId ||
            item.id;

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
            item.ratingKinopoisk !==
                undefined &&
            item.ratingKinopoisk !==
                null
                ? item.ratingKinopoisk
                : (
                    item.ratingImdb !==
                        undefined &&
                    item.ratingImdb !==
                        null
                        ? item.ratingImdb
                        : ''
                );

        return {
            id:
                'KP_' +
                kpId,

            source:
                'KP',

            kinopoisk_id:
                kpId,

            title:
                title,

            original_title:
                item.nameOriginal ||
                item.nameEn ||
                title,

            year:
                year,

            poster:
                poster,

            img:
                poster,

            background_image:
                poster,

            vote_average:
                rating,

            rating:
                rating,

            type:
                'movie'
        };
    }

    function buildRow(
        items
    ) {
        var row =
            document.createElement(
                'div'
            );

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

        items.forEach(
            function (
                item
            ) {
                var data =
                    buildData(
                        item
                    );

                var card =
                    document.createElement(
                        'div'
                    );

                card.className =
                    'card selector layer--visible layer--render card--loaded';

                card.setAttribute(
                    'data-kp-id',
                    data.kinopoisk_id
                );

                card.setAttribute(
                    'data-kp-version',
                    VERSION
                );

                card.innerHTML =
                    '<div class="card__view">' +

                        (
                            data.poster
                                ? '<img class="card__img" src="' +
                                  escapeHtml(
                                      data.poster
                                  ) +
                                  '">'
                                : ''
                        ) +

                        '<div class="card__icons">' +
                            '<div class="card__icons-inner"></div>' +
                        '</div>' +

                        (
                            data.rating !== ''
                                ? '<div class="card__vote">' +
                                  escapeHtml(
                                      data.rating
                                  ) +
                                  '</div>'
                                : ''
                        ) +

                    '</div>' +

                    '<div class="card__title">' +
                        escapeHtml(
                            data.title
                        ) +
                    '</div>' +

                    (
                        data.year
                            ? '<div class="card__age">' +
                              escapeHtml(
                                  data.year
                              ) +
                              '</div>'
                            : ''
                    );

                function openCard() {
                    log(
                        'CARD OPEN:',
                        data.title,
                        'KP:',
                        data.kinopoisk_id
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

                card.addEventListener(
                    'click',
                    function (
                        event
                    ) {
                        event.preventDefault();
                        event.stopPropagation();

                        openCard();
                    },
                    true
                );

                card.addEventListener(
                    'keydown',
                    function (
                        event
                    ) {
                        if (
                            event.key ===
                                'Enter' ||
                            event.keyCode === 13
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openCard();
                        }
                    },
                    true
                );

                body.appendChild(
                    card
                );
            }
        );

        return row;
    }

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

            if (
                !row.offsetParent
            ) {
                continue;
            }

            var rect =
                row.getBoundingClientRect();

            if (
                rect.width > 0 &&
                rect.height > 0
            ) {
                result.push(
                    row
                );
            }
        }

        return result;
    }

    function getRowTitle(
        row
    ) {
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
            similar:
                null,

            recommendations:
                null,

            actors:
                null,

            director:
                null
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

    function waitForRows(
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
            attempt < 40
        ) {
            setTimeout(
                function () {
                    waitForRows(
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
                'DOM ROWS TIMEOUT'
            );

            return;
        }

        log(
            'ROW CONNECTED:',
            row.isConnected
        );

        log(
            'CARD COUNT:',
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
            elapsed(start) +
            'ms'
        );
    }

    function process(
        event
    ) {
        var start =
            now();

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
            getCard(event);

        log(
            'CURRENT CARD:',
            card
        );

        if (!card) {
            log(
                'NO CURRENT CARD'
            );

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

        getKpId(
            card
        )
            .then(
                function (
                    kpId
                ) {
                    if (!kpId) {
                        throw new Error(
                            'Kinopoisk ID not found'
                        );
                    }

                    log(
                        'FINAL KP ID:',
                        kpId
                    );

                    return loadSimilars(
                        kpId
                    );
                }
            )
            .then(
                function (
                    items
                ) {
                    log(
                        'SIMILAR COUNT:',
                        items.length
                    );

                    log(
                        'TOTAL PIPELINE:',
                        elapsed(start) +
                        'ms'
                    );

                    if (
                        !items.length
                    ) {
                        log(
                            'NO SIMILARS'
                        );

                        return;
                    }

                    log(
                        'RESULTS READY:',
                        items.length
                    );

                    var row =
                        buildRow(
                            items
                        );

                    log(
                        'WAITING FOR REAL LAMPA ROWS'
                    );

                    waitForRows(
                        row,
                        start,
                        0
                    );
                }
            )
            .catch(
                function (
                    error
                ) {
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

    if (
        Lampa.Listener &&
        typeof Lampa.Listener.follow ===
            'function'
    ) {
        Lampa.Listener.follow(
            'full',
            function (
                event
            ) {
                if (
                    !event ||
                    event.type !==
                        'complite'
                ) {
                    return;
                }

                setTimeout(
                    function () {
                        process(
                            event
                        );
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
