# ReserveCovenant Studio Devnet Live Integration Evidence

## 1. Execution Context

- **Execution Timestamp**: 2026-10-19T06:15:17Z (11:45:17+05:30)
- **Target Network**: GenLayer Studio Devnet Preview (`studioDevnet`)
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Explorer Base**: `https://explorer-studio-dev.genlayer.com`
- **Baseline Git Commit**: `1dbed02d89b1a82268c0fde86ae39e03a81b89c1`
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
- **Post-Funding Balance**: `13,421,261,087,749,670,818 wei` (~`13.42126 GEN`, reflecting `1.720 GEN` sent to ephemeral challenger)

### Ephemeral Challenger Signer
- **Generation Method**: In-memory ephemeral account via `generatePrivateKey()` / `createAccount()`
- **Public Address**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698)
- **Initial Balance**: `0 wei`
- **Funding Amount Received**: `1,720,000,000,000,173,913 wei` (~`1.720 GEN`)
- **Final Residual Balance**: `1,720,000,000,000,173,913 wei` (~`1.720 GEN`)

---

## 3. On-Chain Funding Transaction

- **Transaction Hash**: [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21)
- **Sender**: `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`
- **Recipient**: `0x197A05D11da0f26678cA93542d2FA8c89293d698`
- **Value**: `1,720,000,000,000,173,824 wei`
- **Consensus Status**: `FINALIZED` (`status: 7`)
- **Value Credited**: `true`
- **Execution Result**: `NOT_VOTED` (`txExecutionResult: 0`)
- **Raw Receipt**:
  ```json
  {
    "hash": "0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21",
    "from_address": "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    "to_address": "0x197A05D11da0f26678cA93542d2FA8c89293d698",
    "value": "1720000000000173824",
    "status": 7,
    "status_name": "FINALIZED",
    "txExecutionResult": 0,
    "txExecutionResultName": "NOT_VOTED",
    "value_credited": true
  }
  ```

---

## 4. Execution Halt & Receipt Diagnosis

- **Failure Phase**: Challenger funding receipt validation in `executeAndVerifyChallengerFunding()` (`deploy/harness_utils.ts:833`).
- **Observed Exception**:
  ```text
  Error: Receipt verification failed for challenger funding transaction (tx 0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21): unexpected executionResult='NOT_VOTED'
  ```
- **Root Cause Analysis**:
  `verifyReceiptExecution()` was originally designed for contract method writes and requires `executionResult === "FINISHED_WITH_RETURN"`. For a native balance transfer (`client.sendTransaction`), GenLayer consensus finalizes the balance transfer (`status: 7`, `status_name: "FINALIZED"`, `value_credited: true`), but validators do not execute smart contract bytecode, resulting in `txExecutionResultName: "NOT_VOTED"`.
- **Safety Response**:
  In accordance with rule 11 (*"Once the authoritative harness submits its first transaction, never automatically restart the full suite"*), the harness halted immediately and did not rerun.

---

## 5. Live Validation State Summary

| Metric | Status | Detail |
|---|---|---|
| **PRIMARY_SCENARIOS** | `NOT_RUN / HALTED_AFTER_FUNDING` | Halted after challenger funding before disposable deployments |
| **ECONOMIC_CLEANUP** | `NO_CONTRACT_CREDITS` | Exactly 0 contracts deployed, 0 credits allocated |
| **LIVE_READINESS** | `FAILED_DURING_FUNDING_RECEIPT_VERIFICATION` | Funding tx verified on-chain, halted on receipt assertion |
| **Disposable Contracts Deployed** | `0` | No scenario contracts created |
| **Challenger Residual Balance** | `1,720,000,000,000,173,913 wei` | In-memory ephemeral signer at `0x197A05D11da0...` |
| **Canonical Deployment** | `NOT PERFORMED` | Canonical deployment remains gated |
| **GenLayer Portal Submission** | `NOT PERFORMED` | No portal interaction |
