-- ============================================================
-- artworks: 판매 유형 / 에디션 / 라이선스 / 경로 분리
-- ============================================================
alter table public.artworks
  add column if not exists sale_type      text not null default 'exclusive'
    check (sale_type in ('exclusive', 'numbered')),
  add column if not exists edition_total  int  not null default 1,
  add column if not exists editions_sold  int  not null default 0,
  add column if not exists license_scope  text,
  add column if not exists asking_price   numeric,
  add column if not exists preview_path   text,   -- 공개 워터마크 미리보기
  add column if not exists original_path  text;   -- 비공개 원본

-- status에 'sold' 추가
alter table public.artworks drop constraint if exists artworks_status_check;
alter table public.artworks add constraint artworks_status_check
  check (status in ('draft','submitted','screening','passed','held','rejected','sold'));

-- ============================================================
-- auctions: 동일 작품 복수 경매 허용 (numbered editions)
-- ============================================================
alter table public.auctions drop constraint if exists auctions_artwork_id_key;

-- 단, 동시에 scheduled/live 상태인 경매는 작품당 1개만
create unique index if not exists auctions_artwork_active_unique
  on public.auctions(artwork_id)
  where status in ('scheduled', 'live');

-- ============================================================
-- certificates: 낙찰 인증서 (append-only)
-- ============================================================
create table if not exists public.certificates (
  id                  uuid primary key default gen_random_uuid(),
  artwork_id          uuid not null references public.artworks(id),
  auction_id          uuid not null references public.auctions(id),
  edition_number      int  not null default 1,
  edition_total       int  not null default 1,
  buyer_id            uuid not null references auth.users(id),
  original_path       text,       -- originals 버킷 내 구매자 전용 파일 경로
  file_hash           text,
  watermark_id        text,
  issued_at           timestamptz not null default now(),
  platform_signature  text
);

create index if not exists certificates_buyer_id_idx   on public.certificates(buyer_id);
create index if not exists certificates_artwork_id_idx on public.certificates(artwork_id);

alter table public.certificates enable row level security;

create policy "certificates: buyer read"
  on public.certificates for select
  using (auth.uid() = buyer_id);

create policy "certificates: admin read"
  on public.certificates for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- Storage: originals 비공개 버킷 생성
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('originals', 'originals', false, 209715200)
on conflict (id) do nothing;

-- 낙찰자 본인의 파일만 접근 가능
create policy "originals: buyer select"
  on storage.objects for select
  using (
    bucket_id = 'originals'
    and exists (
      select 1 from public.certificates c
      where c.buyer_id = auth.uid()
        and c.original_path = storage.objects.name
    )
  );
