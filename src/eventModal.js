// eventModal.js — add/edit calendar event modal

import { createEvent, updateEvent, deleteEvent, listCalendars } from './calendar.js';
import { showToast, toDateString } from './utils.js';
import { isSignedIn } from './auth.js';

let _onSaved = null;
let _editingEvent = null;
let _editingCalendarId = null;
let _calendars = [];

const overlay  = () => document.getElementById('event-modal-overlay');
const titleEl  = () => document.getElementById('event-modal-title');
const inputTitle  = () => document.getElementById('event-title');
const inputDate   = () => document.getElementById('event-date');
const inputStart  = () => document.getElementById('event-start');
const inputEnd    = () => document.getElementById('event-end');
const inputDesc   = () => document.getElementById('event-desc');
const selectCal   = () => document.getElementById('event-calendar');
const selectColour = () => document.getElementById('event-colour');
const btnDelete   = () => document.getElementById('btn-delete-event');
const btnSave     = () => document.getElementById('btn-save-event');
const btnCancel   = () => document.getElementById('btn-cancel-event');
const btnClose    = () => document.getElementById('btn-close-event-modal');

export function initEventModal(onSaved) {
  _onSaved = onSaved;

  btnSave().addEventListener('click', _handleSave);
  btnCancel().addEventListener('click', closeEventModal);
  btnClose().addEventListener('click', closeEventModal);
  btnDelete().addEventListener('click', _handleDelete);

  overlay().addEventListener('click', (e) => {
    if (e.target === overlay()) closeEventModal();
  });
}

/**
 * Open modal for creating a new event.
 * @param {string} date     YYYY-MM-DD
 * @param {number} hour     0-23
 */
export async function openNewEventModal(date, hour = 9) {
  _editingEvent = null;
  _editingCalendarId = null;

  titleEl().textContent = 'Add Event';
  inputTitle().value = '';
  inputDate().value = date || toDateString(new Date());
  inputStart().value = `${String(hour).padStart(2,'0')}:00`;
  inputEnd().value   = `${String(hour + 1).padStart(2,'0')}:00`;
  inputDesc().value  = '';
  selectColour().value = '';
  btnDelete().classList.add('hidden');

  await _populateCalendars();
  overlay().classList.remove('hidden');
  inputTitle().focus();
}

/**
 * Open modal for editing an existing event.
 */
export async function openEditEventModal(event, calendarId) {
  _editingEvent = event;
  _editingCalendarId = calendarId || 'primary';

  titleEl().textContent = 'Edit Event';
  inputTitle().value = event.summary || '';
  inputDesc().value  = event.description || '';
  selectColour().value = event.colorId || '';
  btnDelete().classList.remove('hidden');

  if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime);
    const end   = new Date(event.end.dateTime);
    inputDate().value  = toDateString(start);
    inputStart().value = start.toTimeString().slice(0, 5);
    inputEnd().value   = end.toTimeString().slice(0, 5);
  } else if (event.start?.date) {
    inputDate().value  = event.start.date;
    inputStart().value = '00:00';
    inputEnd().value   = '00:00';
  }

  await _populateCalendars(calendarId);
  overlay().classList.remove('hidden');
  inputTitle().focus();
}

export function closeEventModal() {
  overlay().classList.add('hidden');
  _editingEvent = null;
}

async function _populateCalendars(selectedId) {
  const sel = selectCal();
  sel.innerHTML = '';

  if (!isSignedIn()) {
    const opt = document.createElement('option');
    opt.value = 'primary';
    opt.textContent = 'Primary calendar';
    sel.appendChild(opt);
    return;
  }

  if (_calendars.length === 0) {
    _calendars = await listCalendars();
  }

  _calendars.forEach(cal => {
    const opt = document.createElement('option');
    opt.value = cal.id;
    opt.textContent = cal.summary;
    if (cal.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function _handleSave() {
  const title = inputTitle().value.trim();
  if (!title) {
    showToast('Please enter a title.', 'error');
    inputTitle().focus();
    return;
  }

  if (!isSignedIn()) {
    showToast('Please sign in to save events.', 'error');
    return;
  }

  const date   = inputDate().value;
  const start  = inputStart().value;
  const end    = inputEnd().value;
  const calId  = selectCal().value || 'primary';

  const eventBody = {
    summary: title,
    description: inputDesc().value.trim() || undefined,
    colorId: selectColour().value || undefined,
    start: { dateTime: `${date}T${start}:00`, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end:   { dateTime: `${date}T${end}:00`,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };

  try {
    btnSave().disabled = true;
    btnSave().textContent = 'Saving…';

    let saved;
    if (_editingEvent) {
      saved = await updateEvent(_editingCalendarId, _editingEvent.id, eventBody);
      showToast('Event updated.', 'success');
    } else {
      saved = await createEvent(calId, eventBody);
      showToast('Event created.', 'success');
    }

    closeEventModal();
    if (_onSaved) _onSaved(saved, calId);
  } catch (e) {
    showToast(`Save failed: ${e.message}`, 'error');
  } finally {
    btnSave().disabled = false;
    btnSave().textContent = 'Save';
  }
}

async function _handleDelete() {
  if (!_editingEvent) return;
  if (!confirm(`Delete "${_editingEvent.summary || 'this event'}"?`)) return;

  try {
    await deleteEvent(_editingCalendarId, _editingEvent.id);
    showToast('Event deleted.', 'success');
    closeEventModal();
    if (_onSaved) _onSaved(null, _editingCalendarId);
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
}
