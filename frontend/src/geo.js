export async function geoPermissionState() {
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      return result.state;
    }
  } catch {}
  return 'prompt';
}

export function getLocationOnce({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined' || !navigator.geolocation) {
      resolve({ unavailable: true });
      return;
    }
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
      resolve({ unavailable: true });
      return;
    }
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          done({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracy: Math.round(pos.coords.accuracy || 0),
          });
        },
        (err) => {
          if (err && err.code === 1) done({ denied: true });
          else if (err && err.code === 3) done({ timeout: true });
          else done({ unavailable: true });
        },
        { enableHighAccuracy: true, timeout, maximumAge: 60000 }
      );
    } catch {
      done({ unavailable: true });
    }
  });
}