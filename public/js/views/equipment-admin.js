import { api, patch, post } from '../api.js';
import { CATEGORIES, EQUIPMENT_STATUS } from '../labels.js';
import { formValues, html, openModal, setHtml, toast } from '../ui.js';

function equipmentForm(item = {}) {
  const selected = (value) => (value === item.category ? 'selected' : '');
  return html`
    <div class="field-row">
      <label class="field"><span>Инвентарный номер</span>
        <input name="inventoryNumber" maxlength="30" placeholder="МП-КАМ-006" value="${item.inventoryNumber ?? ''}" required></label>
      <label class="field"><span>Категория</span><select name="category">
        ${CATEGORIES.map((category) => html`<option ${selected(category.name)}>${category.name}</option>`)}</select></label>
    </div>
    <label class="field"><span>Название</span><input name="name" maxlength="120" value="${item.name ?? ''}" required></label>
    <label class="field"><span>Состав комплекта — по одной позиции в строке</span>
      <textarea name="kit" rows="4" required>${(item.kit ?? []).join('\n')}</textarea></label>
    <div class="field-row">
      <label class="field"><span>Максимальный срок выдачи, дней</span>
        <input type="number" name="maxDays" min="1" max="30" value="${item.maxDays ?? 7}" required></label>
      <label class="check check-field"><input type="checkbox" name="requiresClearance" ${item.requiresClearance ? 'checked' : ''}>
        Выдача только с допуском</label>
    </div>
    <label class="field"><span>Описание и ограничения выдачи</span>
      <textarea name="description" rows="2" maxlength="1000">${item.description ?? ''}</textarea></label>`;
}

function readForm(form) {
  const values = formValues(form);
  return {
    inventoryNumber: values.inventoryNumber,
    name: values.name,
    category: values.category,
    kit: values.kit.split('\n').map((line) => line.trim()).filter(Boolean),
    maxDays: Number(values.maxDays),
    requiresClearance: form.requiresClearance.checked,
    description: values.description,
  };
}

function openEditor(item, done) {
  openModal({
    title: item ? `Карточка ${item.inventoryNumber}` : 'Новое оборудование',
    submitLabel: item ? 'Сохранить' : 'Добавить в каталог',
    wide: true,
    body: equipmentForm(item ?? {}),
    onSubmit: async (form) => {
      const payload = readForm(form);
      const saved = item ? await patch(`/api/equipment/${item.id}`, payload) : await post('/api/equipment', payload);
      toast(item ? `Карточка ${saved.inventoryNumber} обновлена` : `${saved.name} добавлено в каталог`);
      done();
    },
  });
}

export async function render(el, { refresh }) {
  const items = await api('/api/equipment');
  const byId = new Map(items.map((item) => [String(item.id), item]));

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Карточки оборудования</h1>
        <p class="muted">Инвентарные номера, состав комплектов, ограничения выдачи и статусы техники.</p></div>
      <button type="button" class="btn btn-primary" data-create>Добавить оборудование</button>
    </header>
    <div class="card table-card">
      <table class="table">
        <thead><tr><th>Инв. номер</th><th>Название</th><th>Категория</th><th>Комплект</th><th>Ограничения</th><th>Статус</th><th></th></tr></thead>
        <tbody>${items.map((item) => html`
          <tr>
            <td class="mono">${item.inventoryNumber}</td>
            <td><a href="#/equipment/${item.id}">${item.name}</a></td>
            <td>${item.category}</td>
            <td class="muted small">${item.kit.length} поз.</td>
            <td class="small">до ${item.maxDays} дн.${item.requiresClearance ? html`<br><span class="tag tag-warn">допуск</span>` : ''}</td>
            <td><select class="status-select status-${EQUIPMENT_STATUS[item.status].tone}" data-status="${item.id}">
              ${Object.entries(EQUIPMENT_STATUS).map(([value, entry]) => html`
                <option value="${value}" ${value === item.status ? 'selected' : ''}>${entry.label}</option>`)}</select></td>
            <td><div class="row-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit="${item.id}">Изменить</button>
              <a class="btn btn-link btn-sm" href="#/audit?objectType=equipment&objectId=${item.id}">Журнал</a>
            </div></td>
          </tr>`)}
        </tbody>
      </table>
    </div>`);

  el.onclick = (event) => {
    if (event.target.closest('[data-create]')) openEditor(null, refresh);
    const edit = event.target.closest('[data-edit]');
    if (edit) openEditor(byId.get(edit.dataset.edit), refresh);
  };
  el.onchange = async (event) => {
    const select = event.target.closest('[data-status]');
    if (!select) return;
    const item = byId.get(select.dataset.status);
    try {
      await patch(`/api/equipment/${item.id}`, { status: select.value });
      toast(`${item.name}: ${EQUIPMENT_STATUS[select.value].label.toLowerCase()}`);
    } catch (error) {
      toast(error.message, 'danger');
    }
    refresh();
  };
}
