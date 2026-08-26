import { useState, useEffect, useCallback } from 'react';

const LS_KEY = 'att.key.v1';
let ENC_KEY_CACHE;
const ENC_SUPPORTED = !!(window.crypto && window.crypto.subtle && window.TextEncoder && window.TextDecoder);

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return window.btoa(bin);
}

function base64ToBytes(b64) {
  const bin = window.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encKey() {
  if (ENC_KEY_CACHE !== undefined) return Promise.resolve(ENC_KEY_CACHE);
  if (!ENC_SUPPORTED) return Promise.resolve(null);
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { ENC_KEY_CACHE = raw; return Promise.resolve(raw); }
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const b64 = bytesToBase64(bytes);
    localStorage.setItem(LS_KEY, b64);
    ENC_KEY_CACHE = b64;
    return Promise.resolve(b64);
  } catch {
    return Promise.resolve(null);
  }
}

function importKey(b64, use) {
  return window.crypto.subtle.importKey('raw', base64ToBytes(b64), { name: 'AES-GCM' }, false, [use]);
}

export async function lsGet(key) {
  let v;
  try { v = localStorage.getItem(key); } catch { return null; }
  if (v === null) return null;
  if (!ENC_SUPPORTED || v.indexOf('enc1:') !== 0) return v;
  const k = await encKey();
  if (!k) return v;
  try {
    const cryptoKey = await importKey(k, 'decrypt');
    const env = JSON.parse(v.slice(5));
    const iv = base64ToBytes(env.iv);
    const data = base64ToBytes(env.d);
    const buf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    return new TextDecoder().decode(buf);
  } catch {
    return v;
  }
}

export async function lsSet(key, val) {
  if (!ENC_SUPPORTED) { try { localStorage.setItem(key, val); } catch {} return; }
  const k = await encKey();
  if (!k) { try { localStorage.setItem(key, val); } catch {} return; }
  const cryptoKey = await importKey(k, 'encrypt');
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(val));
  const env = { v: 1, iv: bytesToBase64(iv), d: bytesToBase64(new Uint8Array(ct)) };
  try { localStorage.setItem(key, 'enc1:' + JSON.stringify(env)); } catch {}
}

export function useEncryptedStorage(key, initialValue = null) {
  const [value, setValue] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    lsGet(key).then((raw) => {
      if (cancelled) return;
      try { setValue(raw ? JSON.parse(raw) : initialValue); } catch { setValue(initialValue); }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  const set = useCallback(async (val) => {
    setValue(val);
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    await lsSet(key, str);
  }, [key]);

  return [value, set, loaded];
}
