import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const swaggerDist = dirname(require.resolve('swagger-ui-dist/swagger-ui.css'));
const contractYaml = resolve(
  here,
  '../../../specs/001-personal-finance-manager/contracts/openapi.yaml',
);
const outDir = resolve(here, '../public/docs');

mkdirSync(outDir, { recursive: true });

for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'favicon-32x32.png']) {
  copyFileSync(join(swaggerDist, asset), join(outDir, asset));
}
copyFileSync(contractYaml, join(outDir, 'openapi.yaml'));

writeFileSync(
  join(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Estateably Finance API</title>
    <link rel="stylesheet" href="./swagger-ui.css" />
    <link rel="icon" type="image/png" href="./favicon-32x32.png" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="./swagger-ui-bundle.js"></script>
    <script src="./swagger-init.js"></script>
  </body>
</html>
`,
);

writeFileSync(
  join(outDir, 'swagger-init.js'),
  `window.ui = SwaggerUIBundle({
  url: './openapi.yaml',
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis],
  deepLinking: true,
});
`,
);

console.log(`docs copied to ${outDir}`);
