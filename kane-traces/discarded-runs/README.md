# Discarded runs

Real Kane runs, kept for the record but excluded from the site's evidence. Two
problems made them unreliable.

**1. The "mobile" objective never ran at mobile size.** These runs asked Kane for a
375×812 window with `kane-cli config set-window 375x812`. Kane CLI only accepts
widths from 800 to 3840. It printed "Width must be between 800 and 3840 (got 375)"
but exited 0, so the runner carried on and every "mobile" run happened at
1920×1080. Kane's own session records (`viewport_width: 1920`) and its 3840×2160
screenshots confirm it. We also tried attaching Kane to a Chrome we had put into
phone emulation (`--cdp-endpoint`); Kane resets the viewport to 1920×1080 there
too. The runner now checks that `set-window` really took effect. The second
objective now runs at 800×1000, Kane's narrowest window, which is below the demo
app's 1024px breakpoint and so gets its mobile layout.

**2. A decorative layer made the healthy app fail.** Some runs used a version of the
app whose API-keys header had a gradient layer (`absolute inset-0 -z-10`) behind
the "Generate Production API Key" button. Real clicks reached the button (checked
with `document.elementFromPoint` in Chrome), but Kane's agent treated the
overlapping layer as covering it and failed the desktop objective even with no bug
injected. We removed the layer, and the `z-index` bug that depended on it.

The desktop verdicts for `overlay` and `pointer-events` here were correct; the
whole zoo was re-run anyway so every published verdict comes from the same
version of the app and runner.
