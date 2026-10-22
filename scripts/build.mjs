import {build} from 'esbuild';
const common={bundle:true,jsx:'automatic',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}};
await build({...common,entryPoints:['src/main.tsx'],outfile:'docs/assets/app.js',platform:'browser',target:'es2020'});
await build({...common,entryPoints:['src/render.tsx'],outfile:'scripts/render.cjs',platform:'node',format:'cjs',target:'node22'});
console.log('Frontend and static renderer built. Run npm run sync to export published listings.');

await build({...common,entryPoints:['src/crop.ts'],outfile:'scripts/crop.cjs',platform:'node',format:'cjs',target:'node22'});
