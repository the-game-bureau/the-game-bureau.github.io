/*
 * basketball_maker — 8-bit basketball SVG generator
 *
 * Usage:
 *   basketballSVG(primary, secondary, tertiary)        -> "data:image/svg+xml;..." (use as <img src>)
 *   basketballSVGString(primary, secondary, tertiary)  -> "<svg ...>...</svg>"     (inline, store, etc.)
 *
 *   primary   = ball color    (falls back to #D85A1A — basketball orange)
 *   secondary = seam color    (falls back to #1A1A1A — dark for contrast)
 *   tertiary  = reserved for compatibility; used only as a contrast fallback
 *
 * Works as:
 *   - Browser global: window.basketballSVG / window.basketballSVGString
 *   - CommonJS:       const { basketballSVG } = require('./basketball.js')
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.basketballSVG = api.basketballSVG;
        root.basketballSVGString = api.basketballSVGString;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // Strictly symmetrical 17×17 sprite centered inside a 400×400 viewBox.
    //   . empty
    //   S shell
    //   K seam
    var HALF_ROWS = [
        ['......SS', 'K'],
        ['....SSSS', 'K'],
        ['...SSSSS', 'K'],
        ['..SSSSSS', 'K'],
        ['.SSKSSSS', 'K'],
        ['.SSSKSSS', 'K'],
        ['SSSSKSSS', 'K'],
        ['SSSSSKSS', 'K'],
        ['SKKKKKKK', 'K']
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
        var S = normalizeHex(primary, '#D85A1A');
        var K = normalizeHex(secondary, '#1A1A1A');
        var T = normalizeHex(tertiary, '#000000');

        if (K === S) K = mixColors(S, colorBrightness(S) < 80 ? '#ffffff' : '#000000', 0.82);
        if (colorBrightness(S) < 48 && K === '#000000') K = (T === S) ? '#ffffff' : T;

        var palette = { S: S, K: K };
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

    function basketballSVGString(primary, secondary, tertiary) {
        return buildSVGString(primary, secondary, tertiary);
    }

    function basketballSVG(primary, secondary, tertiary) {
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildSVGString(primary, secondary, tertiary));
    }

    return { basketballSVG: basketballSVG, basketballSVGString: basketballSVGString };
}));
