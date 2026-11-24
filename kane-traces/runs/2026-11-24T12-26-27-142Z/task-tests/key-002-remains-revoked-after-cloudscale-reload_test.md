---
assurance:
  id: t-1
  base: sha256:7956fc99f5ae88e51eb9e270247b1e1796d4cb59816e8d843be6693c648b3443
---
# KEY-002 remains revoked after CloudScale reload

> Revoke KEY-002 in the reset workspace and check that it stays excluded after reload while KEY-001 remains listed.

## Step 1 @verifies ac-3, ac-4, ac-5, ac-6

At http://localhost:3003/app in the CloudScale workspace, locate the Production API-key list in the reset state, then assert it contains exactly two keys, KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier", with each listed key having its own Revoke control.

## Step 2 @verifies ac-2

In the CloudScale workspace Production API-key list, revoke KEY-002 named "Staging verifier" using that key's Revoke control, then assert KEY-002 is absent from the list.

## Step 3 @verifies ac-1

Reload the CloudScale workspace page at http://localhost:3003/app after revoking KEY-002, then assert KEY-002 named "Staging verifier" is still absent from the Production API-key list.
