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
- **Historical Contract**: [View superseded contract on Studio-dev Explorer](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913)
- **Historical Deployment Transaction**: [View superseded deployment transaction](https://explorer-studio-dev.genlayer.com/tx/0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a)
- **Historical Source SHA-256**: `b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29`
- **Status**: **SUPERSEDED / NONCANONICAL — DO NOT USE**
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

- **Status**: **PUBLICATION_READY — CANONICAL DEPLOYMENT GATED**
- **Public Fixtures Status**: **PUBLICATION_READY** (`npm run fixtures:check` exits 0). All Stage-A evidence documents and Stage-B snapshots are published and commit-pinned.
- **Live Integration & Funding Gate**:
  - Official faucet funding succeeded: [`0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d`](https://explorer-studio-dev.genlayer.com/tx/0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d)
  - Ephemeral challenger funding succeeded: [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21)
  - Live harness halted during funding receipt verification (`NOT_VOTED` on native transfer between EOAs; see [evidence/live-integration.md](evidence/live-integration.md)).
  - Zero disposable scenario contracts were deployed.
  - Zero contract credits allocated.
- **Action**: In accordance with the deployment gate rules, execution stopped prior to live disposable scenario execution and canonical redeployment. No canonical contract has been deployed.

---

## Testing Matrix

| Test Suite | File | Tests | Status | Scope |
|---|---|---|---|---|
| Contract Unit Tests | `tests/direct/test_reservecovenant.py` | 76 | **PASSED** | Constructor bounds, schema validation, deterministic challenges, future-dated reports, ineligible reserves, semantic outcome consistency, prompt injection defense, settlements, invariants |
| Signer & Guard Tests | `tests/direct/test_signer_resolver.py` | 6 | **PASSED** | Autonomous keychain signer, fail-closed guards, secret cleanliness, factory resolution |
| **Total Direct Tests** | | **82** | **100% PASS** | Zero regressions across existing unit test suite |
| Offline Harness (Python) | `tests/harness/test_live_harness_offline.py` | 15 | **PASSED** | Signer separation logic, distinct ephemeral challenger resolution, fail-closed guards, receipt-backed error classification, session-scoped balance preflight, dynamic fee validation (`OFFLINE_HARNESS_VALIDATION_PASS`) |
| Offline Harness (TypeScript) | `deploy/test_harness_offline.ts` | 41 checks | **PASSED** | Pure offline harness validation: authoritative SDK status mappings, actual receipt evidence, exact 13-target manifest matching, discriminated failure tracking, explicit sweep dispositions, combined readiness semantics, and dedicated native transfer verification (`OFFLINE_HARNESS_VALIDATION_PASS`) |
| Live Integration Launcher (Python) | `deploy/run_python_live_integration.ts` | Orchestration | **DISABLED (Option B)** | Fail-closed guard (`BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED`); TypeScript harness is authoritative to protect ephemeral funds |
| Live Integration (Python) | `tests/integration/test_reservecovenant_live.py` | 8 | **SKIPPED (0 writes)** | Implemented and offline-validated; not live-executed (gated by fixture publication) |
| Live Integration (TypeScript) | `deploy/run_live_integration.ts` | 8 | **HALTED AT FUNDING** | Preflight passed, challenger funded via on-chain transfer; halted on receipt assertion before scenario deployment |

---

## Deployment & Verification Status

### Disposable Live-Validation Contracts — Noncanonical

| Scenario | Purpose | Disposable Contract | Deployment Status | Result |
|---|---|---|---|---|
| Scenario 1 | Coverage Shortfall Breach | [`0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf`](https://explorer-studio-dev.genlayer.com/address/0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `BREACHED`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 2 | Ineligible Reserve Breach | [`0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA`](https://explorer-studio-dev.genlayer.com/address/0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `BREACHED`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 3 | Future-Dated Disclosure | [`0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0`](https://explorer-studio-dev.genlayer.com/address/0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `BREACHED`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 4 | Material Disclaimer Breach | [`0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4`](https://explorer-studio-dev.genlayer.com/address/0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `BREACHED`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 5 | Unsupported Claim Upheld | [`0xbd80518107647cD17c1Af617c5a50fc5b9B037ee`](https://explorer-studio-dev.genlayer.com/address/0xbd80518107647cD17c1Af617c5a50fc5b9B037ee) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `UPHELD`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 6 | Compliant Disclosure Inconclusive | [`0xd746297196b2c4a18bE1bA45f5541537F018cce0`](https://explorer-studio-dev.genlayer.com/address/0xd746297196b2c4a18bE1bA45f5541537F018cce0) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `INCONCLUSIVE`, consensus: `FINALIZED / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 7 | Repeated Resolution Revert | [`0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26`](https://explorer-studio-dev.genlayer.com/address/0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `INCONCLUSIVE`, consensus: `FINALIZED / MAJORITY_AGREE`, repeated resolve revert: `FINISHED_WITH_ERROR / MAJORITY_AGREE`, invariant: `true`) |
| Scenario 8 | Cancel Epoch & Double Withdrawal Revert | [`0xa8dA22D18534453CdFA1b7693Fa460B1ef7De6AD`](https://explorer-studio-dev.genlayer.com/address/0xa8dA22D18534453CdFA1b7693Fa460B1ef7De6AD) | DEPLOYED (Noncanonical) | **PASSED** (Final Contract State: `CANCELLED`, consensus: `FINALIZED / MAJORITY_AGREE`, double withdrawal revert: `FINISHED_WITH_ERROR / MAJORITY_AGREE`, invariant: `true`) |

*Labeling: Every disposable contract above is **DISPOSABLE / NONCANONICAL — DO NOT USE**. Zero canonical contracts have been deployed.*

### Verified Studio-Dev Transactions & Participants

- **Issuer Public Address**: [`0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`](https://explorer-studio-dev.genlayer.com/address/0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD)
- **Faucet Top-Up Transaction**: [`0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d`](https://explorer-studio-dev.genlayer.com/tx/0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d) (`10.000 GEN`)
- **Current Authoritative Issuer Balance**: `11,553,465,994,499,443,020 wei` (~`11.55347 GEN`)
- **Persistent OS Keychain Challenger**: [`0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9`](https://explorer-studio-dev.genlayer.com/address/0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9)
  - Keychain Service: `genlayer-cli`, Account: `account:reservecovenant-challenger`
  - Sweep 1 Tx: [`0x4d11bc2cab2ebb8745ddca0ca05610ee34d0915524655d62dc9b39ee64e30728`](https://explorer-studio-dev.genlayer.com/tx/0x4d11bc2cab2ebb8745ddca0ca05610ee34d0915524655d62dc9b39ee64e30728) (`509,716,429,250,049,300 wei`)
  - Authorized Final Dust Sweep Tx: [`0xc7974fbea7a0ec2f0f8286b3a9d7ed9b47636c42227e5d62578b7f2fdac2535a`](https://explorer-studio-dev.genlayer.com/tx/0xc7974fbea7a0ec2f0f8286b3a9d7ed9b47636c42227e5d62578b7f2fdac2535a) (`104,873,695,000,009,529 wei`)
  - Final Residual Balance: `0 wei` (strictly and authoritatively `0 wei`)
- **Historical Ephemeral Challenger Balances**:
  - Challenger 1: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698) (`1,720,000,000,000,173,913 wei`)
  - Challenger 2: [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e) (`1,720,000,000,000,173,913 wei`)
  - Session 3 Ephemeral Residual: [`0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D`](https://explorer-studio-dev.genlayer.com/address/0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D) (`127,873,695,000,009,529 wei`)
- **Historical Deployment**: [`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913) (**SUPERSEDED / NONCANONICAL — DO NOT USE**)
  - Historical Deployment Tx: [`0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`](https://explorer-studio-dev.genlayer.com/tx/0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a)

### Economic Cleanup Disposition & Live Readiness

- **Primary Scenarios**: `PRIMARY_SCENARIOS_PASS` (All eight scenario workflows reached their intended terminal contract states with satisfied accounting invariants. The cited intelligent-contract writes reached `FINALIZED / MAJORITY_AGREE`. The two expected negative-path transactions reached `FINALIZED / FINISHED_WITH_ERROR / MAJORITY_AGREE`. Native transfers reached `FINALIZED / NOT_VOTED` with `value_credited=true`.)
- **Contract Credits**: `105,000,000,000,000,000 wei` (`0.105 GEN`) withdrawn across 13 operations
- **Contract Cleanup**: `13/13 TARGETS WITHDRAWN` (all credits from all deployed scenarios recovered; confirmed on-chain via `get_accounting()`)
- **Persistent Challenger EOA Residual**: `0 wei` (verified on OS keychain account `0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9`)
- **CURRENT_SESSION_LIVE_READINESS**: Live-validation and disposable-contract cleanup complete; canonical deployment and portal submission remain pending.

*Historical Ephemeral Notice*: Historical test balances from earlier sessions prior to keychain persistence remain stranded due to non-persisted ephemeral keys. The current continuation session utilizes persistent OS keychain storage (`service: genlayer-cli`, `account: reservecovenant-challenger`) and has achieved a strict `0 wei` residual.

*Historical Transaction Retrieval Notice*: All eight disposable contract addresses and transaction hashes cited in this evidence record were committed from live on-chain executions. While current on-chain state reads confirm that all eight disposable contracts have zero balance, zero credits, zero locked bonds, and satisfied invariants, retrieval of older individual transaction receipts from the public Studio-dev RPC endpoint may be subject to network retention and indexing policies. Committed transaction hashes are preserved without alteration or fabrication.

### Historical Publication & CI Verification

- **Repository URL**: `https://github.com/edwarderlick/ReserveCovenant`
- **Contract Source SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a` (UNCHANGED)
- **Schema SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1` (UNCHANGED)
- **Two-Commit Fixture Publication Flow**:
  - **Stage-A Evidence Commit (`COMMIT_A`)**: `7060b5e631fb5e2581fc51f7d23bf331ee79184c`
  - **Stage-B Snapshot Publication Commit (`COMMIT_B`)**: `698b675e5b637f263f841ac148e1718f3c566024`
- **Public GitHub Actions CI & Commits**:
  - Baseline Green CI: [Run 39219903114](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39219903114) (Commit [`48eef4e021c6c1c75a01144f0bec555b084a8b11`](https://github.com/edwarderlick/ReserveCovenant/commit/48eef4e021c6c1c75a01144f0bec555b084a8b11))
  - Code-Bearing Continuation Green CI: [Run 39230843987](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39230843987) (Commit [`7f8c43a4e98f79e8cf168f86fdb43ae2fe70f901`](https://github.com/edwarderlick/ReserveCovenant/commit/7f8c43a4e98f79e8cf168f86fdb43ae2fe70f901))
  - Prior Evidence-Documentation Green CI: [Run 39233275830](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39233275830) (Commit [`f1d9b3003254aa33c7f8668086e9380f6c6de91b`](https://github.com/edwarderlick/ReserveCovenant/commit/f1d9b3003254aa33c7f8668086e9380f6c6de91b))
- **Public Fixtures Status**: **PUBLICATION_READY** (`npm run fixtures:check` exits 0).
- **Authoritative Lifecycle Boundary**:
  - Live-validation and disposable-contract cleanup complete; canonical deployment and portal submission remain pending.
  - Canonical Deployment: NOT PERFORMED
  - Canonical Deployed-Source Parity: NOT YET PROVEN
  - GenLayer Portal Submission: NOT PERFORMED

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

# 5. Run offline harness & signer separation validation (33 tests, zero network writes)
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
│   ├── run_python_live_integration.ts  # Fail-closed Python live preflight gate disabled under Option B
│   ├── schema.json                     # ABI schema (15 methods)
│   ├── signer.ts                       # OS keychain autonomous signer
│   ├── smoke_read.ts                   # Live contract view reader
│   ├── test_harness_offline.ts         # Pure offline TypeScript harness validation (18 checks)
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
│   │   └── test_live_harness_offline.py# Offline harness tests (15 tests)
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

