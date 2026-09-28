export const ROLE_LABELS = {
  recipient: 'Получатель оборудования',
  staff: 'Сотрудник пункта выдачи',
  admin: 'Администратор каталога и прав',
  support: 'Специалист поддержки',
  manager: 'Руководитель медиапространства',
};

export const KIND_LABELS = { student: 'Студент', teacher: 'Преподаватель', employee: 'Сотрудник' };

export const BOOKING_STATUS = {
  new: { label: 'На согласовании', tone: 'info' },
  clarification: { label: 'Нужно уточнение', tone: 'warn' },
  approved: { label: 'Согласована', tone: 'accent' },
  rejected: { label: 'Отклонена', tone: 'danger' },
  cancelled: { label: 'Отменена', tone: 'muted' },
  issued: { label: 'Выдана', tone: 'violet' },
  returned: { label: 'Возвращена', tone: 'ok' },
};

export const EQUIPMENT_STATUS = {
  available: { label: 'Доступна', tone: 'ok' },
  reserved: { label: 'Забронирована', tone: 'info' },
  issued: { label: 'Выдана', tone: 'violet' },
  inspection: { label: 'На проверке', tone: 'warn' },
  unavailable: { label: 'Недоступна', tone: 'danger' },
};

export const RETURN_CONDITION = {
  full: { label: 'Полный комплект', tone: 'ok' },
  shortage: { label: 'Недостача', tone: 'warn' },
  damaged: { label: 'Повреждение', tone: 'danger' },
};

export const TICKET_CATEGORY = {
  booking: 'Ошибка оформления заявки',
  equipment_card: 'Не открывается карточка оборудования',
  other: 'Другое',
};

export const TICKET_PRIORITY = {
  low: { label: 'Низкий', tone: 'muted' },
  medium: { label: 'Средний', tone: 'info' },
  high: { label: 'Высокий', tone: 'danger' },
};

export const TICKET_STATUS = {
  open: { label: 'Новое', tone: 'info' },
  in_progress: { label: 'В работе', tone: 'warn' },
  resolved: { label: 'Решено', tone: 'ok' },
};

export const PROBLEM_STATUS = {
  open: { label: 'Зарегистрирована', tone: 'info' },
  fixing: { label: 'Исправляется', tone: 'warn' },
  closed: { label: 'Закрыта', tone: 'ok' },
};

export const OBJECT_TYPES = {
  booking: 'Заявка',
  equipment: 'Оборудование',
  ticket: 'Обращение',
  problem: 'Проблема',
  user: 'Пользователь',
};

export const CATEGORIES = [
  { name: 'Камеры', slug: 'camera' },
  { name: 'Звук', slug: 'sound' },
  { name: 'Свет', slug: 'light' },
  { name: 'Стабилизаторы и штативы', slug: 'rig' },
  { name: 'VR и дроны', slug: 'vr' },
];

export const categorySlug = (name) => CATEGORIES.find((category) => category.name === name)?.slug ?? 'other';

// Labels for any status code that can appear in the audit log.
export const ANY_STATUS = {
  ...Object.fromEntries(Object.entries(BOOKING_STATUS).map(([key, value]) => [`booking:${key}`, value])),
  ...Object.fromEntries(Object.entries(EQUIPMENT_STATUS).map(([key, value]) => [`equipment:${key}`, value])),
  ...Object.fromEntries(Object.entries(TICKET_STATUS).map(([key, value]) => [`ticket:${key}`, value])),
  ...Object.fromEntries(Object.entries(PROBLEM_STATUS).map(([key, value]) => [`problem:${key}`, value])),
  ...Object.fromEntries(Object.entries(ROLE_LABELS).map(([key, label]) => [`user:${key}`, { label, tone: 'muted' }])),
};
