# Planify — Implementation Plan

A serverless weekly planning app with Google Calendar integration, deployed via GitHub Pages.

---

## 1. Goals & Scope

| Requirement | Detail |
|---|---|
| Weekly view | Display Mon–Sun, current week, navigate forward/back |
| Events | Create, edit, delete calendar events |
| Meal planning | Add breakfast/lunch/dinner slots per day |
| Google Calendar sync | Read + write via Google Calendar API v3 |
| Deployment | GitHub Pages (static files only) |
| No server | All auth and API calls happen in the browser |

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| UI framework | Vanilla JS + CSS (or Vue 3 CDN) | Zero build step, works on GitHub Pages as-is |
| Calendar API | Google Calendar API v3 (REST) | Official, well-documented, free |
| Auth | Google Identity Services (OAuth 2.0 PKCE / implicit) | Runs entirely client-side, no backend token exchange |
| Local state | `localStorage` | Persist user prefs, meal plan drafts offline |
| Deployment | GitHub Pages (`gh-pages` branch or `/docs` folder) | Free, static, no server |
| Build (optional) | Vite + vanilla-ts | Fast DX, single `dist/` output, easy `gh-pages` deploy |

> **No Node server, no database, no backend.** Everything is either served as static files or called directly from the browser via the Google APIs.

---

## 3. Google API Setup

### 3.1 One-time setup (developer)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project **Planify**
3. Enable **Google Calendar API** and **Google Drive API**
4. Create **OAuth 2.0 Client ID** → Application type: **Web application**
5. Add Authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `https://<your-username>.github.io` (prod)
6. Add Authorized redirect URIs (same origins)
7. Copy `Client ID` → stored in `config.js` (public, not secret)

### 3.2 Scopes required
```
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/drive.appdata
```

> `drive.appdata` grants access **only** to your app's hidden folder — it cannot read or modify any other files in the user's Google Drive.

---

## 4. Project Structure

```
planify/
├── index.html            # Entry point
├── config.js             # Google Client ID, API key (public)
├── src/
│   ├── auth.js           # Google Identity Services login/logout
│   ├── calendar.js       # Google Calendar API wrapper (CRUD)
│   ├── weekView.js       # Renders the 7-day grid
│   ├── eventModal.js     # Add/edit event modal
│   ├── mealPlanner.js    # Meal slots — stored as GCal events with tag
│   ├── mealLibrary.js    # Saved meal options — read/write Drive App Data
│   ├── store.js          # localStorage state management
│   └── utils.js          # Date helpers
├── styles/
│   ├── main.css          # Layout, variables
│   ├── week.css          # Week grid
│   └── modal.css         # Modal styles
├── assets/
│   └── icons/            # SVG icons
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions → GitHub Pages
├── vite.config.js        # (optional) build config
└── package.json          # (optional) only if using Vite
```

---

## 5. Feature Breakdown

### 5.1 Authentication (`auth.js`)
- Load Google Identity Services script (`accounts.google.com/gsi/client`)
- `initGoogleAuth()` — initialise token client with scopes
- `signIn()` — pop-up OAuth flow, store access token in memory (not localStorage)
- `signOut()` — revoke token, clear UI
- Token refresh on expiry (GIS handles this automatically)
- Show "Sign in with Google" button when unauthenticated

### 5.2 Week View (`weekView.js`)
- 7-column grid (Mon–Sun), time rows 06:00–23:00
- Current day highlighted
- Navigate with < / > arrows (week by week)
- Events rendered as coloured blocks at correct time position
- Meal plan slots pinned to top of each day column (outside time grid)
- Click empty slot → open "Add Event" modal pre-filled with that time
- Click existing event → open "Edit Event" modal

### 5.3 Events (`calendar.js` + `eventModal.js`)
Google Calendar API calls (all client-side fetch with Bearer token):

| Action | API call |
|---|---|
| List events | `GET /calendars/primary/events?timeMin=...&timeMax=...` |
| Create event | `POST /calendars/primary/events` |
| Update event | `PUT /calendars/primary/events/{eventId}` |
| Delete event | `DELETE /calendars/primary/events/{eventId}` |

**Event modal fields:**
- Title
- Date + start/end time
- Description (optional)
- Calendar selector (lists user's calendars)
- Colour picker
- Repeat (none / daily / weekly)

### 5.4 Meal Planner (`mealPlanner.js`)
- Meals stored as Google Calendar events in a dedicated calendar called **"Planify Meals"**
  - Auto-created on first use if not found
  - Tagged with `extendedProperties.private.planify_type = "meal"`
  - `extendedProperties.private.meal_slot = "breakfast" | "lunch" | "dinner"`
- Displayed in a separate "Meals" row above the time grid
- Quick-add via dropdown: type meal name, optional notes
- Nutritional info field (optional, free text)

### 5.5 Meal Options Library (`mealLibrary.js`)

A personal library of saved meals that can be picked when adding a meal slot — no server needed.

#### Storage strategy comparison

| Option | Syncs across devices | No server | Notes |
|---|---|---|---|
| `localStorage` | No | Yes | Simplest, but data is per-browser |
| **Google Drive App Data** (recommended) | **Yes** | **Yes** | Stored in user's Drive, hidden app folder, free |
| IndexedDB | No | Yes | Better than localStorage for large data, still per-browser |
| Hard-coded in JS | No | Yes | Zero effort, but user can't customise |

**Recommended: Google Drive App Data folder**
- Every Google user has a hidden `/appDataFolder` in Drive — apps can write files there without cluttering the user's visible Drive
- Requires one extra OAuth scope: `https://www.googleapis.com/auth/drive.appdata`
- Store a single JSON file: `planify-meals.json`
- Read on sign-in, write on every save — no extra infrastructure

#### Data shape (`planify-meals.json`)
```json
{
  "version": 1,
  "meals": [
    {
      "id": "uuid",
      "name": "Avocado toast",
      "slot": "breakfast",
      "tags": ["vegetarian", "quick"],
      "notes": "Add chilli flakes",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

#### `mealLibrary.js` responsibilities
- `loadLibrary()` — fetch `planify-meals.json` from Drive App Data on sign-in; fall back to `localStorage` copy if offline
- `saveLibrary(meals)` — write updated JSON back to Drive (PATCH multipart upload)
- `addMeal(meal)` / `updateMeal(id, changes)` / `deleteMeal(id)` — mutate in memory + call `saveLibrary()`
- Cache a copy in `localStorage` as offline fallback

#### Meal Options UI
- **Settings → Meals** screen (accessible from toolbar ⚙ icon)
- Table of saved meals with name, default slot, tags
- "+ Add meal" button → small form (name, slot, tags, notes)
- Edit / delete per row
- When adding a meal slot on the week view: typeahead autocomplete pulls from the library
- Meals can still be entered as free text if not in the library

---

### 5.6 Local State (`store.js`)
Persisted to `localStorage`:
- `planify_theme` — `light | dark`
- `planify_week_offset` — currently viewed week offset from today
- `planify_calendars_visible` — array of calendar IDs to show/hide
- `planify_draft_event` — unsaved event form data (survives page refresh)
- `planify_meals_cache` — local copy of meal library (offline fallback)

### 5.6 Offline / No-server behaviour
- If user is not signed in → show sample/demo week (static mock data)
- If Google API call fails → show toast error, retain last fetched events from `sessionStorage` cache
- No service worker required (keep it simple)

---

## 6. UI Design Principles

- **Mobile-first**, responsive — week view collapses to 1-day view on small screens
- CSS custom properties for theming (`--color-primary`, `--bg-surface`, etc.)
- Dark mode toggle (respects `prefers-color-scheme` by default)
- Minimal chrome — toolbar has only: week navigation, today button, add-event button, sign-in avatar
- Event colours match Google Calendar colours
- Smooth CSS transitions for modal open/close, week slide

---

## 7. Implementation Phases

### Phase 1 — Static shell (no API)
- [ ] `index.html` + CSS grid week layout
- [ ] Hard-coded mock events rendered in the grid
- [ ] Modal open/close with form fields
- [ ] Week navigation (purely local date math)
- [ ] Dark/light theme toggle
- [ ] Deploy to GitHub Pages and verify

### Phase 2 — Google Auth
- [ ] Load GIS script, configure OAuth client
- [ ] Sign-in / sign-out flow
- [ ] Display user avatar + name in toolbar
- [ ] Guard API calls behind auth check

### Phase 3 — Calendar read
- [ ] Fetch events for current week from `primary` calendar
- [ ] Render real events in the grid (replace mocks)
- [ ] List user's calendars, allow show/hide toggle
- [ ] Handle pagination (`nextPageToken`)

### Phase 4 — Calendar write
- [ ] Create event from modal → POST to API → re-render
- [ ] Edit event → PUT → re-render
- [ ] Delete event with confirmation → DELETE → remove from grid
- [ ] Optimistic UI updates (update grid instantly, rollback on error)

### Phase 5 — Meal planner
- [ ] Create / find "Planify Meals" calendar
- [ ] Meal slot UI row above time grid
- [ ] Add / edit / delete meal entries
- [ ] Display meal cards per day

### Phase 5b — Meal options library
- [ ] Add `drive.appdata` scope to OAuth request
- [ ] `mealLibrary.js` — load/save JSON from Drive App Data folder
- [ ] `localStorage` cache as offline fallback
- [ ] Settings → Meals screen (add / edit / delete saved meals)
- [ ] Typeahead autocomplete in meal slot modal pulling from library

### Phase 6 — Polish
- [ ] Responsive / mobile day view
- [ ] Drag-to-reschedule events (optional, nice to have)
- [ ] Keyboard shortcuts (`t` = today, `←/→` = prev/next week, `n` = new event)
- [ ] Loading skeleton screens
- [ ] Error toast system
- [ ] Accessibility audit (ARIA labels, focus management in modal)

---

## 8. GitHub Pages Deployment

### Option A — No build step (simplest)
- All files are plain HTML/CSS/JS ES modules
- Push to `main`, set GitHub Pages source to `/ (root)`
- Zero CI needed

### Option B — Vite build (recommended for larger codebase)
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build        # vite build → dist/
      - uses: actions/deploy-pages@v4
        with:
          folder: dist
```

### `vite.config.js`
```js
export default {
  base: '/planify/',   // match GitHub repo name
}
```

---

## 9. Security Considerations

- **Client ID is public** — this is by design for browser OAuth; never put a client secret in frontend code
- Restrict the OAuth client in Google Cloud Console to your GitHub Pages origin only
- Access tokens are kept in memory (JS variable), not `localStorage` — avoids XSS token theft
- Content Security Policy header via `<meta http-equiv="Content-Security-Policy">` to restrict script sources
- All Google API calls use HTTPS

---

## 10. Key Files to Build First

1. `index.html` — semantic structure, CSP meta tag, script imports
2. `styles/main.css` + `styles/week.css` — the grid layout
3. `src/utils.js` — `startOfWeek()`, `addDays()`, `formatTime()` helpers
4. `src/weekView.js` — renders the grid from an array of event objects
5. `config.js` — `CLIENT_ID`, `API_KEY` constants
6. `src/auth.js` — sign-in flow
7. `src/calendar.js` — API wrapper

---

## 11. Dependencies (if using Vite)

```json
{
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

No runtime npm dependencies — Google APIs loaded via CDN script tags, everything else is vanilla JS.
