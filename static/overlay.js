const overlay = document.getElementById('overlay-container');
const albumArt = document.getElementById('album-art');
const songTitle = document.getElementById('song-title');
const artistName = document.getElementById('artist-name');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const progressContainer = document.getElementById('progress-container');
const timeDisplay = document.getElementById('time-display');
const artworkContainer = document.getElementById('artwork-container');

let config = {};
let currentTheme = '';
let customStyleEl = null;
let lastTitle = '';
let transitionAnim = 'slide_up';

// ── Init ────────────────────────────────────────────
fetch('/api/config')
    .then(res => res.json())
    .then(data => {
        config = data;
        applyConfig(config);
        connectWs();
    });

function applyConfig(cfg) {
    const el = document.getElementById('overlay-container');
    el.style.setProperty('--accent', cfg.accent_color);
    el.style.setProperty('--bg', cfg.background_color);
    el.style.setProperty('--text', cfg.text_color);
    el.style.setProperty('--font-size', `${cfg.font_size_px}px`);
    el.style.setProperty('--radius', `${cfg.border_radius_px ?? 14}px`);
    el.style.setProperty('--blur', `${cfg.blur_px ?? 18}px`);
    el.style.setProperty('--art-radius', `${Math.max(0, (cfg.border_radius_px ?? 14) - 4)}px`);

    // Theme class
    if (currentTheme) {
        document.body.classList.remove(`theme-${currentTheme}`);
        overlay.classList.remove('playing');
    }
    currentTheme = cfg.theme || 'frosted_glass';
    document.body.classList.add(`theme-${currentTheme}`);

    // Visibility
    artworkContainer.style.display = cfg.show_thumbnail ? '' : 'none';
    artistName.style.display = cfg.show_artist ? '' : 'none';
    progressContainer.style.display = cfg.show_progress ? '' : 'none';
    timeDisplay.style.display = cfg.show_time ? '' : 'none';

    // Position
    const positions = {
        TopLeft: ['flex-start', 'flex-start'],
        TopRight: ['flex-end', 'flex-start'],
        BottomLeft: ['flex-start', 'flex-end'],
        BottomRight: ['flex-end', 'flex-end'],
    };
    const [jc, ai] = positions[cfg.position] || positions.BottomRight;
    document.body.style.justifyContent = jc;
    document.body.style.alignItems = ai;

    // Custom CSS injection
    if (customStyleEl) customStyleEl.remove();
    if (cfg.custom_css && cfg.custom_css.trim()) {
        customStyleEl = document.createElement('style');
        customStyleEl.textContent = cfg.custom_css;
        document.head.appendChild(customStyleEl);
    }

    // Transition animation
    transitionAnim = cfg.transition_animation || 'slide_up';
}

// ── WebSocket ───────────────────────────────────────
function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
        const songInfo = JSON.parse(event.data);
        updateOverlay(songInfo);
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
}

let currentSong = {};
let lastMessageTime = 0;

// ── Update ──────────────────────────────────────────
function updateOverlay(song) {
    if (!song.title) {
        overlay.classList.add('hidden');
        overlay.classList.remove('playing');
        return;
    }
    overlay.classList.remove('hidden');

    if (song.is_playing) {
        overlay.classList.add('playing');
    } else {
        overlay.classList.remove('playing');
    }

    songTitle.textContent = song.title || 'Unknown Title';
    artistName.textContent = song.artist || 'Unknown Artist';

    // Trigger transition animation on song change
    const newTitle = song.title || '';
    if (newTitle !== lastTitle && lastTitle !== '' && transitionAnim !== 'none') {
        const cls = `anim-${transitionAnim}`;
        overlay.classList.remove(cls);
        void overlay.offsetWidth; // force reflow
        overlay.classList.add(cls);
        overlay.addEventListener('animationend', () => {
            overlay.classList.remove(cls);
        }, { once: true });
    }
    lastTitle = newTitle;

    if (song.album_art_base64) {
        const newSrc = `data:image/png;base64,${song.album_art_base64}`;
        if (albumArt.src !== newSrc) {
            albumArt.src = newSrc;
        }
        albumArt.style.display = '';
    } else {
        if (albumArt.getAttribute('src')) {
            albumArt.removeAttribute('src');
        }
        albumArt.style.display = 'none';
    }

    currentSong = song;
    lastMessageTime = Date.now();
}

function tick() {
    requestAnimationFrame(tick);
    if (!currentSong.title) return;

    let posSecs = currentSong.position_secs || 0;
    const lengthSecs = currentSong.length_secs || 0;

    if (currentSong.is_playing) {
        const elapsedMs = Date.now() - lastMessageTime;
        posSecs += (elapsedMs / 1000);
    }

    // clamping
    if (posSecs > lengthSecs) posSecs = lengthSecs;
    if (posSecs < 0) posSecs = 0;

    const fmt = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    currentTimeEl.textContent = fmt(posSecs);
    totalTimeEl.textContent = fmt(lengthSecs);

    if (lengthSecs > 0) {
        progressBar.style.width = `${(posSecs / lengthSecs) * 100}%`;
    } else {
        progressBar.style.width = '0%';
    }
}
requestAnimationFrame(tick);
