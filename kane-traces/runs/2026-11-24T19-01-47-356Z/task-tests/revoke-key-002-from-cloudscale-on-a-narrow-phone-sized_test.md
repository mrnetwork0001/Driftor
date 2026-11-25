---
assurance:
  id: t-1
  base: sha256:5a0a76eb6159be8e15cf21564eec49826cefb1ddfcdfe704f1f2f768de329e8a
---
# Revoke KEY-002 from CloudScale on a narrow phone-sized browser viewport

> From the reset CloudScale dashboard in a narrow phone-sized web viewport, revoke KEY-002, observe that the selected row is gone and Active keys falls by one.

## Step 1 @verifies ac-4, ac-5, ac-6

Open http://localhost:3004/app in a narrow phone-sized browser viewport and locate the CloudScale dashboard's Production API-key list and Active keys indicator; then assert the list shows KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier", and Active keys reads "2 Keys".

## Step 2 @verifies ac-3, ac-7

In the CloudScale dashboard's Production API-key list on the narrow phone-sized viewport, inspect the available action for each listed key; then assert each of KEY-001 and KEY-002 has a Revoke button and KEY-002's Revoke button is available on this viewport.

## Step 3

capture baseline: numeric Active keys count shown on the CloudScale dashboard before revoking KEY-002

## Step 4 @verifies ac-1, ac-2

In the CloudScale dashboard's Production API-key list on the narrow phone-sized viewport, revoke KEY-002 named "Staging verifier" using its Revoke button; then assert KEY-002 is absent from the displayed list and the Active keys count is one lower than the captured pre-revocation count.
