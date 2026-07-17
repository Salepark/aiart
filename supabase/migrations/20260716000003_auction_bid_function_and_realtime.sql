-- Realtime 활성화
alter table public.auctions replica identity full;
alter table public.bids replica identity full;

alter publication supabase_realtime add table public.auctions;
alter publication supabase_realtime add table public.bids;

-- 원자적 입찰 함수 (FOR UPDATE로 레이스컨디션 방지)
create or replace function public.place_bid(
  p_auction_id uuid,
  p_bidder_id  uuid,
  p_amount     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction     record;
  v_bid_id      uuid;
  v_new_end_at  timestamptz;
begin
  if p_bidder_id is distinct from auth.uid() then
    raise exception 'unauthorized';
  end if;

  select * into v_auction
  from auctions
  where id = p_auction_id
  for update;

  if not found then
    raise exception 'auction not found';
  end if;
  if v_auction.status <> 'live' then
    raise exception 'auction is not live';
  end if;
  if now() > v_auction.end_at then
    raise exception 'auction has ended';
  end if;
  if p_amount <= v_auction.current_price then
    raise exception 'bid must exceed current price of %', v_auction.current_price;
  end if;

  insert into bids (auction_id, bidder_id, amount)
  values (p_auction_id, p_bidder_id, p_amount)
  returning id into v_bid_id;

  v_new_end_at := case
    when v_auction.end_at - now() < (v_auction.auto_extend_minutes || ' minutes')::interval
    then now() + (v_auction.auto_extend_minutes || ' minutes')::interval
    else v_auction.end_at
  end;

  update auctions
  set current_price = p_amount,
      end_at        = v_new_end_at
  where id = p_auction_id;

  return jsonb_build_object(
    'bid_id',      v_bid_id,
    'new_price',   p_amount,
    'new_end_at',  v_new_end_at
  );
end;
$$;
