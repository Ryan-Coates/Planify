// auth.js — Google Identity Services OAuth 2.0 (client-side only)

import { CLIENT_ID, SCOPES } from '../config.js';
import { showToast } from './utils.js';

const SIGNIN_FLAG = 'planify_was_signed_in';
const SIGNIN_HINT = 'planify_login_hint';

let _accessToken      = null; // in-memory only — never persisted
let _tokenClient      = null;
let _onSignInCallback  = null;
let _onSignOutCallback = null;

export function initAuth(onSignIn, onSignOut) {
  _onSignInCallback  = onSignIn;
  _onSignOutCallback = onSignOut;

  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    setTimeout(() => initAuth(onSignIn, onSignOut), 500);
    return;
  }

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        if (response.error === 'interaction_required' || response.error === 'access_denied') {
          // Silent attempt failed — user needs to click Sign in manually
          return;
        }
        showToast(`Sign-in failed: ${response.error}`, 'error');
        return;
      }
      _accessToken = response.access_token;
      localStorage.setItem(SIGNIN_FLAG, '1');
      _fetchUserInfo();
    },
  });

  // If previously signed in, try a silent token refresh (no UI shown)
  if (localStorage.getItem(SIGNIN_FLAG)) {
    const hint = localStorage.getItem(SIGNIN_HINT);
    setTimeout(() => {
      _tokenClient.requestAccessToken({
        prompt: '',  // empty = silent, no popup
        ...(hint ? { login_hint: hint } : {}),
      });
    }, 300);
  }
}

export function signIn() {
  if (!_tokenClient) {
    showToast('Auth not ready yet, please try again.', 'error');
    return;
  }
  const hint = localStorage.getItem(SIGNIN_HINT);
  _tokenClient.requestAccessToken({
    prompt: 'select_account',
    ...(hint ? { login_hint: hint } : {}),
  });
}

export function signOut() {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken, () => {});
    _accessToken = null;
  }
  localStorage.removeItem(SIGNIN_FLAG);
  _renderSignedOut();
  if (_onSignOutCallback) _onSignOutCallback();
}

export function getAccessToken() { return _accessToken; }
export function isSignedIn()     { return !!_accessToken; }

// ---- private ----

async function _fetchUserInfo() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!resp.ok) throw new Error('userinfo failed');
    const info = await resp.json();
    if (info.email) localStorage.setItem(SIGNIN_HINT, info.email);
    _renderSignedIn(info);
    if (_onSignInCallback) _onSignInCallback(info);
  } catch {
    showToast('Signed in but could not fetch profile.', 'error');
    if (_onSignInCallback) _onSignInCallback(null);
  }
}

function _renderSignedIn(info) {
  document.getElementById('btn-signin').classList.add('hidden');
  const ui = document.getElementById('user-info');
  ui.classList.remove('hidden');
  if (info) {
    const avatar = document.getElementById('user-avatar');
    avatar.src = info.picture || '';
    avatar.alt = info.name || 'User';
    document.getElementById('user-name').textContent = info.given_name || info.name || '';
  }
}

function _renderSignedOut() {
  document.getElementById('btn-signin').classList.remove('hidden');
  document.getElementById('user-info').classList.add('hidden');
  document.getElementById('user-avatar').src = '';
  document.getElementById('user-name').textContent = '';
}

