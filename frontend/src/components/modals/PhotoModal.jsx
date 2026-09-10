import { useRef, useState, useCallback, useEffect } from 'react';
import { cameraContextError, describeCameraError } from '../../media';

export default function PhotoModal({ isOpen, onClose, onCapture, existing }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen && !prevIsOpen) {
    setPreview(null);
    setError('');
  }
  if (isOpen !== prevIsOpen) setPrevIsOpen(isOpen);

  const startCamera = useCallback(async () => {
    const contextError = cameraContextError();
    if (contextError) {
      setError(contextError);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = s;
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setError(describeCameraError(err));
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(startCamera, 100);
    const streamToClean = streamRef.current;
    const videoToClean = videoRef.current;
    return () => {
      clearTimeout(t);
      if (streamToClean) {
        streamToClean.getTracks().forEach((tr) => tr.stop());
      }
      streamRef.current = null;
      setStream(null);
      if (videoToClean) videoToClean.srcObject = null;
    };
  }, [isOpen, startCamera]);

  if (!isOpen) return null;

  const cropToSquare = (source, width, height) => {
    const side = Math.min(width, height);
    const out = 256;
    const canvas = canvasRef.current;
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!stream || !video || !video.videoWidth) {
      setError("La camera n'est pas prete. Reessayez.");
      return;
    }
    const dataUrl = cropToSquare(video, video.videoWidth, video.videoHeight);
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

  const handleFile = (file) => {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      setError('Selectionnez une image.');
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      if (stream) stopCamera();
      const dataUrl = cropToSquare(img, img.width, img.height);
      setPreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const removePhoto = () => {
    stopCamera();
    onCapture(null);
    onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Photo de profil">
      <div className="modal-card card scan-card">
        <div className="modal-head">
          <span className="brand-mark sm" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </span>
          <div>
            <h3>Photo de profil</h3>
            <p className="muted">Prenez une photo ou choisissez une image a afficher.</p>
          </div>
        </div>
        <div className="scan-frame selfie-frame">
          <video ref={videoRef} playsInline muted style={preview ? { display: 'none' } : {}}></video>
          {preview && <img src={preview} alt="Apercu de la photo" />}
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        </div>
        {error && <p className="feedback error">{error}</p>}
        {!preview && (
          <div className="btn-row">
            <button className="primary-btn" type="button" onClick={capture}>Prendre la photo</button>
            <button className="ghost-btn" type="button" onClick={() => fileRef.current && fileRef.current.click()}>Choisir une image</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
          </div>
        )}
        {preview && (
          <div className="btn-row">
            <button className="ghost-btn" type="button" onClick={retake}>Reprendre</button>
            <button className="primary-btn" type="button" onClick={usePhoto}>Utiliser cette photo</button>
          </div>
        )}
        <div className="btn-row">
          {existing && preview === null && (
            <button className="ghost-btn danger-text" type="button" onClick={removePhoto}>Retirer la photo</button>
          )}
          <button className="ghost-btn" type="button" onClick={() => { stopCamera(); onClose(); }}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
