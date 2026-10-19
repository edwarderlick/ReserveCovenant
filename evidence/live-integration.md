# ReserveCovenant Studio Devnet Live Integration Evidence

## 1. Execution Context

- **Execution Timestamp**: 2026-10-19T06:15:17Z (11:45:17+05:30)
- **Target Network**: GenLayer Studio Devnet Preview (`studioDevnet`)
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Explorer Base**: `https://explorer-studio-dev.genlayer.com`
- **Baseline Git Commit**: `c7ca461ec678681060214ac39c797ece6ad1bb67`
- **Stage-A Evidence Commit (`COMMIT_A`)**: `7060b5e631fb5e2581fc51f7d23bf331ee79184c`
- **Stage-B Snapshot Commit (`COMMIT_B`)**: `698b675e5b637f263f841ac148e1718f3c566024`
- **Authoritative Fixture Base**: `https://raw.githubusercontent.com/edwarderlick/ReserveCovenant/698b675e5b637f263f841ac148e1718f3c566024/fixtures`
- **Immutable Contract SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a`
- **Immutable Schema SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`

---

## 2. Participant Accounts & Initial Funding

### Issuer Signer
- **Keychain Service**: `genlayer-cli`
- **Account Identifier**: `account:coverlock-submitter`
- **Public Address**: [`0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`](https://explorer-studio-dev.genlayer.com/address/0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD)
- **Initial Observed Balance**: `5,141,261,087,749,844,642 wei` (~`5.14126 GEN`)
- **Studio Devnet Faucet Top-Up**:
  - Endpoint: `https://studio-dev.genlayer.com/api` (`sim_fundAccount`)
  - Amount: `10,000,000,000,000,000,000 wei` (`10.000 GEN`)
  - Transaction Hash: [`0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d`](https://explorer-studio-dev.genlayer.com/tx/0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d)
  - Receipt Status: `0x1` (Success)
- **Funded Issuer Balance**: `15,141,261,087,749,844,642 wei` (~`15.14126 GEN`)
- **Current Authoritative Issuer Balance**: `13,421,261,087,749,670,729 wei` (~`13.42126 GEN`)

### Old Ephemeral Challenger Signer
- **Generation Method**: In-memory ephemeral account via `generatePrivateKey()` / `createAccount()`
- **Public Address**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698)
- **Initial Balance**: `0 wei`
- **Exact Funding Value Received**: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
- **Authoritative Current Balance**: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
- **Status**: **STRANDED STUDIO-DEV TEST BALANCE — OLD EPHEMERAL KEY UNAVAILABLE**
- **Non-Recoverability Notice**: The old challenger key was ephemeral and was not persisted; it is no longer available. This test balance cannot be recovered without the old ephemeral private key. Per safety rules, the key must not be fabricated, guessed, or reconstructed. This historical session is NOT economically clean.

---

## 3. Historical Challenger Funding Transaction

- **Transaction Hash**: [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21)
- **Sender**: [`0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`](https://explorer-studio-dev.genlayer.com/address/0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD)
- **Recipient**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698)
- **Authoritative RPC Value**: `1,720,000,000,000,173,913 wei`
- **Consensus Status**: `FINALIZED` (`status: 7`)
- **Value Credited**: `true`
- **Execution Result**: `NOT_VOTED` (`txExecutionResult: 0`)
- **JavaScript Precision Note**: The earlier recorded receipt value ending in `...3824` (`1,720,000,000,000,173,824 wei`) was an unsafe JavaScript number representation exceeding `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`), causing an 89-wei float precision loss against the exact RPC value of `1,720,000,000,000,173,913 wei`. All arithmetic has since been migrated to `bigint`.
- **Authoritative Raw Transaction**:
  ```json
  {
    "hash": "0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21",
    "from_address": "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    "to_address": "0x197A05D11da0f26678cA93542d2FA8c89293d698",
    "value": "1720000000000173913",
    "status": 7,
    "status_name": "FINALIZED",
    "txExecutionResult": 0,
    "txExecutionResultName": "NOT_VOTED",
    "value_credited": true
  }
  ```

---

## 4. Execution Halt & Root Cause

- **Failure Phase**: Challenger funding receipt validation in `executeAndVerifyChallengerFunding()`.
- **Observed Exception**:
  ```text
  Error: Receipt verification failed for challenger funding transaction (tx 0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21): unexpected executionResult='NOT_VOTED'
  ```
- **Root Cause**:
  `verifyReceiptExecution()` was designed exclusively for contract method writes and requires `executionResult === "FINISHED_WITH_RETURN"`. For a native balance transfer (`client.sendTransaction`), GenLayer consensus finalizes the balance transfer (`status: 7`, `status_name: "FINALIZED"`, `value_credited: true`), but validators do not execute smart contract bytecode, producing `txExecutionResultName: "NOT_VOTED"`.
- **Repair**:
  Implemented `verifyNativeTransferReceipt()` to verify native transfers with `NOT_VOTED` consensus semantics, exact balance delta validation, and bigint precision.

---

## 5. Live Validation State Summary (Historical Session)

| Metric | Status | Detail |
|---|---|---|
| **Contract Credits** | `NONE CREATED` | Exactly 0 scenario contracts deployed; no credits generated |
| **Contract Cleanup** | `NOT REQUIRED` | No contract credits exist to withdraw |
| **Ephemeral EOA Cleanup** | `FAILED / IMPOSSIBLE AFTER KEY LOSS` | Ephemeral signer released before sweep; key unavailable |
| **Stranded Studio-dev Test Balance** | `1.720000000000173913 GEN` | Exact RPC balance at `0x197A05D11da0f26678cA93542d2FA8c89293d698` |
| **PRIMARY_SCENARIOS** | `NOT_RUN / HALTED_AFTER_FUNDING` | Halted after challenger funding before scenario 1 |
| **LIVE_READINESS** | `BLOCKED` | Positive uncleaned residual and unexecuted scenarios |
| **Historical Superseded Contract** | [`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913) | **SUPERSEDED / NONCANONICAL — DO NOT USE** |
| **Historical Deployment Tx** | [`0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`](https://explorer-studio-dev.genlayer.com/tx/0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a) | Superseded pre-repair deployment |
| **Canonical Deployment** | `NOT PERFORMED` | Canonical deployment remains gated |
| **GenLayer Portal Submission** | `NOT PERFORMED` | No portal interaction |
