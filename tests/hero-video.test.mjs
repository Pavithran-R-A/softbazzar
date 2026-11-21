import assert from 'node:assert/strict';
import test from 'node:test';
import { initHeroVideo } from '../src/hero-video.js';

function harness({ rejectPlay = false } = {}) {
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const motion = new EventTarget();
  motion.matches = false;
  let nextId = 0;
  let now = 1000;
  const frames = new Map();
  const timers = new Map();
  const windowRef = {
    performance: { now: () => now },
    matchMedia: () => motion,
    requestAnimationFrame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const video = new EventTarget();
  Object.assign(video, {
    style: { opacity: '0' }, readyState: 2, duration: 20,
    currentTime: 0, paused: true, muted: false, playsInline: false,
    playCalls: 0, pauseCalls: 0, loadCalls: 0,
    async play() {
      this.playCalls += 1;
      if (rejectPlay) throw new Error('autoplay blocked');
      this.paused = false;
    },
    pause() { this.pauseCalls += 1; this.paused = true; },
    load() { this.loadCalls += 1; },
  });
  const fire = (target, type) => target.dispatchEvent(new Event(type));
  const flushFrame = (timestamp) => {
    now = timestamp;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(timestamp));
  };
  const runTimer = () => {
    const [id, timer] = timers.entries().next().value || [];
    if (id === undefined) return null;
    timers.delete(id);
    timer.callback();
    return timer.delay;
  };
  return { documentRef, motion, windowRef, video, fire, frames, timers, flushFrame, runTimer };
}

test('video fades, loops once, and prevents duplicate fades', async () => {
  const h = harness();
  const dispose = initHeroVideo(h.video, { documentRef: h.documentRef, windowRef: h.windowRef });
  await Promise.resolve();
  assert.equal(h.video.playCalls, 1);
  assert.equal(h.video.muted, true);
  assert.equal(h.video.playsInline, true);
  assert.equal(h.video.loadCalls, 1);
  h.flushFrame(1000);
  h.flushFrame(1500);
  assert.equal(h.video.style.opacity, '1');

  h.video.currentTime = 19.6;
  h.fire(h.video, 'timeupdate');
  h.fire(h.video, 'timeupdate');
  assert.equal(h.frames.size, 1);
  h.flushFrame(1500);
  h.flushFrame(2000);
  assert.equal(h.video.style.opacity, '0');

  h.video.paused = true;
  h.fire(h.video, 'ended');
  assert.equal(h.runTimer(), 100);
  await Promise.resolve();
  assert.equal(h.video.currentTime, 0);
  assert.equal(h.video.playCalls, 2);
  dispose();
  assert.equal(h.frames.size, 0);
});

test('video pauses in hidden tabs and reduced motion', async () => {
  const h = harness();
  const dispose = initHeroVideo(h.video, { documentRef: h.documentRef, windowRef: h.windowRef });
  await Promise.resolve();
  h.flushFrame(1000);
  h.flushFrame(1500);

  h.documentRef.hidden = true;
  h.fire(h.documentRef, 'visibilitychange');
  assert.equal(h.video.paused, true);
  assert.equal(h.video.style.opacity, '0');
  assert.equal(h.frames.size, 0);

  h.documentRef.hidden = false;
  h.fire(h.documentRef, 'visibilitychange');
  await Promise.resolve();
  assert.equal(h.video.playCalls, 2);

  h.motion.matches = true;
  h.fire(h.motion, 'change');
  assert.equal(h.video.paused, true);
  assert.equal(h.video.style.opacity, '0');
  h.motion.matches = false;
  h.fire(h.motion, 'change');
  await Promise.resolve();
  assert.equal(h.video.playCalls, 3);
  dispose();
});

test('blocked autoplay keeps the dark fallback without retries', async () => {
  const h = harness({ rejectPlay: true });
  const dispose = initHeroVideo(h.video, { documentRef: h.documentRef, windowRef: h.windowRef });
  await Promise.resolve();
  assert.equal(h.video.playCalls, 1);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.style.opacity, '0');
  h.fire(h.video, 'loadeddata');
  await Promise.resolve();
  assert.equal(h.video.playCalls, 1);
  dispose();
});

test('cleanup cancels fades, timers, and event handlers', async () => {
  const h = harness();
  const dispose = initHeroVideo(h.video, { documentRef: h.documentRef, windowRef: h.windowRef });
  await Promise.resolve();
  h.video.style.opacity = '1';
  h.video.currentTime = 19.7;
  h.fire(h.video, 'timeupdate');
  assert.equal(h.frames.size, 1);
  h.video.paused = true;
  h.fire(h.video, 'ended');
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 1);
  dispose();
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  h.fire(h.video, 'ended');
  assert.equal(h.timers.size, 0);
});
