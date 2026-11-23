---
assurance:
  id: t-1
  base: sha256:a7bfce55d90681eb080b5cdde5356c3d07803afc36781c33ec912030e00091aa
---
# Decline consent is saved and first-time prompt stays away

> A first-time dashboard visitor selects Decline, the declined choice is retained in localStorage, and the first-time banner does not recur on a subsequent visit.

## Step 1 @verifies ac-1, ac-2, ac-3

In a fresh browser context with no CloudScale localStorage, open http://localhost:3002/app and visit the CloudScale dashboard for the first time, then assert the cookie consent banner is visible with both 'Decline' and 'Accept' buttons.

## Step 2 @verifies ac-4

On the CloudScale dashboard cookie consent banner, choose 'Decline' and inspect this site's browser localStorage, then assert it contains an entry representing the chosen cookie-consent response as Decline.

## Step 3 @verifies ac-5

In the same browser context, revisit http://localhost:3002/app after declining consent, then assert the first-time cookie consent banner is absent.
