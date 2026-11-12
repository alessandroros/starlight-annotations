import { readFileSync } from 'node:fs';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightAnnotations from 'starlight-annotations';

// The published docs are static (GitHub Pages), so the demo keeps notes in the
// browser. `ANNOTATIONS_BACKEND=api npm run dev` tries the API backend instead,
// with notes written to docs/.annotations/.
export default defineConfig({
  site: process.env.DOCS_SITE ?? 'https://alessandroros.github.io',
  base: process.env.DOCS_BASE ?? '/starlight-annotations',
  integrations: [
    starlight({
      title: 'Starlight Annotations',
      description: 'Let readers highlight text and leave notes on your Starlight docs. Notes live in your Git repository.',
      // Example notes for the demo page (see src/demo-seed.js).
      head: [{ tag: 'script', content: readFileSync(new URL('./src/demo-seed.js', import.meta.url), 'utf8') }],
      customCss: ['./src/demo-reset.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/alessandroros/starlight-annotations' }],
      editLink: { baseUrl: 'https://github.com/alessandroros/starlight-annotations/edit/main/docs/' },
      sidebar: [
        { label: 'Start here', items: ['getting-started', 'guides/demo'] },
        { label: 'Guides', items: ['guides/github', 'guides/cloudflare', 'guides/other-hosts', 'guides/browser-notes'] },
        { label: 'Reference', items: ['reference/options', 'reference/server', 'reference/format', 'reference/security'] },
      ],
      plugins: [starlightAnnotations({ backend: process.env.ANNOTATIONS_BACKEND === 'api' ? 'api' : 'browser' })],
    }),
  ],
});
