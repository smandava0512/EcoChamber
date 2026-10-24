import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera as CameraIcon, RefreshCw, VideoOff } from 'lucide-react';
import type { ImageInput } from '../core/types';
export interface CameraHandle {
  capture(): ImageInput;
}
interface Props {
  selected: string;
  disabled: boolean;
  onReady: (ready: boolean) => void;
  onDevices: (devices: MediaDeviceInfo[]) => void;
}
const Camera = forwardRef<CameraHandle, Props>(function Camera(
  { selected, disabled, onReady, onDevices },
  ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [starting, setStarting] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let stream: MediaStream | null = null;
    setError('');
    setStarting(true);
    setReady(false);
    onReady(false);
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: selected
            ? { deviceId: { exact: selected } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          if (!disposed) {
            setReady(false);
            onReady(false);
            setError('The camera disconnected. Reconnect it and try again.');
          }
        });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        if (disposed) return;
        setReady(true);
        onReady(true);
        setStarting(false);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!disposed) onDevices(devices.filter((device) => device.kind === 'videoinput'));
      } catch (cause) {
        stream?.getTracks().forEach((track) => track.stop());
        if (disposed) return;
        const name = cause instanceof DOMException ? cause.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Camera access is blocked. Allow camera access in Windows privacy settings, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Camera not found. Choose another camera in setup, or reconnect your webcam.'
              : 'The camera is unavailable. Close other apps using it and try again.',
        );
        setStarting(false);
        setReady(false);
        onReady(false);
      }
    }
    void start();
    return () => {
      disposed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [selected, retry, onReady, onDevices]);
  useImperativeHandle(
    ref,
    () => ({
      capture() {
        const source = video.current;
        if (!ready || !source || !source.videoWidth)
          throw new Error('Wait for the camera to be ready.');
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1024 / Math.max(source.videoWidth, source.videoHeight));
        canvas.width = Math.round(source.videoWidth * scale);
        canvas.height = Math.round(source.videoHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not capture a frame. Try again.');
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return {
          base64: canvas.toDataURL('image/jpeg', 0.8).split(',')[1],
          mimeType: 'image/jpeg',
        };
      },
    }),
    [ready],
  );
  return (
    <div className="camera-view">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label="Live webcam preview"
        className={ready ? 'visible' : ''}
      />
      {ready && (
        <>
          <div className="camera-top">
            <span className="live-pill">
              <span />
              LIVE CAMERA
            </span>
            <span className="frame-size">ONE ITEM AT A TIME</span>
          </div>
          <div className="viewfinder">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="camera-hint">
            <CameraIcon size={16} /> Hold your item inside the frame
          </div>
        </>
      )}
      {!ready && (
        <div className="camera-empty">
          <div className="camera-glyph">
            {error ? <VideoOff size={30} /> : <CameraIcon size={30} />}
          </div>
          <h3>{error ? 'Let’s get your camera ready' : 'Opening your camera'}</h3>
          <p>{error || 'Your webcam stays live. Only a scan captures a frame.'}</p>
          {error && (
            <button
              className="button light"
              disabled={disabled}
              onClick={() => setRetry((value) => value + 1)}
            >
              <RefreshCw size={16} />
              Try camera again
            </button>
          )}
          {starting && <span className="loader" />}
        </div>
      )}
    </div>
  );
});
export default Camera;
