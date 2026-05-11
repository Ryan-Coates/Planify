// app.js — main entry point, orchestrates all modules

import { store } from './store.js';
import { initAuth, signIn, signOut, isSignedIn } from './auth.js';
import { listCalendars, listEvents } from './calendar.js';
import { initWeekView, renderWeek } from './weekView.js';
import { initDayView, renderDay } from './dayView.js';
import { initEventModal, openNewEventModal, openEditEventModal } from './eventModal.js';
import { initMealPlanner, openNewMealModal, openEditMealModal, listMealEvents, resetMealCalendarId, _getMealCalendarId } from './mealPlanner.js';
import { initSettings, openSettings } from './settings.js';
import { loadLibrary } from './mealLibrary.js';
import { initWizard, openWizard } from './weekWizard.js';
import { startOfWeek, addDays, toDateString, showToast } from './utils.js';
import { createEvent, updateEvent, deleteEvent } from './calendar.js';

// ---- State ----
let weekOffset    = store.getWeekOffset();
let dayOffset     = 0;  // days from today in day-view mode
let viewMode      = 'day'; // 'day' | 'week'
let allEvents     = [];
let mealEvents    = [];
let userCalendars = [];

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(store.getTheme());

  // Auth
  initAuth(onSignIn, onSignOut);

  // Week view
  initWeekView({
    onCellClick: (date, hour) => openNewEventModal(date, hour),
    onEventClick: (event) => {
      const calId = _calendarIdForEvent(event);
      openEditEventModal(event, calId);
    },
    onMealAddClick: (date) => openNewMealModal(date),
    onMealClick: (mealEvent) => openEditMealModal(mealEvent),
  });

  // Day view
  initDayView({
    onCellClick: (date, hour) => openNewEventModal(date, hour),
    onEventClick: (event) => {
      const calId = _calendarIdForEvent(event);
      openEditEventModal(event, calId);
    },
    onMealAddClick: (date) => openNewMealModal(date),
    onMealClick: (mealEvent) => openEditMealModal(mealEvent),
  });

  // Modals
  initEventModal(onEventSaved);
  initMealPlanner(onMealSaved);
  initSettings(onCalendarVisibilityChanged);

  // Wizard
  initWizard({
    onSaveMeal:        onWizardSaveMeal,
    onRemoveMeal:      onWizardRemoveMeal,
    onSaveHousehold:   onWizardSaveHousehold,
    onRemoveHousehold: onWizardRemoveHousehold,
    onAddEvent: (date, hour) => openNewEventModal(date, hour),
    onDone: refreshWeek,
  });

  // Toolbar buttons
  document.getElementById('btn-plan-week').addEventListener('click', onPlanWeekClick);
  document.getElementById('btn-view-day').addEventListener('click', () => switchView('day'));
  document.getElementById('btn-view-week').addEventListener('click', () => switchView('week'));
  document.getElementById('btn-prev-week').addEventListener('click', () => navigatePrev());
  document.getElementById('btn-next-week').addEventListener('click', () => navigateNext());
  document.getElementById('btn-today').addEventListener('click', () => goToToday());
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-signin').addEventListener('click', signIn);
  document.getElementById('btn-signout').addEventListener('click', signOut);
  document.getElementById('btn-add-event').addEventListener('click', () => {
    openNewEventModal(getCurrentDayDateStr());
  });

  // Set initial view
  _applyViewMode();

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);

  // Initial render
  renderCurrentView();
});

// ---- View mode ----

function switchView(mode) {
  viewMode = mode;
  _applyViewMode();
  renderCurrentView();
}

function _applyViewMode() {
  document.getElementById('btn-view-day').classList.toggle('active', viewMode === 'day');
  document.getElementById('btn-view-week').classList.toggle('active', viewMode === 'week');
  // Prev/Next label
  document.getElementById('btn-prev-week').title = viewMode === 'week' ? 'Previous week' : 'Previous day';
  document.getElementById('btn-next-week').title = viewMode === 'week' ? 'Next week'     : 'Next day';
  // Container class for CSS mobile scoping
  const wc = document.getElementById('week-container');
  wc.classList.toggle('view-week', viewMode === 'week');
  wc.classList.toggle('view-day',  viewMode === 'day');
}

function navigatePrev() {
  if (viewMode === 'week') changeWeek(-1);
  else { dayOffset--; renderCurrentView(); }
}

function navigateNext() {
  if (viewMode === 'week') changeWeek(1);
  else { dayOffset++; renderCurrentView(); }
}

function getCurrentDayDate() {
  return addDays(new Date(), dayOffset);
}

function getCurrentDayDateStr() {
  return toDateString(getCurrentDayDate());
}

// ---- Auth callbacks ----

async function onSignIn(userInfo) {
  userCalendars = await listCalendars();
  await loadLibrary();

  // Show first-run prompt if this is the first sign-in
  if (!store.isFirstRunDone()) {
    _showFirstRunModal();
  } else {
    await refreshWeek();
  }
}

function onSignOut() {
  allEvents  = [];
  mealEvents = [];
  renderCurrentWeek();
}

// ---- First-run shared calendar prompt ----

function _showFirstRunModal() {
  const overlay = document.getElementById('first-run-overlay');
  overlay.classList.remove('hidden');

  // Populate dropdown from already-fetched calendar list
  const sel = document.getElementById('first-run-cal-select');
  sel.innerHTML = '<option value="">— None, skip —</option>';
  userCalendars.forEach(cal => {
    const opt = document.createElement('option');
    opt.value = cal.id;
    opt.textContent = cal.summary;
    sel.appendChild(opt);
  });

  document.getElementById('btn-first-run-skip').onclick = _finishFirstRun;

  document.getElementById('btn-first-run-save').onclick = () => {
    const id   = sel.value;
    const name = sel.options[sel.selectedIndex]?.text || id;
    if (id) {
      store.setSharedCalendars([{ id, name }]);
    }
    _finishFirstRun();
  };
}

function _finishFirstRun() {
  document.getElementById('first-run-overlay').classList.add('hidden');
  store.setFirstRunDone();
  refreshWeek();
}

// ---- Week navigation ----

function changeWeek(delta) {
  weekOffset += delta;
  store.setWeekOffset(weekOffset);
  refreshWeek();
}

function goToToday() {
  dayOffset  = 0;
  weekOffset = 0;
  store.setWeekOffset(0);
  renderCurrentView();
}

function getCurrentMonday() {
  return startOfWeek(addDays(new Date(), weekOffset * 7));
}

async function refreshWeek() {
  const monday = getCurrentMonday();
  const sunday = addDays(monday, 6);
  sunday.setHours(23, 59, 59, 999);

  if (isSignedIn()) {
    const timeMin = monday.toISOString();
    const timeMax = sunday.toISOString();

    const visible = store.getCalendarsVisible() ?? userCalendars.map(c => c.id);

    // Own calendars
    const ownPromises = userCalendars
      .filter(c => visible.includes(c.id) && c.summary !== 'Planify Meals')
      .map(c => listEvents(c.id, timeMin, timeMax));

    // Shared calendars (always shown)
    const sharedPromises = store.getSharedCalendars()
      .map(c => listEvents(c.id, timeMin, timeMax));

    const results = await Promise.all([...ownPromises, ...sharedPromises]);
    allEvents = results.flat();

    mealEvents = await listMealEvents(timeMin, timeMax);
  } else {
    allEvents  = DEMO_EVENTS;
    mealEvents = DEMO_MEALS;
  }

  renderCurrentView();
}

function renderCurrentView() {
  if (viewMode === 'week') {
    renderCurrentWeek();
  } else {
    renderCurrentDay();
  }
}

function renderCurrentWeek() {
  renderWeek(getCurrentMonday(), allEvents, mealEvents);
}

function renderCurrentDay() {
  const date = getCurrentDayDate();
  // Fetch events for this specific day if we don't have a wide enough window
  _ensureEventsForDate(date).then(() => {
    renderDay(date, allEvents, mealEvents);
    _updateDayLabel(date);
  });
}

function _updateDayLabel(date) {
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  document.getElementById('week-label').textContent =
    date.toLocaleDateString('en-GB', opts);
}

/** Fetch allEvents/mealEvents for a single day (local timezone). */
async function _ensureEventsForDate(date) {
  if (!isSignedIn()) { allEvents = DEMO_EVENTS; mealEvents = DEMO_MEALS; return; }

  // Use local midnight so all-day events on this date are included regardless of timezone
  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = toDateString(date);
  const start   = new Date(`${dateStr}T00:00:00`);
  const end     = new Date(`${dateStr}T23:59:59`);
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  const visible = store.getCalendarsVisible() ?? userCalendars.map(c => c.id);
  const ownP    = userCalendars
    .filter(c => visible.includes(c.id) && c.summary !== 'Planify Meals')
    .map(c => listEvents(c.id, timeMin, timeMax));
  const sharedP = store.getSharedCalendars().map(c => listEvents(c.id, timeMin, timeMax));

  const results = await Promise.all([...ownP, ...sharedP]);
  allEvents  = results.flat();
  mealEvents = await listMealEvents(timeMin, timeMax);
}

// ---- Plan Week wizard ----

function onPlanWeekClick() {
  // Always fetch the full week's data before opening the wizard,
  // because in day view allEvents/mealEvents only cover today.
  _fetchWeekForWizard().then(({ weekEvents, weekMeals }) => {
    openWizard(getCurrentMonday(), weekEvents, weekMeals);
  });
}

async function _fetchWeekForWizard() {
  const monday = getCurrentMonday();
  const sunday = addDays(monday, 6);
  sunday.setHours(23, 59, 59, 999);

  if (!isSignedIn()) {
    return { weekEvents: DEMO_EVENTS, weekMeals: DEMO_MEALS };
  }

  const timeMin = monday.toISOString();
  const timeMax = sunday.toISOString();

  const visible = store.getCalendarsVisible() ?? userCalendars.map(c => c.id);
  const ownP = userCalendars
    .filter(c => visible.includes(c.id) && c.summary !== 'Planify Meals')
    .map(c => listEvents(c.id, timeMin, timeMax));
  const sharedP = store.getSharedCalendars().map(c => listEvents(c.id, timeMin, timeMax));

  const results   = await Promise.all([...ownP, ...sharedP]);
  const weekEvents = results.flat();
  const weekMeals  = await listMealEvents(timeMin, timeMax);
  return { weekEvents, weekMeals };
}

/**
 * Save a meal from the wizard. Returns the saved event object (so the wizard
 * can store the _event reference and correctly update/delete later).
 * Throws on API failure — the wizard catches and shows the error.
 */
async function onWizardSaveMeal(date, slot, name, notes, existingEvent) {
  // All-day events: end.date must be the NEXT day (Google Calendar exclusive end)
  const endDate = toDateString(addDays(new Date(date + 'T00:00:00'), 1));
  const eventBody = {
    summary: name,
    description: notes || undefined,
    start: { date },
    end:   { date: endDate },
    extendedProperties: {
      private: { planify_type: 'meal', meal_slot: slot },
    },
  };
  const calId = await _getMealCalendarId();
  const saved = existingEvent
    ? await updateEvent(calId, existingEvent.id, eventBody)
    : await createEvent(calId, eventBody);

  // Background refresh — don't block the wizard
  refreshWeek().catch(() => {});
  return saved;
}

async function onWizardRemoveMeal(existingEvent) {
  if (!existingEvent?.id) return;
  const calId = await _getMealCalendarId();
  await deleteEvent(calId, existingEvent.id);
  refreshWeek().catch(() => {});
}

async function onWizardSaveHousehold(date, key, eventBody, existingEvent) {
  const calId = await _getMealCalendarId();
  const saved = existingEvent
    ? await updateEvent(calId, existingEvent.id, eventBody)
    : await createEvent(calId, eventBody);
  refreshWeek().catch(() => {});
  return saved;
}

async function onWizardRemoveHousehold(existingEvent) {
  if (!existingEvent?.id) return;
  const calId = await _getMealCalendarId();
  await deleteEvent(calId, existingEvent.id);
  refreshWeek().catch(() => {});
}

// ---- Event/meal saved callbacks ----

function onEventSaved() {
  renderCurrentView();
  // Fetch fresh data in background
  if (viewMode === 'week') refreshWeek();
  else renderCurrentDay();
}

function onMealSaved() {
  // Force re-fetch for current view so the new meal shows immediately
  if (viewMode === 'week') refreshWeek();
  else renderCurrentDay();
}

function onCalendarVisibilityChanged() {
  resetMealCalendarId();
  refreshWeek();
}

// ---- Theme ----

function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.classList.toggle('theme-light', theme === 'light');
  document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀' : '🌙';
}

function toggleTheme() {
  const next = store.getTheme() === 'dark' ? 'light' : 'dark';
  store.setTheme(next);
  applyTheme(next);
}

// ---- Keyboard shortcuts ----

function onKeyDown(e) {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  switch (e.key) {
    case 'ArrowLeft':  navigatePrev(); break;
    case 'ArrowRight': navigateNext(); break;
    case 't':          goToToday();    break;
    case 'n':          openNewEventModal(getCurrentDayDateStr()); break;
    case 'w':          switchView('week'); break;
    case 'd':          switchView('day');  break;
  }
}

// ---- Helpers ----

function _calendarIdForEvent(event) {
  // Try to find which calendar this event belongs to
  for (const cal of userCalendars) {
    // Google Calendar API doesn't directly expose calendarId on events
    // We store the calendar association separately in future; default to primary
  }
  return 'primary';
}

// ---- Demo / mock data (shown before sign-in) ----

function _demoDate(dayOffset, h, m = 0) {
  const d = addDays(startOfWeek(new Date()), dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const DEMO_EVENTS = [
  {
    id: 'demo1',
    summary: 'Team standup',
    colorId: '7',
    start: { dateTime: _demoDate(0, 9) },
    end:   { dateTime: _demoDate(0, 9, 30) },
  },
  {
    id: 'demo2',
    summary: 'Lunch with Alex',
    colorId: '5',
    start: { dateTime: _demoDate(1, 12) },
    end:   { dateTime: _demoDate(1, 13) },
  },
  {
    id: 'demo3',
    summary: 'Design review',
    colorId: '3',
    start: { dateTime: _demoDate(2, 14) },
    end:   { dateTime: _demoDate(2, 15, 30) },
  },
  {
    id: 'demo4',
    summary: 'Gym 🏋️',
    colorId: '2',
    start: { dateTime: _demoDate(3, 7) },
    end:   { dateTime: _demoDate(3, 8) },
  },
  {
    id: 'demo5',
    summary: 'Sprint planning',
    colorId: '9',
    start: { dateTime: _demoDate(4, 10) },
    end:   { dateTime: _demoDate(4, 12) },
  },
];

const DEMO_MEALS = [
  {
    id: 'dmeal1',
    summary: 'Avocado toast',
    start: { date: toDateString(addDays(startOfWeek(new Date()), 0)) },
    end:   { date: toDateString(addDays(startOfWeek(new Date()), 0)) },
    extendedProperties: { private: { planify_type: 'meal', meal_slot: 'breakfast' } },
  },
  {
    id: 'dmeal2',
    summary: 'Chicken salad',
    start: { date: toDateString(addDays(startOfWeek(new Date()), 1)) },
    end:   { date: toDateString(addDays(startOfWeek(new Date()), 1)) },
    extendedProperties: { private: { planify_type: 'meal', meal_slot: 'lunch' } },
  },
  {
    id: 'dmeal3',
    summary: 'Pasta carbonara',
    start: { date: toDateString(addDays(startOfWeek(new Date()), 2)) },
    end:   { date: toDateString(addDays(startOfWeek(new Date()), 2)) },
    extendedProperties: { private: { planify_type: 'meal', meal_slot: 'dinner' } },
  },
];
