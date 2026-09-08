# Native inline images

`term-llm image "prompt"` saves and displays the selected provider's image **in the
terminal**. The sidebar stays on the current lesson. There is no preview panel,
image download link, CLI wrapper, special image flag or CLI output translation.
Existing bottom controls remain for Janus consent, model release and text reload.

## Terminal implementation and provenance

- Clean native CLI remains `ba07b58441a660e3f279837851a8d32eb948f083`, unchanged.
- wterm source: `vercel-labs/wterm`, exact commit
  `89cd4ad788563ce3e492664fdaa31debc909d62a` (0.5.0).
- Reviewed source patch: `patches/wterm-kitty-unicode.patch`. This is a local
  terminal compatibility patch, not a claim of an upstream wterm release/merge.
- `scripts/build-wterm.sh` fetches exact source, applies the patch, installs its
  frozen pnpm lockfile, rebuilds the WASM and TypeScript, and runs core/DOM tests.
  The build uses pnpm 11.1.3 and SHA-256-verified official Zig 0.15.2. Current
  bootstrap script supports Linux x86_64 builders; browsers remain cross-platform.
  Generated binaries/source/tool caches stay in ignored `.wterm/`.
- Ghostty v1.3.1 and its dependency hashes remain pinned by wterm's Zig manifest.
  Existing Apache-2.0/MIT notices remain applicable; no model/license changes.

The WASM adapter uses Ghostty's Unicode-placement iterator to resolve the image
ID, placement ID, source grid cells, retained rows and overwritten fragments.
It exports those fragments to the DOM renderer. Placeholder glyphs are blanked
in the render snapshot (not removed from the terminal's own cells). Adjacent
fragments are joined to avoid fractional-row canvas seams. The renderer draws
the aspect-preserving image clipped to those real terminal cells. Text, cursor,
scrollback and image placement remain owned by the terminal.

The patched core and JS adapter use a matching 76-byte placement ABI and must
be deployed together. The tutorial build selects both from the same source;
hashed staging/cache URLs keep them coherent. The native CLI streams PNG over
Kitty `t=d`; the browser does not access guest file paths to display images.

The old ReleaseSmall build reproduced corruption/hangs under shrink/grow/shrink
with dense Unicode grids. The ReleaseSafe build passes the captured regression
and added dense-grid test. The underlying optimizer/undefined-behavior cause is
not claimed as isolated. Shipping safety-enabled WASM costs roughly 3.4 MB raw
instead of 0.6 MB. App geometry now has one owner, rather than app fitting and
wterm's resize observer fighting over different column counts.

## Supported scope

Direct Kitty image transport/placements remain supported. This patch adds
Unicode virtual placements **with explicit row/column grids**, as emitted by
the native term-llm CLI/TUI. Automatic-size virtual grids, animation,
file/shared-memory/URL transport, and OSC 1337 are not newly supported. This is
not a blanket claim of full Kitty protocol conformance or full native TUI testing.

## Verification

- Terminal tests: 66 Ghostty-core tests and 201 DOM tests, including byte-chunked
  grids, overwritten cells, alternate screens, deletion, and dense reflow.
- Tutorial tests cover removal of sidebar image DOM and enabling native Kitty.
- Actual v86 guest and stock CLI: launch-selected Demo, two successive images,
  resize and retained scrollback; exact canned PNG saved without Janus downloads.
- Actual browser GPU Janus: native CLI saves a genuine PNG and paints terminal
  canvases; no sidebar output. Cancel, unavailable-provider/no-fallback, text
  reload, files/lesson preservation, completion and shutdown are exercised.
- The first twelve CLI lessons also pass in the real guest with Simulator,
  including approvals, MCP, chat/resume, agents, export, all six inline Demo
  images, PNG piping and mobile tabs. Lesson 13 (native web) was not rerun here.
  Corrected an obsolete `10 OF 12` assertion in that harness to `11 OF 13`.
- Browser tests route local hashed staging through the shared authenticated
  browser. They do not deploy or change browser flags. Evidence is ignored.

```sh
npm run build
node scripts/stage-hosting.mjs
IMAGE_TEST_DEMO=1 IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
IMAGE_TEST_STAGED=1 node scripts/image-generator-live.mjs
```
