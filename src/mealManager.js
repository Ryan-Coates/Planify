// mealManager.js — Full-page meal library management

import { getMeals, addMeal, updateMeal, deleteMeal } from './mealLibrary.js';
import { showToast } from './utils.js';

let _activeTags  = new Set();
let _searchQuery = '';
let _editingId   = null;
let _formTags    = [];

// ---- Public API ----

export function initMealManager() {
  const overlay = document.getElementById('meal-manager-overlay');

  document.getElementById('btn-close-meal-manager')
    .addEventListener('click', closeMealManager);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeMealManager();
  });

  document.getElementById('meal-manager-search').addEventListener('input', e => {
    _searchQuery = e.target.value.toLowerCase().trim();
    _renderCards();
  });

  document.getElementById('btn-meal-manager-add')
    .addEventListener('click', () => _openForm(null));

  document.getElementById('btn-meal-form-cancel')
    .addEventListener('click', _closeForm);
  document.getElementById('btn-meal-form-save')
    .addEventListener('click', _saveForm);
  document.getElementById('btn-meal-form-delete')
    .addEventListener('click', _deleteForm);

  // Tag chip input — Enter or comma adds the tag
  document.getElementById('meal-form-tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = e.target.value.replace(/,/g, '').trim().toLowerCase();
      if (val) _addFormTag(val);
      e.target.value = '';
    }
  });

  // Clicking the form backdrop closes it
  document.getElementById('meal-form-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('meal-form-overlay')) _closeForm();
  });
}

export function openMealManager() {
  _activeTags.clear();
  _searchQuery = '';
  document.getElementById('meal-manager-search').value = '';
  _closeForm();
  _renderTagFilters();
  _renderCards();
  document.getElementById('meal-manager-overlay').classList.remove('hidden');
}

export function closeMealManager() {
  document.getElementById('meal-manager-overlay').classList.add('hidden');
}

// ---- Tag filters ----

function _getAllTags() {
  const tags = new Set();
  getMeals().forEach(m => (m.tags || []).forEach(t => tags.add(t)));
  return [...tags].sort();
}

function _renderTagFilters() {
  const container = document.getElementById('meal-manager-filter-tags');
  container.innerHTML = '';
  _getAllTags().forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (_activeTags.has(tag) ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      if (_activeTags.has(tag)) _activeTags.delete(tag);
      else _activeTags.add(tag);
      chip.classList.toggle('active');
      _renderCards();
    });
    container.appendChild(chip);
  });
}

// ---- Card grid ----

function _getFilteredMeals() {
  return getMeals().filter(meal => {
    const tags = meal.tags || [];
    if (_activeTags.size > 0 && !tags.some(t => _activeTags.has(t))) return false;
    if (_searchQuery) {
      const nameMatch = meal.name.toLowerCase().includes(_searchQuery);
      const tagMatch  = tags.some(t => t.includes(_searchQuery));
      if (!nameMatch && !tagMatch) return false;
    }
    return true;
  });
}

function _renderCards() {
  const grid  = document.getElementById('meal-manager-grid');
  const meals = _getFilteredMeals();
  grid.innerHTML = '';

  if (!meals.length) {
    const empty = document.createElement('p');
    empty.className = 'meal-manager-empty';
    empty.textContent = 'No meals match — try a different search or tag.';
    grid.appendChild(empty);
    return;
  }

  meals.forEach(meal => {
    const card = document.createElement('div');
    card.className = 'meal-card';
    const tagsHtml = (meal.tags || [])
      .map(t => `<span class="tag-chip-sm">${_esc(t)}</span>`)
      .join('');
    const deleteBtn = !meal.isDefault
      ? `<button class="btn-icon meal-card-delete" title="Delete meal" aria-label="Delete">✕</button>`
      : '';
    card.innerHTML = `
      <div class="meal-card-body">
        <div class="meal-card-name">${_esc(meal.name)}</div>
        ${tagsHtml ? `<div class="meal-card-tags">${tagsHtml}</div>` : ''}
        ${meal.notes ? `<div class="meal-card-notes">${_esc(meal.notes)}</div>` : ''}
      </div>
      <div class="meal-card-actions">
        <button class="btn-icon meal-card-edit" title="Edit meal" aria-label="Edit">✏</button>
        ${deleteBtn}
      </div>
    `;
    card.querySelector('.meal-card-edit').addEventListener('click', () => _openForm(meal));
    if (!meal.isDefault) {
      card.querySelector('.meal-card-delete').addEventListener('click', () => _confirmDelete(meal));
    }
    grid.appendChild(card);
  });
}

// ---- Add / Edit form ----

function _openForm(meal) {
  _editingId = meal?.id || null;
  _formTags  = [...(meal?.tags || [])];

  document.getElementById('meal-form-title').textContent = meal ? 'Edit Meal' : 'Add Meal';
  document.getElementById('meal-form-name').value  = meal?.name  || '';
  document.getElementById('meal-form-notes').value = meal?.notes || '';
  document.getElementById('btn-meal-form-delete')
    .classList.toggle('hidden', !meal || !!meal.isDefault);
  document.getElementById('meal-form-tag-input').value = '';

  _renderFormTags();
  document.getElementById('meal-form-overlay').classList.remove('hidden');
  document.getElementById('meal-form-name').focus();
}

function _closeForm() {
  document.getElementById('meal-form-overlay').classList.add('hidden');
  _editingId = null;
  _formTags  = [];
}

function _renderFormTags() {
  const wrap  = document.getElementById('meal-form-tags-wrap');
  const input = document.getElementById('meal-form-tag-input');
  // Remove existing chips but keep the input
  [...wrap.querySelectorAll('.form-tag-chip')].forEach(el => el.remove());
  _formTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'form-tag-chip';
    chip.innerHTML = `${_esc(tag)} <button type="button" aria-label="Remove tag ${tag}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      _formTags.splice(i, 1);
      _renderFormTags();
    });
    wrap.insertBefore(chip, input);
  });
}

function _addFormTag(tag) {
  const normalised = tag.toLowerCase().trim();
  if (normalised && !_formTags.includes(normalised)) {
    _formTags.push(normalised);
    _renderFormTags();
  }
}

async function _saveForm() {
  const name  = document.getElementById('meal-form-name').value.trim();
  const notes = document.getElementById('meal-form-notes').value.trim();
  if (!name) {
    document.getElementById('meal-form-name').focus();
    return;
  }

  const saveBtn = document.getElementById('btn-meal-form-save');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    if (_editingId) {
      await updateMeal(_editingId, { name, tags: [..._formTags], notes });
      showToast('Meal updated');
    } else {
      await addMeal({ name, slot: 'dinner', tags: [..._formTags], notes });
      showToast('Meal added');
    }
    _closeForm();
    _renderTagFilters();
    _renderCards();
  } catch (e) {
    showToast('Failed to save meal: ' + e.message, 'error');
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save';
  }
}

async function _deleteForm() {
  if (!_editingId) return;
  const deleteBtn = document.getElementById('btn-meal-form-delete');
  deleteBtn.disabled    = true;
  deleteBtn.textContent = 'Deleting…';
  try {
    await deleteMeal(_editingId);
    showToast('Meal deleted');
    _closeForm();
    _renderTagFilters();
    _renderCards();
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
    deleteBtn.disabled    = false;
    deleteBtn.textContent = 'Delete';
  }
}

async function _confirmDelete(meal) {
  if (!confirm(`Delete "${meal.name}"?`)) return;
  try {
    await deleteMeal(meal.id);
    showToast('Meal deleted');
    _renderTagFilters();
    _renderCards();
  } catch (e) {
    showToast('Failed to delete: ' + e.message, 'error');
  }
}

// ---- Helpers ----

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
