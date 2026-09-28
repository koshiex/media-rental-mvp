// Demo dataset. Dates are offsets from "today" so the demo always has
// fresh overdue items, requests waiting for approval and a filled report.

export const USERS = [
  { key: 'ivan', name: 'Иван Петров', role: 'recipient', kind: 'student', group: 'МД-21-01', clearance: true },
  { key: 'anna', name: 'Анна Смирнова', role: 'recipient', kind: 'teacher', group: null, clearance: true },
  { key: 'kirill', name: 'Кирилл Орлов', role: 'recipient', kind: 'student', group: 'МД-22-03', clearance: false },
  { key: 'maria', name: 'Мария Соколова', role: 'staff', kind: 'employee', group: null, clearance: false },
  { key: 'dmitry', name: 'Дмитрий Волков', role: 'admin', kind: 'employee', group: null, clearance: true },
  { key: 'elena', name: 'Елена Кузнецова', role: 'support', kind: 'employee', group: null, clearance: false },
  { key: 'olga', name: 'Ольга Николаева', role: 'manager', kind: 'employee', group: null, clearance: true },
];

export const EQUIPMENT = [
  {
    key: 'sony', inv: 'МП-КАМ-001', name: 'Sony Alpha 7 III', category: 'Камеры', clearance: true, maxDays: 5,
    kit: ['Корпус камеры', 'Объектив 28–70 мм', '2 аккумулятора', 'Зарядное устройство', 'Карта SD 128 ГБ', 'Кофр'],
    description: 'Полнокадровая беззеркальная камера для видео 4K и репортажной съёмки.',
  },
  {
    key: 'canon', inv: 'МП-КАМ-002', name: 'Canon EOS R6', category: 'Камеры', clearance: false, maxDays: 5,
    kit: ['Корпус камеры', 'Объектив 24–105 мм', '2 аккумулятора', 'Зарядное устройство', 'Карта SD 128 ГБ'],
    description: 'Универсальная камера для учебных проектов: фото, интервью, короткие ролики.',
  },
  {
    key: 'bmpcc', inv: 'МП-КАМ-003', name: 'Blackmagic Pocket Cinema 6K', category: 'Камеры', clearance: true, maxDays: 3,
    kit: ['Корпус камеры', 'Объектив 18–35 мм', '3 аккумулятора', 'SSD 1 ТБ', 'Клетка'],
    description: 'Кинокамера для курсовых фильмов, съёмка в RAW.',
  },
  {
    key: 'gopro', inv: 'МП-КАМ-004', name: 'GoPro HERO12 Black', category: 'Камеры', clearance: false, maxDays: 7,
    kit: ['Камера', 'Крепление на шлем', '2 аккумулятора', 'Карта microSD 64 ГБ'],
    description: 'Экшн-камера для съёмки от первого лица и таймлапсов.',
  },
  {
    key: 'gh5', inv: 'МП-КАМ-005', name: 'Panasonic Lumix GH5', category: 'Камеры', clearance: false, maxDays: 5,
    status: 'unavailable', kit: ['Корпус камеры', 'Объектив 12–60 мм', 'Аккумулятор'],
    description: 'В ремонте: не работает стабилизатор матрицы.',
  },
  {
    key: 'rode', inv: 'МП-ЗВК-001', name: 'Rode Wireless GO II', category: 'Звук', clearance: false, maxDays: 7,
    kit: ['2 передатчика', 'Приёмник', '2 петличных микрофона', 'Кабели', 'Чехол'],
    description: 'Беспроводная петличная система для интервью и подкастов.',
  },
  {
    key: 'zoom', inv: 'МП-ЗВК-002', name: 'Рекордер Zoom H6', category: 'Звук', clearance: false, maxDays: 7,
    kit: ['Рекордер', 'Капсюль XY', 'Ветрозащита', 'Карта SD 32 ГБ', '4 батареи AA'],
    description: 'Шестиканальный рекордер для записи звука на площадке.',
  },
  {
    key: 'shure', inv: 'МП-ЗВК-003', name: 'Микрофон Shure SM7B', category: 'Звук', clearance: false, maxDays: 5,
    kit: ['Микрофон', 'Кабель XLR', 'Настольная стойка'],
    description: 'Студийный микрофон для подкастов и озвучки.',
  },
  {
    key: 'aputure', inv: 'МП-СВТ-001', name: 'Aputure LS 300d II', category: 'Свет', clearance: true, maxDays: 3,
    kit: ['Осветитель', 'Блок питания', 'Рефлектор', 'Софтбокс', 'Стойка'],
    description: 'Мощный LED-осветитель, нужен инструктаж по технике безопасности.',
  },
  {
    key: 'godox', inv: 'МП-СВТ-002', name: 'Набор Godox SL60W (2 шт.)', category: 'Свет', clearance: false, maxDays: 5,
    kit: ['2 осветителя', '2 стойки', '2 софтбокса', 'Сумка'],
    description: 'Комплект постоянного света для интервью.',
  },
  {
    key: 'rs3', inv: 'МП-СТБ-001', name: 'Стабилизатор DJI RS 3 Pro', category: 'Стабилизаторы и штативы', clearance: false,
    maxDays: 5, kit: ['Стабилизатор', 'Ручка-штатив', 'Кабели управления', 'Кейс'],
    description: 'Трёхосевой стабилизатор для камер до 4,5 кг.',
  },
  {
    key: 'manfrotto', inv: 'МП-СТБ-002', name: 'Штатив Manfrotto 055', category: 'Стабилизаторы и штативы',
    clearance: false, maxDays: 7, kit: ['Штатив', 'Видеоголова', 'Чехол'],
    description: 'Тяжёлый штатив с видеоголовой для статичных планов.',
  },
  {
    key: 'quest', inv: 'МП-VR-001', name: 'VR-шлем Meta Quest 3', category: 'VR и дроны', clearance: false, maxDays: 3,
    kit: ['Шлем', '2 контроллера', 'Зарядное устройство', 'Лицевой интерфейс'],
    description: 'Шлем виртуальной реальности для проектов по VR и 3D.',
  },
  {
    key: 'mini4', inv: 'МП-VR-002', name: 'Дрон DJI Mini 4 Pro', category: 'VR и дроны', clearance: true, maxDays: 2,
    kit: ['Дрон', 'Пульт', '3 аккумулятора', 'Зарядный хаб', 'Запасные пропеллеры'],
    description: 'Компактный дрон для аэросъёмки кампуса. Полёты только с допуском.',
  },
];

// start/end are day offsets from today; the equipment status is derived from these bookings in seed.js.
export const BOOKINGS = [
  { user: 'ivan', equipment: 'sony', start: -5, end: -2, status: 'issued', purpose: 'Репортаж со Дня первокурсника' },
  { user: 'kirill', equipment: 'godox', start: -4, end: -1, status: 'issued', purpose: 'Интервью для студенческого медиа' },
  { user: 'ivan', equipment: 'rs3', start: -1, end: 1, status: 'issued', purpose: 'Съёмка промо-ролика кафедры' },
  { user: 'anna', equipment: 'zoom', start: 0, end: 2, status: 'approved', purpose: 'Запись лекции для курса «Звукорежиссура»' },
  { user: 'anna', equipment: 'sony', start: 4, end: 6, status: 'approved', purpose: 'Практикум по операторскому мастерству' },
  { user: 'kirill', equipment: 'canon', start: 1, end: 3, status: 'new', purpose: 'Фотосессия для курсового проекта по дизайну' },
  { user: 'anna', equipment: 'aputure', start: 2, end: 4, status: 'new', purpose: 'Световая схема для учебного интервью' },
  {
    user: 'kirill', equipment: 'quest', start: 3, end: 4, status: 'clarification', purpose: 'Тестирование VR-прототипа',
    staffComment: 'Уточните дисциплину и ответственного преподавателя',
  },
  {
    user: 'kirill', equipment: 'rode', start: 1, end: 2, status: 'rejected', purpose: 'Подкаст с одногруппниками', created: -3,
    staffComment: 'Комплект зарезервирован под день открытых дверей',
  },
  { user: 'ivan', equipment: 'bmpcc', start: 5, end: 6, status: 'cancelled', purpose: 'Курсовой фильм', cancelReason: 'Съёмку перенесли' },
  {
    user: 'ivan', equipment: 'mini4', start: -8, end: -7, status: 'returned', purpose: 'Аэросъёмка кампуса',
    condition: 'damaged', returnComment: 'Сломан пропеллер, царапины на корпусе',
  },
  {
    user: 'ivan', equipment: 'gopro', start: -12, end: -9, status: 'returned', purpose: 'Съёмка похода турклуба',
    condition: 'damaged', returnComment: 'Трещина защитного стекла объектива', returnedLate: 1,
  },
  {
    user: 'kirill', equipment: 'zoom', start: -9, end: -7, status: 'returned', purpose: 'Запись подкаста',
    condition: 'shortage', returnComment: 'Не вернули ветрозащиту',
  },
  { user: 'anna', equipment: 'manfrotto', start: -15, end: -12, status: 'returned', purpose: 'Съёмка лекции', condition: 'full' },
  { user: 'anna', equipment: 'shure', start: -20, end: -16, status: 'returned', purpose: 'Озвучка учебного курса', condition: 'full' },
  { user: 'ivan', equipment: 'canon', start: -10, end: -6, status: 'returned', purpose: 'Фотоотчёт с хакатона', condition: 'full' },
  { user: 'ivan', equipment: 'aputure', start: -7, end: -5, status: 'returned', purpose: 'Предметная съёмка', condition: 'full', returnedLate: 2 },
  { user: 'kirill', equipment: 'canon', start: -18, end: -15, status: 'returned', purpose: 'Съёмка спортивного турнира', condition: 'full' },
  { user: 'anna', equipment: 'rode', start: -14, end: -12, status: 'returned', purpose: 'Интервью с выпускниками', condition: 'full' },
];

export const PROBLEMS = [
  {
    key: 'card', title: 'Карточка оборудования не открывается при длинном составе комплекта',
    cause: 'Интерфейс карточки не переносит строки состава, если в комплекте больше четырёх позиций',
    impact: 'Получатели не видят состав комплекта дронов и кинокамер', status: 'fixing', created: -3,
  },
];

export const TICKETS = [
  {
    user: 'ivan', category: 'equipment_card', priority: 'high', status: 'in_progress', problem: 'card', created: -4,
    subject: 'Не открывается карточка DJI Mini 4 Pro', description: 'После нажатия на карточку страница остаётся пустой.',
  },
  {
    user: 'kirill', category: 'booking', priority: 'medium', status: 'open', booking: 'kirill:rode', created: -2,
    subject: 'Заявка не отправляется с первого раза',
    description: 'Нажимаю «Отправить», появляется ошибка, со второго раза заявка создаётся.',
  },
  {
    user: 'anna', category: 'booking', priority: 'medium', status: 'open', created: -1,
    subject: 'Ошибка при создании заявки на свет',
    description: 'Выбрала даты и нажала «Отправить» — ошибка сервера. Повторная отправка прошла.',
  },
  {
    user: 'ivan', category: 'booking', priority: 'low', status: 'open', created: 0,
    subject: 'Дублируется отправка заявки',
    description: 'Кнопка «Отправить» срабатывает только со второго нажатия.',
  },
];
