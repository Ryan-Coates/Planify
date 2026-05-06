// weekWizard.js — day-by-day week planning wizard

import { addDays, toDateString, toTimeString, isSameDay, formatDayLabel } from './utils.js';
import { getMeals } from './mealLibrary.js';
import { store } from './store.js';
import { isSignedIn } from './auth.js';
import { createEvent } from './calendar.js';

const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NOTES_KEY = 'planify_wizard_notes'; // { 'YYYY-MM-DD': 'note text' }

let _monday       = null;  // start of week being planned
let _currentDay   = 0;     // 0-6
let _allEvents    = [];    // all fetched events for the week
let _mealEvents   = [];    // all fetched meal events for the week
let _dayMeals     = {};    // { 0: { breakfast: {...}, lunch: {...}, dinner: {...} } } — pending saves
let _onSaveMeal   = null;  // callback(date, slot, name, notes) → Promise
let _onAddEvent   = null;  // callback(date, hour)
let _onDone       = null;  // callback — wizard closed, refresh week

// ---- DOM helpers ----
const wizOverlay  = () => document.getElementById('wizard-overlay');
const pickerOverlay = () => document.getElementById('wizard-meal-picker-overlay');

export function initWizard({ onSaveMeal, onAddEvent, onDone }) {
  _onSaveMeal = onSaveMeal;
  _onAddEvent = onAddEvent;
  _onDone     = onDone;

  document.getElementById('btn-close-wizard').addEventListener('click', closeWizard);
  wizOverlay().addEventListener('click', (e) => { if (e.target === wizOverlay()) closeWizard(); });

  document.getElementById('wizard-btn-prev').addEventListener('click', () => navigateDay(-1));
  document.getElementById('wizard-btn-next').addEventListener('click', () => navigateDay(1));
  document.getElementById('wizard-btn-add-event').addEventListener('click', () => {
    const date = toDateString(addDays(_monday, _currentDay));
    if (_onAddEvent) _onAddEvent(date, 9);
  });

  // Meal slot add buttons
  document.querySelectorAll('.wizard-meal-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openMealPicker(btn.dataset.slot));
  });

  // Meal picker modal
  document.getElementById('wizard-meal-picker-close').addEventListener('click',  closeMealPicker);
  document.getElementById('wizard-meal-picker-cancel').addEventListener('click', closeMealPicker);
  document.getElementById('wizard-meal-picker-save').addEventListener('click',   saveMealPicker);
  pickerOverlay().addEventListener('click', (e) => { if (e.target === pickerOverlay()) closeMealPicker(); });

  // Autocomplete in picker
  document.getElementById('wizard-meal-picker-input').addEventListener('input', _updatePickerAc);
  document.getElementById('wizard-meal-picker-input').addEventListener('keydown', _handlePickerAcKey);

  // Day dot navigation
  document.getElementById('wizard-day-dots').addEventListener('click', (e) => {
    const dot = e.target.closest('.wizard-dot');
    if (dot) goToDay(parseInt(dot.dataset.day, 10));
  });
}

/**
 * Open the wizard for the given week.
 * @param {Date}   monday
 * @param {Array}  allEvents
 * @param {Array}  mealEvents
 */
export function openWizard(monday, allEvents, mealEvents) {
  _monday     = monday;
  _allEvents  = allEvents;
  _mealEvents = mealEvents;
  _dayMeals   = {};
  _currentDay = 0;

  // Pre-populate _dayMeals from existing meal events
  for (let i = 0; i < 7; i++) {
    const date = toDateString(addDays(_monday, i));
    _dayMeals[i] = {};
    mealEvents.forEach(m => {
      const mDate = m.start?.date || m.start?.dateTime?.slice(0, 10);
      if (mDate === date) {
        const slot = m.extendedProperties?.private?.meal_slot;
        if (slot) _dayMeals[i][slot] = { name: m.summary, notes: m.description || '', id: m.id, _event: m };
      }
    });
  }

  _buildDots();
  wizOverlay().classList.remove('hidden');
  _renderDay(_currentDay);
}

export function closeWizard() {
  wizOverlay().classList.add('hidden');
  if (_onDone) _onDone();
}

/** Call this from app.js after an event was saved inside the wizard */
export function refreshWizardDay(allEvents, mealEvents) {
  _allEvents  = allEvents;
  _mealEvents = mealEvents;
  // re-sync meal data
  for (let i = 0; i < 7; i++) {
    const date = toDateString(addDays(_monday, i));
    mealEvents.forEach(m => {
      const mDate = m.start?.date || m.start?.dateTime?.slice(0, 10);
      if (mDate === date) {
        const slot = m.extendedProperties?.private?.meal_slot;
        if (slot) _dayMeals[i][slot] = { name: m.summary, notes: m.description || '', id: m.id, _event: m };
      }
    });
  }
  _renderDay(_currentDay);
}

// ---- Navigation ----

function navigateDay(delta) {
  const next = _currentDay + delta;
  if (next < 0 || next > 6) {
    if (next > 6) closeWizard();
    return;
  }
  goToDay(next);
}

function goToDay(idx) {
  _currentDay = idx;
  _renderDay(idx);
}

// ---- Render ----

function _renderDay(idx) {
  const date    = addDays(_monday, idx);
  const dateStr = toDateString(date);
  const today   = new Date();

  // Header
  document.getElementById('wizard-day-title').textContent = DAY_NAMES_FULL[idx];
  document.getElementById('wizard-date-sub').textContent  =
    formatDayLabel(date) + (isSameDay(date, today) ? ' · Today' : '');

  // Progress
  const pct = ((idx + 1) / 7) * 100;
  document.getElementById('wizard-progress-fill').style.width = `${pct}%`;
  document.getElementById('wizard-step-indicator').textContent = `Day ${idx + 1} of 7`;

  // Update dots
  document.querySelectorAll('.wizard-dot').forEach(d => {
    const di = parseInt(d.dataset.day, 10);
    d.classList.toggle('active', di === idx);
    d.classList.toggle('done',   di < idx);
  });

  // Next button label
  const nextBtn = document.getElementById('wizard-btn-next');
  nextBtn.textContent = idx === 6 ? 'Finish ✓' : 'Next →';

  // Prev button
  document.getElementById('wizard-btn-prev').style.visibility = idx === 0 ? 'hidden' : 'visible';

  // Events
  _renderWizardEvents(dateStr);

  // Meals
  _renderWizardMeals(idx);

  // Notes
  const notes = _getNotes();
  document.getElementById('wizard-notes').value = notes[dateStr] || '';
  // save notes on change
  const notesEl = document.getElementById('wizard-notes');
  notesEl.oninput = () => {
    const n = _getNotes();
    n[dateStr] = notesEl.value;
    localStorage.setItem(NOTES_KEY, JSON.stringify(n));
  };

  // Scroll body to top
  document.getElementById('wizard-body').scrollTop = 0;
}

function _renderWizardEvents(dateStr) {
  const list  = document.getElementById('wizard-events-list');
  const empty = document.getElementById('wizard-events-empty');
  const day   = new Date(dateStr + 'T00:00:00');

  const dayEvents = _allEvents
    .filter(ev => {
      if (!ev.start) return false;
      if (ev.start.date) return ev.start.date === dateStr;
      return isSameDay(new Date(ev.start.dateTime), day);
    })
    .sort((a, b) => {
      const ta = a.start.dateTime ? new Date(a.start.dateTime) : new Date(a.start.date);
      const tb = b.start.dateTime ? new Date(b.start.dateTime) : new Date(b.start.date);
      return ta - tb;
    });

  list.innerHTML = '';
  empty.classList.toggle('hidden', dayEvents.length > 0);

  dayEvents.forEach(ev => {
    const item  = document.createElement('div');
    item.className = 'wizard-event-item';

    const colour = _gcalColour(ev.colorId);
    const timeStr = ev.start.dateTime
      ? `${toTimeString(new Date(ev.start.dateTime))}–${toTimeString(new Date(ev.end.dateTime))}`
      : 'All day';

    item.innerHTML = `
      <span class="wizard-event-dot" style="background:${colour}"></span>
      <span class="wizard-event-time">${timeStr}</span>
      <span class="wizard-event-title">${_esc(ev.summary || '(No title)')}</span>
    `;
    list.appendChild(item);
  });
}

function _renderWizardMeals(dayIdx) {
  ['breakfast', 'lunch', 'dinner'].forEach(slot => {
    const container = document.getElementById(`wizard-meal-${slot}`);
    const meal      = _dayMeals[dayIdx]?.[slot];

    container.innerHTML = '';
    if (meal) {
      const slotEl = document.createElement('div');
      slotEl.className = 'wizard-meal-value';
      slotEl.innerHTML = `
        <span class="wizard-meal-name">${_esc(meal.name)}</span>
        ${meal.notes ? `<span class="wizard-meal-note">${_esc(meal.notes)}</span>` : ''}
        <button class="wizard-meal-edit-btn" data-slot="${slot}">✏</button>
      `;
      slotEl.querySelector('button').addEventListener('click', () => openMealPicker(slot, meal));
      container.appendChild(slotEl);
      container.closest('.wizard-meal-slot').classList.add('has-meal');
    } else {
      const addBtn = document.createElement('button');
      addBtn.className = 'wizard-meal-add-btn';
      addBtn.dataset.slot = slot;
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', () => openMealPicker(slot));
      container.appendChild(addBtn);
      container.closest('.wizard-meal-slot').classList.remove('has-meal');
    }
  });
}

function _buildDots() {
  const container = document.getElementById('wizard-day-dots');
  container.innerHTML = '';
  DAY_NAMES_FULL.forEach((name, i) => {
    const dot = document.createElement('div');
    dot.className = 'wizard-dot';
    dot.dataset.day = i;
    dot.title = name;
    container.appendChild(dot);
  });
}

// ---- Meal picker ----

let _pickerSlot    = null;
let _pickerExisting = null;

function openMealPicker(slot, existing = null) {
  _pickerSlot     = slot;
  _pickerExisting = existing;

  const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
  document.getElementById('wizard-meal-picker-title').textContent =
    existing ? `Edit ${slotLabel}` : `Add ${slotLabel}`;
  document.getElementById('wizard-meal-picker-input').value  = existing?.name  || '';
  document.getElementById('wizard-meal-picker-notes').value  = existing?.notes || '';
  document.getElementById('wizard-meal-picker-ac').innerHTML = '';
  document.getElementById('wizard-meal-picker-ac').classList.add('hidden');
  pickerOverlay().classList.remove('hidden');
  document.getElementById('wizard-meal-picker-input').focus();
}

function closeMealPicker() {
  pickerOverlay().classList.add('hidden');
  _pickerSlot     = null;
  _pickerExisting = null;
}

async function saveMealPicker() {
  const name  = document.getElementById('wizard-meal-picker-input').value.trim();
  const notes = document.getElementById('wizard-meal-picker-notes').value.trim();
  if (!name) {
    document.getElementById('wizard-meal-picker-input').focus();
    return;
  }

  const date = toDateString(addDays(_monday, _currentDay));

  if (!_dayMeals[_currentDay]) _dayMeals[_currentDay] = {};
  _dayMeals[_currentDay][_pickerSlot] = { name, notes };

  // Persist to calendar if signed in
  if (_onSaveMeal) {
    await _onSaveMeal(date, _pickerSlot, name, notes, _pickerExisting?._event || null);
  }

  closeMealPicker();
  _renderWizardMeals(_currentDay);
}

// ---- Autocomplete ----

function _updatePickerAc() {
  const query = document.getElementById('wizard-meal-picker-input').value.toLowerCase().trim();
  const acList = document.getElementById('wizard-meal-picker-ac');

  if (!query) { acList.classList.add('hidden'); return; }

  const matches = getMeals().filter(m => m.name.toLowerCase().includes(query)).slice(0, 8);
  if (!matches.length) { acList.classList.add('hidden'); return; }

  acList.innerHTML = '';
  matches.forEach((m, i) => {
    const li = document.createElement('li');
    li.dataset.index = i;
    li.innerHTML = `${_esc(m.name)} <span class="autocomplete-slot">${m.slot}</span>`;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.getElementById('wizard-meal-picker-input').value  = m.name;
      document.getElementById('wizard-meal-picker-notes').value  = m.notes || '';
      acList.classList.add('hidden');
    });
    acList.appendChild(li);
  });
  acList.classList.remove('hidden');
}

function _handlePickerAcKey(e) {
  const acList = document.getElementById('wizard-meal-picker-ac');
  const items  = acList.querySelectorAll('li');
  const active = acList.querySelector('li.active');

  if (e.key === 'Escape')    { acList.classList.add('hidden'); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); const n = active ? active.nextElementSibling : items[0]; if(n){active?.classList.remove('active'); n.classList.add('active');} return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); const p = active ? active.previousElementSibling : items[items.length-1]; if(p){active?.classList.remove('active'); p.classList.add('active');} return; }
  if (e.key === 'Enter' && active) {
    e.preventDefault();
    document.getElementById('wizard-meal-picker-input').value = active.firstChild.textContent.trim();
    acList.classList.add('hidden');
  }
}

// ---- Helpers ----

function _getNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}

const GC_COLOURS = {
  '1':'#c5cae9','2':'#c8e6c9','3':'#e1bee7','4':'#f8bbd0','5':'#fff9c4',
  '6':'#ffe0b2','7':'#b2ebf2','8':'#cfd8dc','9':'#bbdefb','10':'#dcedc8','11':'#ffccbc',
};
function _gcalColour(id) { return GC_COLOURS[id] || '#7986f5'; }

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
