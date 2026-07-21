-- Nutzer dürfen eigene Plattenvorschläge nach Ablehnung bearbeiten und erneut einreichen.
-- Nutzer dürfen eigene Plattenvorschläge jederzeit zurückziehen (löschen).
-- Die UI zeigt Bearbeiten/Löschen nur bei Status "rejected" an — DB-Policies
-- sind bewusst breiter gefasst, damit kein Race Condition bei Admin-Aktionen entsteht.

-- UPDATE: Eigene Einreichung bearbeiten und erneut zur Prüfung einreichen
DROP POLICY IF EXISTS "Users can update own suggestions" ON public.table_suggestions;
CREATE POLICY "Users can update own suggestions"
  ON public.table_suggestions
  FOR UPDATE
  USING (auth.uid() = submitted_by)
  WITH CHECK (auth.uid() = submitted_by);

-- DELETE: Eigene Einreichung zurückziehen
DROP POLICY IF EXISTS "Users can delete own suggestions" ON public.table_suggestions;
CREATE POLICY "Users can delete own suggestions"
  ON public.table_suggestions
  FOR DELETE
  USING (auth.uid() = submitted_by);
