import { tokenizeLua } from './lua-highlight.js';

const content = document.querySelector('#page-script-content');
if (content) {
  const fragment = document.createDocumentFragment();
  for (const token of tokenizeLua(content.textContent)) {
    if (!token.type) { fragment.append(document.createTextNode(token.text)); continue; }
    const span = document.createElement('span');
    span.className = `lua-${token.type}`;
    span.textContent = token.text;
    fragment.append(span);
  }
  content.replaceChildren(fragment);
}

document.querySelector('#copy-page-code')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#page-script-content').textContent);
    notify('Script copied to clipboard.');
  } catch { notify('Clipboard is unavailable. Select the code and copy it manually.'); }
});
