'use strict';
const fs = require('node:fs');

// Accessibility must run in every QA entry point; a missing dependency is an error.
let axePath;
try {
  axePath = process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js');
} catch (cause) {
  throw new Error('axe-core is required for QA. Run npm ci, or set AXE_CORE_PATH to axe.min.js.', { cause });
}
let axeSource;
try {
  axeSource = fs.readFileSync(axePath, 'utf8');
} catch (cause) {
  throw new Error('Cannot read axe-core at ' + axePath + '. Run npm ci or correct AXE_CORE_PATH.', { cause });
}
module.exports = { axePath, axeSource };
