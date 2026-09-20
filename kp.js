(function () {
    'use strict';

    var VERSION = '1.6.1';
    var KP_SOURCE_URL = 'https://nb557.github.io/plugins/kp_source.js';
    var loading = false;
    var mounted = false;

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[KP recommendations v' + VERSION + ']');
        console.log.apply(console, args);
    }

    function fail() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[KP recommendations v' + VERSION + ']');
        console.error.apply(console, args);
    }

    function waitFor(check, done, timeout) {
        var started = Date.now();

        (function tick() {
            var value = false;
            try {
                value = check();
            } catch (error) {
                fail('WAIT CHECK ERROR:', error);
            }

            if (value || Date.now() - started >= timeout) {
                done(value || null);
                return;
            }

            setTimeout(tick, 250);
        })();
    }

    function getCard(event) {
        var card = event && event.object && event.object.card;
        return card || (event && event.card) || null;
    }

    function loadKP(done) {
        if (window.kp_source_plugin && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.KP) {
            done(true);
            return;
        }

        var script = document.createElement('script');
        script.src = KP_SOURCE_URL + '?v=' + VERSION + '&t=' + Date.now();
        script.onload = function () {
            waitFor(function () {
                return window.kp_source_plugin && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.KP;
            }, done, 10000);
        };
        script.onerror = function (error) {
            fail('KP SOURCE SCRIPT ERROR:', error);
            done(false);
        };
        document.head.appendChild(script);
    }

    function resultsOf(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.results)) return data.results;
        if (data && data.body && Array.isArray(data.body.results)) return data.body.results;
        return [];
    }

    function kpId(item) {
        if (!item) return null;
        if (item.kinopoisk_id) return String(item.kinopoisk_id);
        if (!item.id) return null;

        var id = String(item.id);
        if (id.indexOf('KP_') === 0) return id.substring(3);
        return /^\d+$/.test(id) ? id : null;
    }

    function chooseResult(results, card) {
        var title = String(card.title || card.name || '').trim().toLowerCase();
        var year = card.year ? String(card.year) : '';

        for (var i = 0; i < results.length; i++) {
            var item = results[i];
            if (!item) continue;
            if (String(item.title || '').trim().toLowerCase() === title &&
                (!year || String(item.year || '') === year)) return item;
        }

        return results[0] || null;
    }

    function searchKP(card, done) {
        var KP = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.KP;
        var query = String(card.title || card.name || '').trim();
        if (!KP || typeof KP.discovery !== 'function' || !query) {
            fail('KP SEARCH IS NOT AVAILABLE');
            done(null);
            return;
        }

        try {
            KP.discovery().search({query: query, page: 1}, function (data) {
                done(kpId(chooseResult(resultsOf(data), card)));
            }, function (error) {
                fail('KP SEARCH ERROR:', error);
                done(null);
            });
        } catch (error) {
            fail('KP SEARCH EXCEPTION:', error);
            done(null);
        }
    }

    function loadSimilar(id, done) {
        var KP = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.KP;
        if (!KP || typeof KP.full !== 'function') {
            done([]);
            return;
        }

        try {
            KP.full({card: {
                source: 'KP',
                kinopoisk_id: String(id),
                id: 'KP_' + id,
                title: ''
            }}, function (data) {
                var items = data && data.simular && data.simular.results;
                done(Array.isArray(items) ? items : []);
            }, function (error) {
                fail('KP FULL ERROR:', error);
                done([]);
            });
        } catch (error) {
            fail('KP FULL EXCEPTION:', error);
            done([]);
        }
    }

    function prepare(items) {
        return items.filter(function (item) {
            return item && item.title;
        }).map(function (item) {
            item.source = 'KP';
            if (!item.kinopoisk_id && item.id) {
                var match = String(item.id).match(/^KP_(.+)$/);
                if (match) item.kinopoisk_id = match[1];
            }
            return item;
        });
    }

    function findRow(root, titles) {
        var found = $();
        root.find('.items-line').each(function () {
            var title = $(this).find('.items-line__title').first().text().trim().toLowerCase();
            if (titles.indexOf(title) !== -1) {
                found = $(this);
                return false;
            }
        });
        return found;
    }

    function insertionAnchor(root) {
        return findRow(root, ['рекомендации']);
    }

    function createLine(items) {
        if (!Lampa.Maker || typeof Lampa.Maker.make !== 'function') {
            fail('Lampa.Maker.make NOT FOUND');
            return null;
        }

        var line = Lampa.Maker.make('Line', {
            title: 'Рекомендации Кинопоиска',
            results: items
        });

        line.use({
            onInstance: function (card, data) {
                card.use({
                    onEnter: function () {
                        Lampa.Router.call('full', data);
                    },
                    onFocus: function () {
                        Lampa.Background.change(Lampa.Utils.cardImgBackground(data));
                    }
                });
            }
        });

        line.create();
        return line;
    }

    function mount(root, items) {
        if (mounted) return;

        var anchor = insertionAnchor(root);
        if (!anchor.length) {
            fail('NATIVE RECOMMENDATIONS NOT FOUND');
            return;
        }

        var line;
        try {
            line = createLine(items);
        } catch (error) {
            fail('LINE CREATE ERROR:', error);
            return;
        }

        if (!line) return;

        var element = line.render();
        if (!element || !element[0]) {
            fail('LINE ELEMENT NOT FOUND');
            return;
        }

        anchor[0].parentNode.insertBefore(element[0], anchor[0].nextSibling);
        mounted = true;
        log('MOUNTED AFTER:', anchor.find('.items-line__title').first().text().trim());
    }

    function start(event, root) {
        if (loading || mounted) return;
        var card = getCard(event);
        if (!card) {
            fail('CURRENT CARD NOT FOUND');
            return;
        }

        loading = true;
        loadKP(function (ready) {
            if (!ready) {
                fail('KP SOURCE TIMEOUT');
                loading = false;
                return;
            }

            searchKP(card, function (id) {
                if (!id) {
                    fail('KP ID NOT FOUND');
                    loading = false;
                    return;
                }

                loadSimilar(id, function (items) {
                    items = prepare(items);
                    if (!items.length) fail('NO KP SIMILAR RESULTS');
                    else mount(root, items);
                    loading = false;
                });
            });
        });
    }

    function onFull(event) {
        if (!event || event.type !== 'complite') return;
        mounted = false;
        loading = false;

        var activity = event.object && event.object.activity;
        var root = activity && typeof activity.render === 'function' && activity.render();
        if (!root || !root.find) {
            fail('FULL ROOT NOT FOUND');
            return;
        }

        // The native recommendations row can arrive after the `complite` event,
        // especially on TV hardware.  Never mount before it: KP must follow it.
        waitFor(function () {
            return insertionAnchor(root).length ? root : false;
        }, function (readyRoot) {
            if (!readyRoot) {
                fail('INSERTION POINT TIMEOUT');
                return;
            }
            start(event, readyRoot);
        }, 30000);
    }

    if (window.__KP_RECOMMENDATIONS_160__) return;
    window.__KP_RECOMMENDATIONS_160__ = true;

    if (!Lampa.Listener || typeof Lampa.Listener.follow !== 'function') {
        fail('Lampa.Listener.follow NOT FOUND');
        return;
    }

    Lampa.Listener.follow('full', onFull);
    log('READY');
})();
