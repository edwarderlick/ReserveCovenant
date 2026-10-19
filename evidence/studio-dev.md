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
============================= 15 passed in 5.24s ==============================
=== Running Offline Live-Harness Validation Suite ===
[1/18] Testing Authoritative SDK Status Mappings...
[2/18] Testing Rejection of Unknown / Non-Final Receipt Statuses...
[3/18] Testing Derived Transaction Counts for Both Parties...
[4/18] Testing Full Scenario Credit Breakdown...
[5/18] Testing Issuer Expected Recoverable Credit (0.039 GEN)...
[6/18] Testing Challenger Expected Recoverable Credit (0.066 GEN)...
[7/18] Testing Total Contract Credit Recovery (0.105 GEN)...
[8/18] Testing Receipt Status/Result Copied From Actual Validated Summaries...
[9/18] Testing Exact 13-Target Manifest Matching...
[10/18] Testing Discriminated Cleanup Failure Records...
[11/18] Testing Sweep Readiness and Explicit Dispositions...
[12/18] Testing Real Combined Readiness State...
[13/18] Testing Signer Balance Preflight Closed Behavior...
[14/18] Testing Rejection of Non-Zero Post-Withdrawal Credits...
[15/18] Testing Honest Post-Sweep Residual Measurement...
[16/18] Testing Python Launcher Option B Disposition...
[17/18] Testing Python Dynamic Fee Environment Builder...
[18/18] Testing Funding Math Boundary Cases...
Verifying Signer Separation, Receipts, Invariants & Fixtures...

All 18 repair verification checks passed successfully.

=================================================
>>> OFFLINE_HARNESS_VALIDATION_PASS <<<
Harness logic, authoritative SDK status mappings,
dual-party credit recovery, dynamic funding,
receipt verification, error classification, and
scenario specifications verified offline.
(Zero deployments, zero transactions submitted).
=================================================
```
Result: **OFFLINE_HARNESS_VALIDATION_PASS** (33 tests passed: 15 Python in `tests/harness/test_live_harness_offline.py` + 18 TypeScript check groups in `deploy/test_harness_offline.ts`).

#### Detailed Architectural Enhancements Verified:

1. **Receipt-Backed Expected Contract Error Validation**:
   - Implemented structured error classes `ContractExecutionReceiptError` (in TypeScript `deploy/harness_utils.ts` and Python `tests/integration/test_reservecovenant_live.py`).
   - Fields: `transactionHash`, `methodName`, `receipt`, `consensusStatus`, `executionResult`, and `contractErrorPayload`.
   - `expectContractExecutionError` and `assert_expected_contract_failure` enforce all 7 required conditions:
     1. Nonempty transaction hash.
     2. Receipt object/dict exists.
     3. Consensus status is exactly `FINALIZED` or `ACCEPTED`.
     4. Execution result is exactly `FINISHED_WITH_ERROR`.
     5. Recorded method equals `expectedMethod`.
     6. Normalized contract error payload contains required `expectedErrorSubstring`.
     7. State-unchanged verification callback passes.
   - Strictly rejects:
     - Generic errors containing "revert" without receipts;
     - Locally manufactured error strings;
     - Errors without receipts or transaction hashes;
     - Non-finalized or pending receipts;
     - Unexpected success (`FINISHED_WITH_RETURN`);
     - Unrelated infrastructure/RPC errors or timeouts;
     - Wrong method or wrong error substring;
     - Post-error state mutations.
   - Specific normalized contract error substrings enforced:
     - Scenario 7: `"resolve_challenge only allowed in CHALLENGED state"` (`method: "resolve_challenge"`).
     - Scenario 8: `"No withdrawal credit available"` (`method: "withdraw_credit"`).
   - 10 comprehensive offline scenarios tested in `deploy/test_harness_offline.ts`:
     1. Finalized expected contract error with correct method and reason → accepted.
     2. Finalized contract error with wrong reason → rejected.
     3. Finalized contract error with wrong method → rejected.
     4. Pending FINISHED_WITH_ERROR-like receipt → rejected.
     5. Receipt missing transaction hash → rejected.
     6. Generic `Error("revert")` without receipt → rejected.
     7. Generic `Error("FINISHED_WITH_ERROR")` without receipt → rejected.
     8. RPC timeout containing expected reason text → rejected.
     9. FINISHED_WITH_RETURN → rejected.
     10. State mutation after expected revert → rejected.

2. **Python Expected-Error Handling & Limitation Documentation**:
   - Python `assert_expected_contract_failure` accepts returned receipt dictionaries or structured `ContractExecutionReceiptError` exceptions.
   - Plain unstructured exceptions (`Exception("CHALLENGED")`, `Exception("credit")`, `ConnectionError`) are rejected fail-closed.
   - Limitation: In `gltest`/`genlayer_py`, high-level calls return transaction receipt dicts. When structured receipts are unavailable, the authoritative TypeScript live harness serves as the primary verification engine, while Python scenarios provide secondary state-level checks.

3. **Challenger Balance Preflight Scope**:
   - Corrected fixture scoping: Full-suite funding check (`0.035 GEN`) runs once per test session before Scenario 1 via a session sentinel.
   - Decreasing balance does NOT trigger a false full-suite failure on subsequent tests after earlier scenarios legitimately spend funds.
   - Before each challenger transaction, `verify_challenger_next_tx_balance` verifies only the upcoming operation requirements:
     $$\text{Upcoming Requirement} = \text{Bond (0.005 GEN)} + \text{Estimated Fee} + \text{Safety Margin} \approx 0.0053\text{ GEN}$$
   - Fails closed before submission with `BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE` if upcoming balance is insufficient.

4. **Exact Typed SDK Client Interface**:
   - Replaced `issuerClient: any` with strictly typed structural interface `SupportedFundingClient` in `deploy/harness_utils.ts`:
     - `sendTransaction(args: { to: Address; value: bigint; [key: string]: unknown }): Promise<Hex>`
     - `waitForTransactionReceipt(args: { hash: Hex }): Promise<ReceiptType>`
     - `getBalance(args: { address: Address }): Promise<bigint>`
   - TypeScript detects missing methods, wrong address formats, and invalid return types without type bypassing (`any`).
   - If the client cannot expose `sendTransaction`, fails closed with `BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API`.

5. **Issuer Deployment Fee Preflight**:
   - Deployment estimate explicitly labeled as a conservative heuristic: `DEPLOY_FEE_HEURISTIC_MULTIPLIER = 3n`.
   - Fresh issuer balance check performed immediately before each deployment and write, aborting prior to submission if funds cannot cover that operation.

6. **Dual-Party Contract Credit Recovery & Economic Cleanup**:
   - Transaction planning derives counts separately:
     - `challengeBondTransactionCount`: 7
     - `challengerSignedTransactionCount`: 14 (7 challenges + 6 cleanup withdrawals + 1 sweep)
     - `challengerCleanupWithdrawalCount`: 6
     - `challengerSweepTransactionCount`: 1
     - `issuerCleanupWithdrawalCount`: 7
     - `issuerSignedTransactionCount`: 26 (19 primary + 7 cleanup withdrawals)
   - Because disposable contract instances configure `treasury == issuer`, scenarios 1–7 create both challenger and issuer pull credits. Before cleanup, contract credits are at least:
     - Challenger recoverable credits: 0.066 GEN (66e15 wei) ($4 \times 0.014\text{ GEN} + 2 \times 0.005\text{ GEN}$)
     - Issuer/treasury recoverable credits: 0.039 GEN (39e15 wei) ($4 \times 0.001\text{ GEN} + 1 \times 0.015\text{ GEN} + 2 \times 0.010\text{ GEN}$)
     - Total contract credits: 0.105 GEN (105e15 wei) (excluding externally owned account residuals and fees).
   - Dual-party cleanup routine in `deploy/run_live_integration.ts`:
     1. Queries and withdraws every positive challenger credit with challenger signer.
     2. Queries and withdraws every positive issuer credit with issuer signer.
     3. Re-reads both credits after each withdrawal and strictly asserts 0.
     4. Verifies accounting invariant (`get_accounting().invariant_satisfied == true`).
     5. Sweeps challenger residual balance back to issuer, re-queries balance, and records the exact observed residual balance (dust) without falsely claiming zero stranded.
   - Decoupled Readiness Semantics:
     - `PRIMARY_SCENARIOS_PASS / FAIL`
     - `ECONOMIC_CLEANUP_PASS / PARTIAL / FAIL`
     - `LIVE_READINESS_PASS` only when both phases pass.
     - Cleanup failures preserve primary scenario evidence but exit nonzero and block live readiness.
   - Python Live Launcher Disposition:
     - Disabled fail-closed under Option B with `BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED` to prevent allocating and abandoning ephemeral funds without receipt-verified cleanup.
     - The TypeScript live harness (`deploy/run_live_integration.ts`) is the sole authoritative live execution path.

### 5. Public Fixtures Check & Prepublication Mode
Commands:
```bash
npm run fixtures:check
npm run fixtures:prepublish
```
- `npm run fixtures:check` (Strict Publication Mode): Exits nonzero (code 1) prior to repository publication because fixture URLs contain prepublication placeholder branch references. Correctly reports `BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION`.
- `npm run fixtures:prepublish` (Pre-Publication Inspection Mode): Exits code 0 because internal evidence file hashes match snapshots, placeholder state is explicitly detected, and the blocked status is internally consistent.

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
npm run test:integration:python:live
npm run test:integration:live
```
Output:
```
============================= 8 skipped in 0.07s ==============================
=== ReserveCovenant Python Live Integration Launcher ===
[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.
No transactions were submitted to the network.

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

### 11. Final Readiness, Security & Boundary Status

- **Contract Repair Status**: Contract repair is verified offline with 82 passing direct tests.
- **Immutable Hashes**:
  - `contracts/reservecovenant.py`: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a` (UNCHANGED)
  - `deploy/schema.json`: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1` (UNCHANGED)
- **Live Harness Implementation**: Complete and offline-tested across 33 tests (15 Python + 18 TypeScript checks).
- **Public Fixtures Status**: Fixtures are not public; placeholders remain pending remote publication.
- **Live Scenarios**: Real live validator scenarios have NOT run in this pass.
- **Validator Consensus**: Validator consensus has NOT been demonstrated on Studio Devnet.
- **Canonical Redeployment**: Canonical redeployment has NOT occurred.
- **Current Status**: **BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION**
- **Historical Deployment**: **SUPERSEDED / NONCANONICAL** (`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`)
- **GitHub Actions Status**: **PREPARED — NOT PUBLICLY EXECUTED**
- **Portal Submission**: No portal submission has occurred.
- **Network Writes & Deployments**: Exactly **zero** network writes and **zero** deployments executed.
- **Authoritative Statement**: **No live validator-consensus result is claimed.**

---

## Known Limitations & Boundaries

1. **Strict Product Boundary**: ReserveCovenant determines solely whether hash-pinned reserve evidence conforms to a frozen disclosure policy. It makes no claims and provides no certification that the issuer is solvent, reserves physically exist, assets are safe, a token is fully backed, or that it replaces an audit or legal advice.
2. **Evidence Accessibility**: Semantic evaluation relies on publicly accessible HTTPS endpoints for fetching disclosure documents during resolution. If an evidence URL goes down, fails SSL handshake, or hash check fails, consensus logic fails closed to `INCONCLUSIVE` rather than assuming breach.
3. **Validator LLM Adjudication**: While validator reasoning is constrained by strict prompt delimiters and a rigid schema, natural language interpretation is probabilistic. Multi-validator consensus and fail-closed schemas mitigate prompt injection and hallucinations.
4. **Placeholder Fixture URLs**: Current local snapshot fixtures contain placeholder URLs pending public repository publication and the Two-Commit publication flow. Live validator consensus testing is not claimed.
5. **Lifetime Epoch Bound**: Storage is constrained to a maximum of 12 lifetime reporting epochs per contract deployment to prevent state bloat on the GenVM network.
6. **Citation Exactness**: Semantic challenges require the cited text to exist literally (16..500 characters) within the hash-verified evidence documents; paraphrased or inferred citations are treated as unsupported and resolve `UPHELD`.


