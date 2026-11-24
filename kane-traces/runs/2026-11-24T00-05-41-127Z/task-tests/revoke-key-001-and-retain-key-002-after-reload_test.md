---
assurance:
  id: t-1
  base: sha256:b2af932c211a1a5cf47f309f83ed899759677d1e4a1d3775451caa798d22a1fd
---
# Revoke KEY-001 and retain KEY-002 after reload

> Starting with KEY-001 and KEY-002, revoke KEY-001 using its row; observe that KEY-001 disappears, KEY-002 remains, Active keys changes from 2 to 1, and KEY-001 stays absent after a dashboard reload.

## Step 1 @verifies ac-4, ac-5, ac-6, ac-7

Open http://localhost:3002/app and inspect the CloudScale dashboard's Production API keys table and Active keys display in the reset workspace, then assert the table contains exactly KEY-001 (Production LLM routing) and KEY-002 (Staging verifier), each row has its own Revoke button, and Active keys reads "2 Keys".

## Step 2

capture baseline: Active keys numeric count on the CloudScale dashboard immediately before revoking KEY-001

## Step 3 @verifies ac-1, ac-3, ac-8

On the CloudScale dashboard, revoke KEY-001 (Production LLM routing) from its Production API keys table row, then assert KEY-001 is absent from the table, KEY-002 remains, and the Active keys numeric count is one less than its captured pre-revocation baseline.

## Step 4 @verifies ac-2

Reload http://localhost:3002/app and inspect the CloudScale dashboard's Production API keys table, then assert revoked KEY-001 remains absent.
