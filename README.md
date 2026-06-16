# Dispatch Server

Twilio webhook backend for the Delivery Dispatch app.  
Receives "DONE" SMS replies from drivers and exposes a polling API for the frontend.

---

## Deploy to Railway (free, ~3 minutes)

### 1. Create a Railway account
Go to https://railway.app and sign up (free tier is plenty for this).

### 2. Deploy this folder
Option A — GitHub (recommended):
- Push this folder to a GitHub repo
- In Railway: New Project → Deploy from GitHub repo → select it

Option B — Railway CLI:
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 3. Set environment variables in Railway dashboard
Go to your project → Variables tab → add:

| Variable | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID (ACxxx...) |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `PUBLIC_URL` | Your Railway URL e.g. `https://dispatch-server-production.up.railway.app` |

### 4. Copy your Railway URL
It looks like: `https://dispatch-server-production.up.railway.app`

### 5. Configure Twilio webhook
- Go to https://console.twilio.com
- Phone Numbers → Manage → Active Numbers → click your number
- Under **Messaging** → "A message comes in":
  - Type: Webhook
  - URL: `https://YOUR-RAILWAY-URL/webhook/sms`
  - Method: HTTP POST
- Save

### 6. Add your server URL to the Dispatch app
- In the app, click **⚙ Twilio**
- Paste your Railway URL into the "Server URL" field
- The app will now poll every 10 seconds and auto-mark deliveries

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/dispatch` | POST | Register a dispatched order |
| `/orders` | GET | List all orders (add `?status=delivered` to filter) |
| `/orders/:id` | GET | Get single order status |
| `/webhook/sms` | POST | Twilio inbound SMS webhook |

## How it works

1. Dispatcher hits "Send SMS" in the app → app calls `POST /dispatch` to register the order
2. Driver receives SMS: *"Hi Marcus, you have a delivery at 1420 Olive St. Reply DONE when complete."*
3. Driver replies **DONE**
4. Twilio sends the reply to `POST /webhook/sms` on this server
5. Server matches the driver's phone to their active order, marks it delivered, replies "✅ Got it!"
6. Dispatch app polls `GET /orders` every 10 seconds, sees the delivered status, updates the UI automatically
