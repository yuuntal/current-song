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

    if (song.album_art_base64) {
        albumArt.src = `data:image/png;base64,${song.album_art_base64}`;
        albumArt.style.display = '';
    } else {
        albumArt.src = '';
    }

    const fmt = (secs) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    currentTimeEl.textContent = fmt(song.position_secs);
    totalTimeEl.textContent = fmt(song.length_secs);

    if (song.length_secs > 0) {
        progressBar.style.width = `${(song.position_secs / song.length_secs) * 100}%`;
    } else {
        progressBar.style.width = '0%';
    }
}
