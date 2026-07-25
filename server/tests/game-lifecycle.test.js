import test from 'node:test';
import assert from 'node:assert';
import { Game } from '../models/Game.js';
import { Player } from '../models/Player.js';

test('nextRound advances from scoring into the next bidding round', () => {
  const game = new Game();
  game.players = [
    new Player('p1', 'P1'),
    new Player('p2', 'P2'),
    new Player('p3', 'P3'),
    new Player('p4', 'P4')
  ];
  game.phase = 'SCORING';
  game.round = 1;

  game.nextRound();

  assert.strictEqual(game.round, 2);
  assert.strictEqual(game.phase, 'BIDDING');
  assert.ok(game.biddingState);
  assert.strictEqual(game.players.every(player => player.hand.length > 0), true);
});

test('nextRound ends the match after final scoring', () => {
  const game = new Game();
  game.players = [
    new Player('p1', 'P1'),
    new Player('p2', 'P2'),
    new Player('p3', 'P3'),
    new Player('p4', 'P4')
  ];
  game.players[0].score = 120;
  game.players[1].score = 80;
  game.phase = 'SCORING';
  game.round = game.maxRounds;

  game.nextRound();

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.deepStrictEqual(game.matchWinners, [{
    id: 'p1',
    accountUserId: null,
    name: 'P1',
    score: 120
  }]);
});

test('match winners include ties and snapshot standings', () => {
  const game = new Game();
  game.players = [
    new Player('p1', 'P1', false, 'u1'),
    new Player('p2', 'P2', false, 'u2'),
    new Player('p3', 'P3', false, 'u3'),
    new Player('p4', 'P4', false, 'u4')
  ];
  game.players[0].score = 200;
  game.players[1].score = 200;
  game.players[2].score = 50;
  game.players[3].score = -10;

  game.endMatch();
  const snapshot = game.getMatchSnapshot();

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.strictEqual(snapshot.winners.length, 2);
  assert.deepStrictEqual(snapshot.winners.map(winner => winner.name), ['P1', 'P2']);
  assert.strictEqual(snapshot.players.length, 4);
});
