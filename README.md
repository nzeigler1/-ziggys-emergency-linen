# Ziggy's Emergency Linen

Static order page with a Vercel serverless Stripe Checkout endpoint.

## Required Vercel environment variable

`STRIPE_SECRET_KEY`

Use a live Stripe secret or restricted live key. Do not commit the key to GitHub.

The checkout endpoint also strips accidental whitespace/newlines from the environment variable before using it.
