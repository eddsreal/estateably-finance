import Ajv from 'ajv';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect } from 'vitest';

const yamlPath = resolve(
  process.cwd(),
  '../../specs/001-personal-finance-manager/contracts/openapi.yaml',
);
const document = load(readFileSync(yamlPath, 'utf8')) as object;

const ajv = new Ajv({ strict: false, validateFormats: true });
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
ajv.addSchema(document, 'api');

export function expectValid(schemaName: string, body: unknown): void {
  const validate =
    ajv.getSchema(`api#/components/schemas/${schemaName}`) ??
    ajv.compile({ $ref: `api#/components/schemas/${schemaName}` });
  const valid = validate(body);
  if (!valid) {
    expect.fail(
      `response does not match ${schemaName}: ${JSON.stringify(validate.errors)}\n${JSON.stringify(body)}`,
    );
  }
}

export function expectError(body: unknown, code: string): void {
  expectValid('ErrorResponse', body);
  expect((body as { code: string }).code).toBe(code);
}
