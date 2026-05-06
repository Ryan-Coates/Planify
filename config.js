// Planify — Google API configuration
// Replace CLIENT_ID with your OAuth 2.0 client ID from Google Cloud Console.
// The client ID is public and safe to commit. Never add a client secret here.

export const CLIENT_ID = '832133836312-78n9agrp9s6je7haeso29hvaai83gcpv.apps.googleusercontent.com';

// Optional: API key for unauthenticated quota (public read-only calls).
// You can leave this empty; all our calls use OAuth Bearer tokens.
// NOTE: This is NOT the place for your OAuth client secret — never put that here.
export const API_KEY = '';

export const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');
