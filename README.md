# B BOI COMPUTER'S online store

A Node.js + Express store starter with product catalog, cart, admin price management, Paystack checkout initialization, server-side payment verification, and webhook signature validation.

## Before going live

1. Create/verify your Paystack merchant account and complete its business onboarding.
2. Copy `.env.example` to `.env`.
3. Put your Paystack **secret key** in `PAYSTACK_SECRET_KEY` on the server only. Start with a test secret key (`sk_test_...`). Never paste it into the website HTML or share it in chat.
4. Set `BASE_URL` to your HTTPS domain and `ADMIN_PASSWORD` to a long unique password.
5. Run `npm install` then `npm start` (Node.js 18+).
6. Visit `/admin`, enter the admin password, and set each product's price in Naira. Items with no price remain quote-only and cannot be paid for online.
7. In Paystack Dashboard, set the webhook URL to `https://YOUR-DOMAIN/api/paystack/webhook`.
8. Test successful, failed, abandoned and mismatched-amount payments with Paystack test keys before switching to live keys.

## Local run

```bash
cp .env.example .env
npm install
npm start
```

Open http://localhost:3000. Admin: http://localhost:3000/admin.

## Important production checklist

- Deploy to a Node.js host with HTTPS and persistent storage (this starter stores JSON files in `data/`; ensure the host preserves this directory or replace it with a managed database).
- Back up `data/products.json` and `data/orders.json`.
- Change the default admin password.
- Use a live Paystack secret key only in the hosting provider's server-side environment variables.
- Restrict admin access further (HTTPS, strong password, rate limiting, and ideally proper user authentication) before public launch.
- Review local legal, telecom, privacy, consumer-protection and platform rules for every product you offer.
- Fulfil orders only after server-side verification confirms `data.status === "success"` and the amount, currency and reference match the stored order. The code checks these values and also validates Paystack webhook signatures.
- This is a deployable starter, not a hosted/live store. It does not include a real domain, hosting account, merchant approval, or live payment credentials.

## Store contact

WhatsApp: +2348022090070
Currency: NGN (Naira)
Business location: Golf Estate, Okuro, Port Harcourt, Rivers State, Nigeria
