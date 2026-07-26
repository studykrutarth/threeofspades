# Three of Spades — How the Code Works

A guide to your own codebase. Read top to bottom the first time; after that use it
as a map.

---

## 1. What this is

A real-time multiplayer trick-taking card game for 4–6 players, played in the
browser. Players bid for the right to name trump, secretly recruit partners by
"calling" two cards, then play out the whole deck trying to capture point cards.

Two halves:

- **Server** (`server/`) — Node + Express + Socket.IO. Holds the authoritative
  game state in memory and pushes updates to every player. Also handles accounts.
- **Client** (`client/`) — React + Vite + Tailwind. Draws the table and sends
  player actions to the server. It holds no game rules of its own.

The golden rule: **the server decides everything.** The client never determines
who won a trick or whether a bid is legal — it asks, and renders the answer.

---

## 2. Running it

```bash
docker compose up -d          # start PostgreSQL
npm start                     # API + websocket server on :3001
npm --prefix client run dev   # React app on :5173
npm test                      # server test suite
```

Environment lives in `.env` (server: `DATABASE_URL`, `JWT_SECRET`, `PORT`) and
`client/.env` (`VITE_API_URL`). Both `.env` files are gitignored; `.env.example`
shows the shape.

---

## 3. The big picture

```
Browser (React)                         Server (Node)
┌──────────────────┐                   ┌──────────────────────┐
│ Room.jsx         │   socket events   │ index.js             │
│  renders state   │ ────────────────► │  routes each event   │
│                  │   place_bid,      │  to the Game object  │
│                  │   play_card, …    │         │            │
│ GameContext      │                   │         ▼            │
│  holds socket +  │ ◄──────────────── │ models/Game.js       │
│  latest state    │   "game_state"    │  the state machine   │
└──────────────────┘   (per player)    │         │            │
                                       │         ▼            │
                                       │ engine/*.js          │
                                       │  pure rule functions │
                                       └──────────────────────┘
                                                 │
                                       PostgreSQL (accounts,
                                       match history) via Prisma
```

Notice the state flows **one way**: an action goes up, a fresh snapshot of the
whole game comes back down. The client never mutates game state locally.

---

## 4. Server

### 4.1 `server/models/` — the things

**`Card.js`** — one playing card.
- `suit` is `'S' | 'H' | 'D' | 'C'`, `rank` is `'2'…'10' | 'J' | 'Q' | 'K' | 'A'`.
- `id` is rank + suit, e.g. `"AS"`, `"10H"`, `"3S"`. **Card ids are used
  everywhere** — the client sends `cardId` strings, not card objects.
- `getPointValue()` — the scoring table: 3♠ = 30, Ace = 20, K/Q/J = 15, 10 = 5,
  everything else 0. All 52 cards together are worth exactly **310 points**.
- `getRankIndex()` — 0 for a 2 up to 12 for an Ace. Used to compare cards.
- `toDisplayString()` — `"K♠"` for messages shown to players.

**`Deck.js`** — a stack of cards.
- `Deck.create()` builds all 52.
- `removeForPlayers(n)` makes the deck divide evenly:
  - 4 players → no removal, 13 cards each
  - 5 players → remove two 2s (never the 2♠ if avoidable), 10 cards each
  - 6 players → remove all four 2s, 8 cards each
  - Since 2s are worth 0 points, **310 points are always in play**.
- `shuffle()` — Fisher–Yates.
- `deal(n)` — deals round-robin, returns a Map keyed `p0`, `p1`, …

**`Player.js`** — one seat.
- `hand` (array of Cards), `score`, `isBot`, `isRevealed` (has this player been
  outed as a partner?), `accountUserId` (null for guests).
- `receiveCards()` sorts the hand by suit then rank, which is why your cards
  arrive grouped.

**`Game.js`** — the state machine, and the most important file on the server.

It holds a `phase` that moves in one direction:

```
LOBBY → DEALING → BIDDING → TRUMP_SELECTION → PARTNER_SELECTION → TRICKS → MATCH_END
```

Each public method guards its phase (`placeBid` throws unless `phase === 'BIDDING'`),
then delegates the actual rules to `engine/`. Game.js is about *sequencing*;
engine files are about *rules*.

Two methods matter most for understanding the client:

- **`getPublicState()`** — everything everyone may see: phase, players (name,
  score, cards remaining, points taken), bidding state, trump, the called cards,
  current trick, whose turn it is.
- **`getPrivateState(playerId)`** — the public state *plus* that one player's
  hand, their secret partner message, and their own role. Every player gets a
  different one of these.

That split is what keeps hidden information hidden. If something must stay
secret, it must not enter `getPublicState()`.

### 4.2 `server/engine/` — the rules

These are **pure functions**: data in, data out, no side effects. That is why
they're easy to test, and where you should look when a rule is wrong.

**`bidding.js`**
- Turn order rotates clockwise. Each bid must beat the current high bid.
- A player who passed may re-enter later with a higher bid (passing is not final).
- Bidding ends when a full rotation happens with nobody raising —
  `passesSinceLastBid >= playerCount - 1` once a bid exists.
- `passedPlayers` is a **Set**, which matters — see §7.

**`tricks.js`**
- `playCard()` enforces follow-suit: if you hold the lead suit you must play it.
  You are never *forced* to trump.
- `determineTrickWinner()` — any trump beats any non-trump; among trumps the
  highest wins; with no trump played the highest card of the *lead suit* wins.
  Off-suit non-trump cards can never win.
- A trick's `cards` is an array of `{ playerId, card }` — it remembers *who*
  played each card, which the UI and scoring both rely on.
- `collectTrick()` is currently unused (dead code).

**`partners.js`**
- `validatePartnerSelection()` — the two called cards must be different, must not
  be in the bidder's own hand, and must actually be in this deal (important for
  5/6 players where 2s were removed).
- `assignPartners()` — anyone holding a called card becomes a partner. Note one
  player may hold both, in which case there is only one partner.
- `notifyPartners()` — builds the private "you are a partner" message.
- **`getTeamPointBreakdown()`** — splits the bid team's captured points four ways:
  bid winner, revealed partners, hidden partners, opponents. This powers the
  early-finish rule (§6).

**`scoring.js`**
- `resolveRound()` — the payout table:
  - Bid **made** (collected ≥ bid): bidder `+2 × bid`, each partner `+1 × bid`,
    opponents `0`.
  - Bid **missed**: bidder `−1 × bid`, partners `0`, each opponent `+1 × bid`.
- `getResultSummary()` — packages the result for the end-of-match screen.

### 4.3 `server/index.js` — the wiring

Holds two in-memory maps:

```js
rooms     // roomId  -> { game, clients, matchSaved }
clientMap // socketId -> { roomId, playerId, playerName, accountUserId }
```

Every socket event follows the same three-step shape:

```js
socket.on('place_bid', ({ amount }) => {
  const client = clientMap.get(socket.id);   // 1. who is this?
  room.game.placeBid(client.playerId, amount); // 2. ask the Game
  broadcastState(client.roomId);              // 3. tell everyone
});
```

Events: `join_room`, `start_match`, `place_bid`, `select_trump`,
`select_partners`, `play_card`, `disconnect`.

`broadcastState()` loops over the room's sockets and sends each one its *own*
`getPrivateState()`. This is the single point where hidden information could
leak, so it deserves care.

On disconnect the player is flagged `isBot` rather than removed, so a match in
progress isn't destroyed. When the last client leaves, the room is deleted.

`saveMatchIfEnded()` writes the finished match to Postgres and bumps each
logged-in player's stats. Guests (`accountUserId === null`) are skipped.

### 4.4 `server/auth.js` and `server/db.js`

Accounts are completely separate from gameplay — **the game never touches the
database.** You can play as a guest with Postgres switched off entirely.

- `auth.js` — signup/login with bcrypt-hashed passwords and JWTs signed by
  `JWT_SECRET`. `authMiddleware` verifies the `Authorization: Bearer …` header
  and sets `req.userId`.
- `db.js` — creates the Prisma client. Prisma 7 talks to Postgres through a
  **driver adapter** (`@prisma/adapter-pg`), which is why the adapter is passed
  explicitly. If Prisma fails to start, `prisma` is `null` and every DB call is
  skipped with a warning instead of crashing.

Schema (`prisma/schema.prisma`): `Profile` (account + stats), `Match` (history),
`Account` (reserved for future OAuth like Discord — unused today).

---

## 5. Client

### 5.1 State lives in two contexts

**`context/AuthContext.jsx`** — who you are.
- Real accounts: a JWT in `localStorage` under `threeofspades_token`.
- Guests: a fake profile in `localStorage` under `threeofspades_guest`, no token,
  no server call. This is what makes "Play as Guest" work with no database.
- Exposes `signInWithEmail`, `signUpWithEmail`, `continueAsGuest`, `signOut`.

**`context/GameContext.jsx`** — the live game.
- Owns the Socket.IO connection.
- Holds `gameState`, which is literally the last `getPrivateState()` the server
  sent. **The whole UI is a function of this object.**
- Exposes action senders: `placeBid`, `selectTrump`, `selectPartners`, `playCard`,
  `startMatch`. Each is a one-line `socket.emit`.

### 5.2 Pages

| Page | Purpose |
|---|---|
| `Home.jsx` | Sign in / sign up / play as guest |
| `Login.jsx`, `Signup.jsx` | Email + password forms |
| `Lobby.jsx` | Create a room or join by 4-letter code |
| `Room.jsx` | The table — everything else |

**`Room.jsx` is the biggest file in the project.** It is organised as a series of
`render*` helpers, each responsible for one region:

- `renderHeader()` — room code, phase, trump, trick counter, contract
- `renderTurnBanner()` — "Your turn to play" / "Alice's turn…"
- `renderPrivateNotice()` — your role, and the secret partner message
- `renderTable()` — the felt: opponent seats, the trick, and your hand
- `renderBiddingPanel()` / `renderTrumpPanel()` / `renderPartnerPanel()` — the
  phase-specific action panel that floats over the felt
- `renderSidebar()` — called cards, standings, bid progress, last trick
- `renderHand()` — your fanned cards
- `renderMatchEndPanel()` — the result screen

Seats are placed on an arc across the top; **you are never drawn as a seat**
because your hand is the strip at the bottom. Each opponent's card fan rotates to
face their seat (90° left, 180° across, 270° right), derived from their arc angle
so 5- and 6-player tables work automatically.

### 5.3 Components and helpers

- **`components/PlayingCard.jsx`** — draws one card in CSS (no images). Handles
  face-down backs, the point badge, dimming for illegal plays, and highlighting.
  The card back's art is a single full-face `div` — swap it for an image if you
  want custom artwork.
- **`components/DeckSelector.jsx`** — the grid the bid winner uses to call two
  partner cards. Filters out cards they hold and cards not in this deal.
- **`lib/cards.js`** — client-side card helpers. `getCardPoints()` mirrors the
  server's scoring table (for display only), and `getLegalCardIds()` mirrors the
  follow-suit rule so illegal cards can be greyed out *before* you click.
- **`lib/api.js`** — `fetch` wrappers for the four `/auth/*` REST endpoints.

Note that two rules are duplicated on the client (points, follow-suit). That's
deliberate — it's for *display responsiveness only*. The server re-checks
everything, so a tampered client gains nothing.

---

## 6. A full match, start to finish

1. **Join.** Each browser emits `join_room`. The server creates a `Game` for that
   room code if one doesn't exist and adds a `Player`. Your `playerId` is your
   socket id.
2. **Start.** With 4+ players someone clicks Start Match → `startMatch()` resets
   scores and calls `deal()`.
3. **Deal.** A deck is built, trimmed for the player count, shuffled, and dealt
   round-robin. Phase → `BIDDING`.
4. **Bidding.** Players bid or pass clockwise until a full rotation passes with no
   raise. Highest bidder wins. Phase → `TRUMP_SELECTION`.
5. **Trump.** The bid winner picks a suit. Phase → `PARTNER_SELECTION`.
6. **Partners.** The bid winner calls two cards they don't hold. Whoever holds
   them silently becomes a partner and gets a private message. **The bid winner
   is not told who** — that's the central tension of the game. Phase → `TRICKS`.
7. **Tricks.** The bid winner leads. Everyone follows suit if able. Highest trump,
   else highest lead-suit card, wins the trick and leads the next. Playing a
   called card publicly reveals that player as a partner.
8. **Ending.** The match ends when *either*:
   - all cards are played, **or**
   - the **publicly visible** haul (bid winner + revealed partners) reaches the
     bid — at that point everyone can see the bid is made, so there is nothing
     left to play for.

   Points held by a still-hidden partner deliberately **do not** count toward
   that early-finish check (the table can't know they belong to the bid team) but
   they **do** count in the final total. Since the visible total already covers
   the bid, stopping early can never change who won.
9. **Scoring.** Payouts applied, phase → `MATCH_END`, match saved to Postgres for
   logged-in players. "Play Again" deals a fresh hand with scores reset.

**One match = one deal.** There is no multi-round loop.

---

## 7. Things that will trip you up

- **`playerId` is the socket id.** Reconnecting makes you a *new* player. This is
  the main reason refreshing mid-game doesn't restore your seat. Fixing it means
  giving players a stable id independent of the socket.
- **Sets don't survive Socket.IO.** `JSON.stringify(new Set())` is `{}`, so
  `bidding.passedPlayers` is converted to an array in `_serializeBiddingState()`
  before broadcast. Any new `Set` or `Map` in the state needs the same treatment.
- **`localStorage` is shared across tabs of the same origin.** Two guests in two
  tabs on one browser will overwrite each other's name. Fine for real players on
  separate devices; confusing when testing locally.
- **Run `npx prisma generate` after `npm install`.** Installing packages can wipe
  the generated Prisma client, producing confusing errors like
  `Argument 'id' is missing`.
- **Anything added to `getPublicState()` is visible to every player.** Think
  twice before putting partner-related data there.
- **The client duplicates two rules** (point values, follow-suit) purely for
  display. If you change a rule on the server, check `client/src/lib/cards.js`.

---

## 8. Tests

`npm test` runs Node's built-in test runner over `server/tests/*.test.js`
(30 tests). They cover the engine functions in isolation plus full deals played
through `Game` end to end.

The most valuable one is `round-completion.test.js`, which plays real deals and
asserts the invariant **points won + points still in hand = 310**. That catches a
whole class of scoring bugs regardless of how the match ended.

There are no client tests.

---

## 9. Where to change what

| I want to… | Go to |
|---|---|
| Change point values or deck composition | `server/models/Card.js`, `Deck.js` |
| Change bidding rules | `server/engine/bidding.js` |
| Change how tricks are won | `server/engine/tricks.js` |
| Change scoring or payouts | `server/engine/scoring.js` |
| Change partner/reveal logic | `server/engine/partners.js` |
| Change phase order or match length | `server/models/Game.js` |
| Add data the UI needs | `Game.getPublicState()` / `getPrivateState()` |
| Add a socket action | `server/index.js` + `client/src/context/GameContext.jsx` |
| Change the table layout | `client/src/pages/Room.jsx` |
| Change how a card looks | `client/src/components/PlayingCard.jsx` |
| Change login/signup | `server/auth.js`, `client/src/context/AuthContext.jsx` |
| Change database tables | `prisma/schema.prisma`, then `npx prisma migrate dev` |
