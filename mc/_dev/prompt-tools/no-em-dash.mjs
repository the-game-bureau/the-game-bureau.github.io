// Shared wording for the no-em-dash rule, and the sweeper that checks it holds.
//
// WHY THIS FILE EXISTS: the rule now appears in a dozen prompts and eleven cloud
// routines. Written out by hand each time it drifts, and a drifted rule is worse
// than none because the next person cannot tell which wording is canonical.
// Import RULE from here for anything in the repo; paste it verbatim into a
// routine's stored prompt, which lives at claude.ai and cannot import.
//
// Run `node mc/_dev/prompt-tools/no-em-dash.mjs` to scan the repo's prompt text.
export const RULE = `NO EM DASHES ANYWHERE IN WHAT YOU HAND BACK. Not in a caption, not in a
headline, not in a description, not in an internal note, not in the closing
summary, and not in any email or HTML you produce. Not as the character and not
as the \`&mdash;\` entity. Use a comma, a colon, a semicolon, a full stop or
brackets; every one of them is available and one of them always fits. An em dash
is the single clearest tell that a machine wrote the line. This prompt does not
use one either, deliberately: if the instructions were littered with them you
would copy the habit.`;

export const EM = '\u2014';
