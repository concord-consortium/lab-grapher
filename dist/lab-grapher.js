!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.LabGrapher=e():"undefined"!=typeof global?global.LabGrapher=e():"undefined"!=typeof self&&(self.LabGrapher=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports.numberWidthUsingFormatter = function(elem, cx, cy, fontSizeInPixels, numberStr) {
  var testSVG,
      testText,
      bbox,
      width,
      height,
      node;

  testSVG = elem.append("svg")
    .attr("width",  cx)
    .attr("height", cy)
    .attr("class", "graph");

  testText = testSVG.append('g')
    .append("text")
      .attr("class", "axis")
      .attr("x", -fontSizeInPixels/4 + "px")
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(numberStr);

  node = testText.node();

  // This code is sometimes called by tests that use d3's jsdom-based mock SVG DOm, which
  // doesn't implement getBBox.
  if (node.getBBox) {
    bbox = testText.node().getBBox();
    width = bbox.width;
    height = bbox.height;
  } else {
    width = 0;
    height = 0;
  }

  testSVG.remove();
  return [width, height];
};

module.exports.axisProcessDrag = function(dragstart, currentdrag, domain) {
  var originExtent, maxDragIn,
      newdomain = domain,
      origin = 0,
      axis1 = domain[0],
      axis2 = domain[1],
      extent = axis2 - axis1;
  if (currentdrag !== 0) {
    if  ((axis1 >= 0) && (axis2 > axis1)) {                 // example: (20, 10, [0, 40]) => [0, 80]
      origin = axis1;
      originExtent = dragstart-origin;
      maxDragIn = originExtent * 0.4 + origin;
      if (currentdrag > maxDragIn) {
        change = originExtent / (currentdrag-origin);
        extent = axis2 - origin;
        newdomain = [axis1, axis1 + (extent * change)];
      }
    } else if ((axis1 < 0) && (axis2 > 0)) {                // example: (20, 10, [-40, 40])       => [-80, 80]
      origin = 0;                                           //          (-0.4, -0.2, [-1.0, 0.4]) => [-1.0, 0.4]
      originExtent = dragstart-origin;
      maxDragIn = originExtent * 0.4 + origin;
      if ((dragstart >= 0 && currentdrag > maxDragIn) || (dragstart  < 0  && currentdrag < maxDragIn)) {
        change = originExtent / (currentdrag-origin);
        newdomain = [axis1 * change, axis2 * change];
      }
    } else if ((axis1 < 0) && (axis2 < 0)) {                // example: (-60, -50, [-80, -40]) => [-120, -40]
      origin = axis2;
      originExtent = dragstart-origin;
      maxDragIn = originExtent * 0.4 + origin;
      if (currentdrag < maxDragIn) {
        change = originExtent / (currentdrag-origin);
        extent = axis1 - origin;
        newdomain = [axis2 + (extent * change), axis2];
      }
    }
  }
  newdomain[0] = +newdomain[0].toPrecision(5);
  newdomain[1] = +newdomain[1].toPrecision(5);
  return newdomain;
};

},{}],2:[function(require,module,exports){
var axis = require('./axis');
var i18n = require('./i18n');

module.exports = function Graph(idOrElement, options, message) {
  var api = {},   // Public API object to be returned.

      // D3 selection of the containing DOM element the graph is placed in
      elem,

      // Regular representation of containing DOM element the graph is placed in
      node,

      // JQuerified version of DOM element
      $node,

      // Size of containing DOM element
      cx, cy,

      // Calculated padding between edges of DOM container and interior plot area of graph.
      padding,

      // Object containing width and height in pixels of interior plot area of graph
      size,

      // D3 objects representing SVG elements/containers in graph
      svg,
      vis,
      plot,
      viewbox,
      title,
      xlabel,
      ylabel,
      selectedRulerX,
      selectedRulerY,

      // Strings used as tooltips when labels are visible but are truncated because
      // they are too big to be rendered into the space the graph allocates
      titleTooltip,

      // Instantiated D3 scale functions
      // currently either d3.scale.linear, d3.scale.log, or d3.scale.pow
      xScale,
      yScale,

      // The approximate number of gridlines in the plot, passed to d3.scale.ticks() function
      xTickCount,
      yTickCount,

      // Instantiated D3 line function: d3.svg.line()
      line,

      // numeric format functions wrapping the d3.format() functions
      fx,
      fy,

      // Instantiated D3 numeric format functions: d3.format()
      fx_d3,
      fy_d3,

      // Function for stroke styling of major and minor grid lines
      gridStroke = function(d) { return d ? "#ccc" : "#666"; },

      // Functions for translation of grid lines and associated numeric labels
      tx = function(d) { return "translate(" + xScale(d) + ",0)"; },
      ty = function(d) { return "translate(0," + yScale(d) + ")"; },

      // Div created and placed with z-index above all other graph layers that holds
      // graph action/mode buttons.
      buttonLayer,
      legendLayer,
      legendButton,
      selectionButton,
      drawButton,

      // div created above everything but the button layer for holding annotations
      annotationLayer,

      // Div created and placed with z-index under all other graph layers
      background,

      // Optional string which can be displayed in background of interior plot area of graph.
      notification,

      // Optonal set of annotations that can be added dynamically to call out features of a graph
      annotations = [],

      // An array of strings holding 0 or more lines for the title of the graph
      titles = [],

      // D3 selection containing canvas
      graphCanvas,

      // HTML5 Canvas object containing just plotted lines
      gcanvas,
      gctx,
      canvasFillStyle = "rgba(255,255,255, 0.0)",

      // The style of the cursor when hovering over a sample.point marker.
      // The cursor changes depending on the operations that can be performed.
      markerCursorStyle,

      // Metrics calculated to support layout of titles, axes as
      // well as text and numeric labels for axes.
      fontSizeInPixels,
      halfFontSizeInPixels,
      quarterFontSizeInPixels,
      titleFontSizeInPixels,
      axisFontSizeInPixels,
      xlabelFontSizeInPixels,
      ylabelFontSizeInPixels,

      // Array objects containing width and height of X and Y axis labels
      xlabelMetrics,
      ylabelMetrics,

      // Width of widest numeric labels on X and Y axes
      xAxisNumberWidth,
      yAxisNumberWidth,

      // Height of numeric labels on X and Y axes
      xAxisNumberHeight,
      yAxisNumberHeight,

      // Padding necessary for X and Y axis labels to leave enough room for numeric labels
      xAxisVerticalPadding,
      yAxisHorizontalPadding,

      // Padding necessary between right side of interior plot and edge of graph so
      // make room for numeric lanel on right edge of X axis.
      xAxisLabelHorizontalPadding,

      // Baselines calculated for positioning of X and Y axis labels.
      xAxisLabelBaseline,
      yAxisLabelBaseline,

      // Thickness of draggable areas for rescaling axes, these surround numeric labels
      xAxisDraggableHeight,
      yAxisDraggableWidth,

      // D3 SVG rects used to implement axis dragging
      xAxisDraggable,
      yAxisDraggable,

      // Strings used as tooltips when numeric axis draggables are visible but responsive
      // layout system has removed the axis labels because of small size of graph.
      xAxisDraggableTooltip,
      yAxisDraggableTooltip,

      // Used to calculate styles for markers appearing on samples/points (normally circles)
      markerRadius,
      markerStrokeWidth,

      // Stroke width used for lines in graph
      lineWidth,

      // Used to categorize size of graphs in responsive layout mode where
      // certain graph chrome is removed when graph is rendered smaller.
      sizeType = {
        category: "medium",
        value: 3,
        icon: 120,
        tiny: 240,
        small: 480,
        medium: 960,
        large: 1920
      },

      // State variables indicating whether an axis drag operation is in place.
      // NaN values are used to indicate operation not in progress and
      // checked like this: if (!isNaN(downx)) { resacle operation in progress }
      //
      // When drag/rescale operation is occuring values contain plot
      // coordinates of start of drag (0 is a valid value).
      downx = NaN,
      downy = NaN,

      // State variable indicating whether a data point is being dragged.
      // When data point drag operation is occuring value contain two element
      // array wiith plot coordinates of drag position.
      draggedPoint = null,

      // When a data point is selected contains two element array wiith plot coordinates
      // of selected data point.
      selected = null,

      // An array of data points in the plot which are near the cursor.
      // Normally used to temporarily display data point markers when cursor
      // is nearby when markAllDataPoints is disabled.
      selectable = [],

      // An array containing two-element arrays consisting of X and Y values for samples/points
      points = [],

      // Consumers of points that have been added by user clicks
      pointListeners = [],

      // An array containing 1 or more points arrays to be plotted. Data is not indexed here
      // and sorted when "sortPoints" option is enabled.
      pointArray,

      // Keeps the same set of points like pointArray, but data is not sorted, but provides
      // indexing instead.
      pointArrayIndexed,

      // Current extent of points plotted by graph.
      pointsXMin,
      pointsXMax,
      pointsYMin,
      pointsYMax,

      // Index into points array for current sample/point.
      // Normally references data point last added.
      // Current sample can refer to earlier points. This is
      // represented in the view by using a desaturated styling for
      // plotted data after te currentSample.
      currentSample,

      // When graphing data samples as opposed to [x, y] data pairs contains
      // the fixed time interval between subsequent samples.
      sampleInterval,

      // Normally data sent to graph as samples starts at an X value of 0
      // A different starting x value can be set
      dataSampleStart,

      // The default options for a graph
      default_options = {
        // Enables the button layer with: AutoScale ...
        showButtons:    true,

        // Whether or not to show the graph's legend
        legendVisible: false,

        // Responsive Layout provides pregressive removal of
        // graph elements when size gets smaller
        responsiveLayout: false,

        // Font sizes for graphs are normally specified using ems.
        // When fontScaleRelativeToParent to true the font-size of the
        // containing element is set based on the size of the containing
        // element. hs means whn the containing element is smaller the
        // foint-size of the labels in thegraph will be smaller.
        fontScaleRelativeToParent: true,

        enableAutoScaleButton: true,
        enableAxisScaling: true,

        enableSelectionButton: false,
        clearSelectionOnLeavingSelectMode: false,

        enableDrawButton: false,
        enableLegendButton: true,

        drawIndex: 0,

        //
        // dataType can be either 'points or 'samples'
        //
        dataType: 'points',
        //
        // dataType: 'points'
        //
        // Arrays of two-element arrays of x, y data pairs, this is the internal
        // format the graphers uses to represent data.
        dataPoints:      [],
        //
        // dataType: 'samples'
        //
        // An array of samples (or an array or arrays of samples)
        dataSamples:     [],
        // The constant time interval between sample values
        sampleInterval:  1,
        // Normally data sent to graph as samples starts at an X value of 0
        // A different starting x value can be set
        dataSampleStart: 0,

        // If true then all points added to graph will be sorted by X coordinate.
        sortPoints:      true,

        // title can be a string or an array of strings, if an
        // array of strings each element is on a separate line.
        title:          "graph",

        // The labels for the axes, these are separate from the numeric labels.
        xlabel:         "x-axis",
        ylabel:         "y-axis",

        // Initial extent of the X and Y axes.
        xmax:            10,
        xmin:            0,
        ymax:            10,
        ymin:            0,

        // Auto-scaling of X axis when at least one point exceeds current domain.
        autoScaleX:       true,
        autoScaleY:       true,
        autoScalePadding: 0.3,

        // Approximate values for how many gridlines should appear on the axes.
        xTickCount:      10,
        yTickCount:      10,

        // The formatter strings used to convert numbers into strings.
        // see: https://github.com/mbostock/d3/wiki/Formatting#wiki-d3_format
        xFormatter:      ".3s",
        yFormatter:      ".3s",

        // Scale type: options are:
        //   linear: https://github.com/mbostock/d3/wiki/Quantitative-Scales#wiki-linear
        //   log:    https://github.com/mbostock/d3/wiki/Quantitative-Scales#wiki-log
        //   pow:    https://github.com/mbostock/d3/wiki/Quantitative-Scales#wiki-pow
        xscale:         'linear',
        yscale:         'linear',

        // Used when scale type is set to "pow"
        xscaleExponent:  0.5,
        yscaleExponent:  0.5,

        // How many samples/points over which a graph shift should take place
        // when the data being plotted gets close to the edge of the X axis.
        axisShift:       10,

        // selectablePoints: false,

        // true if data points should be marked ... currently marked with a circle.
        markAllDataPoints:   false,

        // only show circles when hovering near them with the mouse or
        // tapping near then on a tablet
        markNearbyDataPoints: false,

        // number of circles to show on each side of the central point
        extraCirclesVisibleOnHover: 2,

        // true to show dashed horizontal and vertical rulers when a circle is selected
        showRulersOnSelection: false,

        // width of the line used for plotting
        lineWidth:      2.0,

        // Enable values of data points to be changed by selecting and dragging.
        dataChange:      false,

        // Enables adding of data to a graph by option/alt clicking in the graph.
        addData:         false,

        // Set value to a string and it will be rendered in background of graph.
        notification:    false,

        // Render lines between samples/points
        lines:           true,

        // Render vertical bars extending up to samples/points
        bars:            false,

        // Callback, called after autoscale button is clicked
        onAutoscale:     null,

        // Callack, called after X or Y axis is changed (due to any reason, e.g. manual or auto-scaling)
        onXDomainChange: null,
        onYDomainChange: null,

        // The R, G, and B values to be used to plot samples in each data channel. This default can
        // be overridden at construction time, but the caller must provide colors for each channel.
        // If there are n channels and m < n provided colors, the last n - m channels will be drawn
        // using the last color in the list
        dataColors: [
          "#a00000",     // channel 0   (red)
          "#2ca000",     // channel 1   (green-yellow)
          "#2c00a0"      // channels 2+ (blue-purple)
        ],

        // An array of strings to be paired with the data colors to build a legend
        legendLabels: []
      },

      // brush selection variables
      selection_region = {
        xmin: null,
        xmax: null,
        ymin: null,
        ymax: null
      },
      has_selection = false,
      selection_visible = false,
      selection_enabled = true,
      selection_listener,
      draw_enabled = false,
      brush_element,
      brush_control;


  // ------------------------------------------------------------
  //
  // Initialization
  //
  // ------------------------------------------------------------

  function initialize(idOrElement, opts, mesg) {
    if (opts || !options) {
      options = setupOptions(opts);
    }

    initializeLayout(idOrElement, mesg);

    options.xrange = options.xmax - options.xmin;
    options.yrange = options.ymax - options.ymin;

    if (Object.prototype.toString.call(options.title) === "[object Array]") {
      titles = options.title;
    } else {
      titles = [options.title];
    }
    titles.reverse();

    // use local variables for both access speed and for responsive over-riding
    sampleInterval = options.sampleInterval;
    dataSampleStart = options.dataSampleStart;
    lineWidth = options.lineWidth;

    size = {
      "width":  120,
      "height": 120
    };

    setupScales();

    fx_d3 = d3.format(options.xFormatter);
    fy_d3 = d3.format(options.yFormatter);

    // Wrappers around certain d3 formatters to prevent problems like this:
    //   scale = d3.scale.linear().domain([-.7164, .7164])
    //   scale.ticks(10).map(d3.format('.3r'))
    //   => ["-0.600", "-0.400", "-0.200", "-0.0000000000000000888", "0.200", "0.400", "0.600"]

    fx = function(num) {
      var domain = xScale.domain(),
          onePercent = Math.abs((domain[1] - domain[0])*0.01);
      if (Math.abs(0+num) < onePercent) {
        num = 0;
      }
      return fx_d3(num);
    };

    fy = function(num) {
      var domain = yScale.domain(),
          onePercent = Math.abs((domain[1] - domain[0])*0.01);
      if (Math.abs(0+num) < onePercent) {
        num = 0;
      }
      return fy_d3(num);
    };

    xTickCount = options.xTickCount;
    yTickCount = options.yTickCount;

    pointsXMin = pointsYMin = Infinity;
    pointsXMax = pointsYMax = -Infinity;
    pointArray = [];
    switch(options.dataType) {
      case "fake":
      points = fakeDataPoints();
      pointArray = [points];
      break;

      case 'points':
      resetDataPoints(options.dataPoints);
      break;

      case 'samples':
      resetDataSamples(options.dataSamples, sampleInterval, dataSampleStart);
      break;
    }

    selectable = [];
    selected = null;

    setCurrentSample(points.length);
  }

  function initializeLayout(idOrElement, mesg) {
    if (idOrElement) {
      // d3.select works both for element ID (e.g. "#grapher")
      // and for DOM element.
      elem = d3.select(idOrElement);
      node = elem.node();
      $node = $(node);
      // cx = $node.width();
      // cy = $node.height();
      cx = elem.property("clientWidth");
      cy = elem.property("clientHeight");
    }

    if (mesg) {
      message = mesg;
    }

    if (svg !== undefined) {
      svg.remove();
      svg = undefined;
    }

    if (background !== undefined) {
      background.remove();
      background = undefined;
    }

    if (graphCanvas !== undefined) {
      graphCanvas.remove();
      graphCanvas = undefined;
    }

    if (options.dataChange) {
      markerCursorStyle = "ns-resize";
    } else {
      markerCursorStyle = "crosshair";
    }

    scale();

    // drag axis logic
    downx = NaN;
    downy = NaN;
    draggedPoint = null;
  }

  function scale(w, h) {
    if (!w && !h) {
      cx = Math.max(elem.property("clientWidth"), 60);
      cy = Math.max(elem.property("clientHeight"),60);
    } else {
      cx = w;
      node.style.width =  cx +"px";
      if (!h) {
        node.style.height = "100%";
        h = elem.property("clientHeight");
        cy = h;
        node.style.height = cy +"px";
      } else {
        cy = h;
        node.style.height = cy +"px";
      }
    }
    calculateSizeType();
  }

  function calculateLayout() {
    scale();

    fontSizeInPixels = parseFloat($node.css("font-size"));

    if (!options.fontScaleRelativeToParent) {
      $node.css("font-size", 0.5 + sizeType.value/6 + 'em');
    }

    fontSizeInPixels = parseFloat($node.css("font-size"));

    halfFontSizeInPixels = fontSizeInPixels/2;
    quarterFontSizeInPixels = fontSizeInPixels/4;

    if (svg === undefined) {
      titleFontSizeInPixels =  fontSizeInPixels;
      axisFontSizeInPixels =   fontSizeInPixels;
      xlabelFontSizeInPixels = fontSizeInPixels;
      ylabelFontSizeInPixels = fontSizeInPixels;
    } else {
      titleFontSizeInPixels =  parseFloat($("svg.graph text.title").css("font-size"));
      axisFontSizeInPixels =   parseFloat($("svg.graph text.axis").css("font-size"));
      xlabelFontSizeInPixels = parseFloat($("svg.graph text.xlabel").css("font-size"));
      ylabelFontSizeInPixels = parseFloat($("svg.graph text.ylabel").css("font-size"));
    }
    updateAxesAndSize();

    updateScales();

    line = d3.svg.line()
        .x(function(d, i) { return xScale(points[i][0]); })
        .y(function(d, i) { return yScale(points[i][1]); });
  }

  function setupOptions(options) {
    if (options) {
      for(var p in default_options) {
        if (options[p] === undefined) {
          options[p] = default_options[p];
        }
      }
    } else {
      options = default_options;
    }
    if (options.axisShift < 1) options.axisShift = 1;
    return options;
  }

  function updateAxesAndSize() {
    if (xScale === undefined) {
      xlabelMetrics = [fontSizeInPixels, fontSizeInPixels];
      ylabelMetrics = [fontSizeInPixels*2, fontSizeInPixels];
    } else {
      xlabelMetrics = axis.numberWidthUsingFormatter(elem, cx, cy, axisFontSizeInPixels,
        longestNumber(xScale.ticks(xTickCount), fx));

      ylabelMetrics = axis.numberWidthUsingFormatter(elem, cx, cy, axisFontSizeInPixels,
        longestNumber(yScale.ticks(yTickCount), fy));
    }

    xAxisNumberWidth  = xlabelMetrics[0];
    xAxisNumberHeight = xlabelMetrics[1];

    xAxisLabelHorizontalPadding = xAxisNumberWidth * 0.6;
    xAxisDraggableHeight = xAxisNumberHeight * 1.1;
    xAxisVerticalPadding = xAxisDraggableHeight + xAxisNumberHeight*1.3;
    xAxisLabelBaseline = xAxisVerticalPadding-xAxisNumberHeight/3;

    yAxisNumberWidth  = ylabelMetrics[0];
    yAxisNumberHeight = ylabelMetrics[1];

    yAxisDraggableWidth    = yAxisNumberWidth + xAxisNumberHeight/4;
    yAxisHorizontalPadding = yAxisDraggableWidth + yAxisNumberHeight;
    yAxisLabelBaseline     = -(yAxisDraggableWidth+yAxisNumberHeight/4);

    switch(sizeType.value) {
      case 0:         // icon
      padding = {
        "top":    halfFontSizeInPixels,
        "right":  halfFontSizeInPixels,
        "bottom": fontSizeInPixels,
        "left":   fontSizeInPixels
      };
      break;

      case 1:         // tiny
      padding = {
        "top":    options.title  ? titleFontSizeInPixels*1.8 : fontSizeInPixels,
        "right":  halfFontSizeInPixels,
        "bottom": fontSizeInPixels,
        "left":   fontSizeInPixels
      };
      break;

      case 2:         // small
      padding = {
        "top":    options.title  ? titleFontSizeInPixels*1.8 : fontSizeInPixels,
        "right":  xAxisLabelHorizontalPadding,
        "bottom": fontSizeInPixels,
        "left":   fontSizeInPixels
      };
      xTickCount = Math.max(6, options.xTickCount/2);
      yTickCount = Math.max(6, options.yTickCount/2);
      break;

      case 3:         // medium
      padding = {
        "top":    options.title  ? titleFontSizeInPixels*1.8 : fontSizeInPixels,
        "right":  xAxisLabelHorizontalPadding,
        "bottom": fontSizeInPixels,
        "left":   fontSizeInPixels
      };
      break;

      default:         // large
      padding = {
        "top":    options.title  ? titleFontSizeInPixels*1.8 : fontSizeInPixels,
        "right":  xAxisLabelHorizontalPadding,
        "bottom": fontSizeInPixels,
        "left":   fontSizeInPixels
      };
      break;
    }

    if (sizeType.value > 2 ) {
      padding.top += (titles.length-1) * sizeType.value/3 * sizeType.value/3 * fontSizeInPixels;
    } else {
      titles = [titles[0]];
    }

    size.width  = Math.max(cx - padding.left - padding.right, 60);
    size.height = Math.max(cy - padding.top  - padding.bottom, 60);
  }

  function calculateSizeType() {
    if (options.responsiveLayout) {
      if (cx <= sizeType.icon) {
        sizeType.category = 'icon';
        sizeType.value = 0;
      } else if (cx <= sizeType.tiny) {
        sizeType.category = 'tiny';
        sizeType.value = 1;
      } else if (cx <= sizeType.small) {
        sizeType.category = 'small';
        sizeType.value = 2;
      } else if (cx <= sizeType.medium) {
        sizeType.category = 'medium';
        sizeType.value = 3;
      } else {
        sizeType.category = 'large';
        sizeType.value = 4;
      }
    } else {
      sizeType.category = 'large';
      sizeType.value = 4;
    }
  }

  function longestNumber(array, formatter, precision) {
    var longest = 0,
        index = 0,
        str,
        len,
        i;
    precision = precision || 5;
    for (i = 0; i < array.length; i++) {
      str = formatter(+array[i].toPrecision(precision));
      str = str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
      len = str.length;
      if (len > longest) {
        longest = len;
        index = i;
      }
    }
    return formatter(array[index]);
  }

  // Setup xScale, yScale, making sure that options.xmax/xmin/ymax/ymin always reflect changes to
  // the relevant domains.
  function setupScales() {
    function domainObservingScale(scale, callback) {
      var domain = scale.domain;
      var nice = scale.nice;
      scale.domain = function() {
        var result = domain.apply(scale, arguments);
        if (arguments.length) {
          callback();
        }
        return result;
      };
      scale.nice = function() {
        var result = nice.apply(scale, arguments);
        callback();
        return result;
      };
      return scale;
    }

    xScale = domainObservingScale(d3.scale[options.xscale](), function() {
      options.xmin = xScale.domain()[0];
      options.xmax = xScale.domain()[1];
      if (options.onXDomainChange) {
        options.onXDomainChange.call(null, options.xmin, options.xmax);
      }
    });
    yScale = domainObservingScale(d3.scale[options.yscale](), function() {
      options.ymin = yScale.domain()[0];
      options.ymax = yScale.domain()[1];
      if (options.onYDomainChange) {
        options.onYDomainChange.call(null, options.ymin, options.ymax);
      }
    });
    updateScales();
  }

  function updateScales() {
    updateXScale();
    updateYScale();
  }

  // Update the x-scale.
  function updateXScale() {
    xScale.domain([options.xmin, options.xmax])
          .range([0, size.width]);
  }

  // Update the y-scale.
  function updateYScale() {
    yScale.domain([options.ymin, options.ymax])
          .range([size.height, 0]);
  }

  function fakeDataPoints() {
    var yrange2 = options.yrange / 2,
        yrange4 = yrange2 / 2,
        pnts;

    options.datacount = size.width/30;
    options.xtic = options.xrange / options.datacount;
    options.ytic = options.yrange / options.datacount;

    pnts = d3.range(options.datacount).map(function(i) {
      return [i * options.xtic + options.xmin, options.ymin + yrange4 + Math.random() * yrange2 ];
    });
    return pnts;
  }

  function setCurrentSample(samplePoint) {
    if (typeof samplePoint === "number") {
      currentSample = samplePoint;
    } else if (samplePoint === "last") {
      currentSample = 0;
      pointArray.forEach(function (arr) {
        if (arr.length > currentSample) {
          currentSample = arr.length ;
        }
      });
    }
    if (typeof currentSample !== "number") {
      currentSample = points.length-1;
    }
    return currentSample;
  }

  // converts data samples into an array of points
  function indexedData(samples, interval, start) {
    var i = 0,
        pnts = [];
    interval = interval || 1;
    start = start || 0;
    for (i = 0; i < samples.length;  i++) {
      pnts.push([i * interval + start, samples[i]]);
    }
    return pnts;
  }

  //
  // Update notification message
  //
  function notify(mesg) {
    message = mesg;
    if (mesg) {
      notification.text(mesg);
    } else {
      notification.text('');
    }
  }


  function createButtonLayer() {
    buttonLayer = elem.append("div");

    buttonLayer
      .attr("class", "button-layer")
      .style("z-index", 3);

    if (options.enableLegendButton && options.legendLabels.length > 0) {
      legendButton = buttonLayer.append('a');
      legendButton.attr({
            "class": "legend-button",
            "title": i18n.t("tooltips.legend")
          })
          .on("click", function() {
            toggleLegend();
          })
          .append("i")
            .attr("class", "icon-list-ul");
    }

    if (options.enableAutoScaleButton) {
      buttonLayer.append('a')
          .attr({
            "class": "autoscale-button",
            "title": i18n.t("tooltips.autoscale")
          })
          .on("click", function() {
            autoscale(true);
            redraw();
          })
          .append("i")
            .attr("class", "icon-picture");
    }

    if (options.enableSelectionButton) {
      selectionButton = buttonLayer.append('a');
      selectionButton.attr({
            "class": "selection-button",
            "title": i18n.t("tooltips.selection")
          })
          .on("click", function() {
            toggleSelection();
          })
          .append("i")
            .attr("class", "icon-cut");
    }

    if (options.enableDrawButton) {
      drawButton = buttonLayer.append('a');
      drawButton.attr({
            "class": "draw-button",
            "title": i18n.t("tooltips.draw")
          })
          .on("click", function() {
            toggleDraw();
          })
          .append("i")
            .attr("class", "icon-pencil");
    }

    resizeButtonLayer();
  }

  function resizeButtonLayer() {
    buttonLayer
      .style({
        "width":   fontSizeInPixels*1.75 + "px",
        "height":  fontSizeInPixels*1.25 + "px",
        "top":     padding.top + halfFontSizeInPixels + "px",
        "left":    padding.left + (size.width - fontSizeInPixels*2.0) + "px"
      });
  }
  function createLegendLayer() {
    var color = "black", item;
    legendLayer = elem.append("ul");

    legendLayer
      .attr("class", "legend-layer")
      .style("z-index", 3);

    for (var i = 0; i < options.legendLabels.length; i++) {
      if (options.dataColors.length > i) {
        color = options.dataColors[i];
      }
      item = legendLayer.append("li");
      item.append("div")
        .attr("class", "legend-colorsquare")
        .style("background-color", color);
      item.append("label")
        .text(options.legendLabels[i]);
    }
  }

  function createAnnotationLayer() {
    annotationLayer = elem.append("div");

    annotationLayer
      .attr("class", "annotation-layer")
      .style("z-index", 3);

    resizeAnnotationLayer();
  }

  function resizeAnnotationLayer() {
    annotationLayer
      .style({
        "width": size.width + "px",
        "height": size.height + "px",
        "top": padding.top + "px",
        "left": padding.left + "px"
      });
  }

  // ------------------------------------------------------------
  //
  // Rendering
  //
  // ------------------------------------------------------------

  //
  // Render a new graph by creating the SVG and Canvas elements
  //
  function renderNewGraph() {
    svg = elem.append("svg")
        .attr("width",  cx)
        .attr("height", cy)
        .attr("class", "graph")
        .style('z-index', 2);
        // .attr("tabindex", tabindex || 0);

    vis = svg.append("g")
        .attr("transform", "translate(" + padding.left + "," + padding.top + ")");

    plot = vis.append("rect")
      .attr("class", "plot")
      .attr("width", size.width)
      .attr("height", size.height)
      .attr("pointer-events", "all")
      .attr("fill", "rgba(255,255,255,0)")
      .on("mousemove", plotMousemove)
      .on("mousedown", plotDrag)
      .on("touchstart", plotDrag);

    plot.call(d3.behavior.zoom().x(xScale).y(yScale).on("zoom", redraw));

    background = elem.append("div")
        .attr("class", "background")
        .style({
          "width":   size.width + "px",
          "height":  size.height + "px",
          "top":     padding.top + "px",
          "left":    padding.left + "px",
          "z-index": 0
        });

    createGraphCanvas();

    viewbox = vis.append("svg")
      .attr("class", "viewbox")
      .attr("top", 0)
      .attr("left", 0)
      .attr("width", size.width)
      .attr("height", size.height)
      .attr("viewBox", "0 0 "+size.width+" "+size.height);

    selectedRulerX = viewbox.append("line")
      .attr("stroke", gridStroke)
      .attr("stroke-dasharray", "2,2")
      .attr("y1", 0)
      .attr("y2", size.height)
      .attr("x1", function() { return selected === null ? 0 : selected[0]; } )
      .attr("x2", function() { return selected === null ? 0 : selected[0]; } )
      .attr("class", "ruler hidden");

    selectedRulerY = viewbox.append("line")
      .attr("stroke", gridStroke)
      .attr("stroke-dasharray", "2,2")
      .attr("x1", 0)
      .attr("x2", size.width)
      .attr("y1", function() { return selected === null ? 0 : selected[1]; } )
      .attr("y2", function() { return selected === null ? 0 : selected[1]; } )
      .attr("class", "ruler hidden");

    yAxisDraggable = svg.append("rect")
      .attr("class", "draggable-axis")
      .attr("x", padding.left-yAxisDraggableWidth)
      .attr("y", padding.top)
      .attr("rx", yAxisNumberHeight/6)
      .attr("width", yAxisDraggableWidth)
      .attr("height", size.height)
      .attr("pointer-events", "all")
      .style("cursor", "row-resize")
      .on("mousedown", yAxisDrag)
      .on("touchstart", yAxisDrag);

    yAxisDraggableTooltip = yAxisDraggable.append("title");

    xAxisDraggable = svg.append("rect")
      .attr("class", "draggable-axis")
      .attr("x", padding.left)
      .attr("y", size.height+padding.top)
      .attr("rx", yAxisNumberHeight/6)
      .attr("width", size.width)
      .attr("height", xAxisDraggableHeight)
      .attr("pointer-events", "all")
      .style("cursor", "col-resize")
      .on("mousedown", xAxisDrag)
      .on("touchstart", xAxisDrag);

    xAxisDraggableTooltip = xAxisDraggable.append("title");

    if (sizeType.value <= 2 && options.ylabel) {
      xAxisDraggableTooltip.text(options.xlabel);
    }

    if (sizeType.catefory && options.ylabel) {
      yAxisDraggableTooltip.text(options.ylabel);
    }

    adjustAxisDraggableFill();

    brush_element = viewbox.append("g")
          .attr("class", "brush");

    // add Chart Title
    if (options.title && sizeType.value > 0) {
      title = vis.selectAll("text")
        .data(titles, function(d) { return d; });
      title.enter().append("text")
          .attr("class", "title")
          .text(function(d) { return d; })
          .attr("x", function() { return size.width/2 - Math.min(size.width, getComputedTextLength(this))/2; })
          .attr("dy", function(d, i) { return -i * titleFontSizeInPixels - halfFontSizeInPixels + "px"; });
      titleTooltip = title.append("title")
          .text("");
    } else if (options.title) {
      titleTooltip = plot.append("title")
          .text(options.title);
    }

    // Add the x-axis label
    if (sizeType.value > 2) {
      xlabel = vis.append("text")
          .attr("class", "axis")
          .attr("class", "xlabel")
          .text(options.xlabel)
          .attr("x", size.width/2)
          .attr("y", size.height-20)
          .attr("dy", xAxisLabelBaseline + "px")
          .style("text-anchor","middle");
    }

    // add y-axis label
    if (sizeType.value > 2) {
      ylabel = vis.append("g").append("text")
          .attr("class", "axis")
          .attr("class", "ylabel")
          .text( options.ylabel)
          .style("text-anchor","middle")
          .attr("transform","translate(" + yAxisLabelBaseline + " " + size.height/2+") rotate(-90)");
      if (sizeType.category === "small") {
        yAxisDraggable.append("title")
          .text(options.ylabel);
      }
    }

    d3.select(node)
        .on("mousemove.drag", mousemove)
        .on("touchmove.drag", mousemove)
        .on("mouseup.drag",   mouseup)
        .on("touchend.drag",  mouseup);

    notification = vis.append("text")
        .attr("class", "graph-notification")
        .text(message)
        .attr("x", size.width/2)
        .attr("y", size.height/2)
        .style("text-anchor","middle");

    updateMarkers();
    updateRulers();
  }

  //
  // Repaint an existing graph by rescaling/updating the SVG and Canvas elements
  //
  function repaintExistingGraph() {
    vis
      .attr("width",  cx)
      .attr("height", cy)
      .attr("transform", "translate(" + padding.left + "," + padding.top + ")");

    plot
      .attr("width", size.width)
      .attr("height", size.height);

    background
      .style({
        "width":   size.width + "px",
        "height":  size.height + "px",
        "top":     padding.top + "px",
        "left":    padding.left + "px",
        "z-index": 0
      });

    viewbox
        .attr("top", 0)
        .attr("left", 0)
        .attr("width", size.width)
        .attr("height", size.height)
        .attr("viewBox", "0 0 "+size.width+" "+size.height);

    yAxisDraggable
        .attr("x", padding.left-yAxisDraggableWidth)
        .attr("y", padding.top-yAxisNumberHeight/2)
        .attr("width", yAxisDraggableWidth)
        .attr("height", size.height+yAxisNumberHeight);

    xAxisDraggable
        .attr("x", padding.left)
        .attr("y", size.height+padding.top)
        .attr("width", size.width)
        .attr("height", xAxisDraggableHeight);

    adjustAxisDraggableFill();

    if (options.title && sizeType.value > 0) {
      title
          .attr("x", function() { return size.width/2 - Math.min(size.width, getComputedTextLength(this))/2; })
          .attr("dy", function(d, i) { return -i * titleFontSizeInPixels - halfFontSizeInPixels + "px"; });
      titleTooltip
          .text("");
    } else if (options.title) {
      titleTooltip
          .text(options.title);
    }

    if (options.xlabel && sizeType.value > 2) {
      xlabel
          .attr("x", size.width/2)
          .attr("y", size.height-30)
          .attr("dy", xAxisLabelBaseline + "px");
      xAxisDraggableTooltip
          .text("");
    } else {
      xAxisDraggableTooltip
          .text(options.xlabel);
    }

    if (options.ylabel && sizeType.value > 2) {
      ylabel
          .attr("transform","translate(" + (yAxisLabelBaseline+30) + " " + size.height/2+") rotate(-90)");
      yAxisDraggableTooltip
          .text("");
    } else {
      yAxisDraggableTooltip
        .text(options.ylabel);
    }

    notification
      .attr("x", size.width/2)
      .attr("y", size.height/2);

    vis.selectAll("g.x").remove();
    vis.selectAll("g.y").remove();

    if (has_selection && selection_visible) {
      updateBrushElement();
    }

    updateMarkers();
    updateRulers();
    resizeCanvas();
  }

  function getComputedTextLength(el) {
    if (el.getComputedTextLength) {
      return el.getComputedTextLength();
    } else {
      return 100;
    }
  }

  function adjustAxisDraggableFill() {
    if (sizeType.value <= 1) {
      xAxisDraggable
        .style({
          "fill":       "rgba(196, 196, 196, 0.2)"
        });
      yAxisDraggable
        .style({
          "fill":       "rgba(196, 196, 196, 0.2)"
        });
    } else {
      xAxisDraggable
        .style({
          "fill":       null
        });
      yAxisDraggable
        .style({
          "fill":       null
        });
    }
  }

  //
  // Redraw the plot and axes when plot is translated or axes are re-scaled
  //
  function redraw() {
    updateAxesAndSize();
    repaintExistingGraph();
    // Regenerate x-ticks
    var gx = vis.selectAll("g.x")
        .data(xScale.ticks(xTickCount), String)
        .attr("transform", tx);

    var gxe = gx.enter().insert("g", "a")
        .attr("class", "x")
        .attr("transform", tx);

    gxe.append("line")
        .attr("stroke", gridStroke)
        .attr("y1", 0)
        .attr("y2", size.height);

    

    gx.exit().remove();

    // Regenerate y-ticks
    var gy = vis.selectAll("g.y")
        .data(yScale.ticks(yTickCount), String)
        .attr("transform", ty);

    var gye = gy.enter().insert("g", "a")
        .attr("class", "y")
        .attr("transform", ty)
        .attr("background-fill", "#FFEEB6");

    gye.append("line")
        .attr("stroke", gridStroke)
        .attr("x1", 0)
        .attr("x2", size.width);

    if (sizeType.value > 1) {
      if (options.yscale === "log") {
        var gye_length = gye[0].length;
        if (gye_length > 100) {
          gye = gye.filter(function(d) { return !!d.toString().match(/(\.[0]*|^)[1]/);});
        } else if (gye_length > 50) {
          gye = gye.filter(function(d) { return !!d.toString().match(/(\.[0]*|^)[12]/);});
        } else {
          gye = gye.filter(function(d) {
            return !!d.toString().match(/(\.[0]*|^)[125]/);});
        }
      }}
     

    gy.exit().remove();

    // For now, only annotations are of annotation.type === 'line' are supported
    // so only generate attribute hash for lines and assume that we can directly
    // append svg nodes of annotation.type

    function annotationAttributes(d) {
      switch(d.type) {
      case "line":
        return {
          stroke: d.data.hasOwnProperty("stroke") ? d.data.stroke : "#f00",
          x1: d.data.hasOwnProperty('x1') ? xScale(d.data.x1) : 0,
          x2: d.data.hasOwnProperty('x2') ? xScale(d.data.x2) : size.width,
          y1: d.data.hasOwnProperty('y1') ? yScale(d.data.y1) : 0,
          y2: d.data.hasOwnProperty('y2') ? yScale(d.data.y2) : size.height
        };
      case "bar":
        return {
          stroke: d.data.hasOwnProperty("stroke") ? d.data.stroke : "#f00",
          fill:   d.data.hasOwnProperty("stroke") ? d.data.stroke : "#f00",
          x:      d.data.hasOwnProperty('x1') ? xScale(d.data.x1) : 0,
          y:      d.data.hasOwnProperty('y2') ? yScale(d.data.y2) : 0,
          width:  d.data.hasOwnProperty('x2') ? xScale(d.data.x2)-xScale(d.data.x1) : size.width,
          height: d.data.hasOwnProperty('y1') ? yScale(d.data.y1)-yScale(d.data.y2) : size.height,
          "fill-opacity": 0.5
        };
      }

      return {};
    }

    var annotationTypes = {
      line: "line",
      bar:  "rect"
    }

    var annotationsSelection = vis.selectAll("g.annotation")
      .data(annotations);

    // create annotation objects if necessary
    annotationsSelection.enter()
      .append("g")
      .attr("class", "annotation")
      .each(function(d,i){
        d3.select(this).append(annotationTypes[d.type]);
      });

    // update annotation attributes to reflect current graph state
    annotationsSelection.each(function(d,i){
      d3.select(this.childNodes[0]).attr(annotationAttributes(d))
        .call(d3.behavior.zoom().x(xScale).y(yScale).on("zoom", redraw));
    });

    annotationsSelection.exit().remove();
    plot.call(d3.behavior.zoom().x(xScale).y(yScale).on("zoom", redraw));
    update();
  }

  // ------------------------------------------------------------
  //
  // Rendering: Updating samples/data points in the plot
  //
  // ------------------------------------------------------------


  //
  // Update plotted data, optionally pass in new samplePoint
  //
  function update(samplePoint) {
    setCurrentSample(samplePoint);
    updateCanvasFromPoints(currentSample);
    updateMarkers();
    if (d3.event && d3.event.keyCode) {
      d3.event.preventDefault();
      d3.event.stopPropagation();
    }
  }

  // samplePoint is optional argument
  function updateOrRescale(samplePoint) {
    setCurrentSample(samplePoint);

    if (autoscale()) {
      redraw();
    } else {
      update(currentSample);
    }
  }

  function circleClasses(d) {
    var cs = [];
    if (d === selected) {
      cs.push("selected");
    }
    if (cs.length === 0) {
      return null;
    } else {
      return cs.join(" ");
    }
  }

  function updateMarkerRadius() {
    var d = xScale.domain(),
        r = xScale.range();
    markerRadius = (r[1] - r[0]) / ((d[1] - d[0]));
    markerRadius = Math.min(Math.max(markerRadius, 4), 8);
    markerStrokeWidth = markerRadius/3;
  }

  function updateMarkers() {
    var marker,
        markedPoints = null;
    if (options.markAllDataPoints && sizeType.value > 1) {
      markedPoints = [];
      markedPoints = markedPoints.concat.apply(markedPoints, pointArray);
    } else if (options.markNearbyDataPoints && sizeType.value > 1) {
      markedPoints = selectable.slice(0);
      if (selected !== null && markedPoints.indexOf(selected) === -1) {
        markedPoints.push(selected);
      }
    }
    if (markedPoints !== null) {
      updateMarkerRadius();
      marker = vis.select("svg").selectAll("circle").data(markedPoints);
      marker.enter().append("circle")
          .attr("class", circleClasses)
          .attr("cx",    function(d) { return xScale(d[0]); })
          .attr("cy",    function(d) { return yScale(d[1]); })
          .attr("r", markerRadius)
          .style("stroke-width", markerStrokeWidth)
          .style("cursor", markerCursorStyle)
          .on("mousedown.drag",  dataPointDrag)
          .on("touchstart.drag", dataPointDrag)
          .append("title")
          .text(function(d) { return "( " + fx(d[0]) + ", " + fy(d[1]) + " )"; });

      marker
          .attr("class", circleClasses)
          .attr("cx",    function(d) { return xScale(d[0]); })
          .attr("cy",    function(d) { return yScale(d[1]); })
          .select("title")
          .text(function(d) { return "( " + fx(d[0]) + ", " + fy(d[1]) + " )"; });

      marker.exit().remove();
    }

    updateRulers();
  }

  function updateRulers() {
    if (options.showRulersOnSelection && selected !== null) {
      selectedRulerX
        .attr("y1", 0)
        .attr("y2", size.height)
        .attr("x1", function() { return selected === null ? 0 : xScale(selected[0]); } )
        .attr("x2", function() { return selected === null ? 0 : xScale(selected[0]); } )
        .attr("class", function() { return "ruler" + (selected === null ? " hidden" : ""); } );

      selectedRulerY
        .attr("x1", 0)
        .attr("x2", size.width)
        .attr("y1", function() { return selected === null ? 0 : yScale(selected[1]); } )
        .attr("y2", function() { return selected === null ? 0 : yScale(selected[1]); } )
        .attr("class", function() { return "ruler" + (selected === null ? " hidden" : ""); } );
    } else {
      selectedRulerX.attr("class", "ruler hidden");
      selectedRulerY.attr("class", "ruler hidden");
    }
  }


  // ------------------------------------------------------------
  //
  // UI Interaction: Plot dragging and translation; Axis re-scaling
  //
  // ------------------------------------------------------------

  function plotMousemove() {
    if (options.markNearbyDataPoints) {
      var mousePoint = d3.mouse(vis.node()),
          translatedMousePointX = xScale.invert(Math.max(0, Math.min(size.width, mousePoint[0]))),
          p,
          idx, pMin, pMax,
          i;
      // highlight the central point, and also points to the left and right
      // TODO Handle multiple data sets/lines
      selectable = [];
      for (i = 0; i < pointArray.length; i++) {
        points = pointArray[i];
        p = findClosestPointByX(translatedMousePointX, i);
        if (p !== null) {
          idx = points.indexOf(p);
          pMin = idx - (options.extraCirclesVisibleOnHover);
          pMax = idx + (options.extraCirclesVisibleOnHover + 1);
          if (pMin < 0) { pMin = 0; }
          if (pMax > points.length - 1) { pMax = points.length; }
          selectable = selectable.concat(points.slice(pMin, pMax));
        }
      }
      update();
    }
  }

  function findClosestPointByX(x, line) {
    if (typeof(line) === "undefined" || line === null) { line = 0; }
    // binary search through points.
    // This assumes points is sorted ascending by x value, which for realTime graphs is true.
    points = pointArray[line];
    if (points.length === 0) { return null; }
    var min = 0,
        max = points.length - 1,
        mid, p1, p2, p3;
    while (min < max) {
      mid = Math.floor((min + max)/2.0);
      if (points[mid][0] < x) {
        min = mid + 1;
      } else {
        max = mid;
      }
    }

    // figure out which point is actually closest.
    // we have to compare 3 points, to account for floating point rounding errors.
    // if the mouse moves off the left edge of the graph, p1 may not exist.
    // if the mouse moves off the right edge of the graph, p3 may not exist.
    p1 = points[mid - 1];
    p2 = points[mid];
    p3 = points[mid + 1];
    if (typeof(p1) !== "undefined" && Math.abs(p1[0] - x) <= Math.abs(p2[0] - x)) {
      return p1;
    } else if (typeof(p3) === "undefined" || Math.abs(p2[0] - x) <= Math.abs(p3[0] - x)) {
      return p2;
    } else {
      return p3;
    }
  }

  function plotDrag() {
    var p;
    if (draw_enabled) {
      d3.event.preventDefault();
      p = d3.mouse(vis.node());
      addPointAtMouse(p);
      downx = p[0];
      downy = p[0];
      draggedPoint = false;
    } else if(options.enableAxisScaling) {
      d3.event.preventDefault();
      d3.select('body').style("cursor", "move");
      if (d3.event.altKey) {
        plot.style("cursor", "nesw-resize");
        if (d3.event.shiftKey && options.addData) {
          addPointAtMouse();
        } else {
          p = d3.mouse(vis.node());
          downx = xScale.invert(p[0]);
          downy = yScale.invert(p[1]);
          draggedPoint = false;
          d3.event.stopPropagation();
        }
        // d3.event.stopPropagation();
      }
    }
  }

  function notifyPointListeners(action, point) {
    pointListeners.forEach(function(callback) {
      callback.call(null,{action: action, point: point});
    });
  }

  function isPointInsideGraph(p) {
    var graphx = xScale.invert(p[0]),
        graphy = yScale.invert(p[1]),
        xAxisStart = xScale.domain()[0],
        xAxisEnd =   xScale.domain()[1],
        yAxisStart = yScale.domain()[0],
        yAxisEnd =   yScale.domain()[1];

    return graphx >= xAxisStart && graphx <= xAxisEnd && graphy >= yAxisStart && graphy <= yAxisEnd;
  }

  function addPointAtMouse(p) {
    if (!p) {
      p = d3.mouse(vis.node());
    }

    var newpoint = [],
        newpointIdx,
        pointsIndexed = pointArrayIndexed[options.drawIndex];
    points = pointArray[options.drawIndex];
    newpoint[0] = xScale.invert(Math.max(0, Math.min(size.width,  p[0])));
    newpoint[1] = yScale.invert(Math.max(0, Math.min(size.height, p[1])));
    points.push(newpoint);
    pointsIndexed.push(newpoint);
    notifyPointListeners("added", newpoint);
    processPointsArray(points);
    selected = newpoint;

    // update currentSample
    newpointIdx = points.indexOf(newpoint);
    if (currentSample == points.length-2 || currentSample >= newpointIdx) {
      // currentSample was pointing to the last point, so keep it at the last point
      currentSample++;
    }

    points = pointArray[0];
    update();
  }

  function isBetween(a,b,p) {
    return a < p && p <= b;
  }

  function isBetweenReversed(a,b,p) {
    return a <= p && p < b;
  }

  function clearPointsBetween(x1, x2) {
    var a = x1,
        b = x2,
        needsUpdate = false,
        between = isBetween,
        i, p, removed, pointsIndexed, newPoints;

    // Check to make sure a is always smaller than b
    if (x1 > x2) {
      a = x2;
      b = x1;
      between = isBetweenReversed;
    }

    pointsIndexed = pointArrayIndexed[options.drawIndex];

    // for (i = points.length-1; i >= 0; i--) {
    for (i = 0; i < pointsIndexed.length; i++) {
      p = pointsIndexed[i];
      if (between(a,b,p[0])) {
        // null the point
        removed = pointsIndexed[i].slice();
        pointsIndexed[i][0] = null;
        pointsIndexed[i][1] = null;
        notifyPointListeners("removed", removed);
        needsUpdate = true;
      }
    };
    if (needsUpdate) {
      newPoints = copyNonNull(pointsIndexed);
      processPointsArray(newPoints);
      pointArray[options.drawIndex] = newPoints;
      points = pointArray[0];
      update();
    }
  }

  function falseFunction() {
    return false;
  }

  function xAxisDrag() {
    if(options.enableAxisScaling) {
      node.focus();
      document.onselectstart = falseFunction;
      d3.event.preventDefault();
      var p = d3.mouse(vis.node());
      downx = xScale.invert(p[0]);
    }
  }

  function yAxisDrag() {
    if(options.enableAxisScaling) {
      node.focus();
      d3.event.preventDefault();
      document.onselectstart = falseFunction;
      var p = d3.mouse(vis.node());
      downy = yScale.invert(p[1]);
    }
  }

  function dataPointDrag(d) {
    node.focus();
    d3.event.preventDefault();
    document.onselectstart = falseFunction;
    if (selected === d) {
      selected = draggedPoint = null;
    } else {
      selected = draggedPoint = d;
    }
    update();
  }

  function mousemove() {
    var p = d3.mouse(vis.node()),
        points,
        index,
        px,
        x,
        nextPoint,
        prevPoint,
        minusHalf,
        plusHalf;

    // t = d3.event.changedTouches;

    document.onselectstart = function() { return true; };
    d3.event.preventDefault();
    if (draggedPoint) {
      if (options.dataChange) {
        draggedPoint[1] = yScale.invert(Math.max(0, Math.min(size.height, p[1])));
      } else {
        pointArray.forEach(function (arr) {
          var i = arr.indexOf(draggedPoint);
          if (i !== -1) {
            points = arr;
            index = i;
          }
        });

        if (index && index < (points.length-1)) {
          px = xScale.invert(p[0]);
          x = draggedPoint[0];
          nextPoint = points[index+1];
          prevPoint = points[index-1];
          minusHalf = x - (x - prevPoint[0])/2;
          plusHalf =  x + (nextPoint[0] - x)/2;
          if (px < minusHalf) {
            draggedPoint = prevPoint;
            selected = draggedPoint;
          } else if (px > plusHalf) {
            draggedPoint = nextPoint;
            selected = draggedPoint;
          }
        }
      }
      update();
    }

    if (draw_enabled && !isNaN(downx) && !isNaN(downy)) {
      if (isPointInsideGraph(p)) {
        clearPointsBetween(xScale.invert(Math.max(0, Math.min(size.width,  downx))), xScale.invert(Math.max(0, Math.min(size.width,  p[0]))));
        addPointAtMouse(p);
        downx = p[0];
        downy = p[0];
      } else {
        mouseup();
      }
      d3.event.stopPropagation();
    } else {
      if (!isNaN(downx)) {
        d3.select('body').style("cursor", "col-resize");
        plot.style("cursor", "col-resize");
        xScale.domain(axis.axisProcessDrag(downx, xScale.invert(p[0]), xScale.domain()));
        updateMarkerRadius();
        redraw();
        d3.event.stopPropagation();
      }

      if (!isNaN(downy)) {
        d3.select('body').style("cursor", "row-resize");
        plot.style("cursor", "row-resize");
        yScale.domain(axis.axisProcessDrag(downy, yScale.invert(p[1]), yScale.domain()));
        redraw();
        d3.event.stopPropagation();
      }
    }
  }

  function mouseup() {
    d3.select('body').style("cursor", "auto");
    plot.style("cursor", "auto");
    document.onselectstart = function() { return true; };
    if (!isNaN(downx)) {
      redraw();
      downx = NaN;
    }
    if (!isNaN(downy)) {
      redraw();
      downy = NaN;
    }
    draggedPoint = null;
  }

  //------------------------------------------------------
  //
  // Autoscale
  //
  // ------------------------------------------------------------

  /**
    If there are more than 1 data points, scale axes. Default behavior is to expand domain only when
    corresponding "autoScaleX" and "autoScaleY" options are set to true.

    However if you pass <true> as an argument, it will enforce scaling of axes so the fit data.
  */
  function autoscale(fit) {
    var maxPointsLen = -Infinity;
    var domainXChanged;
    var domainYChanged;
    var ret;

    pointArray.forEach(function (arr) {
      if (arr.length > maxPointsLen) maxPointsLen = arr.length;
    });

    if (maxPointsLen > 0) {
      if (options.autoScaleX || fit) {
        var xPadding = fit ? 0.05 : options.autoScalePadding;
        domainXChanged = scaleAxis("x", pointsXMin, pointsXMax, xPadding, fit);
      }
      if (options.autoScaleY || fit) {
        var yPadding = fit ? 0.05 : options.autoScalePadding;
        domainYChanged = scaleAxis("y", pointsYMin, pointsYMax, yPadding, fit);
      }
      ret = domainXChanged || domainYChanged;
    } else {
      ret = undefined;
    }

    // Only call callback if there's what we think of as an "autoscale was clicked" event, which
    // specifically means the case that fit == true
    if (fit && options.onAutoscale) {
      options.onAutoscale.call(null);
    }

    return ret;
  }

  function scaleAxis(axis, minVal, maxVal, padding, fit) {
    if (minVal === maxVal) {
      // Simply skip scaling when min === max.
      return false;
    }
    // axis argument is expected to be "x" or "y".
    var scale = axis === "x" ? xScale : yScale;
    var dMin = scale.domain()[0];
    var dMax = scale.domain()[1];
    var domainChanged = false;
    // Like Math.pow but returns a value with the same sign as x: pow(-1, 0.5) -> -1
    var pow = function(x, exponent) {
      return x < 0 ? -Math.pow(-x, exponent) : Math.pow(x, exponent);
    };
    // Convert min, max to a linear scale, and set 'transform' to the function that
    // converts the new min, max to the relevant scale.
    var transform;
    switch (options[axis + "scale"]) {
      case 'linear':
        transform = function(x) { return x; };
        break;
      case 'log':
        minVal = Math.log(minVal) / Math.log(10);
        maxVal = Math.log(maxVal) / Math.log(10);
        transform = function(x) { return Math.pow(10, x); };
        break;
      case 'pow':
        var scaleExponent = options[axis + "scaleExponent"];
        minVal = pow(minVal, scaleExponent);
        maxVal = pow(maxVal, scaleExponent);
        transform = function(x) { return pow(x, 1 / scaleExponent); };
        break;
    }

    var pad = (maxVal - minVal) * padding;
    if (maxVal > dMax || fit) {
      dMax = maxVal + pad;
      domainChanged = true;
    }
    if (minVal < dMin || fit) {
      dMin = minVal - pad;
      domainChanged = true;
    }
    if (domainChanged) {
      scale.domain([transform(dMin), transform(dMax)]).nice();
    }
    return domainChanged;
  }

  // ------------------------------------------------------------
  //
  // Brush Selection
  //
  // ------------------------------------------------------------

  function toggleSelection() {
    drawEnabled(false);
    if (!selectionVisible()) {
      // The graph model defaults to visible=false and enabled=true.
      // Reset these so that this first click turns on selection correctly.
      selectionEnabled(false);
      selectionVisible(true);
    }
    if (!!selectionEnabled()) {
      if (options.clearSelectionOnLeavingSelectMode || selectionDomain() === []) {
        selectionDomain(null);
      }
      selectionEnabled(false);
    } else {
      if (selectionDomain() == null) {
        selectionDomain([]);
      }
      selectionEnabled(true);
    }
  }

  /**
    Set or get the selection domain (i.e., the range of x values that are selected).

    Valid domain specifiers:
      null     no current selection (selection is turned off)
      []       a current selection exists but is empty (has_selection is true)
      [x1, x2] the region between x1 and x2 is selected. Any data points between
               x1 and x2 (inclusive) would be considered to be selected.

    Default value is null.
  */
  function selectionDomain(a) {

    if (!arguments.length) {
      if (!has_selection) {
        return null;
      }
      if (selection_region.xmax === Infinity && selection_region.xmin === Infinity ) {
        return [];
      }
      return [selection_region.xmin, selection_region.xmax];
    }

    // setter

    if (a === null) {
      has_selection = false;
    }
    else if (a.length === 0) {
      has_selection = true;
      selection_region.xmin = Infinity;
      selection_region.xmax = Infinity;
    }
    else {
      has_selection = true;
      selection_region.xmin = a[0];
      selection_region.xmax = a[1];
    }

    updateBrushElement();

    if (selection_listener) {
      selection_listener(selectionDomain());
    }
    return api;
  }

  /**
    Get whether the graph currently has a selection region. Default value is false.

    If true, it would be valid to filter the data points to return a subset within the selection
    region, although this region may be empty!

    If false the graph is not considered to have a selection region.

    Note that even if has_selection is true, the selection region may not be currently shown,
    and if shown, it may be empty.
  */
  function hasSelection() {
    return has_selection;
  }

  /**
    Set or get the visibility of the selection region. Default value is false.

    Has no effect if the graph does not currently have a selection region
    (selection_domain is null).

    If the selection_enabled property is true, the user will also be able to interact
    with the selection region.
  */
  function selectionVisible(val) {
    if (!arguments.length) {
      return selection_visible;
    }

    // setter
    val = !!val;
    if (selection_visible !== val) {
      selection_visible = val;
      updateBrushElement();
    }
    return api;
  }

  /**
    Set or get whether user manipulation of the selection region should be enabled
    when a selection region exists and is visible. Default value is true.

    Setting the value to true has no effect unless the graph has a selection region
    (selection_domain is non-null) and the region is visible (selection_visible is true).
    However, the selection_enabled setting is honored whenever those properties are
    subsequently updated.

    Setting the value to false does not affect the visibility of the selection region,
    and does not affect the ability to change the region by calling selectionDomain().

    Note that graph panning and zooming are disabled while selection manipulation is enabled.
  */
  function selectionEnabled(val) {
    if (!arguments.length) {
      return selection_enabled;
    }

    // setter
    val = !!val;
    if (selection_enabled !== val) {
      selection_enabled = val;

      if (selectionButton) {
        if (val) {
          selectionButton.classed("active", true);
        } else {
          selectionButton.classed("active", false);
        }
      }

      updateBrushElement();
    }
    return api;
  }

  /**
    Set or get the listener to be called when the selection_domain changes.

    Both programatic and interactive updates of the selection region result in
    notification of the listener.

    The listener is called with the new selection_domain value in the first argument.
  */
  function selectionListener(cb) {
    if (!arguments.length) {
      return selection_listener;
    }
    // setter
    selection_listener = cb;
    return api;
  }

  function brushListener() {
    var extent;
    if (selection_enabled) {
      // Note there is a brush.empty() method, but it still reports true after the
      // brush extent has been programatically updated.
      extent = brush_control.extent();
      selectionDomain( extent[0] !== extent[1] ? extent : [] );
    }
  }

  function updateBrushElement() {
    if (has_selection && selection_visible) {
      brush_control = brush_control || d3.svg.brush()
        .x(xScale)
        .extent([selection_region.xmin || 0, selection_region.xmax || 0])
        .on("brush", brushListener);

      brush_element
        .call(brush_control.extent([selection_region.xmin || 0, selection_region.xmax || 0]))
        .style('display', 'inline')
        .style('pointer-events', selection_enabled ? 'all' : 'none')
        .selectAll("rect")
          .attr("height", size.height);

    } else {
      brush_element.style('display', 'none');
    }
  }

  // ------------------------------------------------------------
  //
  // Drawing
  //
  // ------------------------------------------------------------

  function toggleDraw() {
    if (has_selection && selection_visible) {
      toggleSelection();
    }
    drawEnabled(!draw_enabled);
  }

  function drawEnabled(val) {
    if (!arguments.length) {
      return draw_enabled;
    }

    // setter
    val = !!val;
    if (draw_enabled !== val) {
      draw_enabled = val;

      if (drawButton) {
        if (val) {
          drawButton.classed("active", true);
        } else {
          drawButton.classed("active", false);
        }
      }
    }
    return api;
  }

  // ------------------------------------------------------------
  //
  // Legend
  //
  // ------------------------------------------------------------

  function toggleLegend() {
    options.legendVisible = !options.legendVisible;
    updateLegendVisibility();
  }

  function updateLegendVisibility() {
    if (legendButton) {
      if (!!options.legendVisible) {
        legendButton.classed("active", true);
      } else {
        legendButton.classed("active", false);
      }
    }
    if (legendLayer) {
      if (!!options.legendVisible) {
        legendLayer.classed("legend-invisible", false);
        // Reposition while we're at it
        legendLayer
          .style({
            "top":     padding.top + halfFontSizeInPixels + "px",
            "right":   padding.right + (options.showButtons ? fontSizeInPixels*2.0 : halfFontSizeInPixels) + "px"
          });
      } else {
        legendLayer.classed("legend-invisible", true);
      }
    }
    return api;
  }

  // ------------------------------------------------------------
  //
  // Canvas-based plotting
  //
  // ------------------------------------------------------------

  function createGraphCanvas() {
    graphCanvas = elem.append("canvas");
    gcanvas = graphCanvas.node();
    resizeCanvas();
  }

  function resizeCanvas() {
    graphCanvas
      .attr("class", "overlay")
      .style({
        "position": "absolute",
        "width":    size.width + "px",
        "height":   size.height + "px",
        "top":      padding.top + "px",
        "left":     padding.left + "px",
        "z-index": 1
      });
    gcanvas = graphCanvas.node();
    gcanvas.width = size.width;
    gcanvas.height = size.height;
    gcanvas.top = padding.top;
    gcanvas.left = padding.left;
    setupCanvasContext();
    updateCanvasFromPoints(currentSample);
  }

  function clearCanvas() {
    if (gcanvas.getContext) {
      gcanvas.width = gcanvas.width;
      gctx.lineWidth = lineWidth;
      gctx.fillStyle = canvasFillStyle;
      gctx.fillRect(0, 0, gcanvas.width, gcanvas.height);
      gctx.strokeStyle = "rgba(255,65,0, 1.0)";
      gctx.globalAlpha = 1;
    }
  }

  function setupCanvasContext() {
    if (gcanvas.getContext) {
      gctx = gcanvas.getContext( '2d' );
      gctx.globalCompositeOperation = "source-over";
      gctx.lineWidth = lineWidth;
      gctx.fillStyle = canvasFillStyle;
      gctx.fillRect(0, 0, gcanvas.width, gcanvas.height);
      gctx.strokeStyle = "rgba(255,65,0, 1.0)";
      gctx.globalAlpha = 1;
    }
  }

  //
  // Update Canvas plotted data from [x, y] data points
  //
  function updateCanvasFromPoints(samplePoint) {
    var i, j, len,
        dx,
        px, py,
        index,
        yOrigin = yScale(0.00001),
        lines = options.lines,
        bars = options.bars,
        pointsLength,
        numberOfLines = pointArray.length,
        xAxisStart,
        xAxisEnd,
        pointStop,
        start;

    // hack for lack of canvas support in jsdom tests
    if (typeof gcanvas.getContext === "undefined" ) { return; }

    setCurrentSample(samplePoint);
    clearCanvas();
    gctx.fillRect(0, 0, gcanvas.width, gcanvas.height);
    gctx.lineWidth = lineWidth;
    xAxisStart = xScale.domain()[0];
    xAxisEnd =   xScale.domain()[1];
    start = Math.max(0, xAxisStart);
    if (lines) {
      for (i = 0; i < numberOfLines; i++) {
        points = pointArray[i];
        pointsLength = points.length;
        if (pointsLength === 0) {
          continue;
        } else if (pointsLength === 1) {
          // Draw just single point.
          setFillColor(i);
          gctx.fillRect(xScale(points[0][0]), yScale(points[0][1]), lineWidth, lineWidth);
          continue;
        }
        index = 0;
        // find first point >= xAxisStart
        for (j = 0; j < pointsLength; j++) {
          if (points[j][0] != null && points[j][1] != null && points[j][0] >= xAxisStart) { break; }
          index++;
        }
        if (index >= pointsLength) { continue; }
        if (index > 0) { index--; }
        px = xScale(points[index][0]);
        py = yScale(points[index][1]);
        setStrokeColor(i);
        gctx.beginPath();
        gctx.moveTo(px, py);
        dx = points[index][0];
        index++;
        // plot all ... or until one point past xAxisEnd
        // or until we reach currentSample
        for (len = Math.min(samplePoint, pointsLength); index < len; index++) {
          if (points[index][0] == null || points[index][1] == null) { continue; }
          dx = points[index][0];
          px = xScale(dx);
          py = yScale(points[index][1]);
          gctx.lineTo(px, py);
          if (dx >= xAxisEnd) { break; }
        }
        gctx.stroke();
        // now plot in a desaturated style all the rest of the points
        // ... or until one point past xAxisEnd
        if (index < pointsLength && dx < xAxisEnd) {
          setStrokeColor(i, true);
          gctx.lineWidth = lineWidth/2;
          for (;index < pointsLength; index++) {
            if (points[index][0] == null || points[index][1] == null) { continue; }
            dx = points[index][0];
            px = xScale(dx);
            py = yScale(points[index][1]);
            gctx.lineTo(px, py);
            if (dx >= xAxisEnd) { break; }
          }
          gctx.stroke();
          gctx.lineWidth = lineWidth;
        }
      }
    } else if (bars) {
      for (i = 0; i < numberOfLines; i++) {
        points = pointArray[i];
        pointsLength = points.length;
        setStrokeColor(i);
        pointStop = samplePoint - 1;
        for (index=start; index < pointStop; index++) {
          if (points[index][0] == null || points[index][1] == null) { continue; }
          px = xScale(points[index][0]);
          py = yScale(points[index][1]);
          if (py === 0) {
            continue;
          }
          gctx.beginPath();
          gctx.moveTo(px, yOrigin);
          gctx.lineTo(px, py);
          gctx.stroke();
        }
        pointStop = points.length-1;
        if (index < pointStop) {
          setStrokeColor(i, true);
          for (;index < pointStop; index++) {
            if (points[index][0] == null || points[index][1] == null) { continue; }
            px = xScale(points[index][0]);
            py = yScale(points[index][1]);
            gctx.beginPath();
            gctx.moveTo(px, yOrigin);
            gctx.lineTo(px, py);
            gctx.stroke();
          }
        }
      }
    } else {
      for (i = 0; i < numberOfLines; i++) {
        points = pointArray[i];
        pointsLength = points.length;
        index = 0;
        // find first point >= xAxisStart
        for (j = 0; j < pointsLength; j++) {
          if (points[j][0] != null && points[j][1] != null && points[j][0] >= xAxisStart) { break; }
          index++;
        }
        if (index > 0) { --index; }
        if (index >= pointsLength) { continue; }
        setFillColor(i);
        // plot all ... or until one point past xAxisEnd
        // or until we reach currentSample
        for (len = Math.min(samplePoint, pointsLength); index < len; index++) {
          if (points[index][0] == null || points[index][1] == null) { continue; }
          dx = points[index][0];
          px = xScale(dx);
          py = yScale(points[index][1]);
          gctx.fillRect(px, py, lineWidth, lineWidth);
          if (dx >= xAxisEnd) { break; }
        }
        // now plot in a desaturated style all the rest of the points
        // ... or until one point past xAxisEnd
        if (index < pointsLength && dx < xAxisEnd) {
          setFillColor(i, true);
          for (;index < pointsLength; index++) {
            if (points[index][0] == null || points[index][1] == null) { continue; }
            dx = points[index][0];
            px = xScale(dx);
            py = yScale(points[index][1]);
            gctx.fillRect(px, py, lineWidth, lineWidth);
            if (dx >= xAxisEnd) { break; }
          }
        }
      }
    }
  }

  function setStrokeColor(i, afterSamplePoint) {
    gctx.strokeStyle = getDataColor(i);
    gctx.globalAlpha = afterSamplePoint ? 0.5 : 1.0;
  }

  function setFillColor(i, afterSamplePoint) {
    gctx.fillStyle   = getDataColor(i);
    gctx.globalAlpha = afterSamplePoint ? 0.4 : 1.0;
  }

  function getDataColor(i) {
    var colorIndex = Math.min(i, options.dataColors.length - 1);
    return colorIndex < 0 ? "black" : options.dataColors[colorIndex];
  }

  // ------------------------------------------------------------
  //
  // Adding samples/data points
  //
  // ------------------------------------------------------------

  // Add an array of points then update the graph.
  function addPoints(datapoints) {
    addDataPoints(datapoints);
    setCurrentSample("last");
    updateOrRescale();
  }

  function replacePoints(datapoints, index) {
    setDataPoints(datapoints, index);
    setCurrentSample("last");
    updateOrRescale();
  }

  // Add an array of samples then update the graph.
  function addSamples(datasamples) {
    addDataSamples(datasamples);
    setCurrentSample("last");
    updateOrRescale();
  }


  // Add a point [x, y] by processing sample (Y value) synthesizing
  // X value from sampleInterval and number of points
  function addSample(sample) {
    var index = points.length,
        xvalue = (index * sampleInterval) + dataSampleStart,
        point = [ xvalue, sample ];
    points.push(point);
    setCurrentSample("last");
    updateOrRescale();
  }

  // Add a point [x, y] to points array
  function addPoint(pnt) {
    points.push(pnt);
    setCurrentSample("last");
    updateOrRescale();
  }

  function comparePoints(a, b) {
    if (a[0] < b[0])
       return -1;
    if (a[0] > b[0])
       return 1;
    return 0;
  }

  function checkPointsOrder(points, newPointIdx) {
    if (!options.sortPoints || points.length < 2) return;
    if (newPointIdx == null) {
      points.sort(comparePoints);
      return;
    }
    // This function assumes that 'points' array was sorted and one new point was added.
    // Sort points only when it's really necessary.
    var newPoint = points[newPointIdx];
    var prevPoint = points[newPointIdx - 1];
    var nextPoint = points[newPointIdx + 1];
    if ((prevPoint && prevPoint[0] > newPoint[0]) ||
        (nextPoint && newPoint[0] > nextPoint[0])) {
      points.sort(comparePoints);
    }
  }

  function updatePointsExtent(newPoint) {
    if (newPoint[0] < pointsXMin) pointsXMin = newPoint[0];
    if (newPoint[1] < pointsYMin) pointsYMin = newPoint[1];
    if (newPoint[0] > pointsXMax) pointsXMax = newPoint[0];
    if (newPoint[1] > pointsYMax) pointsYMax = newPoint[1];
  }

  // Add an array (or arrays) of points.
  function addDataPoints(datapoints) {
    var point;
    var points;
    var pointsIndexed;
    for (var i = 0, len = datapoints.length; i < len; i++) {
      if (datapoints[i] == null) continue;
      points = pointArray[i];
      pointsIndexed = pointArrayIndexed[i];
      if (points == null || pointsIndexed == null) {
        // Create a new data series dynamically in case of need.
        points = pointArray[i] = [];
        pointsIndexed = pointArrayIndexed[i] = [];
      }
      point = datapoints[i];
      points.push(point);
      pointsIndexed.push(point);
      updatePointsExtent(point);
      checkPointsOrder(points, points.length - 1);
    }
  }

  function setDataPoints(datapoints, index) {
    var oldPoint;
    var newPoint;
    var points;
    var pointsIndexed;
    var pointModified = false;
    for (var i = 0, len = datapoints.length; i < len; i++) {
      if (datapoints[i] == null) continue;
      points = pointArray[i];
      pointsIndexed = pointArrayIndexed[i];
      if (points == null || pointsIndexed == null) {
        // Create a new data series dynamically in case of need.
        points = pointArray[i] = [];
        pointsIndexed = pointArrayIndexed[i] = [];
      }
      oldPoint = pointsIndexed[index];
      newPoint = datapoints[i];
      if (oldPoint == null) {
        // Create new point.
        points.push(newPoint);
        pointsIndexed[index] = newPoint;
        checkPointsOrder(points, points.length - 1);
        updatePointsExtent(newPoint);
      } else {
        // Update coordinates manually. We can't simply say:
        // pointsInexed[index] = newPoint;
        // as then we would have to find old point in unindexed points array and replace it too.
        // Here we use the fact that both points and indexed points arrays keep references to the
        // same objects.
        oldPoint[0] = newPoint[0];
        oldPoint[1] = newPoint[1];
        checkPointsOrder(points);
        pointModified = true;
      }
    }
    if (pointModified) {
      // Recalculate points extent as old point could contain min/max values.
      pointsXMin = pointsYMin = Infinity;
      pointsXMax = pointsYMax = -Infinity;
      pointArray.forEach(function (points) {
        points.forEach(updatePointsExtent);
      });
    }
  }

  // Add an array of points by processing an array of samples (Y values)
  // synthesizing the X value from sampleInterval interval and number of points.
  function addDataSamples(datasamples) {
    var start,
        i;
    if (Object.prototype.toString.call(datasamples[0]) === "[object Array]") {
      for (i = 0; i < datasamples.length; i++) {
        if (!pointArray[i]) { pointArray.push([]); }
        points = pointArray[i];
        start = points.length * sampleInterval + dataSampleStart;
        points.push.apply(points, indexedData(datasamples[i], sampleInterval, start));
        pointArray[i] = points;
        points.forEach(updatePointsExtent);
      }
      points = pointArray[0];
    } else {
      var point;
      for (i = 0; i < datasamples.length; i++) {
        if (!pointArray[i]) { pointArray.push([]); }
        start = pointArray[i].length * sampleInterval + dataSampleStart;
        point = [start, datasamples[i]];
        pointArray[i].push(point);
        updatePointsExtent(point);
      }
    }
  }

  function copyNonNull(array) {
    var ret = [];
    array.forEach(function(element) {
      if (element == null || element[0] == null || element[1] == null) return;
      ret.push(element);
    });
    return ret;
  }

  function copyNonNullKeepIndexing(array) {
    var ret = [];
    array.forEach(function(element, idx) {
      if (element == null || element[0] == null || element[1] == null) return;
      ret[idx] = element;
    });
    return ret;
  }

  // Each points array should be processed:
  // - points extent need to be updated,
  // - points may be sorted if "sortPoints" option is enabled.
  function processPointsArray(array) {
    // Update point extent and check if the points array is sorted by X coordinates.
    function checkPoint(point, idx, array) {
      updatePointsExtent(point);
      if (sorted && idx > 0 && point[0] < array[idx - 1][0]) {
        sorted = false;
      }
    }
    // If options.sortPoints is disabled, we won't executed check in the if statement above.
    var sorted = options.sortPoints;
    array.forEach(checkPoint);
    if (!sorted && options.sortPoints) {
      array.sort(comparePoints);
    }
  }

  function resetDataPoints(datapoints) {

    pointsXMin = pointsYMin =  Infinity;
    pointsXMax = pointsYMax = -Infinity;
    pointArray = [];
    pointArrayIndexed = [];
    if (!datapoints || datapoints.length === 0) {
      pointArray = [[]];
      pointArrayIndexed = [[]];
    } else if (Object.prototype.toString.call(datapoints[0]) === "[object Array]") {
      for (var i = 0; i < datapoints.length; i++) {
        pointArray.push(copyNonNull(datapoints[i]));
        pointArrayIndexed.push(copyNonNullKeepIndexing(datapoints[i]));
        processPointsArray(pointArray[i]);
      }
    } else {
      pointArray = [copyNonNull(points)];
      pointArrayIndexed = [copyNonNullKeepIndexing(points)];
      processPointsArray(pointArray[0]);
    }
    points = pointArray[0];

    autoscale();
    setCurrentSample("last");
  }

  function resetDataSamples(datasamples, interval, start) {
    pointsXMin = pointsYMin = Infinity;
    pointsXMax = pointsYMax = -Infinity;
    pointArray = [];
    if (Object.prototype.toString.call(datasamples[0]) === "[object Array]") {
      for (var i = 0; i < datasamples.length; i++) {
        pointArray.push(indexedData(datasamples[i], interval, start));
        pointArray[pointArray.length-1].forEach(updatePointsExtent);
      }
      points = pointArray[0];
    } else {
      points = indexedData(datasamples, interval, start);
      pointArray = [points];
      points.forEach(updatePointsExtent);
    }
    sampleInterval = interval;
    dataSampleStart = start;
  }


  function resetSamples(datasamples) {
    resetDataSamples(datasamples, sampleInterval, dataSampleStart);
  }

  function deletePoint(pointIndex, arrayIndex) {
    if (!arrayIndex) { arrayIndex = 0; }
    var pointsIndexed = pointArrayIndexed[arrayIndex],
        origPts = points.slice(),
        deleted, newPoints;
    if (pointsIndexed.length) {
      deleted = pointsIndexed[pointIndex].slice();
      pointsIndexed[pointIndex][0] = null;
      pointsIndexed[pointIndex][1] = null;
      pointArrayIndexed[arrayIndex] = pointsIndexed;
      newPoints = copyNonNull(pointsIndexed);
      processPointsArray(newPoints);
      pointArray[arrayIndex] = newPoints;
      if (currentSample >= points.length) {
        currentSample = points.length-1;
      }
    }
    points = pointArray[0];
  }

  // ------------------------------------------------------------
  //
  // Keyboard Handling
  //
  // ------------------------------------------------------------

  function registerKeyboardHandler() {
    svg.node().addEventListener("keydown", function (evt) {
      if (!selected) return false;
      if (evt.type === "keydown") {
        switch (evt.keyCode) {
          case 8:   // backspace
          case 46:  // delete
          if (options.dataChange) {
            var i = points.indexOf(selected);
            deletePoint(i);
            selected = points.length ? points[i > 0 ? i - 1 : 0] : null;
            update();
          }
          evt.preventDefault();
          evt.stopPropagation();
          break;
        }
        evt.preventDefault();
      }
    });
  }

  // ------------------------------------------------------------
  //
  // Graph attribute updaters
  //
  // ------------------------------------------------------------

  // update the title
  function updateTitle() {
    if (options.title && title) {
      title.text(options.title);
    }
    renderGraph();
  }

  // update the x-axis label
  function updateXlabel() {
    if (options.xlabel && xlabel) {
      xlabel.text(options.xlabel);
    }
    renderGraph();
  }

  // update the y-axis label
  function updateYlabel() {
    if (options.ylabel && ylabel) {
      ylabel.text(options.ylabel);
    } else {
      ylabel.style("display", "none");
    }
    renderGraph();
  }

  // ------------------------------------------------------------
  //
  // Main API functions ...
  //
  // ------------------------------------------------------------

  function renderGraph() {
    calculateLayout();
    if (svg === undefined) {
      renderNewGraph();
    } else {
      repaintExistingGraph();
    }
    if (options.showButtons) {
      if (!buttonLayer) createButtonLayer();
      resizeButtonLayer();
    }
    if (options.legendLabels.length > 0) {
      if (!legendLayer) {
        createLegendLayer();
      }
      updateLegendVisibility();
    }
    redraw();
  }

  function reset(idOrElement, options, message) {
    if (arguments.length) {
      initialize(idOrElement, options, message);
    } else {
      initialize();
    }

    // fully reset the buttons, in case which ones are enabled has changed
    if (buttonLayer) {
      buttonLayer.remove();
      buttonLayer = null;
    }

    renderGraph();
    // and then render again using actual size of SVG text elements are
    renderGraph();
    redraw();
    registerKeyboardHandler();
    return api;
  }

  function resize(w, h) {
    scale(w, h);
    initializeLayout();
    renderGraph();
    redraw();
    return api;
  }

  //
  // Public API to instantiated Graph
  //
  api = {
    update:               update,
    repaint:              renderGraph,
    reset:                reset,
    redraw:               redraw,
    resize:               resize,
    notify:               notify,

    // selection brush api
    selectionDomain:      selectionDomain,
    selectionVisible:     selectionVisible,
    selectionListener:    selectionListener,
    selectionEnabled:     selectionEnabled,
    hasSelection:         hasSelection,

    /**
      Read only getter for the d3 selection referencing the DOM elements containing the d3
      brush used to implement selection region manipulation.
    */
    brushElement: function() {
      return brush_element;
    },

    /**
      Read-only getter for the d3 brush control (d3.svg.brush() function) used to implement
      selection region manipulation.
    */
    brushControl: function() {
      return brush_control;
    },

    /**
      Read-only getter for the internal listener to the d3 'brush' event.
    */
    brushListener: function() {
      return brushListener;
    },

    /**
      Allow consumption of points added/removed to graph through clicking
      */
    addPointListener: function(callback) {
      pointListeners.push(callback);
    },

    clearPointListeners: function() {
      pointListeners.length = 0;
    },

    // specific update functions ???
    scale:                scale,
    updateOrRescale:      updateOrRescale,

    xDomain: function(_) {
      if (!arguments.length) return [options.xmin, options.xmax];
      options.xmin = _[0];
      options.xmax = _[1];
      if (updateXScale) {
        updateXScale();
        redraw();
      }
      return api;
    },

    yDomain: function(_) {
      if (!arguments.length) return [options.ymin, options.ymax];
      options.ymin = _[0];
      options.ymax = _[1];
      if (updateYScale) {
        updateYScale();
        redraw();
      }
      return api;
    },

    xmin: function(_) {
      if (!arguments.length) return options.xmin;
      options.xmin = _;
      options.xrange = options.xmax - options.xmin;
      if (updateXScale) {
        updateXScale();
        redraw();
      }
      return api;
    },

    xmax: function(_) {
      if (!arguments.length) return options.xmax;
      options.xmax = _;
      options.xrange = options.xmax - options.xmin;
      if (updateXScale) {
        updateXScale();
        redraw();
      }
      return api;
    },

    ymin: function(_) {
      if (!arguments.length) return options.ymin;
      options.ymin = _;
      options.yrange = options.ymax - options.ymin;
      if (updateYScale) {
        updateYScale();
        redraw();
      }
      return api;
    },

    ymax: function(_) {
      if (!arguments.length) return options.ymax;
      options.ymax = _;
      options.yrange = options.ymax - options.ymin;
      if (updateYScale) {
        updateYScale();
        redraw();
      }
      return api;
    },

    xLabel: function(_) {
      if (!arguments.length) return options.xlabel;
      options.xlabel = _;
      updateXlabel();
      return api;
    },

    yLabel: function(_) {
      if (!arguments.length) return options.ylabel;
      options.ylabel = _;
      updateYlabel();
      return api;
    },

    title: function(_) {
      if (!arguments.length) return options.title;
      options.title = _;
      updateTitle();
      return api;
    },

    width: function(_) {
      if (!arguments.length) return size.width;
      size.width = _;
      return api;
    },

    height: function(_) {
      if (!arguments.length) return size.height;
      size.height = _;
      return api;
    },

    elem: function(_) {
      if (!arguments.length) return elem;
      elem = d3.select(_);
      initialize(elem);
      return api;
    },

    numberOfPoints: function() {
      if (points) {
        return points.length;
      } else {
        return false;
      }
    },

    addAnnotation: function(annotation) {
      annotations.push(annotation);
      redraw();
    },

    resetAnnotations: function() {
      annotations.length = 0;
      redraw();
    },

    // Programmatically the same actions as clicking the autoscale button. Note that we sometimes
    // use autoscale internally with its 'fit' argument set to false.
    autoscale: function() {
      autoscale(true);
    },

    // Point data consist of an array (or arrays) of [x,y] arrays.
    addPoints:     addPoints,
    replacePoints: replacePoints,
    addPoint:      addPoint,
    resetPoints:   resetDataPoints,
    deletePoint:   function(i, idx) {
      deletePoint(i, idx);
      update();
    },

    // Sample data consists of an array (or an array or arrays) of samples.
    // The interval between samples is assumed to have already been set
    // by specifying options.sampleInterval when creating the graph.
    addSamples:    addSamples,
    addSample:     addSample,
    resetSamples:  resetSamples

  };

  // Initialization.
  initialize(idOrElement, options, message);

  if (node) {
    renderGraph();
    // Render again using actual size of SVG text elements.
    renderGraph();
  }

  return api;
};

},{"./axis":1,"./i18n":3}],3:[function(require,module,exports){
var DEFAULT_LANG = 'en-US';

module.exports.translations = require('../locales/translations.json');

module.exports.lang = DEFAULT_LANG;
module.exports.fallback = DEFAULT_LANG;

module.exports.t = function(key) {
  var lang = module.exports.lang;
  return getTranslation(lang, key) ||
         getTranslation(lang.split("-")[0], key) ||
         getTranslation(lang.split("_")[0], key) ||
         getTranslation(module.exports.fallback, key) ||
         key;
};

function getTranslation(lang, key) {
  var translations = module.exports.translations;
  var keys = key.split(".");
  var t = translations[lang];
  var i = 0;
  var k = keys[i];
  while (k && typeof t === "object") {
    t = t[k];
    k = keys[++i];
  }
  return t;
}

},{"../locales/translations.json":4}],4:[function(require,module,exports){
module.exports={
  "en-US": {
    "tooltips": {
        "autoscale": "Show all data (autoscale)",
        "draw"     : "Draw new data points",
        "selection": "Select data for export",
        "legend"   : "Show/hide the legend"
    }
  },
  "pl": {
    "tooltips": {
        "autoscale": "Pokaż cały wykres (autoskalowanie)",
        "selection": "Zaznacz dane do wyeksportowania"
    }
  }
}

},{}],5:[function(require,module,exports){
// Graph constructor.
module.exports = require('./lib/graph');
// Setup access to i18n settings. To use language different from 'en-US', just set:
//   LabGrapher.i18n.lang = "some-language-code";
// before calling Graph constructor.
module.exports.i18n = require('./lib/i18n');

},{"./lib/graph":2,"./lib/i18n":3}]},{},[5])
(5)
});
;
