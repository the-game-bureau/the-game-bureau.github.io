/*
 * Picmaker prompt helpers.
 *
 * This is the shared source for image-making prompt text used by Mission
 * Control pages. Browser global: window.TgbPicmakerPrompts.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TgbPicmakerPrompts = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function buildGuideImagePrompt(input) {
    var data = input || {};
    var name = clean(data.guideName || data.guide_name || data.name);
    var bio = clean(data.guideBio || data.guide_bio || data.bio);
    var background = clean(data.guideBackground || data.guide_background || data.background);
    var lines = [];

    lines.push('Generate a single portrait image to use as the in-game avatar for the guide character of a real-world, location-based scavenger-hunt game.');
    lines.push('');
    lines.push('CHARACTER');
    lines.push('- Name: ' + (name || '[unnamed guide]'));
    if (bio) lines.push('- Bio: ' + bio);
    if (background) lines.push('- Background: ' + background);
    if (!bio && !background) lines.push('- No bio/background is filled in yet. Invent a fitting look from the name and the tour-guide role.');
    lines.push('');
    lines.push('IMAGE DIRECTION');
    lines.push('- Head-and-shoulders character portrait, facing the viewer, warm and confident.');
    // A GUIDE IS DRAWN, NEVER RENDERED. "Stylized illustration, not a
    // photograph" was too soft a line: image models read it as permission for
    // a photoreal render, which is worse than a photograph here - a guide that
    // looks like a real person implies a real person, and every one of these
    // characters is invented.
    lines.push('- CARTOON. Hand-drawn character art with clean linework and flat or lightly shaded colour, the way an animated series or a comic book draws its cast.');
    lines.push('- NOT REALISTIC IN ANY WAY. No photography, no photorealism, no 3D render, no CGI, no digital painting that imitates a photograph, no real person\'s likeness. If it could be mistaken for a photo of somebody, it is wrong.');
    lines.push('- Clear, well-lit face; simple, uncluttered background that hints at the setting without distracting.');
    lines.push('- Square 1:1 framing, subject centered, safe to crop to a circle for an avatar.');
    lines.push('- No text, letters, logos, or watermarks anywhere in the image.');
    lines.push('');
    lines.push('Produce the image now.');

    return lines.join('\n');
  }

  function guideImageAssetUrl(gameId, extension) {
    var id = clean(gameId);
    var ext = clean(extension || 'png').replace(/^\.+/, '') || 'png';
    return id ? '/mc/assets/guides/' + encodeURIComponent(id) + '.' + ext : '/mc/assets/guides/{game-id}.png';
  }

  return {
    buildGuideImagePrompt: buildGuideImagePrompt,
    guideImageAssetUrl: guideImageAssetUrl
  };
}));
