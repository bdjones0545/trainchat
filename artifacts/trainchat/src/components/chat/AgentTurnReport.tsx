import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import type { CompleteEvent } from "@/hooks/useStreamMessage";

export interface PanelActionReceipt {
  success: true;
  source: "program_panel" | "chat_button" | "try_saying" | "system_cta" | "starter_prompt" | "retry";
  actionType: string;
  programChanged: boolean;
  receiptId: string;
  target: {
    dayIndex?: number;
    exerciseIndex?: number;
    exerciseName?: string;
  };
  userMessage: string;
}

interface Props {
  event: CompleteEvent;
  panelReceipt?: PanelActionReceipt | null;
}

function derivePersistenceType(actionType: string): string {
  switch (actionType) {
    case "TEMPORARY_ADJUSTMENT": return "session_only";
    case "PERSIST_CONSTRAINT_ONLY": return "preference_memory";
    case "MUTATE_ACTIVE_PROGRAM": return "persistent";
    case "REBUILD_PROGRAM": return "persistent";
    case "GUIDANCE_ONLY": return "none";
    case "ASK_CLARIFICATION": return "none";
    case "SAFETY_RESPONSE": return "persistent";
    case "NO_OP": return "none";
    default: return "unknown";
  }
}

function deriveActualTurnOutcome(event: CompleteEvent): string {
  // mutationOutcome is the authoritative signal for direct-edit paths
  // (which return before enforceActionContract is called and thus have no auditReceipt).
  if (event.mutationOutcome) {
    if (event.mutationOutcome.outcomeType === "mutation_applied") return "mutation_applied";
    if (event.mutationOutcome.outcomeType === "mutation_not_applied") return "mutation_not_applied_with_reason";
  }
  const receipt = event.auditReceipt;
  if (!receipt) return event.outcomeType;
  const { outcome } = receipt;
  const parts: string[] = [];
  if (outcome.mutationApplied) parts.push("mutation_applied");
  if (outcome.constraintPersisted) parts.push("constraint_persisted");
  if (outcome.clarificationAsked) parts.push("clarification_asked");
  if (outcome.programRebuilt) parts.push("program_rebuilt");
  if (parts.length === 0) parts.push("no_state_change");
  return parts.join(" + ");
}

function BoolBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
        value
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          : "bg-zinc-800/60 text-zinc-500 border border-zinc-700/40"
      }`}
    >
      <span>{value ? "✓" : "✗"}</span>
      {label}
    </span>
  );
}

function Field({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-0.5 min-h-[20px]">
      <span className="text-[10px] text-zinc-500 w-44 flex-shrink-0 pt-px">{label}</span>
      <span className={`text-[11px] text-zinc-200 break-all ${mono ? "font-mono" : ""}`}>{value ?? <span className="text-zinc-600 italic">null</span>}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function AgentTurnReport({ event, panelReceipt }: Props) {
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  const receipt = event.auditReceipt;
  // mutationOutcome: from finalizeMutationOutcome() on direct-edit SSE paths —
  // the authoritative PASS/FAIL signal when no auditReceipt was generated.
  const mutationOutcome = event.mutationOutcome ?? null;

  // Suppress the card entirely when there is no compliance data of any kind.
  if (!receipt && !panelReceipt && !mutationOutcome) return null;
  const contract = receipt?.contract;
  const outcome = receipt?.outcome;
  const compliance = receipt?.compliance;

  // If a panel receipt is present (right-sidebar action reconciled as success),
  // override the status display — program changed is the authoritative signal.
  const panelReconciled = panelReceipt?.programChanged === true;

  // PASS/FAIL precedence:
  //   panelReconciled (sidebar action) → always PASS
  //   compliance?.passed (AI-call path audit receipt) → authoritative for that path
  //   mutationOutcome.auditStatus (direct-edit path) → fallback when no receipt
  const mutationAuditPassed: boolean | undefined =
    mutationOutcome
      ? mutationOutcome.auditStatus === "PASS"
        ? true
        : mutationOutcome.auditStatus === "FAIL"
        ? false
        : undefined
      : undefined;

  const passed: boolean | undefined = panelReconciled
    ? true
    : compliance?.passed !== undefined
    ? compliance.passed
    : mutationAuditPassed;

  const hasViolations =
    !panelReconciled && (
      (compliance?.violations && compliance.violations.length > 0) ||
      (mutationOutcome?.auditStatus === "FAIL")
    );

  const statusColor = panelReconciled
    ? "border-emerald-500/40 bg-emerald-950/30"
    : passed === true
    ? "border-emerald-500/40 bg-emerald-950/30"
    : passed === false
    ? "border-red-500/40 bg-red-950/30"
    : mutationOutcome?.auditStatus === "WARNING"
    ? "border-yellow-500/40 bg-yellow-950/20"
    : "border-zinc-700/40 bg-zinc-900/20";

  const statusIcon = (panelReconciled || passed === true)
    ? <ShieldCheck size={12} className="text-emerald-400" />
    : passed === false
    ? <ShieldAlert size={12} className="text-red-400" />
    : <AlertTriangle size={12} className="text-yellow-400" />;

  const statusLabel = panelReconciled
    ? "Updated"
    : passed === true
    ? "PASS"
    : passed === false
    ? "FAIL"
    : mutationOutcome?.auditStatus === "WARNING"
    ? "WARNING"
    : "NO RECEIPT";

  const statusLabelColor = (panelReconciled || passed === true)
    ? "text-emerald-400"
    : passed === false
    ? "text-red-400"
    : "text-yellow-400";

  const actionType = contract?.actionType ?? event.intentDebug?.type ?? "—";
  const persistenceType = contract ? derivePersistenceType(contract.actionType) : "—";
  const mutationType = event.intentDebug?.editSubtype ?? "—";
  const actualTurnOutcome = deriveActualTurnOutcome(event);
  const verificationResult = outcome?.verificationStatus ?? event.systemEdit?.verificationStatus ?? "—";
  const responseType = outcome?.actualResponseType ?? "—";
  const failureReason = mutationOutcome?.failureReason ?? null;
  const responseShown = event.assistantMessage.content?.slice(0, 180) + (event.assistantMessage.content?.length > 180 ? "…" : "");
  const detectedIntentFamily = event.intentDebug?.type ?? "—";

  return (
    <div
      className={`mt-2 rounded-lg border text-left ${statusColor} transition-all`}
      data-testid="agent-turn-report"
      data-pass-fail={passed === true ? "pass" : passed === false ? "fail" : "no-receipt"}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} className="text-zinc-500 flex-shrink-0" /> : <ChevronRight size={12} className="text-zinc-500 flex-shrink-0" />}
        {statusIcon}
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Agent Turn Report</span>
        <span className={`ml-auto text-[10px] font-bold ${statusLabelColor}`}>{statusLabel}</span>
        {(panelReceipt?.receiptId ?? receipt?.receiptId) && (
          <span className="text-[9px] text-zinc-600 font-mono ml-1 hidden sm:block">#{(panelReceipt?.receiptId ?? receipt?.receiptId)?.slice(0, 8)}</span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3">
          <div className="border-t border-white/10 pt-3">

            {/* Panel reconciliation banner — action reconciled as success */}
            {panelReconciled && (
              <div className="flex items-start gap-2 rounded p-2 mb-3 text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <span>
                  {panelReceipt?.source === "program_panel"
                    ? "✓ Right-sidebar action reconciled as success — program state changed."
                    : "✓ Action reconciled as success — program state changed."}
                </span>
              </div>
            )}

            {/* Panel receipt details */}
            {panelReconciled && panelReceipt && (
              <Section title="Panel Action Receipt">
                <Field label="source" value={panelReceipt.source} />
                <Field label="actionType" value={<span className="text-amber-300">{panelReceipt.actionType}</span>} />
                <Field label="programChanged" value={<span className="text-emerald-400">true</span>} />
                <Field label="receiptId" value={panelReceipt.receiptId} />
                {panelReceipt.target.exerciseName && (
                  <Field label="target.exerciseName" value={panelReceipt.target.exerciseName} />
                )}
                {panelReceipt.target.dayIndex !== undefined && (
                  <Field label="target.dayIndex" value={String(panelReceipt.target.dayIndex)} />
                )}
                {panelReceipt.target.exerciseIndex !== undefined && (
                  <Field label="target.exerciseIndex" value={String(panelReceipt.target.exerciseIndex)} />
                )}
                <Field label="userMessage" mono={false} value={panelReceipt.userMessage} />
                <Field label="backendOutcomeType" value={<span className="text-yellow-400">{event.outcomeType}</span>} />
                <Field label="failureSuppressed" value={<span className="text-emerald-400">true</span>} />
              </Section>
            )}

            {/* Contract pass/fail banner — AI-call path (has auditReceipt) */}
            {!panelReconciled && compliance && (
              <div className={`flex items-start gap-2 rounded p-2 mb-3 text-[10px] ${
                compliance.passed
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {compliance.passed
                  ? <span>✓ Contract honored — all binding rules satisfied.</span>
                  : (
                    <div>
                      <p className="font-semibold mb-1">✗ Contract violated</p>
                      <ul className="space-y-0.5 list-disc list-inside">
                        {compliance.violations.map((v, i) => <li key={i}>{v}</li>)}
                      </ul>
                    </div>
                  )
                }
              </div>
            )}

            {/* Mutation outcome banner — direct-edit path (no auditReceipt, has mutationOutcome) */}
            {!panelReconciled && !compliance && mutationOutcome && (
              <div className={`flex items-start gap-2 rounded p-2 mb-3 text-[10px] ${
                mutationOutcome.auditStatus === "PASS"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : mutationOutcome.auditStatus === "FAIL"
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
              }`}>
                {mutationOutcome.auditStatus === "PASS"
                  ? <span>✓ Mutation applied — DB evidence confirms change.</span>
                  : mutationOutcome.auditStatus === "WARNING"
                  ? <span>⚠ Mutation applied but verification was inconclusive.</span>
                  : (
                    <div>
                      <p className="font-semibold mb-1">✗ Mutation not applied</p>
                      {mutationOutcome.failureReason && (
                        <p className="text-red-300">{mutationOutcome.failureReason}</p>
                      )}
                    </div>
                  )
                }
              </div>
            )}

            {/* Input */}
            <Section title="Input">
              <Field label="userMessage" mono={false} value={
                <span className="italic text-zinc-300">"{receipt?.userMessage ?? event.userMessage.content}"</span>
              } />
              <Field label="detectedIntentFamily" value={detectedIntentFamily} />
            </Section>

            {/* Contract */}
            <Section title="Action Contract">
              <Field label="actionType" value={<span className="text-amber-300">{actionType}</span>} />
              <Field label="targetScope" value={contract?.targetScope ?? "—"} />
              <Field label="persistenceType" value={persistenceType} />
              <Field label="mutationType" value={mutationType !== "—" ? mutationType : <span className="text-zinc-600 italic">none</span>} />
              <Field label="confidence" value={
                <span className={
                  contract?.confidence === "high" ? "text-emerald-400" :
                  contract?.confidence === "medium" ? "text-yellow-400" :
                  "text-red-400"
                }>{contract?.confidence ?? "—"}</span>
              } />
              <Field label="expectedStateChange" mono={false} value={contract?.expectedStateChange ?? null} />
            </Section>

            {/* Binding flags */}
            <Section title="Binding Flags">
              <div className="flex flex-wrap gap-1.5">
                <BoolBadge value={contract?.shouldMutate ?? false} label="shouldMutate" />
                <BoolBadge value={contract?.shouldPersistConstraint ?? false} label="shouldPersistConstraint" />
                <BoolBadge value={contract?.shouldAskClarification ?? false} label="shouldAskClarification" />
                <BoolBadge value={contract?.shouldRebuild ?? false} label="shouldRebuild" />
                <BoolBadge value={contract?.shouldRespondGuidanceOnly ?? false} label="shouldRespondGuidanceOnly" />
                <BoolBadge value={contract?.safetyMode ?? false} label="safetyMode" />
                <BoolBadge value={contract?.requiredVerification ?? false} label="requiredVerification" />
              </div>
            </Section>

            {/* Outcome */}
            <Section title="Actual Outcome">
              <Field label="actualTurnOutcome" value={actualTurnOutcome} />
              <Field label="verificationResult" value={
                <span className={
                  verificationResult === "verified" ? "text-emerald-400" :
                  verificationResult === "partial" ? "text-yellow-400" :
                  verificationResult === "not_applicable" ? "text-zinc-500" :
                  "text-red-400"
                }>{verificationResult}</span>
              } />
              <Field label="contractPassFail" value={
                <span className={passed ? "text-emerald-400 font-bold" : passed === false ? "text-red-400 font-bold" : "text-zinc-500"}>
                  {passed === true ? "PASS" : passed === false ? "FAIL" : "—"}
                </span>
              } />
              <Field label="responseType" value={responseType} />
              {mutationOutcome && (
                <Field label="mutationOutcome.appliedCount" value={String(mutationOutcome.systemEdit.appliedCount)} />
              )}
              {failureReason && (
                <Field label="failureReason" mono={false} value={
                  <span className="text-red-300 italic">{failureReason}</span>
                } />
              )}
              {mutationOutcome?.systemEdit.warning && (
                <Field label="verificationWarning" mono={false} value={
                  <span className="text-yellow-300 italic">{mutationOutcome.systemEdit.warning}</span>
                } />
              )}
              {receipt?.receiptId && (
                <Field label="auditReceiptId" value={<span className="text-zinc-400">{receipt.receiptId}</span>} />
              )}
            </Section>

            {/* Response shown */}
            <Section title="Response Shown">
              <div className="text-[10px] text-zinc-300 bg-zinc-900/60 border border-zinc-700/40 rounded p-2 italic leading-relaxed">
                "{responseShown}"
              </div>
            </Section>

            {/* Allowed response types */}
            {contract?.allowedResponseTypes && contract.allowedResponseTypes.length > 0 && (
              <Section title="Allowed Response Types">
                <div className="flex flex-wrap gap-1">
                  {contract.allowedResponseTypes.map((rt) => (
                    <span key={rt} className="px-1.5 py-0.5 text-[9px] font-mono rounded border border-zinc-700 text-zinc-400 bg-zinc-800/50">
                      {rt}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {/* Contract reasons */}
            {contract?.contractReasons && contract.contractReasons.length > 0 && (
              <Section title="Contract Reasoning">
                <ul className="space-y-1">
                  {contract.contractReasons.map((r, i) => (
                    <li key={i} className="text-[10px] text-zinc-400 flex gap-1.5">
                      <span className="text-zinc-600 flex-shrink-0">→</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Violations (detailed, if fail) */}
            {hasViolations && (
              <Section title="Contract Violations">
                <ul className="space-y-1">
                  {compliance!.violations.map((v, i) => (
                    <li key={i} className="text-[10px] text-red-300 flex gap-1.5">
                      <span className="text-red-500 flex-shrink-0">✗</span>
                      <span>{v}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Route debug */}
            {event.routeDebug && (
              <Section title="Route Debug">
                <Field label="pathUsed" value={event.routeDebug.pathUsed ?? "—"} />
                {typeof event.routeDebug.openaiCalled === "boolean" && (
                  <Field label="openaiCalled" value={String(event.routeDebug.openaiCalled)} />
                )}
              </Section>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
