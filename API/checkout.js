const Stripe = require('stripe');

const PRODUCTS = {
  king:   { name: 'King complete linen set',  unit_amount: 3900, max: 20 },
  queen:  { name: 'Queen complete linen set', unit_amount: 3500, max: 20 },
  full:   { name: 'Full complete linen set',  unit_amount: 3200, max: 20 },
  twin:   { name: 'Twin complete linen set',  unit_amount: 2500, max: 30 },
  bath:   { name: 'Bathroom towel bundle',    unit_amount: 3500, max: 20 },
  person: { name: 'Towel set per person',     unit_amount: 1200, max: 30 }
};

const DELIVERY = {
  same_day:    { name: 'Same-day delivery',          unit_amount: 3500 },
  rush:        { name: '60–90 minute rush delivery', unit_amount: 6000 },
  after_hours: { name: 'After-hours rush delivery',  unit_amount: 8500 },
  next_day:    { name: 'Scheduled next-day delivery',unit_amount: 0 }
};

function clean(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen);
}

function getStripeKey() {
  // Removes accidental whitespace/newlines copied into the Vercel secret value.
  return String(process.env.STRIPE_SECRET_KEY || '').replace(/\s+/g, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = getStripeKey();
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe is not configured yet.' });
  }

  if (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('rk_live_')) {
    return res.status(500).json({ error: 'Stripe live key is not configured correctly.' });
  }

  try {
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2026-07-29.dahlia'
    });

    const body = req.body || {};
    const quantities = body.quantities || {};
    const line_items = [];

    for (const [key, product] of Object.entries(PRODUCTS)) {
      const qty = Math.max(0, Math.min(product.max, Math.floor(Number(quantities[key] || 0))));
      if (qty > 0) {
        line_items.push({
          price_data: {
            currency: 'usd',
            product_data: { name: product.name },
            unit_amount: product.unit_amount
          },
          quantity: qty
        });
      }
    }

    if (!line_items.length) {
      return res.status(400).json({ error: 'Please add at least one linen or towel item.' });
    }

    const delivery = DELIVERY[body.delivery] || DELIVERY.same_day;
    if (delivery.unit_amount > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: delivery.name },
          unit_amount: delivery.unit_amount
        },
        quantity: 1
      });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: `${origin}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
      customer_email: clean(body.email, 150) || undefined,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'auto',
      metadata: {
        customer_name: clean(body.name, 80),
        phone: clean(body.phone, 40),
        role: clean(body.role, 80),
        delivery_address: clean(body.address, 350),
        delivery_date: clean(body.date, 20),
        needed_by: clean(body.time, 20),
        delivery_speed: clean(delivery.name, 80),
        notes: clean(body.notes, 450)
      },
      integration_identifier: 'ziggys_checkout_qmtraxpk'
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Unable to start checkout.' });
  }
};
