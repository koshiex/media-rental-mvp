import { isIsoDate } from './dates.js';
import { invalid } from './errors.js';

const isBlank = (value) => value === undefined || value === null || value === '';

export function requireText(value, field, { max = 500, optional = false } = {}) {
  if (isBlank(value)) {
    if (optional) return '';
    throw invalid(`Заполните поле «${field}»`);
  }
  if (typeof value !== 'string') throw invalid(`Поле «${field}» должно быть строкой`);
  const text = value.trim();
  if (!text && !optional) throw invalid(`Заполните поле «${field}»`);
  if (text.length > max) throw invalid(`Поле «${field}» длиннее ${max} символов`);
  return text;
}

export function requireId(value, field) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw invalid(`Некорректный идентификатор: ${field}`);
  return id;
}

export function optionalId(value, field) {
  return isBlank(value) ? null : requireId(value, field);
}

export function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw invalid(`Недопустимое значение поля «${field}»`);
  return value;
}

export function requireDate(value, field) {
  if (!isIsoDate(value)) throw invalid(`Поле «${field}» должно быть датой`);
  return value;
}

export function requireInt(value, field, { min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw invalid(`Поле «${field}» должно быть целым числом от ${min} до ${max}`);
  }
  return number;
}

export function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw invalid(`Поле «${field}» должно быть логическим`);
  return value;
}

export function requireTextList(value, field, { minItems = 1, maxItems = 20, maxLength = 80 } = {}) {
  if (!Array.isArray(value)) throw invalid(`Поле «${field}» должно быть списком`);
  const items = value.map((item) => requireText(item, field, { max: maxLength }));
  if (items.length < minItems || items.length > maxItems) {
    throw invalid(`В поле «${field}» должно быть от ${minItems} до ${maxItems} позиций`);
  }
  return items;
}
