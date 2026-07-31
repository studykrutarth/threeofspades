// Turns a stored match row into what one specific player would want to see
// about it. Kept separate from auth.js so it can be unit tested without a
// database — it only ever touches the JSON snapshot already on the row.

// The snapshot's players use the in-game session id (see Game.js), not the
// account id, so a player's role has to be looked up via that bridge.
export function summarizeMatchForUser(match, userId) {
  const snapshot = match.playersData || {};
  const players = snapshot.players || [];
  const winners = snapshot.winners || [];
  const result = snapshot.result || null;

  const me = players.find(p => p.accountUserId === userId);
  const myRole = result?.roles?.find(r => r.id === me?.id)?.role ?? null;
  const isWinner = winners.some(w => w.accountUserId === userId);

  return {
    id: match.id,
    date: match.date,
    playerCount: players.length,
    trump: snapshot.trump ?? null,
    isWinner,
    myScore: me?.score ?? null,
    myRole,
    bidAmount: result?.bidAmount ?? null,
    bidSuccess: result?.isSuccess ?? null
  };
}
