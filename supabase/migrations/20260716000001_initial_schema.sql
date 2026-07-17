-- ============================================================
-- pgvector 확장 활성화
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- artists: 작가 프로필 (auth.users와 1:1)
-- ============================================================
create table artists (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  bio          text,
  created_at   timestamptz not null default now()
);

alter table artists enable row level security;

-- 본인 프로필만 읽기/쓰기
create policy "artists: own read"
  on artists for select
  using (auth.uid() = id);

create policy "artists: own insert"
  on artists for insert
  with check (auth.uid() = id);

create policy "artists: own update"
  on artists for update
  using (auth.uid() = id);

-- ============================================================
-- artworks: 작품
-- ============================================================
create table artworks (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid not null references artists(id) on delete cascade,
  title            text not null,
  image_path       text,
  declared_tool    text,
  declared_prompt  text,
  intent           text,
  declared_width   int,
  declared_height  int,
  actual_width     int,
  actual_height    int,
  file_hash        text,
  phash            text,
  embedding        vector(512),
  exif             jsonb,
  status           text not null default 'draft'
                     check (status in ('draft','submitted','screening','passed','held','rejected')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index artworks_artist_id_idx   on artworks(artist_id);
create index artworks_status_idx      on artworks(status);
create index artworks_phash_idx       on artworks(phash);
create index artworks_embedding_idx   on artworks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table artworks enable row level security;

-- passed 작품: 전체 공개 읽기
create policy "artworks: public read passed"
  on artworks for select
  using (status = 'passed');

-- 작가 본인: 자기 작품 전체 읽기
create policy "artworks: owner read own"
  on artworks for select
  using (auth.uid() = artist_id);

-- 작가 본인: 자기 작품 쓰기(insert/update/delete)
create policy "artworks: owner insert"
  on artworks for insert
  with check (auth.uid() = artist_id);

create policy "artworks: owner update"
  on artworks for update
  using (auth.uid() = artist_id);

create policy "artworks: owner delete"
  on artworks for delete
  using (auth.uid() = artist_id);

-- updated_at 자동 갱신 트리거
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger artworks_updated_at
  before update on artworks
  for each row execute procedure set_updated_at();

-- ============================================================
-- screening_verdicts: 심사 판정 (append-only)
-- ============================================================
create table screening_verdicts (
  id            uuid primary key default gen_random_uuid(),
  artwork_id    uuid not null references artworks(id) on delete cascade,
  layer         text check (layer in ('L1','L2','L3','L4')),
  verdict       text not null check (verdict in ('pass','flag','hold')),
  axis          text check (axis in ('artist','studio','character','real_person','duplicate','format')),
  reason        text not null,
  attributed_to text,
  confidence    float,
  decided_by    text not null default 'human' check (decided_by in ('rule','agent','human')),
  created_at    timestamptz not null default now()
);

create index screening_verdicts_artwork_id_idx on screening_verdicts(artwork_id);

alter table screening_verdicts enable row level security;

-- 관리자(service_role)만 쓰기: RLS 정책은 authenticated에만 적용됨
-- 실제 관리자 액세스는 service_role 키 또는 admin role 메타데이터로 제어

-- 해당 작품 작가: 본인 작품의 판정 읽기
create policy "screening_verdicts: owner read"
  on screening_verdicts for select
  using (
    exists (
      select 1 from artworks
      where artworks.id = screening_verdicts.artwork_id
        and artworks.artist_id = auth.uid()
    )
  );

-- 관리자(app_metadata.role = 'admin') 쓰기
create policy "screening_verdicts: admin insert"
  on screening_verdicts for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ============================================================
-- auctions: 경매
-- ============================================================
create table auctions (
  id                   uuid primary key default gen_random_uuid(),
  artwork_id           uuid not null unique references artworks(id) on delete cascade,
  start_price          numeric not null,
  current_price        numeric not null,
  reserve_price        numeric,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  auto_extend_minutes  int not null default 5,
  status               text not null default 'scheduled'
                         check (status in ('scheduled','live','ended','cancelled')),
  created_at           timestamptz not null default now()
);

create index auctions_status_idx on auctions(status);

alter table auctions enable row level security;

-- 로그인 사용자: 읽기
create policy "auctions: authenticated read"
  on auctions for select
  using (auth.role() = 'authenticated');

-- 관리자: 쓰기
create policy "auctions: admin insert"
  on auctions for insert
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "auctions: admin update"
  on auctions for update
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ============================================================
-- bids: 입찰
-- ============================================================
create table bids (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references auctions(id) on delete cascade,
  bidder_id   uuid not null references auth.users(id) on delete cascade,
  amount      numeric not null,
  created_at  timestamptz not null default now()
);

create index bids_auction_id_idx on bids(auction_id);
create index bids_bidder_id_idx  on bids(bidder_id);

alter table bids enable row level security;

-- 로그인 사용자: 읽기
create policy "bids: authenticated read"
  on bids for select
  using (auth.role() = 'authenticated');

-- 본인 입찰만 쓰기
create policy "bids: own insert"
  on bids for insert
  with check (auth.uid() = bidder_id);

-- ============================================================
-- auth.users 신규 가입 시 artists 자동 생성 트리거
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into artists (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
