---
assurance:
  id: t-2
  base: sha256:0c4ee3957ee583abda8e53152aa23ec22264737b5a16fdda7521f69469472d16
---
# KEY-001 is removed from the CloudScale Production API-key list

> Revoke KEY-001 in the reset workspace and check that it is removed from the list while KEY-002 remains listed.

## Step 1 @verifies ac-3, ac-4, ac-5, ac-6

At http://localhost:3003/app in the CloudScale workspace, locate the Production API-key list in the reset state, then assert it contains exactly two keys, KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier", with each listed key having its own Revoke control.

## Step 2 @verifies ac-2

In the CloudScale workspace Production API-key list, revoke KEY-001 named "Production LLM routing" using that key's Revoke control, then assert KEY-001 is absent from the list.
