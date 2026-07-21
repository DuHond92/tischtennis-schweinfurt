-- Zeigt das Profil-Onboarding pro Konto nur einmal.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_welcome_seen_at timestamptz;

-- Bestehende Nutzer haben den bisherigen Hinweis bereits erhalten und sollen
-- nach dem Rollout nicht noch einmal unterbrochen werden.
UPDATE public.profiles
SET profile_welcome_seen_at = now()
WHERE profile_welcome_seen_at IS NULL;

COMMENT ON COLUMN public.profiles.profile_welcome_seen_at IS
  'Zeitpunkt, zu dem der einmalige Profil-Onboarding-Hinweis angezeigt wurde.';
