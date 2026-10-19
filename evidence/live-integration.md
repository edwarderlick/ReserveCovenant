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

### Newly Authorized Live Run Challenger 3 (Current Session)
- **Public Address**: [`0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D`](https://explorer-studio-dev.genlayer.com/address/0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D)
- **Funding Transaction**: [`0xa5c6327319e52114ad62b668a45746582d47ab3fea63bd2af188017611067f9e`](https://explorer-studio-dev.genlayer.com/tx/0xa5c6327319e52114ad62b668a45746582d47ab3fea63bd2af188017611067f9e)
  - Amount: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
  - Consensus Status: `FINALIZED` (`status: 7`)
  - Execution Result: `NOT_VOTED` (`txExecutionResult: 0`)
  - Value Credited: `true`
  - Recipient Post-Balance: `1,720,000,000,000,173,913 wei` (exact delta verified)
  - Native Transfer Verifier: **PASSED**

#### Executed Scenario Contracts (Noncanonical)
1. **Scenario 1 (Coverage Shortfall Breach)**:
   - Contract: [`0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf`](https://explorer-studio-dev.genlayer.com/address/0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf)
   - Status: `BREACHED`, Invariant: `true` (**PASSED**)
2. **Scenario 2 (Ineligible Reserve Breach)**:
   - Contract: [`0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA`](https://explorer-studio-dev.genlayer.com/address/0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA)
   - Status: `BREACHED`, Invariant: `true` (**PASSED**)
3. **Scenario 3 (Future-Dated Stale Report)**:
   - Contract: [`0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0`](https://explorer-studio-dev.genlayer.com/address/0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0)
   - Status: `BREACHED`, Invariant: `true` (**PASSED**)
4. **Scenario 4 (Material Disclaimer Semantic Breach)**:
   - Contract: [`0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4`](https://explorer-studio-dev.genlayer.com/address/0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4)
   - Status: `BREACHED`, Invariant: `true` (**PASSED**)
5. **Scenario 5 (Unsupported Semantic Accusation Upheld)**:
   - Contract: [`0xbd80518107647cD17c1Af617c5a50fc5b9B037ee`](https://explorer-studio-dev.genlayer.com/address/0xbd80518107647cD17c1Af617c5a50fc5b9B037ee)
   - Publish Epoch Tx: [`0x50968e391b70f3548a7c549e812404e49ab0e4d0d61e428c1d58b2ced3023f97`](https://explorer-studio-dev.genlayer.com/tx/0x50968e391b70f3548a7c549e812404e49ab0e4d0d61e428c1d58b2ced3023f97)
   - Execution Result: Halted during `waitForTransactionReceipt` due to transient RPC error (`fetch failed`).

#### Emergency Economic Cleanup Execution
- Challenger Withdrawals (4 operations): `56,000,000,000,000,000 wei` (`0.056 GEN`)
- Issuer Withdrawals (4 operations): `4,000,000,000,000,000 wei` (`0.004 GEN`)
- Total Contract Credits Recovered: `60,000,000,000,000,000 wei` (`0.060 GEN`)
- Native Sweep Transaction: [`0x3f6ca77c7c89e145128ef83b417976839cfd4aeec916d1c27f06ec6944dcc8db`](https://explorer-studio-dev.genlayer.com/tx/0x3f6ca77c7c89e145128ef83b417976839cfd4aeec916d1c27f06ec6944dcc8db)
  - Pre-Sweep Balance: `1,627,306,548,250,157,800 wei`
  - Status: `FINALIZED`, Result: `NOT_VOTED`
  - Post-Sweep Final Observed Balance: `127,873,695,000,009,529 wei` (~`0.12787 GEN`)
- Signer Cleanliness: In-memory signer reference released in `finally` block following cleanup completion.

### Historical Ephemeral Challenger Balances
- **Incident 1 Challenger**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698) (`1,720,000,000,000,173,913 wei`, tx [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21))
- **Incident 2 Challenger**: [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e) (`1,720,000,000,000,173,913 wei`, tx [`0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769`](https://explorer-studio-dev.genlayer.com/tx/0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769))

---

## 3. Live Run Execution Analysis & Fail-Closed Safety

### Session Incident Analysis
During execution of Scenario 5 on disposable contract `0xbd80518107647cD17c1Af617c5a50fc5b9B037ee`, the transaction `publish_epoch` (tx `0x50968e391b70f3548a7c549e812404e49ab0e4d0d61e428c1d58b2ced3023f97`) was successfully submitted and finalized on-chain (`status: "0x1"`). However, the client call to `waitForTransactionReceipt` encountered an intermittent network failure (`fetch failed`).

### Fail-Closed Lifecycle Validation
In accordance with non-negotiable rules:
1. The harness did NOT attempt an automatic retry.
2. The exception was caught, and all transaction hashes were preserved.
3. The harness immediately invoked emergency economic cleanup, safely querying and withdrawing all 8 outstanding pull credits from contracts 1–4 ($0.056$ GEN to challenger, $0.004$ GEN to issuer).
4. The challenger balance was swept back to the issuer via tx `0x3f6ca77c7c89e145128ef83b417976839cfd4aeec916d1c27f06ec6944dcc8db`.
5. The remaining residual was measured and honestly recorded without fabrication.
6. The in-memory private key was held until cleanup completed, then released in `finally`.

---

## 4. Live Validation State Summary

| Metric | Status | Detail |
|---|---|---|
| **Primary Scenarios** | `PRIMARY_SCENARIOS_FAIL` | 4 completed (`BREACHED`), Scenario 5 halted on RPC error, 6–8 unexecuted |
| **Contract Credits** | `8/13 TARGETS WITHDRAWN` | Exactly `0.060 GEN` pulled across 8 operations |
| **Contract Cleanup** | `COMPLETE FOR DEPLOYED` | Zero unresolved credits across all 5 deployed contracts |
| **Challenger EOA Residual** | `127,873,695,000,009,529 wei` | Observed residual on `0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D` |
| **Economic Cleanup** | `ECONOMIC_CLEANUP_PARTIAL` | Partial suite completion prevented full 13-target execution |
| **CURRENT_SESSION_LIVE_READINESS**| `BLOCKED` | Positive residual blocks declaration of readiness |
| **Historical Stranded 1** | `1.720000000000173913 GEN` | Address [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698) |
| **Historical Stranded 2** | `1.720000000000173913 GEN` | Address [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e) |
| **Historical Superseded Contract** | [`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913) | **SUPERSEDED / NONCANONICAL — DO NOT USE** |
| **Historical Deployment Tx** | [`0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`](https://explorer-studio-dev.genlayer.com/tx/0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a) | Superseded pre-repair deployment |
| **Canonical Deployment** | `NOT PERFORMED` | Canonical deployment remains gated |
| **GenLayer Portal Submission** | `NOT PERFORMED` | No portal interaction |
