"use client";

import { useEffect, useState } from "react";

/*
 * Cookie consent bar for the CloudScale demo app.
 *
 * Shown only to first-time visitors: the choice is persisted in localStorage
 * under COOKIE_CONSENT_KEY as "accepted" | "declined". It sits above the
 * maintenance toast (z-[60] vs z-50) so the choice is always reachable — a
 * consent bar that a floating toast can cover is exactly the kind of occlusion
 * Driftor is here to catch.
 *
 * Kane objectives can drive it by test ID:
 *   cookie-consent  the bar itself (absent once a choice is stored)
 *   cookie-accept   "Accept"
 *   cookie-decline  "Decline"
 */

export const COOKIE_CONSENT_KEY = "cloudscale.cookie-consent";

type Choice = "accepted" | "declined";

export default function CookieConsent() {
  // Starts hidden so server render and first client render agree; the effect
  // below reveals it only when no choice is stored yet.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(COOKIE_CONSENT_KEY)) setVisible(true);
    } catch {
      // Storage blocked (private mode, cookie policy): ask rather than assume consent.
      setVisible(true);
    }
  }, []);

  const decide = (choice: Choice) => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, choice);
    } catch {
      /* nothing to persist to; the bar still closes for this visit */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      data-testid="cookie-consent"
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-consent-text"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-cs-line bg-white shadow-[0_-1px_12px_rgba(24,24,27,0.08)]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p id="cookie-consent-text" className="text-xs sm:text-sm text-cs-sub leading-relaxed">
          <span className="font-medium text-cs-text">We use cookies.</span> CloudScale keeps essential cookies for
          sign-in and workspace state, plus optional analytics cookies that help us tune gateway performance.
        </p>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <button
            onClick={() => decide("declined")}
            data-testid="cookie-decline"
            className="flex-1 sm:flex-none rounded-md border border-cs-line bg-white px-3.5 py-2 font-medium text-cs-text hover:bg-zinc-100 active:translate-y-px"
          >
            Decline
          </button>
          <button
            onClick={() => decide("accepted")}
            data-testid="cookie-accept"
            className="flex-1 sm:flex-none rounded-md bg-cs-brand hover:bg-cs-brandHover text-white font-medium px-3.5 py-2 active:translate-y-px"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
