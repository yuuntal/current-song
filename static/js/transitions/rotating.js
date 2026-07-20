export const schema = [
    {
        name: 'staggerFrom',
        label: 'Stagger From',
        type: 'select',
        options: [
            { value: 'first', label: 'First' },
            { value: 'last', label: 'Last' },
            { value: 'center', label: 'Center' },
            { value: 'random', label: 'Random' }
        ],
        default: 'last'
    },
    {
        name: 'staggerDuration',
        label: 'Stagger (ms)',
        type: 'number',
        min: 0,
        max: 500,
        step: 1,
        default: 25
    }
];

export function animate(element, newText, config = {}) {
    const oldText = element.dataset.text !== undefined ? element.dataset.text : (element.innerText || '');
    if (oldText === newText) return;
    
    element.dataset.text = newText;
    
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
    
    const staggerFrom = config.staggerFrom || 'last';
    const staggerDuration = config.staggerDuration !== undefined ? config.staggerDuration : 25;
    const duration = 400;
    const easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    
    const splitChars = (text) => Array.from(text).map(c => c === ' ' ? '\u00A0' : c);
    const oldChars = splitChars(oldText);
    const newChars = splitChars(newText);
    
    const getDelay = (index, total) => {
        if (staggerFrom === 'first') return index * staggerDuration;
        if (staggerFrom === 'last') return (total - 1 - index) * staggerDuration;
        if (staggerFrom === 'center') {
            const center = Math.floor(total / 2);
            return Math.abs(center - index) * staggerDuration;
        }
        if (staggerFrom === 'random') {
            return Math.random() * total * staggerDuration;
        }
        return index * staggerDuration;
    };

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
            const charWrap = document.createElement('span');
            charWrap.style.overflow = 'hidden';
            charWrap.style.display = 'inline-flex';
            charWrap.style.flexShrink = '0';
            charWrap.style.paddingBottom = '0.1em';
            charWrap.style.marginBottom = '-0.1em';
            
            const span = document.createElement('span');
            span.innerText = char;
            span.style.display = 'inline-block';
            span.style.whiteSpace = 'pre';
            
            charWrap.appendChild(span);
            oldContainer.appendChild(charWrap);
            
            const delay = getDelay(index, oldChars.length);
            
            span.animate([
                { transform: 'translateY(0)' },
                { transform: 'translateY(-120%)' }
            ], {
                duration: duration * 0.8,
                delay,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'both'
            });
        });
    }

    newChars.forEach((char, index) => {
        const charWrap = document.createElement('span');
        charWrap.style.overflow = 'hidden';
        charWrap.style.display = 'inline-flex';
        charWrap.style.flexShrink = '0';
        charWrap.style.paddingBottom = '0.1em';
        charWrap.style.marginBottom = '-0.1em';
        
        const span = document.createElement('span');
        span.innerText = char;
        span.style.display = 'inline-block';
        span.style.whiteSpace = 'pre';
        
        charWrap.appendChild(span);
        newContainer.appendChild(charWrap);
        
        const delay = getDelay(index, newChars.length);
        
        if (element.animate) {
            span.animate([
                { transform: 'translateY(120%)' },
                { transform: 'translateY(0)' }
            ], {
                duration,
                delay,
                easing,
                fill: 'both'
            });
        }
    });
    
    if (oldChars.length > 0 && element.animate) {
        element.appendChild(oldContainer);
        const maxOldDelay = oldChars.length > 0 ? (oldChars.length - 1) * staggerDuration : 0;
        setTimeout(() => {
            if (oldContainer.parentNode) {
                oldContainer.parentNode.removeChild(oldContainer);
            }
        }, maxOldDelay + duration + 50);
    }
    
    element.appendChild(newContainer);
}
