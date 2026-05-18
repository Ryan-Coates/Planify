// weekWizard.js — day-by-day week planning wizard

import { addDays, toDateString, toTimeString, isSameDay, formatDayLabel, showToast } from './utils.js';
import { getMeals } from './mealLibrary.js';

const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NOTES_KEY = 'planify_wizard_notes'; // { 'YYYY-MM-DD': 'note text' }

// ---- Household quick-plan config ----
// Hard-coded household members. Can be made configurable in a future settings screen.
const HOUSEHOLD = [
  {
    key:    'dylan_lunch',
    person: 'Dylan',
    type:   'checkbox',
    label:  'Pack lunch 🎒',
    event:  { summary: 'Dylan — Packed Lunch 🎒', startTime: '09:00', endTime: '10:00' },
  },
  {
    key:    'ryan_oncall',
    person: 'Ryan',
    type:   'checkbox',
    label:  'On Call 📟 (all week)',
    applyToAllDays: true,
    event:  { summary: 'Ryan — On Call 📟', startTime: '08:00', endTime: '16:00' },
  },
  {
    key:     'ryan_work',
    person:  'Ryan',
    type:    'select',
    options: [
      { value: 'wfh',    label: 'WFH 🏠',       summary: 'Ryan — WFH 🏠',       startTime: '08:00', endTime: '16:00' },
      { value: 'office', label: 'Office 🏢',     summary: 'Ryan — Office 🏢',    startTime: '08:00', endTime: '16:00' },
      { value: 'off',    label: 'Day Off 🌴',    summary: 'Ryan — Day Off 🌴',   startTime: '08:00', endTime: '16:00' },
    ],
  },
  {
    key:     'jess_work',
    person:  'Jess',
    type:    'select',
    options: [
      { value: 'alm_wfh',       label: 'ALM WFH 🏠',          summary: 'Jess — ALM WFH 🏠',          startTime: '08:00', endTime: '16:00' },
      { value: 'alm_office',    label: 'ALM Office 🏢',        summary: 'Jess — ALM Office 🏢',       startTime: '08:00', endTime: '16:00' },
      { value: 'support_all',   label: 'Support All Day 📞',   summary: 'Jess — Support All Day 📞',  allDay: true },
      { value: 'support_short', label: 'Support Short Day 📞', summary: 'Jess — Support Short Day 📞', startTime: '08:00', endTime: '14:00' },
      { value: 'off',          label: 'Day Off 🌴',           summary: 'Jess — Day Off 🌴',           startTime: '08:00', endTime: '16:00' },
    ],
  },
  {
    key:     'family_day',
    person:  'Family',
    type:    'select',
    options: [
      { value: 'crafting',    label: 'Crafting 🎨',      summary: 'Family — Crafting 🎨',      startTime: '19:00', endTime: '22:00' },
      { value: 'exercise',    label: 'Exercise 🏃',      summary: 'Family — Exercise 🏃',      startTime: '19:00', endTime: '20:30' },
      { value: 'family',      label: 'Family Time 👨‍👩‍👦',   summary: 'Family Time 👨‍👩‍👦',             startTime: '18:00', endTime: '21:00' },
      { value: 'gaming',      label: 'Gaming 🎮',        summary: 'Family — Gaming 🎮',        startTime: '19:00', endTime: '22:00' },
      { value: 'board_games', label: 'Board Games 🎲',   summary: 'Family — Board Games 🎲',   startTime: '19:00', endTime: '22:00' },
      { value: 'movie',       label: 'Movie 🎬',         summary: 'Family — Movie 🎬',         startTime: '19:00', endTime: '21:30' },
    ],
  },
];

let _monday          = null;  // start of week being planned
let _currentDay      = 0;     // 0-6
let _allEvents       = [];    // all fetched events for the week
let _mealEvents      = [];    // all fetched meal events for the week
let _dayMeals        = {};    // { 0: { breakfast: {...}, lunch: {...}, dinner: {...} } }
let _dayPeople       = {};    // { 0: { dylan_lunch: { value, _event }, ryan_work: { value, _event } } }
let _onSaveMeal      = null;
let _onRemoveMeal    = null;
let _onSaveHousehold  = null; // callback(date, key, eventBody, existingEvent) → Promise<savedEvent>
let _onRemoveHousehold = null;// callback(existingEvent) → Promise
let _onAddEvent      = null;
let _onDone          = null;

// ---- DOM helpers ----
const wizOverlay  = () => document.getElementById('wizard-overlay');
const pickerOverlay = () => document.getElementById('wizard-meal-picker-overlay');

export function initWizard({ onSaveMeal, onRemoveMeal, onSaveHousehold, onRemoveHousehold, onAddEvent, onDone }) {
  _onSaveMeal        = onSaveMeal;
  _onRemoveMeal      = onRemoveMeal;
  _onSaveHousehold   = onSaveHousehold;
  _onRemoveHousehold = onRemoveHousehold;
  _onAddEvent        = onAddEvent;
  _onDone            = onDone;

  document.getElementById('btn-close-wizard').addEventListener('click', closeWizard);
  wizOverlay().addEventListener('click', (e) => { if (e.target === wizOverlay()) closeWizard(); });

  document.getElementById('wizard-btn-prev').addEventListener('click', () => navigateDay(-1));
  document.getElementById('wizard-btn-next').addEventListener('click', () => navigateDay(1));
  document.getElementById('wizard-btn-add-event').addEventListener('click', () => {
    const date = toDateString(addDays(_monday, _currentDay));
    if (_onAddEvent) _onAddEvent(date, 9);
  });

  // Meal picker modal
  document.getElementById('wizard-meal-picker-close').addEventListener('click',  closeMealPicker);
  document.getElementById('wizard-meal-picker-cancel').addEventListener('click', closeMealPicker);
  document.getElementById('wizard-meal-picker-save').addEventListener('click',   saveMealPicker);
  document.getElementById('wizard-meal-picker-remove').addEventListener('click', removeMealPicker);
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
  _dayPeople  = {};
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

  // Pre-populate _dayPeople from existing calendar events tagged with planify_household
  for (let i = 0; i < 7; i++) {
    const date = toDateString(addDays(_monday, i));
    _dayPeople[i] = {};
    allEvents.forEach(ev => {
      const evDate = ev.start?.date || ev.start?.dateTime?.slice(0, 10);
      if (evDate !== date) return;
      const hKey = ev.extendedProperties?.private?.planify_household;
      if (!hKey) return;
      const member = HOUSEHOLD.find(m => m.key === hKey);
      if (!member) return;
      const val = member.type === 'checkbox'
        ? true
        : (ev.extendedProperties?.private?.planify_household_val || '');
      _dayPeople[i][hKey] = { value: val, _event: ev };
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
  closeMealPicker(); // reset picker state when navigating days
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

  // Household quick-plan
  _renderHousehold(idx);

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
  ['dinner'].forEach(slot => {
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

// ---- Household quick-plan ----

function _renderHousehold(dayIdx) {
  const list = document.getElementById('wizard-household-list');
  if (!list) return;
  list.innerHTML = '';

  HOUSEHOLD.forEach(member => {
    const state = _dayPeople[dayIdx]?.[member.key];
    const isSet = !!(state?.value);

    const row = document.createElement('div');
    row.className = `wizard-household-row${isSet ? ' is-set' : ''}`;

    // Person name
    const nameEl = document.createElement('span');
    nameEl.className = 'wizard-household-name';
    nameEl.textContent = member.person;
    row.appendChild(nameEl);

    // Control + status wrapper
    const ctrl = document.createElement('div');
    ctrl.className = 'wizard-household-ctrl';

    const statusEl = document.createElement('span');
    statusEl.className = 'wizard-household-status';
    statusEl.textContent = isSet ? '✓' : '';

    if (member.type === 'checkbox') {
      const lbl = document.createElement('label');
      lbl.className = 'wizard-household-cb-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isSet;
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        statusEl.textContent = '⏳';
        try {
          await _saveHouseholdItem(dayIdx, member, cb.checked ? true : false);
          // Re-render row group after save
          _renderHousehold(dayIdx);
        } catch (e) {
          showToast(e?.message || 'Failed to save — please try again', 'error');
          cb.checked = !cb.checked; // revert
          statusEl.textContent = '';
          cb.disabled = false;
        }
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + member.label));
      ctrl.appendChild(lbl);
    } else {
      // select
      const sel = document.createElement('select');
      sel.className = 'wizard-household-select';

      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— not set —';
      sel.appendChild(blank);

      member.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (state?.value === opt.value) o.selected = true;
        sel.appendChild(o);
      });

      sel.addEventListener('change', async () => {
        sel.disabled = true;
        statusEl.textContent = '⏳';
        try {
          await _saveHouseholdItem(dayIdx, member, sel.value);
          _renderHousehold(dayIdx);
        } catch (e) {
          showToast(e?.message || 'Failed to save — please try again', 'error');
          sel.value = state?.value || '';
          statusEl.textContent = state?.value ? '✓' : '';
          sel.disabled = false;
        }
      });
      ctrl.appendChild(sel);
    }

    ctrl.appendChild(statusEl);
    row.appendChild(ctrl);
    list.appendChild(row);
  });
}

/**
 * Build a Google Calendar event body for a household member entry.
 */
function _buildHouseholdEventBody(member, date, value) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (member.type === 'checkbox') {
    return {
      summary: member.event.summary,
      start: { dateTime: `${date}T${member.event.startTime}:00`, timeZone: tz },
      end:   { dateTime: `${date}T${member.event.endTime}:00`,   timeZone: tz },
      extendedProperties: { private: { planify_household: member.key } },
    };
  }

  const opt = member.options.find(o => o.value === value);
  if (!opt) return null;

  if (opt.allDay) {
    const nextDate = toDateString(addDays(new Date(`${date}T00:00:00`), 1));
    return {
      summary: opt.summary,
      start: { date },
      end:   { date: nextDate },
      extendedProperties: { private: { planify_household: member.key, planify_household_val: value } },
    };
  }

  return {
    summary: opt.summary,
    start: { dateTime: `${date}T${opt.startTime}:00`, timeZone: tz },
    end:   { dateTime: `${date}T${opt.endTime}:00`,   timeZone: tz },
    extendedProperties: { private: { planify_household: member.key, planify_household_val: value } },
  };
}

/**
 * Update the local _allEvents snapshot with a saved event.
 */
function _syncToAllEvents(existing, saved) {
  if (existing) {
    const i = _allEvents.indexOf(existing);
    if (i !== -1) _allEvents[i] = saved; else _allEvents.push(saved);
  } else {
    _allEvents.push(saved);
  }
}

/**
 * Save (create/update/delete) a household calendar event.
 * Throws on API failure.
 */
async function _saveHouseholdItem(dayIdx, member, value) {
  if (!_onSaveHousehold && !_onRemoveHousehold) return;

  if (!value || value === false) {
    // Remove only for the specific day
    if (!_dayPeople[dayIdx]) _dayPeople[dayIdx] = {};
    const existing = _dayPeople[dayIdx][member.key]?._event || null;
    if (existing && _onRemoveHousehold) {
      await _onRemoveHousehold(existing);
      const i = _allEvents.indexOf(existing);
      if (i !== -1) _allEvents.splice(i, 1);
    }
    _dayPeople[dayIdx][member.key] = { value: null, _event: null };
    return;
  }

  if (member.applyToAllDays) {
    // Create/update across all 7 days of the week
    for (let i = 0; i < 7; i++) {
      if (!_dayPeople[i]) _dayPeople[i] = {};
      const date      = toDateString(addDays(_monday, i));
      const existing  = _dayPeople[i][member.key]?._event || null;
      const eventBody = _buildHouseholdEventBody(member, date, value);
      if (!eventBody) continue;
      const saved = await _onSaveHousehold(date, member.key, eventBody, existing);
      _dayPeople[i][member.key] = { value, _event: saved };
      _syncToAllEvents(existing, saved);
    }
    return;
  }

  // Single-day save
  if (!_dayPeople[dayIdx]) _dayPeople[dayIdx] = {};
  const date      = toDateString(addDays(_monday, dayIdx));
  const existing  = _dayPeople[dayIdx][member.key]?._event || null;
  const eventBody = _buildHouseholdEventBody(member, date, value);
  if (!eventBody) return;
  const saved = await _onSaveHousehold(date, member.key, eventBody, existing);
  _dayPeople[dayIdx][member.key] = { value, _event: saved };
  _syncToAllEvents(existing, saved);
}

// ---- Meal picker ----

let _pickerSlot     = null;
let _pickerExisting = null;
let _pickerDayIdx   = null;  // day index when picker was opened

function openMealPicker(slot, existing = null) {
  _pickerSlot     = slot;
  _pickerExisting = existing;
  _pickerDayIdx   = _currentDay;

  const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
  const isEdit    = !!existing;

  document.getElementById('wizard-meal-picker-title').textContent =
    isEdit ? `Edit ${slotLabel}` : `Add ${slotLabel}`;
  document.getElementById('wizard-meal-picker-input').value  = existing?.name  || '';
  document.getElementById('wizard-meal-picker-notes').value  = existing?.notes || '';
  document.getElementById('wizard-meal-picker-ac').innerHTML = '';
  document.getElementById('wizard-meal-picker-ac').classList.add('hidden');

  // Show Remove button only when editing an already-saved meal
  const removeBtn = document.getElementById('wizard-meal-picker-remove');
  removeBtn.classList.toggle('hidden', !isEdit);

  pickerOverlay().classList.remove('hidden');
  document.getElementById('wizard-meal-picker-input').focus();
}

function closeMealPicker() {
  pickerOverlay().classList.add('hidden');
  _pickerSlot     = null;
  _pickerExisting = null;
  _pickerDayIdx   = null;
}

async function saveMealPicker() {
  const name  = document.getElementById('wizard-meal-picker-input').value.trim();
  const notes = document.getElementById('wizard-meal-picker-notes').value.trim();
  if (!name) {
    document.getElementById('wizard-meal-picker-input').focus();
    return;
  }

  const saveBtn = document.getElementById('wizard-meal-picker-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  // Capture everything we need NOW before the async call.
  // Use _pickerDayIdx (set when picker opened) so the slot is always
  // updated for the correct day even if navigation occurred.
  const dayIdx        = _pickerDayIdx ?? _currentDay;
  const date          = toDateString(addDays(_monday, dayIdx));
  const slot          = _pickerSlot;
  const existingEvent = _pickerExisting?._event || null;

  try {
    let savedEvent = null;
    if (_onSaveMeal) {
      try {
        savedEvent = await _onSaveMeal(date, slot, name, notes, existingEvent);
      } catch (calErr) {
        // Calendar save failed — keep local state anyway so the wizard
        // remains usable; show a non-blocking warning.
        showToast(`Saved locally (calendar: ${calErr.message})`, 'warn');
      }
    }
    if (!_dayMeals[dayIdx]) _dayMeals[dayIdx] = {};
    // Store the returned event so future edits use updateEvent correctly
    _dayMeals[dayIdx][slot] = { name, notes, _event: savedEvent || null };
    closeMealPicker();
    if (dayIdx === _currentDay) _renderWizardMeals(dayIdx);
  } catch (e) {
    showToast(`Meal save failed: ${e.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

async function removeMealPicker() {
  const slot     = _pickerSlot;
  const existing = _pickerExisting;
  if (!existing) return;

  const removeBtn = document.getElementById('wizard-meal-picker-remove');
  removeBtn.disabled = true;
  removeBtn.textContent = 'Removing…';

  try {
    if (_onRemoveMeal && existing._event) {
      await _onRemoveMeal(existing._event);
    }
    const dayIdx = _pickerDayIdx ?? _currentDay;
    if (_dayMeals[dayIdx]) delete _dayMeals[dayIdx][slot];
    closeMealPicker();
    // Only re-render if we're still on the same day, otherwise the
    // render will happen naturally when the user navigates back.
    if (dayIdx === _currentDay) _renderWizardMeals(dayIdx);
  } catch (e) {
    showToast(`Remove failed: ${e.message}`, 'error');
  } finally {
    removeBtn.disabled = false;
    removeBtn.textContent = 'Remove meal';
  }
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
