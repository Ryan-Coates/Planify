// calendar.js — Google Calendar API v3 wrapper (all client-side fetch)

import { getAccessToken } from './auth.js';
import { showToast } from './utils.js';

const BASE = 'https://www.googleapis.com/calendar/v3';

async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${resp.status}`);
  }

  if (resp.status === 204) return null;
  return resp.json();
}

// ---- Calendars ----

/**
 * List all calendars the user has access to.
 * @returns {Promise<Array>}
 */
export async function listCalendars() {
  try {
    const data = await apiFetch('/users/me/calendarList');
    return data.items || [];
  } catch (e) {
    showToast(`Failed to load calendars: ${e.message}`, 'error');
    return [];
  }
}

/**
 * Create a calendar with the given summary.
 */
export async function createCalendar(summary) {
  return apiFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
}

// ---- Events ----

/**
 * List events for a given calendar between timeMin and timeMax (ISO strings).
 */
export async function listEvents(calendarId, timeMin, timeMax) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  try {
    const data = await apiFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    return data.items || [];
  } catch (e) {
    showToast(`Failed to load events: ${e.message}`, 'error');
    return [];
  }
}

/**
 * Create an event in the given calendar.
 * @param {string} calendarId
 * @param {object} eventBody  — Google Calendar event resource
 */
export async function createEvent(calendarId, eventBody) {
  return apiFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(eventBody),
  });
}

/**
 * Update an existing event.
 */
export async function updateEvent(calendarId, eventId, eventBody) {
  return apiFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    body: JSON.stringify(eventBody),
  });
}

/**
 * Delete an event.
 */
export async function deleteEvent(calendarId, eventId) {
  return apiFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}
