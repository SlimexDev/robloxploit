const contentType = document.querySelector('#content-type');
const adPopup = document.querySelector('#ad-popup');
if (adPopup) {
  const frame = adPopup.querySelector('iframe');
  frame.src = frame.dataset.adSrc;
  adPopup.showModal();
  const closeAd = () => { adPopup.close(); frame.src = 'about:blank'; };
  document.querySelector('#close-ad-popup').addEventListener('click', closeAd);
  adPopup.addEventListener('cancel', closeAd);
}
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
const uploadZone = document.querySelector('.upload-zone');
let previewUrl;
function validCover(file) {
  if (!file || file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    notify('Choose a JPG, PNG or WebP image up to 3 MB.');
    return false;
  }
  return true;
}
imageInput?.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (!validCover(file)) {
    imageInput.value = '';
    return;
  }
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  document.querySelector('#image-preview').src = previewUrl;
});

if (uploadZone && imageInput) {
  for (const name of ['dragenter', 'dragover']) uploadZone.addEventListener(name, event => {
    event.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', event => {
    if (!uploadZone.contains(event.relatedTarget)) uploadZone.classList.remove('drag-over');
  });
  uploadZone.addEventListener('drop', event => {
    event.preventDefault();
    uploadZone.classList.remove('drag-over');
    const files = event.dataTransfer?.files;
    if (files?.length !== 1) { notify('Drop one image file from your computer.'); return; }
    if (!validCover(files[0])) return;
    const transfer = new DataTransfer();
    transfer.items.add(files[0]);
    imageInput.files = transfer.files;
    imageInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
