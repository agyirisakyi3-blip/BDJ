import { useState, useRef, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';

const QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

function loadQrLib() {
  if (typeof window.QRCode !== 'undefined') return Promise.resolve();
  const existing = document.querySelector('script[src="' + QR_LIB_URL + '"]');
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', resolve);
    existing.addEventListener('error', reject);
  });
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB_URL;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function QRGenerator() {
  const { config } = useApp();
  const [secret, setSecret] = useState('');
  const [tenant, setTenant] = useState(config.DEFAULT_TENANT || '');
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const qrInstance = useRef(null);

  const generate = useCallback(async () => {
    setError('');
    if (!secret.trim()) {
      setError('Saisissez le token secret.');
      return;
    }
    setLoading(true);
    try {
      await loadQrLib();
    } catch {
      setError('La bibliotheque QR n\'a pas pu se charger. Verifiez votre connexion.');
      setLoading(false);
      return;
    }
    if (typeof window.QRCode === 'undefined') {
      setError('La bibliotheque QR n\'a pas pu se charger.');
      setLoading(false);
      return;
    }

    const text = tenant.trim() ? tenant.trim() + '|' + secret.trim() : secret.trim();
    const box = boxRef.current;
    if (!box) { setLoading(false); return; }

    box.innerHTML = '';
    try {
      qrInstance.current = new window.QRCode(box, {
        text: text,
        width: 256,
        height: 256,
        correctLevel: window.QRCode.CorrectLevel.H,
      });
      setGenerated(true);
    } catch (err) {
      setError('Erreur lors de la generation: ' + err.message);
    }
    setLoading(false);
  }, [secret, tenant]);

  const download = () => {
    const canvas = boxRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = 'qr-addredance-' + (tenant.trim() || 'office') + '.png';
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const print = () => {
    const canvas = boxRef.current?.querySelector('canvas');
    if (!canvas) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      '<html><head><title>QR Code - addredance</title>' +
      '<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;background:#fff}' +
      'img{width:300px;height:300px}h2{margin-bottom:8px}p{color:#666;margin-top:4px}</style></head><body>' +
      '<h2>addredance</h2>' +
      '<img src="' + canvas.toDataURL('image/png') + '" />' +
      '<p>Scannez pour pointer</p>' +
      '</body></html>'
    );
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className="card block">
      <div className="block-head collapsible">
        <h3>QR Code permanent</h3>
      </div>
      <div className="block-body">
        <p className="hint">
          Generez un QR code statique a imprimer et afficher a l'entree du bureau.
          Le token doit correspondre exactement a <code>qrSecret</code> dans la feuille Config.
        </p>
        <div className="emp-form">
          <label className="range-field">
            Token secret
            <input
              type="text"
              placeholder="Collez qrSecret de la feuille Config"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
          </label>
          <label className="range-field">
            Code tenant <span className="opt">(optionnel)</span>
            <input
              type="text"
              placeholder="ex. addredance"
              value={tenant}
              onChange={(e) => setTenant(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
            />
          </label>
          <button className="ghost-btn range-btn" onClick={generate} disabled={loading}>
            {loading ? 'Generation...' : 'Generer le QR'}
          </button>
        </div>
        {error && <p className="feedback error">{error}</p>}
        {generated && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <div ref={boxRef} style={{ display: 'inline-block', padding: '16px', background: '#fff', borderRadius: '16px' }} />
            <p className="hint" style={{ marginTop: '8px' }}>
              Ce code est permanent. Imprimez-le et placez-le a l'entree du bureau.
            </p>
            <div className="btn-row" style={{ justifyContent: 'center', marginTop: '12px' }}>
              <button className="ghost-btn" onClick={download}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Telecharger PNG</span>
              </button>
              <button className="ghost-btn" onClick={print}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Imprimer</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
