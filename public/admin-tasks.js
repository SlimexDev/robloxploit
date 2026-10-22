const editor = document.querySelector('#task-editor').closest('form');
const rows = document.querySelector('#task-rows');
const add = document.querySelector('#add-task');
function refreshTasks() {
  [...rows.children].forEach((row, index) => {
    row.querySelector('[data-task-number]').textContent = index + 1;
    row.querySelector('[data-move="-1"]').disabled = index === 0;
    row.querySelector('[data-move="1"]').disabled = index === rows.children.length - 1;
    row.querySelector('[data-remove]').disabled = rows.children.length === 1;
  });
  add.disabled = rows.children.length >= 20;
}
add.addEventListener('click', () => {
  if (rows.children.length >= 20) return;
  rows.append(document.querySelector('#task-row-template').content.cloneNode(true));
  refreshTasks();
  rows.lastElementChild.querySelector('select').focus();
});
rows.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const row = button.closest('.task-editor-row');
  if (button.hasAttribute('data-remove') && rows.children.length > 1) row.remove();
  if (button.dataset.move === '-1' && row.previousElementSibling) rows.insertBefore(row, row.previousElementSibling);
  if (button.dataset.move === '1' && row.nextElementSibling) rows.insertBefore(row.nextElementSibling, row);
  refreshTasks();
});
rows.addEventListener('change', event => {
  if (event.target.dataset.field === 'type') event.target.closest('.task-editor-row').querySelector('[data-field="label"]').value = event.target.selectedOptions[0].dataset.label;
});
editor.addEventListener('submit', () => {
  document.querySelector('#tasks-json').value = JSON.stringify([...rows.children].map(row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(field => [field.dataset.field, field.value]))));
});
refreshTasks();

const taskMode = document.querySelector('#post-tasks-mode');
if (taskMode) {
  const updateMode = () => {
    const fields = document.querySelector('#post-custom-tasks');
    fields.hidden = fields.disabled = taskMode.value !== 'custom';
  };
  taskMode.addEventListener('change', updateMode);
  updateMode();
}
