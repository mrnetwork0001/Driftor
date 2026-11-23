---
assurance:
  id: t-2
  base: sha256:27a78ee61cf81cbf7bea402630e2a5bc459204bf80dd13740111a670cddbca1a
---
# Revoke one key without removing a different key

> With at least two distinguishable keys in the Production API keys table, revoke one and establish that a different, unselected key stays in the table.

## Step 1 @verifies ac-3

Open http://localhost:3002/app in the CloudScale demo app and find the Production API keys table; identify two different keys by their visible row details, one to revoke and one to leave untouched, then assert every displayed key row has a Revoke button.

## Step 2

capture baseline: numeric Active keys count displayed in the CloudScale Production API keys view before revoking one of the two identified keys

## Step 3 @verifies ac-1, ac-2, ac-4

In the Production API keys table, revoke only the identified selected key using its row's Revoke button, completing any confirmation if presented, then assert the selected key is absent, the identified unselected key remains in the table, and the displayed Active keys count is exactly one less than the captured baseline.
