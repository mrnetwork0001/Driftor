---
assurance:
  id: t-2
  base: sha256:cddb9e74100f0a84fb46662a4cf97a0fe412bd49d7153c0ff53c6f588c437250
---
# Revoking a selected key decreases Active keys by one

> Use the Revoke button on a selected Production API keys table row and observe that Active keys decreases by exactly one.

## Step 1

Open http://localhost:3002/app in the CloudScale browser app and reach the Production API keys table with at least one displayed key.

## Step 2 @verifies ac-3

On the CloudScale Production API keys table, inspect each displayed row, then assert every row has a Revoke button.

## Step 3

capture baseline: Active keys count displayed alongside the Production API keys table

## Step 4 @verifies ac-1, ac-2

On the CloudScale Production API keys table, identify the first displayed key by its displayed row identity and revoke that key with its row's Revoke button, then assert the Active keys count is exactly one less than the captured baseline and the identified key no longer appears in the table.
