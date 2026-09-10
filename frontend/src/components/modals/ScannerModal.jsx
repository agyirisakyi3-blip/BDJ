import { useState, useRef, useEffect, useCallback } from 'react';
import { cameraContextError, describeCameraError } from '../../media';

const QR_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';

function loadQrScript() {
  if (typeof window.Html5Qrcode !== 'undefined') return Promise.resolve();
  const existing = document.querySelector('script[src="' + QR_CDN_URL + '"]');
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
    s.src = QR_CDN_URL;
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
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      try {
        const p = scannerRef.current.stop();
        if (p && p.catch) p.catch(() => {});
      } catch {}
      try {
        const c = scannerRef.current.clear();
        if (c && c.catch) c.catch(() => {});
      } catch {}
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setCameraError('');
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const contextError = cameraContextError();
    if (contextError) {
      setCameraError(contextError);
      return;
    }

    try {
      await loadQrScript();
    } catch {
      setCameraError("Le scanner QR n'a pas pu se charger (verifiez votre connexion).");
      return;
    }

    if (typeof window.Html5Qrcode === 'undefined') {
      setCameraError("Le scanner QR n'a pas pu se charger (verifiez votre connexion).");
      return;
    }

    const el = containerRef.current;
    if (!el) return;
    if (!el.id) el.id = 'qr-reader-' + Date.now();

    try {
      const scanner = new window.Html5Qrcode(el.id);
      scannerRef.current = scanner;
      const containerRect = el.getBoundingClientRect();
      const boxSize = Math.min(containerRect.width, containerRect.height, 280);
      await scanner.start(
        { facingMode: { ideal: 'environment' } },
        { fps: 10, qrbox: { width: boxSize, height: boxSize }, aspectRatio: 1.0 },
        (text) => { stopScanner(); onScanRef.current(text); },
        () => {}
      );
    } catch (err) {
      setCameraError(describeCameraError(err));
    }
  }, [stopScanner]);

  useEffect(() => {
    if (isOpen) {
      if (containerRef.current && !containerRef.current.id) {
        containerRef.current.id = 'qr-reader-' + Date.now();
      }
      const t = setTimeout(() => startScanner(), 100);
      return () => { clearTimeout(t); stopScanner(); };
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  const handleManual = () => {
    if (manualInput.trim()) {
      stopScanner();
      onScan(manualInput.trim());
    }
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
            <button type="button" className="ghost-btn" onClick={startScanner}>Reessayer la camera</button>
            <p className="hint">Camera ne fonctionne pas? Saisissez le code manuellement ci-dessous.</p>
          </div>
        ) : (
          <div className="scan-frame">
            <div ref={containerRef} id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
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
        <button className="ghost-btn" type="button" onClick={() => { stopScanner(); onClose(); }}>Annuler</button>
      </div>
    </div>
  );
}
