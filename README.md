# Harvest Commit

Harvest Commit helps farms turn customer orders, inventory, field estimates, crew availability, and weather into a daily harvest plan. Review incoming orders, adjust the plan, and send it to the farmer for approval by SMS.

## Run locally

You need **Node.js 24**, npm, Git, and access to this private repository.

```sh
git clone https://github.com/clintonimaroo/harvest-commit.git
cd harvest-commit
npm ci
cp .env.example .env
npm run build
npm start
```

Open [localhost:4173](http://localhost:4173). Keep the server running; it serves both the app and its API. The sample farm and demo phone work without API keys. Local farm data stays in your browser, and SMS records are saved in `.data/`.

For development, run `npm run dev` instead: the app opens on port **5173** and the API runs on **4174**. Check changes with `npm test` and `npm run build`.

## Configure integrations

Edit `.env`, then restart the server. Keep credentials out of Git and never give them a `VITE_` prefix.

### Weather

Open-Meteo is already connected for this demo and defaults to Baltimore. No key is needed. Change the location directly on the weather card.

### AI extraction

Set `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`. The template uses `gpt-4.1`; your API account must have access to that model. Open a message in **Order inbox** and choose **Extract with AI**. Review the details before confirming. Without a key, the app uses its local parser.

### Live SMS

Create a Twilio Messaging Service, attach your SMS-capable number and registered A2P campaign, and fill in:

| Variable | What to enter |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (`AC…`). |
| `TWILIO_AUTH_TOKEN` | Twilio Account Auth Token. |
| `TWILIO_PHONE_NUMBER` | Twilio sender number in `+countrycode` format. |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service SID (`MG…`). |
| `TWILIO_A2P_CAMPAIGN_SID` | Campaign SID (`QE…`). |
| `FARMER_PHONE_NUMBER` | Consenting recipient's number in `+countrycode` format. |
| `PUBLIC_BASE_URL` | Public HTTPS origin, with no path. |
| `SMS_ENABLED` | `true` to enable live mode. |

For local testing, install and authenticate ngrok, then run `ngrok http 4173` alongside `npm start`. Set `PUBLIC_BASE_URL` to the tunnel's HTTPS origin and restart the app.

Set the Twilio number's incoming-message webhook to **POST** at `PUBLIC_BASE_URL` followed by `/webhooks/twilio/inbound`. If your Messaging Service overrides number-level routing, configure its webhook instead. Delivery callbacks are set automatically. Update both the URL in `.env` and Twilio when the tunnel changes.

Enable **Advanced Opt-Out** on the Messaging Service for START, STOP, and HELP. The SMS invitation, privacy policy, and terms are in `sms-site/`; update them for your sender and publish that folder separately for your campaign.

Incoming texts appear in **Order inbox**. Send plans from **Farmer SMS → Live SMS**. The app permits outbound messages only when Twilio reports the campaign as `VERIFIED` and the sending confirmation is checked.

### Workspace access

Hosted and tunnel access require `HARVEST_ADMIN_TOKEN`. Generate a random key:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save it privately, add it to `.env`, and use it on the public workspace's sign-in screen. Direct localhost access does not require it.

## Deploy to Vercel

1. Import this repository with the **repository root** as the project directory and select Node.js 24. `vercel.json` supplies the build and API settings.
2. Connect an Upstash Redis database. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` if the integration has not supplied them. Hosted plans and messages are stored here.
3. Add `HARVEST_ADMIN_TOKEN`, your stable HTTPS origin as `PUBLIC_BASE_URL`, and the integration variables above in Vercel's environment settings. Local `.env` files are not uploaded.
4. Deploy and sign in with your workspace key. A new database starts with sample data; local farm data is not imported automatically.
5. Point Twilio's incoming webhook to the deployed origin plus `/webhooks/twilio/inbound`. Send a test text and check the inbox. After campaign approval, test sending a plan and replying with its approval code.

Redeploy after changing Vercel environment variables.
