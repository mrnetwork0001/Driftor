# What the coding agent was asked to build

A coding agent was given the request(s) below and says it has finished. The requests are
the user's own words, quoted as given; they are the requirement. Test that the running app
does what they ask, from a user's point of view.

The app under test is the CloudScale demo app (Next.js, source in app/app/). It is running at http://localhost:3002/app.

## Starting data (what the app shows before every test)

The app is reset to this state before each test runs. Use these literal values in the
tests; do not introduce variables for them.

After a reset the workspace has 2 Production API keys: KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier". Active keys reads "2 Keys", Available quota reads "$4,500.00" and Action status reads "SYSTEM_READY".

## Request 1

In the CloudScale dashboard, add a Revoke button to each row of the Production API keys table. Clicking it should remove that key (persist it on the server through a new API route like the existing ones), and the Active keys count should go down by one. Keep the change small and consistent with the existing code.

## Context only: what the agent changed (not a requirement)

Use this to see which part of the app the request touches. Do not test implementation
details from it; test what the request asks for.

```
app/app/CloudScaleDashboard.tsx | 35 ++++++++++++++++++++++++++++++-----
 lib/cloudscale.ts               | 21 ++++++++++++++++++---
 2 files changed, 48 insertions(+), 8 deletions(-)
new: app/api/cloudscale/keys/revoke/route.ts
```

```diff
diff --git a/app/app/CloudScaleDashboard.tsx b/app/app/CloudScaleDashboard.tsx
index e2c8314..e2690f8 100644
--- a/app/app/CloudScaleDashboard.tsx
+++ b/app/app/CloudScaleDashboard.tsx
@@ -11,5 +11,5 @@ import MaintenanceNotice from "./MaintenanceNotice";
  * CloudScale — the demo target that Driftor guards. State lives server-side
  * in /api/cloudscale. Kane objectives, tests/*_test.md and tests/unit depend on:
- *   key-status    SYSTEM_READY | KEY_GENERATED_HEALTHY | QUOTA_TOPUP_SUCCESS  (label "Action status")
+ *   key-status    SYSTEM_READY | KEY_GENERATED_HEALTHY | KEY_REVOKED | QUOTA_TOPUP_SUCCESS  (label "Action status")
  *   key-count     "N Keys"
  *   quota-balance "$4,500.00"  (label "Available quota")
@@ -17,5 +17,7 @@ import MaintenanceNotice from "./MaintenanceNotice";
  *   topup-btn     "+ Top Up Quota ($250)"
  *   heading       "CloudScale AI Inference Gateway"
- * Keep those labels unique on the page: Kane finds controls by their text.
+ * Keep those labels unique on the page: Kane finds controls by their text. The
+ * per-row "Revoke" buttons repeat, so they carry revoke-btn-<KEY-ID> and an
+ * aria-label ("Revoke <key name>") to pick one row out.
  */
 
@@ -58,8 +60,12 @@ function runId(): string | null {
 
 /** Workspace state changes on every write, so never answer from the browser's HTTP cache. */
-async function call<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
+async function call<T>(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
   const run = runId();
   const url = run ? `${path}?run=${encodeURIComponent(run)}` : path;
-  const res = await fetch(url, { method, cache: "no-store" });
+  const res = await fetch(url, {
+    method,
+    cache: "no-store",
+    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
+  });
   if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
   return (await res.json()) as T;
@@ -78,4 +84,5 @@ function useNow(ms = 15_000) {
 const KIND_DOT: Record<ActivityEntry["kind"], string> = {
   "key.created": "bg-cs-brand",
+  "key.revoked": "bg-rose-500",
   "quota.topup": "bg-emerald-500",
   "workspace.reset": "bg-zinc-400",
@@ -127,4 +134,10 @@ export default function CloudScaleDashboard() {
     });
 
+  const handleRevokeKey = (keyId: string) =>
+    run(async () => {
+      await call<CloudScaleState>("/api/cloudscale/keys/revoke", "POST", { keyId });
+      await refresh();
+    });
+
   const handleTopup = () =>
     run(async () => {
@@ -339,4 +352,5 @@ export default function CloudScaleDashboard() {
                       <th className="px-4 py-2 font-normal hidden sm:table-cell">Rate limit</th>
                       <th className="px-4 py-2 font-normal">Created</th>
+                      <th className="px-4 py-2 font-normal text-right">Actions</th>
                     </tr>
                   </thead>
@@ -344,5 +358,5 @@ export default function CloudScaleDashboard() {
                     {!state && (
                       <tr>
-                        <td colSpan={4} className="px-4 py-6 text-center text-cs-sub">
+                        <td colSpan={5} className="px-4 py-6 text-center text-cs-sub">
                           Loading keys…
                         </td>
@@ -362,4 +376,15 @@ export default function CloudScaleDashboard() {
                           {k.createdAt.slice(0, 10)} · {ago(k.createdAt, now)}
                         </td>
+                        <td className="px-4 py-3 text-right">
+                          <button
+                            onClick={() => handleRevokeKey(k.id)}
+                            disabled={busy}
+                            data-testid={`revoke-btn-${k.id}`}
+                            aria-label={`Revoke ${k.name}`}
+                            className="rounded-md border border-cs-line px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
+           
[… diff truncated at 4000 characters]
```
