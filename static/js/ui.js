import { state, WS_URL, formatTime, updateProgressBar } from './core.js';
import { extractAccentColor, resetAccentColor } from './color.js';
import { initVisualizer, suspendAudio, resumeAudio } from './visualizer.js';

const DEFAULT_LAYOUT = 'dynamic';
const DEFAULT_ALIGNMENT = 'bottom-right';
const DEFAULT_ANIMATION = 'swipe';
const DYNAMIC_MORPH_DURATION_MS = 360;
const DYNAMIC_MORPH_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

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
    collapse_delay_secs: 3,
    text_scroll_direction: 'left',
};
let ws;
let hasRendered = false;
let activeMorphAnimations = [];

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
    const overflowMode = overlayConfig.text_overflow_mode === 'ellipsis' ? 'ellipsis' : 'marquee';
    const scrollDirection = overlayConfig.text_scroll_direction === 'right' ? 'right' : 'left';

    root.dataset.colorMode = colorMode;
    root.dataset.textOverflowMode = overflowMode;
    root.dataset.textScrollDirection = scrollDirection;
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

// function clamp(value, min, max) {
//     return Math.max(min, Math.min(value, max));
// }

function currentLayoutIsDynamic() {
    const wrapper = document.getElementById('widget-wrapper');
    return !!wrapper && wrapper.classList.contains('layout-dynamic');
}

function captureDynamicMorph() {
    const selectors = [
        '#w-art-box',
        '.info-box',
        '#w-title',
        '#w-artist',
        '.progress-container',
        '#w-prog-bg',
    ];
    const rects = new Map();

    selectors.forEach((selector) => {
        const el = document.querySelector(selector);
        if (!el) return;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const rect = el.getBoundingClientRect();
        rects.set(el, rect);
    });

    return rects;
}

function animateDynamicMorph(beforeRects) {
    if (!beforeRects || beforeRects.size === 0) return;

    activeMorphAnimations.forEach((animation) => animation.cancel());
    activeMorphAnimations = [];

    requestAnimationFrame(() => {
        beforeRects.forEach((first, el) => {
            if (!document.contains(el)) return;

            const last = el.getBoundingClientRect();
            const dx = first.left - last.left;
            const dy = first.top - last.top;
            const scaleX = last.width > 0 ? first.width / last.width : 1;
            const scaleY = last.height > 0 ? first.height / last.height : 1;
            const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
            const resized = Math.abs(scaleX - 1) > 0.02 || Math.abs(scaleY - 1) > 0.02;

            if (!moved && !resized) return;

            const animation = el.animate(
                [
                    {
                        transformOrigin: 'top left',
                        transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
                    },
                    {
                        transformOrigin: 'top left',
                        transform: 'translate(0, 0) scale(1, 1)',
                    },
                ],
                {
                    duration: DYNAMIC_MORPH_DURATION_MS,
                    easing: DYNAMIC_MORPH_EASING,
                    fill: 'both',
                },
            );

            animation.finished
                .catch(() => {})
                .finally(() => {
                    animation.cancel();
                    activeMorphAnimations = activeMorphAnimations.filter((item) => item !== animation);
                });
            activeMorphAnimations.push(animation);
        });
    });
}

// function measureTextWidth(el, maxWidth) {
//     if (!el || window.getComputedStyle(el).display === 'none') return 0;
//     const previousMaxWidth = el.style.maxWidth;
//     const previousWidth = el.style.width;
//     el.style.width = 'auto';
//     el.style.maxWidth = 'none';
//     const width = Math.ceil(Math.max(el.scrollWidth, el.getBoundingClientRect().width));
//     el.style.maxWidth = previousMaxWidth;
//     el.style.width = previousWidth;
//     return clamp(width, 0, maxWidth);
// }

function syncDynamicLayout(layout = overlayConfig.layout || DEFAULT_LAYOUT) {
    const wrapper = document.getElementById('widget-wrapper');
    const title   = document.getElementById('w-title');
    const artist  = document.getElementById('w-artist');

    if (!wrapper) return;


    const canvasCtx = (() => {
        if (!syncDynamicLayout._canvas) {
            syncDynamicLayout._canvas = document.createElement('canvas');
        }
        return syncDynamicLayout._canvas.getContext('2d');
    })();

    const measureText = (el) => {
        if (!el || window.getComputedStyle(el).display === 'none') return 0;
        const cs = window.getComputedStyle(el);
        canvasCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return Math.ceil(canvasCtx.measureText(el.textContent || '').width);
    };

    const titleW  = measureText(title);
    const artistW = measureText(artist);
    const hasArtist = artistW > 0 && overlayConfig.show_artist !== false;

    let newWidth;
    if (state.isExpanded) {
        const contentW = Math.max(titleW, hasArtist ? artistW : 0);
        newWidth = `${Math.max(104 + contentW + 16, 180)}px`;
    } else {
        const contentW = titleW + (hasArtist ? 12 + artistW : 0);
        newWidth = `${Math.max(16 + contentW, 80)}px`;
    }

    if (wrapper.style.width !== newWidth) {
        wrapper.style.width = newWidth;
    }


    if (title)  { title.style.removeProperty('max-width');  title.style.removeProperty('width'); }
    if (artist) { artist.style.removeProperty('max-width'); artist.style.removeProperty('width'); }
}

function syncTextOverflow() {

    [document.getElementById('w-title'), document.getElementById('w-artist')].forEach((el) => {
        if (!el) return;

        delete el.dataset.marqueeOriginal;
        el.classList.remove('text-scroll-active');
        el.style.removeProperty('--text-scroll-offset');
        el.style.removeProperty('--text-scroll-duration');

        if (el.children.length > 0 && el.dataset.marqueeOriginal !== undefined) {
            el.textContent = el.dataset.marqueeOriginal;
        }
    });
}

function collapseDynamicLayout() {
    if (!currentLayoutIsDynamic() || !state.isExpanded) return;

    const before = captureDynamicMorph();
    state.isExpanded = false;

    const wrapper = document.getElementById('widget-wrapper');
    if (wrapper) wrapper.classList.remove('is-expanded');

    syncDynamicLayout('dynamic');
    syncTextOverflow();
    animateDynamicMorph(before);
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
    const wasPlaying = state.isPlaying;
    const layout = data.layout || DEFAULT_LAYOUT;
    const alignment = data.alignment || DEFAULT_ALIGNMENT;
    const animation = data.animation || DEFAULT_ANIMATION;
    const previousTitle = state.currentTitle;
    const previousArtist = state.currentArtist;
    const songJustChanged = previousTitle === undefined || previousTitle !== data.title;
    const nextExpanded = layout === 'dynamic' ? (songJustChanged ? true : !!state.isExpanded) : false;
    const shouldCaptureMorph =
        hasRendered &&
        currentLayoutIsDynamic() &&
        layout === 'dynamic' &&
        (songJustChanged || !!state.isExpanded !== nextExpanded);
    const beforeMorph = shouldCaptureMorph ? captureDynamicMorph() : null;

    applyOverlayConfig();

    const prevIsPlaying = state.isPlaying;
    state.isPlaying = (data.status === 'PLAYING');
    if (state.isPlaying !== prevIsPlaying) {
        state.isPlaying ? resumeAudio() : suspendAudio();
    }
    state.duration  = data.duration;
    state.isExpanded = nextExpanded;

    const baseDelay = overlayConfig.collapse_delay_secs || 1.5;
    const typewriterDuration = Math.max(0.4, Math.min(1.2, baseDelay * 0.35));

    const triggerTransition = songJustChanged && (previousTitle !== undefined || window.parent !== window);

    if (triggerTransition) {
        const wrapper = document.getElementById('widget-wrapper');
        if (wrapper) {
            wrapper.classList.remove('song-changed');
            void wrapper.offsetWidth;
            wrapper.classList.add('song-changed');

            triggerSmearAnimation('title', 0, 520, 28, 12, 30);
            triggerSmearAnimation('artist', 50, 520, 20, 8, 20);

            const removeDelay = Math.max(typewriterDuration * 1000, 600);
            setTimeout(() => {
                wrapper.classList.remove('song-changed');
            }, removeDelay);
        }
    }
    state.currentTitle = data.title;
    state.currentArtist = data.artist;

    if (layout === 'dynamic' && songJustChanged) {
        clearTimeout(state.dynamicTimer);
        state.dynamicTimer = setTimeout(collapseDynamicLayout, (overlayConfig.collapse_delay_secs ?? 3) * 1000);
    } else if (layout !== 'dynamic') {
        clearTimeout(state.dynamicTimer);
        state.dynamicTimer = null;
        state.isExpanded = false;
    }

    const titleEl = document.getElementById('w-title');
    const artistEl = document.getElementById('w-artist');
    
    if (titleEl) {
        if (triggerTransition) {
            transitionTextTypewriter(titleEl, data.title, typewriterDuration);
        } else {
            // If we are already typewriting this exact title, do not interrupt it!
            if (titleEl.typewriterInterval && titleEl.typewriterTarget === data.title) {
                // Let the typewriter continue
            } else {
                if (titleEl.typewriterInterval) {
                    clearInterval(titleEl.typewriterInterval);
                    titleEl.typewriterInterval = null;
                }
                titleEl.innerText = data.title;
            }
        }
    }
    if (artistEl) {
        const nextArtist = data.artist || '';
        if (songJustChanged && (previousArtist !== undefined || window.parent !== window)) {
            transitionTextTypewriter(artistEl, nextArtist, typewriterDuration);
        } else {
            // If we are already typewriting this exact artist, do not interrupt it!
            if (artistEl.typewriterInterval && artistEl.typewriterTarget === nextArtist) {
                // Let the typewriter continue
            } else {
                if (artistEl.typewriterInterval) {
                    clearInterval(artistEl.typewriterInterval);
                    artistEl.typewriterInterval = null;
                }
                artistEl.innerText = nextArtist;
            }
        }
    }
    const wrapper = document.getElementById('widget-wrapper');
    if (wrapper) {
        const isSongChanged = wrapper.classList.contains('song-changed');
        wrapper.className = `widget-wrapper layout-${layout} pos-${alignment} anim-${animation}`;
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
    document.body.className = `align-${alignment}`;
    syncDynamicLayout(layout);
    syncTextOverflow();
    animateDynamicMorph(beforeMorph);

    // Initialize visualizer canvas on first render
    if (!hasRendered) {
        initVisualizer();
    }
    hasRendered = true;

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
      
        if (!img.getAttribute('src')) {
            img.style.display = 'none';
        }
      
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
          
            if (!img.getAttribute('src')) {
                img.style.display = 'none';
            }
          
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

if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => {
        syncDynamicLayout();
        syncTextOverflow();
    });
    setTimeout(() => {
        const title = document.getElementById('w-title');
        const artist = document.getElementById('w-artist');
        if (title) resizeObserver.observe(title);
        if (artist) resizeObserver.observe(artist);
    }, 100);
}

window.addEventListener('resize', () => {
    syncDynamicLayout();
    syncTextOverflow();
});

loadConfig().finally(connect);
requestAnimationFrame(tick);

function transitionTextTypewriter(element, targetText, durationSecs) {
    if (!element) return;
    if (element.typewriterInterval) {
        clearInterval(element.typewriterInterval);
    }

    const startText = (element.innerText || '').trim();
    const target = (targetText || '').trim();
    if (startText === target) {
        element.typewriterTarget = null;
        return;
    }

    element.typewriterTarget = target;

    let commonLen = 0;
    const minLen = Math.min(startText.length, target.length);
    while (commonLen < minLen && startText.charAt(commonLen) === target.charAt(commonLen)) {
        commonLen++;
    }
    const commonPrefix = startText.substring(0, commonLen);


    const deleteCount = startText.length - commonLen;

    const insertCount = target.length - commonLen;
    const totalSteps = deleteCount + insertCount;

    console.log(`[Typewriter] Start: "${startText}" -> Target: "${target}"`);
    console.log(`[Typewriter] Common prefix: "${commonPrefix}" | Deletions: ${deleteCount} | Insertions: ${insertCount}`);

    if (totalSteps === 0) {
        element.innerText = target;
        element.typewriterTarget = null;
        syncDynamicLayout();
        syncTextOverflow();
        return;
    }

    const durationMs = (durationSecs || 0.55) * 1000;
    const speedMs = durationMs / totalSteps;
    let step = 0;

    element.typewriterInterval = setInterval(() => {
        if (step < deleteCount) {
            // del
            const nextText = startText.substring(0, startText.length - step - 1);
            element.innerText = nextText;
            console.log(`[Typewriter] Deleting: "${nextText}"`);
        } else {
            // type
            const insertStep = step - deleteCount;
            const nextText = commonPrefix + target.substring(commonLen, commonLen + insertStep + 1);
            element.innerText = nextText;
            console.log(`[Typewriter] Typing: "${nextText}"`);
        }
        step++;
        syncDynamicLayout();

        if (step >= totalSteps) {
            clearInterval(element.typewriterInterval);
            element.typewriterInterval = null;
            element.typewriterTarget = null;
            console.log(`[Typewriter] Completed.`);
            syncTextOverflow();
        }
    }, speedMs);
}

const activeSmearAnimations = {
    title: null,
    artist: null,
};

function triggerSmearAnimation(prefix, delayMs, durationMs, maxBlur, maxOffset, maxWarp) {
    if (activeSmearAnimations[prefix]) {
        cancelAnimationFrame(activeSmearAnimations[prefix]);
        activeSmearAnimations[prefix] = null;
    }

    const blurElem = document.getElementById(`${prefix}-blur`);
    const offsetRed = document.getElementById(`${prefix}-offset-red`);
    const offsetBlue = document.getElementById(`${prefix}-offset-blue`);
    const displaceElem = document.getElementById(`${prefix}-displace`);

    if (!blurElem || !offsetRed || !offsetBlue || !displaceElem) return;

    blurElem.setAttribute('stdDeviation', '0 0');
    offsetRed.setAttribute('dx', '0');
    offsetBlue.setAttribute('dx', '0');
    displaceElem.setAttribute('scale', '0');

    let startTime = null;

    function step(timestamp) {
        if (!startTime) {
            startTime = timestamp;
        }

        const elapsed = timestamp - startTime;

        if (elapsed < delayMs) {
            activeSmearAnimations[prefix] = requestAnimationFrame(step);
            return;
        }

        const animElapsed = elapsed - delayMs;
        const progress = Math.min(animElapsed / durationMs, 1);

        const ease = 1 - Math.pow(1 - progress, 4);

        const currentBlur = maxBlur * (1 - ease);
        const currentOffset = maxOffset * (1 - ease);
        const currentWarp = maxWarp * (1 - ease);

        blurElem.setAttribute('stdDeviation', `${currentBlur} 0`);
        offsetRed.setAttribute('dx', `${-currentOffset}`);
        offsetBlue.setAttribute('dx', `${currentOffset}`);
        displaceElem.setAttribute('scale', `${currentWarp}`);

        if (progress < 1) {
            activeSmearAnimations[prefix] = requestAnimationFrame(step);
        } else {
            blurElem.setAttribute('stdDeviation', '0 0');
            offsetRed.setAttribute('dx', '0');
            offsetBlue.setAttribute('dx', '0');
            displaceElem.setAttribute('scale', '0');
            activeSmearAnimations[prefix] = null;
        }
    }

    activeSmearAnimations[prefix] = requestAnimationFrame(step);
}



