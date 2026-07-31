# Three of Spades — How the Code Works

A guide to your own codebase. Read top to bottom the first time; after that use it
as a map. Section 10 is a file-by-file reference if you just want to know what one
specific file does.

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
│                  │   place_bid,      │  to the Game object, │
│                  │   play_card, …    │  or acts as a bot    │
│ GameContext      │                   │  when nobody is home │
│  holds socket +  │ ◄──────────────── │         │            │
│  latest state    │   "game_state"    │         ▼            │
└──────────────────┘   (per player)    │ models/Game.js       │
                                       │  the state machine   │
                                       │         │            │
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

## 4. Server — the concepts

This section explains the ideas; section 10 lists every file individually.

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
then delegates the actual rules to `engine/`. `Game.js` is about *sequencing*;
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

Two more methods matter for reconnection:

- **`hasPlayer(id)`** / **`reconnectPlayer(id, name)`** — if a seat already
  exists for this id, a rejoin reclaims it (hand, score, and all) instead of
  creating a duplicate, and clears `isBot` so a human is driving it again.

### 4.2 `server/engine/` — the rules

These are **pure functions**: data in, data out, no side effects. That is why
they're easy to test, and where you should look when a rule is wrong.

**`bidding.js`**
- Turn order rotates clockwise. Each bid must beat the current high bid.
- A player who passed may re-enter later with a higher bid (passing is not final).
- Bidding ends when a full rotation happens with nobody raising —
  `passesSinceLastBid >= playerCount - 1` once a bid exists.
- `passedPlayers` is a **Set**, which matters — see §7.
- If *everyone* passes with no bid ever placed, `Game.placeBid` redeals rather
  than moving on with no bid winner (that would otherwise strand the table).

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

**`bot.js`**
- Decisions for a seat nobody is driving. Deliberately unambitious: open the
  bidding at a floor only if nobody has bid, name the suit it's longest in,
  call the two most valuable cards it doesn't hold, and otherwise play the
  cheapest legal card so it never hands the other team points.
- Pure functions again — `chooseBid`, `chooseTrump`, `choosePartnerCards`,
  `chooseCard` — so they're tested without any socket or timer involved.

### 4.3 `server/index.js` — the wiring

Holds two in-memory maps, plus one per room:

```js
rooms     // roomId  -> { game, clients, matchSaved, botTimer, reapTimer }
clientMap // socketId -> { roomId, playerId, playerName, accountUserId }
```

Every socket event follows the same three-step shape:

```js
socket.on('place_bid', ({ amount }) => {
  const client = clientMap.get(socket.id);     // 1. who is this?
  room.game.placeBid(client.playerId, amount); // 2. ask the Game
  broadcastState(client.roomId);               // 3. tell everyone
});
```

Events: `join_room`, `start_match`, `place_bid`, `select_trump`,
`select_partners`, `play_card`, `disconnect`.

`broadcastState()` loops over the room's sockets and sends each one its *own*
`getPrivateState()`. This is the single point where hidden information could
leak, so it deserves care. It also calls `scheduleBotTurn()` afterward — if
whoever is on turn is a bot, it acts after a short delay and the broadcast that
follows schedules the next one, chaining until a human is up.

On disconnect the player is flagged `isBot` rather than removed, so a match in
progress isn't destroyed — the bot scheduler picks up their turns. If the room
empties out entirely it isn't deleted immediately: a one-minute grace timer
(`reapTimer`) gives the last player a chance to reload and reclaim their seat
before the table is torn down.

`saveMatchIfEnded()` writes the finished match to Postgres and bumps each
logged-in player's stats. Guests (`accountUserId === null`) are skipped.

### 4.4 Accounts: `server/auth.js`, `server/stats.js`, `server/db.js`

Accounts are completely separate from gameplay — **the game never touches the
database.** You can play as a guest with Postgres switched off entirely.

- `auth.js` — signup/login with bcrypt-hashed passwords and JWTs signed by
  `JWT_SECRET`. `authMiddleware` verifies the `Authorization: Bearer …` header
  and sets `req.userId`. Also serves `/auth/profile` and `/auth/matches`.
- `stats.js` — `summarizeMatchForUser()` turns one stored match row into what a
  specific player would want to know about it (their role, their score, did
  they win). Kept separate from `auth.js` so it can be unit tested without a
  database — it only reads the JSON snapshot already on the row.
- `db.js` — creates the Prisma client. Prisma 7 talks to Postgres through a
  **driver adapter** (`@prisma/adapter-pg`), which is why the adapter is passed
  explicitly. If Prisma fails to start, `prisma` is `null` and every DB call is
  skipped with a warning instead of crashing.

Schema (`prisma/schema.prisma`): `Profile` (account + stats), `Match` (history),
`Account` (reserved for future OAuth like Discord — unused today).

Finding "my matches" has no join table to lean on — `Match.playersData` is a
JSON blob of the whole match snapshot. `/auth/matches` uses a Postgres JSONB
containment query (`players_data @> '{"players":[{"accountUserId": "…"}]}'`)
to find rows where that snapshot's `players` array contains this user, which
works because Postgres applies `@>` containment recursively into nested
arrays and objects.

---

## 5. Client — the concepts

### 5.1 State lives in two contexts

**`context/AuthContext.jsx`** — who you are.
- Real accounts: a JWT in `localStorage` under `threeofspades_token`.
- Guests: a fake profile in `localStorage` under `threeofspades_guest`, no token,
  no server call. This is what makes "Play as Guest" work with no database.
- Exposes `signInWithEmail`, `signUpWithEmail`, `continueAsGuest`, `signOut`,
  and `session` (the raw token, used to authenticate REST calls like
  `fetchMatchHistory`).

**`context/GameContext.jsx`** — the live game.
- Owns the Socket.IO connection.
- Holds `gameState`, which is literally the last `getPrivateState()` the server
  sent. **The whole UI is a function of this object.**
- Exposes action senders: `placeBid`, `selectTrump`, `selectPartners`, `playCard`,
  `startMatch`. Each is a one-line `socket.emit`.
- `joinRoom` sends a `playerKey` alongside your name — see `lib/playerKey.js`.

### 5.2 Pages

| Page | Purpose |
|---|---|
| `Home.jsx` | Sign in / sign up / play as guest |
| `Login.jsx`, `Signup.jsx` | Email + password forms |
| `Lobby.jsx` | Create a room, join by 4-letter code, see your stats and recent matches |
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
- **`lib/playerKey.js`** — a per-tab id in `sessionStorage`, sent to the server as
  `playerKey`, so a reload reclaims your seat instead of creating a new player.
- **`lib/api.js`** — `fetch` wrappers for the `/auth/*` REST endpoints.

Note that two rules are duplicated on the client (points, follow-suit). That's
deliberate — it's for *display responsiveness only*. The server re-checks
everything, so a tampered client gains nothing.

---

## 6. A full match, start to finish

1. **Join.** Each browser emits `join_room` with a name and a `playerKey` (see
   `lib/playerKey.js`). The server creates a `Game` for that room code if one
   doesn't exist. If this key already has a seat, it reclaims it (reconnect);
   otherwise a new `Player` is added.
2. **Start.** With 4+ players someone clicks Start Match → `startMatch()` resets
   scores and calls `deal()`.
3. **Deal.** A deck is built, trimmed for the player count, shuffled, and dealt
   round-robin. Phase → `BIDDING`.
4. **Bidding.** Players bid or pass clockwise until a full rotation passes with no
   raise. Highest bidder wins. Phase → `TRUMP_SELECTION`. (If everyone passes
   with no bid at all, the table redeals instead of getting stuck.)
5. **Trump.** The bid winner picks a suit. Phase → `PARTNER_SELECTION`.
6. **Partners.** The bid winner calls two cards they don't hold. Whoever holds
   them silently becomes a partner and gets a private message. **The bid winner
   is not told who** — that's the central tension of the game. Phase → `TRICKS`.
7. **Tricks.** The bid winner leads. Everyone follows suit if able. Highest trump,
   else highest lead-suit card, wins the trick and leads the next. Playing a
   called card publicly reveals that player as a partner. If anyone disconnects,
   their seat is flagged `isBot` and the bot scheduler in `index.js` plays their
   turns for them.
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
   logged-in players (their `gamesPlayed`/`gamesWon`/`highestScore` are updated,
   and the match becomes visible in their Lobby history). "Play Again" deals a
   fresh hand with scores reset.

**One match = one deal.** There is no multi-round loop.

---

## 7. Things that will trip you up

- **Sets don't survive Socket.IO.** `JSON.stringify(new Set())` is `{}`, so
  `bidding.passedPlayers` is converted to an array in `_serializeBiddingState()`
  before broadcast. Any new `Set` or `Map` in the state needs the same treatment.
- **`localStorage` is shared across tabs of the same origin, but the player key
  isn't.** Two guests in two tabs share one `threeofspades_guest` profile (so
  both show the same name), but each tab keeps its own `playerKey` in
  `sessionStorage`, so they still occupy separate seats. Confusing the first
  time you see it while testing locally.
- **Run `npx prisma generate` after `npm install`.** Installing packages can wipe
  the generated Prisma client, producing confusing errors like
  `Argument 'id' is missing`.
- **Anything added to `getPublicState()` is visible to every player.** Think
  twice before putting partner-related data there.
- **The client duplicates two rules** (point values, follow-suit) purely for
  display. If you change a rule on the server, check `client/src/lib/cards.js`.
- **There is no join table from a profile to its matches.** `/auth/matches`
  finds them by searching the JSON snapshot with a Postgres-specific containment
  query. If you ever move off Postgres, that query needs rewriting.

---

## 8. Tests

`npm test` runs Node's built-in test runner over `server/tests/*.test.js`
(43 tests as of this writing). They cover the engine functions in isolation,
full deals played through `Game` end to end, the bot's decisions, and the
match-history summarizer.

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
| Change what a bot does | `server/engine/bot.js` |
| Change phase order or match length | `server/models/Game.js` |
| Add data the UI needs | `Game.getPublicState()` / `getPrivateState()` |
| Add a socket action | `server/index.js` + `client/src/context/GameContext.jsx` |
| Change the table layout | `client/src/pages/Room.jsx` |
| Change how a card looks | `client/src/components/PlayingCard.jsx` |
| Change login/signup | `server/auth.js`, `client/src/context/AuthContext.jsx` |
| Change what stats/history show | `server/stats.js`, `client/src/pages/Lobby.jsx` |
| Change database tables | `prisma/schema.prisma`, then `npx prisma migrate dev` |

---

## 10. File-by-file reference

Every source file in the repo, grouped by directory. `node_modules`,
`client/dist`, and the raw card PNGs under `cards/` are omitted.

### Root

| File | Purpose |
|---|---|
| `package.json` | Server dependencies and scripts (`npm start`, `npm test`, `npm run dev`, `npm run db:generate`, `npm run db:push`). |
| `package-lock.json` | Locked dependency versions for the server. Commit it; don't hand-edit it. |
| `docker-compose.yml` | Local Postgres for development — `docker compose up -d`. One service, `postgres`, matching the credentials in `.env.example`. |
| `prisma.config.ts` | Tells the Prisma CLI where to find the datasource URL (from `DATABASE_URL`). Only used by `prisma` CLI commands, not the running server. |
| `prisma/schema.prisma` | The database schema: `Profile`, `Account` (unused today, reserved for OAuth), `Match`. Source of truth — run `npx prisma migrate dev` after editing it. |
| `prisma/migrations/` | Generated SQL migration history. Don't hand-edit; regenerate with the Prisma CLI. |
| `.env.example` | Shows the shape of the server's `.env` (`DATABASE_URL`, `JWT_SECRET`, `PORT`) without real secrets. |
| `.gitignore` | Keeps `node_modules`, `.env`, and generated Prisma output out of version control. |
| `CODEBASE.md` | This file. |

### `server/` — root files

| File | Purpose |
|---|---|
| `index.js` | Express + Socket.IO entry point. Room/client bookkeeping, every socket event handler, the bot-turn scheduler, and match persistence on match end. See §4.3. |
| `auth.js` | Signup, login, JWT verification middleware, profile read/update, and match history. See §4.4. |
| `stats.js` | `summarizeMatchForUser()` — turns a stored match's JSON snapshot into one player's view of it (role, score, win/loss). Pure function, no database access itself. |
| `db.js` | Builds the Prisma client with the `@prisma/adapter-pg` driver adapter; exports `prisma` (or `null` if it failed to connect) and `checkDatabaseConnection()`. |

### `server/models/` — stateful game objects

| File | Purpose |
|---|---|
| `Card.js` | One playing card: id, suit, rank, point value, rank ordering, display string. |
| `Deck.js` | Builds a 52-card deck, trims it for 5/6 players, shuffles, deals round-robin. |
| `Player.js` | One seat: hand, score, bot flag, reveal flag, linked account id. |
| `Game.js` | The whole state machine for one table — phases, bidding/trump/partner/trick flow, reconnection, scoring, public/private state. The most important file in the project; see §4.1. |

### `server/engine/` — pure rule functions

| File | Purpose |
|---|---|
| `bidding.js` | Turn rotation, bid validation, pass/re-entry, detecting when the auction is over (including the no-bids-at-all redeal case). |
| `tricks.js` | Leading, follow-suit enforcement, and determining a trick's winner (trump beats all, then lead suit, then rank). |
| `partners.js` | Validating and assigning the two called partner cards, the private reveal notification, and the four-way point breakdown (bidder / revealed partner / hidden partner / opponent) that powers early match-end. |
| `scoring.js` | The bid payout table (success/failure, bidder/partner/opponent) and building the end-of-match result summary. |
| `bot.js` | Decision functions for an unattended seat: bid, trump choice, partner cards, and which card to play. Deliberately conservative so it keeps a match moving without playing well enough to distort it. |

### `server/tests/`

One test file per engine/model file being exercised, plus two that test the system as a whole:

| File | Purpose |
|---|---|
| `card.test.js` | Point values, rank ordering, card equality. |
| `deck.test.js` | Deck creation, the 4/5/6-player removal rules, even dealing. |
| `bidding.test.js` | Bid validation and auction-ending rules. |
| `tricks.test.js` | Follow-suit enforcement and trick-winner determination. |
| `partners.test.js` | Partner validation/assignment, the private notification, and the point breakdown split. |
| `scoring.test.js` | The success/failure payout table. |
| `bot.test.js` | Every bot decision function, plus the all-pass redeal and reconnection reclaiming a seat. |
| `stats.test.js` | `summarizeMatchForUser()` against hand-built match snapshots — win, loss, an unknown user, and a missing snapshot. |
| `game-lifecycle.test.js` | Starting a match, dealing the right number of cards for 4/5/6 players, refusing to double-start, and match-winner/tie snapshotting. |
| `round-completion.test.js` | Plays full deals through `Game` end to end and asserts points-won + points-in-hand always equals 310, for both the full-deal and early-end cases, plus that replaying resets scores correctly. |

### `client/` — root files

| File | Purpose |
|---|---|
| `package.json` | Client dependencies and scripts (`npm run dev`, `build`, `lint`, `preview`). |
| `package-lock.json` | Locked dependency versions for the client. |
| `vite.config.js` | Vite + React + Tailwind plugin setup. |
| `eslint.config.js` | Lint rules (`npx eslint src` from `client/`). |
| `index.html` | The single HTML page Vite mounts the React app into. |
| `README.md` | Vite's default template readme — not project-specific. |

### `client/src/` — entry points

| File | Purpose |
|---|---|
| `main.jsx` | Mounts `<App />` into the DOM. |
| `App.jsx` | Top-level layout and routes (`/`, `/login`, `/signup`, `/lobby`, `/room/:id`). Wraps everything in `AuthProvider`/`GameProvider`. Gives the room route a full-bleed layout since the table manages its own space. |
| `index.css` | Tailwind entry point plus hand-written theme variables, gradients, and small utility classes (`glass-panel`, `btn-gold`, the card-fan hover rule, animations). |

### `client/src/context/`

| File | Purpose |
|---|---|
| `AuthContext.jsx` | Who you are: JWT-based accounts or a guest profile, both persisted so a reload doesn't sign you out. See §5.1. |
| `GameContext.jsx` | The Socket.IO connection and the latest game state, plus the action-sending functions the UI calls. See §5.1. |

### `client/src/pages/`

| File | Purpose |
|---|---|
| `Home.jsx` | Landing page: sign in, create account, or continue as a guest. |
| `Login.jsx` | Email/password sign-in form. |
| `Signup.jsx` | Account creation form (client-side validation mirrors the server's rules). |
| `Lobby.jsx` | Create or join a room by code; for real accounts, shows games played/won/win-rate/best-score and a recent-matches list fetched from `/auth/matches`. |
| `Room.jsx` | The table itself — bidding, trump, partners, tricks, standings, and the match-end screen. See §5.2. |

### `client/src/components/`

| File | Purpose |
|---|---|
| `PlayingCard.jsx` | Renders one card (face or back) in CSS: rank/suit corners, center suit, point badge, dimming, and the winning-card highlight. |
| `DeckSelector.jsx` | The card grid used to call two partner cards, filtered to exclude your own hand and any card not in this deal. |

### `client/src/lib/`

| File | Purpose |
|---|---|
| `api.js` | `fetch` wrappers for `/auth/signup`, `/auth/login`, `/auth/profile` (GET/PATCH), `/auth/matches`. |
| `cards.js` | Display-only helpers: suit symbols/names, a client-side mirror of the point table, and legal-card calculation for dimming illegal plays before the server would reject them. |
| `playerKey.js` | Generates and persists the per-tab id (in `sessionStorage`) that lets a reload reclaim your seat. See §7. |
