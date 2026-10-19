# ReserveCovenant

> **Bonded proof-of-reserves disclosure covenant for stablecoins, wrapped assets and custodial crypto products on GenLayer.**

ReserveCovenant evaluates whether submitted disclosure evidence conforms to a frozen reserve-disclosure covenant. It determines whether hash-pinned reserve evidence conforms to a frozen disclosure policy without claiming that an issuer is solvent or that real-world assets physically exist.

---

## Strict Product Boundary

**ReserveCovenant certifies only whether submitted disclosure evidence supports or breaches an exact frozen covenant.**

ReserveCovenant makes **no claims and provides no certification** that:
- the issuer is solvent;
- reserves physically exist;
- assets are safe;
- a token is fully backed;
- the contract replaces an audit;
- the contract gives legal, investment or financial advice.

**Precise Framing:**
> *"ReserveCovenant evaluates whether submitted disclosure evidence conforms to a frozen reserve-disclosure covenant."*

---

## Why GenLayer?

Traditional smart contracts cannot read or reason about natural language disclosures, accounting attestations, custodial agreements, or regulatory filings. Oracles can report numbers, but they cannot evaluate qualitative contractual terms, such as:
- Encumbrances hidden in footnotes of attestation reports;
- Scope mismatches in custody declarations;
- Material disclaimers stating reserves are subject to parent commercial creditors;
- Unreported liabilities identified in public auditor notes.

ReserveCovenant utilizes GenLayer's Intelligent Contract architecture (`py-genlayer` runner) to execute multi-validator consensus across independent nodes. Validators fetch hash-verified evidence from the web, confirm cryptographic pre-images, parse strict canonical schemas, and apply hardened prompt-injection-resistant reasoning to determine whether disclosure covenants are upheld or breached.

---

## Core Participants

1. **Issuer**
   - Configured at contract deployment.
   - Publishes periodic reserve-disclosure epochs.
   - Posts the exact required `issuer_bond` with each epoch.
2. **Challenger**
   - Any address other than the issuer.
   - Challenges an active open epoch within the challenge window.
   - Posts the exact `challenger_bond`.
   - Supplies hash-pinned evidence, a bounded statement, and an exact citation.
3. **Treasury**
   - Configured at contract deployment.
   - Receives a deterministic portion (`treasury_bps`) of an issuer bond upon a confirmed breach.
4. **Resolver**
   - Permissionless: Any address may trigger resolution, finalization of unchallenged epochs, or timeout recovery.
   - The resolver's identity never influences the verdict, fee allocation, or settlement amounts.

---

## State Machine

```
              ┌───────────────────────────┐
              │       UNINITIALIZED       │
              └─────────────┬─────────────┘
                            │ publish_epoch()
                            ▼
              ┌───────────────────────────┐
       ┌─────►│           OPEN            ├──────┐
       │      └──────┬─────────────┬──────┘      │
       │ cancel_epoch│             │ open_       │ finalize_
       │             ▼             │ challenge   │ unchallenged
       │      ┌─────────────┐      ▼             ▼
       │      │  CANCELLED  │ ┌──────────┐ ┌──────────────┐
       │      │ (Terminal)  │ │CHALLENGED│ │ UNCHALLENGED │
       │      └─────────────┘ └────┬─────┘ │  (Terminal)  │
       │                           │       └──────────────┘
       │            resolve_challenge() /
       │            timeout_challenge()
       │                           │
       │       ┌───────────────────┼───────────────────┐
       │       ▼                   ▼                   ▼
       │ ┌───────────┐       ┌───────────┐       ┌──────────────┐
       │ │  BREACHED │       │   UPHELD  │       │ INCONCLUSIVE │
       │ │(Terminal) │       │(Terminal) │       │  (Terminal)  │
       │ └───────────┘       └───────────┘       └──────────────┘
       │                           │                    │
       └───────────────────────────┴────────────────────┘
                     (next epoch publication)
```

### State Definitions
- `UNINITIALIZED`: Deployment initialized, awaiting first epoch.
- `OPEN`: Epoch published by issuer; challenge window active.
- `CHALLENGED`: Epoch challenged by counterparty; resolution window active.
- `UNCHALLENGED`: Challenge window expired without challenge; bond returned to issuer.
- `UPHELD`: Challenge resolved in favor of the issuer; challenger bond forfeited to issuer.
- `BREACHED`: Challenge confirmed breach of frozen policy; issuer bond slashed to challenger and treasury.
- `INCONCLUSIVE`: Challenge inconclusive, evidence unreachable, or timed out; both bonds refunded.
- `CANCELLED`: Issuer cancelled epoch before challenge; bond refunded.

*Note:* Terminal epochs can never be challenged, cancelled, or re-resolved. A new epoch can only be published once the prior epoch has reached a terminal state.

---

## Frozen Deployment Configuration

All economic parameters, recipient addresses, bounds, and policy text are immutable and frozen in the constructor:

| Parameter | Type | Valid Range / Format | Description |
|---|---|---|---|
| `issuer` | `Address` | Non-zero checksummed hex | Authorized publishing entity |
| `treasury` | `Address` | Non-zero checksummed hex | Destination for slash fee share |
| `asset_id` | `str` | 3–64 chars (`^[a-z0-9._-]+$`) | Unique project identifier |
| `symbol` | `str` | 2–16 chars (`^[A-Z0-9]{2,16}$`) | Asset symbol |
| `policy_text` | `str` | 50–4,000 chars | Frozen plain-language disclosure policy |
| `eligible_categories` | `list[str]` | 1–8 unique normalized IDs | Whitelisted asset categories |
| `min_coverage_bps` | `u256` | 10,000–20,000 bps (100%–200%) | Mandatory minimum reserve ratio |
| `max_report_age_seconds`| `u256` | 3,600–2,592,000 s (1 hr–30 days) | Maximum freshness window |
| `challenge_window_seconds`| `u256` | 300–604,800 s (5 min–7 days) | Window to lodge a challenge |
| `resolution_timeout_seconds`| `u256`| 300–604,800 s (5 min–7 days) | Window before timeout recovery |
| `issuer_bond` | `u256` | 1 to $10^{30}$ wei | Bond posted by issuer per epoch |
| `challenger_bond` | `u256` | 1 to $10^{30}$ wei | Bond posted by challenger |
| `treasury_bps` | `u256` | 0–3,000 bps (0%–30%) | Treasury share of slashed bond |

---

## Reserve Snapshot Schema

Issuer disclosure snapshots must conform to a strict canonical compact JSON format:

```json
{
  "schema_version": 1,
  "epoch_label": "epoch-2026-10",
  "as_of_unix": 1790812800,
  "reported_reserve_total": 105000000,
  "reported_liability_total": 100000000,
  "reserve_items": [
    {
      "id": "cash_01",
      "category": "cash",
      "amount": 65000000
    },
    {
      "id": "ust_01",
      "category": "us_treasuries",
      "amount": 40000000
    }
  ],
  "liability_scope": "Total outstanding tokens issued and in circulation across all networks.",
  "custody_statement": "Reserves are held in segregated bank deposits and US treasury custody accounts.",
  "encumbrance_statement": "All assets are unencumbered, free from third-party liens, and not pledged as collateral.",
  "evidence": [
    {
      "source_id": "attestation_01",
      "url": "https://reserve-evidence.example.com/attestation-2026-10.json",
      "sha256": "3b296309d8fbf91aaccda1eac13e1cb6d3ad3f33348d2606d63c3de9e78b8675"
    }
  ]
}
```

### Strict Validation Rules
1. **Keys**: Exact allowed-key sets at every level. Unknown or missing keys cause immediate rejection.
2. **Integers Only**: All numbers must be integers. Floats, fractional numbers, and scientific notation are rejected.
3. **Liabilities**: Must be strictly positive ($> 0$).
4. **Reserves**: Non-negative ($\ge 0$). Sum of reserve item amounts must exactly equal `reported_reserve_total`.
5. **Coverage Calculation**: Recomputed deterministically on-chain:  
   $$\text{coverage\_bps} = \frac{\text{reported\_reserve\_total} \times 10000}{\text{reported\_liability\_total}}$$
6. **Freshness**: $\text{epoch\_published\_at} - \text{as\_of\_unix} \le \text{max\_report\_age\_seconds}$.
7. **Evidence Documents**: URLs must be HTTPS; SHA-256 hashes must be lowercase 64-character hexadecimal.

---

## Challenge Types & Evaluation Paths

| Challenge Type | Category | Evaluation Path | Verification Rule |
|---|---|---|---|
| `STALE_REPORT` | Deterministic | Arithmetic Check | `epoch_published_at - as_of_unix > max_report_age` |
| `COVERAGE_SHORTFALL` | Deterministic | Arithmetic Check | `computed_coverage_bps < min_coverage_bps` |
| `INELIGIBLE_RESERVE` | Deterministic | Allowlist Filter | Any category not in `eligible_categories` |
| `OMITTED_LIABILITY` | Semantic | Validator Consensus | Model evaluates evidence of unrecorded liabilities |
| `ENCUMBERED_ASSET` | Semantic | Validator Consensus | Model evaluates evidence of liens, pledges, or claims |
| `CUSTODY_SCOPE_MISMATCH`| Semantic | Validator Consensus | Model evaluates discrepancies in custodial custody terms |
| `MATERIAL_DISCLAIMER` | Semantic | Validator Consensus | Model evaluates disclaimers invalidating segregation |

### Literal Citation Requirement
For semantic challenges, the submitted `citation` must be proven as a **literal substring** of one of the fetched, hash-verified evidence documents before it is processed by the model. If the citation does not exist verbatim, the challenge resolves as `UPHELD` with reason code `UPHELD_CITATION_NOT_FOUND`.

---

## Settlement & Accounting

ReserveCovenant operates on a **pull-credit withdrawal pattern**. Funds are never transferred directly in the middle of consensus or verdict resolution.

### Settlement Distribution Table

| Outcome | Issuer Receives | Challenger Receives | Treasury Receives |
|---|---|---|---|
| **BREACH** | `0` | `challenger_bond + (issuer_bond - treasury_share)` | `(issuer_bond * treasury_bps) // 10000` |
| **UPHELD** | `issuer_bond + challenger_bond` | `0` | `0` |
| **INCONCLUSIVE** | `issuer_bond` | `challenger_bond` | `0` |
| **UNCHALLENGED** | `issuer_bond` | N/A | `0` |
| **CANCELLED** | `issuer_bond` | N/A | `0` |
| **TIMEOUT** | `issuer_bond` | `challenger_bond` | `0` |

*Rounding:* Integer division remainder in `issuer_bond - treasury_share` remains with the challenger.  
*Conservation Invariant:* Total credits distributed exactly equal the sum of locked bonds.

### Accounting Invariant
$$\text{Contract Native Balance} \ge \text{Locked Issuer Bonds} + \text{Locked Challenger Bonds} + \text{Total Outstanding Credits}$$

---

## Prompt-Injection Defense

Semantic evaluation prompts are strictly delimited and hardened against adversarial prompt injection:
1. All evidence documents, statements, and citations are quoted as inert data strings.
2. The model prompt explicitly commands the validator LLM to ignore commands found in quoted evidence (e.g., *"ignore previous instructions", "system override", "certify breach"*).
3. The model output is strictly constrained to a small, exact JSON schema:
   ```json
   {
     "outcome": "UPHELD | BREACH | INCONCLUSIVE",
     "challenge_type": "EXACT_TYPE",
     "evidence_supported": true,
     "reason_code": "BOUNDED_ENUM_VALUE"
   }
   ```
4. Output keys and reason codes are validated against a fixed enum allowlist. Any deviation, extra key, missing key, or unevidenced breach falls closed to `INCONCLUSIVE`.

---

## Bounded Storage Design

To prevent unbounded state growth on the GenVM network:
- Maximum 12 lifetime reporting epochs per contract deployment;
- At most one active non-terminal epoch at any time;
- At most one challenge per epoch;
- Maximum 8 reserve items per snapshot;
- Maximum 3 evidence documents per snapshot;
- FIFO ring buffer of 10 terminal history entries;
- Safe GenLayer storage map (`gl.storage.TreeMap[Address, u256]`) for pull-credits;
- No unbounded text or unbounded address ledgers stored on-chain.

---

## Contract ABI & Method Surface

The ReserveCovenant ABI consists of **15 methods** (8 views, 7 writes) defined in `deploy/schema.json` and validated by GenVM AST linting:

### Public Views (Readonly)

| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `get_config()` | None | `dict` | Returns immutable deployment configuration and parameters. |
| `get_current_status()` | None | `str` | Returns the current state machine status (`UNINITIALIZED`, `OPEN`, `CHALLENGED`, etc.). |
| `get_active_epoch()` | None | `dict` | Returns the active non-terminal epoch record, or empty dict if none. |
| `get_epoch(epoch_id)` | `epoch_id: int` | `dict` | Returns complete epoch record by ID, including snapshot and challenge details. |
| `get_history_count()` | None | `int` | Returns number of terminal epochs stored in FIFO history ring buffer (max 10). |
| `get_history(index)` | `index: int` | `dict` | Returns historical terminal epoch record at 0-based index. |
| `get_credit(account)` | `account: Address` | `int` | Returns outstanding pull-credit withdrawal balance for account in wei. |
| `get_accounting()` | None | `dict` | Returns locked bonds, total credits, contract balance, and invariant boolean. |

### Public Transactions (State Mutating)

| Method | Parameters | Payable | Description |
|---|---|---|---|
| `publish_epoch(snapshot_url, snapshot_sha256)` | `snapshot_url: str`, `snapshot_sha256: str` | **Yes** (`issuer_bond`) | Issuer publishes a new disclosure epoch with hash-pinned snapshot. |
| `cancel_epoch(epoch_id)` | `epoch_id: int` | No | Issuer cancels an open epoch before any challenge is filed; refunds bond. |
| `finalize_unchallenged(epoch_id)` | `epoch_id: int` | No | Permissionless: Finalizes an open epoch after challenge window expires without challenge. |
| `open_challenge(...)` | `epoch_id: int`, `challenge_type: str`, `evidence_url: str`, `evidence_sha256: str`, `citation: str`, `statement: str` | **Yes** (`challenger_bond`) | Challenger locks bond and opens a challenge against an active open epoch. |
| `timeout_challenge(epoch_id)` | `epoch_id: int` | No | Permissionless: Recovers funds equally to both parties if resolution window times out. |
| `resolve_challenge(epoch_id)` | `epoch_id: int` | No | Permissionless: Executes validator consensus or deterministic rules to resolve challenge. |
| `withdraw_credit()` | None | No | Pull-credit withdrawal: Transfers caller's accumulated credit balance to caller. |

> [!NOTE]
> **Clarification on Nonexistent Methods**:
> The methods `get_active_challenge`, `get_epoch_history(limit)`, and `get_dispute_record(epoch_id)` do **NOT** exist in the contract or ABI schema.
> - Active challenge details are accessed via `get_active_epoch()`.
> - Historic epochs are accessed via `get_history_count()` and `get_history(index)`.
> - Dispute and challenge records are embedded directly within epoch data returned by `get_epoch(epoch_id)`.

---

## Deployment & Verification Status

### Historical Superseded Deployment (Pre-Repair)

- **Network**: GenLayer Studio Devnet Preview (`studioDevnet`)
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Runner**: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- **Contract Address**: `0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`
- **Deployment Transaction**: `0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`
- **Historical Source SHA-256**: `b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29`
- **Status**: **SUPERSEDED / NONCANONICAL**
  - This deployment contains pre-repair source code with known defects (unreachable ineligible reserve breach path, future-dated report non-breach under `STALE_REPORT`, loose semantic outcome mapping, pre-lowered hash validation).
  - This historical contract must not be mutated or used as canonical.

### Current Repaired Source Code

- **Contract Path**: `contracts/reservecovenant.py`
- **Source SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a`
- **Byte Count**: `60,109` bytes
- **Line Count**: `1,521` lines
- **ABI Schema**: `deploy/schema.json`
- **Schema SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`

### Canonical Deployment Gate

- **Status**: `BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION`
- **Rationale**: GenLayer validators require public, immutable HTTPS endpoints for evidence fetching during consensus. Under the local repository boundary (no remote configured, no push permitted), fixtures cannot yet be published to an immutable commit-pinned URL.
- **Fixture URL Policy**: Placeholder URLs (e.g., `/main/`) are strictly rejected by the validator harness. Live testing requires the Two-Commit publication flow:
  1. Stage A: Publish evidence documents and capture Commit SHA A.
  2. Stage B: Pin snapshot nested evidence URLs to Commit SHA A (`deploy/prepare_public_fixtures.ts`), commit snapshots, and capture Commit SHA B.
  3. Live harness runs against Commit SHA B.
- **Action**: In accordance with the deployment gate rules, execution stopped prior to live disposable scenario execution and canonical redeployment. No new canonical contract has been deployed.

---

## Testing Matrix

| Test Suite | File | Tests | Status | Scope |
|---|---|---|---|---|
| Contract Unit Tests | `tests/direct/test_reservecovenant.py` | 76 | **PASSED** | Constructor bounds, schema validation, deterministic challenges, future-dated reports, ineligible reserves, semantic outcome consistency, prompt injection defense, settlements, invariants |
| Signer & Guard Tests | `tests/direct/test_signer_resolver.py` | 6 | **PASSED** | Autonomous keychain signer, fail-closed guards, secret cleanliness, factory resolution |
| **Total Direct Tests** | | **82** | **100% PASS** | Zero regressions across existing unit test suite |
| Offline Harness (Python) | `tests/harness/test_live_harness_offline.py` | 10 | **PASSED** | Signer separation logic, distinct ephemeral challenger resolution, fail-closed guards, error classifications, accounting invariant logic (`OFFLINE_HARNESS_VALIDATION_PASS`) |
| Offline Harness (TypeScript) | `deploy/test_harness_offline.ts` | 12 checks | **PASSED** | Pure offline harness validation, signer distinctness, dynamic funding calculations, receipt verification, error classifications, strict fixture check & prepublish modes (`OFFLINE_HARNESS_VALIDATION_PASS`) |
| Live Integration Launcher (Python) | `deploy/run_python_live_integration.ts` | Orchestration | **SKIPPED (0 writes)** | OS keychain issuer, ephemeral funded challenger, in-memory child injection, safe zero-write default |
| Live Integration (Python) | `tests/integration/test_reservecovenant_live.py` | 8 | **SKIPPED (0 writes)** | Implemented and offline-validated; not live-executed (gated by fixture publication) |
| Live Integration (TypeScript) | `deploy/run_live_integration.ts` | 8 | **SKIPPED (0 writes)** | Implemented and offline-validated; not live-executed (0 transactions submitted) |

---

## Live-Harness Readiness & Publication Status

- **Contract Repair Status**: Contract repair is verified offline with 82 passing direct tests.
- **Immutable Hashes**:
  - Contract (`contracts/reservecovenant.py`): `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a` (UNCHANGED)
  - Schema (`deploy/schema.json`): `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1` (UNCHANGED)
- **Live Harness Implementation**: Complete and offline-tested across 22 tests (10 Python + 12 TypeScript).
- **Public Fixtures Status**: Fixtures are not public; placeholder branch references remain pending remote publication.
- **Live Validator Scenarios**: Real live validator scenarios have NOT run in this pass.
- **Validator Consensus**: Validator consensus has NOT been demonstrated on Studio Devnet.
- **Canonical Redeployment**: Canonical redeployment has NOT occurred.
- **Current Status**: **BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION**
- **Historical Deployment**: **SUPERSEDED / NONCANONICAL** (`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`)
- **GitHub Actions Status**: **PREPARED — NOT PUBLICLY EXECUTED**
- **Portal Submission**: No portal submission has occurred.
- **Network Writes & Deployments**: Exactly **zero** network writes and **zero** deployments executed.
- **Authoritative Statement**: **No live validator-consensus result is claimed.**

---

## Reproduction & Verification Commands

```bash
# 1. Install dependencies
npm ci
pip install -r requirements.txt

# 2. Run GenVM AST linter and semantic validator (fail-closed runner)
npm run lint:contract

# 3. Verify ABI schema byte-for-byte parity without mutating tracked files
npm run schema:check

# 4. Run direct unit tests (exact existing 82 tests)
npm run test:direct

# 5. Run offline harness & signer separation validation (22 tests, zero network writes)
npm run test:harness

# 6. Verify fixture prepublish inspection (passes on internally consistent blocked state)
npm run fixtures:prepublish

# 7. Verify strict fixture publication check (fails closed with code 1 prior to publication)
npm run fixtures:check

# 8. Verify live integration skips safely without opt-in (0 transactions)
npm run test:integration
npm run test:integration:python:live
npm run test:integration:live

# 9. Typecheck TypeScript deployment tooling
npx tsc --noEmit

# 10. Check on-chain deployment status (reports superseded state)
npm run verify:onchain

# 11. Smoke read public views from Studio Devnet
npm run smoke:read
```

---

## Repository Structure

```
ReserveCovenant/
├── contracts/
│   └── reservecovenant.py              # Repaired GenLayer Intelligent Contract
├── deploy/
│   ├── deployment_receipt.json         # Historical deployment metadata (superseded)
│   ├── deployScript.ts                 # Autonomous Studio Devnet deployer
│   ├── fixture_url_validator.ts        # Strict immutable fixture URL validator
│   ├── harness_utils.ts                # Dynamic funding math, receipt validator, error classifier
│   ├── prepare_public_fixtures.ts      # Two-commit fixture publication tool (check & prepublish)
│   ├── run_canary.ts                   # Disposable canary test
│   ├── run_live_integration.ts        # Guarded TypeScript live harness (distinct signers)
│   ├── run_python_live_integration.ts  # Autonomous live launcher for Python live suite
│   ├── schema.json                     # ABI schema (15 methods)
│   ├── signer.ts                       # OS keychain autonomous signer
│   ├── smoke_read.ts                   # Live contract view reader
│   ├── test_harness_offline.ts         # Pure offline TypeScript harness validation (12 checks)
│   └── verify_onchain.ts               # On-chain byte parity verifier
├── evidence/
│   └── studio-dev.md                   # Studio Devnet audit evidence & defect analysis
├── fixtures/
│   ├── challenger-material-disclaimer.json
│   ├── challenger-unsupported-claim.json
│   ├── epoch-compliant.json
│   ├── epoch-coverage-shortfall.json
│   ├── epoch-future-dated.json
│   ├── epoch-ineligible-reserve.json
│   ├── epoch-material-disclaimer.json
│   ├── issuer-material-disclaimer.json
│   └── issuer-upheld-evidence.json
├── scripts/
│   └── run_fail_closed.cjs             # Cross-platform fail-closed script runner
├── tests/
│   ├── direct/
│   │   ├── test_reservecovenant.py
│   │   └── test_signer_resolver.py
│   ├── harness/
│   │   └── test_live_harness_offline.py# Offline harness tests (10 tests)
│   └── integration/
│       ├── fixture_url_validator.py
│       └── test_reservecovenant_live.py # Live integration suite (8 scenarios)
├── .github/
│   └── workflows/
│       └── verify.yml                  # Prepared CI workflow (not publicly executed)
├── .gitignore
├── gltest.config.yaml
├── LICENSE                             # Apache-2.0
├── package.json
├── package-lock.json
├── requirements.txt
└── tsconfig.json
```

---

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

