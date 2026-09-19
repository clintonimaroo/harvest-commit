# Harvest Commit

A working prototype for the specialty-crop farm case. React, TypeScript, Vite, and a small Node/Express server. Inter and Hugeicons are bundled locally.

## Start

```sh
git clone https://github.com/clintonimaroo/harvest-commit.git
cd harvest-commit
npm ci
cp .env.example .env
npm run build
npm start
```

Open http://localhost:4173. Node.js 22.12+ is required. The included `Start Harvest Commit.command` also starts the app. For development, `npm run dev` starts Vite on 5173 and the API on 4174. The production-style command above is recommended for the Twilio demo.

## Try the complete demo

1. **Today** shows 126 boxes ordered, 18 packed, and 108 to harvest. It also shows the four-box shortfall at the low field estimate.
2. **Messages → Order inbox**: review Riverbend Kitchen's amendment. The original message asks for 36 boxes instead of 32. Confirm the source, leave the action as Replace, check the delivery/quantity confirmation, and apply. Demand becomes 130, with six orders, not seven. The source remains attached to the order.
3. Use **Paste a message** to add a new source. Pasting opens a dialog and never immediately changes an order. The inbox supports additions, replacements, cancellations, and marking a message reviewed without changing demand.
4. **Messages → Farmer SMS → Demo phone**: send the plan to the interactive lock-screen preview. Reply `APPROVE CODE` using the displayed code. Today records an explicitly labeled demo approval.
5. Alternatively, reply `EDIT CODE 100`. The request stays unapproved until reviewed in the app. Apply it, send a revised plan, and approve the new code.
6. Change the harvest cutoff or an order. Previous approval clears, and older pending SMS codes become superseded when connected.
7. Record the actual harvest in Harvest log. Prior actuals survive later plan changes.

## Live weather

The Today weather card uses [Open-Meteo](https://open-meteo.com/en/docs) for current conditions and a 12-hour outlook, initially set to **Baltimore, Maryland**. Click the location to search for another city or ZIP code. Temperatures use Fahrenheit, wind uses mph, and times use the selected location's time zone. No API key is needed for this non-commercial prototype; commercial deployments require an appropriate Open-Meteo plan.

The browser fetches weather directly, refreshes every 15 minutes, and keeps a validated, location-specific forecast on this device for up to 24 hours. When offline or a request fails, saved values are explicitly labeled. Without saved data, the card shows an unavailable state instead of sample temperatures. Missing precipitation probabilities remain unknown, never zero.

The precipitation notice flags an hourly probability of at least 40%, or at least 0.004 inches of predicted precipitation. This is a display rule, not an agronomic safety assessment. The farmer reviews the forecast and sets **Harvest cutoff** in Farm inputs. A weather refresh does not change orders, the cutoff, or approval; editing the cutoff still invalidates approval. The planning date and sample farm records remain September 19, 2026, while the weather card identifies the actual forecast date and local times.

## Connect Twilio

Copy `.env.example` to `.env` and fill it on your computer. Credentials are ignored by Git; never paste keys into chat or add a `VITE_` prefix.

```dotenv
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+your_twilio_number
TWILIO_MESSAGING_SERVICE_SID=MG_your_service_sid
TWILIO_A2P_CAMPAIGN_SID=QE_your_campaign_sid
FARMER_PHONE_NUMBER=+the_farmer_number
PUBLIC_BASE_URL=https://your-public-host
SMS_ENABLED=true
```

The Messaging Service must contain the sender number and the registered US A2P campaign. `SMS_ENABLED=true` permits live mode, but does not bypass carrier review. The server refreshes the configured campaign in the background after its one-minute cache expires while the app is open, and checks again before every new live send. Inbox reads do not wait for this provider request. Only Twilio's `VERIFIED` campaign status permits sending; pending, failed, unknown, and unavailable statuses block it. Every plan still needs an explicit send action and the recipient's consent. The recipient is fixed on the server; the app cannot send to an arbitrary phone number.

The Harvest Commit campaign was submitted on September 19, 2026, and initially returned `IN_PROGRESS`. The app displays the current status; registration alone is not approval. No real SMS delivery has been verified yet. Public SMS invitation, privacy policy, and terms are hosted at https://harvest-commit-sms.vercel.app/ from the separate `sms-site/` folder. This public site contains no app credentials, customer records, or private workspace access. Its Vercel deployment stays available independently of the local app and ngrok tunnel.

Twilio Advanced Opt-Out is enabled for the Messaging Service with branded START, STOP, and HELP responses. Invite the configured recipient to read the public invitation and send START from their phone. STOP and its supported aliases block further plans; only the recipient can opt back in. The app does not duplicate Twilio's keyword responses. Support messages are received as ordinary inbox messages for manual review.

For local testing, keep the app running and expose port 4173:

```sh
ngrok http 4173
```

Use the HTTPS origin printed by ngrok as `PUBLIC_BASE_URL`, then restart `npm start` to load changed environment values. In your Twilio number's messaging settings, set **A message comes in → Webhook → POST** to:

```text
https://your-public-host/webhooks/twilio/inbound
```

If using a Messaging Service that controls inbound routing, configure that service's inbound webhook instead. Delivery status callbacks are attached automatically to each outbound request at `/webhooks/twilio/status`. The app validates Twilio signatures against the exact public URL; a changed tunnel URL requires updating both the environment and Twilio settings. [Twilio webhook documentation](https://www.twilio.com/docs/messaging/guides/webhook-request).

In **Farmer SMS**, choose **Live SMS**, verify the preview and recipient, check the sending confirmation, and click Send SMS to farmer. Queued/sent/delivered are separate states. A failed or uncertain send is never silently retried. Check the Twilio log before preparing another attempt. Trial accounts require a verified destination number; sender eligibility depends on the account and number. [Twilio Messages resource](https://www.twilio.com/docs/messaging/api/message-resource).

Incoming buyer texts go to the review inbox. The browser keeps one authenticated change request open; saving an inbound webhook releases it immediately, so new texts appear without refreshing the page. An unchanged request returns a heartbeat after 25 seconds. The client retries dropped connections and requests a fresh snapshot on tab focus, network recovery, and return from the background. The inbox shows Live inbox or Inbox reconnecting separately from outbound carrier-approval status. Updates preserve the selected message and unsaved review fields. Only the configured farmer's signed messages can approve a live proposal. Reply codes expire after 24 hours; superseded codes and duplicate webhook deliveries cannot create duplicate commitments. STOP/START updates the sender's local opt-out state, with opt-out replies left to Twilio.

For the local demo, keep the Node server and ngrok tunnel running and this computer awake. A hosted backend is not required for immediate inbox updates. Hosting the Node server with persistent storage and a stable HTTPS webhook would keep receipt available when this computer is asleep; deploying only the static frontend or SMS information website does not do that. Carrier delivery time before Twilio receives the text is outside this app's control.

## Optional AI extraction

Set both `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, then restart the server. Choose a model available to your account that supports Responses API structured outputs. When configured, the review screen offers Extract with AI. Otherwise it labels and uses the conservative local parser.

OpenAI receives the selected message text and known customer names only after an explicit Extract with AI click. Existing order quantities are not sent to the model. The initial fields remain explicitly labeled Local parser until a model request succeeds. It returns proposed structured fields, with nulls and model warnings for missing information. Local parser warnings are not merged into model output. Successful responses include the actual model name, OpenAI response ID, timestamp, and token usage. Provider errors, refusals, incomplete responses, and invalid output are reported as errors, never passed off as successful AI extraction. Server validation and human review are still required. It does not estimate crop safety, infer field yield, or approve orders. Requests use `store: false`; this is not a claim of zero provider retention. [Structured outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

To repeat the real model evaluation:

```sh
npm run eval:ai
```

This command loads the private `.env` and makes eight billable OpenAI requests through the production extraction endpoint on an isolated local server. It does not send SMS or change the app’s orders. Results, full source texts, model output, response IDs, and assertions are saved to `work/ai-validation/results.json`. The cases cover an amendment, new order, cancellation, missing fields, crates versus boxes, a relative amendment, negated cancellation, and multiple orders. `aiReady` indicates that key/model configuration is present; the live evaluation verifies actual model access and behavior. Human review is still required after a successful evaluation.

## Storage and access

In local mode, farm orders, field observations, harvest records, reviewed source IDs, and pasted messages remain in browser storage. SMS proposals, delivery state, and inbound texts are stored in `.data/messaging.json` with owner-only file permissions. Back up these locations before clearing data. The local messaging store is intended for one server process. Hosted mode instead saves the workspace and messaging records in shared Redis storage, as described below.

Local administrative API access is limited to direct localhost requests or a server-configured `HARVEST_ADMIN_TOKEN` of at least 32 characters. Requests forwarded through the public tunnel require that token. The hosted workspace uses the same server-configured key at its sign-in screen and issues a secure session cookie. The public Twilio endpoints use Twilio signature validation rather than this token.

Local plans can be edited offline. SMS and AI operations require the server and network. Changes made offline cannot immediately retract a text that has already been sent; they invalidate the local approval, and replies to a different revision are never applied to the new local plan. Server invalidation runs on reconnect. Hosted mode saves a browser draft during connection loss and retries pending saves, with version checks to prevent overwriting newer changes from another device.

## Boundaries

The farm, customers, records, and September 19, 2026 planning date are sample data. Weather is a real Open-Meteo feed for the location displayed on the card. Every outbound plan says SAMPLE FARM. Picking pace (3 boxes/person/hour), packing time (45 minutes), field priority, and qualitative confidence are demo assumptions. No actual agronomic assessment is connected. The UI shows low/expected/high scenarios, not calibrated probabilities. No measured savings are claimed.

Twilio integration and demo approval are implemented. Real outbound carrier delivery still needs verification. OpenAI extraction was verified on September 19, 2026 using `gpt-4.1` (response model `gpt-4.1-2025-04-14`): all eight cases in the final live evaluation passed, including two original app samples and six synthetic edge cases. This is a small functional evaluation, not a measured production accuracy rate. Unit tests use injected transports and do not send messages or call a model.

## Verify

```sh
npm run typecheck
npm test
npm run build
# Keep npm start running in a separate terminal:
npm run test:e2e
```

Tests cover plan constraints, source amendments, ambiguous units, signed webhooks, sender authorization, duplicates, stale codes, opt-out, delivery ordering, API access, review/approval/edit workflows, offline persistence, and mobile layouts. Browser tests use the installed Google Chrome; override `CHROME_PATH` if needed.


## Hosted deployment

The full application deploys to Vercel as a Vite frontend and a Node function (`api/index.ts`). A dedicated Upstash Redis database in `iad1` stores the single-farm workspace and messaging records. The free storage plan has automatic paid upgrades disabled. No local JSON file is used in the hosted function.

`server/store.ts` uses atomic compare-and-set updates to prevent lost updates across instances. An outbound proposal is reserved before Twilio is called; repeated request keys cannot send twice. Hosted inbox requests check the shared revision every second while the connection is open, return within 23 seconds, and automatically reconnect. Carrier transit time remains outside the app's control.

The hosted workspace requires an access key and uses an eight-hour HttpOnly, Secure, SameSite cookie. The access key and API credentials are server-only Vercel secrets. Orders, field inputs, approvals, pasted messages, and Trash state are saved to the shared farm. A stale save from another device is rejected instead of overwriting its changes; the local draft remains on that device. Reload to load the latest shared workspace. This is a single-farm demo, not a multi-tenant service.

The inbox has its own fixed-height scroll area. Delete moves a message to Trash; Undo or the Trash filter restores it. Deleting a message does not cancel an order.

Before release: `npm run typecheck`, `npm test`, `npm run build`, then `vercel build --prod`. The API-specific TypeScript config skips duplicate checks only during Vercel's function transpilation; the root build strictly typechecks the API and server first. Deploy with `vercel deploy --prod --scope clinton-imaros-projects` after configuring production environment variables. Do not upload `.env*`, `.data`, or `work`.

Twilio's signed inbound webhook and status callback must use the deployed HTTPS origin in `PUBLIC_BASE_URL`. Switch the number's webhook only after the hosted signed-webhook check succeeds. Keep the old local store until the cutover is verified. A rollback must preserve the Upstash database; redeploy a known-good build rather than restoring old message records over newer ones. The source and workspace migration backups are under `work/deploy-backup`.

Private production variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_A2P_CAMPAIGN_SID`, `FARMER_PHONE_NUMBER`, `SMS_ENABLED`, `HARVEST_ADMIN_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and the Upstash `KV_REST_API_URL` / `KV_REST_API_TOKEN`. `PUBLIC_BASE_URL` is the public canonical origin. Never prefix credentials with `VITE_`.
