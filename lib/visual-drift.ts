// =========================================================================
// [DRIFTOR-INJECT:VISUAL_STACKING_REGRESSION]
// Injected by driftor.js --inject to simulate real-world AI agent visual occlusion.
//
// In HEALTHY mode:
//   BANNER_OCCLUSION = false;
//   The floating maintenance alert renders statically and does not occlude CTAs.
//
// In REGRESSION mode:
//   BANNER_OCCLUSION = true;
//   A floating fixed modal banner ("Emergency Cloud Maintenance") renders
//   with an invisible full-width backdrop overlay (z-50) that intercepts pointer events
//   over the primary "Deploy AI Pipeline" button.
//
// JSDOM / Vitest status:
//   The button element is 100% in the DOM. document.querySelector('button').click()
//   succeeds in JSDOM because JSDOM does NOT calculate computed CSS stacking contexts
//   or perform hit-testing with elementFromPoint!
//
// Kane CLI in real Chrome status:
//   Kane drives real Google Chrome, attempts to click coordinates (x, y),
//   catches that the click hits the occluding backdrop instead of the button,
//   and emits an NDJSON failure verdict: [OCCLUSION_CLICK_INTERCEPTED]!
// =========================================================================
export const BANNER_OCCLUSION = false;
