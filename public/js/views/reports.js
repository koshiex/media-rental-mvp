import { api } from '../api.js';
import { RETURN_CONDITION } from '../labels.js';
import {
  addDaysIso, badge, daysLabel, emptyState, formValues, formatDate, formatDateTime, formatRange, html, setHtml, todayIso,
} from '../ui.js';

const DEFAULT_PERIOD_DAYS = 29;

function barRow(label, sublabel, percent, detail) {
  return html`
    <tr>
      <th scope="row"><span class="bar-label">${label}</span>${sublabel ? html`<span class="muted small">${sublabel}</span>` : ''}</th>
      <td class="bar-cell">
        <div class="bar-track" title="${label}: ${percent}% · ${detail}">
          <span class="bar" style="width: ${Math.max(percent, 0.5)}%"></span>
          <span class="bar-value">${percent}%</span>
        </div>
      </td>
      <td class="num muted small">${detail}</td>
    </tr>`;
}

function tiles(report) {
  const { totals } = report;
  return [
    { value: totals.requests, label: 'заявок подано', hint: `одобрено ${totals.approvalRate}% рассмотренных` },
    { value: `${totals.averageUtilization}%`, label: 'средняя загрузка', hint: `за ${daysLabel(report.periodDays)}` },
    { value: totals.rejected, label: 'отказов', hint: `отмен: ${totals.cancelled}` },
    { value: totals.overdue, label: 'просрочек возврата', hint: 'срок возврата в периоде' },
    { value: totals.damaged + totals.shortage, label: 'повреждений и недостач', hint: `повреждений ${totals.damaged}, недостач ${totals.shortage}` },
  ];
}

export async function render(el, { query, navigate }) {
  const to = query.to ?? todayIso();
  const from = query.from ?? addDaysIso(to, -DEFAULT_PERIOD_DAYS);
  const report = await api(`/api/reports?${new URLSearchParams({ from, to })}`);

  setHtml(el, html`
    <header class="page-header">
      <div><h1>Отчёт по прокату</h1><p class="muted">Загрузка оборудования, отказы, просрочки и повреждения за ${formatRange(from, to)}.</p></div>
      <form class="inline-form" data-period>
        <label class="inline-field">с <input type="date" name="from" value="${from}" required></label>
        <label class="inline-field">по <input type="date" name="to" value="${to}" required></label>
        <button class="btn btn-primary">Построить</button>
      </form>
    </header>
    <div class="stat-row">${tiles(report).map((tile) => html`
      <div class="stat card"><span class="stat-value">${tile.value}</span><span class="stat-label">${tile.label}</span>
        <span class="muted small">${tile.hint}</span></div>`)}
    </div>
    <div class="report-grid">
      <section class="card">
        <h2>Загрузка по единицам техники</h2>
        <p class="muted small">Доля дней периода, на которые техника была забронирована или выдана.</p>
        <table class="bar-table"><tbody>
          ${report.byEquipment.map((item) => barRow(item.name, item.inventoryNumber, item.utilization, daysLabel(item.bookedDays)))}
        </tbody></table>
      </section>
      <div class="report-side">
        <section class="card">
          <h2>По категориям</h2>
          <table class="bar-table"><tbody>
            ${report.byCategory.map((group) => barRow(group.category, `${group.units} ед.`, group.utilization, daysLabel(group.bookedDays)))}
          </tbody></table>
        </section>
        <section class="card">
          <h2>Повреждения и недостачи</h2>
          ${report.damages.length ? html`<ul class="event-list">${report.damages.map((item) => html`
            <li>${badge(RETURN_CONDITION[item.condition])} <b>${item.equipmentName}</b>
              <div class="small">${item.comment}</div>
              <div class="muted small">${item.userName} · заявка №${item.bookingId} · ${formatDateTime(item.returnedAt)}</div></li>`)}
          </ul>` : emptyState('Повреждений не было')}
        </section>
        <section class="card">
          <h2>Отказы</h2>
          ${report.rejections.length ? html`<ul class="event-list">${report.rejections.map((item) => html`
            <li><b>${item.equipmentName}</b> <span class="muted small">· ${item.userName} · ${formatDate(item.startDate)}</span>
              <div class="small">${item.comment}</div></li>`)}
          </ul>` : emptyState('Отказов не было')}
        </section>
      </div>
    </div>`);

  el.onsubmit = (event) => {
    if (!event.target.matches('[data-period]')) return;
    event.preventDefault();
    navigate('/reports', formValues(event.target));
  };
}
