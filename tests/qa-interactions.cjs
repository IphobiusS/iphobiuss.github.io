/* Native disclosures introduced by the portfolio-first home. */
'use strict';
async function openDisclosure(page, selector) {
 const disclosure = page.locator(selector);
 if (await disclosure.getAttribute('open') === null) {
  await disclosure.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
 }
}
module.exports = {
 openAppearance: page => openDisclosure(page, '[data-appearance]'),
 openLibrary: page => openDisclosure(page, '[data-library]'),
 openTerminal: page => openDisclosure(page, '.session-shell')
};
