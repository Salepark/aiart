-- handle_new_user: SECURITY DEFINER 함수에 search_path 명시
-- auth 트리거 컨텍스트에서 public 스키마를 찾지 못하는 문제 수정
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.artists (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;
