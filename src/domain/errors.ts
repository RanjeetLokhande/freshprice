export type DomainErrorCode = 'INCOMPATIBLE_UNITS' | 'PRICE_MISSING' | 'VALIDATION_ERROR' | 'NOT_FOUND';

/** Business-rule failure. `field` lets the API map it onto a form path. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
