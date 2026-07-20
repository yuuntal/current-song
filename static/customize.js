const form = document.getElementById('config-form');
const statusEl = document.getElementById('status');
const previewFrame = document.getElementById('preview-frame');
const resetDefaultsButton = document.getElementById('reset-defaults');

const positionGrid = document.getElementById('position-grid');
const colorModeGrid = document.getElementById('color-mode-grid');
const animationInput = null;
const fontSizeInput = document.getElementById('font-size');
const collapseDelayInput = document.getElementById('collapse-delay');
const backgroundInput = document.getElementById('background-color');
const textInput = document.getElementById('text-color');
const accentInput = document.getElementById('accent-color');
const accentField = document.getElementById('accent-field');
const radiusInput = document.getElementById('border-radius');
const showThumbnailInput = document.getElementById('show-thumbnail');
const showArtistInput = document.getElementById('show-artist');
const showProgressInput = document.getElementById('show-progress');
const showTimeInput = document.getElementById('show-time');

const textTransitionSelect = document.getElementById('text-transition');

const DEFAULT_CONFIG = {
    theme: 'minimal',
    layout: 'dynamic',
    alignment: 'bottom-right',
    animation: 'swipe',
    transition_animation: 'swipe',
    show_thumbnail: true,
    show_artist: true,
    show_progress: true,
    show_time: true,
    monitor_index: 0,
    position: 'BottomRight',
    accent_color: '#4a90e2',
    color_mode: 'auto',
    background_color: '#1a1a1e',
    text_color: '#ffffff',
    font_size_px: 14,
    collapse_delay_secs: 3,
    border_radius_px: 0,
    blur_px: 0,
    custom_css: '',
    text_transition: 'rotating',
    text_transition_settings: {
        staggerFrom: 'last',
        staggerDuration: 25
    }
};

let config = { ...DEFAULT_CONFIG };

const positionByAlignment = {
    'top-left': 'TopLeft',
    'top-right': 'TopRight',
    'bottom-left': 'BottomLeft',
    'bottom-right': 'BottomRight',
};

const alignmentByPosition = Object.fromEntries(
    Object.entries(positionByAlignment).map(([alignment, position]) => [position, alignment])
);

function setActive(container, attr, value) {
    container.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset[attr] === value);
    });
}

function selected(container, attr, fallback) {
    return container.querySelector(`button.active`)?.dataset[attr] || fallback;
}

function render() {
    const alignment = config.alignment || alignmentByPosition[config.position] || DEFAULT_CONFIG.alignment;

    setActive(positionGrid, 'align', alignment);
    setActive(colorModeGrid, 'mode', config.color_mode || DEFAULT_CONFIG.color_mode);

    fontSizeInput.value = config.font_size_px ?? DEFAULT_CONFIG.font_size_px;
    collapseDelayInput.value = config.collapse_delay_secs ?? DEFAULT_CONFIG.collapse_delay_secs;
    backgroundInput.value = config.background_color || DEFAULT_CONFIG.background_color;
    textInput.value = config.text_color || DEFAULT_CONFIG.text_color;
    accentInput.value = config.accent_color || DEFAULT_CONFIG.accent_color;
    radiusInput.value = config.border_radius_px ?? DEFAULT_CONFIG.border_radius_px;
    showThumbnailInput.checked = config.show_thumbnail ?? DEFAULT_CONFIG.show_thumbnail;
    showArtistInput.checked = config.show_artist ?? DEFAULT_CONFIG.show_artist;
    showProgressInput.checked = config.show_progress ?? DEFAULT_CONFIG.show_progress;
    showTimeInput.checked = config.show_time ?? DEFAULT_CONFIG.show_time;
    textTransitionSelect.value = config.text_transition || DEFAULT_CONFIG.text_transition;
    
    syncAccentInput();
    syncTextTransition();
}

async function syncTextTransition() {
    if (!textTransitionSelect) return;
    const selectedAnim = textTransitionSelect.value;
    const configContainer = document.getElementById('text-transition-configs');
    if (!configContainer) return;
    
    configContainer.innerHTML = '';
    
    try {
        const module = await import(`/js/transitions/${selectedAnim}.js`);
        if (module.schema && module.schema.length > 0) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section split';
            
            module.schema.forEach(field => {
                const label = document.createElement('label');
                const span = document.createElement('span');
                span.innerText = field.label;
                label.appendChild(span);
                
                let input;
                if (field.type === 'select') {
                    input = document.createElement('select');
                    input.style.cssText = "width: 100%; padding: 4px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;";
                    field.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        option.innerText = opt.label;
                        input.appendChild(option);
                    });
                } else {
                    input = document.createElement('input');
                    input.type = field.type;
                    input.style.cssText = "width: 100%; padding: 4px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;";
                    if (field.min !== undefined) input.min = field.min;
                    if (field.max !== undefined) input.max = field.max;
                    if (field.step !== undefined) input.step = field.step;
                }
                
                input.name = field.name;
                
                const settings = config.text_transition_settings || {};
                const defaultSettings = DEFAULT_CONFIG.text_transition_settings || {};
                const val = settings[field.name] !== undefined 
                    ? settings[field.name] 
                    : (defaultSettings[field.name] !== undefined ? defaultSettings[field.name] : field.default);
                
                if (val !== undefined) {
                    if (input.type === 'checkbox') {
                        input.checked = !!val;
                    } else {
                        input.value = val;
                    }
                }
                
                label.appendChild(input);
                sectionDiv.appendChild(label);
            });
            
            configContainer.appendChild(sectionDiv);
        }
    } catch (e) {
        console.error(`Failed to load schema for transition: ${selectedAnim}`, e);
    }
}

textTransitionSelect.addEventListener('change', syncTextTransition);

function syncAccentInput() {
    const colorMode = selected(colorModeGrid, 'mode', config.color_mode || DEFAULT_CONFIG.color_mode);
    const isManual = colorMode === 'manual';
    accentInput.disabled = !isManual;
    accentField.classList.toggle('is-disabled', !isManual);
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            config = { ...DEFAULT_CONFIG, ...(await res.json()) };
        }
    } finally {
        render();
    }
}


positionGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-align]');
    if (!button) return;
    setActive(positionGrid, 'align', button.dataset.align);
});

colorModeGrid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-mode]');
    if (!button) return;
    setActive(colorModeGrid, 'mode', button.dataset.mode);
    syncAccentInput();
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    await saveConfig(readFormConfig(), 'Saved');
});

resetDefaultsButton.addEventListener('click', async () => {
    await saveConfig({ ...DEFAULT_CONFIG }, 'Reset');
});

function readFormConfig() {
    const alignment = selected(positionGrid, 'align', DEFAULT_CONFIG.alignment);
    const selectedAnim = textTransitionSelect.value;

    return {
        ...config,
        layout: 'dynamic',
        alignment,
        animation: 'swipe',
        transition_animation: 'swipe',
        position: positionByAlignment[alignment] || DEFAULT_CONFIG.position,
        accent_color: accentInput.value,
        color_mode: selected(colorModeGrid, 'mode', DEFAULT_CONFIG.color_mode),
        background_color: backgroundInput.value,
        text_color: textInput.value,
        font_size_px: Number(fontSizeInput.value) || DEFAULT_CONFIG.font_size_px,
        collapse_delay_secs: Number(collapseDelayInput.value) || DEFAULT_CONFIG.collapse_delay_secs,
        border_radius_px: Number(radiusInput.value) || 0,
        blur_px: 0,
        show_thumbnail: showThumbnailInput.checked,
        show_artist: showArtistInput.checked,
        show_progress: showProgressInput.checked,
        show_time: showTimeInput.checked,
        text_transition: selectedAnim,
        text_transition_settings: (() => {
            const configContainer = document.getElementById('text-transition-configs');
            const settings = {};
            if (configContainer) {
                configContainer.querySelectorAll('input, select, textarea').forEach(input => {
                    if (input.name) {
                        let val;
                        if (input.type === 'checkbox') {
                            val = input.checked;
                        } else if (input.type === 'number') {
                            val = Number(input.value);
                        } else {
                            val = input.value;
                        }
                        settings[input.name] = val;
                    }
                });
            }
            return settings;
        })()
    };
}

async function saveConfig(nextConfig, successMessage) {
    statusEl.textContent = 'Saving...';

    const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig),
    });

    if (res.ok) {
        config = nextConfig;
        render();
        statusEl.textContent = successMessage;
        previewFrame.src = previewFrame.src;
        setTimeout(() => {
            statusEl.textContent = '';
        }, 1800);
    } else {
        statusEl.textContent = 'Save failed';
    }
}

loadConfig();

const clearReloadButton = document.getElementById('clear-reload');
if (clearReloadButton) {
    clearReloadButton.addEventListener('click', () => {
        // 
        localStorage.clear();
        sessionStorage.clear();
        
        // 
        if (previewFrame) {
            previewFrame.src = '/overlay.html?t=' + Date.now();
        }
        
        // 
        window.location.href = window.location.pathname + '?t=' + Date.now();
    });
}
