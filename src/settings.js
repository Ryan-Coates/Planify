// settings.js — settings panel (calendars visibility + meal library management)

import { listCalendars } from './calendar.js';
import { getMeals, addMeal, updateMeal, deleteMeal, loadLibrary } from './mealLibrary.js';
import { store } from './store.js';
import { showToast } from './utils.js';
import { isSignedIn } from './auth.js';

let _onCalendarVisibilityChanged = null;

const overlay     = () => document.getElementById('settings-overlay');
const btnClose    = () => document.getElementById('btn-close-settings');
const tabs        = () => document.querySelectorAll('.settings-tab');
const tabCals     = () => document.getElementById('tab-calendars');
const tabMeals    = () => document.getElementById('tab-meals');
const calList     = () => document.getElementById('calendar-list');
const mealBody    = () => document.getElementById('meal-library-body');
const mealEmpty   = () => document.getElementById('meal-library-empty');

// Meal option modal elements
const mealOptOverlay = () => document.getElementById('meal-option-modal-overlay');
const mealOptTitle   = () => document.getElementById('meal-option-modal-title');
const mealOptName    = () => document.getElementById('meal-option-name');
const mealOptSlot    = () => document.getElementById('meal-option-slot');
const mealOptTags    = () => document.getElementById('meal-option-tags');
const mealOptNotes   = () => document.getElementById('meal-option-notes');
const mealOptBtnSave   = () => document.getElementById('btn-save-meal-option');
const mealOptBtnCancel = () => document.getElementById('btn-cancel-meal-option');
const mealOptBtnClose  = () => document.getElementById('btn-close-meal-option-modal');
const mealOptBtnDelete = () => document.getElementById('btn-delete-meal-option');

let _editingMealOptionId = null;

export function initSettings(onCalendarVisibilityChanged) {
  _onCalendarVisibilityChanged = onCalendarVisibilityChanged;

  document.getElementById('btn-settings').addEventListener('click', openSettings);
  btnClose().addEventListener('click', closeSettings);
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) closeSettings(); });

  tabs().forEach(tab => {
    tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
  });

  document.getElementById('btn-add-meal-option').addEventListener('click', () => openMealOptionModal());
  // Register once here — not inside _renderCalendars which runs multiple times
  document.getElementById('btn-add-shared-cal').addEventListener('click', _handleAddSharedCal);

  mealOptBtnSave().addEventListener('click', _handleSaveMealOption);
  mealOptBtnCancel().addEventListener('click', closeMealOptionModal);
  mealOptBtnClose().addEventListener('click', closeMealOptionModal);
  mealOptBtnDelete().addEventListener('click', _handleDeleteMealOption);
  mealOptOverlay().addEventListener('click', (e) => {
    if (e.target === mealOptOverlay()) closeMealOptionModal();
  });
}

export function openSettings() {
  overlay().classList.remove('hidden');
  _switchTab('calendars');
  _renderCalendars();
}

export function closeSettings() {
  overlay().classList.add('hidden');
}

function _switchTab(tab) {
  tabs().forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  tabCals().classList.toggle('hidden', tab !== 'calendars');
  tabMeals().classList.toggle('hidden', tab !== 'meals');
  if (tab === 'meals') _renderMealLibrary();
}

// ---- Calendars tab ----

async function _renderCalendars() {
  const list = calList();
  list.innerHTML = '';

  if (!isSignedIn()) {
    document.querySelector('#tab-calendars .settings-hint').textContent = 'Sign in to manage calendars.';
    _renderSharedCalendars();
    const sel = document.getElementById('shared-cal-select');
    sel.innerHTML = '<option value="">— sign in to see calendars —</option>';
    return;
  }

  document.querySelector('#tab-calendars .settings-hint').textContent = 'Toggle calendars to show or hide them on the week view.';

  const cals = await listCalendars();
  const visible = store.getCalendarsVisible() ?? cals.map(c => c.id);

  cals.forEach(cal => {
    const li = document.createElement('li');
    const colour = cal.backgroundColor || '#4a6cf7';
    li.innerHTML = `
      <span class="calendar-dot" style="background:${colour}"></span>
      <span class="calendar-name">${_esc(cal.summary)}</span>
      <input type="checkbox" ${visible.includes(cal.id) ? 'checked' : ''} data-cal-id="${cal.id}" />
    `;
    const cb = li.querySelector('input');
    cb.addEventListener('change', () => {
      const updated = cals.map(c => c.id).filter(id => {
        const el = list.querySelector(`[data-cal-id="${id}"]`);
        return el ? el.checked : true;
      });
      store.setCalendarsVisible(updated);
      if (_onCalendarVisibilityChanged) _onCalendarVisibilityChanged(updated);
    });
    list.appendChild(li);
  });

  _renderSharedCalendars();
  await _populateSharedCalSelect(cals);
}

function _renderSharedCalendars() {
  const shared = store.getSharedCalendars();
  const list = document.getElementById('shared-calendar-list');
  list.innerHTML = '';

  shared.forEach((cal, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="calendar-dot" style="background:#9fa8da"></span>
      <span class="calendar-name">${_esc(cal.name || cal.id)}</span>
      <button class="btn-text btn-small" data-idx="${idx}" style="color:var(--color-danger)">Remove</button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      const updated = store.getSharedCalendars().filter((_, i) => i !== idx);
      store.setSharedCalendars(updated);
      _renderSharedCalendars();
      if (_onCalendarVisibilityChanged) _onCalendarVisibilityChanged();
    });
    list.appendChild(li);
  });
}

async function _populateSharedCalSelect(allCals) {
  const sel = document.getElementById('shared-cal-select');
  if (!sel) return;
  const pinned = store.getSharedCalendars().map(c => c.id);
  const unpinned = allCals.filter(c => !pinned.includes(c.id));
  sel.innerHTML = unpinned.length
    ? unpinned.map(c => `<option value="${c.id}" data-name="${_esc(c.summary)}">${_esc(c.summary)}</option>`).join('')
    : '<option value="">— no more calendars —</option>';
}

function _handleAddSharedCal() {
  const sel = document.getElementById('shared-cal-select');
  const id   = sel.value;
  const name = sel.options[sel.selectedIndex]?.dataset.name || id;
  if (!id) { showToast('No calendar selected.', 'error'); return; }

  const current = store.getSharedCalendars();
  if (current.some(c => c.id === id)) { showToast('Already added.', 'error'); return; }

  store.setSharedCalendars([...current, { id, name }]);
  _renderSharedCalendars();
  // Remove added option from dropdown
  sel.options[sel.selectedIndex]?.remove();
  if (_onCalendarVisibilityChanged) _onCalendarVisibilityChanged();
  showToast(`"${name}" pinned to week view.`, 'success');
}

// ---- Meal library tab ----

function _renderMealLibrary() {
  const meals = getMeals();
  const tbody  = mealBody();
  tbody.innerHTML = '';

  mealEmpty().classList.toggle('hidden', meals.length > 0);

  meals.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${_esc(m.name)}</td>
      <td><span class="meal-slot-badge">${_esc(m.slot)}</span></td>
      <td>${(m.tags || []).map(t => `<span class="meal-tag">${_esc(t)}</span>`).join('')}</td>
      <td>
        <button class="btn-text btn-small" data-id="${m.id}">Edit</button>
      </td>
    `;
    tr.querySelector('button').addEventListener('click', () => openMealOptionModal(m));
    tbody.appendChild(tr);
  });
}

// ---- Meal option modal ----

export function openMealOptionModal(meal = null) {
  _editingMealOptionId = meal?.id || null;
  mealOptTitle().textContent = meal ? 'Edit Meal' : 'Add Meal';
  mealOptName().value  = meal?.name  || '';
  mealOptSlot().value  = meal?.slot  || 'any';
  mealOptTags().value  = (meal?.tags || []).join(', ');
  mealOptNotes().value = meal?.notes || '';
  mealOptBtnDelete().classList.toggle('hidden', !meal);
  mealOptOverlay().classList.remove('hidden');
  mealOptName().focus();
}

export function closeMealOptionModal() {
  mealOptOverlay().classList.add('hidden');
  _editingMealOptionId = null;
}

async function _handleSaveMealOption() {
  const name = mealOptName().value.trim();
  if (!name) { showToast('Name is required.', 'error'); return; }

  const tags = mealOptTags().value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  try {
    mealOptBtnSave().disabled = true;
    if (_editingMealOptionId) {
      await updateMeal(_editingMealOptionId, {
        name,
        slot: mealOptSlot().value,
        tags,
        notes: mealOptNotes().value.trim(),
      });
      showToast('Meal option updated.', 'success');
    } else {
      await addMeal({
        name,
        slot: mealOptSlot().value,
        tags,
        notes: mealOptNotes().value.trim(),
      });
      showToast('Meal option added.', 'success');
    }
    closeMealOptionModal();
    _renderMealLibrary();
  } catch (e) {
    showToast(`Save failed: ${e.message}`, 'error');
  } finally {
    mealOptBtnSave().disabled = false;
  }
}

async function _handleDeleteMealOption() {
  if (!_editingMealOptionId) return;
  if (!confirm('Delete this meal option from your library?')) return;
  try {
    await deleteMeal(_editingMealOptionId);
    showToast('Meal option deleted.', 'success');
    closeMealOptionModal();
    _renderMealLibrary();
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
