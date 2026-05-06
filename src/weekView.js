// weekView.js — renders the 7-column week grid

import { addDays, toDateString, toTimeString, isSameDay, formatWeekLabel } from './utils.js';

const HOUR_START = 6;   // 06:00
const HOUR_END   = 23;  // up to 23:00 (17 hours shown)
const HOUR_HEIGHT = 60; // px per hour

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Callbacks set by app.js
let _onCellClick = null;
let _onEventClick = null;
let _onMealAddClick = null;
let _onMealClick = null;

export function initWeekView({ onCellClick, onEventClick, onMealAddClick, onMealClick }) {
  _onCellClick = onCellClick;
  _onEventClick = onEventClick;
  _onMealAddClick = onMealAddClick;
  _onMealClick = onMealClick;
}

/**
 * Render the full week grid.
 * @param {Date}   monday   - start of week (Monday 00:00)
 * @param {Array}  events   - Google Calendar event objects
 * @param {Array}  meals    - meal event objects (GCal events with planify_type=meal)
 */
export function renderWeek(monday, events, meals) {
  const container = document.getElementById('week-container');
  container.innerHTML = '';

  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Update toolbar label
  document.getElementById('week-label').textContent = formatWeekLabel(monday);

  // ---- Day header ----
  const header = document.createElement('div');
  header.className = 'week-header';
  header.innerHTML = '<div class="week-header-gutter"></div>';
  days.forEach((day, i) => {
    const isToday = isSameDay(day, today);
    const el = document.createElement('div');
    el.className = `day-header${isToday ? ' is-today' : ''}`;
    el.innerHTML = `
      <div class="day-name">${DAY_NAMES[i]}</div>
      <div class="day-num">${day.getDate()}</div>
    `;
    header.appendChild(el);
  });
  container.appendChild(header);

  // ---- Meal row ----
  const mealRow = document.createElement('div');
  mealRow.className = 'meal-row';
  mealRow.innerHTML = '<div class="meal-row-label"><span>Meals</span></div>';
  days.forEach((day) => {
    const isToday = isSameDay(day, today);
    const cell = document.createElement('div');
    cell.className = `meal-day-cell${isToday ? ' is-today' : ''}`;

    const dayMeals = meals.filter(m => {
      const mDate = m.start?.date ? new Date(m.start.date) : new Date(m.start?.dateTime);
      return isSameDay(mDate, day);
    });

    dayMeals.forEach(m => {
      const slot = m.extendedProperties?.private?.meal_slot || '';
      const chip = document.createElement('button');
      chip.className = 'meal-chip';
      chip.innerHTML = `<span class="meal-chip-slot">${slot}</span> ${_esc(m.summary || 'Meal')}`;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_onMealClick) _onMealClick(m);
      });
      cell.appendChild(chip);
    });

    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'meal-add-btn';
    addBtn.setAttribute('aria-label', `Add meal on ${toDateString(day)}`);
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
      if (_onMealAddClick) _onMealAddClick(toDateString(day));
    });
    cell.appendChild(addBtn);

    mealRow.appendChild(cell);
  });
  container.appendChild(mealRow);

  // ---- Time grid scroll area ----
  const scrollArea = document.createElement('div');
  scrollArea.className = 'time-grid-scroll';

  const grid = document.createElement('div');
  grid.className = 'time-grid';
  grid.style.setProperty('--hour-height', `${HOUR_HEIGHT}px`);
  const totalHours = HOUR_END - HOUR_START;
  grid.style.height = `${totalHours * HOUR_HEIGHT}px`;

  // Time labels column (left)
  const labelsCol = document.createElement('div');
  labelsCol.style.cssText = 'display:flex;flex-direction:column;';
  for (let h = HOUR_START; h < HOUR_END; h++) {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    labelsCol.appendChild(label);
  }
  grid.appendChild(labelsCol);

  // Day columns
  days.forEach((day) => {
    const isToday = isSameDay(day, today);
    const col = document.createElement('div');
    col.style.cssText = 'position:relative;';

    // Hour rows (click targets)
    for (let h = HOUR_START; h < HOUR_END; h++) {
      const row = document.createElement('div');
      row.className = `hour-row${isToday ? ' is-today' : ''}`;
      row.dataset.date = toDateString(day);
      row.dataset.hour = h;
      row.addEventListener('click', () => {
        if (_onCellClick) _onCellClick(toDateString(day), h);
      });
      col.appendChild(row);
    }

    // Event blocks
    const dayEvents = events.filter(ev => {
      if (!ev.start) return false;
      if (ev.start.date) return ev.start.date === toDateString(day); // all-day
      return isSameDay(new Date(ev.start.dateTime), day);
    });

    dayEvents.forEach(ev => {
      const block = _buildEventBlock(ev);
      if (block) col.appendChild(block);
    });

    grid.appendChild(col);
  });

  // Current time indicator
  if (days.some(d => isSameDay(d, today))) {
    const now = new Date();
    const minutesFromStart = (now.getHours() - HOUR_START) * 60 + now.getMinutes();
    if (minutesFromStart >= 0 && minutesFromStart <= totalHours * 60) {
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = `${(minutesFromStart / 60) * HOUR_HEIGHT}px`;
      grid.appendChild(line);
    }
  }

  scrollArea.appendChild(grid);
  container.appendChild(scrollArea);

  // Scroll to current hour (or 8am)
  const scrollTo = isSameWeek(monday, today)
    ? Math.max(0, (today.getHours() - HOUR_START - 1)) * HOUR_HEIGHT
    : 2 * HOUR_HEIGHT; // 08:00
  requestAnimationFrame(() => { scrollArea.scrollTop = scrollTo; });
}

function _buildEventBlock(ev) {
  if (ev.start.date) return null; // skip all-day for now (could add later)

  const start = new Date(ev.start.dateTime);
  const end   = new Date(ev.end.dateTime);

  const startMins = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
  const endMins   = (end.getHours()   - HOUR_START) * 60 + end.getMinutes();
  const durationMins = Math.max(endMins - startMins, 15);

  if (startMins < 0 || startMins > (HOUR_END - HOUR_START) * 60) return null;

  const top    = (startMins / 60) * HOUR_HEIGHT;
  const height = (durationMins / 60) * HOUR_HEIGHT;

  const colour = ev.colorId ? `event-colour-${ev.colorId}` : 'event-colour-default';

  const block = document.createElement('div');
  block.className = `event-block ${colour}`;
  block.style.top    = `${top}px`;
  block.style.height = `${Math.max(height, 20)}px`;
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

function isSameWeek(monday, date) {
  const end = addDays(monday, 6);
  return date >= monday && date <= end;
}

function _esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
