/**
 * Minimal interfaces over an Express request and session needed to perform
 * session fixation prevention. Structural types keep the helper unit-testable
 * without importing Express or express-session.
 */
export interface SessionLike {
  regenerate(callback: (err?: unknown) => void): void;
  save(callback: (err?: unknown) => void): void;
  userId?: number;
}

export interface SessionRequestLike {
  session: SessionLike;
}

/**
 * Regenerates the session ID before writing authenticated state.
 *
 * Call this after credentials are validated and before setting session.userId.
 * Regenerating invalidates the pre-authentication session ID so a session
 * fixation attacker who obtained it cannot reuse it once the user is
 * authenticated.
 *
 * express-session's regenerate() destroys the old store record, creates a new
 * ID, and replaces req.session. Data is not carried forward automatically, so
 * the callback must re-read request.session before setting and saving userId.
 */
export async function activateAuthSession(
  request: SessionRequestLike,
  userId: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    request.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        reject(regenerateErr);
        return;
      }

      // express-session replaces req.session during regenerate(). Always read
      // the new object from the request inside the callback; mutating the old
      // object saves auth state under the retired pre-authentication ID while
      // the browser receives a cookie for an empty regenerated session.
      const regeneratedSession = request.session;
      regeneratedSession.userId = userId;
      regeneratedSession.save((saveErr) => {
        if (saveErr) {
          reject(saveErr);
        } else {
          resolve();
        }
      });
    });
  });
}
