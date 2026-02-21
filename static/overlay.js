// ── DOM References ──────────────────────────────────
const overlay = document.getElementById('overlay-container');
const ambientArt = document.getElementById('ambient-art');
const albumArt = document.getElementById('album-art');
const songTitle = document.getElementById('song-title');
const artistName = document.getElementById('artist-name');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const progressCont = document.getElementById('progress-container');
const timeDisplay = document.getElementById('time-display');
const artworkWrap = document.getElementById('artwork-wrapper');

let config = {};
let currentTheme = '';
let customStyleEl = null;
let lastTitle = '';
let transitionAnim = 'slide_up';
let isVisible = false;     // tracks if overlay is currently shown

// ── Init ────────────────────────────────────────────
fetch('/api/config')
    .then(res => res.json())
    .then(data => {
        config = data;
        applyConfig(config);
        connectWs();
    });

function applyConfig(cfg) {
    overlay.style.setProperty('--accent', cfg.accent_color);
    overlay.style.setProperty('--bg', cfg.background_color);
    overlay.style.setProperty('--text', cfg.text_color);
    overlay.style.setProperty('--font-size', `${cfg.font_size_px}px`);
    overlay.style.setProperty('--radius', `${cfg.border_radius_px ?? 14}px`);
    overlay.style.setProperty('--blur', `${cfg.blur_px ?? 18}px`);
    overlay.style.setProperty('--art-radius', `${Math.max(0, (cfg.border_radius_px ?? 14) - 4)}px`);

    // Theme class
    if (currentTheme) {
        document.body.classList.remove(`theme-${currentTheme}`);
    }
    currentTheme = cfg.theme || 'frosted_glass';
    document.body.classList.add(`theme-${currentTheme}`);

    // Visibility toggles
    artworkWrap.style.display = cfg.show_thumbnail ? '' : 'none';
    artistName.parentElement.style.display = cfg.show_artist ? '' : 'none';
    progressCont.parentElement.style.display = cfg.show_progress ? '' : 'none';
    timeDisplay.parentElement.style.display = cfg.show_time ? '' : 'none';

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

// ── Helpers ─────────────────────────────────────────
const fmt = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

function triggerSongChange() {
    // Remove existing animations first
    overlay.classList.remove('song-change');
    void overlay.offsetWidth;            // force reflow for re-trigger
    overlay.classList.add('song-change');

    setTimeout(() => overlay.classList.remove('song-change'), 800);
}

function setArt(base64) {
    const src = base64 ? `data:image/png;base64,${base64}` : '';
    albumArt.src = src;
    ambientArt.src = src;        // ambient blurred background mirrors art
}

// ── Update ──────────────────────────────────────────
function updateOverlay(song) {
    /* ─ Hide when nothing playing ─ */
    if (!song.title) {
        if (isVisible) {
            overlay.classList.add('state-hidden');
            overlay.classList.remove('playing', 'song-change');
            isVisible = false;
        }
        return;
    }

    /* ─ Show card (use selected transition for entrance) ─ */
    if (!isVisible) {
        overlay.classList.remove('state-hidden');
        isVisible = true;
    }

    /* ─ Playing state ─ */
    overlay.classList.toggle('playing', !!song.is_playing);

    /* ─ Song change detection ─ */
    const newTitle = song.title || '';
    const songChanged = newTitle !== lastTitle;

    if (songChanged) {
        songTitle.textContent = song.title || 'Unknown Title';
        artistName.textContent = song.artist || 'Unknown Artist';
        setArt(song.album_art_base64);

        // Staggered row animations
        triggerSongChange();

        if (transitionAnim !== 'none') {
            const cls = `anim-${transitionAnim}`;
            overlay.classList.remove(cls);
            void overlay.offsetWidth;
            overlay.classList.add(cls);
            const onTransEnd = (e) => {
                if (e.target !== overlay) return;
                overlay.classList.remove(cls);
                overlay.removeEventListener('animationend', onTransEnd);
            };
            overlay.addEventListener('animationend', onTransEnd);
        }

        lastTitle = newTitle;
    }

    /* ─ Progress ─ */
    currentTimeEl.textContent = fmt(song.position_secs);
    totalTimeEl.textContent = fmt(song.length_secs);

    if (song.length_secs > 0) {
        progressBar.style.width = `${(song.position_secs / song.length_secs) * 100}%`;
    } else {
        progressBar.style.width = '0%';
    }
}
