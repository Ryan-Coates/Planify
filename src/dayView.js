// dayView.js — single-day view

import { toDateString, toTimeString, isSameDay, addDays } from './utils.js';

const HOUR_START  = 6;
const HOUR_END    = 23;
const HOUR_HEIGHT = 60;

const DAY_NAMES_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTH_NAMES    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let _onCellClick    = null;
let _onEventClick   = null;
let _onMealAddClick = null;
let _onMealClick    = null;

export function initDayView({ onCellClick, onEventClick, onMealAddClick, onMealClick }) {
  _onCellClick    = onCellClick;
  _onEventClick   = onEventClick;
  _onMealAddClick = onMealAddClick;
  _onMealClick    = onMealClick;
}

/**
 * Render a single day into #week-container.
 * @param {Date}  date
 * @param {Array} events
 * @param {Array} meals
 */
export function renderDay(date, events, meals) {
  const container = document.getElementById('week-container');
  container.innerHTML = '';

  const today   = new Date();
  const isToday = isSameDay(date, today);
  const dateStr = toDateString(date);

  // Day of week index (0=Mon … 6=Sun)
  const dow = (date.getDay() + 6) % 7;

  // ---- Day header ----
  const header = document.createElement('div');
  header.className = 'day-view-header';

  const dateInfo = document.createElement('div');
  dateInfo.className = 'day-view-date-info';
  dateInfo.innerHTML = `
    <span class="day-view-dayname">${DAY_NAMES_FULL[dow]}</span>
    <span class="day-view-datenum${isToday ? ' is-today' : ''}">${date.getDate()}</span>
    <span class="day-view-monthyear">${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</span>
    ${isToday ? '<span class="day-view-today-badge">Today</span>' : ''}
  `;
  header.appendChild(dateInfo);
  container.appendChild(header);

  // ---- Meal strip ----
  const mealStrip = document.createElement('div');
  mealStrip.className = 'day-view-meal-strip';

  const dayMeals = meals.filter(m => {
    const mDate = m.start?.date || m.start?.dateTime?.slice(0, 10);
    return mDate === dateStr;
  });

  ['breakfast', 'lunch', 'dinner'].forEach(slot => {
    const slotEl = document.createElement('div');
    slotEl.className = 'day-view-meal-slot';

    const meal = dayMeals.find(m => m.extendedProperties?.private?.meal_slot === slot);
    if (meal) {
      slotEl.innerHTML = `
        <span class="day-view-meal-slot-label">${slot}</span>
        <button class="meal-chip day-view-meal-chip">
          ${_esc(meal.summary || 'Meal')}
        </button>
      `;
      slotEl.querySelector('button').addEventListener('click', () => {
        if (_onMealClick) _onMealClick(meal);
      });
    } else {
      slotEl.innerHTML = `
        <span class="day-view-meal-slot-label">${slot}</span>
        <button class="meal-add-btn day-view-meal-add" aria-label="Add ${slot}">+</button>
      `;
      slotEl.querySelector('button').addEventListener('click', () => {
        if (_onMealAddClick) _onMealAddClick(dateStr);
      });
    }
    mealStrip.appendChild(slotEl);
  });
  container.appendChild(mealStrip);

  // ---- Time grid ----
  const scrollArea = document.createElement('div');
  scrollArea.className = 'time-grid-scroll';

  const grid = document.createElement('div');
  grid.className = 'time-grid day-view-grid';
  grid.style.setProperty('--hour-height', `${HOUR_HEIGHT}px`);
  const totalHours = HOUR_END - HOUR_START;
  grid.style.height = `${totalHours * HOUR_HEIGHT}px`;

  // Time labels
  const labelsCol = document.createElement('div');
  labelsCol.style.cssText = 'display:flex;flex-direction:column;';
  for (let h = HOUR_START; h < HOUR_END; h++) {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = `${String(h).padStart(2,'0')}:00`;
    labelsCol.appendChild(label);
  }
  grid.appendChild(labelsCol);

  // Single day column
  const col = document.createElement('div');
  col.style.cssText = 'position:relative;';

  for (let h = HOUR_START; h < HOUR_END; h++) {
    const row = document.createElement('div');
    row.className = `hour-row${isToday ? ' is-today' : ''}`;
    row.dataset.date = dateStr;
    row.dataset.hour = h;
    row.addEventListener('click', () => {
      if (_onCellClick) _onCellClick(dateStr, h);
    });
    col.appendChild(row);
  }

  // Event blocks for this day
  const dayEvents = events.filter(ev => {
    if (!ev.start) return false;
    if (ev.start.date) return ev.start.date === dateStr;
    return isSameDay(new Date(ev.start.dateTime), date);
  });

  dayEvents.forEach(ev => {
    const block = _buildEventBlock(ev);
    if (block) col.appendChild(block);
  });

  grid.appendChild(col);

  // Now-line
  if (isToday) {
    const now = new Date();
    const mins = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
    if (mins >= 0 && mins <= totalHours * 60) {
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = `${(mins / 60) * HOUR_HEIGHT}px`;
      grid.appendChild(line);
    }
  }

  scrollArea.appendChild(grid);
  container.appendChild(scrollArea);

  // Scroll to current time or 8am
  const scrollTo = isToday
    ? Math.max(0, (today.getHours() - HOUR_START - 1)) * HOUR_HEIGHT
    : 2 * HOUR_HEIGHT;
  requestAnimationFrame(() => { scrollArea.scrollTop = scrollTo; });
}

function _buildEventBlock(ev) {
  if (ev.start.date) return null;

  const start = new Date(ev.start.dateTime);
  const end   = new Date(ev.end.dateTime);
  const startMins   = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
  const endMins     = (end.getHours()   - HOUR_START) * 60 + end.getMinutes();
  const durationMins = Math.max(endMins - startMins, 15);

  if (startMins < 0 || startMins > (HOUR_END - HOUR_START) * 60) return null;

  const colour = ev.colorId ? `event-colour-${ev.colorId}` : 'event-colour-default';
  const block  = document.createElement('div');
  block.className = `event-block ${colour}`;
  block.style.top    = `${(startMins / 60) * HOUR_HEIGHT}px`;
  block.style.height = `${Math.max((durationMins / 60) * HOUR_HEIGHT, 20)}px`;
  block.innerHTML = `
    <span class="event-time">${toTimeString(start)}–${toTimeString(end)}</span>
    ${_esc(ev.summary || '(No title)')}
  `;
  block.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_onEventClick) _onEventClick(ev);
  });
  return block;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
