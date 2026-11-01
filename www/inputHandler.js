/******************************************************************
    INPUT & GAME FLOW
    - Keyboard (desktop): uses physical key codes (event.code), so the
      controls work with any keyboard layout (e.g. Russian).
    - Swipes (touch screens, also mouse drag).
    - On-screen pause button and start / pause / game-over overlay.
******************************************************************/

const JUMP_BUFFER_FRAMES = 10;  // a jump pressed slightly before landing still counts
const RESTART_DELAY_MS = 800;   // ignore restart input right after the game ends

var gameOverAt = 0;

function isPlaying() {
    return STARTED && GAME && !PAUSE;
}

/* ---------- Player actions ---------- */
function moveLeft() {
    if (isPlaying() && speed > 0) direction[0] = true;
}

function moveRight() {
    if (isPlaying() && speed > 0) direction[3] = true;
}

function jumpUp() {
    if (isPlaying()) jumpBuffer = JUMP_BUFFER_FRAMES;
}

function dropDown() {
    if (isPlaying()) direction[2] = true;
}

/* ---------- Game flow ---------- */
function startGame() {
    if (STARTED) return;
    STARTED = true;
    needsRedraw = true;
    updateOverlay();
    syncAudio();
}

function setPaused(paused) {
    if (!STARTED || !GAME || PAUSE === paused) return;
    PAUSE = paused;
    // Drop inputs queued before pausing so the player doesn't move on resume
    direction = [false, false, false, false];
    jumpBuffer = 0;
    needsRedraw = true;
    updateOverlay();
    syncAudio();
}

function togglePause() {
    setPaused(!PAUSE);
}

function quitGame() {
    if (!STARTED || !GAME) return;
    GAME = false;
    displayMessage('YOU QUIT');
}

function restartGame() {
    if (GAME || performance.now() - gameOverAt < RESTART_DELAY_MS) return;
    try {
        sessionStorage.setItem('autostart', '1');
    } catch (e) { /* storage unavailable: the player just taps Play again */ }
    location.reload();
}

function overlayAction() {
    if (!STARTED) startGame();
    else if (!GAME) restartGame();
    else if (PAUSE) setPaused(false);
}

/* ---------- Audio (browsers only allow playback after a user gesture) ---------- */
function syncAudio() {
    if (isPlaying()) {
        if (audio.paused) {
            const p = audio.play();
            if (p && p.catch) p.catch(() => { /* retried on the next tap / key press */ });
        }
    } else if (!audio.paused) {
        audio.pause();
    }
}

/* ---------- Overlay ---------- */
function updateOverlay() {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const text = document.getElementById('overlay-text');
    const button = document.getElementById('overlay-btn');

    if (!STARTED) {
        title.textContent = 'Subway Surfers';
        text.textContent = 'Collect coins, dodge trains and barricades, and don\'t get caught!';
        button.textContent = 'Play';
    } else if (!GAME) {
        title.textContent = WIN ? 'You win!' : 'Game over';
        text.textContent = 'Score: ' + coins;
        button.textContent = 'Play again';
    } else if (PAUSE) {
        title.textContent = 'Paused';
        text.textContent = '';
        button.textContent = 'Resume';
    } else {
        overlay.classList.add('hidden');
        return;
    }
    overlay.classList.remove('hidden');
}

/* ---------- Keyboard ---------- */
const MOVE_KEYS = {
    ArrowLeft: moveLeft,
    KeyA: moveLeft,
    ArrowRight: moveRight,
    KeyD: moveRight,
    ArrowUp: jumpUp,
    KeyW: jumpUp,
    Space: jumpUp,
    ArrowDown: dropDown,
    KeyS: dropDown,
};

document.addEventListener('keydown', (event) => {
    // Leave system shortcuts (Cmd+Q, Cmd+R, Ctrl+Tab, ...) alone
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const code = event.code;
    const handled = (code in MOVE_KEYS) || ['Enter', 'NumpadEnter', 'Escape', 'KeyP', 'KeyQ', 'KeyG', 'KeyF', 'KeyR'].includes(code);
    if (!handled) return;

    // Stop arrows / space from scrolling the page or "clicking" a focused button
    event.preventDefault();
    syncAudio();
    if (event.repeat) return; // holding a key must not repeat lane changes / jumps

    const confirm = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';

    if (!STARTED) {
        if (confirm) startGame();
        return;
    }
    if (!GAME) {
        if (confirm || code === 'KeyR') restartGame();
        return;
    }
    if (PAUSE) {
        if (confirm || code === 'KeyP' || code === 'Escape') setPaused(false);
        return;
    }

    switch (code) {
        case 'KeyP':
        case 'Escape':
            setPaused(true);
            return;
        case 'KeyQ':
            quitGame();
            return;
        case 'KeyG':
            grayscale = !grayscale;
            return;
        case 'KeyF':
            flashLightning();
            return;
    }

    if (MOVE_KEYS[code]) MOVE_KEYS[code]();
});

/* ---------- Swipes (pointer events cover touch, pen and mouse) ---------- */
let swipe = null;

function swipeThreshold() {
    return Math.max(20, Math.min(window.innerWidth, window.innerHeight) * 0.05);
}

window.addEventListener('pointerdown', (event) => {
    syncAudio();
    if (event.target.closest('button')) return;
    if (!isPlaying()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, done: false };
});

window.addEventListener('pointermove', (event) => {
    if (!swipe || swipe.done || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < swipeThreshold()) return;

    // React as soon as the finger has travelled far enough: one swipe = one action
    swipe.done = true;
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) moveLeft(); else moveRight();
    } else {
        if (dy < 0) jumpUp(); else dropDown();
    }
});

function endSwipe(event) {
    if (swipe && event.pointerId === swipe.id) swipe = null;
}
window.addEventListener('pointerup', endSwipe);
window.addEventListener('pointercancel', endSwipe);

// No long-press menu / text selection on touch screens
window.addEventListener('contextmenu', (event) => event.preventDefault());

/* ---------- Buttons ----------
   React on pointerup instead of relying on `click`: after a fast swipe
   Chrome / Android WebView swallow the next tap's click (fling cancel),
   which made the pause / resume buttons ignore the first tap. */
function bindButton(element, action) {
    let lastPointerAction = -Infinity;
    element.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Like a normal button: dragging off it before releasing cancels the press
        const rect = element.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) return;
        lastPointerAction = performance.now();
        element.blur();
        action();
    });
    // Fallback for activation without a pointer (e.g. assistive technologies)
    element.addEventListener('click', () => {
        if (performance.now() - lastPointerAction < 700) return;
        element.blur();
        action();
    });
}

bindButton(document.getElementById('pause-btn'), () => {
    if (STARTED && GAME) togglePause();
});
bindButton(document.getElementById('overlay-btn'), overlayAction);

/* ---------- Auto-pause when the window / app goes to the background ---------- */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
});
window.addEventListener('blur', () => setPaused(true));
window.addEventListener('resize', () => { needsRedraw = true; });

/* ---------- Android (Capacitor): back button pauses instead of quitting ---------- */
(function setupNativeApp() {
    const capacitor = window.Capacitor;
    if (!capacitor || !capacitor.isNativePlatform || !capacitor.isNativePlatform()) return;
    const App = (capacitor.Plugins && capacitor.Plugins.App) || capacitor.registerPlugin('App');

    App.addListener('backButton', () => {
        if (isPlaying()) setPaused(true);
        else App.exitApp();
    });
    App.addListener('appStateChange', (state) => {
        if (!state.isActive) setPaused(true);
    });
})();
