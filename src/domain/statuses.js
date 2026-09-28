export const BOOKING_STATUS_LABELS = {
  new: 'На согласовании',
  clarification: 'Нужно уточнение',
  approved: 'Согласована',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
  issued: 'Выдана',
  returned: 'Возвращена',
};

// Active bookings hold the equipment for their period (FR-06, NFR-03).
export const ACTIVE_BOOKING_STATUSES = ['new', 'clarification', 'approved', 'issued'];

export const EQUIPMENT_STATUS_LABELS = {
  available: 'Доступна',
  reserved: 'Забронирована',
  issued: 'Выдана',
  inspection: 'На проверке',
  unavailable: 'Недоступна',
};

export const RETURN_CONDITION_LABELS = {
  full: 'Полный комплект',
  shortage: 'Недостача',
  damaged: 'Повреждение',
};

export const CATEGORIES = ['Камеры', 'Звук', 'Свет', 'Стабилизаторы и штативы', 'VR и дроны'];

export const TICKET_CATEGORY_LABELS = {
  booking: 'Ошибка оформления заявки',
  equipment_card: 'Не открывается карточка оборудования',
  other: 'Другое',
};

export const TICKET_PRIORITY_LABELS = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
export const TICKET_STATUS_LABELS = { open: 'Новое', in_progress: 'В работе', resolved: 'Решено' };
export const PROBLEM_STATUS_LABELS = { open: 'Зарегистрирована', fixing: 'Исправляется', closed: 'Закрыта' };
