alter table public.deals
  drop constraint if exists deals_lead_source_check;

alter table public.deals
  add constraint deals_lead_source_check check (
    lead_source in (
      'Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other',
      'Facebook', 'Google', 'Radio', 'Tv', 'Called In', 'Walk-In',
      'Off-Site Show/Event'
    )
  );
