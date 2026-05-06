// store.js — localStorage state management

const KEYS = {
  THEME: 'planify_theme',
  WEEK_OFFSET: 'planify_week_offset',
  CALENDARS_VISIBLE: 'planify_calendars_visible',
  DRAFT_EVENT: 'planify_draft_event',
  MEALS_CACHE: 'planify_meals_cache',
  SHARED_CALENDARS: 'planify_shared_calendars',
  FIRST_RUN_DONE: 'planify_first_run_done',
};

function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage quota exceeded — silently ignore
  }
}

export const store = {
  getTheme: () => get(KEYS.THEME, 'light'),
  setTheme: (v) => set(KEYS.THEME, v),

  getWeekOffset: () => get(KEYS.WEEK_OFFSET, 0),
  setWeekOffset: (v) => set(KEYS.WEEK_OFFSET, v),

  getCalendarsVisible: () => get(KEYS.CALENDARS_VISIBLE, null),
  setCalendarsVisible: (arr) => set(KEYS.CALENDARS_VISIBLE, arr),

  getDraftEvent: () => get(KEYS.DRAFT_EVENT, null),
  setDraftEvent: (v) => set(KEYS.DRAFT_EVENT, v),
  clearDraftEvent: () => localStorage.removeItem(KEYS.DRAFT_EVENT),

  getMealsCache: () => get(KEYS.MEALS_CACHE, []),
  setMealsCache: (arr) => set(KEYS.MEALS_CACHE, arr),

  // Shared calendars: array of { id, name }
  getSharedCalendars: () => get(KEYS.SHARED_CALENDARS, []),
  setSharedCalendars: (arr) => set(KEYS.SHARED_CALENDARS, arr),

  isFirstRunDone: () => get(KEYS.FIRST_RUN_DONE, false),
  setFirstRunDone: () => set(KEYS.FIRST_RUN_DONE, true),
};
