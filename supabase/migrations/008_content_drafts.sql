create table ops_content_drafts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'linkedin',
  content text not null,
  image_url text,
  context jsonb default '{}',
  status text not null default 'pending',  -- pending | approved | dismissed
  mission_id uuid references ops_missions(id),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create index idx_content_drafts_status on ops_content_drafts(status);
