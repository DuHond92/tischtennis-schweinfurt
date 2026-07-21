-- Offene Freundschaftsanfrage und ungelesene Benachrichtigung sind getrennte Zustände.
ALTER TABLE public.player_connections
  ADD COLUMN IF NOT EXISTS receiver_seen_at timestamptz;

COMMENT ON COLUMN public.player_connections.receiver_seen_at IS
  'Zeitpunkt, zu dem der Empfänger die Freundschaftsanfrage als gelesen markiert hat.';
