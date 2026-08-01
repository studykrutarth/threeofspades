# Three of Spades

A real-time multiplayer trick-taking card game for **4–6 players**, played in the
browser. Players bid for the right to name trump, secretly recruit partners by
"calling" two cards they don't hold, then play out the whole deck trying to
capture point cards.

- **Server** — Node + Express + Socket.IO, with PostgreSQL via Prisma for accounts
  and match history.
- **Client** — React + Vite + Tailwind.

For how the code is organised, see **[CODEBASE.md](CODEBASE.md)**.

---

## Prerequisites

| Tool | Notes |
|---|---|
| **Node.js 20+** | Uses the built-in test runner and modern syntax. |
| **Docker Desktop** | Only for the local PostgreSQL container. Skip it if you already have Postgres running somewhere. |

You can play as a **guest with no database at all** — Postgres is only needed for
accounts, saved stats, and match history.

---

## Setup

**1. Install dependencies** (two separate packages — root and client):

```bash
npm install
```

```bash
npm --prefix client install
```

**2. Create the server environment file.** Copy the example and fill in a secret:

```bash
cp .env.example .env
```

Generate a value for `JWT_SECRET` and paste it into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

The default `DATABASE_URL` already matches the Docker container below, so you
only need to change it if you're using your own Postgres.

**3. Create the client environment file** (optional — the app falls back to
`http://localhost:3001` if you skip this):

```bash
cp client/.env.example client/.env
```

**4. Start PostgreSQL:**

```bash
docker compose up -d
```

**5. Create the database tables:**

```bash
npx prisma migrate dev
```

---

## Running

Three things need to be running. Postgres stays up in the background; the other
two each need their own terminal.

```bash
docker compose up -d
```

```bash
npm start
```

```bash
npm --prefix client run dev
```

Then open **http://localhost:5173**.

| Service | URL | Notes |
|---|---|---|
| Client | http://localhost:5173 | The game |
| Server | http://localhost:3001 | REST + websockets |
| Postgres | localhost:5432 | Credentials in `docker-compose.yml` |

Use `npm run dev` instead of `npm start` if you want the server to restart on
file changes (nodemon).

---

## Playing

1. Open the client and either **sign in**, **create an account**, or
   **play as a guest**. Guests can play everything; only accounts get saved
   stats and match history.
2. **Create a room** — you'll get a 4-letter code — or **join** with a code
   someone shares.
3. Once **4 or more players** are in the room, anyone can hit **Start Match**.
4. A match is **one full deal**: bid, name trump, call two partner cards, then
   play out the tricks.

**If someone drops or closes their tab**, a bot takes over their seat and the
match keeps going. If they come back to the same tab, they reclaim their seat
and hand exactly as they left it.

### Testing on your own machine

You can open several browser tabs to fill a table. Two things to expect:

- Each tab is a **separate player**, because the seat id lives in `sessionStorage`.
- All guest tabs show the **same display name**, because the guest profile lives
  in `localStorage`, which is shared across tabs of one origin. Cosmetic only —
  they're still distinct players.

To watch the bots play, start a match and then close all but one tab.

---

## Tests and linting

```bash
npm test
```

Runs the server test suite (43 tests) with Node's built-in runner — the game
rules, full deals played end to end, the bots, and the stats summariser. There
are no client tests.

```bash
npm --prefix client run lint
```

---

## Troubleshooting

**`Argument 'id' is missing`, or Prisma errors about an adapter**

Installing packages can wipe the generated Prisma client. Regenerate it:

```bash
npx prisma generate
```

**`[db] Prisma connection failed` on server start**

The Postgres container probably isn't running. Check and restart it:

```bash
docker compose ps
```

```bash
docker compose up -d
```

The server deliberately keeps running without a database — you can still play
as a guest, but signup, login, and match history will return errors.

**`EADDRINUSE: address already in use :::3001`**

An old server is still running. Find and stop it, or change `PORT` in `.env`.

**Starting over with an empty database**

This deletes all accounts and match history:

```bash
docker compose down -v
```

Then `docker compose up -d` and `npx prisma migrate dev` again.

---

## Deploying to Railway

In production the Node server serves the built client itself, so this is **one
app service plus a database** — no separate frontend host, no cross-origin
configuration.

**Before you start, one hard constraint:** run **exactly one replica**. Game
rooms live in an in-memory `Map`, so a second instance would have players
landing on a server that doesn't know about their room. Scaling out requires a
Socket.IO Redis adapter first.

**1. Add PostgreSQL** — in your Railway project: **New → Database → PostgreSQL**.

**2. Add the app** — **New → GitHub Repo**, pointed at this repository.

**3. Set the build command** (Settings → Build):

```bash
npm install && npm run build
```

`npm run build` runs `prisma generate` and then builds the client. The Prisma
step is not optional — without it the server fails at runtime with
`Argument 'id' is missing`.

**4. Set the start command** (Settings → Deploy):

```bash
npm run db:deploy && npm start
```

`db:deploy` runs `prisma migrate deploy`, which applies committed migrations
without prompting. Safe to run on every boot; it's a no-op once up to date.

**5. Set variables** (Variables tab):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — Railway's reference syntax, links the two services |
| `JWT_SECRET` | a fresh secret, **not** the one from your local `.env` |
| `NODE_ENV` | `production` |

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Do **not** set `PORT` — Railway injects it. Do **not** set `VITE_API_URL`;
leaving it unset is what makes the client talk to its own origin.

**6. Generate a domain** — Settings → Networking → **Generate Domain**. Railway
supports WebSockets on generated domains, so Socket.IO needs no extra setup.

### Notes

- **`VITE_API_URL` is baked in at build time.** Vite inlines env vars during
  `vite build`, so setting it after a deploy does nothing. Left unset, the
  client uses relative URLs and connects back to whatever origin served it —
  which is what you want here.
- **`CORS_ORIGINS`** is only needed if you host the client somewhere else. It
  takes a comma-separated list of origins. Same-origin deploys need nothing.
- **Free trial credit** on Railway is limited, and an always-on Node service
  plus Postgres consumes it continuously. Check your plan before leaving it up.

---

## Project layout

```
server/          Node backend
  models/        Card, Deck, Player, Game (the state machine)
  engine/        Pure rule functions: bidding, tricks, partners, scoring, bot
  tests/         Server test suite
  index.js       Express + Socket.IO wiring
  auth.js        Signup, login, JWTs, profile, match history
client/
  src/pages/     Home, Login, Signup, Lobby, Room
  src/context/   AuthContext (identity), GameContext (live game)
  src/components/PlayingCard, DeckSelector
prisma/          Database schema and migrations
```

See **[CODEBASE.md](CODEBASE.md)** for a file-by-file walkthrough and the rules
of the game as they're actually implemented.
