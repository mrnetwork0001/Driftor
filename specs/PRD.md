# Product Requirements Document (PRD): CloudScale API Gateway

## 1. Overview
CloudScale is an autonomous AI model routing gateway and API provisioning platform where engineering teams generate TLS-encrypted API credentials and manage inference quotas.

## 2. Core Visual & Interaction Invariant
The platform requires that **all primary conversion actions (CTAs) remain 100% reachable and clickable** in both layouts: desktop (1920x1080) and the narrow, mobile layout the app switches to below 1024px (verified at 800x1000, the narrowest window Kane CLI drives):
- Primary CTA: `button[data-testid="deploy-key-btn"]` ("Generate Production API Key")
- Secondary CTA: `button[data-testid="topup-btn"]` ("Top Up Quota ($250)")

No floating notification, modal backdrop, cookie banner, or viewport collapse may intercept pointer events or occlude the target bounding box.

---

## 3. Use Cases & Acceptance Criteria

### Use Case UC-01: Genesis Gateway Stability (Desktop 1920x1080)
- **Description:** Verifies that upon loading `/app` on desktop, all key registries and actions are fully visible.
- **Acceptance Criteria AC-1.1:** Heading reads "CloudScale AI Inference Gateway".
- **Acceptance Criteria AC-1.2:** Active API key count displays at least 2 existing credentials.
- **Acceptance Criteria AC-1.3:** Primary action `[data-testid="deploy-key-btn"]` is visible and unobstructed.

### Use Case UC-02: Production Key Provisioning (Unobstructed Clickability)
- **Description:** Clicking "Generate Production API Key" must dispatch a click event directly to the button without interception.
- **Acceptance Criteria AC-2.1:** Click reaches the button element directly (no backdrop overlay intercepting pointer events).
- **Acceptance Criteria AC-2.2:** Active key count increments by 1.
- **Acceptance Criteria AC-2.3:** Action status badge transitions to `KEY_GENERATED_HEALTHY`.

### Use Case UC-03: Mobile Layout Integrity (narrow screens, verified at 800x1000)
- **Description:** Below 1024px the app switches to its mobile layout (no sidebar, a Menu button). That layout must not clip, cover or intercept its CTAs, including when the menu is closed.
- **Acceptance Criteria AC-3.1:** Quota balance and Top-Up actions remain accessible.
- **Acceptance Criteria AC-3.2:** Top-Up increments quota by $250.00 and status reads `QUOTA_TOPUP_SUCCESS`.
