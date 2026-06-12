/*
 * baseball_maker — 8-bit baseball SVG generator
 *
 * Usage:
 *   baseballSVG(primary, secondary, tertiary)        -> "data:image/svg+xml;..." (use as <img src>)
 *   baseballSVGString(primary, secondary, tertiary)  -> "<svg ...>...</svg>"     (inline, store, etc.)
 *
 *   primary   = left stitch color  (falls back to classic baseball red)
 *   secondary = right stitch color (falls back to primary)
 *   tertiary  = outline color      (falls back to #2F3740; light colors use the dark fallback)
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

    // A 21×21 grid keeps the ball visibly pixelated while reading round at the
    // public site's primary 36px icon size.
    var GRID_SIZE = 21;
    var CENTER = 10;
    var OUTER_RADIUS = 9.8;
    var INNER_RADIUS = 8.55;
    var SEAM_MAX_Y = 7;
    var SEAM_BASE_OFFSET = 4.15;
    var SEAM_CURVE = 0.24;
    var SEAM_HALF_WIDTH = 1.45;
    var CELL = 16;
    var OFFSET = 32;

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

    function darkenForWhite(hex, fallback) {
        var color = normalizeHex(hex, fallback);
        if (colorBrightness(color) < 190) return color;
        return mixColors(color, '#2f3740', 0.58);
    }

    function outlineForWhite(hex) {
        var color = normalizeHex(hex, '#2F3740');
        return colorBrightness(color) < 150 ? color : '#2f3740';
    }

    function buildSVGString(primary, secondary, tertiary) {
        var S = '#ffffff';
        var K = darkenForWhite(primary, '#C8102E');
        var A = darkenForWhite(secondary, K);
        var O = outlineForWhite(tertiary);

        var palette = { O: O, S: S, K: K, A: A };
        var rects = '';

        for (var row = 0; row < GRID_SIZE; row++) {
            for (var col = 0; col < GRID_SIZE; col++) {
                var dx = col - CENTER;
                var dy = row - CENTER;
                var distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > OUTER_RADIUS) continue;

                var fill = distance > INNER_RADIUS ? O : S;
                if (fill === S && Math.abs(dy) <= SEAM_MAX_Y) {
                    var seamOffset = SEAM_BASE_OFFSET + SEAM_CURVE * Math.abs(dy);
                    if (Math.abs(col - (CENTER - seamOffset)) <= SEAM_HALF_WIDTH) fill = K;
                    if (Math.abs(col - (CENTER + seamOffset)) <= SEAM_HALF_WIDTH) fill = A;
                }

                rects += '<rect x="' + (OFFSET + col * CELL) + '" y="' + (OFFSET + row * CELL) +
                         '" width="' + CELL + '" height="' + CELL + '" fill="' + fill + '"/>';
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
