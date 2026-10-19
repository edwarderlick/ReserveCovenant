# ReserveCovenant Studio Devnet Live Integration Evidence

## 1. Execution Context

- **Execution Timestamp**: 2026-10-19T07:21:02Z (12:51:02+05:30)
- **Target Network**: GenLayer Studio Devnet Preview (`studioDevnet`)
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Explorer Base**: `https://explorer-studio-dev.genlayer.com`
- **Repair Git Commit**: `6981dbfa97a5fb72022309ddc307cffb09d36f31`
- **Green CI Run**: [`https://github.com/edwarderlick/ReserveCovenant/actions/runs/39214830441`](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39214830441)
- **Stage-A Evidence Commit (`COMMIT_A`)**: `7060b5e631fb5e2581fc51f7d23bf331ee79184c`
- **Stage-B Snapshot Commit (`COMMIT_B`)**: `698b675e5b637f263f841ac148e1718f3c566024`
- **Authoritative Fixture Base**: `https://raw.githubusercontent.com/edwarderlick/ReserveCovenant/698b675e5b637f263f841ac148e1718f3c566024/fixtures`
- **Immutable Contract SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a`
- **Immutable Schema SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`

---

## 2. Participant Accounts & Current Authoritative Balances

### Issuer Signer
- **Keychain Service**: `genlayer-cli`
- **Account Identifier**: `account:coverlock-submitter`
- **Public Address**: [`0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`](https://explorer-studio-dev.genlayer.com/address/0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD)
- **Faucet Top-Up Transaction**: [`0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d`](https://explorer-studio-dev.genlayer.com/tx/0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d) (`10.000 GEN`)
- **Current Authoritative Issuer Balance**: `11,701,261,087,749,496,816 wei` (~`11.70126 GEN`)

### Historical Ephemeral Challenger 1 (Incident 1)
- **Public Address**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698)
- **Funding Transaction**: [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21)
- **Exact Balance**: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
- **Status**: **STRANDED STUDIO-DEV TEST BALANCE — OLD EPHEMERAL KEY UNAVAILABLE**
- **Non-Recoverability**: Ephemeral private key was not persisted; cannot be recovered.

### Planned Native-Transfer Canary Challenger (Phase 7)
- **Public Address**: [`0x298ECE720dFE465ED9F77dDe88505F7F73016774`](https://explorer-studio-dev.genlayer.com/address/0x298ECE720dFE465ED9F77dDe88505F7F73016774)
- **Canary Funding Transaction**: [`0x9a790c2cdbe68a3339c447b3b93b1076e3eae3cdbb4f73a4aea23132f756132d`](https://explorer-studio-dev.genlayer.com/tx/0x9a790c2cdbe68a3339c447b3b93b1076e3eae3cdbb4f73a4aea23132f756132d)
  - Amount: `10,000,000,000,000,000 wei` (`0.01 GEN`)
  - Status: `FINALIZED`, Result: `NOT_VOTED`, Value Credited: `true`
  - Balance Delta: `10,000,000,000,000,000 wei` (exact match)
- **Canary Residual Sweep Transaction**: [`0xfbfdb01b98fadb2226ba9f8e9e0221a9a43db47f34251919ece0ed507984a16f`](https://explorer-studio-dev.genlayer.com/tx/0xfbfdb01b98fadb2226ba9f8e9e0221a9a43db47f34251919ece0ed507984a16f)
  - Amount: `10,000,000,000,000,000 wei` (`0.01 GEN`)
  - Status: `FINALIZED`, Result: `NOT_VOTED`, Value Credited: `true`
- **Final Canary Residual Balance**: `0 wei` (100% swept cleanly back to issuer)
- **Canary Disposition**: **NATIVE_TRANSFER_CANARY_PASS**

### Newly Authorized Live Run Challenger 2 (Phase 8)
- **Public Address**: [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e)
- **Funding Transaction**: [`0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769`](https://explorer-studio-dev.genlayer.com/tx/0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769)
  - Consensus Status: `FINALIZED` (`status: 7`)
  - Execution Result: `NOT_VOTED` (`txExecutionResult: 0`)
  - Value Credited: `true`
  - Signed Rollup Exact Value: `0x17deaae315aea759` = `1,720,000,000,000,173,913 wei`
  - Recipient Post-Balance: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
  - Exact Recipient Delta: `1,720,000,000,000,173,913 wei`
- **Raw Receipt Value (IEEE-754 Float Rounded)**: `1,720,000,000,000,173,824 wei` (89 wei float precision loss)
- **Current Balance**: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
- **Status**: **STRANDED STUDIO-DEV TEST BALANCE — EPHEMERAL KEY UNAVAILABLE**
- **Non-Recoverability Notice**: The ephemeral private key was held only in memory during execution and was not persisted. When the process halted, the in-memory reference was released in accordance with lifecycle safety rules. This test balance cannot be recovered without the ephemeral private key. Per safety rules, the key must not be guessed, fabricated, or reconstructed.

---

## 3. Live Run Execution Analysis & Fail-Closed Safety

### Incident Analysis
During the newly authorized live validation run, `client.sendTransaction` submitted `1,720,000,000,000,173,913 wei` from the issuer to ephemeral challenger `0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`. Consensus finalized the transfer (`FINALIZED`, `NOT_VOTED`, `value_credited: true`), and the recipient received the exact `1,720,000,000,000,173,913 wei` balance delta.

However, `client.waitForTransactionReceipt` returned a receipt object where `value` was parsed as a `bigint` with value `1720000000000173824n` (originating from the RPC server's IEEE-754 float serialization of JSON numeric values exceeding `Number.MAX_SAFE_INTEGER`). In the initial repair pass, `verifyNativeTransferReceipt` handled float rounding only for `typeof rec.value === "number"`, but viem's receipt formatter had converted the float-rounded value into a `bigint`. This caused line 832 to reject the 89-wei difference before Scenario 1 deployment.

### Rule 13 Adherence
Per Rule 13 (*"Do not automatically retry a live run after its first submitted transaction"*), the harness immediately halted and did NOT automatically retry. Exactly 0 scenario contracts were deployed.

### Lifecycle & Verifier Hardening Completed
1. `verifyNativeTransferReceipt` was updated to recognize that when `rec.value` arrives as a `bigint` or `string` with IEEE-754 precision loss (> `Number.MAX_SAFE_INTEGER`), it is marked `receiptValueExact = false` and verified via exact balance delta (`postBalance - preBalance >= requestedAmountWei`).
2. The scenario and funding execution block in `run_live_integration.ts` was restructured so that funding is wrapped within the scenario exception handler, guaranteeing that emergency native sweeps and credit withdrawals ALWAYS execute even if funding verification or deployment throws.

---

## 4. Live Validation State Summary

| Metric | Status | Detail |
|---|---|---|
| **Contract Credits** | `NONE CREATED` | Exactly 0 scenario contracts deployed; no contract credits exist |
| **Contract Cleanup** | `NOT REQUIRED` | No scenario contracts deployed |
| **Ephemeral EOA Cleanup** | `FAILED / IMPOSSIBLE AFTER KEY LOSS` | Ephemeral key released after halt; balance remains stranded |
| **Stranded Balance (Challenger 1)** | `1.720000000000173913 GEN` | Address [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698) |
| **Stranded Balance (Challenger 2)** | `1.720000000000173913 GEN` | Address [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e) |
| **Native-Transfer Canary** | `PASSED (0 residual dust)` | Address [`0x298ECE720dFE465ED9F77dDe88505F7F73016774`](https://explorer-studio-dev.genlayer.com/address/0x298ECE720dFE465ED9F77dDe88505F7F73016774) |
| **PRIMARY_SCENARIOS** | `NOT_RUN / HALTED_AFTER_FUNDING` | Halted after challenger funding before Scenario 1 deployment |
| **ECONOMIC_CLEANUP** | `FAILED` | Positive unmanaged residual on ephemeral challenger EOA |
| **EPHEMERAL_EOA_CLEANUP** | `FAILED` | Key lost with positive test balance |
| **LIVE_READINESS** | `BLOCKED` | Must NOT be declared ready while positive balances remain stranded |
| **Historical Superseded Contract** | [`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913) | **SUPERSEDED / NONCANONICAL — DO NOT USE** |
| **Historical Deployment Tx** | [`0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`](https://explorer-studio-dev.genlayer.com/tx/0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a) | Superseded pre-repair deployment |
| **Canonical Deployment** | `NOT PERFORMED` | Canonical deployment remains gated |
| **GenLayer Portal Submission** | `NOT PERFORMED` | No portal interaction |
