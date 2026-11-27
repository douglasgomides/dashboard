import { build } from 'esbuild';
await build({ entryPoints: ['server/acompanhamento-vps.ts'], outfile: 'build/acompanhamento-vps.mjs', bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external', external: ['/app/build/vps.mjs'], logLevel: 'info' });
