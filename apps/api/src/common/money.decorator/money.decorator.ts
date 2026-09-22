import { registerDecorator, ValidationOptions } from 'class-validator';

const MONEY_PATTERN = /^-?[0-9]{1,16}$/;
const LIMIT = 10n ** 15n;

export type MoneyOptions = { positive?: boolean };

export function parseMoney(value: unknown, options: MoneyOptions = {}): bigint | undefined {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) return undefined;
  const cents = BigInt(value);
  if (cents > LIMIT || cents < -LIMIT) return undefined;
  if (options.positive && cents <= 0n) return undefined;
  return cents;
}

export function IsMoney(
  options: MoneyOptions = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isMoney',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => parseMoney(value, options) !== undefined,
        defaultMessage: () =>
          options.positive
            ? '$property must be a positive integer number of cents'
            : '$property must be a string of integer cents with absolute value at most 10^15',
      },
    });
  };
}
