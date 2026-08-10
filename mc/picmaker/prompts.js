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

  // The look rules, shared by the one-guide prompt and the batch. They are the
  // product here - every clause was paid for by a bad render - so they exist
  // once and both callers read the same copy. `who` is what the hometown lines
  // address: a named town for one portrait, "each character's hometown" for a
  // sheet of them.
  function imageDirectionLines(hometownSubject) {
    var lines = [];
    lines.push('- Head-and-shoulders character portrait, facing the viewer, warm and confident.');
    if (hometownSubject) {
      // The place shows in the PERSON. Without this an image model reaches
      // straight for the skyline, the bridge or the team badge - which pins
      // the portrait to a landmark, and a guide is used in cities that are
      // not their own.
      lines.push('- THE HOMETOWN SHOWS IN THE PERSON, not behind them. ' + hometownSubject + ' should read in the clothing, the gear, the weather on their face, the wear on what they carry - the climate, the work and the era of that place.');
      lines.push('- Do NOT draw a landmark, skyline, bridge, city sign, map, flag, team logo or souvenir. No postcard of the town behind their shoulder.');
    }
    // A GUIDE IS DRAWN, NEVER RENDERED. "Stylized illustration, not a
    // photograph" was too soft a line: image models read it as permission for
    // a photoreal render, which is worse than a photograph here - a guide that
    // looks like a real person implies a real person, and every one of these
    // characters is invented.
    lines.push('- CARTOON. Hand-drawn character art with clean linework and flat or lightly shaded colour, the way an animated series or a comic book draws its cast.');
    lines.push('- NOT REALISTIC IN ANY WAY. No photography, no photorealism, no 3D render, no CGI, no digital painting that imitates a photograph, no real person\'s likeness. If it could be mistaken for a photo of somebody, it is wrong.');
    lines.push('- Clear, well-lit face; simple, uncluttered background that hints at the setting without distracting.');
    // SQUARE AND FULL, not a circle on a background. "Safe to crop to a circle"
    // was read as an instruction to DRAW one, and the results came back as a
    // roundel with dead corners. Transparency is not the alternative here: the
    // Green Room re-encodes every upload as JPEG, which has no alpha channel,
    // so a transparent corner arrives black or white anyway. A square that is
    // filled edge to edge is the only version of this that survives the trip.
    lines.push('- Square 1:1, and the ARTWORK FILLS THE WHOLE SQUARE, edge to edge, corner to corner.');
    lines.push('- Do NOT draw a circle, oval, roundel, badge, sticker, frame, border or vignette around the subject, and do not leave the corners empty, blank, white or transparent. The background is part of the picture and reaches all four corners.');
    lines.push('- Subject centred, with a little room above the head, so a circular crop would not cut the face.');
    lines.push('- No text, letters, logos, or watermarks anywhere in the image.');
    return lines;
  }

  // THE FILE NAME IS COMPUTED HERE, NOT LEFT TO THE MODEL. A dozen portraits
  // arrive in the downloads folder as image1.png, image2.png, and the mapping
  // back to who is who is gone the moment the chat is closed - so each one is
  // handed its exact name, city first, because that is how the Green Room and
  // the picker both order guides.
  function slugPart(value) {
    return String(value == null ? '' : value)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')       // drop accents rather than dropping the letter
      .replace(/[’']/g, '')                  // O'Neill -> oneill, not o-neill
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function guideImageFileName(guide) {
    var parts = [slugPart(guide && guide.hometown), slugPart(guide && guide.name)].filter(Boolean);
    return (parts.join('-') || 'guide') + '.jpg';
  }

  function readGuide(input) {
    var data = input || {};
    return {
      name: clean(data.guideName || data.guide_name || data.name),
      hometown: clean(data.guideHometown || data.guide_hometown || data.hometown),
      bio: clean(data.guideBio || data.guide_bio || data.bio),
      background: clean(data.guideBackground || data.guide_background || data.background)
    };
  }

  // ONE PROMPT, MANY PORTRAITS. Written for the Green Room's "every guide with
  // no picture" button: the direction is stated once and the characters are
  // listed under it, which is the only way a roomful of missing portraits is a
  // single errand rather than thirty trips through the dialog.
  //
  // The closing paragraph is the load-bearing part. Asked for twelve images,
  // a model's two standing temptations are to draw one picture with twelve
  // faces in it, or to do three and ask whether to continue - so the prompt
  // forbids the contact sheet outright and tells it to keep going in order.
  function buildGuideImageBatchPrompt(list) {
    var guides = (list || []).map(readGuide).filter(function (g) { return g.name; });
    if (!guides.length) return '';
    if (guides.length === 1) return buildGuideImagePrompt(guides[0]);

    var n = guides.length;
    var lines = [];
    lines.push('Generate ' + n + ' SEPARATE portrait images, one for each character listed below. They are the guide characters of a real-world, location-based scavenger-hunt game: the voice in a player\'s ear.');
    lines.push('');
    lines.push('IMAGE DIRECTION - applies to every one of the ' + n + ' images');
    imageDirectionLines('Each character\'s hometown').forEach(function (line) { lines.push(line); });
    lines.push('- Do not carry a face, an outfit or a palette from one character to the next. These are ' + n + ' unrelated people.');
    lines.push('');
    lines.push('THE ' + n + ' CHARACTERS - one image each, in this order');
    guides.forEach(function (g, i) {
      lines.push('');
      lines.push((i + 1) + '. ' + g.name);
      lines.push('   - FILE NAME for this image: ' + guideImageFileName(g));
      if (g.hometown) lines.push('   - Hometown, where the character is FROM: ' + g.hometown);
      if (g.bio) lines.push('   - Bio: ' + g.bio);
      if (g.background) lines.push('   - Background: ' + g.background);
      if (!g.hometown && !g.bio && !g.background) {
        lines.push('   - Nothing written down yet. Invent a fitting look from the name and the guide role.');
      }
    });
    lines.push('');
    lines.push('Produce all ' + n + ' images, in the order above, ONE IMAGE PER CHARACTER.');
    lines.push('Do NOT combine two characters into one picture, and do not draw a contact sheet, grid, line-up or group scene.');
    // The names are what make a folder of downloads usable an hour later. Said
    // twice - once per character above, once as a rule here - because it is
    // the instruction most likely to be skipped, and the failure is silent:
    // twelve correct portraits nobody can match back to a card.
    lines.push('NAME EVERY FILE with the FILE NAME given under that character - exactly as written, city first, all lower case, .jpg. Do not invent your own names and do not number them image1, image2.');
    lines.push('If your tool will not let you set a file name, print the file name as a line of text immediately above each image so it can be renamed after downloading.');
    lines.push('If you can only make one image at a time, work down the list in order and keep going until all ' + n + ' are done. Do not stop to ask whether to continue.');
    return lines.join('\n');
  }

  function buildGuideImagePrompt(input) {
    // HOMETOWN IS THE STRONGEST VISUAL CUE THE ROW CARRIES, and it was the one
    // field this prompt did not read. A guide is written as somebody FROM
    // somewhere - it is the anchor the character brief is built on - and that
    // shows in a portrait long before a biography does: the coat, the weather
    // on the face, the trade. Optional, so the callers that have no hometown
    // to give (the picmaker page, the game builder) are unaffected.
    var g = readGuide(input);
    var name = g.name;
    var bio = g.bio;
    var background = g.background;
    var hometown = g.hometown;
    var lines = [];

    lines.push('Generate a single portrait image to use as the in-game avatar for the guide character of a real-world, location-based scavenger-hunt game.');
    lines.push('');
    lines.push('CHARACTER');
    lines.push('- Name: ' + (name || '[unnamed guide]'));
    if (hometown) lines.push('- Hometown, where the character is FROM: ' + hometown);
    if (bio) lines.push('- Bio: ' + bio);
    if (background) lines.push('- Background: ' + background);
    if (!bio && !background) {
      lines.push(hometown
        ? '- No bio or background is filled in yet. Invent a fitting look from the name, the hometown above and the guide role.'
        : '- No bio/background is filled in yet. Invent a fitting look from the name and the tour-guide role.');
    }
    lines.push('');
    lines.push('IMAGE DIRECTION');
    imageDirectionLines(hometown).forEach(function (line) { lines.push(line); });
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
    // Exported so the Green Room's character brief can ask for portraits in
    // the same breath as the guides themselves. It is the look rules only —
    // no character, no framing — because there the characters are the thing
    // the AI is about to invent and does not know yet.
    guideImageDirectionLines: imageDirectionLines,
    buildGuideImageBatchPrompt: buildGuideImageBatchPrompt,
    buildGuideImagePrompt: buildGuideImagePrompt,
    guideImageAssetUrl: guideImageAssetUrl
  };
}));
