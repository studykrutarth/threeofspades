// The tunable numbers behind bot.js's decisions. Hand-picked defaults live
// here; evolve.js improves on them by self-play and writes a winner to
// bot-params.json, which silently overrides these the next time the process
// starts. Nothing here is loaded on a hot path more than once — see BOT_PARAMS
// below.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PARAMS_PATH = path.join(__dirname, 'bot-params.json');

export const DEFAULT_PARAMS = {
  openingBid: 200,     // what a bot opens the auction with when nobody has bid
  bidStep: 10,        // how much a raise clears the current high bid by
  partnerShare: 75,    // points a bot expects its called partners to bring in on top of its own hand
  trumpBonus: 10,     // added to a trump card's points when sizing up a hand
  aceBonus: 5,        // added to an off-trump ace's points
  kingFactor: 0.5,     // fraction of an off-trump king's points that count
  ruffMinPoints: 1,    // a trick must be worth at least this much to spend a trump on
  longTrumpLead: 4      // trump holding long enough to be worth leading out
};

// Bounds evolve.js's mutation is not allowed to cross, so a run cannot drift
// into values that stop making sense (a negative bid step, a bid floor above
// the 310-point ceiling).
export const PARAM_BOUNDS = {
  openingBid: [200, 230],
  bidStep: [5, 40],
  partnerShare: [0, 150],
  trumpBonus: [0, 30],
  aceBonus: [0, 25],
  kingFactor: [0, 1],
  ruffMinPoints: [0, 30],
  longTrumpLead: [2, 8]
};

function readParamsFile() {
  try {
    return JSON.parse(fs.readFileSync(PARAMS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// Read once at import time rather than per decision — bot.js calls these
// functions once per turn per bot, and turns happen far more often than the
// file on disk changes.
export const BOT_PARAMS = { ...DEFAULT_PARAMS, ...(readParamsFile() || {}) };
