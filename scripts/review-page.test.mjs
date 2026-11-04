import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {buildReviewPage} from './build-review.mjs';
test('review/index.html is generated from the Sheet dialog and is up to date',async()=>{
 const built=await buildReviewPage('.');const committed=await readFile('review/index.html','utf8');
 assert.equal(committed,built,'Run: npm run build:review');
 assert(!/GITHUB_EXPORT_TOKEN"?\s*[:=]\s*['"][^'"]{8}/.test(committed),'no secrets in the page');
});
