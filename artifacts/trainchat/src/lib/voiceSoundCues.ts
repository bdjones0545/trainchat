/**
 * voiceSoundCues.ts
 *
 * Lightweight Web Audio API sound cues for voice input lifecycle events.
 * All tones are oscillator-based (no external assets) and kept very quiet
 * (volume 0.07–0.12) for a premium, unobtrusive feel.
 *
 * Preference:
 *   Stored in localStorage under STORAGE_KEY.
 *   Default: enabled.
 *   Skipped automatically when prefers-reduced-motion is set.
 *
 * Audio Context notes:
 *   - Lazy-initialized on first call (satisfies browser autoplay policy).
 *   - Safari requires resume() after a user gesture — handled automatically.
 *   - SSR-safe: all window/AudioContext access is guarded.
 */

const STORAGE_KEY = "trainchat_voice_sound_cues";

let audioCtx: AudioContext | null = null;

// ── Preference helpers ────────────────────────────────────────────────────────

export function isVoiceSoundCuesEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

export function setVoiceSoundCues(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable — ignore silently
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor() as AudioContext;
  }
  // Safari suspends on creation until user gesture — resume best-effort
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function shouldPlay(): boolean {
  if (!isVoiceSoundCuesEnabled()) return false;
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return true;
}

interface ToneOptions {
  /** Start frequency in Hz */
  startFreq: number;
  /** End frequency in Hz (for glide). Omit for steady tone. */
  endFreq?: number;
  /** Duration in seconds */
  duration: number;
  /** Peak gain (volume). Range 0–1. Keep ≤ 0.15 for premium feel. */
  volume?: number;
  /** Oscillator wave shape */
  type?: OscillatorType;
  /** Seconds to wait before tone starts (for chained tones) */
  startDelay?: number;
}

function playTone({
  startFreq,
  endFreq,
  duration,
  volume = 0.10,
  type = "sine",
  startDelay = 0,
}: ToneOptions): void {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime + startDelay;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  if (endFreq !== undefined) {
    osc.frequency.linearRampToValueAtTime(endFreq, now + duration);
  }

  // Smooth attack/release envelope to avoid clicks
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.012, duration * 0.15));
  gain.gain.setValueAtTime(volume, now + duration - Math.min(0.020, duration * 0.25));
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.start(now);
  osc.stop(now + duration + 0.005);
}

// ── Public sound cues ─────────────────────────────────────────────────────────

/**
 * playVoiceStart — short rising tone.
 * Signals: mic is now listening.
 */
export function playVoiceStart(): void {
  if (!shouldPlay()) return;
  // 380 → 600 Hz, 120ms — bright, welcoming
  playTone({ startFreq: 380, endFreq: 600, duration: 0.12, volume: 0.10 });
}

/**
 * playVoiceStop — soft descending tone.
 * Signals: listening ended without submit (tap off, cancel).
 */
export function playVoiceStop(): void {
  if (!shouldPlay()) return;
  // 500 → 310 Hz, 100ms — gentle close
  playTone({ startFreq: 500, endFreq: 310, duration: 0.10, volume: 0.08 });
}

/**
 * playVoiceSubmit — clean two-note confirmation blip.
 * Signals: voice command accepted and submitted.
 */
export function playVoiceSubmit(): void {
  if (!shouldPlay()) return;
  // 680 Hz then 960 Hz — clean ascending pair
  playTone({ startFreq: 680, duration: 0.060, volume: 0.09 });
  playTone({ startFreq: 960, duration: 0.060, volume: 0.11, startDelay: 0.055 });
}

/**
 * playVoiceError — muted low double blip.
 * Signals: no speech detected, permission denied, or unsupported browser.
 */
export function playVoiceError(): void {
  if (!shouldPlay()) return;
  // 210 Hz then 165 Hz — subtle, non-alarming
  playTone({ startFreq: 210, duration: 0.055, volume: 0.07 });
  playTone({ startFreq: 165, duration: 0.055, volume: 0.06, startDelay: 0.085 });
}
