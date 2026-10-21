document.querySelectorAll('[data-ad-editor]').forEach(editor => {
  const select = editor.querySelector('[data-ad-type]');
  const update = () => editor.querySelectorAll('[data-ad-fields]').forEach(group => {
    group.hidden = !group.dataset.adFields.split(' ').includes(select.value);
  });
  select.addEventListener('change', update);
  update();
});
