!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.hiloupe=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var BackboneEvents = _dereq_('backbone-events-standalone');
var classExtend = _dereq_('ampersand-class-extend');
var isArray = _dereq_('is-array');
var extend = _dereq_('extend-object');
var slice = [].slice;


function Collection(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator) this.comparator = options.comparator;
    if (options.parent) this.parent = options.parent;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) this.reset(models, extend({silent: true}, options));
}

extend(Collection.prototype, BackboneEvents, {
    initialize: function () {},

    mainIndex: 'id',

    indexes: [],

    isModel: function (model) {
        return this.model && model instanceof this.model;
    },

    add: function (models, options) {
        return this.set(models, extend({merge: false, add: true, remove: false}, options));
    },

    // overridable parse method
    parse: function (res, options) {
        return res;
    },

    // overridable serialize method
    serialize: function () {
        return this.map(function (model) {
            if (model.serialize) {
                return model.serialize();
            } else {
                var out = {};
                extend(out, model);
                delete out.collection;
                return out;
            }
        });
    },

    toJSON: function () {
        return this.serialize();
    },

    set: function (models, options) {
        options = extend({add: true, remove: true, merge: true}, options);
        if (options.parse) models = this.parse(models, options);
        var singular = !isArray(models);
        models = singular ? (models ? [models] : []) : models.slice();
        var id, model, attrs, existing, sort, i, length;
        var at = options.at;
        var sortable = this.comparator && (at == null) && options.sort !== false;
        var sortAttr = ('string' === typeof this.comparator) ? this.comparator : null;
        var toAdd = [], toRemove = [], modelMap = {};
        var add = options.add, merge = options.merge, remove = options.remove;
        var order = !sortable && add && remove ? [] : false;
        var targetProto = this.model && this.model.prototype || Object.prototype;

        // Turn bare objects into model references, and prevent invalid models
        // from being added.
        for (i = 0, length = models.length; i < length; i++) {
            attrs = models[i] || {};
            if (this.isModel(attrs)) {
                id = model = attrs;
            } else if (targetProto.generateId) {
                id = targetProto.generateId(attrs);
            } else {
                id = attrs[targetProto.idAttribute || 'id'];
            }

            // If a duplicate is found, prevent it from being added and
            // optionally merge it into the existing model.
            if (existing = this.get(id)) {
                if (remove) modelMap[existing.cid || existing.id] = true;
                if (merge) {
                    attrs = attrs === model ? model.attributes : attrs;
                    if (options.parse) attrs = existing.parse(attrs, options);
                    // if this is model
                    if (existing.set) {
                        existing.set(attrs, options);
                        if (sortable && !sort && existing.hasChanged(sortAttr)) sort = true;
                    } else {
                        // if not just update the properties
                        extend(existing, attrs);
                    }
                }
                models[i] = existing;

            // If this is a new, valid model, push it to the `toAdd` list.
            } else if (add) {
                model = models[i] = this._prepareModel(attrs, options);
                if (!model) continue;
                toAdd.push(model);
                this._addReference(model, options);
            }

            // Do not add multiple models with the same `id`.
            model = existing || model;
            if (!model) continue;
            if (order && ((model.isNew && model.isNew() || !model.id) || !modelMap[model.cid || model.id])) order.push(model);
            modelMap[model.id] = true;
        }

        // Remove nonexistent models if appropriate.
        if (remove) {
            for (i = 0, length = this.length; i < length; i++) {
                model = this.models[i];
                if (!modelMap[model.cid || model.id]) toRemove.push(model);
            }
            if (toRemove.length) this.remove(toRemove, options);
        }

        // See if sorting is needed, update `length` and splice in new models.
        if (toAdd.length || (order && order.length)) {
            if (sortable) sort = true;
            if (at != null) {
                for (i = 0, length = toAdd.length; i < length; i++) {
                    this.models.splice(at + i, 0, toAdd[i]);
                }
            } else {
                var orderedModels = order || toAdd;
                for (i = 0, length = orderedModels.length; i < length; i++) {
                    this.models.push(orderedModels[i]);
                }
            }
        }

        // Silently sort the collection if appropriate.
        if (sort) this.sort({silent: true});

        // Unless silenced, it's time to fire all appropriate add/sort events.
        if (!options.silent) {
            for (i = 0, length = toAdd.length; i < length; i++) {
                model = toAdd[i];
                if (model.trigger) {
                    model.trigger('add', model, this, options);
                } else {
                    this.trigger('add', model, this, options);
                }
            }
            if (sort || (order && order.length)) this.trigger('sort', this, options);
        }

        // Return the added (or merged) model (or models).
        return singular ? models[0] : models;
    },

    get: function (query, indexName) {
        if (!query) return;
        var index = this._indexes[indexName || this.mainIndex];
        return index[query] || index[query.id] || this._indexes.cid[query.cid];
    },

    // Get the model at the given index.
    at: function (index) {
        return this.models[index];
    },

    remove: function (models, options) {
        var singular = !isArray(models);
        var i, length, model, index;

        models = singular ? [models] : slice.call(models);
        options || (options = {});
        for (i = 0, length = models.length; i < length; i++) {
            model = models[i] = this.get(models[i]);
            if (!model) continue;
            this._deIndex(model);
            index = this.models.indexOf(model);
            this.models.splice(index, 1);
            if (!options.silent) {
                options.index = index;
                if (model.trigger) {
                    model.trigger('remove', model, this, options);
                } else {
                    this.trigger('remove', model, this, options);
                }
            }
            this._removeReference(model, options);
        }
        return singular ? models[0] : models;
    },

    // When you have more items than you want to add or remove individually,
    // you can reset the entire set with a new list of models, without firing
    // any granular `add` or `remove` events. Fires `reset` when finished.
    // Useful for bulk operations and optimizations.
    reset: function (models, options) {
        options || (options = {});
        for (var i = 0, length = this.models.length; i < length; i++) {
            this._removeReference(this.models[i], options);
        }
        options.previousModels = this.models;
        this._reset();
        models = this.add(models, extend({silent: true}, options));
        if (!options.silent) this.trigger('reset', this, options);
        return models;
    },

    sort: function (options) {
        var self = this;
        if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
        options || (options = {});

        if (typeof this.comparator === 'string') {
            this.models.sort(function (left, right) {
                if (left.get) {
                    left = left.get(self.comparator);
                    right = right.get(self.comparator);
                } else {
                    left = left[self.comparator];
                    right = right[self.comparator];
                }
                if (left > right || left === void 0) return 1;
                if (left < right || right === void 0) return -1;
                return 0;
            });
        } else if (this.comparator.length === 1) {
            this.models.sort(function (left, right) {
                left = self.comparator(left);
                right = self.comparator(right);
                if (left > right || left === void 0) return 1;
                if (left < right || right === void 0) return -1;
                return 0;
            });
        } else {
            this.models.sort(this.comparator.bind(this));
        }

        if (!options.silent) this.trigger('sort', this, options);
        return this;
    },

    // Private method to reset all internal state. Called when the collection
    // is first initialized or reset.
    _reset: function () {
        var list = this.indexes || [];
        var i = 0;
        list.push(this.mainIndex);
        list.push('cid');
        var l = list.length;
        this.models = [];
        this._indexes = {};
        for (; i < l; i++) {
            this._indexes[list[i]] = {};
        }
    },

    _prepareModel: function (attrs, options) {
        // if we haven't defined a constructor, skip this
        if (!this.model) return attrs;

        if (this.isModel(attrs)) {
            return attrs;
        } else {
            options = options ? extend({}, options) : {};
            options.collection = this;
            return new this.model(attrs, options);
        }
    },

    _deIndex: function (model) {
        for (var name in this._indexes) {
            delete this._indexes[name][model[name] || (model.get && model.get(name))];
        }
    },

    _index: function (model) {
        for (var name in this._indexes) {
            var indexVal = model[name] || (model.get && model.get(name));
            if (indexVal) this._indexes[name][indexVal] = model;
        }
    },

    // Internal method to create a model's ties to a collection.
    _addReference: function (model, options) {
        this._index(model);
        if (!model.collection) model.collection = this;
        if (model.on) model.on('all', this._onModelEvent, this);
    },

        // Internal method to sever a model's ties to a collection.
    _removeReference: function (model, options) {
        if (this === model.collection) delete model.collection;
        this._deIndex(model);
        if (model.off) model.off('all', this._onModelEvent, this);
    },

    _onModelEvent: function (event, model, collection, options) {
        if ((event === 'add' || event === 'remove') && collection !== this) return;
        if (event === 'destroy') this.remove(model, options);
        if (model && event === 'change:' + model.idAttribute) {
            this._deIndex(model);
            this._index(model);
        }
        this.trigger.apply(this, arguments);
    }
});

Object.defineProperties(Collection.prototype, {
    length: {
        get: function () {
            return this.models.length;
        }
    },
    isCollection: {
        value: true
    }
});

var arrayMethods = [
    'indexOf',
    'lastIndexOf',
    'every',
    'some',
    'forEach',
    'map',
    'filter',
    'reduce',
    'reduceRight'
];

arrayMethods.forEach(function (method) {
    Collection.prototype[method] = function () {
        return this.models[method].apply(this.models, arguments);
    };
});

// alias each/forEach for maximum compatibility
Collection.prototype.each = Collection.prototype.forEach;

Collection.extend = classExtend;

module.exports = Collection;

},{"ampersand-class-extend":2,"backbone-events-standalone":4,"extend-object":5,"is-array":6}],2:[function(_dereq_,module,exports){
var objectExtend = _dereq_('extend-object');


/// Following code is largely pasted from Backbone.js

// Helper function to correctly set up the prototype chain, for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
var extend = function(protoProps) {
    var parent = this;
    var child;
    var args = [].slice.call(arguments);

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && protoProps.hasOwnProperty('constructor')) {
        child = protoProps.constructor;
    } else {
        child = function () {
            return parent.apply(this, arguments);
        };
    }

    // Add static properties to the constructor function from parent
    objectExtend(child, parent);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate();

    // Mix in all prototype properties to the subclass if supplied.
    if (protoProps) {
        args.unshift(child.prototype);
        objectExtend.apply(null, args);
    }

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
};

// Expose the extend function
module.exports = extend;

},{"extend-object":5}],3:[function(_dereq_,module,exports){
/**
 * Standalone extraction of Backbone.Events, no external dependency required.
 * Degrades nicely when Backone/underscore are already available in the current
 * global context.
 *
 * Note that docs suggest to use underscore's `_.extend()` method to add Events
 * support to some given object. A `mixin()` method has been added to the Events
 * prototype to avoid using underscore for that sole purpose:
 *
 *     var myEventEmitter = BackboneEvents.mixin({});
 *
 * Or for a function constructor:
 *
 *     function MyConstructor(){}
 *     MyConstructor.prototype.foo = function(){}
 *     BackboneEvents.mixin(MyConstructor.prototype);
 *
 * (c) 2009-2013 Jeremy Ashkenas, DocumentCloud Inc.
 * (c) 2013 Nicolas Perriault
 */
/* global exports:true, define, module */
(function() {
  var root = this,
      breaker = {},
      nativeForEach = Array.prototype.forEach,
      hasOwnProperty = Object.prototype.hasOwnProperty,
      slice = Array.prototype.slice,
      idCounter = 0;

  // Returns a partial implementation matching the minimal API subset required
  // by Backbone.Events
  function miniscore() {
    return {
      keys: Object.keys,

      uniqueId: function(prefix) {
        var id = ++idCounter + '';
        return prefix ? prefix + id : id;
      },

      has: function(obj, key) {
        return hasOwnProperty.call(obj, key);
      },

      each: function(obj, iterator, context) {
        if (obj == null) return;
        if (nativeForEach && obj.forEach === nativeForEach) {
          obj.forEach(iterator, context);
        } else if (obj.length === +obj.length) {
          for (var i = 0, l = obj.length; i < l; i++) {
            if (iterator.call(context, obj[i], i, obj) === breaker) return;
          }
        } else {
          for (var key in obj) {
            if (this.has(obj, key)) {
              if (iterator.call(context, obj[key], key, obj) === breaker) return;
            }
          }
        }
      },

      once: function(func) {
        var ran = false, memo;
        return function() {
          if (ran) return memo;
          ran = true;
          memo = func.apply(this, arguments);
          func = null;
          return memo;
        };
      }
    };
  }

  var _ = miniscore(), Events;

  // Backbone.Events
  // ---------------

  // A module that can be mixed in to *any object* in order to provide it with
  // custom events. You may bind with `on` or remove with `off` callback
  // functions to an event; `trigger`-ing an event fires all callbacks in
  // succession.
  //
  //     var object = {};
  //     _.extend(object, Backbone.Events);
  //     object.on('expand', function(){ alert('expanded'); });
  //     object.trigger('expand');
  //
  Events = {

    // Bind an event to a `callback` function. Passing `"all"` will bind
    // the callback to all events fired.
    on: function(name, callback, context) {
      if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
      this._events || (this._events = {});
      var events = this._events[name] || (this._events[name] = []);
      events.push({callback: callback, context: context, ctx: context || this});
      return this;
    },

    // Bind an event to only be triggered a single time. After the first time
    // the callback is invoked, it will be removed.
    once: function(name, callback, context) {
      if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
      var self = this;
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }

      names = name ? [name] : _.keys(this._events);
      for (i = 0, l = names.length; i < l; i++) {
        name = names[i];
        if (events = this._events[name]) {
          this._events[name] = retain = [];
          if (callback || context) {
            for (j = 0, k = events.length; j < k; j++) {
              ev = events[j];
              if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                  (context && context !== ev.context)) {
                retain.push(ev);
              }
            }
          }
          if (!retain.length) delete this._events[name];
        }
      }

      return this;
    },

    // Trigger one or many events, firing all bound callbacks. Callbacks are
    // passed the same arguments as `trigger` is, apart from the event name
    // (unless you're listening on `"all"`, which will cause your callback to
    // receive the true name of the event as the first argument).
    trigger: function(name) {
      if (!this._events) return this;
      var args = slice.call(arguments, 1);
      if (!eventsApi(this, 'trigger', name, args)) return this;
      var events = this._events[name];
      var allEvents = this._events.all;
      if (events) triggerEvents(events, args);
      if (allEvents) triggerEvents(allEvents, arguments);
      return this;
    },

    // Tell this object to stop listening to either specific events ... or
    // to every object it's currently listening to.
    stopListening: function(obj, name, callback) {
      var listeners = this._listeners;
      if (!listeners) return this;
      var deleteListener = !name && !callback;
      if (typeof name === 'object') callback = this;
      if (obj) (listeners = {})[obj._listenerId] = obj;
      for (var id in listeners) {
        listeners[id].off(name, callback, this);
        if (deleteListener) delete this._listeners[id];
      }
      return this;
    }

  };

  // Regular expression used to split event strings.
  var eventSplitter = /\s+/;

  // Implement fancy features of the Events API such as multiple event
  // names `"change blur"` and jQuery-style event maps `{change: action}`
  // in terms of the existing API.
  var eventsApi = function(obj, action, name, rest) {
    if (!name) return true;

    // Handle event maps.
    if (typeof name === 'object') {
      for (var key in name) {
        obj[action].apply(obj, [key, name[key]].concat(rest));
      }
      return false;
    }

    // Handle space separated event names.
    if (eventSplitter.test(name)) {
      var names = name.split(eventSplitter);
      for (var i = 0, l = names.length; i < l; i++) {
        obj[action].apply(obj, [names[i]].concat(rest));
      }
      return false;
    }

    return true;
  };

  // A difficult-to-believe, but optimized internal dispatch function for
  // triggering events. Tries to keep the usual cases speedy (most internal
  // Backbone events have 3 arguments).
  var triggerEvents = function(events, args) {
    var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
    switch (args.length) {
      case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
      case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
      case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
      case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeners = this._listeners || (this._listeners = {});
      var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
      listeners[id] = obj;
      if (typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Mixin utility
  Events.mixin = function(proto) {
    var exports = ['on', 'once', 'off', 'trigger', 'stopListening', 'listenTo',
                   'listenToOnce', 'bind', 'unbind'];
    _.each(exports, function(name) {
      proto[name] = this[name];
    }, this);
    return proto;
  };

  // Export Events as BackboneEvents depending on current context
  if (typeof define === "function") {
    define(function() {
      return Events;
    });
  } else if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Events;
    }
    exports.BackboneEvents = Events;
  } else {
    root.BackboneEvents = Events;
  }
})(this);

},{}],4:[function(_dereq_,module,exports){
module.exports = _dereq_('./backbone-events-standalone');

},{"./backbone-events-standalone":3}],5:[function(_dereq_,module,exports){
var arr = [];
var each = arr.forEach;
var slice = arr.slice;


module.exports = function(obj) {
    each.call(slice.call(arguments, 1), function(source) {
        if (source) {
            for (var prop in source) {
                obj[prop] = source[prop];
            }
        }
    });
    return obj;
};

},{}],6:[function(_dereq_,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],7:[function(_dereq_,module,exports){
var _ = _dereq_('underscore');
var BBEvents = _dereq_('backbone-events-standalone');
var KeyTree = _dereq_('key-tree-store');
var arrayNext = _dereq_('array-next');
var changeRE = /^change:/;

function Base(attrs, options) {
    options || (options = {});
    this.cid = _.uniqueId('state');
    this._events = {};
    this._values = {};
    this._definition = Object.create(this._definition);
    if (options.parse) attrs = this.parse(attrs, options);
    this.parent = options.parent;
    this.collection = options.collection;
    this._keyTree = new KeyTree();
    this._initCollections();
    this._initChildren();
    this._cache = {};
    this._previousAttributes = {};
    if (attrs) this.set(attrs, _.extend({silent: true, initial: true}, options));
    this._changed = {};
    if (this._derived) this._initDerived();
    if (options.init !== false) this.initialize.apply(this, arguments);
}


_.extend(Base.prototype, BBEvents, {
    // can be allow, ignore, reject
    extraProperties: 'ignore',

    idAttribute: 'id',

    namespaceAttribute: 'namespace',

    typeAttribute: 'modelType',

    // Stubbed out to be overwritten
    initialize: function () {
        return this;
    },

    // Get ID of model per configuration.
    // Should *always* be how ID is determined by other code.
    getId: function () {
        return this[this.idAttribute];
    },

    // Get namespace of model per configuration.
    // Should *always* be how namespace is determined by other code.
    getNamespace: function () {
        return this[this.namespaceAttribute];
    },

    // Get type of model per configuration.
    // Should *always* be how type is determined by other code.
    getType: function () {
        return this[this.typeAttribute];
    },

    // A model is new if it has never been saved to the server, and lacks an id.
    isNew: function () {
        return this.getId() == null;
    },

    // get HTML-escaped value of attribute
    escape: function (attr) {
        return _.escape(this.get(attr));
    },

    // Check if the model is currently in a valid state.
    isValid: function (options) {
        return this._validate({}, _.extend(options || {}, { validate: true }));
    },

    // Parse can be used remap/restructure/rename incoming properties
    // before they are applied to attributes.
    parse: function (resp, options) {
        return resp;
    },

    // Serialize is the inverse of `parse` it lets you massage data
    // on the way out. Before, sending to server, for example.
    serialize: function () {
        var res = this.getAttributes({props: true}, true);
        _.each(this._children, function (value, key) {
            res[key] = this[key].serialize();
        }, this);
        _.each(this._collections, function (value, key) {
            res[key] = this[key].serialize();
        }, this);
        return res;
    },

    // Main set method used by generated setters/getters and can
    // be used directly if you need to pass options or set multiple
    // properties at once.
    set: function (key, value, options) {
        var self = this;
        var extraProperties = this.extraProperties;
        var triggers = [];
        var changing, changes, newType, newVal, def, cast, err, attr,
            attrs, dataType, silent, unset, currentVal, initial, hasChanged, isEqual;

        // Handle both `"key", value` and `{key: value}` -style arguments.
        if (_.isObject(key) || key === null) {
            attrs = key;
            options = value;
        } else {
            attrs = {};
            attrs[key] = value;
        }

        options = options || {};

        if (!this._validate(attrs, options)) return false;

        // Extract attributes and options.
        unset = options.unset;
        silent = options.silent;
        initial = options.initial;

        changes = [];
        changing = this._changing;
        this._changing = true;

        // if not already changing, store previous
        if (!changing) {
            this._previousAttributes = this.attributes;
            this._changed = {};
        }

        // For each `set` attribute...
        for (attr in attrs) {
            newVal = attrs[attr];
            newType = typeof newVal;
            currentVal = this._values[attr];
            def = this._definition[attr];


            if (!def) {
                // if this is a child model or collection
                if (this._children[attr] || this._collections[attr]) {
                    this[attr].set(newVal, options);
                    continue;
                } else if (extraProperties === 'ignore') {
                    continue;
                } else if (extraProperties === 'reject') {
                    throw new TypeError('No "' + attr + '" property defined on ' + (this.type || 'this') + ' model and extraProperties not set to "ignore" or "allow"');
                } else if (extraProperties === 'allow') {
                    def = this._createPropertyDefinition(attr, 'any');
                }
            }

            isEqual = this._getCompareForType(def.type);
            dataType = this._dataTypes[def.type];

            // check type if we have one
            if (dataType && dataType.set) {
                cast = dataType.set(newVal);
                newVal = cast.val;
                newType = cast.type;
            }

            // If we've defined a test, run it
            if (def.test) {
                err = def.test.call(this, newVal, newType);
                if (err) {
                    throw new TypeError('Property \'' + attr + '\' failed validation with error: ' + err);
                }
            }

            // If we are required but undefined, throw error.
            // If we are null and are not allowing null, throw error
            // If we have a defined type and the new type doesn't match, and we are not null, throw error.

            if (_.isUndefined(newVal) && def.required) {
                throw new TypeError('Required property \'' + attr + '\' must be of type ' + def.type + '. Tried to set ' + newVal);
            }
            if (_.isNull(newVal) && def.required && !def.allowNull) {
                throw new TypeError('Property \'' + attr + '\' must be of type ' + def.type + ' (cannot be null). Tried to set ' + newVal);
            }
            if ((def.type && def.type !== 'any' && def.type !== newType) && !_.isNull(newVal) && !_.isUndefined(newVal)) {
                throw new TypeError('Property \'' + attr + '\' must be of type ' + def.type + '. Tried to set ' + newVal);
            }
            if (def.values && !_.contains(def.values, newVal)) {
                throw new TypeError('Property \'' + attr + '\' must be one of values: ' + def.values.join(', '));
            }

            hasChanged = !isEqual(currentVal, newVal, attr);

            // enforce `setOnce` for properties if set
            if (def.setOnce && currentVal !== undefined && hasChanged) {
                throw new TypeError('Property \'' + key + '\' can only be set once.');
            }

            // keep track of changed attributes
            // and push to changes array
            if (hasChanged) {
                changes.push({prev: currentVal, val: newVal, key: attr});
                self._changed[attr] = newVal;
            } else {
                delete self._changed[attr];
            }
        }

        // actually update our values
        _.each(changes, function (change) {
            self._previousAttributes[change.key] = change.prev;
            if (unset) {
                delete self._values[change.key];
            } else {
                self._values[change.key] = change.val;
            }
        });

        if (!silent && changes.length) self._pending = true;
        if (!silent) {
            _.each(changes, function (change) {
                self.trigger('change:' + change.key, self, change.val, options);
            });
        }

        // You might be wondering why there's a `while` loop here. Changes can
        // be recursively nested within `"change"` events.
        if (changing) return this;
        if (!silent) {
            while (this._pending) {
                this._pending = false;
                this.trigger('change', this, options);
            }
        }
        this._pending = false;
        this._changing = false;
        return this;
    },

    get: function (attr) {
        return this[attr];
    },

    // Toggle boolean properties or properties that have a `values`
    // array in its definition.
    toggle: function (property) {
        var def = this._definition[property];
        if (def.type === 'boolean') {
            // if it's a bool, just flip it
            this[property] = !this[property];
        } else if (def && def.values) {
            // If it's a property with an array of values
            // skip to the next one looping back if at end.
            this[property] = arrayNext(def.values, this[property]);
        } else {
            throw new TypeError('Can only toggle properties that are type `boolean` or have `values` array.');
        }
        return this;
    },

    // Get all of the attributes of the model at the time of the previous
    // `"change"` event.
    previousAttributes: function () {
        return _.clone(this._previousAttributes);
    },

    // Determine if the model has changed since the last `"change"` event.
    // If you specify an attribute name, determine if that attribute has changed.
    hasChanged: function (attr) {
        if (attr == null) return !_.isEmpty(this._changed);
        return _.has(this._changed, attr);
    },

    // Return an object containing all the attributes that have changed, or
    // false if there are no changed attributes. Useful for determining what
    // parts of a view need to be updated and/or what attributes need to be
    // persisted to the server. Unset attributes will be set to undefined.
    // You can also pass an attributes object to diff against the model,
    // determining if there *would be* a change.
    changedAttributes: function (diff) {
        if (!diff) return this.hasChanged() ? _.clone(this._changed) : false;
        var val, changed = false;
        var old = this._changing ? this._previousAttributes : this.attributes;
        var def, isEqual;
        for (var attr in diff) {
            def = this._definition[attr];
            isEqual = this._getCompareForType(def && def.type);
            if (isEqual(old[attr], (val = diff[attr]))) continue;
            (changed || (changed = {}))[attr] = val;
        }
        return changed;
    },

    toJSON: function () {
        return this.serialize();
    },

    unset: function (attr, options) {
        var def = this._definition[attr];
        var type = def.type;
        var val;
        if (def.required) {
            val = _.result(def, 'default');
            return this.set(attr, val, options);
        } else {
            return this.set(attr, val, _.extend({}, options, {unset: true}));
        }
    },

    clear: function (options) {
        var self = this;
        _.each(_.keys(this.attributes), function (key) {
            self.unset(key, options);
        });
        return this;
    },

    previous: function (attr) {
        if (attr == null || !Object.keys(this._previousAttributes).length) return null;
        return this._previousAttributes[attr];
    },

    // Get default values for a certain type
    _getDefaultForType: function (type) {
        var dataType = this._dataTypes[type];
        return dataType && dataType.default;
    },

    // Determine which comparison algorithm to use for comparing a property
    _getCompareForType: function (type) {
        var dataType = this._dataTypes[type];
        if (dataType && dataType.compare) return _.bind(dataType.compare, this);
        return _.isEqual;
    },

    // Run validation against the next complete set of model attributes,
    // returning `true` if all is well. Otherwise, fire an `"invalid"` event.
    _validate: function (attrs, options) {
        if (!options.validate || !this.validate) return true;
        attrs = _.extend({}, this.attributes, attrs);
        var error = this.validationError = this.validate(attrs, options) || null;
        if (!error) return true;
        this.trigger('invalid', this, error, _.extend(options || {}, {validationError: error}));
        return false;
    },

    _createPropertyDefinition: function (name, desc, isSession) {
        return createPropertyDefinition(this, name, desc, isSession);
    },

    // just makes friendlier errors when trying to define a new model
    // only used when setting up original property definitions
    _ensureValidType: function (type) {
        return _.contains(['string', 'number', 'boolean', 'array', 'object', 'date', 'any'].concat(_.keys(this._dataTypes)), type) ? type : undefined;
    },

    getAttributes: function (options, raw) {
        options || (options = {});
        _.defaults(options, {
            session: false,
            props: false,
            derived: false
        });
        var res = {};
        var val, item, def;
        for (item in this._definition) {
            def = this._definition[item];
            if ((options.session && def.session) || (options.props && !def.session)) {
                val = (raw) ? this._values[item] : this[item];
                if (typeof val === 'undefined') val = _.result(def, 'default');
                if (typeof val !== 'undefined') res[item] = val;
            }
        }
        if (options.derived) {
            for (item in this._derived) res[item] = this[item];
        }
        return res;
    },

    _initDerived: function () {
        var self = this;

        _.each(this._derived, function (value, name) {
            var def = self._derived[name];
            def.deps = def.depList;

            var update = function (options) {
                options = options || {};

                var newVal = def.fn.call(self);

                if (self._cache[name] !== newVal || !def.cache) {
                    if (def.cache) {
                        self._previousAttributes[name] = self._cache[name];
                    }
                    self._cache[name] = newVal;
                    self.trigger('change:' + name, self, self._cache[name]);
                }
            };

            def.deps.forEach(function (propString) {
                self._keyTree.add(propString, update);
            });
        });

        this.on('all', function (eventName) {
            if (changeRE.test(eventName)) {
                self._keyTree.get(eventName.split(':')[1]).forEach(function (fn) {
                    fn();
                });
            }
        }, this);
    },

    _getDerivedProperty: function (name, flushCache) {
        // is this a derived property that is cached
        if (this._derived[name].cache) {
            //set if this is the first time, or flushCache is set
            if (flushCache || !this._cache.hasOwnProperty(name)) {
                this._cache[name] = this._derived[name].fn.apply(this);
            }
            return this._cache[name];
        } else {
            return this._derived[name].fn.apply(this);
        }
    },

    _initCollections: function () {
        var coll;
        if (!this._collections) return;
        for (coll in this._collections) {
            this[coll] = new this._collections[coll]([], {parent: this});
        }
    },

    _initChildren: function () {
        var child;
        if (!this._children) return;
        for (child in this._children) {
            this[child] = new this._children[child]({}, {parent: this});
            this.listenTo(this[child], 'all', this._getEventBubblingHandler(child));
        }
    },

    // Returns a bound handler for doing event bubbling while
    // adding a name to the change string.
    _getEventBubblingHandler: function (propertyName) {
        return _.bind(function (name, model, newValue) {
            if (changeRE.test(name)) {
                this.trigger('change:' + propertyName + '.' + name.split(':')[1], model, newValue);
            } else if (name === 'change') {
                this.trigger('change', this);
            }
        }, this);
    },

    // Check that all required attributes are present
    _verifyRequired: function () {
        var attrs = this.attributes; // should include session
        for (var def in this._definition) {
            if (this._definition[def].required && typeof attrs[def] === 'undefined') {
                return false;
            }
        }
        return true;
    }
});

// getter for attributes
Object.defineProperties(Base.prototype, {
    attributes: {
        get: function () {
            return this.getAttributes({props: true, session: true});
        }
    },
    all: {
        get: function () {
            return this.getAttributes({
                session: true,
                props: true,
                derived: true
            });
        }
    },
    isState: {
        get: function () { return true; },
        set: function () { }
    }
});

// helper for creating/storing property definitions and creating
// appropriate getters/setters
function createPropertyDefinition(object, name, desc, isSession) {
    var def = object._definition[name] = {};
    var type, descArray;

    if (_.isString(desc)) {
        // grab our type if all we've got is a string
        type = object._ensureValidType(desc);
        if (type) def.type = type;
    } else {

        //Transform array of ['type', required, default] to object form
        if (_.isArray(desc)) {
            descArray = desc;
            desc = {
                type: descArray[0],
                required: descArray[1],
                default: descArray[2]
            };
        }

        type = object._ensureValidType(desc.type);
        if (type) def.type = type;

        if (desc.required) def.required = true;

        if (desc.default && typeof desc.default === 'object') {
            throw new TypeError('The default value for ' + name + ' cannot be an object/array, must be a value or a function which returns a value/object/array');
        }
        def.default = desc.default;

        def.allowNull = desc.allowNull ? desc.allowNull : false;
        if (desc.setOnce) def.setOnce = true;
        if (def.required && _.isUndefined(def.default)) def.default = object._getDefaultForType(type);
        def.test = desc.test;
        def.values = desc.values;
    }
    if (isSession) def.session = true;

    // define a getter/setter on the prototype
    // but they get/set on the instance
    Object.defineProperty(object, name, {
        set: function (val) {
            this.set(name, val);
        },
        get: function () {
            var result = this._values[name];
            var typeDef = this._dataTypes[def.type];
            if (typeof result !== 'undefined') {
                if (typeDef && typeDef.get) {
                    result = typeDef.get(result);
                }
                return result;
            }
            return _.result(def, 'default');
        }
    });

    return def;
}

// helper for creating derived property definitions
function createDerivedProperty(modelProto, name, definition) {
    var def = modelProto._derived[name] = {
        fn: _.isFunction(definition) ? definition : definition.fn,
        cache: (definition.cache !== false),
        depList: definition.deps || []
    };

    // add to our shared dependency list
    _.each(def.depList, function (dep) {
        modelProto._deps[dep] = _(modelProto._deps[dep] || []).union([name]);
    });

    // defined a top-level getter for derived names
    Object.defineProperty(modelProto, name, {
        get: function () {
            return this._getDerivedProperty(name);
        },
        set: function () {
            throw new TypeError('"' + name + '" is a derived property, it can\'t be set directly.');
        }
    });
}

var dataTypes = {
    string: {
        default: function () {
            return '';
        }
    },
    date: {
        set: function (newVal) {
            var newType;
            if (!_.isDate(newVal)) {
                try {
                    newVal = new Date(parseInt(newVal, 10));
                    if (!_.isDate(newVal)) throw TypeError;
                    newVal = newVal.valueOf();
                    if (_.isNaN(newVal)) throw TypeError;
                    newType = 'date';
                } catch (e) {
                    newType = typeof newVal;
                }
            } else {
                newType = 'date';
                newVal = newVal.valueOf();
            }
            return {
                val: newVal,
                type: newType
            };
        },
        get: function (val) {
            return new Date(val);
        },
        default: function () {
            return new Date();
        }
    },
    array: {
        set: function (newVal) {
            return {
                val: newVal,
                type: _.isArray(newVal) ? 'array' : typeof newVal
            };
        },
        default: function () {
            return [];
        }
    },
    object: {
        set: function (newVal) {
            var newType = typeof newVal;
            // we have to have a way of supporting "missing" objects.
            // Null is an object, but setting a value to undefined
            // should work too, IMO. We just override it, in that case.
            if (newType !== 'object' && _.isUndefined(newVal)) {
                newVal = null;
                newType = 'object';
            }
            return {
                val: newVal,
                type: newType
            };
        },
        default: function () {
            return {};
        }
    },
    // the `state` data type is a bit special in that setting it should
    // also bubble events
    state: {
        set: function (newVal) {
            var isInstance = newVal instanceof Base || (newVal && newVal.isState);
            if (isInstance) {
                return {
                    val: newVal,
                    type: 'state'
                };
            } else {
                return {
                    val: newVal,
                    type: typeof newVal
                };
            }
        },
        compare: function (currentVal, newVal, attributeName) {
            var isSame = currentVal === newVal;

            // if this has changed we want to also handle
            // event propagation
            if (!isSame) {
                this.stopListening(currentVal);
                if (newVal != null) {
                    this.listenTo(newVal, 'all', this._getEventBubblingHandler(attributeName));
                }
            }

            return isSame;
        }
    }
};

// the extend method used to extend prototypes, maintain inheritance chains for instanceof
// and allow for additions to the model definitions.
function extend(protoProps) {
    var parent = this;
    var child;
    var args = [].slice.call(arguments);
    var prop, item;

    // The constructor function for the new subclass is either defined by you
    // (the "constructor" property in your `extend` definition), or defaulted
    // by us to simply call the parent's constructor.
    if (protoProps && protoProps.hasOwnProperty('constructor')) {
        child = protoProps.constructor;
    } else {
        child = function () {
            return parent.apply(this, arguments);
        };
    }

    // Add static properties to the constructor function from parent
    _.extend(child, parent);

    // Set the prototype chain to inherit from `parent`, without calling
    // `parent`'s constructor function.
    var Surrogate = function () { this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate();

    // set prototype level objects
    child.prototype._derived =  _.extend({}, parent.prototype._derived);
    child.prototype._deps = _.extend({}, parent.prototype._deps);
    child.prototype._definition = _.extend({}, parent.prototype._definition);
    child.prototype._collections = _.extend({}, parent.prototype._collections);
    child.prototype._children = _.extend({}, parent.prototype._children);
    child.prototype._dataTypes = _.extend({}, parent.prototype._dataTypes || dataTypes);

    // Mix in all prototype properties to the subclass if supplied.
    if (protoProps) {
        args.forEach(function processArg(def) {
            if (def.dataTypes) {
                _.each(def.dataTypes, function (def, name) {
                    child.prototype._dataTypes[name] = def;
                });
                delete def.dataTypes;
            }
            if (def.props) {
                _.each(def.props, function (def, name) {
                    createPropertyDefinition(child.prototype, name, def);
                });
                delete def.props;
            }
            if (def.session) {
                _.each(def.session, function (def, name) {
                    createPropertyDefinition(child.prototype, name, def, true);
                });
                delete def.session;
            }
            if (def.derived) {
                _.each(def.derived, function (def, name) {
                    createDerivedProperty(child.prototype, name, def);
                });
                delete def.derived;
            }
            if (def.collections) {
                _.each(def.collections, function (constructor, name) {
                    child.prototype._collections[name] = constructor;
                });
                delete def.collections;
            }
            if (def.children) {
                _.each(def.children, function (constructor, name) {
                    child.prototype._children[name] = constructor;
                });
                delete def.children;
            }
            _.extend(child.prototype, def);
        });
    }

    var toString = Object.prototype.toString;

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
}

Base.extend = extend;

// Our main exports
module.exports = Base;

},{"array-next":8,"backbone-events-standalone":10,"key-tree-store":11,"underscore":32}],8:[function(_dereq_,module,exports){
module.exports = function arrayNext(array, currentItem) {
    var len = array.length;
    var newIndex = array.indexOf(currentItem) + 1;
    if (newIndex > (len - 1)) newIndex = 0;
    return array[newIndex];
};

},{}],9:[function(_dereq_,module,exports){
module.exports=_dereq_(3)
},{}],10:[function(_dereq_,module,exports){
module.exports=_dereq_(4)
},{"./backbone-events-standalone":9}],11:[function(_dereq_,module,exports){
function KeyTreeStore() {
    this.storage = {};
}

// add an object to the store
KeyTreeStore.prototype.add = function (keypath, obj) {
    var arr = this.storage[keypath] || (this.storage[keypath] = []);
    arr.push(obj);
};

// remove an object
KeyTreeStore.prototype.remove = function (obj) {
    var path, arr;
    for (path in this.storage) {
        arr = this.storage[path];
        arr.some(function (item, index) {
            if (item === obj) {
                arr.splice(index, 1);
                return true;
            }
        });
    }
};

// grab all relevant objects
KeyTreeStore.prototype.get = function (keypath) {
    var res = [];
    var key;

    for (key in this.storage) {
        if (keypath === key || key.indexOf(keypath + '.') === 0) {
            res = res.concat(this.storage[key]);
        }
    }

    return res;
};

module.exports = KeyTreeStore;

},{}],12:[function(_dereq_,module,exports){
var State = _dereq_('ampersand-state');
var CollectionView = _dereq_('ampersand-collection-view');
var domify = _dereq_('domify');
var _ = _dereq_('underscore');
var events = _dereq_('events-mixin');
var matches = _dereq_('matches-selector');
var bindings = _dereq_('ampersand-dom-bindings');
var getPath = _dereq_('get-object-path');


function View(attrs) {
    this.cid = _.uniqueId('view');
    attrs || (attrs = {});
    var parent = attrs.parent;
    delete attrs.parent;
    BaseState.call(this, attrs, {init: false, parent: parent});
    this.on('change:el', this._handleElementChange, this);
    this._parsedBindings = bindings(this.bindings);
    this._initializeBindings();
    if (attrs.el && !this.autoRender) {
        this._handleElementChange();
    }
    this._initializeSubviews();
    this.initialize.apply(this, arguments);
    this.set(_.pick(attrs, viewOptions));
    if (this.autoRender && this.template) {
        this.render();
    }
}

var BaseState = State.extend({
    dataTypes: {
        element: {
            set: function (newVal) {
                return {
                    val: newVal,
                    type: newVal instanceof Element ? 'element' : typeof newVal
                };
            },
            compare: function (el1, el2) {
                return el1 === el2;
            }
        },
        collection: {
            set: function (newVal) {
                return {
                    val: newVal,
                    type: newVal && newVal.isCollection ? 'collection' : typeof newVal
                };
            },
            compare: function (currentVal, newVal) {
                return currentVal === newVal;
            }
        }
    },
    props: {
        model: 'state',
        el: 'element',
        collection: 'collection'
    },
    derived: {
        rendered: {
            deps: ['el'],
            fn: function () {
                return !!this.el;
            }
        },
        hasData: {
            deps: ['model'],
            fn: function () {
                return !!this.model;
            }
        }
    }
});

// Cached regex to split keys for `delegate`.
var delegateEventSplitter = /^(\S+)\s*(.*)$/;

// List of view options to be merged as properties.
var viewOptions = ['model', 'collection', 'el'];

View.prototype = Object.create(BaseState.prototype);

// Set up all inheritable properties and methods.
_.extend(View.prototype, {
    // ## query
    // Get an single element based on CSS selector scoped to this.el
    // if you pass an empty string it return `this.el`.
    // If you pass an element we just return it back.
    // This lets us use `get` to handle cases where users
    // can pass a selector or an already selected element.
    query: function (selector) {
        if (!selector) return this.el;
        if (typeof selector === 'string') {
            if (matches(this.el, selector)) return this.el;
            return this.el.querySelector(selector) || undefined;
        }
        return selector;
    },

    // ## queryAll
    // Returns an array of elements based on CSS selector scoped to this.el
    // if you pass an empty string it return `this.el`. Also includes root
    // element.
    queryAll: function (selector) {
        var res = [];
        if (!this.el) return res;
        if (selector === '') return [this.el];
        if (matches(this.el, selector)) res.push(this.el);
        return res.concat(Array.prototype.slice.call(this.el.querySelectorAll(selector)));
    },

    // ## queryByHook
    // Convenience method for fetching element by it's `data-hook` attribute.
    // Also tries to match against root element.
    // Also supports matching 'one' of several space separated hooks.
    queryByHook: function (hook) {
        return this.query('[data-hook~="' + hook + '"]');
    },

    // Initialize is an empty function by default. Override it with your own
    // initialization logic.
    initialize: function () {},

    // **render** is the core function that your view can override, its job is
    // to populate its element (`this.el`), with the appropriate HTML.
    render: function () {
        this.renderWithTemplate(this);
        return this;
    },

    // Remove this view by taking the element out of the DOM, and removing any
    // applicable events listeners.
    remove: function () {
        var parsedBindings = this._parsedBindings;
        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
        _.chain(this._subviews).flatten().invoke('remove');
        this.stopListening();
        // TODO: Not sure if this is actually necessary.
        // Just trying to de-reference this potentially large
        // amount of generated functions to avoid memory leaks.
        _.each(parsedBindings, function (properties, modelName) {
            _.each(properties, function (value, key) {
                delete parsedBindings[modelName][key];
            });
            delete parsedBindings[modelName];
        });
        this.trigger('remove', this);
        return this;
    },

    // Change the view's element (`this.el` property), including event
    // re-delegation.
    _handleElementChange: function (element, delegate) {
        if (this.eventManager) this.eventManager.unbind();
        this.eventManager = events(this.el, this);
        this.delegateEvents();
        this._applyBindingsForKey();
        return this;
    },

    // Set callbacks, where `this.events` is a hash of
    //
    // *{"event selector": "callback"}*
    //
    //     {
    //       'mousedown .title':  'edit',
    //       'click .button':     'save',
    //       'click .open':       function (e) { ... }
    //     }
    //
    // pairs. Callbacks will be bound to the view, with `this` set properly.
    // Uses event delegation for efficiency.
    // Omitting the selector binds the event to `this.el`.
    // This only works for delegate-able events: not `focus`, `blur`, and
    // not `change`, `submit`, and `reset` in Internet Explorer.
    delegateEvents: function (events) {
        if (!(events || (events = _.result(this, 'events')))) return this;
        this.undelegateEvents();
        for (var key in events) {
            this.eventManager.bind(key, events[key]);
        }
        return this;
    },

    // Clears all callbacks previously bound to the view with `delegateEvents`.
    // You usually don't need to use this, but may wish to if you have multiple
    // Backbone views attached to the same DOM element.
    undelegateEvents: function () {
        this.eventManager.unbind();
        return this;
    },

    // ## registerSubview
    // Pass it a view. This can be anything with a `remove` method
    registerSubview: function (view) {
        // Storage for our subviews.
        this._subviews || (this._subviews = []);
        this._subviews.push(view);
        // If view has an 'el' it's a single view not
        // an array of views registered by renderCollection
        // so we store a reference to the parent view.
        if (view.el) view.parent = this;
        return view;
    },

    // ## renderSubview
    // Pass it a view instance and a container element
    // to render it in. It's `remove` method will be called
    // when the parent view is destroyed.
    renderSubview: function (view, container) {
        if (typeof container === 'string') {
            container = this.query(container);
        }
        this.registerSubview(view);
        view.render();
        container.appendChild(view.el);
        return view;
    },

    _applyBindingsForKey: function (name) {
        if (!this.el) return;
        var fns = this._parsedBindings.getGrouped(name);
        var item;
        for (item in fns) {
            fns[item].forEach(function (fn) {
                fn(this.el, getPath(this, item), _.last(item.split('.')));
            }, this);
        }
    },

    _initializeBindings: function () {
        if (!this.bindings) return;
        this.on('all', function (eventName) {
            if (eventName.slice(0, 7) === 'change:') {
                this._applyBindingsForKey(eventName.split(':')[1]);
            }
        }, this);
    },

    // ## _initializeSubviews
    // this is called at setup and grabs declared subviews
    _initializeSubviews: function () {
        if (!this.subviews) return;
        for (var item in this.subviews) {
            this._parseSubview(this.subviews[item], item);
        }
    },

    // ## _parseSubview
    // helper for parsing out the subview declaration and registering
    // the `waitFor` if need be.
    _parseSubview: function (subview, name) {
        var self = this;
        var opts = {
            selector: subview.container || '[data-hook="' + subview.hook + '"]',
            waitFor: subview.waitFor || '',
            prepareView: subview.prepareView || function (el) {
                return new subview.constructor({
                    el: el,
                    parent: self
                });
            }
        };
        function action() {
            var el, subview;
            // if not rendered or we can't find our element, stop here.
            if (!this.el || !(el = this.query(opts.selector))) return;
            if (!opts.waitFor || getPath(this, opts.waitFor)) {
                subview = this[name] = opts.prepareView.call(this, el);
                subview.render();
                this.registerSubview(subview);
                this.off('change', action);
            }
        }
        // we listen for main `change` items
        this.on('change', action, this);
    },


    // Shortcut for doing everything we need to do to
    // render and fully replace current root element.
    // Either define a `template` property of your view
    // or pass in a template directly.
    // The template can either be a string or a function.
    // If it's a function it will be passed the `context`
    // argument.
    renderWithTemplate: function (context, templateArg) {
        var template = templateArg || this.template;
        if (!template) throw new Error('Template string or function needed.');
        var newDom = _.isString(template) ? template : template(context || this);
        if (_.isString(newDom)) newDom = domify(newDom);
        var parent = this.el && this.el.parentNode;
        if (parent) parent.replaceChild(newDom, this.el);
        if (newDom.nodeName === '#document-fragment') throw new Error('Views can only have one root element.');
        this.el = newDom;
        return this;
    },

    // ## cacheElements
    // This is a shortcut for adding reference to specific elements within your view for
    // access later. This is avoids excessive DOM queries and gives makes it easier to update
    // your view if your template changes.
    //
    // In your `render` method. Use it like so:
    //
    //     render: function () {
    //       this.basicRender();
    //       this.cacheElements({
    //         pages: '#pages',
    //         chat: '#teamChat',
    //         nav: 'nav#views ul',
    //         me: '#me',
    //         cheatSheet: '#cheatSheet',
    //         omniBox: '#awesomeSauce'
    //       });
    //     }
    //
    // Then later you can access elements by reference like so: `this.pages`, or `this.chat`.
    cacheElements: function (hash) {
        for (var item in hash) {
            this[item] = this.query(hash[item]);
        }
    },

    // ## listenToAndRun
    // Shortcut for registering a listener for a model
    // and also triggering it right away.
    listenToAndRun: function (object, events, handler) {
        var bound = _.bind(handler, this);
        this.listenTo(object, events, bound);
        bound();
    },

    // ## animateRemove
    // Placeholder for if you want to do something special when they're removed.
    // For example fade it out, etc.
    // Any override here should call `.remove()` when done.
    animateRemove: function () {
        this.remove();
    },

    // ## renderCollection
    // Method for rendering a collections with individual views.
    // Just pass it the collection, and the view to use for the items in the
    // collection.
    renderCollection: function (collection, ViewClass, container, opts) {
        var containerEl = (typeof container === 'string') ? this.query(container) : container;
        var config = _.extend({
            collection: collection,
            el: containerEl,
            view: ViewClass
        }, opts);
        var collectionView = new CollectionView(config);
        collectionView.render();
        this.registerSubview(collectionView);
    }
});

View.extend = BaseState.extend;
module.exports = View;

},{"ampersand-collection-view":13,"ampersand-dom-bindings":18,"ampersand-state":7,"domify":22,"events-mixin":23,"get-object-path":28,"matches-selector":29,"underscore":32}],13:[function(_dereq_,module,exports){
var _ = _dereq_('underscore');
var BBEvents = _dereq_('backbone-events-standalone');
var ampExtend = _dereq_('ampersand-class-extend');

// options
var options = ['collection', 'el', 'viewOptions', 'view', 'filter', 'reverse'];


function CollectionView(spec) {
    if (!spec) {
        throw new ReferenceError('Collection view missing required parameters: collection, el');
    }
    if (!spec.collection) {
        throw new ReferenceError('Collection view requires a collection');
    }
    if (!spec.el) {
        throw new ReferenceError('Collection view requires an el');
    }
    _.extend(this, _.pick(spec, options));
    this.views = [];
    this.listenTo(this.collection, 'add', this._addViewForModel);
    this.listenTo(this.collection, 'remove', this._removeViewForModel);
    this.listenTo(this.collection, 'sort', this._rerenderAll);
    this.listenTo(this.collection, 'refresh reset', this._reset);
}

_.extend(CollectionView.prototype, BBEvents, {
    // for view contract compliance
    render: function () {
        this._renderAll();
        return this;
    },
    remove: function () {
        _.invoke(this.views, 'remove');
        this.stopListening();
    },
    _getViewByModel: function (model) {
        return _.find(this.views, function (view) {
            return model === view.model;
        });
    },
    _createViewForModel: function (model) {
        var view = new this.view(_({model: model, collection: this.collection}).extend(this.viewOptions));
        this.views.push(view);
        view.parent = this;
        view.renderedByParentView = true;
        view.render();
        return view;
    },
    _getOrCreateByModel: function (model) {
        return this._getViewByModel(model) || this._createViewForModel(model);
    },
    _addViewForModel: function (model, collection, options) {
        var view = this._getViewByModel(model);
        var matches = this.filter ? this.filter(model) : true;
        if (!matches) {
            return;
        }
        if (!view) {
            view = new this.view(_({model: model, collection: this.collection}).extend(this.viewOptions));
            this.views.push(view);
            view.parent = this;
            view.renderedByParentView = true;
            view.render({containerEl: this.el});
        }
        if (options && options.rerender) {
            this._insertView(view);
        } else {
            this._insertViewAtIndex(view);
        }
    },
    _insertViewAtIndex: function (view) {
        if (!view.insertSelf) {
            var pos = this.collection.indexOf(view.model);
            var modelToInsertBefore, viewToInsertBefore;

            if (this.reverse) {
                modelToInsertBefore = this.collection.at(pos - 1);
            } else {
                modelToInsertBefore = this.collection.at(pos + 1);
            }

            viewToInsertBefore = this._getViewByModel(modelToInsertBefore);

            // FIX IE bug (https://developer.mozilla.org/en-US/docs/Web/API/Node.insertBefore)
            // "In Internet Explorer an undefined value as referenceElement will throw errors, while in rest of the modern browsers, this works fine."
            if(viewToInsertBefore) {
                this.el.insertBefore(view.el, viewToInsertBefore && viewToInsertBefore.el);
            } else {
                this.el.appendChild(view.el);
            }
        }
    },
    _insertView: function (view) {
        if (!view.insertSelf) {
            if (this.reverse && this.el.firstChild) {
                this.el.insertBefore(view.el, this.el.firstChild);
            } else {
                this.el.appendChild(view.el);
            }
        }
    },
    _removeViewForModel: function (model) {
        var view = this._getViewByModel(model);
        if (!view) {
            return;
        }
        var index = this.views.indexOf(view);
        if (index !== -1) {
            // remove it if we found it calling animateRemove
            // to give user option of gracefully destroying.
            view = this.views.splice(index, 1)[0];
            this._removeView(view);
        }
    },
    _removeView: function (view) {
        if (view.animateRemove) {
            view.animateRemove();
        } else {
            view.remove();
        }
    },
    _renderAll: function () {
        this.collection.each(this._addViewForModel, this);
    },
    _rerenderAll: function (collection, options) {
        options = options || {};
        this.collection.each(function (model) {
            this._addViewForModel(model, this, _.extend(options, {rerender: true}));
        }, this);
    },
    _reset: function () {
        var newViews = this.collection.map(this._getOrCreateByModel, this);

        //Remove existing views from the ui
        var toRemove = _.difference(this.views, newViews);
        toRemove.forEach(this._removeView, this);

        //Rerender the full list with the new views
        this.views = newViews;
        this._rerenderAll();
    }
});

CollectionView.extend = ampExtend;

module.exports = CollectionView;

},{"ampersand-class-extend":14,"backbone-events-standalone":17,"underscore":32}],14:[function(_dereq_,module,exports){
module.exports=_dereq_(2)
},{"extend-object":15}],15:[function(_dereq_,module,exports){
module.exports=_dereq_(5)
},{}],16:[function(_dereq_,module,exports){
module.exports=_dereq_(3)
},{}],17:[function(_dereq_,module,exports){
module.exports=_dereq_(4)
},{"./backbone-events-standalone":16}],18:[function(_dereq_,module,exports){
var Store = _dereq_('key-tree-store');
var isArray = _dereq_('is-array');
var dom = _dereq_('ampersand-dom');
var matchesSelector = _dereq_('matches-selector');


// returns a key-tree-store of functions
// that can be applied to any element/model.

// all resulting functions should be called
// like func(el, value, lastKeyName)
module.exports = function (bindings) {
    var store = new Store();
    var key, current;

    for (key in bindings) {
        current = bindings[key];
        if (typeof current === 'string') {
            store.add(key, getBindingFunc({
                type: 'text',
                selector: current
            }));
        } else if (current.forEach) {
            current.forEach(function (binding) {
                store.add(key, getBindingFunc(binding));
            });
        } else {
            store.add(key, getBindingFunc(current));
        }
    }

    return store;
};


var slice = Array.prototype.slice;

function getMatches(el, selector, func) {
    if (selector === '') return [el];
    var matches = [];
    if (matchesSelector(el, selector)) matches.push(el);
    return matches.concat(slice.call(el.querySelectorAll(selector)));
}

function makeArray(val) {
    return Array.isArray(val) ? val : [val];
}

function getBindingFunc(binding) {
    var type = binding.type || 'text';
    var hasSelector = true;
    var selector = (function () {
        if (typeof binding.selector === 'string') {
            return binding.selector;
        } else if (binding.hook) {
            return '[data-hook="' + binding.hook + '"]';
        } else {
            return '';
        }
    })();

    // storage variable for previous if relevant
    var previousValue = '';

    if (type === 'text') {
        return function (el, value) {
            getMatches(el, selector).forEach(function (match) {
                dom.text(match, value);
            });
        };
    } else if (type === 'class') {
        return function (el, value) {
            getMatches(el, selector).forEach(function (match) {
                dom.switchClass(match, previousValue, value);
            });
            previousValue = value;
        };
    } else if (type === 'attribute') {
        if (!binding.name) throw Error('attribute bindings must have a "name"');
        return function (el, value) {
            var names = makeArray(binding.name);
            getMatches(el, selector).forEach(function (match) {
                names.forEach(function (name) {
                    dom.setAttribute(match, name, value);
                });
            });
            previousValue = value;
        };
    } else if (type === 'value') {
        return function (el, value) {
            getMatches(el, selector).forEach(function (match) {
                if (!value && value !== 0) value = '';
                match.value = value;
            });
            previousValue = value;
        };
    } else if (type === 'booleanClass') {
        // if there's a `no` case this is actually a switch
        if (binding.no) {
            return function (el, value, keyName) {
                var yes = makeArray(binding.name || binding.yes || keyName);
                var no = makeArray(binding.no);
                var prevClass = value ? no : yes;
                var newClass = value ? yes : no;
                getMatches(el, selector).forEach(function (match) {
                    prevClass.forEach(function (pc) {
                        dom.removeClass(match, pc);
                    });
                    newClass.forEach(function (nc) {
                        dom.addClass(match, nc);
                    });
                });
            };
        } else {
            return function (el, value, keyName) {
                var name = makeArray(binding.name || keyName);
                getMatches(el, selector).forEach(function (match) {
                    name.forEach(function (className) {
                        dom[value ? 'addClass' : 'removeClass'](match, className);
                    });
                });
            };
        }
    } else if (type === 'booleanAttribute') {
        return function (el, value, keyName) {
            var name = makeArray(binding.name || keyName);
            getMatches(el, selector).forEach(function (match) {
                name.forEach(function (attr) {
                    dom[value ? 'addAttribute' : 'removeAttribute'](match, attr);
                });
            });
        };
    } else if (type === 'toggle') {
        // this doesn't require a selector since we can pass yes/no selectors
        if (binding.yes && binding.no) {
            return function (el, value) {
                getMatches(el, binding.yes).forEach(function (match) {
                    dom[value ? 'show' : 'hide'](match);
                });
                getMatches(el, binding.no).forEach(function (match) {
                    dom[value ? 'hide' : 'show'](match);
                });
            };
        } else {
                return function (el, value) {
                getMatches(el, selector).forEach(function (match) {
                    dom[value ? 'show' : 'hide'](match);
                });
            };
        }
    } else if (type === 'switch') {
        if (!binding.cases) throw Error('switch bindings must have "cases"');
        return function (el, value) {
            for (var item in binding.cases) {
                getMatches(el, binding.cases[item]).forEach(function (match) {
                    dom[value === item ? 'show' : 'hide'](match);
                });
            }
        };
    } else if (type === 'innerHTML') {
        return function (el, value) {
            getMatches(el, selector).forEach(function (match) {
                dom.html(match, value);
            });
        };
    } else {
        throw new Error('no such binding type: ' + type);
    }
}

},{"ampersand-dom":19,"is-array":20,"key-tree-store":21,"matches-selector":29}],19:[function(_dereq_,module,exports){
var dom = module.exports = {
    text: function (el, val) {
        el.textContent = getString(val);
    },
    // optimize if we have classList
    addClass: function (el, cls) {
        cls = getString(cls);
        if (!cls) return;
        if (el.classList) {
            el.classList.add(cls);
        } else {
            if (!hasClass(el, cls)) {
                if (el.classList) {
                    el.classList.add(cls);
                } else {
                    el.className += ' ' + cls;
                }
            }
        }
    },
    removeClass: function (el, cls) {
        if (el.classList) {
            el.classList.remove(getString(cls));
        } else {
            // may be faster to not edit unless we know we have it?
            el.className = el.className.replace(new RegExp('(^|\\b)' + cls.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
        }
    },
    hasClass: hasClass,
    switchClass: function (el, prevCls, newCls) {
        if (prevCls) this.removeClass(el, prevCls);
        this.addClass(el, newCls);
    },
    // makes sure attribute (with no content) is added
    // if exists it will be cleared of content
    addAttribute: function (el, attr) {
        // setting to empty string does same
        el.setAttribute(attr, '');
    },
    // completely removes attribute
    removeAttribute: function (el, attr) {
        el.removeAttribute(attr);
    },
    // sets attribute to string value given, clearing any current value
    setAttribute: function (el, attr, value) {
        el.setAttribute(attr, getString(value));
    },
    getAttribute: function (el, attr) {
        return el.getAttribute(attr);
    },
    hide: function (el) {
        if (!isHidden(el)) {
            storeDisplayStyle(el);
            hide(el);
        }
    },
    // show element
    show: function (el) {
        show(el);
    },
    html: function (el, content) {
        el.innerHTML = content;
    }
};

// helpers
function getString(val) {
    if (!val && val !== 0) {
        return '';
    } else {
        return val;
    }
}

function hasClass(el, cls) {
    if (el.classList) {
        return el.classList.contains(cls);
    } else {
        return new RegExp('(^| )' + cls + '( |$)', 'gi').test(el.className);
    }
}

function isHidden (el) {
    return dom.getAttribute(el, 'data-anddom-hidden') === 'true';
}

function storeDisplayStyle (el) {
    dom.setAttribute(el, 'data-anddom-display', el.style.display);
}

function show (el) {
    el.style.display = dom.getAttribute(el, 'data-anddom-display') || '';
    dom.removeAttribute(el, 'data-anddom-hidden');
}

function hide (el) {
    dom.setAttribute(el, 'data-anddom-hidden', 'true');
    el.style.display = 'none';
}

},{}],20:[function(_dereq_,module,exports){
module.exports=_dereq_(6)
},{}],21:[function(_dereq_,module,exports){
var slice = Array.prototype.slice;

// our constructor
function KeyTreeStore() {
    this.storage = {};
}

// add an object to the store
KeyTreeStore.prototype.add = function (keypath, obj) {
    var arr = this.storage[keypath] || (this.storage[keypath] = []);
    arr.push(obj);
};

// remove an object
KeyTreeStore.prototype.remove = function (obj) {
    var path, arr;
    for (path in this.storage) {
        arr = this.storage[path];
        arr.some(function (item, index) {
            if (item === obj) {
                arr.splice(index, 1);
                return true;
            }
        });
    }
};

// get array of all all relevant functions, without keys
KeyTreeStore.prototype.get = function (keypath) {
    var res = [];
    var key;

    for (key in this.storage) {
        if (!keypath || keypath === key || key.indexOf(keypath + '.') === 0) {
            res = res.concat(this.storage[key]);
        }
    }

    return res;
};

// get all results that match keypath but still grouped by key
KeyTreeStore.prototype.getGrouped = function (keypath) {
    var res = {};
    var key;

    for (key in this.storage) {
        if (!keypath || keypath === key || key.indexOf(keypath + '.') === 0) {
            res[key] = slice.call(this.storage[key]);
        }
    }

    return res;
};

// get all results that match keypath but still grouped by key
KeyTreeStore.prototype.getAll = function (keypath) {
    var res = {};
    var key;

    for (key in this.storage) {
        if (keypath === key || key.indexOf(keypath + '.') === 0) {
            res[key] = slice.call(this.storage[key]);
        }
    }

    return res;
};

// run all matches with optional context
KeyTreeStore.prototype.run = function (keypath, context) {
    var args = slice.call(arguments, 2);
    this.get(keypath).forEach(function (fn) {
        fn.apply(context || this, args);
    });
};



module.exports = KeyTreeStore;

},{}],22:[function(_dereq_,module,exports){

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Wrap map from jquery.
 */

var map = {
  legend: [1, '<fieldset>', '</fieldset>'],
  tr: [2, '<table><tbody>', '</tbody></table>'],
  col: [2, '<table><tbody></tbody><colgroup>', '</colgroup></table>'],
  _default: [0, '', '']
};

map.td =
map.th = [3, '<table><tbody><tr>', '</tr></tbody></table>'];

map.option =
map.optgroup = [1, '<select multiple="multiple">', '</select>'];

map.thead =
map.tbody =
map.colgroup =
map.caption =
map.tfoot = [1, '<table>', '</table>'];

map.text =
map.circle =
map.ellipse =
map.line =
map.path =
map.polygon =
map.polyline =
map.rect = [1, '<svg xmlns="http://www.w3.org/2000/svg" version="1.1">','</svg>'];

/**
 * Parse `html` and return a DOM Node instance, which could be a TextNode,
 * HTML DOM Node of some kind (<div> for example), or a DocumentFragment
 * instance, depending on the contents of the `html` string.
 *
 * @param {String} html - HTML string to "domify"
 * @param {Document} doc - The `document` instance to create the Node for
 * @return {DOMNode} the TextNode, DOM Node, or DocumentFragment instance
 * @api private
 */

function parse(html, doc) {
  if ('string' != typeof html) throw new TypeError('String expected');

  // default to the global `document` object
  if (!doc) doc = document;

  // tag name
  var m = /<([\w:]+)/.exec(html);
  if (!m) return doc.createTextNode(html);

  html = html.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace

  var tag = m[1];

  // body support
  if (tag == 'body') {
    var el = doc.createElement('html');
    el.innerHTML = html;
    return el.removeChild(el.lastChild);
  }

  // wrap map
  var wrap = map[tag] || map._default;
  var depth = wrap[0];
  var prefix = wrap[1];
  var suffix = wrap[2];
  var el = doc.createElement('div');
  el.innerHTML = prefix + html + suffix;
  while (depth--) el = el.lastChild;

  // one element
  if (el.firstChild == el.lastChild) {
    return el.removeChild(el.firstChild);
  }

  // several elements
  var fragment = doc.createDocumentFragment();
  while (el.firstChild) {
    fragment.appendChild(el.removeChild(el.firstChild));
  }

  return fragment;
}

},{}],23:[function(_dereq_,module,exports){

/**
 * Module dependencies.
 */

var events = _dereq_('component-event');
var delegate = _dereq_('delegate-events');
var forceCaptureEvents = ['focus', 'blur'];

/**
 * Expose `Events`.
 */

module.exports = Events;

/**
 * Initialize an `Events` with the given
 * `el` object which events will be bound to,
 * and the `obj` which will receive method calls.
 *
 * @param {Object} el
 * @param {Object} obj
 * @api public
 */

function Events(el, obj) {
  if (!(this instanceof Events)) return new Events(el, obj);
  if (!el) throw new Error('element required');
  if (!obj) throw new Error('object required');
  this.el = el;
  this.obj = obj;
  this._events = {};
}

/**
 * Subscription helper.
 */

Events.prototype.sub = function(event, method, cb){
  this._events[event] = this._events[event] || {};
  this._events[event][method] = cb;
};

/**
 * Bind to `event` with optional `method` name.
 * When `method` is undefined it becomes `event`
 * with the "on" prefix.
 *
 * Examples:
 *
 *  Direct event handling:
 *
 *    events.bind('click') // implies "onclick"
 *    events.bind('click', 'remove')
 *    events.bind('click', 'sort', 'asc')
 *
 *  Delegated event handling:
 *
 *    events.bind('click li > a')
 *    events.bind('click li > a', 'remove')
 *    events.bind('click a.sort-ascending', 'sort', 'asc')
 *    events.bind('click a.sort-descending', 'sort', 'desc')
 *
 * @param {String} event
 * @param {String|function} [method]
 * @return {Function} callback
 * @api public
 */

Events.prototype.bind = function(event, method){
  var e = parse(event);
  var el = this.el;
  var obj = this.obj;
  var name = e.name;
  var method = method || 'on' + name;
  var args = [].slice.call(arguments, 2);

  // callback
  function cb(){
    var a = [].slice.call(arguments).concat(args);
    obj[method].apply(obj, a);
  }

  // bind
  if (e.selector) {
    cb = delegate.bind(el, e.selector, name, cb);
  } else {
    events.bind(el, name, cb);
  }

  // subscription for unbinding
  this.sub(name, method, cb);

  return cb;
};

/**
 * Unbind a single binding, all bindings for `event`,
 * or all bindings within the manager.
 *
 * Examples:
 *
 *  Unbind direct handlers:
 *
 *     events.unbind('click', 'remove')
 *     events.unbind('click')
 *     events.unbind()
 *
 * Unbind delegate handlers:
 *
 *     events.unbind('click', 'remove')
 *     events.unbind('click')
 *     events.unbind()
 *
 * @param {String|Function} [event]
 * @param {String|Function} [method]
 * @api public
 */

Events.prototype.unbind = function(event, method){
  if (0 == arguments.length) return this.unbindAll();
  if (1 == arguments.length) return this.unbindAllOf(event);

  // no bindings for this event
  var bindings = this._events[event];
  var capture = (forceCaptureEvents.indexOf(event) !== -1);
  if (!bindings) return;

  // no bindings for this method
  var cb = bindings[method];
  if (!cb) return;

  events.unbind(this.el, event, cb, capture);
};

/**
 * Unbind all events.
 *
 * @api private
 */

Events.prototype.unbindAll = function(){
  for (var event in this._events) {
    this.unbindAllOf(event);
  }
};

/**
 * Unbind all events for `event`.
 *
 * @param {String} event
 * @api private
 */

Events.prototype.unbindAllOf = function(event){
  var bindings = this._events[event];
  if (!bindings) return;

  for (var method in bindings) {
    this.unbind(event, method);
  }
};

/**
 * Parse `event`.
 *
 * @param {String} event
 * @return {Object}
 * @api private
 */

function parse(event) {
  var parts = event.split(/ +/);
  return {
    name: parts.shift(),
    selector: parts.join(' ')
  }
}

},{"component-event":24,"delegate-events":25}],24:[function(_dereq_,module,exports){
var bind = window.addEventListener ? 'addEventListener' : 'attachEvent',
    unbind = window.removeEventListener ? 'removeEventListener' : 'detachEvent',
    prefix = bind !== 'addEventListener' ? 'on' : '';

/**
 * Bind `el` event `type` to `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.bind = function(el, type, fn, capture){
  el[bind](prefix + type, fn, capture || false);
  return fn;
};

/**
 * Unbind `el` event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  el[unbind](prefix + type, fn, capture || false);
  return fn;
};
},{}],25:[function(_dereq_,module,exports){
/**
 * Module dependencies.
 */

var closest = _dereq_('closest')
  , event = _dereq_('event');

/**
 * Delegate event `type` to `selector`
 * and invoke `fn(e)`. A callback function
 * is returned which may be passed to `.unbind()`.
 *
 * @param {Element} el
 * @param {String} selector
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

// Some events don't bubble, so we want to bind to the capture phase instead
// when delegating.
var forceCaptureEvents = ['focus', 'blur'];

exports.bind = function(el, selector, type, fn, capture){
  if (forceCaptureEvents.indexOf(type) !== -1) capture = true;

  return event.bind(el, type, function(e){
    var target = e.target || e.srcElement;
    e.delegateTarget = closest(target, selector, true, el);
    if (e.delegateTarget) fn.call(el, e);
  }, capture);
};

/**
 * Unbind event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @api public
 */

exports.unbind = function(el, type, fn, capture){
  if (forceCaptureEvents.indexOf(type) !== -1) capture = true;

  event.unbind(el, type, fn, capture);
};

},{"closest":26,"event":24}],26:[function(_dereq_,module,exports){
var matches = _dereq_('matches-selector')

module.exports = function (element, selector, checkYoSelf) {
  var parent = checkYoSelf ? element : element.parentNode

  while (parent && parent !== document) {
    if (matches(parent, selector)) return parent;
    parent = parent.parentNode
  }
}

},{"matches-selector":27}],27:[function(_dereq_,module,exports){

/**
 * Element prototype.
 */

var proto = Element.prototype;

/**
 * Vendor function.
 */

var vendor = proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

/**
 * Expose `match()`.
 */

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (vendor) return vendor.call(el, selector);
  var nodes = el.parentNode.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; ++i) {
    if (nodes[i] == el) return true;
  }
  return false;
}
},{}],28:[function(_dereq_,module,exports){
module.exports = get;

function get (context, path) {
  if (path.indexOf('.') == -1 && path.indexOf('[') == -1) {
    return context[path];
  }

  var crumbs = path.split(/\.|\[|\]/g);
  var i = -1;
  var len = crumbs.length;
  var result;

  while (++i < len) {
    if (i == 0) result = context;
    if (!crumbs[i]) continue;
    if (result == undefined) break;
    result = result[crumbs[i]];
  }

  return result;
}

},{}],29:[function(_dereq_,module,exports){
'use strict';

var proto = Element.prototype;
var vendor = proto.matches
  || proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (vendor) return vendor.call(el, selector);
  var nodes = el.parentNode.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] == el) return true;
  }
  return false;
}
},{}],30:[function(_dereq_,module,exports){
(function() {
  module.exports = {
    el: function(el) {
      return {
        closest: function(selector) {
          var matchesSelector;
          matchesSelector = el.matches || el.webkitMatchesSelector || el.mozMatchesSelector || el.msMatchesSelector;
          while (el) {
            if (matchesSelector.bind(el)(selector)) {
              return el;
            } else {
              el = el.parentNode;
            }
          }
        },

        /*
        		Native alternative to jQuery's $.offset()
        
        		http://www.quirksmode.org/js/findpos.html
         */
        position: function(parent) {
          var left, loopEl, top;
          if (parent == null) {
            parent = document.body;
          }
          left = 0;
          top = 0;
          loopEl = el;
          while ((loopEl != null) && loopEl !== parent) {
            if (this.hasDescendant(parent)) {
              break;
            }
            left += loopEl.offsetLeft;
            top += loopEl.offsetTop;
            loopEl = loopEl.offsetParent;
          }
          return {
            left: left,
            top: top
          };
        },
        boundingBox: function() {
          var box;
          box = this.position();
          box.width = el.clientWidth;
          box.height = el.clientHeight;
          box.right = box.left + box.width;
          box.bottom = box.top + box.height;
          return box;
        },

        /*
        		Is child el a descendant of parent el?
        
        		http://stackoverflow.com/questions/2234979/how-to-check-in-javascript-if-one-element-is-a-child-of-another
         */
        hasDescendant: function(child) {
          var node;
          node = child.parentNode;
          while (node != null) {
            if (node === el) {
              return true;
            }
            node = node.parentNode;
          }
          return false;
        },
        insertAfter: function(referenceElement) {
          return referenceElement.parentNode.insertBefore(el, referenceElement.nextSibling);
        },
        hasScrollBar: function(el) {
          return hasScrollBarX(el) || hasScrollBarY(el);
        },
        hasScrollBarX: function(el) {
          return el.scrollWidth > el.clientWidth;
        },
        hasScrollBarY: function(el) {
          return el.scrollHeight > el.clientHeight;
        },
        inViewport: function(parent) {
          var doc, rect, win;
          win = parent != null ? parent : window;
          doc = parent != null ? parent : document.documentElement;
          rect = el.getBoundingClientRect();
          return rect.top >= 0 && rect.left >= 0 && rect.bottom <= (win.innerHeight || doc.clientHeight) && rect.right <= (win.innerWidth || doc.clientWidth);
        }
      };
    }
  };

}).call(this);

},{}],31:[function(_dereq_,module,exports){
(function(){var e={}.hasOwnProperty;module.exports={get:function(e,l){return null==l&&(l={}),this._sendRequest("GET",e,l)},post:function(e,l){return null==l&&(l={}),this._sendRequest("POST",e,l)},put:function(e,l){return null==l&&(l={}),this._sendRequest("PUT",e,l)},_promise:function(){return{done:function(e){return this.callDone=e},callDone:null,fail:function(e){return this.callFail=e},callFail:null,always:function(e){return this.callAlways=e},callAlways:null}},_sendRequest:function(l,n,t){var a,u,s,r,i;null==t&&(t={}),u=this._promise(),null==t.data&&(t.data={}),null==t.headers&&(t.headers={}),r=new XMLHttpRequest,r.onreadystatechange=function(){var e;if(r.readyState===XMLHttpRequest.DONE)if(null!=u.callAlways&&u.callAlways(r),200<=(e=r.status)&&206>=e){if(null!=u.callDone)return u.callDone(r)}else if(null!=u.callFail)return u.callFail(r)},r.open(l,n,!0),r.setRequestHeader("Content-type","application/json"),i=t.headers;for(a in i)e.call(i,a)&&(s=i[a],r.setRequestHeader(a,s));return r.send(t.data),u}}}).call(this);
},{}],32:[function(_dereq_,module,exports){
//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

},{}],33:[function(_dereq_,module,exports){
var Collection, Level, Levels;

Collection = _dereq_('ampersand-collection');

Level = _dereq_('../models/level');

Levels = Collection.extend({
  model: Level,
  mainIndex: 'level',
  initialize: function() {
    this.on('change:scale', (function(_this) {
      return function(currentLevel, value) {
        if (value > 1 && (_this.next() != null)) {
          _this.activateNext();
        }
        if ((_this.previous() != null) && Math.round(currentLevel.width) < Math.round(_this.previous().initWidth)) {
          return _this.activatePrevious();
        }
      };
    })(this));
    this.on('change:left', (function(_this) {
      return function(model, value) {
        return _this.each(function(m) {
          if (model !== m) {
            return m.set({
              left: value,
              silent: true
            });
          }
        });
      };
    })(this));
    this.on('change:top', (function(_this) {
      return function(model, value) {
        return _this.each(function(m) {
          if (model !== m) {
            return m.set({
              top: value,
              silent: true
            });
          }
        });
      };
    })(this));
    this.on('change:width', (function(_this) {
      return function(model, value) {
        return _this.each(function(m) {
          if (model !== m) {
            return m.set({
              width: value,
              silent: true
            });
          }
        });
      };
    })(this));
    return this.on('change:height', (function(_this) {
      return function(model, value) {
        return _this.each(function(m) {
          if (model !== m) {
            return m.set({
              height: value,
              silent: true
            });
          }
        });
      };
    })(this));
  },
  activateNext: function() {
    var currentLevel, nextLevel;
    currentLevel = this.active();
    this.activeIndex += 1;
    nextLevel = this.active();
    this.copyGeometry(currentLevel, nextLevel);
    currentLevel.active = false;
    return nextLevel.active = true;
  },
  activatePrevious: function() {
    var currentLevel, previousLevel;
    currentLevel = this.active();
    this.activeIndex -= 1;
    previousLevel = this.active();
    this.copyGeometry(currentLevel, previousLevel);
    currentLevel.active = false;
    return previousLevel.active = true;
  },
  copyGeometry: function(currentLevel, nextLevel) {
    return nextLevel.set({
      scale: currentLevel.width / nextLevel.initWidth,
      left: currentLevel.left,
      top: currentLevel.top,
      width: currentLevel.width,
      height: currentLevel.height
    }, {
      silent: true
    });
  },
  activeIndex: 0,
  active: function() {
    return this.at(this.activeIndex);
  },
  previous: function() {
    var index;
    index = this.activeIndex - 1;
    return this.at(index);
  },
  next: function() {
    var index;
    index = this.activeIndex + 1;
    return this.at(index);
  },
  isFirst: function(model) {
    return this.indexOf(model) === 0;
  },
  isLast: function(model) {
    return this.indexOf(model) === (this.length - 1);
  },
  lastActive: function() {
    return this.isLast(this.active());
  }
});

module.exports = Levels;


},{"../models/level":35,"ampersand-collection":1}],34:[function(_dereq_,module,exports){
var Container, Model;

Model = _dereq_('ampersand-state');

Container = Model.extend({
  session: {
    width: 'number',
    height: 'number',
    top: 'number',
    left: 'number',
    bottom: 'number',
    right: 'number'
  },
  derived: {
    surface: {
      deps: ['width', 'height'],
      fn: function() {
        return this.width * this.height;
      }
    }
  }
});

module.exports = Container;


},{"ampersand-state":7}],35:[function(_dereq_,module,exports){
var Container, Level, Model;

Model = _dereq_('ampersand-state');

Container = _dereq_('./container');

Level = Model.extend({
  loadImageParts: function() {
    var column, el, error, firstVisibleColumn, firstVisibleRow, height, horMin, lastVisibleColumn, lastVisibleRow, partSize, row, verMin, visibleArea, width, x, y, _i, _results;
    width = this.initWidth * this.scale;
    height = this.initHeight * this.scale;
    visibleArea = {
      left: -1 * this.left,
      top: -1 * this.top,
      right: (-1 * this.left) + this.container.width,
      bottom: (-1 * this.top) + this.container.height
    };
    partSize = 240 * this.scale;
    horMin = Math.min(visibleArea.right - visibleArea.left, width);
    verMin = Math.min(visibleArea.bottom - visibleArea.top, height);
    firstVisibleRow = Math.floor(visibleArea.top / partSize);
    if (firstVisibleRow < 0) {
      firstVisibleRow = 0;
    }
    lastVisibleRow = firstVisibleRow + Math.ceil(verMin / partSize);
    firstVisibleColumn = Math.floor(visibleArea.left / partSize);
    if (firstVisibleColumn < 0) {
      firstVisibleColumn = 0;
    }
    lastVisibleColumn = firstVisibleColumn + Math.ceil(horMin / partSize);
    if (lastVisibleColumn > this.columns - 1) {
      lastVisibleColumn = this.columns - 1;
    }
    if (lastVisibleRow > this.rows - 1) {
      lastVisibleRow = this.rows - 1;
    }
    _results = [];
    for (row = _i = firstVisibleRow; firstVisibleRow <= lastVisibleRow ? _i <= lastVisibleRow : _i >= lastVisibleRow; row = firstVisibleRow <= lastVisibleRow ? ++_i : --_i) {
      _results.push((function() {
        var _j, _results1;
        _results1 = [];
        for (column = _j = firstVisibleColumn; firstVisibleColumn <= lastVisibleColumn ? _j <= lastVisibleColumn : _j >= lastVisibleColumn; column = firstVisibleColumn <= lastVisibleColumn ? ++_j : --_j) {
          el = document.getElementById(this.getImgId(row, column));
          y = row * this.partSize;
          x = column * this.partSize;
          try {
            _results1.push(el.src = "" + this.imgPath + "/" + this.boxSize + "/" + x + "-" + y + ".jpg");
          } catch (_error) {
            error = _error;
            _results1.push(console.log("" + this.imgPath + "/" + this.boxSize + "/" + x + "-" + y + ".jpg | " + error));
          }
        }
        return _results1;
      }).call(this));
    }
    return _results;
  },
  initialize: function() {
    this.on('change:container.height', (function(_this) {
      return function(model, value) {
        if (_this.active) {
          return _this.loadImageParts();
        }
      };
    })(this));
    this.on('change:container.width', (function(_this) {
      return function(model, value) {
        if (_this.active) {
          return _this.loadImageParts();
        }
      };
    })(this));
    this.on('change:scale', (function(_this) {
      return function(model, value) {
        var absLeft, absTop, previousScale, relZoomPositionX, relZoomPositionY, scaleDiff, zoomOffsetX, zoomOffsetY;
        _this.width = Math.round(_this.initWidth * value);
        _this.height = Math.round(_this.initHeight * value);
        previousScale = model.previousAttributes().scale;
        if (previousScale != null) {
          absTop = _this.container.top + _this.top;
          absLeft = _this.container.left + _this.left;
          relZoomPositionY = _this.zoomPosition.y - absTop;
          relZoomPositionX = _this.zoomPosition.x - absLeft;
          scaleDiff = _this.scale / previousScale;
          zoomOffsetY = relZoomPositionY - (scaleDiff * relZoomPositionY);
          zoomOffsetX = relZoomPositionX - (scaleDiff * relZoomPositionX);
          _this.top = Math.round(_this.top + zoomOffsetY);
          _this.left = Math.round(_this.left + zoomOffsetX);
        } else {
          _this.left = Math.round((_this.container.width - _this.width) / 2);
          _this.top = Math.ceil((_this.container.height - _this.height) / 2);
        }
        return _this.boxTopLeft();
      };
    })(this));
    return this.on('change:active', (function(_this) {
      return function(model, value) {
        if (value) {
          if (!_this.scale) {
            _this.scale = _this.initScale;
          }
          return _this.loadImageParts();
        }
      };
    })(this));
  },
  session: {
    zoomPosition: {
      type: 'object',
      "default": function() {
        return {
          x: 0,
          y: 0
        };
      }
    },
    active: 'boolean',
    level: 'number',
    imgPaths: 'array',
    imgPath: 'string',
    drag: 'object',
    partSize: 'number',
    initWidth: {
      type: 'number',
      "default": 0
    },
    initHeight: {
      type: 'number',
      "default": 0
    },
    left: {
      type: 'number',
      "default": 0
    },
    top: {
      type: 'number',
      "default": 0
    },
    scale: 'number',
    width: 'number',
    height: 'number'
  },
  children: {
    container: Container
  },
  derived: {
    initScale: {
      deps: ['initWidth', 'initHeight', 'container.height', 'container.width'],
      fn: function() {
        var scale, scaleX, scaleY;
        if (this.initWidth > 0 && this.initHeight > 0) {
          scaleX = this.container.width / this.initWidth;
          scaleY = this.container.height / this.initHeight;
          scale = Math.min.call(null, scaleX, scaleY);
          if (scale > 1) {
            scale = 1;
          }
          return scale;
        }
      }
    },
    columns: {
      deps: ['initWidth', 'partSize'],
      fn: function() {
        return Math.ceil(this.initWidth / this.partSize);
      }
    },
    rows: {
      deps: ['initHeight', 'partSize'],
      fn: function() {
        return Math.ceil(this.initHeight / this.partSize);
      }
    },
    boxSize: {
      deps: ['initWidth', 'initHeight'],
      fn: function() {
        return Math.max(this.initWidth, this.initHeight);
      }
    }
  },
  zoomIn: function(pageX, pageY) {
    this.zoomPosition = {
      x: pageX,
      y: pageY
    };
    if (this.scale < 1) {
      return this.scale += 0.05;
    }
  },
  zoomOut: function(pageX, pageY) {
    var scale;
    this.zoomPosition = {
      x: pageX,
      y: pageY
    };
    if (this.scale > this.initScale) {
      scale = this.scale -= 0.05;
      if (scale < this.initScale) {
        scale = this.initScale;
      }
      return this.scale = scale;
    }
  },
  startDrag: function(pageX, pageY) {
    return this.drag = {
      x: pageX - this.left,
      y: pageY - this.top
    };
  },
  mouseMove: function(pageX, pageY) {
    if (this.drag != null) {
      this.left = pageX - this.drag.x;
      this.top = pageY - this.drag.y;
      this.boxTopLeft();
      return this.loadImageParts();
    }
  },
  stopDrag: function() {
    return this.drag = null;
  },
  boxTopLeft: function() {
    if (this.height > this.container.height) {
      if (this.top > 0) {
        this.top = 0;
      } else if (this.top + this.height < this.container.height) {
        this.top = this.container.height - this.height;
      }
    } else {
      if (this.top < 0) {
        this.top = 0;
      } else if (this.top > this.container.height - this.height) {
        this.top = this.container.height - this.height;
      }
    }
    if (this.width > this.container.width) {
      if (this.left > 0) {
        return this.left = 0;
      } else if (this.left + this.width < this.container.width) {
        return this.left = this.container.width - this.width;
      }
    } else {
      if (this.left < 0) {
        return this.left = 0;
      } else if (this.left > this.container.width - this.width) {
        return this.left = this.container.width - this.width;
      }
    }
  },
  getImgId: function(row, column) {
    return "id-" + this.level + "-" + (row * this.partSize) + "-" + (column * this.partSize);
  }
});

module.exports = Level;


},{"./container":34,"ampersand-state":7}],36:[function(_dereq_,module,exports){
var Level, View;

View = _dereq_('ampersand-view');

Level = View.extend({
  initialize: function() {
    this.model.on('change:left', (function(_this) {
      return function(model, value, options) {
        return _this.el.style.left = "" + value + "px";
      };
    })(this));
    this.model.on('change:top', (function(_this) {
      return function(model, value, options) {
        return _this.el.style.top = "" + value + "px";
      };
    })(this));
    this.model.on('change:scale', (function(_this) {
      return function(model, scale) {
        _this.el.style.transform = "scale(" + scale + ")";
        return _this.el.style.WebkitTransform = "scale(" + scale + ")";
      };
    })(this));
    this.model.on('change:active', (function(_this) {
      return function(model, value) {
        var func;
        func = value ? 'add' : 'remove';
        _this.el.classList[func]('active');
        if (value) {
          return _this.el.style.transform = "scale(" + model.scale + ")";
        }
      };
    })(this));
    return this.model.on('change:visible', (function(_this) {
      return function(model, value) {
        var func;
        func = value ? 'add' : 'remove';
        return _this.el.classList[func]('visible');
      };
    })(this));
  },
  render: function() {
    var column, div, img, row, _i, _j, _ref, _ref1;
    this.el = document.createElement('figure');
    this.el.setAttribute('data-level', this.model.level);
    for (row = _i = 0, _ref = this.model.rows; 0 <= _ref ? _i < _ref : _i > _ref; row = 0 <= _ref ? ++_i : --_i) {
      div = document.createElement('div');
      div.className = 'row';
      for (column = _j = 0, _ref1 = this.model.columns; 0 <= _ref1 ? _j < _ref1 : _j > _ref1; column = 0 <= _ref1 ? ++_j : --_j) {
        img = document.createElement('img');
        img.id = this.model.getImgId(row, column);
        img.setAttribute('draggable', false);
        img.src = "/images/blank.gif";
        div.appendChild(img);
      }
      this.el.appendChild(div);
    }
    this.boundTouchStart = this.onTouchStart.bind(this);
    this.boundTouchMove = this.onTouchMove.bind(this);
    this.boundTouchEnd = this.onTouchEnd.bind(this);
    this.boundGestureChange = this.onGestureChange.bind(this);
    this.el.addEventListener('touchstart', this.boundTouchStart);
    this.el.addEventListener('touchmove', this.boundTouchMove);
    this.el.addEventListener('touchend', this.boundTouchEnd);
    this.el.addEventListener('gesturechange', this.boundGestureChange);
    return this;
  },
  events: {
    'mousewheel': 'onMouseWheel',
    'mouseup': 'onMouseUp',
    'mousemove': 'onMouseMove',
    'mousedown': 'onMouseDown'
  },
  onMouseWheel: function(ev) {
    var func;
    func = ev.wheelDeltaY > 0 ? 'zoomIn' : 'zoomOut';
    return this.model[func](ev.pageX, ev.pageY);
  },
  onMouseDown: function(ev) {
    return this.model.startDrag(ev.pageX, ev.pageY);
  },
  onMouseMove: function(ev) {
    return this.model.mouseMove(ev.pageX, ev.pageY);
  },
  onMouseUp: function(ev) {
    return this.model.stopDrag();
  },
  onTouchStart: function(ev) {
    return this.model.startDrag(ev.pageX, ev.pageY);
  },
  onTouchMove: function(ev) {
    return this.model.mouseMove(ev.pageX, ev.pageY);
  },
  onTouchEnd: function(ev) {
    return this.model.stopDrag();
  },
  onGestureChange: function(ev) {
    var func;
    ev.preventDefault();
    if (ev.scale < 1.0) {
      func = 'zoomIn';
    } else if (ev.scale > 1.0) {
      func = 'zoomOut';
    }
    return this.model[func](ev.pageX, ev.pageY);
  },
  remove: function() {
    this.el.removeEventListener('touchstart', this.boundTouchStart);
    this.el.removeEventListener('touchmove', this.boundTouchMove);
    this.el.removeEventListener('touchend', this.boundTouchEnd);
    this.el.removeEventListener('gesturechange', this.boundGestureChange);
    this.stopListening();
    if (this.el.parentNode != null) {
      return this.el.parentNode.removeChild(this.el);
    }
  }
});

module.exports = Level;


},{"ampersand-view":12}],37:[function(_dereq_,module,exports){
var Container, Level, LevelView, Levels, Main, View, funckyEl, funckyReq;

funckyReq = _dereq_('funcky.req');

funckyEl = _dereq_('funcky.el').el;

Levels = _dereq_('../collections/levels');

Level = _dereq_('../models/level');

Container = _dereq_('../models/container');

View = _dereq_('ampersand-view');

LevelView = _dereq_('./level');

Main = View.extend({
  initialize: function(options) {
    var req, _base;
    this.options = options != null ? options : {};
    if (this.options.imgPath == null) {
      throw new ReferenceError('[HiLoupe] @options.imgPath missing!');
    }
    if ((_base = this.options).debug == null) {
      _base.debug = false;
    }
    this.collection = new Levels();
    req = funckyReq.get("" + this.options.imgPath + "/metadata.json");
    req.done((function(_this) {
      return function(xhr) {
        var data;
        data = JSON.parse(xhr.response);
        return _this.renderLevels(data);
      };
    })(this));
    window.addEventListener('resize', (function(_this) {
      return function() {
        var box;
        box = funckyEl(_this.parent).boundingBox();
        return _this.collection.each(function(level) {
          return level.set({
            container: box
          });
        });
      };
    })(this));
    return this.render();
  },
  renderLevels: function(data) {
    var containerBox;
    containerBox = funckyEl(this.parent).boundingBox();
    data.levels.forEach((function(_this) {
      return function(levelData, levelNo) {
        var fit, level;
        if (containerBox.width > containerBox.height) {
          fit = containerBox.height < levelData.height;
        } else {
          fit = containerBox.width < levelData.width;
        }
        if (fit) {
          level = new Level({
            imgPath: _this.options.imgPath,
            partSize: data.partSize,
            level: levelNo,
            container: containerBox,
            initWidth: levelData.width,
            initHeight: levelData.height
          });
          return _this.collection.add(level);
        }
      };
    })(this));
    this.renderCollection(this.collection, LevelView, this.el);
    return this.collection.active().active = true;
  },
  render: function() {
    var div;
    this.el = document.createElement('div');
    this.el.className = "hiloupe";
    if (this.options.debug) {
      this.collection.on('change:scale', this.renderDebug.bind(this));
      div = document.createElement('div');
      div.id = 'debug';
      this.el.appendChild(div);
    }
    return this;
  },
  renderDebug: function(model, value) {
    var debug, html;
    debug = document.getElementById('debug');
    html = "active level: " + (this.collection.active().level) + " of " + (this.collection.length - 1) + "<br>";
    this.collection.each(function(model) {
      return html += "<h4>Level " + model.level + "</h4> <ul> <li><label>width</label><span>" + model.width + "</span></li> <li><label>height</label><span>" + model.height + "</span></li> <li><label>top</label><span>" + model.top + "</span></li> <li><label>left</label><span>" + model.left + "</span></li> <li><label>scale</label><span>" + model.scale + "</span></li> </ul>";
    });
    return debug.innerHTML = html;
  }
});

module.exports = Main;


},{"../collections/levels":33,"../models/container":34,"../models/level":35,"./level":36,"ampersand-view":12,"funcky.el":30,"funcky.req":31}]},{},[37])
(37)
});