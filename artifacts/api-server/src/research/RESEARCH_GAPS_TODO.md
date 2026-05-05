# Research Library — Missing Categories TODO

## Governance Rule (REQUIRED for all new additions)

No document may enter the live retrieval pool unless:

1. It is submitted through `POST /api/admin/research` (status: pending, isActive: false)
2. The Librarian Agent runs on it: `POST /api/admin/research/:id/librarian/analyze`
3. The document receives `librarian_recommendation = 'approve'`, OR an admin manually approves a `needs_review` document after reviewing warningFlags
4. Admin sets `isActive = true` via `POST /api/admin/research/:id/approve`

**Never insert directly as `status: approved` without Librarian review.**

---

## Missing Categories — Priority Order

### PRIORITY 1 — High clinical risk, high user query frequency

#### 1a. Tendon / Overuse Injuries
- Patellar tendinopathy (jumper's knee) — load management, isometric protocols
- Achilles tendinopathy — eccentric loading, progressive return
- Rotator cuff tendinopathy — differential loading, scapular stability
- Lateral elbow tendinopathy (tennis elbow) — load titration
- Plantar fasciitis — tissue load, footwear, running load
- Iliotibial band syndrome — biomechanics, load reduction
- **Category:** `medical_rehab`
- **Safety note:** All tendon research requires `medical_claim_risk` flag review by Librarian

#### 1b. Knee Pain — Return to Training
- Patellofemoral pain syndrome — VMO loading, step-down mechanics
- ACL/MCL — conservative non-surgical return-to-sport protocols (not diagnosis)
- Post-ACL reconstruction return-to-sport criteria — strength symmetry, hop tests
- Knee OA — resistance training benefits, low-impact loading
- **Category:** `medical_rehab`
- **Safety note:** Must explicitly distinguish evidence-informed programming from medical treatment. Librarian must flag `medical_claim_risk`.

#### 1c. Re-entry / Return-to-Training Periodization
- General detraining and return-to-training loading principles
- Post-injury return ramp-up frameworks (not injury-specific diagnosis)
- Symptom-guided progression models
- **Category:** `medical_rehab` or `strength_conditioning`

---

### PRIORITY 2 — Core training gaps

#### 2a. Hypertrophy (activate pending Doc 23)
- Doc 23 ("Hypertrophy Science Fundamentals") is currently `pending / needs_review`
- Admin action required: review warningFlags (`expert_consensus`), then `POST /api/admin/research/23/approve` if acceptable
- Additional documents needed:
  - Rep range and load for hypertrophy (meta-analysis level if available)
  - Volume landmarks for muscle growth (Schoenfeld-style research)
  - Mechanical tension vs metabolic stress
  - Proximity to failure and hypertrophy
  - **Category:** `strength_conditioning`

#### 2b. Recovery / Fatigue Management (activate pending Doc 24)
- Doc 24 ("Recovery and Fatigue Management Protocols") is currently `pending / needs_review`
- Admin action required: review warningFlags (`expert_consensus`), then approve if acceptable
- Additional documents needed:
  - HRV-guided training load adjustment
  - Sleep and performance (meta-analysis)
  - Readiness-based autoregulation
  - **Category:** `recovery_wellness`

#### 2c. Concurrent Training (activate pending Doc 25)
- Doc 25 ("Concurrent Training") is currently `pending / needs_review`
- Admin action required: review warningFlags (`expert_consensus`, `conflicting_evidence`), approve with caution — conflict note already stored
- **Category:** `strength_conditioning`

---

### PRIORITY 3 — Conditioning / Energy Systems

#### 3a. Aerobic Base and Conditioning
- Zone 2 training and aerobic adaptation
- VO2max development methods
- High-intensity interval training (HIIT) — dose-response
- **Category:** `sport_performance` or `recovery_wellness`

#### 3b. Energy System Training for Team Sports
- Repeated sprint ability (RSA)
- Small-sided games as conditioning tool
- Aerobic-anaerobic transition in field sports
- **Category:** `sport_performance`

---

### PRIORITY 4 — Population gaps

#### 4a. Youth Athletes
- Resistance training safety in adolescents (well-established)
- Growth and bone health considerations
- Sport specialization risks
- Relative Energy Deficiency in Sport (RED-S) basics
- **Category:** `strength_conditioning` or `sport_performance`
- **Safety note:** All youth content needs extra librarian review for appropriate age-specific framing

#### 4b. Female Athletes
- Menstrual cycle and performance — emerging evidence, high conflict
- Hormonal considerations in strength programming
- RED-S and iron deficiency in female athletes
- **Category:** `recovery_wellness` or `medical_rehab`
- **Safety note:** Likely `needs_review` for most sources; warningFlags expected

#### 4c. General Population / Health Focus
- Resistance training and metabolic health (type 2 diabetes, cardiovascular)
- Exercise as medicine — primary prevention
- Sedentary population entry-level programming
- **Category:** `strength_conditioning`

---

### PRIORITY 5 — Advanced programming

#### 5a. Power and Rate of Force Development
- Olympic lifting for power (clean, snatch derivatives)
- Ballistic vs heavy resistance for RFD
- Contrast training (heavy + explosive in same session)
- **Category:** `sport_performance` or `strength_conditioning`

#### 5b. Warm-up Science (supplement existing Doc 8)
- Post-activation potentiation (PAP/PAPE) for performance
- Sport-specific warm-up protocols
- **Category:** `sport_performance`

---

## How to Add a Document (Step-by-Step)

```
1. POST /api/admin/research
   {
     title: "...",
     source: "...",   // real journal/book name, not "Curated"
     year: 2023,
     category: "medical_rehab",
     abstract: "...",  // paste the abstract or key findings
     status: "pending",
     isActive: false
   }

2. POST /api/admin/research/:id/librarian/analyze
   → Review the returned recommendation, warningFlags, trustLevel

3a. If recommendation = "approve":
    POST /api/admin/research/:id/approve
    → Document enters retrieval

3b. If recommendation = "needs_review":
    Review warningFlags carefully.
    If acceptable for coaching use, POST /api/admin/research/:id/approve
    → Document enters retrieval WITH warningFlags preserved

3c. If recommendation = "reject":
    Do not approve. Document stays rejected.
```

---

## Important: Do NOT fabricate citations

All source fields must be real publication names, journals, or textbooks.
If you do not have a real abstract, leave `abstract` blank — the Librarian will evaluate from title/metadata alone.
Do not invent DOIs, URLs, or journal names.
