// Self-play trainer for the bot's heuristic weights (server/engine/botParams.js).
// No neural net, no external ML dependency: this is an evolution strategy —
// a population of parameter sets plays real deals against each other with the
// existing Game engine, and the sets that score best survive to be mutated
// into the next generation.
//
// Fitness is the average score delta per deal, straight off the scoreboard:
// a made contract pays the bidder 2x the bid and each partner 1x, while a
// failed one costs the bidder the bid and pays every opponent. Scoring on
// captured points instead — the obvious choice, and what this used to do —
// silently rewards overbidding, because points keep accruing whether or not
// the contract is ever made. On the scoreboard, bidding past what a hand can
// deliver is what it actually is: expensive.
//
// Run it with: node server/engine/evolve.js [generations]
// With no generations argument it runs until Ctrl+C, checkpointing after every
// generation so a long run can be killed and resumed without losing progress.
//
// Whenever a generation produces a new best individual, that individual's
// params are written to bot-params.json — the file botParams.js loads at
// startup — so a trained result only takes effect for the live server the
// next time it restarts. Nothing here touches a running game.
import { Game } from '../models/Game.js';
import { chooseBid, chooseTrump, choosePartnerCards, chooseCard, mustOpenBidding } from './bot.js';
import { DEFAULT_PARAMS, PARAM_BOUNDS, PARAMS_PATH } from './botParams.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = path.join(__dirname, 'evolution-checkpoint.json');

const POP_SIZE = 16;
const ELITE_COUNT = 4;      // survive unmutated, so a good generation can't be lost to noise
const MAX_STEPS_PER_DEAL = 500; // generous ceiling before a deal is considered stuck rather than slow

// A single deal pays somewhere between -310 and +620, so one deal says almost
// nothing about a parameter set — it mostly says whether that seat happened to
// draw the bid. Each individual therefore plays REGROUPINGS x DEALS_PER_TABLE
// deals per generation, against a different set of opponents each regrouping.
// Deals are cheap (thousands per second), so this costs seconds and buys a
// fitness number that means something.
const REGROUPINGS = 8;
const DEALS_PER_TABLE = 8;
const DEALS_PER_INDIVIDUAL = REGROUPINGS * DEALS_PER_TABLE;

// Bumped when the meaning of `fitness` changes. A checkpoint written against a
// different metric holds numbers that cannot be compared with today's, so it is
// discarded rather than silently resumed.
const FITNESS_METRIC = 'score-delta-v1';

const paramNames = Object.keys(DEFAULT_PARAMS);

function clamp(name, value) {
  const [lo, hi] = PARAM_BOUNDS[name];
  return Math.min(hi, Math.max(lo, value));
}

// Gaussian mutation scaled to each parameter's own range, so a param with a
// wide bound (openingBid: 10-150) moves in bigger steps than a narrow one
// (kingFactor: 0-1).
function mutate(params, rate = 0.2) {
  const child = { ...params };
  for (const name of paramNames) {
    if (Math.random() > rate) continue;
    const [lo, hi] = PARAM_BOUNDS[name];
    const span = hi - lo;
    const noise = (Math.random() - 0.5) * span * 0.3;
    const raw = params[name] + noise;
    child[name] = clamp(name, name === 'longTrumpLead' ? Math.round(raw) : Math.round(raw * 100) / 100);
  }
  return child;
}

function randomParams() {
  const params = {};
  for (const name of paramNames) {
    const [lo, hi] = PARAM_BOUNDS[name];
    const raw = lo + Math.random() * (hi - lo);
    params[name] = name === 'longTrumpLead' ? Math.round(raw) : Math.round(raw * 100) / 100;
  }
  return params;
}

// Plays one deal to completion with each seat driven by its own parameter set,
// and returns what each seat scored. startMatch zeroes every score and a deal
// ends the match, so the final score is exactly this deal's delta.
//
// Deliberately not wrapped in a try/catch: the engine functions this calls are
// the same ones the live server uses, so an illegal move here is a real bug,
// and surfacing it beats averaging it away into the fitness numbers.
function playDeal(seatParams) {
  const game = new Game();
  seatParams.forEach((_, i) => game.addPlayer(`s${i}`, `S${i}`));
  game.startMatch();

  const contextFor = (player, params) => ({
    myId: player.id,
    myRole: game.roles.get(player.id) || null,
    bidderId: game.biddingState?.highestBidderId ?? null,
    revealedIds: game.players.filter(p => p.isRevealed).map(p => p.id),
    trump: game.trump,
    trick: game.currentTrick,
    seatCount: game.players.length,
    params
  });

  for (let step = 0; step < MAX_STEPS_PER_DEAL && game.phase !== 'MATCH_END'; step++) {
    const turnId = game.getCurrentTurnPlayerId();
    const seatIndex = Number(turnId.slice(1));
    const player = game.players.find(p => p.id === turnId);
    const params = seatParams[seatIndex];

    switch (game.phase) {
      case 'BIDDING':
        game.placeBid(turnId, chooseBid(game.biddingState.highestBid, {
          hand: player.hand,
          params,
          mustOpen: mustOpenBidding(game.biddingState)
        }));
        break;
      case 'TRUMP_SELECTION':
        game.selectTrump(turnId, chooseTrump(player.hand));
        break;
      case 'PARTNER_SELECTION':
        game.selectPartners(turnId, choosePartnerCards(player.hand, game.roundCardIds));
        break;
      case 'TRICKS':
        game.playCard(turnId, chooseCard(player.hand, game.currentTrick?.leadSuit, contextFor(player, params)).id);
        break;
      default:
        throw new Error(`evolve: unexpected phase ${game.phase}`);
    }
  }

  if (game.phase !== 'MATCH_END') {
    throw new Error('evolve: a deal failed to finish inside the step budget — a real bot bug, not tuning noise');
  }

  return Object.fromEntries(game.players.map(p => [p.id, p.score]));
}

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// One generation. The population is repeatedly reshuffled into 4-seat tables,
// each table plays a run of deals with the seating rotated between them, and
// fitness is the average score delta per deal. Regrouping matters as much as
// the deal count: a set measured only against the same three opponents is
// measured against those opponents, not against the game. Returns the
// population sorted best-first.
function evaluateGeneration(population) {
  const totalScore = new Array(population.length).fill(0);
  const dealsPlayed = new Array(population.length).fill(0);

  for (let round = 0; round < REGROUPINGS; round++) {
    const order = shuffled(population.map((_, i) => i));

    for (let base = 0; base + 4 <= order.length; base += 4) {
      const group = order.slice(base, base + 4);

      for (let d = 0; d < DEALS_PER_TABLE; d++) {
        const seatOrder = shuffled(group);
        const scores = playDeal(seatOrder.map(i => population[i]));

        seatOrder.forEach((individualIndex, seat) => {
          totalScore[individualIndex] += scores[`s${seat}`];
          dealsPlayed[individualIndex]++;
        });
      }
    }
  }

  return population
    .map((params, i) => ({ params, fitness: dealsPlayed[i] > 0 ? totalScore[i] / dealsPlayed[i] : 0 }))
    .sort((a, b) => b.fitness - a.fitness);
}

function loadCheckpoint() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
  } catch {
    return null;
  }

  if (saved.metric !== FITNESS_METRIC) {
    const oldMetric = saved.metric ?? 'points-captured';
    console.log(`Ignoring a checkpoint scored on "${oldMetric}" — fitness is now "${FITNESS_METRIC}".`);
    console.log('Its numbers cannot be compared with today\'s, so this run starts fresh.');

    // The params that checkpoint produced are about to be overwritten by a
    // run that scores differently. They took real time to train, so move them
    // aside rather than dropping them.
    if (fs.existsSync(PARAMS_PATH)) {
      const archive = PARAMS_PATH.replace(/\.json$/, `.${oldMetric}.json`);
      fs.renameSync(PARAMS_PATH, archive);
      console.log(`Previous weights archived to ${path.basename(archive)}`);
    }
    console.log('');
    return null;
  }

  return saved;
}

function saveCheckpoint(generation, population, champion) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ metric: FITNESS_METRIC, generation, population, champion }, null, 2));
}

function saveBestParams(params) {
  fs.writeFileSync(PARAMS_PATH, JSON.stringify(params, null, 2));
}

// One line, always in the same param order, so consecutive generations read
// as a diff rather than a wall of re-ordered JSON.
function formatParams(params) {
  return paramNames.map(name => `${name}=${params[name]}`).join(' ');
}

function nextGeneration(ranked) {
  const elites = ranked.slice(0, ELITE_COUNT).map(r => r.params);
  const children = [];

  while (elites.length + children.length < POP_SIZE - 2) {
    const parent = elites[Math.floor(Math.random() * elites.length)];
    children.push(mutate(parent));
  }

  // A couple of fresh-random entrants each generation, so the search doesn't
  // converge onto a local optimum it can never climb back out of.
  return [...elites, ...children, randomParams(), randomParams()];
}

async function main() {
  const targetGenerations = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

  const checkpoint = loadCheckpoint();
  let generation = checkpoint?.generation ?? 0;
  let population = checkpoint?.population ?? Array.from({ length: POP_SIZE }, (_, i) =>
    i === 0 ? { ...DEFAULT_PARAMS } : randomParams()
  );
  let champion = checkpoint?.champion ?? null;

  console.log(checkpoint
    ? `Resuming from generation ${generation}`
    : `Starting fresh — population ${POP_SIZE}, ${DEALS_PER_INDIVIDUAL} deals per individual per generation`);
  console.log(`Fitness: average score delta per deal (a made contract pays, a failed one costs).\n`);

  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(1); // second Ctrl+C: stop waiting, just quit
    console.log('\nFinishing this generation, then saving checkpoint before exit…');
    stopping = true;
  });

  const recentChampionFitness = [];

  while (generation < targetGenerations && !stopping) {
    // The reigning champion re-enters every generation and is measured again
    // from scratch. Carrying a fitness number forward instead would let one
    // lucky generation crown a set that nothing measured honestly could ever
    // beat — and score deltas swing far too widely for a single reading to be
    // worth trusting.
    if (champion) population[0] = champion;

    const ranked = evaluateGeneration(population);
    const best = ranked[0];
    const mean = ranked.reduce((sum, r) => sum + r.fitness, 0) / ranked.length;

    const changed = !champion || formatParams(best.params) !== formatParams(champion);
    champion = best.params;
    if (changed) saveBestParams(champion);

    recentChampionFitness.push(best.fitness);
    if (recentChampionFitness.length > 10) recentChampionFitness.shift();
    const trend = recentChampionFitness.reduce((sum, f) => sum + f, 0) / recentChampionFitness.length;

    // Printed every generation so a long run gives a continuous readout. The
    // 10-generation average is the number to watch: a single generation's best
    // still bounces around, but the trend only climbs if the weights improved.
    console.log(`gen ${generation}: best=${best.fitness.toFixed(1)} mean=${mean.toFixed(1)} trend(10)=${trend.toFixed(1)}${changed ? '  <- new champion, saved' : ''}`);
    console.log(`  ${formatParams(champion)}`);

    population = nextGeneration(ranked);
    generation++;
    saveCheckpoint(generation, population, champion);
  }

  console.log(`\n=== Stopped at generation ${generation} ===`);

  if (recentChampionFitness.length === 0) {
    console.log('No generations ran, so nothing was measured or saved.');
    return;
  }

  const trend = recentChampionFitness.reduce((sum, f) => sum + f, 0) / recentChampionFitness.length;
  console.log(`Champion fitness (avg score delta per deal): ${recentChampionFitness[recentChampionFitness.length - 1].toFixed(1)}`);
  console.log(`Trend over last ${recentChampionFitness.length} generations: ${trend.toFixed(1)}`);
  console.log(`Saved to: ${PARAMS_PATH}`);
  console.log(`Params:`);
  for (const name of paramNames) console.log(`  ${name}: ${champion[name]}`);
}

main();
