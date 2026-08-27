ALTER TABLE leads ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE leads ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE leads ADD COLUMN stripe_setup_intent_id TEXT;
ALTER TABLE leads ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_started';

CREATE INDEX IF NOT EXISTS idx_leads_payment_status ON leads(payment_status);
CREATE INDEX IF NOT EXISTS idx_leads_stripe_customer_id ON leads(stripe_customer_id);
