export const schema = [
    {
        name: 'duration',
        label: 'Fade Duration (ms)',
        type: 'number',
        min: 50,
        max: 2000,
        step: 50,
        default: 300
    },
    {
        name: 'stagger',
        label: 'Stagger (ms)',
        type: 'number',
        min: 0,
        max: 200,
        step: 5,
        default: 15
    }
];

export function animate(element, newText, config = {}) {
    const oldText = element.dataset.text !== undefined ? element.dataset.text : (element.innerText || '');
    if (oldText === newText) return;
    
    element.dataset.text = newText;
    
    const duration = config.duration !== undefined ? Number(config.duration) : 300;
    const stagger = config.stagger !== undefined ? Number(config.stagger) : 15;
    
    element.innerHTML = '';
    element.style.display = 'inline-flex';
    element.style.position = 'relative';
    element.style.verticalAlign = 'top';
    
    const srSpan = document.createElement('span');
    srSpan.style.position = 'absolute';
    srSpan.style.width = '1px';
    srSpan.style.height = '1px';
    srSpan.style.padding = '0';
    srSpan.style.margin = '-1px';
    srSpan.style.overflow = 'hidden';
    srSpan.style.clip = 'rect(0, 0, 0, 0)';
    srSpan.style.whiteSpace = 'nowrap';
    srSpan.style.border = '0';
    srSpan.innerText = newText;
    element.appendChild(srSpan);
    
    const splitChars = (text) => Array.from(text).map(c => c === ' ' ? '\u00A0' : c);
    const oldChars = splitChars(oldText);
    const newChars = splitChars(newText);
    
    const oldContainer = document.createElement('span');
    oldContainer.style.position = 'absolute';
    oldContainer.style.left = '0';
    oldContainer.style.top = '0';
    oldContainer.style.display = 'inline-flex';
    oldContainer.style.whiteSpace = 'nowrap';
    oldContainer.style.width = 'max-content';
    oldContainer.style.pointerEvents = 'none';
    oldContainer.setAttribute('aria-hidden', 'true');
    
    const newContainer = document.createElement('span');
    newContainer.style.display = 'inline-flex';
    newContainer.style.whiteSpace = 'nowrap';
    newContainer.style.width = 'max-content';
    newContainer.setAttribute('aria-hidden', 'true');
    
    if (oldText && element.animate) {
        oldChars.forEach((char, index) => {
            const span = document.createElement('span');
            span.innerText = char;
            span.style.display = 'inline-block';
            span.style.whiteSpace = 'pre';
            span.style.flexShrink = '0';
            oldContainer.appendChild(span);
            
            span.animate([
                { opacity: 1 },
                { opacity: 0 }
            ], {
                duration: duration * 0.8,
                delay: (oldChars.length - 1 - index) * stagger,
                easing: 'ease-out',
                fill: 'both'
            });
        });
    }
    
    newChars.forEach((char, index) => {
        const span = document.createElement('span');
        span.innerText = char;
        span.style.display = 'inline-block';
        span.style.whiteSpace = 'pre';
        span.style.flexShrink = '0';
        newContainer.appendChild(span);
        
        if (element.animate) {
            span.animate([
                { opacity: 0 },
                { opacity: 1 }
            ], {
                duration: duration,
                delay: index * stagger,
                easing: 'ease-in',
                fill: 'both'
            });
        }
    });
    
    if (oldChars.length > 0 && element.animate) {
        element.appendChild(oldContainer);
        const maxOldDelay = (oldChars.length - 1) * stagger;
        setTimeout(() => {
            if (oldContainer.parentNode) {
                oldContainer.parentNode.removeChild(oldContainer);
            }
        }, maxOldDelay + duration + 50);
    }
    
    element.appendChild(newContainer);
}
