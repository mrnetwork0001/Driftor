---
assurance:
  id: t-2
  base: sha256:5d5be45eeba0a0e2633f6a41b2cd256616c0408a7c31546e169b7588fe2358e8
---
# Revoke the last remaining KEY-002 and retain zero after reload

> After KEY-001 is revoked, revoke remaining KEY-002 from its row; observe that KEY-002 disappears, Active keys changes from 1 to 0, and KEY-002 stays absent after dashboard reload.

## Step 1 @verifies ac-4, ac-5, ac-6, ac-7

Open http://localhost:3002/app and inspect the CloudScale dashboard's Production API keys table and Active keys display in the reset workspace, then assert the table contains exactly KEY-001 (Production LLM routing) and KEY-002 (Staging verifier), each row has its own Revoke button, and Active keys reads "2 Keys".

## Step 2

On the CloudScale dashboard's Production API keys table, revoke KEY-001 (Production LLM routing) to leave KEY-002 as the remaining key.

## Step 3

capture baseline: Active keys numeric count on the CloudScale dashboard immediately before revoking KEY-002

## Step 4 @verifies ac-1, ac-3

On the CloudScale dashboard's Production API keys table, revoke remaining KEY-002 (Staging verifier) from its row, then assert KEY-002 is absent and the Active keys numeric count is one less than its captured pre-revocation baseline (0 Keys).

## Step 5 @verifies ac-2

Reload http://localhost:3002/app and inspect the CloudScale dashboard's Production API keys table, then assert revoked KEY-002 remains absent.
