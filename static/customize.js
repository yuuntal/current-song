// ── Theme Presets ───────────────────────────────────
const PRESETS = {
    frosted_glass: {
        label: 'Frosted Glass',
        accent_color: '#3498db',
        background_color: '#10101c',
        text_color: '#ffffff',
        border_radius_px: 16,
        blur_px: 28,
        swatch: 'linear-gradient(135deg, rgba(52,152,219,0.5), rgba(16,16,28,0.95))',
    },
    neon_glow: {
        label: 'Neon Glow',
        accent_color: '#00e5ff',
        background_color: '#040410',
        text_color: '#e0f7fa',
        border_radius_px: 16,
        blur_px: 14,
        swatch: 'linear-gradient(135deg, #00e5ff 0%, #040410 50%, #00e5ff 100%)',
    },
    vinyl: {
        label: 'Vinyl',
        accent_color: '#d4a057',
        background_color: '#1e140f',
        text_color: '#f5e6d3',
        border_radius_px: 16,
        blur_px: 10,
        swatch: 'linear-gradient(145deg, #d4a057 0%, #28200f 40%, #161008 100%)',
    },
    minimal: {
        label: 'Minimal',
        accent_color: '#ffffff',
        background_color: '#0c0c0c',
        text_color: '#ffffff',
        border_radius_px: 6,
        blur_px: 0,
        swatch: '#0c0c0c',
    },
    spotify: {
        label: 'Spotify',
        accent_color: '#1DB954',
        background_color: '#181818',
        text_color: '#ffffff',
        border_radius_px: 8,
        blur_px: 8,
        swatch: 'linear-gradient(135deg, #1DB954, #181818 60%)',
    },
    cyberpunk: {
        label: 'Cyberpunk',
        accent_color: '#ff2d95',
        background_color: '#060110',
        text_color: '#eee0ff',
        border_radius_px: 0,
        blur_px: 6,
        swatch: 'linear-gradient(135deg, #ff2d95 0%, #060110 50%, #00ffe0 100%)',
    },
    pastel_dream: {
        label: 'Pastel Dream',
        accent_color: '#a78bfa',
        background_color: '#26143e',
        text_color: '#faf5ff',
        border_radius_px: 22,
        blur_px: 30,
        swatch: 'linear-gradient(135deg, #a78bfa, #f472b6, #fb923c)',
    },
    gradient_wave: {
        label: 'Gradient Wave',
        accent_color: '#818cf8',
        background_color: '#4338ca',
        text_color: '#ffffff',
        border_radius_px: 16,
        blur_px: 10,
        swatch: 'linear-gradient(135deg, #4338ca, #7c3aed, #be185d)',
    },
};

// ── DOM ─────────────────────────────────────────────
const form = document.getElementById('config-form');
const statusDiv = document.getElementById('status');
const presetGrid = document.getElementById('preset-grid');
const positionGrid = document.getElementById('position-grid');
const previewFrame = document.getElementById('preview-frame');
const customCssEl = document.getElementById('custom-css');
const importCssEl = document.getElementById('import-css');
const clearCssBtn = document.getElementById('clear-css');
const animGrid = document.getElementById('anim-grid');

const fontSizeRange = document.getElementById('font-size');
const fontSizeLabel = document.getElementById('font-size-label');
const borderRadiusRange = document.getElementById('border-radius');
const borderRadiusLabel = document.getElementById('border-radius-label');
const blurRange = document.getElementById('blur');
const blurLabel = document.getElementById('blur-label');

const inputs = {
    accent_color: document.getElementById('accent-color'),
    background_color: document.getElementById('background-color'),
    text_color: document.getElementById('text-color'),
    font_size_px: fontSizeRange,
    border_radius_px: borderRadiusRange,
    blur_px: blurRange,
    show_thumbnail: document.getElementById('show-thumbnail'),
    show_artist: document.getElementById('show-artist'),
    show_progress: document.getElementById('show-progress'),
    show_time: document.getElementById('show-time'),
};

let selectedTheme = 'frosted_glass';
let selectedPosition = 'BottomRight';
let selectedAnimation = 'slide_up';

// ── Build Preset Grid ───────────────────────────────
Object.entries(PRESETS).forEach(([key, preset]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.dataset.theme = key;
    btn.innerHTML = `
        <div class="preset-swatch" style="background: ${preset.swatch}"></div>
        <span>${preset.label}</span>
    `;
    btn.addEventListener('click', () => selectPreset(key));
    presetGrid.appendChild(btn);
});

function selectPreset(key) {
    selectedTheme = key;
    const p = PRESETS[key];

    inputs.accent_color.value = p.accent_color;
    inputs.background_color.value = p.background_color;
    inputs.text_color.value = p.text_color;
    inputs.border_radius_px.value = p.border_radius_px;
    borderRadiusLabel.textContent = `${p.border_radius_px}px`;
    inputs.blur_px.value = p.blur_px;
    blurLabel.textContent = `${p.blur_px}px`;

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-theme="${key}"]`).classList.add('active');
}

// ── Position Grid ───────────────────────────────────
positionGrid.querySelectorAll('.pos-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedPosition = btn.dataset.pos;
        positionGrid.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ── Animation Grid ──────────────────────────────────
animGrid.querySelectorAll('.anim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedAnimation = btn.dataset.anim;
        animGrid.querySelectorAll('.anim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ── Range Sliders ───────────────────────────────────
fontSizeRange.addEventListener('input', () => {
    fontSizeLabel.textContent = `${fontSizeRange.value}px`;
});
borderRadiusRange.addEventListener('input', () => {
    borderRadiusLabel.textContent = `${borderRadiusRange.value}px`;
});
blurRange.addEventListener('input', () => {
    blurLabel.textContent = `${blurRange.value}px`;
});

// ── Custom CSS Import ───────────────────────────────
importCssEl.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        customCssEl.value = ev.target.result;
    };
    reader.readAsText(file);
});

clearCssBtn.addEventListener('click', () => {
    customCssEl.value = '';
});

// ── Load Config ─────────────────────────────────────
fetch('/api/config')
    .then(res => res.json())
    .then(config => {
        inputs.accent_color.value = config.accent_color;
        inputs.background_color.value = config.background_color;
        inputs.text_color.value = config.text_color;

        inputs.font_size_px.value = config.font_size_px;
        fontSizeLabel.textContent = `${config.font_size_px}px`;

        inputs.border_radius_px.value = config.border_radius_px ?? 14;
        borderRadiusLabel.textContent = `${config.border_radius_px ?? 14}px`;

        inputs.blur_px.value = config.blur_px ?? 18;
        blurLabel.textContent = `${config.blur_px ?? 18}px`;

        inputs.show_thumbnail.checked = config.show_thumbnail;
        inputs.show_artist.checked = config.show_artist;
        inputs.show_progress.checked = config.show_progress;
        inputs.show_time.checked = config.show_time;

        customCssEl.value = config.custom_css || '';

        // Theme
        selectedTheme = config.theme || 'frosted_glass';
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-theme="${selectedTheme}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Position
        selectedPosition = (typeof config.position === 'string') ? config.position : 'BottomRight';
        positionGrid.querySelectorAll('.pos-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.pos === selectedPosition);
        });

        // Animation
        selectedAnimation = config.transition_animation || 'slide_up';
        animGrid.querySelectorAll('.anim-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.anim === selectedAnimation);
        });
    });

// ── Save Config ─────────────────────────────────────
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const newConfig = {
        theme: selectedTheme,
        accent_color: inputs.accent_color.value,
        background_color: inputs.background_color.value,
        text_color: inputs.text_color.value,
        font_size_px: parseInt(inputs.font_size_px.value),
        border_radius_px: parseInt(inputs.border_radius_px.value),
        blur_px: parseInt(inputs.blur_px.value),
        show_thumbnail: inputs.show_thumbnail.checked,
        show_artist: inputs.show_artist.checked,
        show_progress: inputs.show_progress.checked,
        show_time: inputs.show_time.checked,
        monitor_index: 0,
        position: selectedPosition,
        custom_css: customCssEl.value,
        transition_animation: selectedAnimation,
    };

    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
    })
        .then(res => {
            if (res.ok) {
                statusDiv.textContent = '✓ Saved';
                statusDiv.style.color = '#4ade80';
                previewFrame.src = previewFrame.src;
                setTimeout(() => statusDiv.textContent = '', 2500);
            } else {
                statusDiv.textContent = '✕ Error saving';
                statusDiv.style.color = '#f87171';
            }
        });
});
