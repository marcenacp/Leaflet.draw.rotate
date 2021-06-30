(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
}((function () { 'use strict';

  /**
   * Leaflet vector features drag functionality
   * @author Alexander Milevski <info@w8r.name>
   * @preserve
   */

  /**
   * Matrix transform path for SVG/VML
   * Renderer-independent
   */
  const TRANSPARENT_COLOR = "rgba(0,0,0,0)";
  L.Path.include({
    /**
     * Applies matrix transformation to SVG
     * @param {Array.<Number>?} matrix
     */
    _transform: function (matrix) {
      if (this._renderer) {
        if (matrix) {
          this._renderer.transformPath(this, matrix);
        } else {
          // reset transform matrix
          this._renderer._resetTransformPath(this);

          this._update();
        }
      }

      return this;
    },

    /**
     * Check if the feature was dragged, that'll supress the click event
     * on mouseup. That fixes popups for example
     *
     * @param  {MouseEvent} e
     */
    _onMouseClick: function (e) {
      if (this.dragging && this.dragging.moved() || this._map.dragging && this._map.dragging.moved()) {
        return;
      }

      this._fireMouseEvent(e);
    }
  });
  var END = {
    mousedown: "mouseup",
    touchstart: "touchend",
    pointerdown: "touchend",
    MSPointerDown: "touchend"
  };
  var MOVE = {
    mousedown: "mousemove",
    touchstart: "touchmove",
    pointerdown: "touchmove",
    MSPointerDown: "touchmove"
  };

  function distance(a, b) {
    var dx = a.x - b.x,
        dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  /**
   * Drag handler
   * @class L.Path.Drag
   * @extends {L.Handler}
   */


  L.Handler.PathDrag = L.Handler.extend(
  /** @lends  L.Path.Drag.prototype */
  {
    statics: {
      DRAGGING_CLS: "leaflet-path-draggable"
    },

    /**
     * @param  {L.Path} path
     * @constructor
     */
    initialize: function (path) {
      /**
       * @type {L.Path}
       */
      this._path = path;
      /**
       * @type {Array.<Number>}
       */

      this._matrix = null;
      /**
       * @type {L.Point}
       */

      this._startPoint = null;
      /**
       * @type {L.Point}
       */

      this._dragStartPoint = null;
      /**
       * @type {Boolean}
       */

      this._mapDraggingWasEnabled = false;
    },

    /**
     * Enable dragging
     */
    addHooks: function () {
      this._path.on("mousedown", this._onDragStart, this);

      this._path.options.className = this._path.options.className ? this._path.options.className + " " + L.Handler.PathDrag.DRAGGING_CLS : L.Handler.PathDrag.DRAGGING_CLS;

      if (this._path._path) {
        L.DomUtil.addClass(this._path._path, L.Handler.PathDrag.DRAGGING_CLS);
      }
    },

    /**
     * Disable dragging
     */
    removeHooks: function () {
      this._path.off("mousedown", this._onDragStart, this);

      this._path.options.className = this._path.options.className.replace(new RegExp("\\s+" + L.Handler.PathDrag.DRAGGING_CLS), "");

      if (this._path._path) {
        L.DomUtil.removeClass(this._path._path, L.Handler.PathDrag.DRAGGING_CLS);
      }
    },

    /**
     * @return {Boolean}
     */
    moved: function () {
      return this._path._dragMoved;
    },

    /**
     * Start drag
     * @param  {L.MouseEvent} evt
     */
    _onDragStart: function (evt) {
      if (!this._path._map) {
        return;
      }

      var eventType = evt.originalEvent._simulated ? "touchstart" : evt.originalEvent.type;
      this._mapDraggingWasEnabled = false;
      this._startPoint = evt.containerPoint.clone();
      this._dragStartPoint = evt.containerPoint.clone();
      this._matrix = [1, 0, 0, 1, 0, 0];
      L.DomEvent.stop(evt.originalEvent);
      L.DomUtil.addClass(this._path._renderer._container, "leaflet-interactive");
      L.DomEvent.on(document, MOVE[eventType], this._onDrag, this).on(document, END[eventType], this._onDragEnd, this);

      if (this._path._map.dragging.enabled()) {
        // I guess it's required because mousdown gets simulated with a delay
        //this._path._map.dragging._draggable._onUp(evt);
        this._path._map.dragging.disable();

        this._mapDraggingWasEnabled = true;
      }

      this._path._dragMoved = false;

      if (this._path._popup) {
        // that might be a case on touch devices as well
        this._path._popup._close();
      }

      this._replaceCoordGetters(evt);
    },

    /**
     * Dragging
     * @param  {L.MouseEvent} evt
     */
    _onDrag: function (evt) {
      if (!this._path._map) {
        return;
      }

      L.DomEvent.stop(evt);
      var first = evt.touches && evt.touches.length >= 1 ? evt.touches[0] : evt;

      var containerPoint = this._path._map.mouseEventToContainerPoint(first); // skip taps


      if (evt.type === "touchmove" && !this._path._dragMoved) {
        var totalMouseDragDistance = this._dragStartPoint.distanceTo(containerPoint);

        if (totalMouseDragDistance <= this._path._map.options.tapTolerance) {
          return;
        }
      }

      var x = containerPoint.x;
      var y = containerPoint.y;
      var dx = x - this._startPoint.x;
      var dy = y - this._startPoint.y; // Send events only if point was moved

      if (dx || dy) {
        if (!this._path._dragMoved) {
          this._path._dragMoved = true;

          this._path.fire("dragstart", evt); // we don't want that to happen on click


          this._path.bringToFront();
        }

        this._matrix[4] += dx;
        this._matrix[5] += dy;
        this._startPoint.x = x;
        this._startPoint.y = y;

        this._path.fire("predrag", evt);

        this._path._transform(this._matrix);

        this._path.fire("drag", evt);
      }
    },

    /**
     * Dragging stopped, apply
     * @param  {L.MouseEvent} evt
     */
    _onDragEnd: function (evt) {
      if (!this._path._map) {
        return;
      }

      var containerPoint = this._path._map.mouseEventToContainerPoint(evt);

      var moved = this.moved(); // apply matrix

      if (moved) {
        this._transformPoints(this._matrix);

        this._path._updatePath();

        this._path._project();

        this._path._transform(null);

        L.DomEvent.stop(evt);
      }

      L.DomEvent.off(document, "mousemove touchmove", this._onDrag, this);
      L.DomEvent.off(document, "mouseup touchend", this._onDragEnd, this);

      this._restoreCoordGetters(); // consistency


      if (moved) {
        this._path.fire("dragend", {
          distance: distance(this._dragStartPoint, containerPoint)
        }); // hack for skipping the click in canvas-rendered layers


        var contains = this._path._containsPoint;
        this._path._containsPoint = L.Util.falseFn;
        L.Util.requestAnimFrame(function () {
          L.DomEvent.skipped({
            type: "click"
          });
          this._path._containsPoint = contains;
        }, this);
      }

      this._matrix = null;
      this._startPoint = null;
      this._dragStartPoint = null;
      this._path._dragMoved = false;

      if (this._mapDraggingWasEnabled) {
        if (moved) {
          L.DomEvent.fakeStop({
            type: "click"
          });
        }

        this._path._map.dragging.enable();
      }
    },

    /**
     * Applies transformation, does it in one sweep for performance,
     * so don't be surprised about the code repetition.
     *
     * [ x ]   [ a  b  tx ] [ x ]   [ a * x + b * y + tx ]
     * [ y ] = [ c  d  ty ] [ y ] = [ c * x + d * y + ty ]
     *
     * @param {Array.<Number>} matrix
     */
    _transformPoints: function (matrix, dest) {
      if (!this._path._map) {
        return;
      }

      var path = this._path;
      var i, len, latlng;
      var px = L.point(matrix[4], matrix[5]);
      var crs = path._map.options.crs;
      var transformation = crs.transformation;
      var scale = crs.scale(path._map.getZoom());
      var projection = crs.projection;
      var diff = transformation.untransform(px, scale).subtract(transformation.untransform(L.point(0, 0), scale));
      var applyTransform = !dest;
      path._bounds = new L.LatLngBounds(); // console.time('transform');
      // all shifts are in-place

      if (path._point) {
        // L.Circle
        dest = projection.unproject(projection.project(path._latlng)._add(diff));

        if (applyTransform) {
          path._latlng = dest;

          path._point._add(px);
        }
      } else if (path._rings || path._parts) {
        // everything else
        var rings = path._rings || path._parts;
        var latlngs = path._latlngs;
        dest = dest || latlngs;

        if (!L.Util.isArray(latlngs[0])) {
          // polyline
          latlngs = [latlngs];
          dest = [dest];
        }

        for (i = 0, len = rings.length; i < len; i++) {
          dest[i] = dest[i] || [];

          for (var j = 0, jj = rings[i].length; j < jj; j++) {
            latlng = latlngs[i][j];
            dest[i][j] = projection.unproject(projection.project(latlng)._add(diff));

            if (applyTransform) {
              path._bounds.extend(latlngs[i][j]);

              rings[i][j]._add(px);
            }
          }
        }
      }

      return dest; // console.timeEnd('transform');
    },

    /**
     * If you want to read the latlngs during the drag - your right,
     * but they have to be transformed
     */
    _replaceCoordGetters: function () {
      if (this._path.getLatLng) {
        // Circle, CircleMarker
        this._path.getLatLng_ = this._path.getLatLng;
        this._path.getLatLng = L.Util.bind(function () {
          return this.dragging._transformPoints(this.dragging._matrix, {});
        }, this._path);
      } else if (this._path.getLatLngs) {
        this._path.getLatLngs_ = this._path.getLatLngs;
        this._path.getLatLngs = L.Util.bind(function () {
          return this.dragging._transformPoints(this.dragging._matrix, []);
        }, this._path);
      }
    },

    /**
     * Put back the getters
     */
    _restoreCoordGetters: function () {
      if (this._path.getLatLng_) {
        this._path.getLatLng = this._path.getLatLng_;
        delete this._path.getLatLng_;
      } else if (this._path.getLatLngs_) {
        this._path.getLatLngs = this._path.getLatLngs_;
        delete this._path.getLatLngs_;
      }
    }
  });
  /**
   * @param  {L.Path} layer
   * @return {L.Path}
   */

  L.Handler.PathDrag.makeDraggable = function (layer) {
    layer.dragging = new L.Handler.PathDrag(layer);
    return layer;
  };
  /**
   * Also expose as a method
   * @return {L.Path}
   */


  L.Path.prototype.makeDraggable = function () {
    return L.Handler.PathDrag.makeDraggable(this);
  };

  L.Path.addInitHook(function () {
    if (this.options.draggable) {
      // ensure interactive
      this.options.interactive = true;

      if (this.dragging) {
        this.dragging.enable();
      } else {
        L.Handler.PathDrag.makeDraggable(this);
        this.dragging.enable();
      }
    } else if (this.dragging) {
      this.dragging.disable();
    }
  });
  L.SVG.include({
    /**
     * Reset transform matrix
     */
    _resetTransformPath: function (layer) {
      layer._path.setAttributeNS(null, "transform", "");
    },

    /**
     * Applies matrix transformation to SVG
     * @param {L.Path}         layer
     * @param {Array.<Number>} matrix
     */
    transformPath: function (layer, matrix) {
      layer._path.setAttributeNS(null, "transform", "matrix(" + matrix.join(" ") + ")");
    }
  });
  L.SVG.include(!L.Browser.vml ? {} : {
    /**
     * Reset transform matrix
     */
    _resetTransformPath: function (layer) {
      if (layer._skew) {
        // super important! workaround for a 'jumping' glitch:
        // disable transform before removing it
        layer._skew.on = false;

        layer._path.removeChild(layer._skew);

        layer._skew = null;
      }
    },

    /**
     * Applies matrix transformation to VML
     * @param {L.Path}         layer
     * @param {Array.<Number>} matrix
     */
    transformPath: function (layer, matrix) {
      var skew = layer._skew;

      if (!skew) {
        skew = L.SVG.create("skew");

        layer._path.appendChild(skew);

        skew.style.behavior = "url(#default#VML)";
        layer._skew = skew;
      } // handle skew/translate separately, cause it's broken


      var mt = matrix[0].toFixed(8) + " " + matrix[1].toFixed(8) + " " + matrix[2].toFixed(8) + " " + matrix[3].toFixed(8) + " 0 0";
      var offset = Math.floor(matrix[4]).toFixed() + ", " + Math.floor(matrix[5]).toFixed() + "";
      var s = this._path.style;
      var l = parseFloat(s.left);
      var t = parseFloat(s.top);
      var w = parseFloat(s.width);
      var h = parseFloat(s.height);

      if (isNaN(l)) {
        l = 0;
      }

      if (isNaN(t)) {
        t = 0;
      }

      if (isNaN(w) || !w) {
        w = 1;
      }

      if (isNaN(h) || !h) {
        h = 1;
      }

      var origin = (-l / w - 0.5).toFixed(8) + " " + (-t / h - 0.5).toFixed(8);
      skew.on = "f";
      skew.matrix = mt;
      skew.origin = origin;
      skew.offset = offset;
      skew.on = true;
    }
  });

  function TRUE_FN() {
    return true;
  }

  L.Canvas.include({
    /**
     * Do nothing
     * @param  {L.Path} layer
     */
    _resetTransformPath: function (layer) {
      if (!this._containerCopy) {
        return;
      }

      delete this._containerCopy;

      if (layer._containsPoint_) {
        layer._containsPoint = layer._containsPoint_;
        delete layer._containsPoint_;

        this._requestRedraw(layer);
      }
    },

    /**
     * Algorithm outline:
     *
     * 1. pre-transform - clear the path out of the canvas, copy canvas state
     * 2. at every frame:
     *    2.1. save
     *    2.2. redraw the canvas from saved one
     *    2.3. transform
     *    2.4. draw path
     *    2.5. restore
     * 3. Repeat
     *
     * @param  {L.Path}         layer
     * @param  {Array.<Number>} matrix
     */
    transformPath: function (layer, matrix) {
      var copy = this._containerCopy;
      var ctx = this._ctx,
          copyCtx;
      var m = L.Browser.retina ? 2 : 1;
      var bounds = this._bounds;
      var size = bounds.getSize();
      var pos = bounds.min;

      if (!copy) {
        // get copy of all rendered layers
        copy = this._containerCopy = document.createElement("canvas");
        copyCtx = copy.getContext("2d"); // document.body.appendChild(copy);

        copy.width = m * size.x;
        copy.height = m * size.y;

        this._removePath(layer);

        this._redraw();

        copyCtx.translate(m * bounds.min.x, m * bounds.min.y);
        copyCtx.drawImage(this._container, 0, 0);

        this._initPath(layer); // avoid flickering because of the 'mouseover's


        layer._containsPoint_ = layer._containsPoint;
        layer._containsPoint = TRUE_FN;
      }

      ctx.save();
      ctx.clearRect(pos.x, pos.y, size.x * m, size.y * m);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.drawImage(this._containerCopy, 0, 0, size.x, size.y);
      ctx.transform.apply(ctx, matrix); // now draw one layer only

      this._drawing = true;

      layer._updatePath();

      this._drawing = false;
      ctx.restore();
    }
  });
  /**
   * Drag/rotate/resize handler for [leaflet](http://leafletjs.com) vector features.
   *
   * @author Alexander Milevski <info@w8r.name>
   * @license MIT
   * @preserve
   */

  /**
   * @namespace
   * @type {Object}
   */

  L.PathTransform = {};
  /**
   * Point on the line segment or its extention
   *
   * @param  {L.Point} start
   * @param  {L.Point} final
   * @param  {Number}  distPx
   * @return {L.Point}
   */

  L.PathTransform.pointOnLine = function (start, final, distPx) {
    var ratio = 1 + distPx / start.distanceTo(final);
    return new L.Point(start.x + (final.x - start.x) * ratio, start.y + (final.y - start.y) * ratio);
  };
  /**
   * Deep merge objects.
   */


  L.PathTransform.merge = function () {
    var i = 1;
    var key, val;
    var obj = arguments[i];

    function isObject(object) {
      return Object.prototype.toString.call(object) === "[object Object]";
    } // make sure we don't modify source element and it's properties
    // objects are passed by reference


    var target = arguments[0];

    while (obj) {
      obj = arguments[i++];

      for (key in obj) {
        if (!obj.hasOwnProperty(key)) {
          continue;
        }

        val = obj[key];

        if (isObject(val) && isObject(target[key])) {
          target[key] = L.Util.merge(target[key], val);
        } else {
          target[key] = val;
        }
      }
    }

    return target;
  };
  /**
   * @class  L.Matrix
   *
   * @param {Number} a
   * @param {Number} b
   * @param {Number} c
   * @param {Number} d
   * @param {Number} e
   * @param {Number} f
   */


  L.Matrix = function (a, b, c, d, e, f) {
    /**
     * @type {Array.<Number>}
     */
    this._matrix = [a, b, c, d, e, f];
  };

  L.Matrix.prototype = {
    /**
     * @param  {L.Point} point
     * @return {L.Point}
     */
    transform: function (point) {
      return this._transform(point.clone());
    },

    /**
     * Destructive
     *
     * [ x ] = [ a  b  tx ] [ x ] = [ a * x + b * y + tx ]
     * [ y ] = [ c  d  ty ] [ y ] = [ c * x + d * y + ty ]
     *
     * @param  {L.Point} point
     * @return {L.Point}
     */
    _transform: function (point) {
      var matrix = this._matrix;
      var x = point.x,
          y = point.y;
      point.x = matrix[0] * x + matrix[1] * y + matrix[4];
      point.y = matrix[2] * x + matrix[3] * y + matrix[5];
      return point;
    },

    /**
     * @param  {L.Point} point
     * @return {L.Point}
     */
    untransform: function (point) {
      var matrix = this._matrix;
      return new L.Point((point.x / matrix[0] - matrix[4]) / matrix[0], (point.y / matrix[2] - matrix[5]) / matrix[2]);
    },

    /**
     * @return {L.Matrix}
     */
    clone: function () {
      var matrix = this._matrix;
      return new L.Matrix(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    },

    /**
     * @param {L.Point=|Number=} translate
     * @return {L.Matrix|L.Point}
     */
    translate: function (translate) {
      if (translate === undefined) {
        return new L.Point(this._matrix[4], this._matrix[5]);
      }

      var translateX, translateY;

      if (typeof translate === "number") {
        translateX = translateY = translate;
      } else {
        translateX = translate.x;
        translateY = translate.y;
      }

      return this._add(1, 0, 0, 1, translateX, translateY);
    },

    /**
     * @param {L.Point=|Number=} scale
     * @return {L.Matrix|L.Point}
     */
    scale: function (scale, origin) {
      if (scale === undefined) {
        return new L.Point(this._matrix[0], this._matrix[3]);
      }

      var scaleX, scaleY;
      origin = origin || L.point(0, 0);

      if (typeof scale === "number") {
        scaleX = scaleY = scale;
      } else {
        scaleX = scale.x;
        scaleY = scale.y;
      }

      return this._add(scaleX, 0, 0, scaleY, origin.x, origin.y)._add(1, 0, 0, 1, -origin.x, -origin.y);
    },

    /**
     * m00  m01  x - m00 * x - m01 * y
     * m10  m11  y - m10 * x - m11 * y
     * @param {Number}   angle
     * @param {L.Point=} origin
     * @return {L.Matrix}
     */
    rotate: function (angle, origin) {
      var cos = Math.cos(angle);
      var sin = Math.sin(angle);
      origin = origin || new L.Point(0, 0);
      return this._add(cos, sin, -sin, cos, origin.x, origin.y)._add(1, 0, 0, 1, -origin.x, -origin.y);
    },

    /**
     * Invert rotation
     * @return {L.Matrix}
     */
    flip: function () {
      this._matrix[1] *= -1;
      this._matrix[2] *= -1;
      return this;
    },

    /**
     * @param {Number|L.Matrix} a
     * @param {Number} b
     * @param {Number} c
     * @param {Number} d
     * @param {Number} e
     * @param {Number} f
     */
    _add: function (a, b, c, d, e, f) {
      var result = [[], [], []];
      var src = this._matrix;
      var m = [[src[0], src[2], src[4]], [src[1], src[3], src[5]], [0, 0, 1]];
      var other = [[a, c, e], [b, d, f], [0, 0, 1]],
          val;

      if (a && a instanceof L.Matrix) {
        src = a._matrix;
        other = [[src[0], src[2], src[4]], [src[1], src[3], src[5]], [0, 0, 1]];
      }

      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          val = 0;

          for (var k = 0; k < 3; k++) {
            val += m[i][k] * other[k][j];
          }

          result[i][j] = val;
        }
      }

      this._matrix = [result[0][0], result[1][0], result[0][1], result[1][1], result[0][2], result[1][2]];
      return this;
    }
  };

  L.matrix = function (a, b, c, d, e, f) {
    return new L.Matrix(a, b, c, d, e, f);
  };
  /**
   * Marker handler
   * @extends {L.CircleMarker}
   */


  L.PathTransform.Handle = L.CircleMarker.extend({
    options: {
      className: "leaflet-editing-icon leaflet-div-icon"
    },
    onAdd: function (map) {
      L.CircleMarker.prototype.onAdd.call(this, map);

      if (this._path && this.options.setCursor) {
        // SVG/VML
        this._path.style.cursor = L.PathTransform.Handle.CursorsByType[this.options.index];
      }
    }
  });
  /**
   * @const
   * @type {Array}
   */

  L.PathTransform.Handle.CursorsByType = ["nesw-resize", "nwse-resize", "nesw-resize", "nwse-resize"];
  /**
   * @extends {L.Handler.PathTransform.Handle}
   */

  L.PathTransform.RotateHandle = L.PathTransform.Handle.extend({
    options: {
      className: "leaflet-editing-icon leaflet-div-icon transform-handler--rotate"
    },
    onAdd: function (map) {
      L.CircleMarker.prototype.onAdd.call(this, map);

      if (this._path && this.options.setCursor) {
        // SVG/VML
        this._path.style.cursor = "all-scroll";
      }
    }
  });
  L.Handler.PathTransform = L.Handler.extend({
    options: {
      rotation: true,
      scaling: true,
      // uniformScaling: true,
      maxZoom: 22,
      // edge handlers
      handlerOptions: {
        // radius: 5,
        fillColor: "#ffffff",
        color: "#666",
        fillOpacity: 0.7,
        weight: 1,
        setCursor: true
      },
      // rectangle
      boundsOptions: {
        // weight: 1,
        color: TRANSPARENT_COLOR,
        opacity: 0,
        // dashArray: [3, 3],
        fill: false,
        noClip: true
      },
      // rotation handler
      rotateHandleOptions: {
        weight: 1,
        opacity: 1,
        color: "black",
        setCursor: true
      },
      // rotation handle length
      handleLength: 20,
      // maybe I'll add skewing in the future
      edgesCount: 4,
      handleClass: L.PathTransform.Handle,
      rotateHandleClass: L.PathTransform.RotateHandle
    },

    /**
     * @class L.Handler.PathTransform
     * @constructor
     * @param  {L.Path} path
     */
    initialize: function (path) {
      // references
      this._path = path;
      this._map = null; // handlers

      this._activeMarker = null;
      this._originMarker = null;
      this._rotationMarker = null; // origins & temporary state

      this._rotationOrigin = null;
      this._scaleOrigin = null;
      this._angle = 0;
      this._scale = L.point(1, 1);
      this._initialDist = 0;
      this._initialDistX = 0;
      this._initialDistY = 0;
      this._rotationStart = null;
      this._rotationOriginPt = null; // preview and transform matrix

      this._matrix = new L.Matrix(1, 0, 0, 1, 0, 0);
      this._projectedMatrix = new L.Matrix(1, 0, 0, 1, 0, 0); // ui elements

      this._handlersGroup = null;
      this._rect = null;
      this._handlers = [];
      this._handleLine = null;
      this._rotationIcon = null;
    },

    /**
     * If the polygon is not rendered, you can transform it yourself
     * in the coordinates, and do it properly.
     * @param {Object=} options
     */
    enable: function (options) {
      if (this._path._map) {
        this._map = this._path._map;

        if (options) {
          this.setOptions(options);
        }

        L.Handler.prototype.enable.call(this);
      }
    },

    /**
     * Init interactions and handlers
     */
    addHooks: function () {
      this._createHandlers();

      this._path.on("dragstart", this._onDragStart, this).on("scalestart", this._makeHandlersTransparent, this).on("dragend", this._onDragEnd, this);
    },

    /**
     * Remove handlers
     */
    removeHooks: function () {
      this._hideHandlers();

      this._path.off("dragstart", this._onDragStart, this).off("scalestart", this._makeHandlersTransparent, this).off("dragend", this._onDragEnd, this);

      this._handlersGroup = null;
      this._rect = null;
      this._handlers = [];
    },

    /**
     * Change editing options
     * @param {Object} options
     */
    setOptions: function (options) {
      var enabled = this._enabled;

      if (enabled) {
        this.disable();
      }

      this.options = L.PathTransform.merge({}, L.Handler.PathTransform.prototype.options, options);

      if (enabled) {
        this.enable();
      }

      return this;
    },

    /**
     * @param  {Number}   angle
     * @param  {L.LatLng} origin
     * @return {L.Handler.PathTransform}
     */
    rotate: function (angle, origin) {
      return this.transform(angle, null, origin);
    },

    /**
     * @param  {L.Point|Number} scale
     * @param  {L.LatLng}       origin
     * @return {L.Handler.PathTransform}
     */
    scale: function (scale, origin) {
      if (typeof scale === "number") {
        scale = L.point(scale, scale);
      }

      return this.transform(0, scale, null, origin);
    },

    /**
     * @param  {Number}    angle
     * @param  {L.Point}   scale
     * @param  {L.LatLng=} rotationOrigin
     * @param  {L.LatLng=} scaleOrigin
     * @return {L.Handler.PathTransform}
     */
    transform: function (angle, scale, rotationOrigin, scaleOrigin) {
      var center = this._path.getCenter();

      rotationOrigin = rotationOrigin || center;
      scaleOrigin = scaleOrigin || center;
      this._map = this._path._map;

      this._transformPoints(this._path, angle, scale, rotationOrigin, scaleOrigin);

      this._transformPoints(this._rect, angle, scale, rotationOrigin, scaleOrigin);

      this._transformPoints(this._handleLine, angle, scale, rotationOrigin, scaleOrigin);

      this._transformPoints(this._rotationIcon, angle, scale, rotationOrigin, scaleOrigin);

      this._updateHandlers();

      return this;
    },

    /**
     * Update the polygon and handlers preview, no reprojection
     */
    _update: function () {
      if (!this._path) {
        return;
      }

      var matrix = this._matrix; // update handlers

      for (var i = 0, len = this._handlers.length; i < len; i++) {
        var handler = this._handlers[i];

        if (handler !== this._originMarker) {
          handler._point = matrix.transform(handler._initialPoint);

          handler._updatePath();
        }
      }

      matrix = matrix.clone().flip();

      this._applyTransform(matrix);

      this._path.fire("transform", {
        layer: this._path
      });
    },

    /**
     * @param  {L.Matrix} matrix
     */
    _applyTransform: function (matrix) {
      this._path._transform(matrix._matrix);

      this._rect._transform(matrix._matrix);

      if (this.options.rotation) {
        this._handleLine._transform(matrix._matrix);
      }
    },

    /**
     * Apply final transformation
     */
    _apply: function () {
      //console.group('apply transform');
      var map = this._map;

      var matrix = this._matrix.clone();

      var angle = this._angle;

      var scale = this._scale.clone();

      this._transformGeometries(); // update handlers


      for (var i = 0, len = this._handlers.length; i < len; i++) {
        var handler = this._handlers[i];
        handler._latlng = map.layerPointToLatLng(handler._point);
        delete handler._initialPoint;
        handler.redraw();
      }

      this._matrix = L.matrix(1, 0, 0, 1, 0, 0);
      this._scale = L.point(1, 1);
      this._angle = 0;

      this._updateHandlers();

      map.dragging.enable();

      this._path.fire("transformed", {
        matrix: matrix,
        scale: scale,
        rotation: angle,
        // angle: angle * (180 / Math.PI),
        layer: this._path
      }); // console.groupEnd('apply transform');

    },

    /**
     * Use this method to completely reset handlers, if you have changed the
     * geometry of transformed layer
     */
    reset: function () {
      if (this._enabled) {
        if (this._rect) {
          this._handlersGroup.removeLayer(this._rect);

          this._rect = this._getBoundingPolygon().addTo(this._handlersGroup);
        }

        this._updateHandlers();
      }
    },

    /**
     * Recalculate rotation handlers position
     */
    _updateHandlers: function () {
      var handlersGroup = this._handlersGroup;
      this._rectShape = this._rect.toGeoJSON();

      if (this._handleLine) {
        this._handlersGroup.removeLayer(this._handleLine);
      }

      if (this._rotationIcon) {
        this._handlersGroup.removeLayer(this._rotationIcon);
      }

      if (this._rotationMarker) {
        this._handlersGroup.removeLayer(this._rotationMarker);
      }

      this._handleLine = this._rotationMarker = this._rotationIcon = null;

      for (var i = this._handlers.length - 1; i >= 0; i--) {
        handlersGroup.removeLayer(this._handlers[i]);
      }

      this._createHandlers();
    },

    /**
     * Transform geometries separately
     */
    _transformGeometries: function () {
      this._path._transform(null);

      this._rect._transform(null);

      this._transformPoints(this._path);

      this._transformPoints(this._rect);

      if (this.options.rotation) {
        this._handleLine._transform(null);

        this._transformPoints(this._handleLine, this._angle, null, this._origin);
      }
    },

    /**
     * @param {Number} angle
     * @param {Number} scale
     * @param {L.LatLng=} rotationOrigin
     * @param {L.LatLng=} scaleOrigin
     */
    _getProjectedMatrix: function (angle, scale, rotationOrigin, scaleOrigin) {
      if (!this._path._map) {
        return;
      }

      var map = this._map;
      var zoom = map.getMaxZoom() || this.options.maxZoom;
      var matrix = L.matrix(1, 0, 0, 1, 0, 0);
      var origin;
      angle = angle || this._angle || 0;
      scale = scale || this._scale || L.point(1, 1);

      if (!(scale.x === 1 && scale.y === 1)) {
        scaleOrigin = scaleOrigin || this._scaleOrigin;
        origin = map.project(scaleOrigin, zoom);
        matrix = matrix._add(L.matrix(1, 0, 0, 1, origin.x, origin.y))._add(L.matrix(scale.x, 0, 0, scale.y, 0, 0))._add(L.matrix(1, 0, 0, 1, -origin.x, -origin.y));
      }

      if (angle) {
        rotationOrigin = rotationOrigin || this._rotationOrigin;
        origin = map.project(rotationOrigin, zoom);
        matrix = matrix.rotate(angle, origin).flip();
      }

      return matrix;
    },

    /**
     * @param  {L.LatLng} latlng
     * @param  {L.Matrix} matrix
     * @param  {L.Map}    map
     * @param  {Number}   zoom
     * @return {L.LatLng}
     */
    _transformPoint: function (latlng, matrix, map, zoom) {
      return map.unproject(matrix.transform(map.project(latlng, zoom)), zoom);
    },

    /**
     * Applies transformation, does it in one sweep for performance,
     * so don't be surprised about the code repetition.
     *
     * @param {L.Path}    path
     * @param {Number=}   angle
     * @param {L.Point=}  scale
     * @param {L.LatLng=} rotationOrigin
     * @param {L.LatLng=} scaleOrigin
     */
    _transformPoints: function (path, angle, scale, rotationOrigin, scaleOrigin) {
      if (!path._map) {
        return;
      }

      var map = path._map;
      var zoom = map.getMaxZoom() || this.options.maxZoom;
      var i, len;

      var projectedMatrix = this._projectedMatrix = this._getProjectedMatrix(angle, scale, rotationOrigin, scaleOrigin); // all shifts are in-place


      if (path._point) {
        // L.Circle
        path._latlng = this._transformPoint(path._latlng, projectedMatrix, map, zoom);
      } else if (path._rings || path._parts) {
        // everything else
        var rings = path._rings;
        var latlngs = path._latlngs;
        path._bounds = new L.LatLngBounds();

        if (!L.Util.isArray(latlngs[0])) {
          // polyline
          latlngs = [latlngs];
        }

        for (i = 0, len = rings.length; i < len; i++) {
          for (var j = 0, jj = rings[i].length; j < jj; j++) {
            latlngs[i][j] = this._transformPoint(latlngs[i][j], projectedMatrix, map, zoom);

            path._bounds.extend(latlngs[i][j]);
          }
        }
      }

      path._reset(); //console.timeEnd('transform');

    },

    /**
     * Creates markers and handles
     */
    _createHandlers: function () {
      var map = this._map;
      this._handlersGroup = this._handlersGroup || new L.LayerGroup().addTo(map);
      this._rect = this._rect || this._getBoundingPolygon().addTo(this._handlersGroup);

      if (this.options.scaling) {
        this._handlers = [];

        for (var i = 0; i < this.options.edgesCount; i++) {
          // TODO: add stretching
          this._handlers.push(this._createHandler(this._rect._latlngs[0][i], i * 2, i).addTo(this._handlersGroup));
        }
      } // add bounds


      if (this.options.rotation) {
        //add rotation handler
        this._createRotationHandlers();
      }
    },

    /**
     * Rotation marker and small connectin handle
     */
    _createRotationHandlers: function () {
      if (!this._path._map) {
        return;
      }

      var map = this._map;
      var latlngs = this._rect._latlngs[0];
      var bottom = new L.LatLng((latlngs[0].lat + latlngs[3].lat) / 2, (latlngs[0].lng + latlngs[3].lng) / 2); // hehe, top is a reserved word

      var topPoint = new L.LatLng((latlngs[1].lat + latlngs[2].lat) / 2, (latlngs[1].lng + latlngs[2].lng) / 2);
      var handlerPosition = map.layerPointToLatLng(L.PathTransform.pointOnLine(map.latLngToLayerPoint(bottom), map.latLngToLayerPoint(topPoint), this.options.handleLength));
      this._handleLine = new L.Polyline([topPoint, handlerPosition], this.options.rotateHandleOptions).addTo(this._handlersGroup);
      var RotateHandleClass = this.options.rotateHandleClass;
      this._rotationMarker = new RotateHandleClass(handlerPosition, this.options.handlerOptions).addTo(this._handlersGroup).on("mousedown", this._onRotateStart, this);
      const svgTemplate = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="400" height="448" viewBox="0 0 384 448">
    <path fill="none" stroke="black" stroke-width="10" d="M192.063 32.063c-105.75 0-192 86.25-192 192 0 57.25 25.25 111.25 69.25 147.75 3.25 2.5 8 2.25 10.75-0.5l34.5-34.25c1.5-1.75 2.25-4 2.25-6.25-0.25-2.25-1.25-4.5-3-5.75-31.75-24.5-49.75-61.25-49.75-101 0-70.5 57.5-128 128-128s128 57.5 128 128c0 32.75-12.5 63.75-34.25 87l-34.5-34.25c-4.5-4.75-11.5-6-17.25-3.5-6 2.5-10 8.25-10 14.75v112c0 8.75 7.25 16 16 16h112c6.5 0 12.25-4 14.75-10 2.5-5.75 1.25-12.75-3.5-17.25l-32.25-32.5c33.25-35.25 53-83 53-132.25 0-105.75-86.25-192-192-192z"></path>
    </svg>`;
      const iconUrl = "data:image/svg+xml;base64," + btoa(svgTemplate);
      const arrowsIcon = L.icon({
        iconSize: [25, 25],
        iconUrl: iconUrl
      });

      if (arrowsIcon.setStyle) {
        arrowsIcon.setStyle({
          cursor: "all-scroll",
          "z-index": 1000
        });
      }

      this._rotationIcon = new L.marker(handlerPosition).setIcon(arrowsIcon).addTo(this._handlersGroup).on("mousedown", this._onRotateStart, this);

      if (this._rotationIcon.setStyle) {
        this._rotationIcon.setStyle({
          "z-index": 1000
        });

        this._rotationIcon.setStyle({
          cursor: "all-scroll"
        });
      }

      this._rotationOrigin = new L.LatLng((topPoint.lat + bottom.lat) / 2, (topPoint.lng + bottom.lng) / 2);

      this._handlers.push(this._rotationMarker);
    },

    /**
     * @return {L.LatLng}
     */
    _getRotationOrigin: function () {
      var latlngs = this._rect._latlngs[0];
      var lb = latlngs[0];
      var rt = latlngs[2];
      return new L.LatLng((lb.lat + rt.lat) / 2, (lb.lng + rt.lng) / 2);
    },

    /**
     * Secure the rotation origin
     * @param  {Event} evt
     */
    _onRotateStart: function (evt) {
      if (!this._map) {
        return;
      }

      var map = this._map;
      map.dragging.disable();
      this._originMarker = null;
      this._rotationOriginPt = map.latLngToLayerPoint(this._getRotationOrigin());
      this._rotationStart = evt.layerPoint;
      this._initialMatrix = this._matrix.clone();
      this._angle = 0;

      this._path._map.on("mousemove", this._onRotate, this).on("mouseup", this._onRotateEnd, this);

      this._cachePoints();

      this._path.fire("transformstart", {
        layer: this._path
      }).fire("rotatestart", {
        layer: this._path,
        rotation: 0
      });
    },

    /**
     * @param  {Event} evt
     */
    _onRotate: function (evt) {
      var pos = evt.layerPoint;
      var previous = this._rotationStart;
      var origin = this._rotationOriginPt; // rotation step angle

      this._angle = Math.atan2(pos.y - origin.y, pos.x - origin.x) - Math.atan2(previous.y - origin.y, previous.x - origin.x);
      this._matrix = this._initialMatrix.clone().rotate(this._angle, origin).flip();

      this._update();

      if (this.options.rotation && this._rotationIcon && this._rotationIcon.setLatLng) {
        const latlng = new L.LatLng(pos.x, pos.y);

        this._map.addLayer(this._rotationIcon);

        this._rotationIcon.setLatLng(latlng);

        if (this._rotationIcon.setStyle) {
          this._rotationIcon.setStyle({
            "z-index": 10000
          });
        }
      }

      this._path.fire("rotate", {
        layer: this._path,
        rotation: this._angle
      });
    },

    /**
     * @param  {Event} evt
     */
    _onRotateEnd: function (evt) {
      if (!this._path || !this._path._map) {
        return;
      }

      this._path._map.off("mousemove", this._onRotate, this).off("mouseup", this._onRotateEnd, this);

      var angle = this._angle;

      this._apply();

      this._path.fire("rotateend", {
        layer: this._path,
        rotation: angle
      });
    },

    /**
     * Retourne un objet représentant une droite (y = ax +b) avec :
     * - son coefficient a et l'ordonnées à l'origine b
     * - son vecteur directeur v : (-b,a )
     *
     * @param ptA premier point par lequel passe la droite
     * @param ptB deuxiement point par lequel passe la droite
     * @returns {{a: number, b: number, v: array}}
     * @private
     */
    _line: function (ptA, ptB) {
      let line = {
        a: null,
        b: null,
        c: null
      };

      if (ptB.y - ptA.y === 0) {
        line = {
          a: 0,
          b: 1,
          c: ptA.y
        };
      } else {
        let diviseur = ptB.x - ptA.x;
        let a = (ptB.y - ptA.y) / diviseur;
        let c = ptB.y - a * ptB.x;
        line = {
          a: a,
          b: -1,
          c: c
        };
      }

      line.equation = line.a + "x + " + line.b + "y + " + line.c + " = 0";
      line.v = [-line.b, line.a];
      return line;
    },
    _lineVecteurNormalPoint: function (vecteur, pt) {
      // ax + by+ c = 0
      // vecteur (a, b) est normal à la droite.
      let c = -(vecteur[0] * pt.x) - vecteur[1] * pt.y;
      let line = {
        a: vecteur[0],
        b: vecteur[1],
        c: c
      };
      line.equation = line.a + "x + " + line.b + "y + " + line.c + " = 0";
      line.v = [-line.b, line.a];
      return line;
    },

    _intercept(l1, l2, ptH) {
      if (l2.v[0] === 0) {
        return {
          x: this._ptO.x,
          y: ptH.y
        };
      }

      if (l2.v[0] === Infinity || l2.v[0] === -Infinity) {
        return {
          x: ptH.x,
          y: this._ptO.y
        };
      }

      let a = l1.a;
      let b = l1.b;
      let e = l1.c;
      let A = l2.a;
      let B = l2.b;
      let E = l2.c;

      if (a === 0 && b === 1 && e === 0) {
        return {
          x: E / A,
          y: 0
        };
      }

      var y = (A * e / a - E) / (B - A * b / a);
      var x = (-b * y - e) / a;
      return {
        x: x,
        y: y
      };
    },

    /**
     * @param  {Event} evt
     */
    _onScaleStart: function (evt) {
      if (!this._map) {
        return;
      }

      var marker = evt.target;
      var map = this._map;

      if (map.dragging.enabled()) {
        map.dragging.disable();
        this._mapDraggingWasEnabled = true;
      }

      this._activeMarker = marker;
      this._originMarker = this._handlers[(marker.options.index + 2) % 4];
      this._scaleOrigin = this._originMarker.getLatLng();
      this._initialMatrix = this._matrix.clone();

      this._cachePoints();

      if (this.options.uniformScaling) {
        this._map.on("mousemove", this._onScaleUniform, this);
      } else {
        this._ptO = this._map.latLngToContainerPoint(this._originMarker._latlng);
        let handlerA = this._handlers[(marker.options.index + 1) % 4];
        this._ptA = this._map.latLngToContainerPoint(handlerA._latlng);
        let handlerB = this._handlers[(marker.options.index + 3) % 4];
        this._ptB = this._map.latLngToContainerPoint(handlerB._latlng);
        this._lineOA = this._line(this._ptO, this._ptA);
        this._lineOB = this._line(this._ptO, this._ptB);

        this._map.on("mousemove", this._onScaleStandard, this);
      }

      this._map.on("mouseup", this._onScaleEnd, this);

      this._initialDist = this._originMarker._point.distanceTo(this._activeMarker._point);
      this._initialDistX = this._originMarker._point.x - this._activeMarker._point.x;
      this._initialDistY = this._originMarker._point.y - this._activeMarker._point.y;

      this._path.fire("transformstart", {
        layer: this._path
      }).fire("scalestart", {
        layer: this._path,
        scale: L.point(1, 1)
      });

      this._map.removeLayer(this._handleLine);

      this._map.removeLayer(this._rotationMarker);

      this._map.removeLayer(this._rotationIcon);
    },
    _onScaleStandard: function (evt) {
      if (!this._path._map) {
        return;
      }

      var i, len;

      let ptH = this._map.latLngToContainerPoint(evt.latlng);

      let ptHlineOANormalLine = this._lineVecteurNormalPoint(this._lineOA.v, ptH); // calc H projection on OA


      let pHonLineOA = this._intercept(this._lineOA, ptHlineOANormalLine, ptH);

      let ptHlineOBNormalLine = this._lineVecteurNormalPoint(this._lineOB.v, ptH); // calc H projection on OB


      let pHonLineOB = this._intercept(this._lineOB, ptHlineOBNormalLine, ptH);

      if (this._path._rings || this._path._parts) {
        // everything else
        var rings = this._path._rings;
        var latlngs = this._path._latlngs;
        this._path._bounds = new L.LatLngBounds();

        if (!L.Util.isArray(latlngs[0])) {
          // polyline
          latlngs = [latlngs];
        }

        for (let indexHandler = 0; indexHandler < 4; indexHandler++) {
          let handler = this._handlers[indexHandler];
          let pathLatLng = null;

          for (i = 0, len = rings.length; i < len; i++) {
            for (var j = 0, jj = rings[i].length; j < jj; j++) {
              if (latlngs[i][j].lat === handler._latlng.lat && latlngs[i][j].lng === handler._latlng.lng) {
                pathLatLng = latlngs[i][j];
              }
            }
          }

          if (this._activeMarker.options.index === handler.options.index) {
            // on est sur le coin utilisé pour la modification
            handler._latlng.lat = evt.latlng.lat;
            handler._latlng.lng = evt.latlng.lng;
            pathLatLng.lat = evt.latlng.lat;
            pathLatLng.lng = evt.latlng.lng;
          }

          if (this._activeMarker.options.index === (handler.options.index + 1) % 4) {
            // on est sur le coin B
            let BPrimeLatLng = this._map.containerPointToLatLng(pHonLineOB);

            handler._latlng.lat = BPrimeLatLng.lat;
            handler._latlng.lng = BPrimeLatLng.lng;
            pathLatLng.lat = BPrimeLatLng.lat;
            pathLatLng.lng = BPrimeLatLng.lng;
          }

          if (this._activeMarker.options.index === (handler.options.index + 3) % 4) {
            // on est sur le coin A
            let APrimeLatLng = this._map.containerPointToLatLng(pHonLineOA);

            handler._latlng.lat = APrimeLatLng.lat;
            handler._latlng.lng = APrimeLatLng.lng;
            pathLatLng.lat = APrimeLatLng.lat;
            pathLatLng.lng = APrimeLatLng.lng;
          }
        }
      }

      this._path._reset();

      this._update();

      this._path.fire("scale", {
        layer: this._path,
        scale: this._scale.clone()
      });
    },

    /**
     * @param  {Event} evt
     */
    _onScaleUniform: function (evt) {
      if (!this._path._map) {
        return;
      }

      var originPoint = this._originMarker._point;
      var ratioX, ratioY;
      ratioX = originPoint.distanceTo(evt.layerPoint) / this._initialDist;
      ratioY = ratioX;
      this._scale = new L.Point(ratioX, ratioY); // update matrix

      this._matrix = this._initialMatrix.clone().scale(this._scale, originPoint);

      this._update();

      this._path.fire("scale", {
        layer: this._path,
        scale: this._scale.clone()
      });
    },

    /**
     * Scaling complete
     * @param  {Event} evt
     */
    _onScaleEnd: function (evt) {
      if (this._map && this._mapDraggingWasEnabled) {
        this._map.dragging.enable();
      }

      if (!this._path._map) {
        return;
      }

      this._map.off("mousemove", this._onScaleUniform, this).off("mousemove", this._onScaleStandard, this).off("mouseup", this._onScaleEnd, this);

      this._map.addLayer(this._handleLine);

      this._map.addLayer(this._rotationMarker);

      this._map.addLayer(this._rotationIcon);

      this._makeHandlersApparent();

      this._apply();

      this._path.fire("scaleend", {
        layer: this._path,
        scale: this._scale.clone()
      });
    },

    /**
     * Cache current handlers positions
     */
    _cachePoints: function () {
      this._handlersGroup.eachLayer(function (layer) {
        if (layer && layer.bringToFront) {
          layer.bringToFront();
        }
      });

      for (var i = 0, len = this._handlers.length; i < len; i++) {
        var handler = this._handlers[i];
        handler._initialPoint = handler._point.clone();
      }
    },

    /**
     * Bounding polygon
     * @return {L.Polygon}
     */
    _getBoundingPolygon: function () {
      if (this._rectShape) {
        return L.GeoJSON.geometryToLayer(this._rectShape, this.options.boundsOptions);
      } else {
        const latLngsBbox = this._path.getLatLngs();

        const rectangle = new L.Rectangle(latLngsBbox, this.options.boundsOptions);
        rectangle.setLatLngs(latLngsBbox);
        return rectangle;
      }
    },

    /**
     * Create corner marker
     * @param  {L.LatLng} latlng
     * @param  {Number}   type one of L.Handler.PathTransform.HandlerTypes
     * @param  {Number}   index
     * @return {L.Handler.PathTransform.Handle}
     */
    _createHandler: function (latlng, type, index) {
      var HandleClass = this.options.handleClass;
      var marker = new HandleClass(latlng, L.Util.extend({}, this.options.handlerOptions, {
        className: "leaflet-editing-icon leaflet-div-icon",
        index: index,
        type: type
      }));
      marker.on("mousedown", this._onScaleStart, this);
      return marker;
    },

    /**
     * Hide(not remove) the handlers layer
     */
    _hideHandlers: function () {
      this._map.removeLayer(this._handlersGroup);
    },

    /**
     * Make handlers transparent
     */
    _makeHandlersTransparent: function () {
      for (var i = this._handlers.length - 1; i >= 0; i--) {
        this._handlers[i].setStyle({
          color: TRANSPARENT_COLOR,
          fillColor: TRANSPARENT_COLOR
        });
      }
    },

    /**
     * Make handlers transparent
     */
    _makeHandlersApparent: function () {
      for (var i = this._handlers.length - 1; i >= 0; i--) {
        this._handlers[i].setStyle({
          color: "#ffffff",
          fillColor: "#ffffff"
        });
      }
    },

    /**
     * Hide handlers and rectangle
     */
    _onDragStart: function () {
      this._hideHandlers();
    },

    /**
     * Drag rectangle, re-create handlers
     */
    _onDragEnd: function (evt) {
      var rect = this._rect;

      var matrix = (evt.layer ? evt.layer : this._path).dragging._matrix.slice();

      if (!rect.dragging) {
        rect.dragging = new L.Handler.PathDrag(rect);
      }

      rect.dragging.enable();

      this._map.addLayer(rect);

      rect.dragging._transformPoints(matrix);

      rect._updatePath();

      rect._project();

      rect.dragging.disable();

      this._map.addLayer(this._handlersGroup);

      this._updateHandlers();

      this._path.fire("transformed", {
        scale: L.point(1, 1),
        rotation: 0,
        matrix: L.matrix.apply(undefined, matrix),
        translate: L.point(matrix[4], matrix[5]),
        layer: this._path
      });
    }
  });
  L.Path.addInitHook(function () {
    if (this.options.transform) {
      this.transform = new L.Handler.PathTransform(this, this.options.transform);
    }
  });

})));
