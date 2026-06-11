const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_URL = `${wsProtocol}//${window.location.host}/ws`;

export const state = {
    currentThumbnail: "",
    currentTrackId: "",
    serverPosition: 0,
    localPosition: 0,
    duration: 0,
    lastSyncTime: performance.now(),
    isPlaying: false,
    swipeLock: false,
    dynamicTimer: null,
};

export function formatTime(secs) {
    if (!secs || secs < 0) return "0:00";
    const total = Math.floor(secs);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function updateProgressBar(position, total) {
    const ratio = total > 0 ? Math.min(position / total, 1.0) : 0;
    const fill = document.getElementById('w-prog-fill');
    if (fill) fill.style.width = `${ratio * 100}%`;
    const time = document.getElementById('w-time');
    if (time) time.innerText = formatTime(position);
}
