import { state, WS_URL, formatTime, updateProgressBar } from './core.js';
import { extractAccentColor, resetAccentColor } from './color.js';

const DEFAULT_LAYOUT = 'dynamic';
const DEFAULT_ALIGNMENT = 'bottom-right';
const DEFAULT_ANIMATION = 'swipe';

let overlayConfig = {
    layout: DEFAULT_LAYOUT,
    alignment: DEFAULT_ALIGNMENT,
    animation: DEFAULT_ANIMATION,
    show_thumbnail: true,
    show_artist: true,
    show_progress: true,
    show_time: true,
    background_color: '#1a1a1e',
    text_color: '#ffffff',
    accent_color: '#4a90e2',
    color_mode: 'auto',
    border_radius_px: 0,
    font_size_px: 14,
};
let ws;

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();
        overlayConfig = {
            ...overlayConfig,
            ...cfg,
            layout: cfg.layout || DEFAULT_LAYOUT,
            alignment: cfg.alignment || positionToAlignment(cfg.position) || DEFAULT_ALIGNMENT,
            animation: normalizeAnimation(cfg.animation) || normalizeAnimation(cfg.transition_animation) || DEFAULT_ANIMATION,
        };
        applyOverlayConfig();
    } catch (err) {
        console.warn('Config load failed:', err);
    }
}

function positionToAlignment(position) {
    const map = {
        TopLeft: 'top-left',
        TopRight: 'top-right',
        BottomLeft: 'bottom-left',
        BottomRight: 'bottom-right',
    };
    return typeof position === 'string' ? map[position] : '';
}

function normalizeAnimation(animation) {
    return animation === 'smooth' || animation === 'swipe' ? animation : '';
}

function applyOverlayConfig() {
    const root = document.documentElement;
    const bg = overlayConfig.background_color || '#1a1a1e';
    const text = overlayConfig.text_color || '#ffffff';
    const accent = overlayConfig.accent_color || '#4a90e2';
    const radius = overlayConfig.border_radius_px ?? 0;
    const colorMode = overlayConfig.color_mode === 'manual' ? 'manual' : 'auto';

    root.dataset.colorMode = colorMode;
    root.style.setProperty('--bg-color', bg);
    root.style.setProperty('--text-primary', text);
    if (colorMode === 'manual') {
        root.style.setProperty('--accent-color', accent);
        root.style.setProperty('--accent-glow', `${accent}66`);
    }
    root.style.setProperty('--border-radius-main', `${radius}px`);
    root.style.setProperty('--border-radius-sm', `${Math.max(0, radius - 2)}px`);

    const title = document.getElementById('w-title');
    const artist = document.getElementById('w-artist');
    if (title) title.style.fontSize = `${overlayConfig.font_size_px || 14}px`;
    if (artist) artist.style.display = overlayConfig.show_artist ? '' : 'none';

    const artBox = document.getElementById('w-art-box');
    if (artBox) artBox.style.display = overlayConfig.show_thumbnail ? '' : 'none';

    const progress = document.querySelector('.progress-container');
    if (progress) {
        progress.style.display = overlayConfig.show_progress || overlayConfig.show_time ? '' : 'none';
        progress.querySelectorAll('#w-time, #w-duration').forEach((el) => {
            el.style.display = overlayConfig.show_time ? '' : 'none';
        });
        const bar = progress.querySelector('.prog-bg');
        if (bar) bar.style.display = overlayConfig.show_progress ? '' : 'none';
    }
}

function connect() {
    ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => updateUI(normalizeSongInfo(JSON.parse(e.data)));
    ws.onclose   = ()  => setTimeout(connect, 2000);
    ws.onerror   = (err) => { console.error('WS error:', err); ws.close(); };
}

function normalizeSongInfo(data) {
    if ('position_secs' in data || 'length_secs' in data || 'album_art_base64' in data) {
        const title = data.title || '';
        const artist = data.artist || '';
        const albumArt = data.album_art_base64 || '';

        return {
            title,
            artist,
            status: data.is_playing ? 'PLAYING' : 'PAUSED',
            position: data.position_secs || 0,
            duration: data.length_secs || 0,
            layout: overlayConfig.layout || DEFAULT_LAYOUT,
            alignment: overlayConfig.alignment || DEFAULT_ALIGNMENT,
            animation: overlayConfig.animation || DEFAULT_ANIMATION,
            track_id: `${title} - ${artist}`,
            has_thumbnail: !!albumArt,
            thumbnail_src: albumArt ? `data:image/png;base64,${albumArt}` : '',
        };
    }

    return data;
}
function updateUI(data) {
    applyOverlayConfig();

    const wasPlaying = state.isPlaying;
    state.isPlaying = (data.status === 'PLAYING');
    state.duration  = data.duration;
    let songJustChanged = false;
    if (state.currentTitle === undefined) {
        songJustChanged = true;
        state.isExpanded = true;
    } else if (state.currentTitle !== data.title) {
        const wrapper = document.getElementById('widget-wrapper');
        if (wrapper) {
            wrapper.classList.remove('song-changed');
            void wrapper.offsetWidth;
            wrapper.classList.add('song-changed');
        }
        songJustChanged = true;
        state.isExpanded = true;
    }
    state.currentTitle = data.title;

    if (songJustChanged) {
        clearTimeout(state.dynamicTimer);
        state.dynamicTimer = setTimeout(() => {
            state.isExpanded = false;
            const w = document.getElementById('widget-wrapper');
            if (w) w.classList.remove('is-expanded');
        }, 8000);
    }
    const titleEl = document.getElementById('w-title');
    const artistEl = document.getElementById('w-artist');
    
    if (titleEl) titleEl.innerText = data.title;
    if (artistEl) artistEl.innerText = data.artist;
    const wrapper = document.getElementById('widget-wrapper');
    if (wrapper) {
        const isSongChanged = wrapper.classList.contains('song-changed');
        wrapper.className = `widget-wrapper layout-${data.layout} pos-${data.alignment} anim-${data.animation}`;
        if (state.isPlaying) {
            wrapper.classList.add('is-playing');
        }
        if (isSongChanged) {
            wrapper.classList.add('song-changed');
        }
        if (state.isExpanded) {
            wrapper.classList.add('is-expanded');
        }
    }
    document.body.className = `align-${data.alignment}`;
    if (data.position !== state.serverPosition || state.isPlaying !== wasPlaying) {
        state.serverPosition = data.position;
        state.localPosition  = data.position;
        state.lastSyncTime   = performance.now();
    }

    document.getElementById('w-duration').innerText = formatTime(state.duration);
    const sameTrack = data.track_id && data.track_id === state.currentTrackId;
    if (data.thumbnail_src && data.track_id !== state.currentTrackId) {
        state.currentTrackId = data.track_id;
        const img = document.getElementById('w-art');
        const artBox = document.getElementById('w-art-box');
        artBox.classList.add('loading');
        img.style.display = 'none';
        img.onload = () => {
            if (state.currentTrackId !== data.track_id) return;
            artBox.classList.remove('loading');
            img.style.display = 'block';
            extractAccentColor(img);
        };
        img.onerror = () => {
            if (state.currentTrackId !== data.track_id) return;
            artBox.classList.remove('loading');
            state.currentTrackId = '';
            img.removeAttribute('src');
            img.style.display = 'none';
            resetAccentColor();
        };
        img.src = data.thumbnail_src;
    } else if (data.has_thumbnail && data.track_id !== state.currentTrackId) {
        state.currentTrackId = data.track_id;
        const img = document.getElementById('w-art');
        const artBox = document.getElementById('w-art-box');
        img.crossOrigin = 'Anonymous';
        
        let retryCount = 0;
        const maxRetries = 5;
        
        const loadImg = () => {
            if (state.currentTrackId !== data.track_id) return;
            artBox.classList.add('loading');
            img.style.display = 'none';
            img.src = `http://localhost:8764/thumbnail?id=${encodeURIComponent(data.track_id)}&retry=${retryCount}&t=${Date.now()}`;
        };
        
        const handleError = () => {
            if (state.currentTrackId !== data.track_id) return;
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(loadImg, 1000);
            } else {
                artBox.classList.remove('loading');
                state.currentTrackId = '';
                img.removeAttribute('src');
                img.style.display = 'none';
                resetAccentColor();
            }
        };

        img.onload = () => {
            if (state.currentTrackId !== data.track_id) return;
            if (img.naturalWidth === 0) {
                handleError();
                return;
            }
            artBox.classList.remove('loading');
            img.style.display = 'block';
            extractAccentColor(img);
        };
        
        img.onerror = handleError;
        
        loadImg();
    } else if (!data.has_thumbnail && state.currentTrackId !== '' && !sameTrack) {
        state.currentTrackId = '';
        const img = document.getElementById('w-art');
        img.removeAttribute('src');
        img.style.display = 'none';
        document.getElementById('w-art-box').classList.remove('loading');
        resetAccentColor();
    }
}
function tick() {
    if (state.isPlaying && state.duration > 0) {
        const delta = (performance.now() - state.lastSyncTime) / 1000;
        state.localPosition = Math.min(state.serverPosition + delta, state.duration);
    }
    updateProgressBar(state.localPosition, state.duration);
    requestAnimationFrame(tick);
}
loadConfig().finally(connect);
requestAnimationFrame(tick);
