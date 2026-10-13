/** Cacao Travel is a separate site. Cacao Media only talks to it through its public API. */
export const TRAVEL_URL = (import.meta.env.PUBLIC_TRAVEL_URL ?? 'https://cacao-travel.vercel.app').replace(/\/$/, '');

export const TRAVEL_API = `${TRAVEL_URL}/api/tours.json`;
