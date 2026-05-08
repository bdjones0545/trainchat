/**
 * ProgramVoiceTextInput
 *
 * A fully self-contained voice-enabled text input for active-program command
 * fields. Encapsulates the complete push-to-talk lifecycle so callers need
 * zero voice state of their own.
 *
 * Supports:
 *   • tap mic → tap-to-dictate (toggle on/off)
 *   • hold mic 350ms+ → push-to-talk (release auto-submits)
 *   • typed text + Enter key → same onSubmit pipeline
 *   • send button → same onSubmit pipeline
 *
 * Sound cues (Web Audio API, very quiet, premium):
 *   • start listening  → rising tone
 *   • stop listening   → descending tone
 *   • submit (voice)   → two-note confirmation blip
 *   • no speech/error  → muted low double blip
 *   User preference stored in localStorage — toggle via speaker icon.
 *
 * Props:
 *   value / onChange      — controlled input (parent owns state)
 *   onSubmit(msg, source) — called with the final message and source tag
 *   disabled              — input disabled (building / streaming / mutating)
 *   isSubmitting          — shows spinner on send button
 *   multiline             — renders a <textarea> instead of <input>
 *   trainingSystemId /
 *   conversationId        — passed through to dev log only
 *   inputContext          — human-readable context label for dev log
 *   releaseLabel          — text shown in PTT mode (default "Release to send")
 *   listeningLabel        — text shown while tap-listening (default "Listening…")
 */

import { useState, useRef, useEffect } from "react";
import { Send, Mic, Loader2, Volume2, VolumeX } from "lucide-react";
import { useVoiceCommandInput } from "@/hooks/useVoiceCommandInput";
import {
  isVoiceSoundCuesEnabled,
  setVoiceSoundCues,
  playVoiceStart,
  playVoiceStop,
  playVoiceSubmit,
  playVoiceError,
} from "@/lib/voiceSoundCues";

export interface ProgramVoiceTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string, source: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  trainingSystemId?: number | null;
  conversationId?: number | null;
  submitSource?: string;
  inputContext?: string;
  releaseLabel?: string;
  listeningLabel?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}

export function ProgramVoiceTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type a command…",
  disabled = false,
  isSubmitting = false,
  trainingSystemId,
  conversationId,
  submitSource = "program_voice_input",
  inputContext = "program_command",
  releaseLabel = "Release to send",
  listeningLabel = "Listening…",
  className,
  multiline = false,
  rows = 3,
}: ProgramVoiceTextInputProps) {
  const voice = useVoiceCommandInput();

  // ── Sound cue preference ─────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isVoiceSoundCuesEnabled());

  function toggleSound() {
    const next = !soundEnabled;
    setVoiceSoundCues(next);
    setSoundEnabled(next);
  }

  // ── PTT UI state ─────────────────────────────────────────────────────────
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [pttNoSpeech, setPttNoSpeech] = useState(false);

  // Always-current mirror of `value` for safe async reads inside effects/timers
  const currentValueRef = useRef(value);
  useEffect(() => { currentValueRef.current = value; }, [value]);

  // Send-in-progress guard — prevents transcript re-injection after submit
  const sendInProgressRef = useRef(false);
  const baseTextRef = useRef("");
  const prevTranscriptRef = useRef("");

  // PTT refs
  const isPressedRef = useRef(false);
  const pressStartRef = useRef(0);
  const pttHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushToTalkRef = useRef(false);
  const pendingAutoSubmitRef = useRef(false);
  const pttAutoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevListeningRef = useRef(false);

  // Track previous error to play cue only on first appearance
  const prevErrorRef = useRef("");

  // ── Transcript → value sync ──────────────────────────────────────────────
  useEffect(() => {
    if (sendInProgressRef.current) return;
    if (!voice.isListening && !voice.transcript) return;
    if (voice.transcript !== prevTranscriptRef.current) {
      prevTranscriptRef.current = voice.transcript;
      const base = baseTextRef.current;
      const raw = base ? base.trimEnd() + " " + voice.transcript.trim() : voice.transcript;
      onChange(raw.trim().replace(/\s{2,}/g, " "));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.transcript, voice.isListening]);

  // ── Error sound cue — fires on first appearance of voice.error ───────────
  useEffect(() => {
    if (voice.error && voice.error !== prevErrorRef.current) {
      prevErrorRef.current = voice.error;
      playVoiceError();
    }
    if (!voice.error) {
      prevErrorRef.current = "";
    }
  }, [voice.error]);

  // ── PTT auto-submit: fires on isListening true→false in PTT mode ─────────
  useEffect(() => {
    const wasListening = prevListeningRef.current;
    prevListeningRef.current = voice.isListening;
    if (wasListening && !voice.isListening && pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = false;
      isPushToTalkRef.current = false;
      setIsPushToTalk(false);
      if (pttAutoSubmitTimerRef.current) clearTimeout(pttAutoSubmitTimerRef.current);
      pttAutoSubmitTimerRef.current = setTimeout(() => {
        const normalized = currentValueRef.current.trim().replace(/\s{2,}/g, " ");
        if (!normalized) {
          playVoiceError();
          setPttNoSpeech(true);
          setTimeout(() => setPttNoSpeech(false), 3000);
          doCleanup();
          return;
        }
        Promise.resolve().then(() => {
          doSubmit(normalized, "voice_ptt");
        });
      }, 250);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.isListening]);

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      voice.abortListening();
      if (pttHoldTimerRef.current) clearTimeout(pttHoldTimerRef.current);
      if (pttAutoSubmitTimerRef.current) clearTimeout(pttAutoSubmitTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal helpers ──────────────────────────────────────────────────────

  function doCleanup() {
    sendInProgressRef.current = true;
    voice.abortListening();
    if (pttHoldTimerRef.current) { clearTimeout(pttHoldTimerRef.current); pttHoldTimerRef.current = null; }
    if (pttAutoSubmitTimerRef.current) { clearTimeout(pttAutoSubmitTimerRef.current); pttAutoSubmitTimerRef.current = null; }
    isPushToTalkRef.current = false;
    isPressedRef.current = false;
    pendingAutoSubmitRef.current = false;
    setIsPushToTalk(false);
    setPttNoSpeech(false);
    prevTranscriptRef.current = "";
    baseTextRef.current = "";
    setTimeout(() => { sendInProgressRef.current = false; }, 100);
  }

  function cancelPTT() {
    if (pttHoldTimerRef.current) { clearTimeout(pttHoldTimerRef.current); pttHoldTimerRef.current = null; }
    if (isPushToTalkRef.current) {
      playVoiceStop();
      pendingAutoSubmitRef.current = false;
      isPushToTalkRef.current = false;
      setIsPushToTalk(false);
      voice.stopListening();
    }
    isPressedRef.current = false;
  }

  function doSubmit(message: string, source: string) {
    const msg = message.trim().replace(/\s{2,}/g, " ");
    if (!msg || disabled || isSubmitting) return;
    if (import.meta.env.DEV) {
      console.log("[Program Voice Text Input Submit]", {
        source,
        message: msg,
        trainingSystemId,
        conversationId,
        inputContext,
        submitSource,
      });
    }
    // Play submit cue only for voice-originated submissions
    if (source.startsWith("voice")) {
      playVoiceSubmit();
    }
    doCleanup();
    onChange("");
    onSubmit(msg, source);
  }

  // ── Mic pointer handlers ──────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || isSubmitting) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isPressedRef.current = true;
    pressStartRef.current = Date.now();
    setPttNoSpeech(false);
    pttHoldTimerRef.current = setTimeout(() => {
      if (!isPressedRef.current) return;
      isPushToTalkRef.current = true;
      setIsPushToTalk(true);
      pendingAutoSubmitRef.current = true;
      baseTextRef.current = currentValueRef.current;
      voice.resetTranscript();
      prevTranscriptRef.current = "";
      playVoiceStart();
      voice.startListening();
    }, 350);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isPressedRef.current) return;
    isPressedRef.current = false;
    const heldMs = Date.now() - pressStartRef.current;
    if (pttHoldTimerRef.current) { clearTimeout(pttHoldTimerRef.current); pttHoldTimerRef.current = null; }
    if (isPushToTalkRef.current) {
      // PTT release — submit sound fires in doSubmit (or error sound if no speech)
      voice.stopListening();
    } else if (heldMs < 350) {
      if (!voice.isSupported) { voice.startListening(); return; }
      if (voice.isListening) {
        // Tap to stop dictating
        playVoiceStop();
        voice.stopListening();
      } else {
        // Tap to start dictating
        baseTextRef.current = currentValueRef.current;
        voice.resetTranscript();
        prevTranscriptRef.current = "";
        setPttNoSpeech(false);
        playVoiceStart();
        voice.startListening();
      }
    }
    e.preventDefault();
  }

  function handlePointerLeave() {
    if (isPushToTalkRef.current) cancelPTT();
    else if (isPressedRef.current) {
      if (pttHoldTimerRef.current) { clearTimeout(pttHoldTimerRef.current); pttHoldTimerRef.current = null; }
      isPressedRef.current = false;
    }
  }

  // ── Derived style tokens ──────────────────────────────────────────────────

  const isDisabled = disabled || isSubmitting;

  const activePlaceholder = voice.isListening
    ? (isPushToTalk ? releaseLabel : listeningLabel)
    : placeholder;

  const containerClass = isDisabled
    ? "opacity-50 border-border bg-muted/20"
    : voice.isListening
      ? isPushToTalk
        ? "border-blue-500/70 bg-blue-500/5 shadow-[0_0_0_2px_rgba(59,130,246,0.18)]"
        : "border-blue-400/50 bg-blue-500/5"
      : "border-border bg-muted/20 focus-within:border-primary/40 focus-within:bg-muted/30";

  const micClass = isPushToTalk
    ? "bg-blue-500/25 text-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.4)] scale-105"
    : voice.isListening
      ? "bg-blue-500/15 text-blue-400"
      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40";

  const inputClass = "flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none py-2.5 min-w-0";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={className}>
      {/* Input row */}
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 transition-colors ${containerClass}`}
        style={{ minHeight: 48 }}
      >
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(value, "typed"); }
            }}
            disabled={isDisabled}
            placeholder={activePlaceholder}
            rows={rows}
            className={`${inputClass} resize-none`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSubmit(value, "typed"); }
            }}
            disabled={isDisabled}
            placeholder={activePlaceholder}
            className={inputClass}
          />
        )}

        {/* Mic button — hidden when speech is not supported */}
        {voice.isSupported && (
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={() => cancelPTT()}
            disabled={isDisabled}
            className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 touch-none select-none disabled:opacity-30 disabled:cursor-not-allowed ${micClass}`}
            title={voice.isListening ? "Stop listening" : "Tap to dictate · Hold for push-to-talk"}
          >
            <Mic className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Send button */}
        <button
          onClick={() => doSubmit(value, "typed")}
          disabled={!value.trim() || isDisabled}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Voice status strip */}
      {voice.isListening && (
        <div className={`mt-1.5 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all ${
          isPushToTalk ? "bg-blue-500/12 text-blue-400" : "bg-blue-500/8 text-blue-400/80"
        }`}>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-0.5 rounded-full bg-current"
                style={{
                  height: isPushToTalk ? "9px" : "5px",
                  animation: `voice-bar 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                }}
              />
            ))}
          </div>
          <span className="text-[10px] font-medium leading-none">
            {isPushToTalk
              ? releaseLabel
              : voice.transcript
                ? `"${voice.transcript.slice(0, 40)}${voice.transcript.length > 40 ? "…" : ""}"`
                : listeningLabel}
          </span>
        </div>
      )}

      {/* No-speech error */}
      {pttNoSpeech && !voice.isListening && (
        <p className="mt-1 text-[10px] text-amber-400/80 px-1">No speech detected — try again.</p>
      )}

      {/* Mic permission / recognition error */}
      {voice.error && !voice.isListening && (
        <p className="mt-1 text-[10px] text-red-400/80 px-1">{voice.error}</p>
      )}

      {/* Hint row: usage tip + sound cue toggle */}
      {voice.isSupported && !voice.isListening && !pttNoSpeech && !voice.error && (
        <div className="mt-1.5 flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
            Tap mic to dictate · Hold for push-to-talk
          </p>
          <button
            onClick={toggleSound}
            className="flex items-center gap-1 text-[9px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors select-none"
            title={soundEnabled ? "Disable voice sound cues" : "Enable voice sound cues"}
          >
            {soundEnabled
              ? <Volume2 className="w-3 h-3" />
              : <VolumeX className="w-3 h-3" />
            }
          </button>
        </div>
      )}
    </div>
  );
}
