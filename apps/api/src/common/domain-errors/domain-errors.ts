export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'DOMAIN_RULE_VIOLATION'
  | 'AI_NOT_CONFIGURED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'INTERNAL_ERROR';

export type ErrorDetail = { field: string; message: string };

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationFailedError extends DomainError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_FAILED', 'Validation failed', details);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: bigint | string) {
    super('NOT_FOUND', `${entity} ${id} does not exist`);
  }
}

export class DuplicateNameError extends DomainError {
  constructor(entity: string, name: string) {
    super(
      'DUPLICATE_NAME',
      `${entity[0].toUpperCase()}${entity.slice(1)} named "${name}" already exists`,
      [{ field: 'name', message: 'name is already in use' }],
    );
  }
}

export class DomainRuleViolationError extends DomainError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('DOMAIN_RULE_VIOLATION', message, details);
  }
}

export class ArchivedAccountError extends DomainRuleViolationError {
  constructor(field: string, id: bigint | string) {
    super(`Account ${id} is archived`, [{ field, message: 'account is archived' }]);
  }
}

export class ArchivedCategoryError extends DomainRuleViolationError {
  constructor(id: bigint | string) {
    super(`Category ${id} is archived`, [{ field: 'categoryId', message: 'category is archived' }]);
  }
}

export class CategoryTypeMismatchError extends DomainRuleViolationError {
  constructor(expected: 'expense' | 'income') {
    super(`The category's type does not match the transaction kind`, [
      { field: 'categoryId', message: `must be a category of type ${expected}` },
    ]);
  }
}

export class SameAccountTransferError extends DomainRuleViolationError {
  constructor() {
    super('A transfer cannot use the same account as source and destination', [
      { field: 'counterAccountId', message: 'must differ from accountId' },
    ]);
  }
}

export class ClosedProjectError extends DomainRuleViolationError {
  constructor(id: bigint | string) {
    super(`Project ${id} is closed`, [{ field: 'projectId', message: 'project is closed' }]);
  }
}

export class ProjectOnNonExpenseError extends DomainRuleViolationError {
  constructor() {
    super('Only an expense may carry a project', [
      { field: 'projectId', message: 'allowed only when kind is expense' },
    ]);
  }
}

export class ProjectInUseError extends DomainRuleViolationError {
  constructor(id: bigint | string) {
    super(`Project ${id} is referenced by transactions and cannot be deleted; close it instead`);
  }
}

export class OpeningKindChangeError extends DomainRuleViolationError {
  constructor() {
    super('An opening transaction never changes kind; edit it through the account instead', [
      { field: 'kind', message: 'opening never interchanges with other kinds' },
    ]);
  }
}

export class CategoryInUseError extends DomainRuleViolationError {
  constructor(id: bigint | string) {
    super(`Category ${id} is referenced by transactions; its type is immutable`, [
      { field: 'type', message: 'type is immutable once the category is used' },
    ]);
  }
}

export class FutureDateError extends DomainRuleViolationError {
  constructor(field = 'date') {
    super('The date cannot be in the future', [{ field, message: 'must be today or earlier' }]);
  }
}

export class DateRangeError extends DomainRuleViolationError {
  constructor(message: string) {
    super(message, [{ field: 'from', message }]);
  }
}

export class AiNotConfiguredError extends DomainError {
  constructor() {
    super('AI_NOT_CONFIGURED', 'No LLM provider key is configured');
  }
}

export class AiProviderError extends DomainError {
  constructor() {
    super('AI_PROVIDER_ERROR', 'The LLM provider answered with an error');
  }
}

export class AiRateLimitedError extends DomainError {
  constructor() {
    super('AI_RATE_LIMITED', 'The LLM provider rate limit was hit');
  }
}

export class AiTimeoutError extends DomainError {
  constructor(timeoutMs: number) {
    super('AI_TIMEOUT', `The LLM provider timed out after ${timeoutMs} ms`);
  }
}
