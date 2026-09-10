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
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return "Acces camera refuse. Autorisez la camera dans les reglages du navigateur, puis reessayez.";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return "Aucune camera n'a ete detectee sur cet appareil.";
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'La camera est deja utilisee par une autre application. Fermez-la puis reessayez.';
  }
  if (name === 'SecurityError') {
    return "L'acces camera est bloque. Reessayez depuis un lien securise (HTTPS).";
  }
  if (name === 'OverconstrainedError') {
    return 'La camera ne repond pas aux parametres demandes. Reessayez.';
  }
  return "Impossible d'acceder a la camera. Reessayez.";
}