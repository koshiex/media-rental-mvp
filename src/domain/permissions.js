import { forbidden } from './errors.js';

export const ROLE_LABELS = {
  recipient: 'Получатель оборудования',
  staff: 'Сотрудник пункта выдачи',
  admin: 'Администратор каталога и прав',
  support: 'Специалист поддержки',
  manager: 'Руководитель медиапространства',
};

export const ROLES = Object.keys(ROLE_LABELS);

const PERMISSIONS = {
  'booking.create': ['recipient'],
  'booking.review': ['staff'],
  'booking.handover': ['staff'],
  'booking.viewAll': ['staff', 'admin', 'support', 'manager'],
  'overdue.view': ['staff', 'manager'],
  'equipment.manage': ['admin'],
  'user.manage': ['admin'],
  'ticket.create': ['recipient', 'staff'],
  'ticket.manage': ['support'],
  'problem.view': ['support', 'manager'],
  'report.view': ['manager', 'admin'],
  'audit.view': ['admin', 'support', 'manager'],
};

export function can(user, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission: ${permission}`);
  return Boolean(user) && allowed.includes(user.role);
}

export function assertCan(user, permission) {
  if (!can(user, permission)) throw forbidden();
}

export function permissionsOf(user) {
  return Object.keys(PERMISSIONS).filter((permission) => can(user, permission));
}
