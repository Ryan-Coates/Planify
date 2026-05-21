// mealLibrary.js — saved meal options stored in Google Drive App Data folder
// Falls back to localStorage when not signed in or offline.

import { getAccessToken, isSignedIn } from './auth.js';
import { store } from './store.js';
import { uuid, showToast } from './utils.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'planify-meals.json';

let _fileId = null;   // Drive file ID once discovered/created
let _meals  = [];     // in-memory copy

// ---- Default dinner library ----
const DEFAULT_MEAL_DATA = [
  { name: 'Spaghetti Bolognese',  tags: ['italian', 'pasta', 'beef'] },
  { name: 'Chicken Stir Fry',     tags: ['asian', 'stir-fry', 'chicken', 'quick'] },
  { name: 'Beef Tacos',           tags: ['mexican', 'beef', 'quick'] },
  { name: 'Butter Chicken',       tags: ['indian', 'curry', 'chicken'] },
  { name: 'Homemade Pizza',       tags: ['italian', 'baked'] },
  { name: 'Fish and Chips',       tags: ['british', 'fish', 'fried'] },
  { name: 'Chicken Schnitzel',    tags: ['chicken', 'fried'] },
  { name: 'Beef Lasagne',         tags: ['italian', 'pasta', 'beef', 'baked'] },
  { name: 'Lamb Chops',           tags: ['lamb', 'grilled'] },
  { name: 'Pork Fried Rice',      tags: ['asian', 'pork', 'quick'] },
  { name: 'Thai Green Curry',     tags: ['thai', 'curry'] },
  { name: 'Beef Stew',            tags: ['british', 'beef', 'slow-cook'] },
  { name: 'Roast Chicken',        tags: ['british', 'chicken', 'roast'] },
  { name: 'Salmon with Veggies',  tags: ['fish', 'baked', 'quick'] },
  { name: 'Chicken Quesadillas',  tags: ['mexican', 'chicken', 'quick'] },
  { name: 'Beef Burger',          tags: ['american', 'beef', 'grilled', 'quick'] },
  { name: 'Mushroom Risotto',     tags: ['italian', 'vegetarian'] },
  { name: 'Chicken Caesar Salad', tags: ['american', 'chicken', 'quick'] },
  { name: 'Prawn Pasta',          tags: ['italian', 'seafood', 'pasta', 'quick'] },
  { name: 'BBQ Ribs',             tags: ['american', 'pork', 'grilled'] },
  { name: 'Chicken Soup',         tags: ['asian', 'chicken', 'soup'] },
  { name: 'Beef Nachos',          tags: ['mexican', 'beef', 'quick'] },
  { name: 'Honey Soy Chicken',    tags: ['asian', 'chicken', 'quick'] },
  { name: 'Pork Dumplings',       tags: ['asian', 'pork'] },
  { name: 'Chicken Parmigiana',   tags: ['italian', 'chicken', 'baked'] },
  { name: 'Lamb Stew',            tags: ['british', 'lamb', 'slow-cook'] },
  { name: 'Tuna Pasta Bake',      tags: ['pasta', 'fish', 'baked'] },
  { name: 'Beef Kebabs',          tags: ['beef', 'grilled'] },
  { name: 'Teriyaki Salmon',      tags: ['asian', 'fish', 'quick'] },
  { name: 'Vegetable Curry',      tags: ['indian', 'curry', 'vegetarian'] },
  { name: 'Pulled Pork Sliders',  tags: ['american', 'pork', 'slow-cook'] },
  { name: 'Pad Thai',             tags: ['thai', 'asian'] },
  { name: 'Chicken Fajitas',      tags: ['mexican', 'chicken', 'quick'] },
  { name: 'Meatball Sub',         tags: ['american', 'beef'] },
  { name: 'Bacon and Egg Pasta',  tags: ['pasta', 'quick'] },
  { name: 'Sweet and Sour Pork',  tags: ['asian', 'chinese', 'pork'] },
  { name: 'Chicken Noodle Soup',  tags: ['asian', 'chicken', 'soup'] },
  { name: 'Beef Enchiladas',      tags: ['mexican', 'beef', 'baked'] },
  { name: 'Prawn Fried Rice',     tags: ['asian', 'seafood', 'quick'] },
  { name: 'Mushroom Pasta',       tags: ['italian', 'pasta', 'vegetarian', 'quick'] },
];

const DEFAULT_MEALS = DEFAULT_MEAL_DATA.map(({ name, tags }, i) => ({
  id: `default-${i}`,
  name,
  slot: 'dinner',
  tags,
  notes: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  isDefault: true,
}));

// ---- Public API ----

export function getMeals() {
  return _meals;
}

/**
 * Load meal library from Drive (or localStorage fallback).
 * Call once after sign-in.
 */
export async function loadLibrary() {
  if (!isSignedIn()) {
    _meals = store.getMealsCache();
    if (_meals.length === 0) _meals = [...DEFAULT_MEALS];
    return _meals;
  }

  try {
    _fileId = await _findFile();
    if (_fileId) {
      const data = await _readFile(_fileId);
      _meals = data.meals || [];
    } else {
      // First run — start with cached meals or defaults
      _meals = store.getMealsCache();
    }
    if (_meals.length === 0) _meals = [...DEFAULT_MEALS];
    store.setMealsCache(_meals);
    return _meals;
  } catch (e) {
    showToast('Could not load meal library from Drive — using local cache.', 'error');
    _meals = store.getMealsCache();
    if (_meals.length === 0) _meals = [...DEFAULT_MEALS];
    return _meals;
  }
}

/**
 * Add a new meal to the library.
 */
export async function addMeal({ name, slot, tags, notes }) {
  const meal = {
    id: uuid(),
    name: name.trim(),
    slot: slot || 'any',
    tags: tags || [],
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  _meals = [..._meals, meal];
  await _persist();
  return meal;
}

/**
 * Update an existing meal by id.
 */
export async function updateMeal(id, changes) {
  _meals = _meals.map(m => m.id === id ? { ...m, ...changes } : m);
  await _persist();
}

/**
 * Delete a meal by id.
 */
export async function deleteMeal(id) {
  _meals = _meals.filter(m => m.id !== id);
  await _persist();
}

// ---- Drive helpers ----

async function _apiFetch(url, options = {}) {
  const token = getAccessToken();
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Drive API error ${resp.status}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

async function _findFile() {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${FILE_NAME}'`,
    fields: 'files(id)',
  });
  const data = await _apiFetch(`${DRIVE_BASE}/files?${params}`);
  return data.files?.[0]?.id || null;
}

async function _readFile(fileId) {
  const resp = await fetch(`${DRIVE_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!resp.ok) throw new Error(`Drive read error ${resp.status}`);
  return resp.json();
}

async function _persist() {
  // Always update local cache first
  store.setMealsCache(_meals);

  if (!isSignedIn()) return;

  const content = JSON.stringify({ version: 1, meals: _meals });
  const blob = new Blob([content], { type: 'application/json' });

  try {
    if (_fileId) {
      // Update existing file
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: FILE_NAME })], { type: 'application/json' }));
      form.append('file', blob);
      await _apiFetch(`${UPLOAD_BASE}/files/${_fileId}?uploadType=multipart`, {
        method: 'PATCH',
        body: form,
      });
    } else {
      // Create new file in appDataFolder
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({
        name: FILE_NAME,
        parents: ['appDataFolder'],
      })], { type: 'application/json' }));
      form.append('file', blob);
      const result = await _apiFetch(`${UPLOAD_BASE}/files?uploadType=multipart`, {
        method: 'POST',
        body: form,
      });
      _fileId = result.id;
    }
  } catch (e) {
    showToast('Could not sync meals to Drive — saved locally.', 'error');
  }
}
