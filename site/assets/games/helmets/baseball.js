/*
 * baseball_maker — 8-bit baseball SVG generator
 *
 * Usage:
 *   baseballSVG(primary, secondary, tertiary)        -> "data:image/svg+xml;..." (use as <img src>)
 *   baseballSVGString(primary, secondary, tertiary)  -> "<svg ...>...</svg>"     (inline, store, etc.)
 *
 *   primary   = ball color    (falls back to #FFFFFF)
 *   secondary = stitch color  (falls back to #C8102E — classic baseball red)
 *   tertiary  = outline color (falls back to #2F3740; if shell is also dark, swapped lighter so it stays visible)
 *
 * Works as:
 *   - Browser global: window.baseballSVG / window.baseballSVGString
 *   - CommonJS:       const { baseballSVG } = require('./baseball.js')
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.baseballSVG = api.baseballSVG;
        root.baseballSVGString = api.baseballSVGString;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Strictly symmetrical 17×17 sprite centered inside a 400×400 viewBox.
    //   . empty
    //   O dark outline
    //   S shell
    //   K stitch
    var HALF_ROWS = [
        ['.......O', 'O'],
        ['.....OOS', 'S'],
        ['....OSSS', 'S'],
        ['...OOSSS', 'S'],
        ['..OKSSSS', 'S'],
        ['.OSKSSSS', 'S'],
        ['.OSSKSSS', 'S'],
        ['.OSSKSSS', 'S'],
        ['OOSSKSSS', 'S']
    ];

    function mirrorRow(left, center) {
        return left + center + left.split('').reverse().join('');
    }

    var GRID = (function () {
        var rows = [];
        for (var i = 0; i < HALF_ROWS.length; i++) {
            rows.push(mirrorRow(HALF_ROWS[i][0], HALF_ROWS[i][1]));
        }
        for (var j = HALF_ROWS.length - 2; j >= 0; j--) {
            rows.push(rows[j]);
        }
        return rows;
    }());

    var CELL = 20;
    var OFFSET = 30;

    function normalizeHex(hex, fallback) {
        var value = String(hex || fallback || '').trim();
        if (!value) value = String(fallback || '#000000');
        if (value.charAt(0) !== '#') value = '#' + value;
        value = value.toLowerCase();
        if (/^#[0-9a-f]{3}$/.test(value)) {
            return '#' + value.charAt(1) + value.charAt(1) +
                         value.charAt(2) + value.charAt(2) +
                         value.charAt(3) + value.charAt(3);
        }
        if (/^#[0-9a-f]{6}$/.test(value)) return value;
        return normalizeHex(fallback || '#000000', '#000000');
    }

    function hexToRgb(hex) {
        var value = normalizeHex(hex, '#000000').slice(1);
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    }

    function channelToHex(channel) {
        var n = Math.max(0, Math.min(255, Math.round(channel)));
        var out = n.toString(16);
        return out.length === 1 ? '0' + out : out;
    }

    function rgbToHex(rgb) {
        return '#' + channelToHex(rgb.r) + channelToHex(rgb.g) + channelToHex(rgb.b);
    }

    function mixColors(a, b, weight) {
        var left = hexToRgb(a);
        var right = hexToRgb(b);
        var t = Math.max(0, Math.min(1, Number(weight)));
        return rgbToHex({
            r: left.r + (right.r - left.r) * t,
            g: left.g + (right.g - left.g) * t,
            b: left.b + (right.b - left.b) * t
        });
    }

    function colorBrightness(hex) {
        var rgb = hexToRgb(hex);
        return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
    }

    function buildSVGString(primary, secondary, tertiary) {
        var S = normalizeHex(primary, '#FFFFFF');
        var K = normalizeHex(secondary, '#C8102E');
        var O = normalizeHex(tertiary, '#2F3740');

        if (O === S) O = (colorBrightness(S) < 128) ? '#d6dbe0' : '#2f3740';
        if (K === S) K = mixColors('#C8102E', O, 0.08);

        var palette = { O: O, S: S, K: K };
        var rects = '';

        for (var row = 0; row < GRID.length; row++) {
            var line = GRID[row];
            for (var col = 0; col < line.length; col++) {
                var ch = line.charAt(col);
                if (!palette[ch]) continue;
                rects += '<rect x="' + (OFFSET + col * CELL) + '" y="' + (OFFSET + row * CELL) +
                         '" width="' + CELL + '" height="' + CELL + '" fill="' + palette[ch] + '"/>';
            }
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" shape-rendering="crispEdges">' + rects + '</svg>';
    }

    function baseballSVGString(primary, secondary, tertiary) {
        return buildSVGString(primary, secondary, tertiary);
    }

    function baseballSVG(primary, secondary, tertiary) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildSVGString(primary, secondary, tertiary));
    }

    return { baseballSVG: baseballSVG, baseballSVGString: baseballSVGString };
}));
