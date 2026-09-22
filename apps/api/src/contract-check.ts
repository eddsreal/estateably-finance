import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { ModulesContainer, NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

const CONTRACTS_DIR = resolve(__dirname, '../../../specs/001-personal-finance-manager/contracts');

const METHOD_NAMES: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

function normalize(prefix: string, path: string): string {
  const joined = `/${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

async function registeredOperations(): Promise<Set<string>> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const operations = new Set<string>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const controller of module.controllers.values()) {
      const cls = controller.metatype as { prototype: Record<string, unknown> } | undefined;
      if (!cls?.prototype) continue;
      const prefix = (Reflect.getMetadata('path', cls) as string | undefined) ?? '/';
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata('path', handler) as string | undefined;
        const method = Reflect.getMetadata('method', handler) as RequestMethod | undefined;
        const methodName = method === undefined ? undefined : METHOD_NAMES[method];
        if (path === undefined || methodName === undefined) continue;
        operations.add(`${methodName} ${normalize(prefix, path)}`);
      }
    }
  }
  await app.close();
  return operations;
}

function contractOperations(yaml: string): Set<string> {
  const operations = new Set<string>();
  let inPaths = false;
  let currentPath = '';
  for (const line of yaml.split('\n')) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) break;
    if (!inPaths) continue;
    const pathMatch = line.match(/^ {2}(\/\S*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch && currentPath) {
      operations.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return operations;
}

async function main(): Promise<void> {
  const yaml = readFileSync(resolve(CONTRACTS_DIR, 'openapi.yaml'), 'utf8');
  const contract = contractOperations(yaml);
  const registered = await registeredOperations();

  const extra = [...registered].filter((operation) => !contract.has(operation)).sort();
  const missing = [...contract].filter((operation) => !registered.has(operation)).sort();

  for (const operation of extra) {
    console.error(`contract:check FAILED: route not in the frozen contract: ${operation}`);
  }
  for (const operation of missing) {
    console.warn(`contract:check pending: contract operation not implemented yet: ${operation}`);
  }

  const frozenSchema = readFileSync(resolve(CONTRACTS_DIR, 'schema.prisma'));
  const copiedSchema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'));
  const schemaDrift = !frozenSchema.equals(copiedSchema);
  if (schemaDrift) {
    console.error(
      'contract:check FAILED: apps/api/prisma/schema.prisma is not byte-identical to the frozen contract schema',
    );
  }

  if (extra.length > 0 || schemaDrift) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `contract:check OK: ${registered.size}/${contract.size} contract operations implemented, no undocumented route, schema byte-identical`,
  );
}

void main();
