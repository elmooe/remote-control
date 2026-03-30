'use strict';

(function () {

const socket = io();

const dot        = document.getElementById('dot');
const statusText = document.getElementById('status-text');

socket.on('connect', () => {
  dot.classList.replace('bg-red-500', 'bg-green-500');
  statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
  dot.classList.replace('bg-green-500', 'bg-red-500');
  statusText.textContent = 'Disconnected';
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => {
      const isActive = b === btn;
      b.classList.toggle('text-[#58a6ff]',  isActive);
      b.classList.toggle('border-[#58a6ff]', isActive);
      b.classList.toggle('text-[#8b949e]',  !isActive);
      b.classList.toggle('border-transparent', !isActive);
    });

    document.querySelectorAll('.panel').forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('flex');
    });
    const active = document.getElementById(name + '-panel');
    active.classList.remove('hidden');
    active.classList.add('flex');
    if (name === 'keyboard') {
      setTimeout(() => document.getElementById('capture').focus(), 120);
    } else {
      document.getElementById('capture').blur();
    }
  });
});


const settingsBtn       = document.getElementById('settings-btn');
const settingsPopup     = document.getElementById('settings-popup');
const speedSlider       = document.getElementById('speed');
const scrollSpeedSlider = document.getElementById('scroll-speed');
const speedValLabel     = document.getElementById('speed-val');
const scrollSpeedValLabel = document.getElementById('scroll-speed-val');

settingsBtn.addEventListener('click', e => {
  e.stopPropagation();
  const opening = settingsPopup.classList.contains('hidden');
  settingsPopup.classList.toggle('hidden', !opening);
  settingsPopup.classList.toggle('flex',    opening);
});
document.addEventListener('click', e => {
  if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) {
    settingsPopup.classList.add('hidden');
    settingsPopup.classList.remove('flex');
  }
});
speedSlider.addEventListener('input', () => {
  speedValLabel.textContent = parseFloat(speedSlider.value).toFixed(1);
});
scrollSpeedSlider.addEventListener('input', () => {
  scrollSpeed = parseFloat(scrollSpeedSlider.value);
  scrollSpeedValLabel.textContent = scrollSpeed.toFixed(1);
});

const trackpad = document.getElementById('trackpad');

let prevTouches      = {};   // identifier → {x, y}
let gestureStart     = 0;    // ms timestamp when first finger touched
let gestureMaxFings  = 0;    // peak finger count during this gesture
let gestureMoved     = false;
let lastTapTime      = 0;    // for double-tap detection
let gestureOriginX   = 0;    // raw start position for jitter-safe move detection
let gestureOriginY   = 0;

// Scroll smoothing state
// EMA smooths raw noisy deltas; accumulator holds sub-unit remainder
// so fractional values aren't discarded by macOS's integer scroll API.
const SCROLL_EMA    = 1.0;  // 0=max smooth/laggy, 1=raw/instant
let   scrollSpeed   = 2.0;  // overall scroll sensitivity (updated by slider)
let scrollVx = 0, scrollVy = 0;   // EMA-smoothed velocity
let scrollAccX = 0, scrollAccY = 0; // sub-unit accumulator

trackpad.addEventListener('touchstart', e => {
  e.preventDefault();

  if (e.targetTouches.length === 1) {
    gestureStart    = Date.now();
    gestureMaxFings = 1;
    gestureMoved    = false;
    prevTouches     = {};
    gestureOriginX  = e.targetTouches[0].clientX;
    gestureOriginY  = e.targetTouches[0].clientY;
    // Reset scroll smoother so previous gesture doesn't bleed in
    scrollVx = 0; scrollVy = 0;
    scrollAccX = 0; scrollAccY = 0;
  } else {
    gestureMaxFings = Math.max(gestureMaxFings, e.targetTouches.length);
  }

  for (const t of e.targetTouches) {
    prevTouches[t.identifier] = { x: t.clientX, y: t.clientY };
  }
}, { passive: false });

trackpad.addEventListener('touchmove', e => {
  e.preventDefault();
  const speed = parseFloat(speedSlider.value);

  if (e.targetTouches.length === 1) {
    // Single finger: mouse movement
    const t = e.targetTouches[0];
    const p = prevTouches[t.identifier];
    if (p) {
      const dx = (t.clientX - p.x) * speed;
      const dy = (t.clientY - p.y) * speed;
      if (Math.abs(dx) + Math.abs(dy) > 0.4) {
        socket.emit('mouse_move', { dx, dy });
      }
    }
    // Only mark as moved when finger clearly left the tap origin (8px raw)
    const rawDist = Math.abs(t.clientX - gestureOriginX) + Math.abs(t.clientY - gestureOriginY);
    if (rawDist > 8) gestureMoved = true;

  } else if (e.targetTouches.length >= 2) {
    // Two fingers: scrolling
    const t0 = e.targetTouches[0], t1 = e.targetTouches[1];
    const p0 = prevTouches[t0.identifier];
    const p1 = prevTouches[t1.identifier];
    if (p0 && p1) {
      const avgDx = ((t0.clientX - p0.x) + (t1.clientX - p1.x)) / 2;
      const avgDy = ((t0.clientY - p0.y) + (t1.clientY - p1.y)) / 2;

      // EMA smoothing, damps jitter without adding much lag
      scrollVx = SCROLL_EMA * (-avgDx * scrollSpeed) + (1 - SCROLL_EMA) * scrollVx;
      scrollVy = SCROLL_EMA * (-avgDy * scrollSpeed) + (1 - SCROLL_EMA) * scrollVy;

      // Accumulate; only emit whole units so macOS doesn't quantize to 0
      scrollAccX += scrollVx;
      scrollAccY += scrollVy;
      const ix = Math.trunc(scrollAccX);
      const iy = Math.trunc(scrollAccY);
      if (ix !== 0 || iy !== 0) {
        socket.emit('mouse_scroll', { dx: ix, dy: iy });
        scrollAccX -= ix;
        scrollAccY -= iy;
        gestureMoved = true;
      } else if (Math.abs(avgDx) + Math.abs(avgDy) > 0.5) {
        gestureMoved = true; // still counts as a move even if no tick yet
      }
    }
  }

  for (const t of e.targetTouches) {
    prevTouches[t.identifier] = { x: t.clientX, y: t.clientY };
  }
}, { passive: false });

trackpad.addEventListener('touchend', e => {
  e.preventDefault();

  if (e.targetTouches.length === 0) {
    // All fingers lifted → evaluate tap
    const dt = Date.now() - gestureStart;

    if (!gestureMoved && dt < 260 && gestureMaxFings === 1) {
      // Single-finger tap → left click or double-click
      const now = Date.now();
      if (now - lastTapTime < 350) {
        // Second tap within window → double-click (first click already sent)
        socket.emit('mouse_double_click', {});
        lastTapTime = 0;
      } else {
        // First tap — fire immediately, no delay
        socket.emit('mouse_click', { button: 'left' });
        lastTapTime = now;
      }
    }

    // Reset for next gesture
    prevTouches     = {};
    gestureMaxFings = 0;
  } else {
    // Some fingers still down — just remove lifted ones
    for (const t of e.changedTouches) {
      delete prevTouches[t.identifier];
    }
  }
}, { passive: false });

trackpad.addEventListener('touchcancel', e => {
  e.preventDefault();
  prevTouches     = {};
  gestureMaxFings = 0;
}, { passive: false });

const btnLeft  = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

let btnLeftClickCount = 1;
let btnLeftLastTap    = 0;

btnLeft.addEventListener('touchstart', e => {
  e.preventDefault();
  const now = Date.now();
  btnLeftClickCount = (now - btnLeftLastTap < 350) ? 2 : 1;
  btnLeftLastTap = now;
  socket.emit('mouse_button_down', { click_count: btnLeftClickCount });
});
btnLeft.addEventListener('touchend', e => {
  e.preventDefault();
  socket.emit('mouse_button_up', { click_count: btnLeftClickCount });
});
btnLeft.addEventListener('touchcancel', e => {
  e.preventDefault();
  socket.emit('mouse_button_up', { click_count: btnLeftClickCount });
});
btnRight.addEventListener('touchstart', e => {
  e.preventDefault();
  socket.emit('mouse_click', { button: 'right' });
});

const cap      = document.getElementById('capture');
const kbdLabel = document.getElementById('kbd-label');
const typeBtn  = document.getElementById('type-btn');

// A zero-width space sentinel keeps the field non-empty so that
// pressing Backspace always fires an input event (even on an "empty" field).
const SENTINEL = '\u200B';

function resetCapture() {
  cap.value = SENTINEL;
  cap.setSelectionRange(1, 1);
}
resetCapture();

cap.addEventListener('focus', () => {
  kbdLabel.textContent = 'Keyboard active — type anything';
  kbdLabel.classList.replace('text-[#8b949e]', 'text-[#58a6ff]');
});

cap.addEventListener('blur', () => {
  kbdLabel.textContent = 'Tap to open keyboard';
  kbdLabel.classList.replace('text-[#58a6ff]', 'text-[#8b949e]');
});

cap.addEventListener('input', e => {
  const inputType = e.inputType || '';

  if (inputType.startsWith('delete') || cap.value.length < SENTINEL.length) {
    // Backspace / delete key
    socket.emit('key_backspace', { count: 1 });
  } else {
    // Typed text — strip sentinel before sending
    const typed = cap.value.replace(/\u200B/g, '');
    if (typed) socket.emit('key_type', { text: typed });
  }

  resetCapture();
});

typeBtn.addEventListener('click', () => cap.focus());

})();
