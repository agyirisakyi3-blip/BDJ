import { useState, useRef, useEffect, useCallback } from 'react';

export default function ScannerModal({ isOpen, onClose, onScan }) {
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  const startScanner = useCallback(async () => {
    setCameraError('');
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    if (typeof window.Html5Qrcode === 'undefined') {
      setCameraError("Le scanner QR n'a pas pu se charger (verifiez votre connexion).");
      return;
    }

    try {
      const scanner = new window.Html5Qrcode(containerRef.current.id || 'qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => { stopScanner(); onScan(text); },
        () => {}
      );
    } catch (err) {
      setCameraError('Camera indisponible: ' + err);
    }
  }, [onScan]);

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

  useEffect(() => {
    if (isOpen) {
      const id = 'qr-reader-' + Date.now();
      if (containerRef.current) containerRef.current.id = id;
      setTimeout(() => startScanner(), 100);
    } else {
      stopScanner();
    }
    return () => stopScanner();
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
