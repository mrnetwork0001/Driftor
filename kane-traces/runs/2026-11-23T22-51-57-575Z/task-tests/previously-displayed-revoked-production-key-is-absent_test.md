---
assurance:
  id: t-1
  base: sha256:c873ba7a9ca5e92369fcb73fde0ff93a6ebbb3abaa6907455f160b3559ad740e
---
# Previously displayed revoked production key is absent

> Identify a displayed production API key, revoke that key using its row's button, and prove that formerly listed key is absent from the Production API keys table.

## Step 1

Open http://localhost:3002/app in the CloudScale browser app and reach the Production API keys table with at least one displayed key.

## Step 2 @verifies ac-3

On the CloudScale Production API keys table, inspect each displayed row, then assert every row has a Revoke button.

## Step 3

capture baseline: Active keys count displayed alongside the Production API keys table

## Step 4 @verifies ac-2, ac-1

On the CloudScale Production API keys table, identify the first displayed key by its displayed row identity and revoke that key with its row's Revoke button, then assert that no row in the table contains that identified key and the Active keys count is exactly one less than the captured baseline.
