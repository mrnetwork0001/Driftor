---
assurance:
  id: t-1
  base: sha256:2148cec054d9eac7867afbd529b2349592d8c5813bf423527a04783f62186420
---
# Revoke a Production API key and decrease the active count

> Select one Production API keys table row, revoke its key, and observe its disappearance and the Active keys count decreasing by one.

## Step 1 @verifies ac-3

Open http://localhost:3002/app in the CloudScale demo app and find the Production API keys table; identify one existing key by its visible row details, then assert every displayed key row has a Revoke button.

## Step 2

capture baseline: numeric Active keys count displayed in the CloudScale Production API keys view before revoking the identified key

## Step 3 @verifies ac-1, ac-2

In the Production API keys table, revoke the identified key using its row's Revoke button, completing any confirmation if presented, then assert the identified key is absent from the table and the displayed Active keys count is exactly one less than the captured baseline.
