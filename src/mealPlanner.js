// mealPlanner.js — meal slot modal (add/edit a meal on a specific day)

import { createEvent, updateEvent, deleteEvent, listEvents } from './calendar.js';
import { getMeals } from './mealLibrary.js';
import { showToast, toDateString } from './utils.js';
import { isSignedIn } from './auth.js';
import { store } from './store.js';

const MEAL_CALENDAR_NAME = 'Planify Meals'; // kept for reference only
let _mealCalendarId = null;
let _onSaved = null;

/** Call this when the shared calendar selection changes so the ID is re-resolved. */
export function resetMealCalendarId() {
  _mealCalendarId = null;
}

const overlay   = () => document.getElementById('meal-modal-overlay');
const titleEl   = () => document.getElementById('meal-modal-title');
const inputName = () => document.getElementById('meal-name');
const inputDate = () => document.getElementById('meal-date');
const selectSlot = () => document.getElementById('meal-slot');
const inputNotes = () => document.getElementById('meal-notes');
const btnSave   = () => document.getElementById('btn-save-meal');
const btnCancel = () => document.getElementById('btn-cancel-meal');
const btnClose  = () => document.getElementById('btn-close-meal-modal');
const btnDelete = () => document.getElementById('btn-delete-meal');
const acList    = () => document.getElementById('meal-autocomplete');

let _editingMeal = null;

export function initMealPlanner(onSaved) {
  _onSaved = onSaved;

  btnSave().addEventListener('click', _handleSave);
  btnCancel().addEventListener('click', closeMealModal);
  btnClose().addEventListener('click', closeMealModal);
  btnDelete().addEventListener('click', _handleDelete);

  overlay().addEventListener('click', (e) => {
    if (e.target === overlay()) closeMealModal();
  });

  // Autocomplete
  inputName().addEventListener('input', _updateAutocomplete);
  inputName().addEventListener('keydown', _handleAutocompleteKey);
  document.addEventListener('click', (e) => {
    if (!overlay().contains(e.target)) acList().classList.add('hidden');
  });
}

export function openNewMealModal(date, slot) {
  _editingMeal = null;
  titleEl().textContent = 'Add Meal';
  inputName().value  = '';
  inputDate().value  = date || toDateString(new Date());
  selectSlot().value = slot || 'breakfast';
  inputNotes().value = '';
  btnDelete().classList.add('hidden');
  acList().classList.add('hidden');
  overlay().classList.remove('hidden');
  inputName().focus();
}

export function openEditMealModal(mealEvent) {
  _editingMeal = mealEvent;
  titleEl().textContent = 'Edit Meal';
  const priv = mealEvent.extendedProperties?.private || {};
  inputName().value  = mealEvent.summary || '';
  selectSlot().value = priv.meal_slot || 'breakfast';
  inputNotes().value = mealEvent.description || '';
  const d = mealEvent.start?.date || (mealEvent.start?.dateTime ? mealEvent.start.dateTime.slice(0,10) : toDateString(new Date()));
  inputDate().value  = d;
  btnDelete().classList.remove('hidden');
  acList().classList.add('hidden');
  overlay().classList.remove('hidden');
  inputName().focus();
}

export function closeMealModal() {
  overlay().classList.add('hidden');
  _editingMeal = null;
}

/**
 * List meal events for the given week range.
 */
export async function listMealEvents(timeMin, timeMax) {
  if (!isSignedIn()) return [];
  const calId = await _getMealCalendarId();
  if (!calId) return [];
  return listEvents(calId, timeMin, timeMax);
}

/**
 * Returns the calendar ID to use for meal events.
 * Uses the first pinned shared calendar, otherwise falls back to primary.
 * Never creates a new calendar.
 */
export async function _getMealCalendarId() {
  if (_mealCalendarId) return _mealCalendarId;

  const shared = store.getSharedCalendars();
  _mealCalendarId = shared.length > 0 ? shared[0].id : 'primary';
  return _mealCalendarId;
}

// ---- Save / Delete ----

async function _handleSave() {
  const name = inputName().value.trim();
  if (!name) {
    showToast('Please enter a meal name.', 'error');
    inputName().focus();
    return;
  }
  if (!isSignedIn()) {
    showToast('Please sign in to save meals.', 'error');
    return;
  }

  const date  = inputDate().value;
  const slot  = selectSlot().value;
  const notes = inputNotes().value.trim();
  const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Store as an all-day event with extended properties
  const eventBody = {
    summary: name,
    description: notes || undefined,
    start: { date },
    end:   { date },
    extendedProperties: {
      private: {
        planify_type: 'meal',
        meal_slot: slot,
      },
    },
  };

  try {
    btnSave().disabled = true;
    btnSave().textContent = 'Saving…';

    const calId = await _getMealCalendarId();
    if (!calId) throw new Error('No meals calendar');

    let saved;
    if (_editingMeal) {
      saved = await updateEvent(calId, _editingMeal.id, eventBody);
      showToast('Meal updated.', 'success');
    } else {
      saved = await createEvent(calId, eventBody);
      showToast('Meal added.', 'success');
    }

    closeMealModal();
    if (_onSaved) _onSaved(saved);
  } catch (e) {
    showToast(`Save failed: ${e.message}`, 'error');
  } finally {
    btnSave().disabled = false;
    btnSave().textContent = 'Save';
  }
}

async function _handleDelete() {
  if (!_editingMeal) return;
  if (!confirm(`Remove "${_editingMeal.summary || 'this meal'}" from the plan?`)) return;

  try {
    const calId = await _getMealCalendarId();
    await deleteEvent(calId, _editingMeal.id);
    showToast('Meal removed.', 'success');
    closeMealModal();
    if (_onSaved) _onSaved(null);
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
}

// ---- Autocomplete ----

function _updateAutocomplete() {
  const query = inputName().value.toLowerCase().trim();
  const list  = acList();

  if (!query) {
    list.classList.add('hidden');
    return;
  }

  const meals = getMeals();
  const matches = meals.filter(m => m.name.toLowerCase().includes(query)).slice(0, 8);

  if (matches.length === 0) {
    list.classList.add('hidden');
    return;
  }

  list.innerHTML = '';
  matches.forEach((m, i) => {
    const li = document.createElement('li');
    li.dataset.index = i;
    li.innerHTML = `${_esc(m.name)} <span class="autocomplete-slot">${m.slot}</span>`;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _selectMeal(m);
    });
    list.appendChild(li);
  });
  list.classList.remove('hidden');
}

function _handleAutocompleteKey(e) {
  const list  = acList();
  const items = list.querySelectorAll('li');
  const active = list.querySelector('li.active');

  if (e.key === 'Escape') {
    list.classList.add('hidden');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = active ? active.nextElementSibling : items[0];
    if (next) { active?.classList.remove('active'); next.classList.add('active'); }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = active ? active.previousElementSibling : items[items.length - 1];
    if (prev) { active?.classList.remove('active'); prev.classList.add('active'); }
    return;
  }
  if (e.key === 'Enter' && active) {
    e.preventDefault();
    const idx = parseInt(active.dataset.index, 10);
    const meals = getMeals();
    const query = inputName().value.toLowerCase().trim();
    const matches = meals.filter(m => m.name.toLowerCase().includes(query));
    if (matches[idx]) _selectMeal(matches[idx]);
  }
}

function _selectMeal(meal) {
  inputName().value  = meal.name;
  selectSlot().value = meal.slot !== 'any' ? meal.slot : selectSlot().value;
  inputNotes().value = meal.notes || '';
  acList().classList.add('hidden');
}

function _esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
