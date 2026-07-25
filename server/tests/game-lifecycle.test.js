import test from 'node:test';
import assert from 'node:assert';
import { Game } from '../models/Game.js';
import { Player } from '../models/Player.js';

function seat(game, count) {
  for (let i = 1; i <= count; i++) game.addPlayer(`p${i}`, `P${i}`);
}

test('startMatch deals every card and opens bidding', () => {
  const game = new Game();
  seat(game, 4);

  game.startMatch();

  assert.strictEqual(game.phase, 'BIDDING');
  assert.strictEqual(game.totalTricks, 13);
  assert.strictEqual(game.players.every(p => p.hand.length === 13), true);
});

test('a deal hands out every card for 5 and 6 players', () => {
  const five = new Game();
  seat(five, 5);
  five.startMatch();
  assert.strictEqual(five.totalTricks, 10);
  assert.strictEqual(five.players.every(p => p.hand.length === 10), true);

  const six = new Game();
  seat(six, 6);
  six.startMatch();
  assert.strictEqual(six.totalTricks, 8);
  assert.strictEqual(six.players.every(p => p.hand.length === 8), true);
});

test('startMatch refuses to run twice while a deal is live', () => {
  const game = new Game();
  seat(game, 4);
  game.startMatch();

  assert.throws(() => game.startMatch(), /already in progress/);
});

test('startMatch needs at least four players', () => {
  const game = new Game();
  seat(game, 3);

  assert.throws(() => game.startMatch(), /at least 4 players/);
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
