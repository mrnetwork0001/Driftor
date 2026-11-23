---
assurance:
  id: t-2
  base: sha256:b6cf221229a08e61df8d0a1990e0fc1fef9b6cd9dcf242bb603be8eb58f14419
---
# Accept consent is saved and first-time prompt stays away

> A first-time dashboard visitor selects Accept, the accepted choice is retained in localStorage, and the first-time banner does not recur on a subsequent visit.

## Step 1 @verifies ac-1, ac-2, ac-3

In a fresh browser context with no CloudScale localStorage, open http://localhost:3002/app and visit the CloudScale dashboard for the first time, then assert the cookie consent banner is visible with both 'Accept' and 'Decline' buttons.

## Step 2 @verifies ac-4

On the CloudScale dashboard cookie consent banner, choose 'Accept' and inspect this site's browser localStorage, then assert it contains an entry representing the chosen cookie-consent response as Accept.

## Step 3 @verifies ac-5

In the same browser context, revisit http://localhost:3002/app after accepting consent, then assert the first-time cookie consent banner is absent.
