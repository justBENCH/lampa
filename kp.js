/* KP Recommendations for Lampa v1.5.4
 * 2026-09-20
 */
(function () {
    'use strict';

    var VERSION = '1.5.4';
    var BUILD = '2026-09-20-19-05';

    console.log('[KP UI v' + VERSION + '] VERSION:', VERSION);
    console.log('[KP UI v' + VERSION + '] BUILD:', BUILD);

    var KP_SOURCE_URL =
        'https://nb557.github.io/plugins/kp_source.js?v=' + Date.now();

    var loaded = false;
    var loading = false;

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

    function loadKPSource(done) {
        if (loaded &&
            window.Lampa &&
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP) {
            log('KP SOURCE ALREADY READY');
            done();
            return;
        }

        if (loading) {
            var wait = 0;

            var timer = setInterval(function () {
                if (window.Lampa &&
                    Lampa.Api &&
                    Lampa.Api.sources &&
                    Lampa.Api.sources.KP) {
                    clearInterval(timer);
                    loaded = true;
                    log('KP SOURCE READY AFTER WAIT');
                    done();
                } else if (++wait > 60) {
                    clearInterval(timer);
                    error('KP SOURCE WAIT TIMEOUT');
                }
            }, 250);

            return;
        }

        loading = true;

        log('KP SOURCE LOAD START');
        log('KP SOURCE URL:', KP_SOURCE_URL);

        var script = document.createElement('script');

        script.onload = function () {
            log('KP SOURCE NETWORK LOADED');

            var attempts = 0;

            var timer = setInterval(function () {
                if (window.Lampa &&
                    Lampa.Api &&
                    Lampa.Api.sources &&
                    Lampa.Api.sources.KP) {

                    clearInterval(timer);

                    loaded = true;
                    loading = false;

                    log('KP SOURCE REGISTERED');
                    log('KP SOURCE READY');

                    done();
                } else if (++attempts >= 40) {
                    clearInterval(timer);
                    loading = false;
                    error('KP SOURCE REGISTER ERROR');
                }
            }, 250);
        };

        script.onerror = function (e) {
            loading = false;
            error('KP SOURCE LOAD ERROR:', e);
        };

        script.src = KP_SOURCE_URL;

        document.head.appendChild(script);
    }

    function getCurrentCard(event) {
        if (!event || !event.object) return null;

        var card = event.object.card;

        if (card) return card;

        if (event.object.params && event.object.params.card) {
            return event.object.params.card;
        }

        return null;
    }

    function getImdbId(card) {
        if (!card) return '';

        if (card.imdb_id) return card.imdb_id;
        if (card.imdbId) return card.imdbId;
        if (card.imdb) return card.imdb;

        return '';
    }

    function findKPIdByIMDb(imdbId, callback) {
        if (!imdbId) {
            callback(null);
            return;
        }

        log('WIKIDATA SPARQL START:', imdbId);

        var query =
            'SELECT ?item ?kp WHERE {' +
            ' ?item wdt:P345 "' +
            imdbId.replace(/"/g, '\\"') +
            '".' +
            ' ?item wdt:P2603 ?kp.' +
            '} LIMIT 1';

        var url =
            'https://query.wikidata.org/sparql?format=json&query=' +
            encodeURIComponent(query);

        var request = new Lampa.Reguest();

        request.silent(
            url,
            function (json) {
                log('WIKIDATA HTTP: 200');

                try {
                    var bindings =
                        json &&
                        json.results &&
                        json.results.bindings
                            ? json.results.bindings
                            : [];

                    if (!bindings.length) {
                        log('WIKIDATA KP ID: NOT FOUND');
                        callback(null);
                        return;
                    }

                    var kp =
                        bindings[0].kp &&
                        bindings[0].kp.value
                            ? bindings[0].kp.value
                            : '';

                    log('WIKIDATA KP ID:', kp || 'NOT FOUND');

                    callback(kp || null);
                } catch (e) {
                    error('WIKIDATA PARSE ERROR:', e);
                    callback(null);
                }
            },
            function (a, c) {
                error('WIKIDATA ERROR:', a, c);
                callback(null);
            }
        );
    }

    function makeCard(data) {
        try {
            log(
                'CREATE CARD:',
                data.title || 'Без названия',
                '| YEAR:',
                data.release_date || data.first_air_date || data.year || '',
                '| KP:',
                data.id
            );

            /*
             * ВАЖНО:
             * Не используем:
             * module.only('Create', 'Callback')
             *
             * В текущей сборке Lampa этот модульный набор
             * недоступен для Card.
             *
             * Используем стандартный набор Card.
             */
            var card = Lampa.Maker.make('Card', data);

            if (!card) {
                error('CARD CREATE RETURNED NULL');
                return null;
            }

            if (typeof card.use === 'function') {
                card.use({
                    onFocus: function () {
                        try {
                            if (window.Background &&
                                typeof Background.change === 'function') {
                                Background.change(
                                    Lampa.Utils.cardImgBackground(this.data)
                                );
                            }
                        } catch (e) {}
                    },

                    onEnter: function () {
                        log(
                            'CARD ENTER:',
                            this.data &&
                            (this.data.title || this.data.name)
                        );

                        try {
                            Router.call('full', this.data);
                        } catch (e) {
                            error('ROUTER ERROR:', e);
                        }
                    }
                });
            }

            return card;
        } catch (e) {
            error('CARD CREATE ERROR:', e);
            return null;
        }
    }

    function createRow(results) {
        var row = $('<div class="items-line kp-recommendations-line layer--visible layer--render">');

        row.attr('data-kp-ui-version', VERSION);

        var head = $(
            '<div class="items-line__head">' +
                '<div class="items-line__title">Рекомендации Кинопоиска</div>' +
            '</div>'
        );

        var body = $('<div class="items-line__body"></div>');
        var scroll = $('<div class="scroll scroll--horizontal"></div>');
        var content = $('<div class="scroll__content"></div>');
        var mapping = $('<div class="scroll__body mapping--line"></div>');

        var cardCount = 0;

        for (var i = 0; i < results.length; i++) {
            var card = makeCard(results[i]);

            if (!card) continue;

            var element = null;

            try {
                if (typeof card.render === 'function') {
                    element = card.render();
                } else if (card.el) {
                    element = card.el;
                }
            } catch (e) {
                error('CARD RENDER ERROR:', e);
            }

            if (!element) {
                error('CARD DOM ELEMENT NOT FOUND');
                continue;
            }

            if (element.jquery) {
                mapping.append(element);
            } else {
                mapping.append($(element));
            }

            cardCount++;
        }

        content.append(mapping);
        scroll.append(content);
        body.append(scroll);

        row.append(head);
        row.append(body);

        log('CARD DOM COUNT:', cardCount);

        if (!cardCount) {
            return null;
        }

        log('ROW BUILT');

        return row;
    }

    function findLines(root) {
        if (!root || !root.find) return [];

        return root.find('.items-line').toArray();
    }

    function lineTitle(line) {
        try {
            return $(line)
                .find('.items-line__title')
                .first()
                .text()
                .trim()
                .toLowerCase();
        } catch (e) {
            return '';
        }
    }

    function insertRow(root, row) {
        var lines = findLines(root);

        var similar = null;
        var recommendations = null;
        var director = null;
        var actors = null;

        for (var i = 0; i < lines.length; i++) {
            var title = lineTitle(lines[i]);

            if (
                title === 'похожие' ||
                title.indexOf('похожие') !== -1
            ) {
                similar = lines[i];
            }

            if (
                title === 'рекомендации' ||
                title.indexOf('рекомендации') !== -1
            ) {
                recommendations = lines[i];
            }

            if (
                title === 'режиссёр' ||
                title === 'режиссер' ||
                title.indexOf('режисс') !== -1
            ) {
                director = lines[i];
            }

            if (
                title === 'актёры' ||
                title === 'актеры' ||
                title.indexOf('актёр') !== -1 ||
                title.indexOf('актер') !== -1
            ) {
                actors = lines[i];
            }

            log(
                'DOM LINE:',
                i,
                'title="' + title + '"'
            );
        }

        if (similar) {
            $(row).insertAfter(similar);
            log('ROW INSERTED AFTER Похожие');
        } else if (recommendations) {
            $(row).insertBefore(recommendations);
            log('ROW INSERTED BEFORE Рекомендации');
        } else if (director) {
            $(row).insertBefore(director);
            log('ROW INSERTED BEFORE Режиссёр');
        } else if (actors) {
            $(row).insertBefore(actors);
            log('ROW INSERTED BEFORE Актёры');
        } else {
            root.append(row);
            log('ROW APPENDED TO ROOT');
        }

        log('ROW CONNECTED:', !!row.closest('body').length);

        return true;
    }

    function renderResults(results, event) {
        if (!results || !results.length) {
            error('NO RESULTS TO RENDER');
            return;
        }

        var activity =
            event &&
            event.object &&
            event.object.activity;

        if (!activity ||
            typeof activity.render !== 'function') {
            error('ACTIVITY RENDER NOT FOUND');
            return;
        }

        var root = activity.render();

        if (!root || !root.find) {
            error('ROOT NOT FOUND');
            return;
        }

        var old = root.find(
            '.kp-recommendations-line[data-kp-ui-version="' +
            VERSION +
            '"]'
        );

        if (old.length) {
            old.remove();
            log('OLD ROW REMOVED');
        }

        var row = createRow(results);

        if (!row) {
            error('ROW BUILD FAILED');
            return;
        }

        insertRow(root, row);

        log(
            'ROW CARD COUNT:',
            row.find('.card').length
        );

        /*
         * Иногда Lampa перерисовывает detail page сразу после
         * activity.render(). Поэтому повторно проверяем DOM.
         */
        var attempts = 0;

        var timer = setInterval(function () {
            attempts++;

            var currentRoot =
                activity.render &&
                activity.render();

            if (!currentRoot || !currentRoot.find) {
                if (attempts >= 10) {
                    clearInterval(timer);
                }
                return;
            }

            var exists = currentRoot.find(
                '.kp-recommendations-line[data-kp-ui-version="' +
                VERSION +
                '"]'
            );

            if (!exists.length) {
                log('DOM WATCH: ROW DISAPPEARED — REINSERT');

                insertRow(currentRoot, row);
            } else {
                log(
                    'DOM WATCH #' + attempts +
                    ': ROW PRESENT, CARDS=' +
                    exists.find('.card').length
                );
            }

            if (attempts >= 10) {
                clearInterval(timer);
            }
        }, 500);
    }

    function loadRecommendations(event) {
        var card = getCurrentCard(event);

        if (!card) {
            error('CURRENT CARD NOT FOUND');
            return;
        }

        log('CURRENT CARD:', card);

        var imdbId = getImdbId(card);

        if (!imdbId) {
            error('IMDB ID NOT FOUND');
            return;
        }

        log('IMDB FOUND:', imdbId);

        loadKPSource(function () {
            findKPIdByIMDb(imdbId, function (kpId) {
                if (!kpId) {
                    error('FINAL KP ID NOT FOUND');
                    return;
                }

                log('FINAL KP ID:', kpId);

                var params = {
                    card: {
                        source: 'KP',
                        id: 'KP_' + kpId,
                        kinopoisk_id: kpId,
                        title: card.title || '',
                        type: card.type || 'movie'
                    }
                };

                log('KP FULL START:', kpId);

                var started = Date.now();

                try {
                    Lampa.Api.sources.KP.full(
                        params,
                        function (response) {
                            log(
                                'KP FULL COMPLETE:',
                                Date.now() - started + 'ms'
                            );

                            log('KP FULL RESPONSE:', response);

                            var results =
                                response &&
                                response.simular &&
                                Array.isArray(response.simular.results)
                                    ? response.simular.results
                                    : [];

                            log('RAW SIMILAR COUNT:', results.length);
                            log('SIMILAR ITEMS:', results);

                            if (!results.length) {
                                error('SIMILAR RESULTS EMPTY');
                                return;
                            }

                            renderResults(results, event);

                            log(
                                'TOTAL:',
                                Date.now() - started + 'ms'
                            );
                        },
                        function (a, b) {
                            error('KP FULL ERROR:', a, b);
                        }
                    );
                } catch (e) {
                    error('KP FULL EXCEPTION:', e);
                }
            });
        });
    }

    function install() {
        if (!window.Lampa ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !== 'function') {
            return false;
        }

        if (window.__kp_ui_154_installed) {
            return true;
        }

        window.__kp_ui_154_installed = true;

        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite') {
                return;
            }

            if (!event.object ||
                !event.object.activity) {
                return;
            }

            log('FULL COMPLETE EVENT');

            setTimeout(function () {
                try {
                    loadRecommendations(event);
                } catch (e) {
                    error('PIPELINE ERROR:', e);
                }
            }, 50);
        });

        log('PLUGIN INSTALLED');

        return true;
    }

    var attempts = 0;

    var installTimer = setInterval(function () {
        if (install() || ++attempts >= 120) {
            clearInterval(installTimer);
        }
    }, 500);

}());
