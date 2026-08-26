import { useRef, useState, useCallback, useEffect } from 'react';

export default function SelfieModal({ isOpen, onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("L'appareil photo n'est pas disponible.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Acces camera refuse. Autorisez la camera dans votre navigateur.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stream]);

  useEffect(() => {
    if (isOpen) {
      setPreview(null);
      setError('');
      setTimeout(startCamera, 100);
    } else {
      stopCamera();
    }
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const capture = () => {
    const video = videoRef.current;
    if (!stream || !video || !video.videoWidth) {
      setError("La camera n'est pas prete. Reessayez.");
      return;
    }
    const side = Math.min(video.videoWidth, video.videoHeight);
    const out = 480;
    const canvas = canvasRef.current;
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, out, out);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    stopCamera();
    video.classList.add('hidden');
    setPreview(dataUrl);
  };

  const retake = () => {
    setPreview(null);
    videoRef.current?.classList.remove('hidden');
    startCamera();
  };

  const usePhoto = () => {
    stopCamera();
    onCapture(preview);
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Photo de validation">
      <div className="modal-card card scan-card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <div>
            <h3>Photo de validation</h3>
            <p className="muted">Cette photo sera jointe a votre pointage.</p>
          </div>
        </div>
        <div className="scan-frame selfie-frame">
          <video ref={videoRef} playsInline muted style={preview ? { display: 'none' } : {}}></video>
          {preview && <img src={preview} alt="Apercu de la photo" />}
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
        {error && <p className="feedback error">{error}</p>}
        {!preview && <button className="primary-btn" type="button" onClick={capture}>Prendre la photo</button>}
        {preview && (
          <div className="btn-row">
            <button className="ghost-btn" type="button" onClick={retake}>Reprendre</button>
            <button className="primary-btn" type="button" onClick={usePhoto}>Utiliser cette photo</button>
          </div>
        )}
        <button className="ghost-btn" type="button" onClick={() => { stopCamera(); onClose(); }}>Annuler</button>
      </div>
    </div>
  );
}
