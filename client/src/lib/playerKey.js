const PLAYER_KEY_STORAGE = 'threeofspades_player_key';

// Identifies a seat at the table. Deliberately kept in sessionStorage rather
// than localStorage: sessionStorage survives a reload, so refreshing returns you
// to your own hand, but it is per-tab, so two tabs are two different players
// instead of fighting over one seat.
export function getPlayerKey() {
  let key = sessionStorage.getItem(PLAYER_KEY_STORAGE);

  if (!key) {
    key = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(PLAYER_KEY_STORAGE, key);
  }

  return key;
}
