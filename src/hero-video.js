const FADE_MS = 500;
const RESTART_DELAY_MS = 100;

export function initHeroVideo(video, {
  documentRef = globalThis.document,
  windowRef = globalThis.window,
} = {}) {
  let frameId = 0;
  let restartId = 0;
  let playPending = false;
  let playFailed = false;
  let fadingOut = false;
  let disposed = false;
  const reducedMotion = windowRef.matchMedia('(prefers-reduced-motion: reduce)');
  const canPlay = () => !disposed && !documentRef.hidden && !reducedMotion.matches;
  const setOpacity = (value) => { video.style.opacity = String(value); };

  const cancelFade = () => {
    if (frameId) windowRef.cancelAnimationFrame(frameId);
    frameId = 0;
  };

  const clearRestart = () => {
    if (restartId) windowRef.clearTimeout(restartId);
    restartId = 0;
  };

  const fadeTo = (target, onComplete) => {
    cancelFade();
    const parsedOpacity = Number.parseFloat(video.style.opacity);
    const startOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 0;
    const startTime = windowRef.performance.now();
    const step = (timestamp) => {
      frameId = 0;
      if (disposed || !canPlay()) return;
      const progress = Math.min(1, Math.max(0, (timestamp - startTime) / FADE_MS));
      setOpacity(startOpacity + (target - startOpacity) * progress);
      if (progress < 1) frameId = windowRef.requestAnimationFrame(step);
      else onComplete?.();
    };
    frameId = windowRef.requestAnimationFrame(step);
  };

  const startPlayback = async () => {
    if (!canPlay() || playPending || playFailed || !video.paused) return;
    if (video.ended) video.currentTime = 0;
    video.muted = true;
    video.playsInline = true;
    playPending = true;
    try {
      await video.play();
      if (!canPlay()) {
        video.pause();
        return;
      }
      fadingOut = false;
      fadeTo(1);
    } catch {
      playFailed = true;
      setOpacity(0);
      video.pause();
    } finally {
      playPending = false;
    }
  };

  const onTimeUpdate = () => {
    const remaining = video.duration - video.currentTime;
    if (!canPlay() || fadingOut || !Number.isFinite(remaining) || remaining > 0.5) return;
    if (Number.parseFloat(video.style.opacity) <= 0) return;
    fadingOut = true;
    fadeTo(0);
  };

  const onEnded = () => {
    cancelFade();
    setOpacity(0);
    fadingOut = false;
    clearRestart();
    if (!canPlay()) return;
    restartId = windowRef.setTimeout(() => {
      restartId = 0;
      if (!canPlay()) return;
      video.currentTime = 0;
      void startPlayback();
    }, RESTART_DELAY_MS);
  };

  const stopForMotionPreference = () => {
    clearRestart();
    cancelFade();
    fadingOut = false;
    setOpacity(0);
    video.pause();
  };

  const onVisibilityChange = () => {
    if (documentRef.hidden) stopForMotionPreference();
    else void startPlayback();
  };

  const onMotionChange = () => {
    if (reducedMotion.matches) stopForMotionPreference();
    else void startPlayback();
  };

  const onError = () => {
    playFailed = true;
    stopForMotionPreference();
  };

  video.muted = true;
  video.playsInline = true;
  video.addEventListener('loadeddata', startPlayback);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  video.addEventListener('error', onError);
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', onMotionChange);
  video.load();
  if (video.readyState >= 2) void startPlayback();

  return () => {
    if (disposed) return;
    disposed = true;
    cancelFade();
    clearRestart();
    video.removeEventListener('loadeddata', startPlayback);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('error', onError);
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', onMotionChange);
    video.pause();
  };
}
