/**
 * Minimal interface over the express-session Session object needed to perform
 * session fixation prevention. Defined as a structural type so the function can
 * be unit-tested with a plain mock object without importing express-session.
 */
export interface SessionLike {
  regenerate(callback: (err?: unknown) => void): void;
  save(callback: (err?: unknown) => void): void;
  userId?: number;
}

/**
 * Regenerates the session ID before writing authenticated state.
 *
 * Call this after credentials are validated and before setting session.userId.
 * Regenerating invalidates the pre-authentication session ID so a session
 * fixation attacker who obtained it cannot reuse it once the user is
 * authenticated.
 *
 * express-session's regenerate() destroys the old session store record and
 * creates a fresh one with a new ID. Data on req.session is not carried
 * forward automatically — we set userId immediately in the regenerate callback
 * before save() so the new record is complete in one write.
 */
export async function activateAuthSession(
  session: SessionLike,
  userId: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        reject(regenerateErr);
        return;
      }
      session.userId = userId;
      session.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
        } else {
          resolve();
        }
      });
    });
  });
}
