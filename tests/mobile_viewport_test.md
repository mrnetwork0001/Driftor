---
title: "Mobile Viewport Integrity & Quota Top-Up Test"
description: "Verifies that secondary conversion paths function on 375x812 mobile viewports"
tags: ["visual-assurance", "mobile", "viewport"]
---

# Mobile Viewport Action Test

## 1. Open CloudScale Gateway
Open `http://localhost:3000/app` and wait for DOM hydration.

## 2. Verify Available Quota
Assert that the element with test ID `data-testid="quota-balance"` displays `$4,500.00`.

## 3. Dispatch Top-Up Action
Click the button with test ID `data-testid="topup-btn"`.

## 4. Confirm Successful Quota Increment
Assert that the element with test ID `data-testid="quota-balance"` now reads `$4,750.00`.
Assert that the element with test ID `data-testid="key-status"` contains `QUOTA_TOPUP_SUCCESS`.
