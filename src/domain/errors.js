export class DomainError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const invalid = (message) => new DomainError('validation', message, 400);
export const notFound = (message) => new DomainError('not_found', message, 404);
export const conflict = (message, details = null) => new DomainError('conflict', message, 409, details);
export const forbidden = (message = 'Недостаточно прав для этого действия') =>
  new DomainError('forbidden', message, 403);
