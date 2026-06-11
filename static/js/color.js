const colorThief = new ColorThief();

export function extractAccentColor(img) {
    if (document.documentElement.dataset.colorMode === 'manual') return;
    if (!img.complete) return;
    try {
        const rgb = colorThief.getColor(img);
        if (!rgb) return;
        const [r, g, b] = rgb;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const boost = luminance < 120 ? 120 : 0;
        const accR = Math.min(255, r + boost);
        const accG = Math.min(255, g + boost);
        const accB = Math.min(255, b + boost);
        
        document.documentElement.style.setProperty('--accent-color', `rgb(${accR},${accG},${accB})`);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${accR},${accG},${accB},0.4)`);
    } catch (e) {  }
}

export function resetAccentColor() {
    if (document.documentElement.dataset.colorMode === 'manual') return;
    document.documentElement.style.setProperty('--accent-color', '#4a90e2');
    document.documentElement.style.setProperty('--accent-glow', 'rgba(74, 144, 226, 0.4)');
}
