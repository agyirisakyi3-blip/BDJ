export function cameraContextError() {
  if (typeof window === 'undefined') return null;
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
    return "La camera n'est disponible que sur une connexion securisee (HTTPS).";
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "Cet appareil ou navigateur ne prend pas en charge l'acces a la camera.";
  }
  return null;
}

export function describeCameraError(err) {
  const name = err && err.name ? String(err.name) : '';
  const msg = err && err.message ? String(err.message).toLowerCase() : '';
  const combined = name + ' ' + msg;
  if (combined.includes('NotAllowed') || combined.includes('PermissionDenied') || combined.includes('permission') || combined.includes('denied')) {
    return "Acces camera refuse. Autorisez la camera dans les reglages du navigateur, puis reessayez.";
  }
  if (combined.includes('NotFound') || combined.includes('DevicesNotFound') || combined.includes('no camera') || combined.includes('no device')) {
    return "Aucune camera n'a ete detectee sur cet appareil.";
  }
  if (combined.includes('NotReadable') || combined.includes('TrackStart') || combined.includes('could not start') || combined.includes('in use')) {
    return 'La camera est deja utilisee par une autre application. Fermez-la puis reessayez.';
  }
  if (combined.includes('SecurityError') || combined.includes('not secure') || combined.includes('insecure')) {
    return "L'acces camera est bloque. Reessayez depuis un lien securise (HTTPS).";
  }
  if (combined.includes('Overconstrained') || combined.includes('overconstrain')) {
    return 'La camera ne repond pas aux parametres demandes. Reessayez.';
  }
  if (combined.includes('Abort') || combined.includes('aborted')) {
    return "L'acces a la camera a ete interrompu. Reessayez.";
  }
  if (combined.includes('NotSupported') || combined.includes('unsupported')) {
    return "La camera n'est pas supportee par ce navigateur.";
  }
  return "Impossible d'acceder a la camera. Verifiez les permissions et reessayez.";
}