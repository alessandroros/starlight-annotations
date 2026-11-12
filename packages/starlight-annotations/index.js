// starlight-annotations: let readers highlight text and leave notes on a
// Starlight site. See README.md for the options and the server setup.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VIRTUAL_ID = 'virtual:starlight-annotations/config';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** @param {import('./index').StarlightAnnotationsOptions} [options] */
export default function starlightAnnotations(options = {}) {
  const config = resolveOptions(options);
  return {
    name: 'starlight-annotations',
    hooks: {
      'config:setup'({ addIntegration, config: starlightConfig, updateConfig }) {
        // Starlight links customCss on every page, in dev and in the build.
        // (CSS imported by an injected script is bundled but not linked.)
        updateConfig({ customCss: [...(starlightConfig.customCss ?? []), 'starlight-annotations/styles.css'] });
        addIntegration(annotationsIntegration(config));
      },
    },
  };
}

function resolveOptions(options) {
  const backend = options.backend ?? 'api';
  if (backend !== 'api' && backend !== 'browser') {
    throw new Error(`starlight-annotations: "backend" must be "api" or "browser", not ${JSON.stringify(backend)}.`);
  }
  const apiBase = (options.apiBase ?? '/_annotations').replace(/\/$/, '');
  const longQuote = options.longQuote ?? 400;
  if (!Number.isInteger(longQuote) || longQuote < 100) {
    throw new Error('starlight-annotations: "longQuote" must be an integer of at least 100.');
  }
  return {
    backend,
    apiBase,
    content: options.content ?? '.sl-markdown-content',
    exclude: options.exclude ?? [],
    longQuote,
    translations: options.translations ?? {},
    storageKey: options.storageKey ?? 'starlight-annotations',
    dev: options.dev ?? {},
  };
}

function annotationsIntegration(config) {
  // Only what the browser needs goes into the bundle.
  const { dev, ...clientConfig } = config;
  let base = '';
  let root = process.cwd();

  return {
    name: 'starlight-annotations',
    hooks: {
      'astro:config:setup'({ config: astroConfig, injectScript, updateConfig }) {
        base = astroConfig.base.replace(/\/$/, '');
        root = fileURLToPath(astroConfig.root);
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'starlight-annotations-config',
                resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
                load: (id) => (id === RESOLVED_ID ? `export default ${JSON.stringify(clientConfig)};` : undefined),
              },
            ],
          },
        });
        injectScript('page', `import 'starlight-annotations/client';`);
      },

      // `astro dev` serves the same API from disk, so the feature works
      // without a server. The author is your `git config user.name`.
      async 'astro:server:setup'({ server, logger }) {
        if (config.backend !== 'api' || dev === false || !config.apiBase.startsWith('/')) return;
        const { createAnnotationsHandler, staticAuth } = await import('./src/server/index.js');
        const { fsStorage, toNodeMiddleware } = await import('./src/server/node.js');
        const dir = path.resolve(root, dev.dir ?? '.annotations');
        const middleware = toNodeMiddleware(
          createAnnotationsHandler({
            storage: fsStorage({ dir }),
            auth: staticAuth(dev.user ?? gitUser(root)),
            prefix: config.apiBase,
          }),
        );
        // Vite may or may not have stripped the site base from req.url yet.
        server.middlewares.use((req, res, next) => {
          const url = base && req.url?.startsWith(`${base}${config.apiBase}/`) ? req.url.slice(base.length) : req.url;
          if (!url?.startsWith(`${config.apiBase}/`)) return next();
          req.url = url;
          return middleware(req, res, next);
        });
        logger.info(`Notes are stored in ${path.relative(root, dir) || '.'} during development.`);
      },
    },
  };
}

function gitUser(cwd) {
  let name = '';
  try {
    name = execFileSync('git', ['config', 'user.name'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    // Not a Git checkout, or no name set.
  }
  name ||= 'local';
  return { login: name.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), name };
}
