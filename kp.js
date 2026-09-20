/* Kinopoisk Similar for Lampa v1.4.0
 * BUILD: 2026-09-20-18-20
 *
 * TMDB detail -> IMDb -> Wikidata -> KP ID -> KP /similars
 * Inserts the real DOM row directly into the visible Lampa page.
 */

(function () {
    'use strict';

    var VERSION = '1.4.0';
    var BUILD = '2026-09-20-18-20';
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

    function getTime(start) {
        return now() - start;
    }

    function decodeSecret(arr, key) {
        var result = '';

        for (var i = 0; i < arr.length; i++) {
            result += String.fromCharCode(
                arr[i] ^ key.charCodeAt(i % key.length)
            );
        }

        return result;
    }

    /*
     * Current key/decoder from kp_source.js
     */
    var KP_API_KEY = decodeSecret([
        46, 112, 67, 90, 13, 115, 6, 112, 126, 67, 41, 122,
        16, 66, 0, 37, 5, 37, 126, 73, 127, 39, 17, 66,
        82, 34, 80, 35, 99, 22, 44, 117, 70, 12, 2, 113
    ], atob('MUtQcGFzc3dvcmQ='));

    var KP_PROXY = 'https://cors.kp556.workers.dev/';
    var KP_API = 'https://kinopoiskapiunofficial.tech/';

    function getRequest(url, success, error) {
        if (Lampa.Reguest && typeof Lampa.Reguest.silent === 'function') {
            Lampa.Reguest.silent(
                url,
                success,
                error,
                false,
                {
                    'X-API-KEY': KP_API_KEY,
                    'Content-Type': 'application/json'
                }
            );
            return;
        }

        if (Lampa.Reguest && typeof Lampa.Reguest.get === 'function') {
            Lampa.Reguest.get(
                url,
                success,
                error,
                {
                    'X-API-KEY': KP_API_KEY,
                    'Content-Type': 'application/json'
                }
            );
            return;
        }

        fetch(url, {
            headers: {
                'X-API-KEY': KP_API_KEY,
                'Content-Type': 'application/json'
            }
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(success)
            .catch(error);
    }

    function getCurrentCard(event) {
        if (!event || !event.object) return null;

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
        var result = {
            tmdb: null,
            kp: null,
            imdb: null
        };

        if (!card) return result;

        result.tmdb =
            card.tmdb_id ||
            card.tmdb ||
            (card.id && card.source === 'tmdb' ? card.id : null);

        result.kp =
            card.kinopoisk_id ||
            card.kp_id ||
            card.kinopoisk ||
            null;

        result.imdb =
            card.imdb_id ||
            card.imdb ||
            null;

        return result;
    }

    function findImdb(card) {
        var ids = getIds(card);

        if (ids.imdb) {
            log('IMDB FOUND:', ids.imdb);
            return Promise.resolve(ids.imdb);
        }

        return Promise.resolve(null);
    }

    function getWikidataKpId(imdbId, start) {
        if (!imdbId) {
            log('NO IMDB ID');
            return Promise.resolve(null);
        }

        log('WIKIDATA START');

        var controller = null;
        var timer = null;

        if (typeof AbortController !== 'undefined') {
            controller = new AbortController();

            timer = setTimeout(function () {
                try {
                    controller.abort();
                } catch (e) {}
            }, 5000);
        }

        var url =
            'https://www.wikidata.org/w/api.php' +
            '?action=wbsearchentities' +
            '&search=' + encodeURIComponent(imdbId) +
            '&language=en' +
            '&format=json' +
            '&origin=*';

        return fetch(url, controller ? {
            signal: controller.signal
        } : {})
            .then(function (response) {
                log('WIKIDATA HTTP:', response.status);
                return response.json();
            })
            .then(function (data) {
                if (timer) clearTimeout(timer);

                var entity = data &&
                    data.search &&
                    data.search[0];

                if (!entity || !entity.id) {
                    log('WIKIDATA ENTITY NOT FOUND');
                    return null;
                }

                return fetch(
                    'https://www.wikidata.org/wiki/Special:EntityData/' +
                    entity.id +
                    '.json'
                );
            })
            .then(function (response) {
                if (!response) return null;
                return response.json();
            })
            .then(function (data) {
                if (!data) return null;

                var entities = data.entities || {};
                var entityId = Object.keys(entities)[0];
                var entity = entities[entityId];

                if (!entity || !entity.claims) {
                    log('WIKIDATA CLAIMS NOT FOUND');
                    return null;
                }

                /*
                 * P2603 = Kinopoisk film ID
                 */
                var claims = entity.claims.P2603;

                if (!claims || !claims.length) {
                    log('WIKIDATA P2603 NOT FOUND');
                    return null;
                }

                var value =
                    claims[0] &&
                    claims[0].mainsnak &&
                    claims[0].mainsnak.datavalue &&
                    claims[0].mainsnak.datavalue.value;

                if (!value) {
                    log('WIKIDATA KP VALUE EMPTY');
                    return null;
                }

                log('WIKIDATA KP ID:', value);
                return String(value);
            })
            .catch(function (error) {
                if (timer) clearTimeout(timer);

                log(
                    'WIKIDATA ERROR:',
                    error && error.message
                        ? error.message
                        : error
                );

                return null;
            });
    }

    function getKpId(card, start) {
        var ids = getIds(card);

        if (ids.kp) {
            log('KP ID FROM LAMPA:', ids.kp);
            return Promise.resolve(String(ids.kp));
        }

        return findImdb(card)
            .then(function (imdb) {
                return getWikidataKpId(imdb, start);
            });
    }

    function loadSimilars(kpId, start) {
        var url =
            KP_PROXY +
            KP_API +
            'api/v2.2/films/' +
            encodeURIComponent(kpId) +
            '/similars';

        log('SIMILARS REQUEST:', url);
        log('SIMILARS REQUEST START');

        return new Promise(function (resolve, reject) {
            getRequest(
                url,
                function (response) {
                    log('SIMILARS RESPONSE:', response);

                    var items =
                        response &&
                        Array.isArray(response.items)
                            ? response.items
                            : [];

                    log('RAW SIMILARS COUNT:', items.length);

                    resolve(items);
                },
                function (error) {
                    log(
                        'SIMILARS REQUEST ERROR:',
                        error
                    );

                    reject(error);
                }
            );
        });
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getPoster(item) {
        return (
            item.posterUrlPreview ||
            item.posterUrl ||
            item.posterUrlOriginal ||
            ''
        );
    }

    function getTitle(item) {
        return (
            item.nameRu ||
            item.nameEn ||
            item.nameOriginal ||
            'Без названия'
        );
    }

    function getYear(item) {
        if (item.year) return item.year;

        if (item.releaseDate) {
            return String(item.releaseDate).slice(0, 4);
        }

        return '';
    }

    function getRating(item) {
        if (
            item.ratingKinopoisk !== undefined &&
            item.ratingKinopoisk !== null &&
            item.ratingKinopoisk !== ''
        ) {
            return item.ratingKinopoisk;
        }

        if (
            item.ratingImdb !== undefined &&
            item.ratingImdb !== null
        ) {
            return item.ratingImdb;
        }

        return '';
    }

    function buildCard(item) {
        var kpId =
            item.kinopoiskId ||
            item.filmId ||
            item.id;

        var title = getTitle(item);
        var year = getYear(item);
        var poster = getPoster(item);
        var rating = getRating(item);

        return {
            id: 'KP_' + kpId,
            source: 'KP',
            kinopoisk_id: kpId,

            title: title,
            original_title:
                item.nameOriginal ||
                item.nameEn ||
                title,

            year: year,

            poster: poster,
            img: poster,
            poster_url: poster,

            vote_average: rating,
            rating: rating,

            type: 'movie',

            name: title,
            original_name:
                item.nameOriginal ||
                item.nameEn ||
                title
        };
    }

    function buildRow(items) {
        var row = document.createElement('div');

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
            row.querySelector('.mapping--line');

        items.forEach(function (item) {
            var data = buildCard(item);

            var card =
                document.createElement('div');

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
                              escapeHtml(data.poster) +
                              '">'
                            : '<div class="card__img"></div>'
                    ) +

                    '<div class="card__icons">' +
                        '<div class="card__icons-inner"></div>' +
                    '</div>' +

                    (
                        data.rating !== ''
                            ? '<div class="card__vote">' +
                              escapeHtml(data.rating) +
                              '</div>'
                            : ''
                    ) +

                '</div>' +

                '<div class="card__title">' +
                    escapeHtml(data.title) +
                '</div>' +

                (
                    data.year
                        ? '<div class="card__age">' +
                          escapeHtml(data.year) +
                          '</div>'
                        : ''
                );

            function openCard() {
                log(
                    'CARD ENTER:',
                    data.title,
                    'KP:',
                    data.kinopoisk_id
                );

                if (
                    Lampa.Router &&
                    typeof Lampa.Router.call === 'function'
                ) {
                    Lampa.Router.call('full', data);
                }
            }

            card.addEventListener(
                'click',
                function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    openCard();
                },
                true
            );

            card.addEventListener(
                'hover:enter',
                function () {
                    openCard();
                }
            );

            card.addEventListener(
                'keydown',
                function (event) {
                    if (
                        event.key === 'Enter' ||
                        event.keyCode === 13
                    ) {
                        event.preventDefault();
                        event.stopPropagation();
                        openCard();
                    }
                },
                true
            );

            body.appendChild(card);
        });

        return row;
    }

    function getVisibleFullRoot() {
        var roots = document.querySelectorAll(
            '.full-start-new, .full-start, .full'
        );

        var best = null;

        for (var i = 0; i < roots.length; i++) {
            var root = roots[i];

            if (!root || !root.offsetParent) continue;

            var rect = root.getBoundingClientRect();

            if (
                rect.width > 0 &&
                rect.height > 0
            ) {
                best = root;
            }
        }

        return best;
    }

    function getRows(root) {
        if (!root) return [];

        return Array.prototype.slice.call(
            root.querySelectorAll('.items-line')
        );
    }

    function getRowTitle(row) {
        if (!row) return '';

        var title =
            row.querySelector(
                '.items-line__title'
            );

        return title
            ? title.textContent.trim()
            : '';
    }

    function findRowByTitle(root, title) {
        var rows = getRows(root);

        for (var i = 0; i < rows.length; i++) {
            if (
                getRowTitle(rows[i])
                    .toLowerCase()
                    .indexOf(title.toLowerCase()) !== -1
            ) {
                return rows[i];
            }
        }

        return null;
    }

    function insertIntoRealDom(row, start) {
        log('REAL DOM SEARCH START');

        var root = getVisibleFullRoot();

        if (!root) {
            log('VISIBLE FULL ROOT NOT FOUND');
            return false;
        }

        log(
            'VISIBLE FULL ROOT FOUND:',
            root.className
        );

        var rows = getRows(root);

        log(
            'REAL DOM ROW COUNT:',
            rows.length
        );

        var similarRow =
            findRowByTitle(root, 'Похожие');

        var recommendationsRow =
            findRowByTitle(root, 'Рекомендации');

        var actorsRow =
            findRowByTitle(root, 'Актёры');

        var directorRow =
            findRowByTitle(root, 'Режиссёр');

        var target = null;

        /*
         * Desired position:
         *
         * Похожие
         * ↓
         * Рекомендации Кинопоиска
         *
         * If native "Похожие" doesn't exist,
         * place before native "Рекомендации".
         */

        if (similarRow) {
            similarRow.insertAdjacentElement(
                'afterend',
                row
            );

            target = 'AFTER Похожие';
        } else if (recommendationsRow) {
            recommendationsRow.insertAdjacentElement(
                'beforebegin',
                row
            );

            target = 'BEFORE Рекомендации';
        } else if (directorRow) {
            directorRow.insertAdjacentElement(
                'beforebegin',
                row
            );

            target = 'BEFORE Режиссёр';
        } else if (actorsRow) {
            actorsRow.insertAdjacentElement(
                'beforebegin',
                row
            );

            target = 'BEFORE Актёры';
        } else {
            var container =
                root.querySelector(
                    '.full-start__body, .full-start-new__body'
                );

            if (!container) {
                container = root;
            }

            container.appendChild(row);

            target = 'ROOT FALLBACK';
        }

        log(
            'ROW INSERTED:',
            target
        );

        log(
            'ROW CONNECTED:',
            row.isConnected
        );

        log(
            'ROW RECT:',
            row.getBoundingClientRect().width,
            row.getBoundingClientRect().height
        );

        log(
            'CARD COUNT:',
            row.querySelectorAll('.card').length
        );

        return row.isConnected;
    }

    function removeOldRow() {
        var old =
            document.querySelectorAll(
                '.kp-similar-line[data-kp-version]'
            );

        for (var i = 0; i < old.length; i++) {
            old[i].remove();
        }
    }

    function waitForRealDom(items, start, attempt) {
        attempt = attempt || 0;

        var row =
            buildRow(items);

        removeOldRow();

        if (insertIntoRealDom(row, start)) {
            log(
                'UI RENDERED IN REAL DOM',
                'TOTAL:',
                getTime(start) + 'ms'
            );

            return;
        }

        if (attempt >= 20) {
            log(
                'REAL DOM INSERT FAILED AFTER',
                attempt,
                'ATTEMPTS'
            );
            return;
        }

        log(
            'REAL DOM NOT READY, RETRY:',
            attempt + 1
        );

        setTimeout(function () {
            waitForRealDom(
                items,
                start,
                attempt + 1
            );
        }, 250);
    }

    function process(event) {
        if (working) {
            log('ALREADY WORKING');
            return;
        }

        var start = now();

        log('--------------------------------');
        log('FULL COMPLETE EVENT');
        log('CURRENT CARD:', getCurrentCard(event));

        var card = getCurrentCard(event);

        if (!card) {
            log('NO CURRENT CARD');
            return;
        }

        var key =
            (card.id || '') +
            '|' +
            (card.title || '') +
            '|' +
            (card.year || '');

        if (currentKey === key) {
            log('SAME CARD, SKIP:', key);
            return;
        }

        currentKey = key;
        working = true;

        var ids = getIds(card);

        log('IDS FROM LAMPA:', ids);

        getKpId(card, start)
            .then(function (kpId) {
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
                    kpId,
                    start
                );
            })
            .then(function (items) {
                log(
                    'SIMILAR COUNT:',
                    items.length
                );

                log(
                    'TOTAL PIPELINE:',
                    getTime(start) + 'ms'
                );

                if (!items.length) {
                    log(
                        'NO SIMILARS'
                    );
                    return;
                }

                log(
                    'RESULTS READY:',
                    items.length
                );

                /*
                 * Important:
                 * wait for the ACTUAL visible Lampa DOM.
                 */
                waitForRealDom(
                    items,
                    start,
                    0
                );
            })
            .catch(function (error) {
                log(
                    'PIPELINE ERROR:',
                    error &&
                    error.message
                        ? error.message
                        : error
                );
            })
            .finally(function () {
                working = false;
            });
    }

    if (
        Lampa.Listener &&
        typeof Lampa.Listener.follow === 'function'
    ) {
        Lampa.Listener.follow(
            'full',
            function (event) {
                if (
                    !event ||
                    event.type !== 'complite'
                ) {
                    return;
                }

                setTimeout(function () {
                    process(event);
                }, 50);
            }
        );

        log('LISTENER INSTALLED');
    } else {
        log('Lampa.Listener unavailable');
    }

}());
