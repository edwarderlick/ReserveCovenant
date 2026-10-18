# Studio Devnet Verification Evidence: ReserveCovenant

## Target Network & Environment

- **Network**: GenLayer Studio Devnet Preview
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Runner**: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`
- **GenVM Bundle**: `genlayerlabs-genvm-manager-v0.6.0-rc8`

## Tool Versions

- **Python**: `3.12.10`
- **Node.js**: `v22.13.1`
- **npm**: `11.12.1`
- **genvm-linter**: `0.11.0`
- **genlayer-py**: `0.19.0rc2`
- **genlayer-test**: `0.30.0rc2`
- **genlayer-js**: `2.0.0-rc.1`
- **pytest**: `8.3.4`
- **typescript**: `5.7.2`

## Source & Artifact Hashes

### Repaired Local Contract Source
- **Contract Source**: `contracts/reservecovenant.py`
  - **SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a`
  - **Byte Count**: `60,109` bytes
  - **Line Count**: `1,521` lines
- **ABI Schema**: `deploy/schema.json`
  - **SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`
  - **Byte Count**: `4,049` bytes
  - **Line Count**: `231` lines

### Historical Pre-Repair Deployment Hashes
- **Deployed Address**: `0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`
- **Historical Source SHA-256**: `b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29`
- **Historical Byte Count**: `57,749` bytes
- **Historical Line Count**: `1,480` lines
- **Status**: **SUPERSEDED / NONCANONICAL**

---

## Contract Method Surface (Verified ABI)

The ABI schema (`deploy/schema.json`) defines exactly **15 methods** (8 views, 7 writes):

### 1. View Methods (Readonly)
1. `get_config() -> dict`: Returns frozen deployment parameters.
2. `get_current_status() -> str`: Returns state string (`UNINITIALIZED`, `OPEN`, `CHALLENGED`, etc.).
3. `get_active_epoch() -> dict`: Returns active non-terminal epoch or empty dict.
4. `get_epoch(epoch_id: int) -> dict`: Returns complete epoch record by ID.
5. `get_history_count() -> int`: Returns count of stored historical terminal epochs.
6. `get_history(index: int) -> dict`: Returns terminal epoch record at index.
7. `get_credit(account: Address) -> int`: Returns pull-credit balance for an address in wei.
8. `get_accounting() -> dict`: Returns balance, locked bonds, credits, and invariant boolean.

### 2. Transaction Methods (State Mutating)
1. `publish_epoch(snapshot_url: str, snapshot_sha256: str)` [Payable: `issuer_bond`]: Issuer publishes disclosure epoch.
2. `cancel_epoch(epoch_id: int)`: Issuer cancels unchallenged open epoch; refunds bond.
3. `finalize_unchallenged(epoch_id: int)`: Permissionless finalization after challenge window expires.
4. `open_challenge(epoch_id: int, challenge_type: str, evidence_url: str, evidence_sha256: str, citation: str, statement: str)` [Payable: `challenger_bond`]: Challenger locks bond and opens challenge.
5. `timeout_challenge(epoch_id: int)`: Permissionless recovery if resolution window expires; refunds bonds equally.
6. `resolve_challenge(epoch_id: int)`: Permissionless execution of deterministic rules or validator LLM consensus.
7. `withdraw_credit()`: Caller withdraws accumulated pull-credits.

### Nonexistent Methods Clarification
The following methods do **NOT** exist in the contract or ABI schema:
- `get_active_challenge`: Active challenge details are queried via `get_active_epoch()`.
- `get_epoch_history(limit)`: History is queried via `get_history_count()` and `get_history(index)`.
- `get_dispute_record(epoch_id)`: Dispute records are embedded in `get_epoch(epoch_id)`.

---

## Test Execution Results

### 1. GenVM Lint and Semantic Validation
Command:
```bash
genvm-lint check contracts/reservecovenant.py
```
Output:
```
✓ Lint passed (3 checks)
✓ Validation passed
  Contract: ReserveCovenant
  Methods: 15 (8 view, 7 write)
```

### 2. ABI Schema Extraction and Parity Check
Commands:
```bash
genvm-lint schema -o deploy/schema.json --json contracts/reservecovenant.py
diff -u deploy/schema.json <(genvm-lint schema --json contracts/reservecovenant.py)
```
Result: **Byte-for-byte exact schema parity verified.**

### 3. Direct Unit Tests (Offline Suite)
Command:
```bash
pytest tests/direct -v
```
Output:
```
============================= 82 passed in 4.49s ==============================
```
- Total direct tests: **82 passed, 0 failed, 0 skipped** (76 in `test_reservecovenant.py`, 6 in `test_signer_resolver.py`).
- All existing direct tests remain passing without regressions.

### 4. Offline Live-Harness Validation Suite
Command:
```bash
npm run test:harness
```
Output:
```
============================== 4 passed in 0.06s ==============================
=== Running Offline Live-Harness Validation Suite ===
[1/5] Testing Signer Separation...
[2/5] Testing Immutable Fixture URL Validation...
[3/5] Testing Scenario Specifications...
[4/5] Testing Public Fixture Preparation Tool (Dry-Run)...
[5/5] All offline validation checks passed.

=================================================
>>> OFFLINE_HARNESS_VALIDATION_PASS <<<
Harness logic, signer separation, URL security,
and scenario specifications verified offline.
(Zero deployments, zero transactions submitted).
=================================================
```
Result: **OFFLINE_HARNESS_VALIDATION_PASS**. Confirms:
- Signer separation logic (self-challenge rejected before any network write);
- Strict immutable fixture URL validation (commit-pinned accepted; mutable `/main/`, branches rejected);
- Scenario call specifications (Scenario 4 calls `open_challenge` with `challengeType: "MATERIAL_DISCLAIMER"`);
- Scenario 7 uses a fresh disposable instance for repeated resolution testing;
- Public fixture preparation tool dry-run and canonical JSON serialization.

### 5. Public Fixtures Check & Two-Commit Publication Flow
Command:
```bash
npm run fixtures:check
```
Output:
```
=== ReserveCovenant Public Fixtures Preparation & Verification ===
Local Evidence Files Verified: true
All Fixtures Commit-Pinned:   false

Notice: Current fixtures contain local/placeholder URLs pending public repository publication:
 - epoch-compliant.json: mutable or invalid URL '.../main/...' (Mutable branch reference 'main' is strictly disallowed. Exact 40-hex commit SHA required.)
 - epoch-coverage-shortfall.json: mutable or invalid URL '.../main/...'
 - epoch-future-dated.json: mutable or invalid URL '.../main/...'
 - epoch-ineligible-reserve.json: mutable or invalid URL '.../main/...'
 - epoch-material-disclaimer.json: mutable or invalid URL '.../main/...'

Status: BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION (expected prior to public repo publication).
```
**Two-Commit Publication Procedure**:
1. **Stage A (Evidence Commit)**:
   - Publish local evidence files (`issuer-upheld-evidence.json`, `issuer-material-disclaimer.json`, `challenger-unsupported-claim.json`, `challenger-material-disclaimer.json`) to GitHub repository.
   - Capture Evidence Commit SHA A.
2. **Stage B (Snapshot Commit)**:
   - Run `deploy/prepare_public_fixtures.ts --owner <owner> --repo <repo> --commit-a <COMMIT_A> --write`.
   - Script validates `COMMIT_A` (40 lowercase hex chars), verifies evidence file SHA-256 matches, pins nested URLs to `COMMIT_A`, and canonically formats JSON.
   - Commit updated snapshot fixtures to GitHub and capture Snapshot Commit SHA B.
   - Set `RESERVECOVENANT_FIXTURE_BASE_URL=https://raw.githubusercontent.com/<owner>/<repo>/<COMMIT_B>/fixtures`.

### 6. Integration Test Opt-In Guard Verification
Commands:
```bash
pytest tests/integration/test_reservecovenant_live.py -v
npm run test:integration:live
```
Output:
```
============================= 8 skipped in 0.08s ==============================
=== ReserveCovenant Live Integration Test Suite ===
[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.
No transactions were submitted to the network.
```
Result: **Zero deployments and zero network transactions submitted.**

### 7. TypeScript Compilation
Command:
```bash
npx tsc --noEmit
```
Result: **Zero errors. Strict typechecking clean across all scripts and tooling.**

### 8. Historical Superseded Deployment (Pre-Repair)

- **Contract Address**: `0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`
- **Deployment Transaction Hash**: `0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`
- **Deployer Public Address**: `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`
- **Execution Result**: `FINISHED_WITH_RETURN`
- **Status**: `FINALIZED`
- **Deployed At**: `2026-10-18T17:26:47.382Z`
- **Receipt Location**: `deploy/deployment_receipt.json`
- **Assessment**: **SUPERSEDED / NONCANONICAL**. Contains pre-repair code with known logic defects.

### 9. On-Chain Source Parity Verification
Command:
```bash
npm run verify:onchain
```
Output:
```
=== ReserveCovenant On-Chain Contract Verification ===
[1] Local contract source path: D:\ReserveCovenant\contracts\reservecovenant.py
    Local source SHA-256:       590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a
    Local character count:      60109
[2] Read contract address from D:\ReserveCovenant\deploy\deployment_receipt.json: 0x8C34faA54238b777cDe7e4373B267b0A6d0E4913
[3] Target contract address: 0x8C34faA54238b777cDe7e4373B267b0A6d0E4913
[4] Fetching on-chain contract code via gen_getContractCode...
[5] On-chain source SHA-256:      b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29
    On-chain character count:     57749
----------------------------------------------------------------
>>> VERIFICATION RESULT: FAILED (SOURCE MISMATCH) <<<
Local SHA-256:    590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a
On-Chain SHA-256: b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29
```
Result: **Identifies on-chain code as historical pre-repair code.** Correctly distinguishes the superseded deployment from the local repaired source.

### 10. Historical Smoke Read (Superseded Contract)
Command:
```bash
npm run smoke:read
```
Output:
```
get_config():
  asset_id: "usd-reserve-covenant"
  symbol: "USDR"
  min_coverage_bps: 10000
  issuer_bond: 10000000000000000
  challenger_bond: 5000000000000000
  treasury_bps: 1000
  status: "UNINITIALIZED"
get_accounting():
  contract_balance: 0
  invariant_satisfied: true
  locked_issuer_bonds: 0
  locked_challenger_bonds: 0
  total_credits: 0
```

### 11. Public Fixture Gate, Signer Separation & Canonical Redeployment Status

- **Distinct Signers**: Both Python and TypeScript test suites strictly enforce signer separation (`normalized issuer != normalized challenger`). Issuer is resolved from OS keychain; ephemeral challenger is created in process memory via public SDK APIs (`generatePrivateKey()` / `createAccount()`).
- **Live Test Implementation**: 8 real executable scenarios implemented with fresh disposable contract deployments per scenario (including Scenario 7).
- **Public Fixture Gate Rule**: GenLayer validators require public, immutable HTTPS endpoints for evidence fetching during consensus. Under the local repository boundary (no GitHub repository exists, no remote configured), fixtures cannot yet be published to an immutable commit-pinned URL.
- **Gate Status**: **BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION**
- **Canonical Redeployment**: **STOPPED SAFELY**. No new canonical deployment performed.

---

## Known Limitations & Boundaries

1. **Strict Product Boundary**: ReserveCovenant determines solely whether hash-pinned reserve evidence conforms to a frozen disclosure policy. It makes no claims and provides no certification that the issuer is solvent, reserves physically exist, assets are safe, a token is fully backed, or that it replaces an audit or legal advice.
2. **Evidence Accessibility**: Semantic evaluation relies on publicly accessible HTTPS endpoints for fetching disclosure documents during resolution. If an evidence URL goes down, fails SSL handshake, or hash check fails, consensus logic fails closed to `INCONCLUSIVE` rather than assuming breach.
3. **Validator LLM Adjudication**: While validator reasoning is constrained by strict prompt delimiters and a rigid schema, natural language interpretation is probabilistic. Multi-validator consensus and fail-closed schemas mitigate prompt injection and hallucinations.
4. **Placeholder Fixture URLs**: Current local snapshot fixtures contain placeholder URLs pending public repository publication and the Two-Commit publication flow. Live validator consensus testing is not claimed.
5. **Lifetime Epoch Bound**: Storage is constrained to a maximum of 12 lifetime reporting epochs per contract deployment to prevent state bloat on the GenVM network.
6. **Citation Exactness**: Semantic challenges require the cited text to exist literally (16..500 characters) within the hash-verified evidence documents; paraphrased or inferred citations are treated as unsupported and resolve `UPHELD`.


