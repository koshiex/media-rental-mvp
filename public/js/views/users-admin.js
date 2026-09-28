import { api, patch } from '../api.js';
import { KIND_LABELS, ROLE_LABELS } from '../labels.js';
import { html, initials, setHtml, toast } from '../ui.js';

export async function render(el, { user: currentUser, refresh }) {
  const users = await api('/api/users');
  const byId = new Map(users.map((user) => [String(user.id), user]));

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Пользователи и права</h1>
        <p class="muted">Роль определяет доступные действия. Изменения вступают в силу сразу, без повторного входа (NFR-07: не позднее 5 минут).</p></div>
    </header>
    <div class="card table-card">
      <table class="table">
        <thead><tr><th>Пользователь</th><th>Тип</th><th>Роль</th><th>Допуск к технике с ограничениями</th></tr></thead>
        <tbody>${users.map((user) => html`
          <tr>
            <td><div class="person"><span class="avatar avatar-${user.role}">${initials(user.name)}</span><b>${user.name}</b></div></td>
            <td class="muted">${[KIND_LABELS[user.kind], user.group].filter(Boolean).join(', ')}</td>
            <td><select data-role="${user.id}" ${user.id === currentUser.id ? 'disabled' : ''}>
              ${Object.entries(ROLE_LABELS).map(([value, label]) => html`
                <option value="${value}" ${value === user.role ? 'selected' : ''}>${label}</option>`)}</select></td>
            <td><label class="switch"><input type="checkbox" data-clearance="${user.id}" ${user.hasClearance ? 'checked' : ''}>
              <span>${user.hasClearance ? 'Есть допуск' : 'Нет допуска'}</span></label></td>
          </tr>`)}
        </tbody>
      </table>
    </div>`);

  el.onchange = async (event) => {
    const roleSelect = event.target.closest('[data-role]');
    const clearance = event.target.closest('[data-clearance]');
    const target = roleSelect ?? clearance;
    if (!target) return;
    const user = byId.get(roleSelect ? roleSelect.dataset.role : clearance.dataset.clearance);
    const payload = roleSelect ? { role: roleSelect.value } : { hasClearance: clearance.checked };
    try {
      await patch(`/api/users/${user.id}`, payload);
      toast(roleSelect ? `${user.name}: ${ROLE_LABELS[roleSelect.value]}` : `${user.name}: допуск ${clearance.checked ? 'выдан' : 'отозван'}`);
    } catch (error) {
      toast(error.message, 'danger');
    }
    refresh();
  };
}
