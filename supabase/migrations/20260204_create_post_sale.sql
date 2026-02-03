-- Migration: Create post_sale RPC function
-- Description: Accept a full sale payload (Invoice + Lines) and insert it atomically.
-- Idempotency: Returns success if the invoice ID already exists to handle network retries safely.

create or replace function post_sale(payload jsonb)
returns void
language plpgsql
security invoker -- Run with the permissions of the authenticated user (respects RLS)
as $$
declare
    _invoice jsonb;
    _lines jsonb;
    _invoice_id uuid;
begin
    -- Extract parts from payload
    _invoice := payload -> 'invoice';
    _lines := payload -> 'lines';
    _invoice_id := (_invoice ->> 'id')::uuid;

    -- 1. Idempotency Check
    if exists (select 1 from sales_invoices where id = _invoice_id) then
        -- Already exists, treat as success (idempotent)
        return;
    end if;

    -- 2. Atomic Insert
    -- Insert Invoice
    insert into sales_invoices (
        id,
        location_id,
        invoice_number,
        invoice_date,
        subtotal,
        discount_total,
        grand_total,
        created_at,
        updated_at,
        created_by
    ) values (
        (_invoice ->> 'id')::uuid,
        (_invoice ->> 'location_id')::uuid,
        _invoice ->> 'invoice_number',
        (_invoice ->> 'invoice_date')::timestamptz,
        (_invoice ->> 'subtotal')::numeric,
        (_invoice ->> 'discount_total')::numeric,
        (_invoice ->> 'grand_total')::numeric,
        (_invoice ->> 'created_at')::timestamptz,
        (_invoice ->> 'updated_at')::timestamptz,
        auth.uid() -- Set created_by to current user
    );

    -- Insert Lines
    -- We can use jsonb_to_recordset if available, or just loop in application code. 
    -- But doing it here is faster and safer.
    insert into sales_invoice_lines (
        id,
        location_id,
        sales_invoice_id,
        item_id,
        qty,
        unit_price,
        line_total,
        created_at,
        updated_at,
        created_by
    )
    select
        (l ->> 'id')::uuid,
        (l ->> 'location_id')::uuid,
        (l ->> 'sales_invoice_id')::uuid,
        (l ->> 'item_id')::uuid,
        (l ->> 'qty')::numeric,
        (l ->> 'unit_price')::numeric,
        (l ->> 'line_total')::numeric,
        (l ->> 'created_at')::timestamptz,
        (l ->> 'updated_at')::timestamptz,
        auth.uid()
    from jsonb_array_elements(_lines) as l;

end;
$$;
