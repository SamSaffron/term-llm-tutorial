// Exercise native Ghostty keyboard input, never an HTML composer or serial shortcut.
export async function sendCLI(page, text) {
 if (await page.locator('#tab-chat').isVisible()) await page.locator('#tab-chat').click();
 await page.locator('#terminal textarea').focus();
 await page.keyboard.type(text, {delay:10});
 await page.keyboard.press('Enter');
}
