import * as audit from './views/audit.js';
import * as catalog from './views/catalog.js';
import * as desk from './views/desk.js';
import * as equipmentAdmin from './views/equipment-admin.js';
import * as equipmentCard from './views/equipment-card.js';
import * as myBookings from './views/my-bookings.js';
import * as notifications from './views/notifications.js';
import * as overdue from './views/overdue.js';
import * as problems from './views/problems.js';
import * as reports from './views/reports.js';
import * as sla from './views/sla.js';
import * as support from './views/support.js';
import * as usersAdmin from './views/users-admin.js';

const ALL = ['recipient', 'staff', 'admin', 'support', 'manager'];

export const ROUTES = [
  { path: '/my-bookings', label: 'Мои заявки', icon: 'calendar', roles: ['recipient'], view: myBookings },
  { path: '/desk', label: 'Пульт выдачи', icon: 'desk', roles: ['staff'], view: desk },
  { path: '/admin/equipment', label: 'Карточки оборудования', icon: 'box', roles: ['admin'], view: equipmentAdmin },
  { path: '/admin/users', label: 'Пользователи и права', icon: 'users', roles: ['admin'], view: usersAdmin },
  { path: '/reports', label: 'Отчёты', icon: 'chart', roles: ['manager', 'admin'], view: reports },
  { path: '/support', label: 'Поддержка', icon: 'lifebuoy', roles: ['recipient', 'staff', 'support'], view: support },
  { path: '/catalog', label: 'Каталог оборудования', icon: 'grid', roles: ALL, view: catalog },
  { path: '/equipment/:id', label: 'Карточка оборудования', roles: ALL, view: equipmentCard, hidden: true },
  { path: '/overdue', label: 'Просрочки', icon: 'alert', roles: ['staff', 'manager'], view: overdue },
  { path: '/problems', label: 'Проблемы ИС', icon: 'bug', roles: ['support', 'manager'], view: problems },
  { path: '/audit', label: 'Журнал действий', icon: 'list', roles: ['admin', 'support', 'manager'], view: audit },
  { path: '/notifications', label: 'Уведомления', icon: 'bell', roles: ALL, view: notifications },
  { path: '/sla', label: 'SLA и мониторинг', icon: 'pulse', roles: ALL, view: sla },
];

export const HOME = {
  recipient: '/catalog',
  staff: '/desk',
  admin: '/admin/equipment',
  support: '/support',
  manager: '/reports',
};

export function navFor(role) {
  const own = ROUTES.filter((route) => !route.hidden && route.roles.includes(role));
  const home = own.find((route) => route.path === HOME[role]);
  return [home, ...own.filter((route) => route !== home)].filter(Boolean);
}

export function matchRoute(path) {
  for (const route of ROUTES) {
    const keys = [];
    const pattern = new RegExp(`^${route.path.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })}$`);
    const found = pattern.exec(path);
    if (found) {
      return { route, params: Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(found[index + 1])])) };
    }
  }
  return null;
}
