const Stripe = require('stripe');

const PACKAGES = {
  1: { name: '1-bed linen package', unit_amount: 6000 },
  2: { name: '2-bed linen package', unit_amount: 8500 },
  3: { name: '3-bed linen package', unit_amount: 10500 },
  4: { name: '4-bed linen package', unit_amount: 13000 },
  5: { name: '5-bed linen package', unit_amount: 15500 },
  6: { name: '6-bed linen package', unit_amount: 18000 }
};

const DELIVERY = {
  same_day: { name: 'Same-day delivery', unit_amount: 3500 },
  rush: { name: '60–90 minute rush delivery', unit_amount: 6000 },
  after_hours: { name: 'After-hours rush delivery', unit_amount: 8500 },
  next_day: { name: 'Scheduled next-day delivery', unit_amount: 0 }
};

function clean(value, maxLen = 500) { return String(value || '').trim().slice(0, maxLen); }
function getStripeKey() { return String(process.env.STRIPE_SECRET_KEY || '').replace(/\s+/g, ''); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const stripeKey = getStripeKey();
  if (!stripeKey) return res.status(500).json({ error: 'Stripe is not configured yet.' });
  if (!stripeKey.startsWith('sk_live_') && !stripeKey.startsWith('rk_live_')) return res.status(500).json({ error: 'Stripe live key is not configured correctly.' });
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2026-07-29.dahlia' });
    const body = req.body || {};
    const beds = Math.floor(Number(body.beds || 0));
    const pkg = PACKAGES[beds];
    if (!pkg) return res.status(400).json({ error: 'Please choose a bed package from 1 to 6 beds.' });
    const delivery = DELIVERY[body.delivery] || DELIVERY.same_day;
    const line_items = [{ price_data: { currency: 'usd', product_data: { name: pkg.name, description: 'Includes fitted sheet, flat sheet, 2 pillowcases, 2 bath towels, 2 washcloths and 1 hand towel per bed.' }, unit_amount: pkg.unit_amount }, quantity: 1 }];
    if (delivery.unit_amount > 0) line_items.push({ price_data: { currency: 'usd', product_data: { name: delivery.name }, unit_amount: delivery.unit_amount }, quantity: 1 });
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = `${proto}://${host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', line_items,
      success_url: `${origin}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
      customer_email: clean(body.email,150) || undefined,
      phone_number_collection: { enabled: true }, billing_address_collection: 'auto',
      metadata: { business: 'Beach Door Linens Co.', bed_package: `${beds} bed${beds===1?'':'s'}`, customer_name: clean(body.name,80), phone: clean(body.phone,40), role: clean(body.role,80), delivery_address: clean(body.address,350), delivery_date: clean(body.date,20), needed_by: clean(body.time,20), delivery_speed: clean(delivery.name,80), notes: clean(body.notes,450) },
      integration_identifier: 'ziggys_checkout_qmtraxpk'
    });
    return res.status(200).json({ url: session.url });
  } catch (err) { console.error(err); return res.status(500).json({ error: err.message || 'Unable to start checkout.' }); }
};
