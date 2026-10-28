// Run the public ranking and category governance flows sequentially in Google Chrome.
import './public-regression.js';
await import('./classification-browser.js');

await import('./atlas-browser.js');

await import('./partners-browser.js');
