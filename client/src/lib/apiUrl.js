// Where the API and websocket server lives.
//
// Vite inlines env vars at build time, so this cannot be reconfigured after a
// deploy — whatever VITE_API_URL is set to when `vite build` runs is baked into
// the bundle. In production the server serves this bundle itself, so the right
// answer is "same origin as the page", which needs no configuration and cannot
// drift. In dev the client is on :5173 and the server on :3001, so it needs an
// explicit URL.
const configured = import.meta.env.VITE_API_URL;
const devFallback = 'http://localhost:3001';

const sameOrigin = import.meta.env.PROD && !configured;

// For fetch(), same-origin means a relative path: `${''}/auth/login`.
// `||` rather than `??` so an empty VITE_API_URL is treated as unset in dev
// too, instead of silently producing relative URLs against the Vite port.
export const API_URL = sameOrigin ? '' : (configured || devFallback);

// Socket.IO is different. Its URL parser only falls back to window.location on
// a loosely-null value (`null == uri`), so an empty string is NOT treated as
// same-origin — it gets rewritten to a broken "http://". Pass undefined instead.
export const SOCKET_URL = sameOrigin ? undefined : (configured || devFallback);
