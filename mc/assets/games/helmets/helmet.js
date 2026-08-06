// Compatibility wrapper. Canonical sport-mark generators live in /mc/picmaker/.
(function (root) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = require('../../../mc/picmaker/helmet.js');
    return;
  }
  if (root && root.document) {
    root.document.write('<script src="/mc/picmaker/helmet.js"><\/script>');
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
