import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { appToday, toDate, toDateOnly } from '../dates/dates';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[0-9]{1,18}$/;

export function isDateOnlyString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = toDate(value);
  return !Number.isNaN(parsed.getTime()) && toDateOnly(parsed) === value;
}

export function isIdString(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function register(
  name: string,
  validate: (value: unknown) => boolean,
  message: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name,
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: { validate, defaultMessage: () => message },
    });
  };
}

export function IsDateOnly(validationOptions?: ValidationOptions): PropertyDecorator {
  return register(
    'isDateOnly',
    isDateOnlyString,
    '$property must be a real calendar date formatted YYYY-MM-DD',
    validationOptions,
  );
}

export function IsIdString(validationOptions?: ValidationOptions): PropertyDecorator {
  return register(
    'isIdString',
    isIdString,
    '$property must be a decimal id string',
    validationOptions,
  );
}

export function IsTodayOrEarlier(validationOptions?: ValidationOptions): PropertyDecorator {
  return register(
    'isTodayOrEarlier',
    (value) => isDateOnlyString(value) && value <= appToday(),
    '$property must be today or earlier',
    validationOptions,
  );
}

export function Trimmed(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === undefined
        ? false
        : value,
  );
}
