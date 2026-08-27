/* ONE ROOM BLURB, READ IN TWO PLACES.
 *
 * A room's blurb is its standing one-sentence description of itself. It is
 * shown twice: on the room's own header, under the title, and on that room's
 * Ancillary Things card at /mc/, which is the door you go through to reach it.
 *
 * THOSE TWO WERE HAND-COPIED AND THEY DRIFTED. That is not a hypothetical --
 * the Socializer's card still promised a per-account composer picker months
 * after that picker was deleted, and nothing made it obvious, because a stale
 * card still reads perfectly. A door that describes a room in its own words has
 * to be updated whenever the room changes, and "remember to copy it" is not a
 * mechanism.
 *
 * So the sentence lives HERE, once, and both places render it. Edit the string
 * in this file and the room and its door change together; there is no second
 * copy to forget.
 *
 * HOW TO USE IT: put `data-room-blurb="<key>"` on an empty element, load this
 * file, and the text appears. Both surfaces use the same `.room-blurb` class,
 * so they are the same container as well as the same words.
 *
 * NO FALLBACK TEXT IN THE MARKUP, DELIBERATELY. Leaving the sentence inline as
 * a safety net would recreate exactly the thing this file exists to kill: two
 * copies, one of them quietly wrong. An element that renders EMPTY because the
 * script did not load is a visible failure somebody fixes; a stale sentence is
 * an invisible one nobody ever notices. Same reasoning that deleted the
 * soundtracks JSON fallback.
 *
 * A ROOM JOINS THIS FILE WHEN IT GETS A DOOR, AND LEAVES WHEN IT LOSES ONE.
 * Partners joined on 2026-08-20 and left the same day: the room was folded
 * into the Path Builder, because a partner is a waypoint and it was a second
 * list of the same rows. A key nothing renders is exactly the stale copy
 * this file exists to prevent. The Path Builder and the Green
 * Room have blurbs and no Ancillary Things card, so their sentence is written once,
 * on the room, and has nothing to drift against. Add them here the day they get
 * a card, not before.
 */
(function () {
  'use strict';

  var BLURBS = {
    'stock-room': 'Gifts for every city we play in. Books and objects are added here by hand or through ai; certify or shelve each one.',
    'tape-room': 'Soundtracks enhance the game experience. Tracks are added here through ai and start as "shelved". This page allows you to manage soundtracks.',
    // ITS OWN ROOM SINCE 2026-08-26. The tape-room sentence above used to end
    // "turn tapes live, edit them and fix issues", which stopped being true the
    // day the findings came out of that room.
    //
    // IT DESCRIBES WHAT THE ROOM IS FOR, NOT WHAT IS CURRENTLY IN IT. The
    // sentence was "what the daily audit found wrong with the tapes", which
    // names soundtracks as the whole subject and the bot as the only writer.
    // Both are true today and neither is the point of the room: it is where a
    // person decides, and the Gift Shop's findings belong here too.
    'issues': "We all have issues! This is where you'll find things that need correcting, from soundtracks to the Gift Shop. This is where you add the human element to what we do.",
    'socializer': 'Social media posts are added here manually or through ai. Edit then skip or post each one.'
  };

  // textContent, not innerHTML: these are sentences, and one of them carries
  // quotation marks. Written as text they need no escaping and cannot smuggle
  // markup into a header.
  function paint(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-room-blurb]');
    Array.prototype.forEach.call(nodes, function (el) {
      var text = BLURBS[el.getAttribute('data-room-blurb')];
      if (typeof text === 'string') el.textContent = text;
    });
  }

  // Run now for a script at the end of the body, and again on DOMContentLoaded
  // for one in the head. Painting twice is free; painting too early is a blank
  // card nobody can explain.
  paint();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  }

  window.TgbRoomBlurbs = {
    text: function (key) { return BLURBS[key] || ''; },
    keys: function () { return Object.keys(BLURBS); },
    paint: paint
  };
})();
