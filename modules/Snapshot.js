(function() {

    "use strict";

    var crossfilter = require('crossfilter'),
        _           = require('underscore');

    /**
     * @module Snapshot
     * @constructor
     */
    var Snapshot = function() {};

    /**
     * @property prototype
     * @type {Object}
     */
    Snapshot.prototype = {

        /**
         * @property crossfilter
         * @type {Array}
         */
        crossfilter: null,

        /**
         * @property dimensions
         * @type {Object}
         */
        dimensions: {},

        /**
         * @property socket
         * @type {Object}
         */
        socket: null,

        /**
         * @property perPage
         * @type {Number}
         */
        perPage: 0,

        /**
         * @property pageNumber
         * @type {Number}
         */
        pageNumber: 0,

        /**
         * @property sorting
         * @type {Object}
         */
        sorting: {
            key         : '',
            direction   : 'ascending'
        },

        /**
         * @method bootstrap
         * @param socket {Object}
         * @return {void}
         */
        bootstrap: function bootstrap(socket) {

            // Keep a reference to the socket for emitting purposes.
            this.socket = socket;

            /**
             * @on snapshot/perPage
             */
            socket.on('snapshot/perPage', function (data) {
                this.setPerPage(data);
            }.bind(this));

            /**
             * @on snapshot/pageNumber
             */
            socket.on('snapshot/pageNumber', function (data) {
                this.setPageNumber(data);
            }.bind(this));

            /**
             * @on snapshot/sortBy
             */
            socket.on('snapshot/sortBy', function (data) {
                this.setSortBy(data);
            }.bind(this));

        },

        /**
         * @method setCollection
         * @param collection {Array}
         * @return {void}
         */
        setCollection: function setCollection(collection) {

            this.crossfilter    = crossfilter(collection);
            var keys            = _.keys(collection[0]);

            _.forEach(keys, function(key) {

                // Iterate over each key found in the first model, and create a
                // dimension for it.
                this.dimensions[key] = this.crossfilter.dimension(function(model) {
                    return model[key];
                });

            }.bind(this));

            // Emit the `snapshot/contentUpdated` event because we've loaded
            // the collection into memory.
            this._emitContentUpdated();

        },

        /**
         * @method _emitContentUpdated
         * @emit snapshot/contentUpdated
         * Responsible for generating the content and firing the event to notify
         * the client of the current collection of models.
         * @private
         */
        _emitContentUpdated: function _emitContentUpdated() {

            if (!this.crossfilter) {
                // Don't attempt to fetch the content if we haven't loaded the
                // Crossfilter yet.
                return;
            }

            // Determine whether to use `top` or `bottom` depending on direction.
            var sortingMethod = 'top';
            if (_.contains(['ascending', 'ascend', 'asc'], this.sorting.direction)) {
                sortingMethod = 'bottom';
            }

            var start       = new Date().getTime(),
                content     = this.dimensions[this.sorting.key][sortingMethod](Infinity),
                totalModels = content.length,
                totalPages  = (totalModels / this.perPage < 0) ?
                              0 : Math.ceil(totalModels / this.perPage);

            if (this.perPage !== 0) {

                // Slice up the content according to the `pageNumber` and `perPage`.
                var pageNumber  = (this.pageNumber - 1);
                var offset      = (pageNumber * this.perPage);
                content         = content.slice(offset, this.perPage + offset);

            }

            // Emits the event, passing the collection of models, and the time the
            // operation took the complete.
            this.socket.emit('snapshot/contentUpdated', {
                models: content,
                statistics: {
                    totalPages      : isFinite(totalPages) ? totalPages : 1,
                    totalModels     : totalModels,
                    currentPage     : this.pageNumber,
                    visibleModels   : content.length,
                    perPage         : this.perPage || totalModels,
                    sortKey         : this.sorting.key,
                    sortDirection   : this.sorting.direction
                },
                debug: {
                    responseTime: (new Date().getTime() - start)
                }
            });

        },

        /**
         * @method setPerPage
         * @emit snapshot/contentUpdated
         * @param value {Number}
         * @return {void}
         */
        setPerPage: function setPerPage(perPage) {
            this.perPage = perPage;
            this._emitContentUpdated();
        },

        /**
         * @method setPageNumber
         * @emit snapshot/contentUpdated
         * @param value {Number}
         * @return {void}
         */
        setPageNumber: function setPageNumber(pageNumber) {
            this.pageNumber = pageNumber;
            this._emitContentUpdated();
        },

        /**
         * @method setSortBy
         * @emit snapshot/contentUpdated
         * @param options {Array}
         * @return {void}
         */
        setSortBy: function setSortBy(options) {

            /**
             * @method invertDirection
             * Responsible for inverting the current sort direction if it hasn't
             * been explicitly specified.
             * @return {void}
             */
            var invertDirection = function invertDirection() {
                return (this.sorting.direction === 'ascending') ? 'descending' : 'ascending';
            }.bind(this);

            this.sorting = {
                key         : options.key,
                direction   : options.direction || invertDirection()
            };

            this._emitContentUpdated();

        },

        /**
         * @method applyFilter
         * @param key {String}
         * @param filterMethod {Function}
         * @emit snapshot/contentUpdated
         * Responsible for applying a filter on any given dimension by its key name.
         * @return {void}
         */
        applyFilter: function applyFilter(key, filterMethod) {

            var dimension = this.dimensions[key];
            this.clearFilter(key);
            filterMethod.call(this, dimension);
            this._emitContentUpdated();

        },

        /**
         * @method clearFilter
         * @param key {String}
         * @emit snapshot/contentUpdated
         * Responsible for clearing a filter based on its key.
         * @return {void}
         */
        clearFilter: function clearFilter(key) {

            var dimension = this.dimensions[key];
            dimension.filterAll();
            this._emitContentUpdated();

        },

        /**
         * @method clearFilters
         * @emit snapshot/contentUpdated
         * Responsible for clearing the filters of every single dimension.
         * @return {void}
         */
        clearFilters: function clearFilters() {
            _.forEach(this.dimensions, function(dimension) {
                dimension.filterAll();
            });
            this._emitContentUpdated();
        }

    };

    module.exports = new Snapshot();

})();