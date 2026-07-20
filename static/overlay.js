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
let isVisible = false;


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


    if (currentTheme) {
        document.body.classList.remove(`theme-${currentTheme}`);
    }
    currentTheme = cfg.theme || 'frosted_glass';
    document.body.classList.add(`theme-${currentTheme}`);


    artworkWrap.style.display = cfg.show_thumbnail ? '' : 'none';
    artistName.parentElement.style.display = cfg.show_artist ? '' : 'none';
    progressCont.parentElement.style.display = cfg.show_progress ? '' : 'none';
    timeDisplay.parentElement.style.display = cfg.show_time ? '' : 'none';


    const positions = {
        TopLeft: ['flex-start', 'flex-start'],
        TopRight: ['flex-end', 'flex-start'],
        BottomLeft: ['flex-start', 'flex-end'],
        BottomRight: ['flex-end', 'flex-end'],
    };
    const [jc, ai] = positions[cfg.position] || positions.BottomRight;
    document.body.style.justifyContent = jc;
    document.body.style.alignItems = ai;


    if (customStyleEl) customStyleEl.remove();
    if (cfg.custom_css && cfg.custom_css.trim()) {
        customStyleEl = document.createElement('style');
        customStyleEl.textContent = cfg.custom_css;
        document.head.appendChild(customStyleEl);
    }


    transitionAnim = cfg.transition_animation || 'slide_up';
}

function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
        const songInfo = JSON.parse(event.data);
        updateOverlay(songInfo);
    };

    ws.onclose = () => setTimeout(connectWs, 2000);
}


const fmt = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

function triggerSongChange() {

    overlay.classList.remove('song-change');
    void overlay.offsetWidth;
    overlay.classList.add('song-change');

    setTimeout(() => overlay.classList.remove('song-change'), 800);
}

function setArt(base64) {
    const src = base64 ? `data:image/png;base64,${base64}` : '';
    albumArt.src = src;
    ambientArt.src = src;
}


function updateOverlay(song) {

    if (!song.title) {
        if (isVisible) {
            overlay.classList.add('state-hidden');
            overlay.classList.remove('playing', 'song-change');
            isVisible = false;
        }
        return;
    }


    if (!isVisible) {
        overlay.classList.remove('state-hidden');
        isVisible = true;
    }


    overlay.classList.toggle('playing', !!song.is_playing);


    const newTitle = song.title || '';
    const songChanged = newTitle !== lastTitle;

    if (songChanged) {
        songTitle.textContent = song.title || 'Unknown Title';
        artistName.textContent = song.artist || 'Unknown Artist';
        setArt(song.album_art_base64);

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

    currentTimeEl.textContent = fmt(song.position_secs);
    totalTimeEl.textContent = fmt(song.length_secs);

    if (song.length_secs > 0) {
        progressBar.style.width = `${(song.position_secs / song.length_secs) * 100}%`;
    } else {
        progressBar.style.width = '0%';
    }
}
