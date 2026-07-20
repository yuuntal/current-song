import { state } from './core.js';

let canvas = null;
let ctx = null;
let audioCtx = null;
let analyser = null;
let dataArray = null;
let source = null;
let stream = null;
let animationFrameId = null;

const MAX_BARS = 128;
const barHeights = new Float32Array(MAX_BARS).fill(0);
const targetHeights = new Float32Array(MAX_BARS).fill(0);

async function setupAudioCapture() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        });

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
        console.warn('Audio capture failed:', e);
    }
}

function syncCanvasSize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth * dpr;
    const h = canvas.offsetHeight * dpr;
    
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
}

function draw() {
    animationFrameId = requestAnimationFrame(draw);
    if (!canvas || !ctx) return;

    syncCanvasSize();

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim() || '#4a90e2';

    const hasRealAudio = !!(analyser && dataArray && stream && stream.active);

    const minBarWidth = 3;
    const gap = 1.5;
    
    const numBars = Math.max(10, Math.min(64, Math.floor((w + gap) / (minBarWidth + gap))));
    const barWidth = (w - gap * (numBars - 1)) / numBars;

    if (hasRealAudio) {
        analyser.getByteFrequencyData(dataArray);
        for (let i = 0; i < numBars; i++) {
            const srcIdx = Math.min(
                dataArray.length - 1,
                Math.floor((i / numBars) * dataArray.length)
            );
            targetHeights[i] = (dataArray[srcIdx] || 0) / 255;
        }
    } else {
        for (let i = 0; i < numBars; i++) {
            targetHeights[i] = 0;
        }
    }

    const lerpSpeed = state.isPlaying ? 0.18 : 0.05;
    for (let i = 0; i < numBars; i++) {
        barHeights[i] += (targetHeights[i] - barHeights[i]) * lerpSpeed;
    }
    
    let rgb = '74, 144, 226';
    const rgbMatch = accentColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        rgb = `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
    } else if (accentColor.startsWith('#')) {
        let hex = accentColor.replace('#', '');
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        const num = parseInt(hex, 16);
        if (!isNaN(num)) {
            rgb = `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
        }
    }

    const baseAlpha = state.isPlaying ? 0.22 : 0.08;
    const peakAlpha = state.isPlaying ? 0.48 : 0.14;

    for (let i = 0; i < numBars; i++) {
        const heightMultiplier = 0.65;
        const barHeight = barHeights[i] * h * heightMultiplier;
        
        if (barHeight <= 0.5) continue;

        const x = i * (barWidth + gap);
        const y = h - barHeight;

        const gradient = ctx.createLinearGradient(x, y, x, h);
        gradient.addColorStop(0, `rgba(${rgb}, ${peakAlpha})`);
        gradient.addColorStop(1, `rgba(${rgb}, ${baseAlpha * 0.3})`);
        
        ctx.fillStyle = gradient;

        const radius = Math.min(barWidth / 2, 2);
        if (barHeight > radius * 2) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, h);
            ctx.lineTo(x, h);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    }
}

export function initVisualizer() {
    canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    syncCanvasSize();

    window.addEventListener('resize', syncCanvasSize);
    
    const wrapper = document.getElementById('widget-wrapper');
    if (wrapper && 'ResizeObserver' in window) {
        const ro = new ResizeObserver(() => syncCanvasSize());
        ro.observe(wrapper);
    }

    setupAudioCapture();
    draw();
}

export function suspendAudio() {
    if (audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend();
    }
}

export function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}
