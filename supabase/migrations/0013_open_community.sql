-- Community is now an open general chat: any authenticated user may post.
drop policy if exists "author may post when allowed" on community_posts;
drop policy if exists "anyone may post" on community_posts;
create policy "anyone may post" on community_posts
  for insert with check (author_id = auth.uid());
