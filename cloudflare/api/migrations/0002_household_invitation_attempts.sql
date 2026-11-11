CREATE TABLE household_invitation_attempts (
  id TEXT PRIMARY KEY,
  membership_id TEXT NOT NULL REFERENCES household_memberships(id) ON DELETE RESTRICT,
  requested_by TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  delivery_status TEXT NOT NULL DEFAULT 'started' CHECK (delivery_status IN ('started', 'sent', 'failed')),
  auth_user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  error_code TEXT,
  attempted_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK (
    (delivery_status = 'started' AND completed_at IS NULL)
    OR (delivery_status <> 'started' AND completed_at IS NOT NULL)
  )
);
CREATE INDEX household_invitation_attempts_membership_time_idx
  ON household_invitation_attempts(membership_id, attempted_at DESC);
CREATE INDEX household_invitation_attempts_actor_time_idx
  ON household_invitation_attempts(requested_by, attempted_at DESC);
