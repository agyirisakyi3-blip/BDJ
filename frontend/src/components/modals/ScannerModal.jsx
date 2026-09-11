import { useState, useRef, useEffect, useCallback } from 'react';
import { cameraContextError, describeCameraError } from '../../media';

const JSQR_URL = '/jsQR.min.js';

function loadJsQR() {
  if (typeof window.jsQR !== 'undefined') return Promise.resolve();
  const existing = document.querySelector('script[src="' + JSQR_URL + '"]');
  if (existing) {
    if (existing.dataset.loaded === 'true') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 10000);
      existing.addEventListener('load', () => { clearTimeout(timer); existing.dataset.loaded = 'true'; resolve(); });
      existing.addEventListener('error', () => { clearTimeout(timer); reject(new Error('load failed')); });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSQR_URL;
    s.async = true;
    const timer = setTimeout(() => { s.remove(); reject(new Error('timeout')); }, 10000);
    s.onload = () => { clearTimeout(timer); s.dataset.loaded = 'true'; resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('load failed')); };
    document.head.appendChild(s);
  });
}

export default function ScannerModal({ isOpen, onClose, onScan }) {
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);
  const onScanRef = useRef(onScan);
  const scanningRef = useRef(false);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    stopCamera();

    const contextError = cameraContextError();
    if (contextError) { setCameraError(contextError); return; }

    try {
      await loadJsQR();
    } catch {
      setCameraError("Le scanner QR n'a pas pu se charger (verifiez votre connexion).");
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      scanningRef.current = true;

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
      const scanLoop = () => {
        if (!scanningRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(scanLoop); return; }
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0);
        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          if (typeof window.jsQR !== 'undefined') {
            const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (result && result.data) { scanningRef.current = false; stopCamera(); onScanRef.current(result.data); return; }
          }
        } catch {}
        rafRef.current = requestAnimationFrame(scanLoop);
      };
      scanLoop();
    } catch (err) {
      setCameraError(describeCameraError(err));
    }
  }, [stopCamera]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => startCamera(), 100);
      return () => { clearTimeout(t); stopCamera(); };
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  const handleManual = () => {
    if (manualInput.trim()) { stopCamera(); onScan(manualInput.trim()); }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Scanner le QR du bureau">
      <div className="modal-card card scan-card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <div>
            <h3>Scanner le QR du bureau</h3>
            <p className="muted">Centre le QR code dans le cadre</p>
          </div>
        </div>
        {cameraError ? (
          <div className="cam-error">
            <p className="cam-error-msg">{cameraError}</p>
            <button type="button" className="ghost-btn" onClick={startCamera}>Reessayer la camera</button>
            <p className="hint">Camera ne fonctionne pas? Saisissez le code manuellement ci-dessous.</p>
          </div>
        ) : (
          <div className="scan-frame">
            <video ref={videoRef} className="scan-video" playsInline muted autoPlay />
            <div className="scan-line" aria-hidden="true"></div>
            <span className="corner tl" aria-hidden="true"></span>
            <span className="corner tr" aria-hidden="true"></span>
            <span className="corner bl" aria-hidden="true"></span>
            <span className="corner br" aria-hidden="true"></span>
          </div>
        )}
        <details>
          <summary>Camera ne fonctionne pas? Saisissez le code manuellement</summary>
          <div className="manual-row">
            <input type="text" placeholder="Collez le contenu du QR" value={manualInput} onChange={(e) => setManualInput(e.target.value)} />
            <button className="ghost-btn" type="button" onClick={handleManual}>Utiliser</button>
          </div>
        </details>
        <button className="ghost-btn" type="button" onClick={() => { stopCamera(); onClose(); }}>Annuler</button>
      </div>
    </div>
  );
}
