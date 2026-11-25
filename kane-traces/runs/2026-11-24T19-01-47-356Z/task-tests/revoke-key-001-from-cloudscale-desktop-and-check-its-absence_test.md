---
assurance:
  id: t-2
  base: sha256:fd9f9e36566dd3a40cc79d1ec7da81138ba3af88c6bfd9fc7556fe5736af101c
---
# Revoke KEY-001 from CloudScale desktop and check its absence

> From the reset CloudScale dashboard on a desktop web viewport, revoke KEY-001 and establish the negative membership result: KEY-001 is absent while Active keys decreases by one.

## Step 1 @verifies ac-4, ac-5, ac-6

Open http://localhost:3004/app in a desktop browser viewport and locate the CloudScale dashboard's Production API-key list and Active keys indicator; then assert the list shows KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier", and Active keys reads "2 Keys".

## Step 2 @verifies ac-3

In the CloudScale dashboard's Production API-key list on desktop, inspect the available action for each listed key; then assert both KEY-001 and KEY-002 have a Revoke button.

## Step 3

capture baseline: numeric Active keys count shown on the CloudScale dashboard before revoking KEY-001

## Step 4 @verifies ac-1, ac-2

In the CloudScale dashboard's Production API-key list on desktop, revoke KEY-001 named "Production LLM routing" using its Revoke button; then assert KEY-001 is absent from the displayed list and the Active keys count is one lower than the captured pre-revocation count.
