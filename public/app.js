const contentType = document.querySelector('#content-type');
contentType?.addEventListener('change', () => {
  const link = contentType.value === 'link';
  document.querySelector('#code-field').hidden = link;
  document.querySelector('#link-field').hidden = !link;
  document.querySelector('#code').disabled = link;
  document.querySelector('#code').required = !link;
  document.querySelector('#script-url').disabled = !link;
  document.querySelector('#script-url').required = link;
});
const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
const toast = document.querySelector('#toast');
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

document.querySelectorAll('form[data-confirm]').forEach(form => {
  form.addEventListener('submit', event => { if (!confirm(form.dataset.confirm)) event.preventDefault(); });
});

const imageInput = document.querySelector('#image');
let previewUrl;
imageInput?.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    imageInput.value = '';
    notify('Choose a JPG, PNG or WebP image up to 3 MB.');
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  document.querySelector('#image-preview').src = previewUrl;
});

const dialog = document.querySelector('#unlock-dialog');
if (dialog) {
  const error = document.querySelector('#unlock-error');
  const buttons = [...dialog.querySelectorAll('[data-task]')];
  const progress = document.querySelector('#unlock-progress');
  const reveal = document.querySelector('#reveal-script');
  const state = buttons.map(() => ({ started: false, readyAt: null, done: false, busy: false }));
  let activeTimer;
  let rawUrl;
  function showSpinner(button) {
    button.textContent = '';
    button.setAttribute('aria-label', 'Task in progress — click to reopen');
    button.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'task-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner);
  }
  document.querySelector('#open-unlock').addEventListener('click', () => dialog.showModal());
  document.querySelector('#close-unlock').addEventListener('click', () => dialog.close());

  async function api(action, index) {
    const response = await fetch(`/api/unlock/${dialog.dataset.token}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ index }) });
    let result;
    try { result = await response.json(); } catch { throw new Error('Unable to connect. Please try again later.'); }
    if (!response.ok) throw new Error(result.error || 'Something went wrong.');
    return result;
  }

  async function finish(index) {
    const current = state[index];
    if (current.busy || current.done) return;
    current.busy = true;
    try {
      const result = await api('complete', index);
      current.done = true;
      buttons[index].textContent = '✓ Done';
      buttons[index].disabled = true;
      buttons[index].closest('.task').classList.remove('current');
      buttons[index].closest('.task').classList.add('completed');
      progress.value = result.next;
      document.querySelector('#progress-label').textContent = `${result.next} / ${buttons.length}`;
      if (result.done) {
        reveal.disabled = false;
        reveal.textContent = 'Unlock & get script →';
        reveal.focus();
      } else {
        buttons[result.next].disabled = false;
        buttons[result.next].textContent = 'Start ↗';
        buttons[result.next].closest('.task').classList.add('current');
      }
    } catch (failure) {
      error.textContent = failure.message;
      buttons[index].disabled = false;
      buttons[index].textContent = 'Retry';
    } finally {
      current.busy = false;
      buttons[index].removeAttribute('aria-label');
      buttons[index].removeAttribute('aria-busy');
    }
  }

  buttons.forEach((button, index) => button.addEventListener('click', async () => {
    error.textContent = '';
    const current = state[index];
    if (current.busy || current.done) return;
    if (current.started && Date.now() >= current.readyAt) { await finish(index); return; }
    // Open synchronously from the user's click so browsers do not block the task tab.
    const taskTab = window.open('about:blank', '_blank');
    if (!taskTab) { error.textContent = 'Allow pop-ups to start this task, then try again.'; return; }
    taskTab.opener = null;
    current.busy = true;
    button.disabled = true;
    showSpinner(button);
    try {
      const result = await api('start', index);
      taskTab.location.replace(result.url);
      current.started = true;
      current.readyAt = Date.now() + result.remainingMs;
      current.busy = false;
      button.disabled = false;
      clearInterval(activeTimer);
      const tick = () => {
        const left = Math.max(0, Math.ceil((current.readyAt - Date.now()) / 1000));
        if (left === 0) { clearInterval(activeTimer); finish(index); }
      };
      activeTimer = setInterval(tick, 250);
      tick();
    } catch (failure) {
      taskTab.close();
      error.textContent = failure.message;
      button.disabled = false;
      button.textContent = 'Retry ↗';
      button.removeAttribute('aria-label');
      button.removeAttribute('aria-busy');
      current.busy = false;
    }
  }));

  reveal.addEventListener('click', async () => {
    reveal.disabled = true;
    try {
      const result = await api('code');
      const isLink = Boolean(result.url);
      document.querySelector('#code-result').hidden = isLink;
      document.querySelector('#get-script').hidden = !isLink;
      if (isLink) {
        document.querySelector('#get-script').href = result.url;
      } else {
      document.querySelector('#script-content').textContent = result.code;
      if (rawUrl) URL.revokeObjectURL(rawUrl);
      rawUrl = URL.createObjectURL(new Blob([result.code], { type: 'text/plain;charset=utf-8' }));
      document.querySelector('#raw-script').href = rawUrl;
      }
      document.querySelector('#locked-code').hidden = true;
      document.querySelector('#unlocked-code').hidden = false;
      dialog.close();
      document.querySelector(isLink ? '#get-script' : '#copy-script').focus();
      notify('Your script is unlocked!');
    } catch (failure) { error.textContent = failure.message; reveal.disabled = false; }
  });
  document.querySelector('#copy-script').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.querySelector('#script-content').textContent); notify('Script copied to clipboard.'); }
    catch { notify('Clipboard is unavailable. Select the code and copy it manually.'); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
