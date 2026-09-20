(function () {
    'use strict';

    var PREFIX = '[KP TEST]';

    function log() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX);
        console.log.apply(console, args);
    }

    function error() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(PREFIX + ' ERROR');
        console.error.apply(console, args);
    }

    /*
     * =========================================================
     * LOAD KP SOURCE
     * =========================================================
     */

    function loadKPSource(callback) {
        var Lampa = window.Lampa;

        if (!Lampa) {
            error('Lampa not ready');
            return;
        }

        /*
         * Уже установлен.
         */

        if (
            Lampa.Api &&
            Lampa.Api.sources &&
            Lampa.Api.sources.KP
        ) {
            log('kp_source already installed');

            callback(
                Lampa.Api.sources.KP
            );

            return;
        }

        log(
            'Loading kp_source.js...'
        );

        var script =
            document.createElement('script');

        script.src =
            'https://nb557.github.io/plugins/kp_source.js';

        script.onload = function () {
            log(
                'kp_source.js loaded'
            );

            /*
             * kp_source может зарегистрироваться
             * не мгновенно.
             */

            var attempts = 0;

            var timer =
                setInterval(
                    function () {
                        if (
                            Lampa.Api &&
                            Lampa.Api.sources &&
                            Lampa.Api.sources.KP
                        ) {
                            clearInterval(
                                timer
                            );

                            log(
                                'KP source registered'
                            );

                            callback(
                                Lampa.Api.sources.KP
                            );

                            return;
                        }

                        attempts++;

                        if (
                            attempts >= 40
                        ) {
                            clearInterval(
                                timer
                            );

                            error(
                                'KP source was not registered'
                            );
                        }
                    },
                    250
                );
        };

        script.onerror = function () {
            error(
                'Cannot load kp_source.js'
            );
        };

        document.head.appendChild(
            script
        );
    }


    /*
     * =========================================================
     * GET CARD
     * =========================================================
     */

    function getCard(root) {
        var title = '';

        var selectors = [
            '.full-start__title',
            '.full-start-new__title',
            '.full-start__name',
            '.full-start-new__name'
        ];

        for (
            var i = 0;
            i < selectors.length;
            i++
        ) {
            var element =
                root.find(
                    selectors[i]
                );

            if (
                element.length &&
                element.text()
            ) {
                title =
                    element
                        .first()
                        .text()
                        .trim();

                if (title) break;
            }
        }

        if (!title) {
            var h1 =
                root.find('h1')
                    .first();

            if (
                h1.length &&
                h1.text()
            ) {
                title =
                    h1.text()
                        .trim();
            }
        }

        var year = '';

        var text =
            root.text();

        var match =
            text.match(
                /\b(19|20)\d{2}\b/
            );

        if (match) {
            year = match[0];
        }

        return {
            title: title,
            year: year
        };
    }


    /*
     * =========================================================
     * SEARCH KP
     * =========================================================
     */

    function searchKP(
        KP,
        card
    ) {
        if (
            !KP ||
            typeof KP.discovery !==
                'function'
        ) {
            error(
                'KP.discovery() unavailable'
            );

            return;
        }

        var discovery;

        try {
            discovery =
                KP.discovery();
        } catch (e) {
            error(
                'KP.discovery() failed',
                e
            );

            return;
        }

        if (
            !discovery ||
            typeof discovery.search !==
                'function'
        ) {
            error(
                'KP discovery.search() unavailable'
            );

            return;
        }

        log(
            'Searching:',
            card.title,
            card.year
        );

        discovery.search(
            {
                query:
                    encodeURIComponent(
                        card.title
                    ),

                page: 1
            },

            function (data) {
                log(
                    'SEARCH RESPONSE:',
                    data
                );

                var results = [];

                if (
                    Array.isArray(data)
                ) {
                    data.forEach(
                        function (part) {
                            if (
                                part &&
                                Array.isArray(
                                    part.results
                                )
                            ) {
                                results =
                                    results.concat(
                                        part.results
                                    );
                            }
                        }
                    );
                }

                log(
                    'SEARCH RESULTS:',
                    results.length
                );

                if (!results.length) {
                    error(
                        'Nothing found'
                    );

                    return;
                }

                /*
                 * Показываем первые результаты.
                 */

                results
                    .slice(0, 10)
                    .forEach(
                        function (
                            item,
                            index
                        ) {
                            log(
                                'RESULT #' +
                                index,
                                {
                                    title:
                                        item.title,

                                    original:
                                        item.original_title,

                                    year:
                                        item.release_date ||
                                        item.first_air_date,

                                    kp_id:
                                        item.kinopoisk_id,

                                    item:
                                        item
                                }
                            );
                        }
                    );

                /*
                 * Ищем совпадение.
                 */

                var selected =
                    results[0];

                var normalized =
                    card.title
                        .toLowerCase();

                for (
                    var i = 0;
                    i < results.length;
                    i++
                ) {
                    var title =
                        String(
                            results[i].title ||
                            ''
                        ).toLowerCase();

                    if (
                        title ===
                        normalized
                    ) {
                        selected =
                            results[i];

                        break;
                    }
                }

                log(
                    'SELECTED:',
                    selected
                );

                if (
                    !selected ||
                    !selected.kinopoisk_id
                ) {
                    error(
                        'No kinopoisk_id'
                    );

                    return;
                }

                log(
                    'KINOPOSK ID:',
                    selected.kinopoisk_id
                );

                getFull(
                    KP,
                    selected
                );
            },

            function (
                a,
                b
            ) {
                error(
                    'KP SEARCH ERROR',
                    a,
                    b
                );
            }
        );
    }


    /*
     * =========================================================
     * GET FULL
     * =========================================================
     */

    function getFull(
        KP,
        card
    ) {
        log(
            'Calling KP.full()...'
        );

        KP.full(
            {
                card: card
            },

            function (json) {
                log(
                    'FULL RESPONSE:',
                    json
                );

                if (!json) {
                    error(
                        'Empty full response'
                    );

                    return;
                }

                if (
                    json.simular &&
                    Array.isArray(
                        json.simular.results
                    )
                ) {
                    log(
                        '================================'
                    );

                    log(
                        'SUCCESS!'
                    );

                    log(
                        'SIMILAR COUNT:',
                        json.simular
                            .results
                            .length
                    );

                    log(
                        'SIMILARS:',
                        json.simular
                            .results
                    );

                    log(
                        '================================'
                    );
                } else {
                    error(
                        'No simular.results'
                    );
                }
            },

            function (
                a,
                b
            ) {
                error(
                    'KP FULL ERROR',
                    a,
                    b
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
        var Lampa =
            window.Lampa;

        if (
            !Lampa ||
            !Lampa.Listener ||
            typeof Lampa.Listener.follow !==
                'function'
        ) {
            return false;
        }

        if (
            window.kpTestInstalled
        ) {
            return true;
        }

        window.kpTestInstalled =
            true;

        log(
            'KP TEST PLUGIN INSTALLED'
        );

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

                var activity =
                    event.object &&
                    event.object.activity;

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

                setTimeout(
                    function () {
                        var card =
                            getCard(
                                root
                            );

                        log(
                            'CURRENT CARD:',
                            card
                        );

                        if (!card.title) {
                            error(
                                'Cannot detect title'
                            );

                            return;
                        }

                        loadKPSource(
                            function (
                                KP
                            ) {
                                searchKP(
                                    KP,
                                    card
                                );
                            }
                        );
                    },
                    500
                );
            }
        );

        return true;
    }


    /*
     * =========================================================
     * WAIT FOR LAMPA
     * =========================================================
     */

    if (!install()) {
        var attempts = 0;

        var timer =
            setInterval(
                function () {
                    if (
                        install() ||
                        ++attempts >= 120
                    ) {
                        clearInterval(
                            timer
                        );
                    }
                },
                500
            );
    }

})();
