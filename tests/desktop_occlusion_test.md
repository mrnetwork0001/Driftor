---
title: "Desktop Visual Stacking & Unobstructed Key Provisioning Test"
description: "Verifies that the primary CTA is not occluded by floating overlays on 1920x1080 desktop"
tags: ["visual-assurance", "desktop", "stacking-context"]
---

# Desktop Stacking Occlusion Test

## 1. Open CloudScale Gateway
Open `http://localhost:3000/app` and wait for DOM hydration.

## 2. Verify Genesis State
Assert that the element with test ID `data-testid="key-status"` contains `SYSTEM_READY`.
Assert that the active key count element `data-testid="key-count"` displays `2 Keys`.

## 3. Provision Production Key
Click the button with test ID `data-testid="deploy-key-btn"`.

## 4. Confirm Successful Action Dispatch
Assert that the element with test ID `data-testid="key-status"` contains `KEY_GENERATED_HEALTHY`.
Assert that the key count element `data-testid="key-count"` now displays `3 Keys`.
