export const schema = [];

export function animate(element, newText, config = {}) {
    element.innerHTML = '';
    element.innerText = newText;
    element.dataset.text = newText;
    element.style.display = '';
    element.style.position = '';
    element.style.verticalAlign = '';
}
