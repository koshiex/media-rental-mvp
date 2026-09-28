import { api, post, setUserId } from '../api.js';
import { icon } from '../icons.js';
import { KIND_LABELS, ROLE_LABELS } from '../labels.js';
import { html, initials, setHtml, toast } from '../ui.js';

const ROLE_HINTS = {
  recipient: 'Выбирает технику в каталоге, подаёт и отменяет заявки, получает уведомления.',
  staff: 'Согласует заявки, оформляет выдачу и приём, следит за просрочками.',
  admin: 'Ведёт карточки оборудования, меняет статусы техники и права пользователей.',
  support: 'Разбирает обращения пользователей и выделяет повторяющиеся проблемы ИС.',
  manager: 'Смотрит отчёты по загрузке, отказам, просрочкам и повреждениям.',
};

function subtitle(user) {
  if (user.role !== 'recipient') return user.roleLabel;
  const who = [KIND_LABELS[user.kind], user.group].filter(Boolean).join(', ');
  return `${who} · ${user.hasClearance ? 'есть допуск' : 'без допуска'}`;
}

export async function renderLogin(root, onLogin) {
  const users = await api('/api/session/users');
  const groups = Object.keys(ROLE_LABELS)
    .map((role) => ({ role, users: users.filter((user) => user.role === role) }))
    .filter((group) => group.users.length);

  setHtml(root, html`
    <main class="login">
      <section class="login-hero">
        <div class="brand brand-lg"><span class="brand-mark">${icon('camera')}</span><b>МедиаПрокат</b></div>
        <h1>Прокат и учёт оборудования университетского медиапространства</h1>
        <p>MVP информационной системы: каталог, бронирование, согласование, выдача, возврат, уведомления,
          поддержка пользователей, отчётность и журнал действий.</p>
        <ul class="login-points">
          <li>Контроль пересечений бронирований одной единицы техники</li>
          <li>Фиксация комплектности и повреждений при возврате</li>
          <li>Журнал действий и мониторинг времени отклика по SLA</li>
        </ul>
        <button type="button" class="btn btn-ghost btn-sm login-reset" data-reset>${icon('refresh')} Сбросить демо-данные</button>
      </section>
      <section class="login-roles">
        <h2>Войти как</h2>
        <p class="muted">Демо-вход без пароля: права определяются ролью пользователя.</p>
        ${groups.map((group) => html`
          <div class="role-group">
            <div class="role-group-head"><b>${ROLE_LABELS[group.role]}</b><span class="muted">${ROLE_HINTS[group.role]}</span></div>
            <div class="user-list">
              ${group.users.map((user) => html`
                <button type="button" class="user-pick" data-user="${user.id}">
                  <span class="avatar avatar-${group.role}">${initials(user.name)}</span>
                  <span><b>${user.name}</b><small>${subtitle(user)}</small></span>
                </button>`)}
            </div>
          </div>`)}
      </section>
    </main>`);

  root.onclick = async (event) => {
    if (event.target.closest('[data-reset]')) {
      await post('/api/demo/reset');
      toast('Демо-данные восстановлены');
      return;
    }
    const pick = event.target.closest('[data-user]');
    if (!pick) return;
    root.onclick = null;
    setUserId(pick.dataset.user);
    await onLogin();
  };
}
