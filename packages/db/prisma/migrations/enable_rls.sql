-- Enable Row-Level Security on every application table.
--
-- Why: this app routes ALL data access through the gateway, which uses the
-- Supabase service-role key (RLS is bypassed for that key). The frontend never
-- queries Supabase tables directly — it calls the gateway. So enabling RLS
-- without any permissive policies has zero effect on the running application
-- and closes the public anon-key access path that the Supabase Security
-- Advisor flagged as critical.
--
-- Run: paste into the Supabase SQL Editor at
--      https://supabase.com/dashboard/project/<your-project>/sql

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_topics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_flashcards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;

-- Verify: every table should have rowsecurity = true and zero policies.
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- SELECT * FROM pg_policies WHERE schemaname = 'public';
