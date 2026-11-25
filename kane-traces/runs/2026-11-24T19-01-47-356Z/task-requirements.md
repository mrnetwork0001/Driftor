# What the coding agent was asked to build

A coding agent was given the request(s) below and says it has finished. The requests are
the user's own words, quoted as given; they are the requirement. Test that the running app
does what they ask, from a user's point of view.

The app under test is the CloudScale demo app (Next.js, source in app/app/). It is running at http://localhost:3004/app.

## Starting data (what the app shows before every test)

The app is reset to this state before each test runs. Use these literal values in the
tests; do not introduce variables for them.

After a reset the workspace has 2 Production API keys: KEY-001 named "Production LLM routing" and KEY-002 named "Staging verifier". Active keys reads "2 Keys", Available quota reads "$4,500.00" and Action status reads "SYSTEM_READY".

## Request 1

Add a Revoke button to each API key in the CloudScale dashboard. Clicking it removes that key from the list, and the Active keys count goes down by one. It has to work on narrow phone-sized screens too.
