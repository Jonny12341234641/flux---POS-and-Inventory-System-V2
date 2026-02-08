-- Phase 1: Items Table Expansion

ALTER TABLE items ADD COLUMN IF NOT EXISTS is_batch_tracked BOOLEAN DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_warning_days INTEGER;
