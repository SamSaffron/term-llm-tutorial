# Terminal fit and line editing

The terminal and lesson share an equal-height workspace row. Pane height is
capped at 760 CSS pixels and reduced for the available viewport, reserving 96
pixels below for the hint/diagnostics. The terminal gets the full remaining
height below its header, and the lesson scrolls within its pane. Desktop columns
use a 1.4:1 ratio instead of 1.65:1 to give the tutorial more reading room.

wterm writes a row-based inline height even when its automatic resize observer
is disabled. That previously left a ~414px terminal inside an ~843px pane at a
1440×1000 viewport. The app now owns the pane size, and a flex child with an
explicit CSS height override prevents wterm's inline height from shrinking it.
The terminal is measured afterwards and the actual rows/columns are sent to the
guest TTY. There is still only one resize owner.

## Backspace

The keyboard was already sending DEL (`0x7f`), and zsh's command buffer was
correctly deleting characters. The screen did not reliably repaint them:
`TERM=xterm-kitty` had no terminfo entry in the minimal guest shell bundle.
The boot log explicitly reported the missing definition.

The guest now exposes the bundled `xterm-256color` text capabilities under the
`xterm-kitty` lookup name and sets `TERMINFO` before starting zsh. This is a
conservative text-capability alias, not a claim to ship Kitty-specific terminfo
extensions. Native Kitty graphics detection remains enabled and unchanged.
There is no browser-side Backspace interception or terminal-output rewriting.

## Regression checks

`scripts/terminal-input-live.mjs` uses local hashed staging, a real v86 guest,
and actual browser keyboard events. It checks visible line contents **before
Enter**, then actual command output: end-of-line and middle-of-line Backspace,
after a native inline Demo image, after native chat/quit, and after resizing.
It also checks Backspace in the chat composer, no missing-terminfo warning,
pane bottoms, terminal row coverage and the guest's `stty size`.

Viewports: 1440×1000, 1100×750, 1920×1400, 720×500 and 390×844. Mobile tutorial
and terminal tabs remain accessible without horizontal page overflow. These
are viewport tests, not a claim to have tested every browser zoom/IME/platform.

```sh
npm run build
node scripts/stage-hosting.mjs
node scripts/terminal-input-live.mjs
```

Configure the authenticated CDP proxy as for the other browser tests. Evidence
stays in ignored `evidence/`; no deployment or browser restart is required.
Existing guest sessions need a fresh boot to receive the terminfo setup.
