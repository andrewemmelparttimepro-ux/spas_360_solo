-- Brandon (Sep 4): marking a unit Paid off records when and by whom.
alter table public.inventory_flooring_rows
  add column if not exists report_removed_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_inventory_flooring_row_value(
  p_inventory_item_id uuid,
  p_expected_version bigint,
  p_field text,
  p_value text
)
returns public.inventory_flooring_rows
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.inventory_flooring_rows;
  v_org_id uuid := (select public.auth_org());
  v_status_text text;
  v_background_color text;
begin
  if (select auth.uid()) is null
     or v_org_id is null
     or (select public.auth_role()) <> 'owner_manager' then
    raise exception 'Owner access is required to edit this flooring report'
      using errcode = '42501';
  end if;

  if p_field = 'status_text' then
    v_status_text := nullif(btrim(coalesce(p_value, '')), '');
    if v_status_text is not null and char_length(v_status_text) > 120 then
      raise exception 'Status must be 120 characters or fewer'
        using errcode = '22001';
    end if;
    update public.inventory_flooring_rows
    set status_text = v_status_text
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  elsif p_field = 'background_color' then
    v_background_color := nullif(upper(btrim(coalesce(p_value, ''))), '');
    if v_background_color is not null and v_background_color !~ '^#[0-9A-F]{6}$' then
      raise exception 'Choose a valid row color'
        using errcode = '22023';
    end if;
    update public.inventory_flooring_rows
    set background_color = v_background_color
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  elsif p_field = 'report_removed' then
    if p_value not in ('true', 'false') then
      raise exception 'Report removal value must be true or false'
        using errcode = '22023';
    end if;
    update public.inventory_flooring_rows
    set report_removed_at = case when p_value = 'true' then statement_timestamp() else null end,
        report_removed_by = case when p_value = 'true' then (select auth.uid()) else null end
    where inventory_item_id = p_inventory_item_id
      and org_id = v_org_id
      and version = p_expected_version
    returning * into v_row;
  else
    raise exception 'Unsupported flooring report field'
      using errcode = '22023';
  end if;

  if v_row.inventory_item_id is null then
    raise exception 'Flooring report row was not found or changed elsewhere'
      using errcode = '40001';
  end if;
  return v_row;
end
$$;
