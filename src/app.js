// app.js — main entry point, orchestrates all modules

import { store } from './store.js';
import { initAuth, signIn, signOut, isSignedIn } from './auth.js';
import { listCalendars, listEvents } from './calendar.js';
import { initWeekView, renderWeek } from './weekView.js';
import { initEventModal, openNewEventModal, openEditEventModal } from './eventModal.js';
import { initMealPlanner, openNewMealModal, openEditMealModal, listMealEvents, resetMealCalendarId, _getMealCalendarId } from './mealPlanner.js';
import { initSettings, openSettings } from './settings.js';
import { loadLibrary } from './mealLibrary.js';
import { initWizard, openWizard, refreshWizardDay } from './weekWizard.js';
import { startOfWeek, addDays, toDateString, showToast } from './utils.js';
import { createEvent, updateEvent } from './calendar.js';

// ---- State ----
let weekOffset   = store.getWeekOffset();
let allEvents    = [];
let mealEvents   = [];
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

  // Modals
  initEventModal(onEventSaved);
  initMealPlanner(onMealSaved);
  initSettings(onCalendarVisibilityChanged);

  // Wizard
  initWizard({
    onSaveMeal: onWizardSaveMeal,
    onAddEvent: (date, hour) => openNewEventModal(date, hour),
    onDone: refreshWeek,
  });

  // Toolbar buttons
  document.getElementById('btn-plan-week').addEventListener('click', onPlanWeekClick);
  document.getElementById('btn-prev-week').addEventListener('click', () => changeWeek(-1));
  document.getElementById('btn-next-week').addEventListener('click', () => changeWeek(1));
  document.getElementById('btn-today').addEventListener('click', () => goToToday());
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-signin').addEventListener('click', signIn);
  document.getElementById('btn-signout').addEventListener('click', signOut);
  document.getElementById('btn-add-event').addEventListener('click', () => {
    openNewEventModal(toDateString(new Date()));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);

  // Initial render (with mock events for demo)
  renderCurrentWeek();
});

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
  weekOffset = 0;
  store.setWeekOffset(0);
  refreshWeek();
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

  renderCurrentWeek();
}

function renderCurrentWeek() {
  renderWeek(getCurrentMonday(), allEvents, mealEvents);
}

// ---- Plan Week wizard ----

function onPlanWeekClick() {
  openWizard(getCurrentMonday(), allEvents, mealEvents);
}

async function onWizardSaveMeal(date, slot, name, notes, existingEvent) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const eventBody = {
    summary: name,
    description: notes || undefined,
    start: { date },
    end:   { date },
    extendedProperties: {
      private: { planify_type: 'meal', meal_slot: slot },
    },
  };
  try {
    const calId = await _getMealCalendarId();
    if (existingEvent) {
      await updateEvent(calId, existingEvent.id, eventBody);
    } else {
      await createEvent(calId, eventBody);
    }
    // Refresh data and update wizard without closing it
    const monday = getCurrentMonday();
    const sunday = addDays(monday, 6);
    sunday.setHours(23, 59, 59, 999);
    const timeMin = monday.toISOString();
    const timeMax = sunday.toISOString();
    mealEvents = await listMealEvents(timeMin, timeMax);
    refreshWizardDay(allEvents, mealEvents);
    renderCurrentWeek();
  } catch (e) {
    showToast(`Meal save failed: ${e.message}`, 'error');
  }
}

// ---- Event/meal saved callbacks ----

function onEventSaved() {
  refreshWeek();
}

function onMealSaved() {
  refreshWeek();
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
  // Don't fire shortcuts when typing in inputs
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;

  switch (e.key) {
    case 'ArrowLeft':  changeWeek(-1); break;
    case 'ArrowRight': changeWeek(1);  break;
    case 't':          goToToday();    break;
    case 'n':          openNewEventModal(toDateString(new Date())); break;
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
