# Harvest Commit

Harvest Commit turns farm orders, inventory, field estimates, crew availability, and weather into a daily harvest plan. Review orders and send the plan to the farmer for approval by SMS.

> “Don’t harvest what you can’t sell. Don’t promise what you can’t harvest.”

**Placed first** at the [Morgan TechFest Tech Case Pitch Competition 2026](https://www.morgantechfest.com/tech-case.html).

## Quick start

Requires **Node.js 24**, npm, Git, and repository access.

```sh
git clone https://github.com/clintonimaroo/harvest-commit.git
cd harvest-commit
npm ci
cp .env.example .env
npm run build
npm start
```

Open [localhost:4173](http://localhost:4173). The sample farm and demo phone work without API keys. For development, use `npm run dev` and open [localhost:5173](http://localhost:5173).

## Optional setup

Edit `.env` using [.env.example](.env.example), then restart the server. Never commit credentials.

- **Weather:** Already connected through Open-Meteo, with Baltimore as the default.
- **AI:** Set `OPENAI_API_KEY` and `OPENAI_MODEL` to enable order extraction.
- **SMS:** Fill in the Twilio credentials, service/campaign IDs, sender and farmer numbers, and `PUBLIC_BASE_URL`. Set `SMS_ENABLED=true`; outbound sending requires a verified campaign.
- **Incoming texts:** Set Twilio's webhook to **POST** at `<PUBLIC_BASE_URL>/webhooks/twilio/inbound`. For local testing, use `ngrok http 4173` and set its HTTPS origin as `PUBLIC_BASE_URL`.
- **Remote access:** Set `HARVEST_ADMIN_TOKEN` to a random key of at least 32 characters and use it to sign in.
