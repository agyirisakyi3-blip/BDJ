import * as SecureStore from 'expo-secure-store';

export const API_URL =
  'https://script.google.com/macros/s/AKfycbzo9vVXXha0KA-qu9Bt4OVl0YdJUJRX6blG6qfQtyU8qHJKdE5LlNMErWsIJGmQJHyH_Q/exec';

const AUTH_KEY = 'addredance.auth.v1';
const PROFILE_KEY = 'addredance.profile.v1';
const QUEUE_KEY = 'addredance.queue.v1';

export async function api(body, tenant = '') {
  const payload = { ...body };
  if (payload.tenant === undefined && tenant) payload.tenant = tenant;

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const offlineError = new Error('Network unavailable');
    offlineError.offline = true;
    throw offlineError;
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Unexpected server response');
  }
}

export async function readSession() {
  const [auth, profile] = await Promise.all([
    SecureStore.getItemAsync(AUTH_KEY),
    SecureStore.getItemAsync(PROFILE_KEY),
  ]);
  return {
    auth: auth ? JSON.parse(auth) : null,
    profile: profile ? JSON.parse(profile) : null,
  };
}

export async function saveSession(user, sessionToken) {
  const profile = {
    name: user?.name || '',
    email: user?.email || '',
    tenant: user?.tenant || '',
  };
  await Promise.all([
    SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ user, sessionToken })),
    SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile)),
  ]);
  return profile;
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_KEY),
    SecureStore.deleteItemAsync(PROFILE_KEY),
  ]);
}

export async function readQueue() {
  const raw = await SecureStore.getItemAsync(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveQueue(queue) {
  await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue.slice(0, 20)));
}
