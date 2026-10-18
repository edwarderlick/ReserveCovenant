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

- **Contract Source**: `contracts/reservecovenant.py`
  - **SHA-256**: `b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29`
  - **Byte Count**: `57,749` bytes
  - **Line Count**: `1,480` lines
- **ABI Schema**: `deploy/schema.json`
  - **SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`

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
diff -u deploy/schema.json deploy/schema_check.json
```
Result: **Byte-for-byte exact schema parity verified.**

### 3. Direct Unit Tests (Offline Suite)
Command:
```bash
pytest tests/direct -v
```
Output:
```
============================= 68 passed in 11.56s =============================
```
- Total tests: **68 passed, 0 failed, 0 skipped**.
- Covers constructor bounds, address validation, snapshot schema parsing, float rejection, deterministic challenge paths, semantic consensus evaluation, prompt injection defense, pull-credit settlements, and invariant preservation.

### 4. Integration Test Opt-In Guard Verification
Command:
```bash
pytest tests/integration/test_reservecovenant_live.py -v
```
Output:
```
============================= 6 skipped in 0.04s ==============================
```
Result: **All 6 live scenarios safely skipped before any network writes.**

### 5. TypeScript Compilation
Command:
```bash
npx tsc --noEmit
```
Result: **Zero errors. Strict typechecking clean across all deployment scripts.**

### 6. Live Deployment Record (Studio Devnet Preview)

- **Contract Address**: `0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`
- **Deployment Transaction Hash**: `0x246f59bc63214688526339ad1f0c922b4b15b4abee00b4cbd0161176edf3795a`
- **Deployer Public Address**: `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`
- **Execution Result**: `FINISHED_WITH_RETURN`
- **Status**: `FINALIZED`
- **Deployed At**: `2026-10-18T17:26:47.382Z`
- **Receipt Location**: `deploy/deployment_receipt.json`

### 7. On-Chain Source Parity Verification
Command:
```bash
npm run verify:onchain
```
Output:
```
=== ReserveCovenant On-Chain Contract Verification ===
[1] Local contract source path: D:\ReserveCovenant\contracts\reservecovenant.py
    Local source SHA-256:       b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29
    Local character count:      57749
[2] Read contract address from D:\ReserveCovenant\deploy\deployment_receipt.json: 0x8C34faA54238b777cDe7e4373B267b0A6d0E4913
[3] Target contract address: 0x8C34faA54238b777cDe7e4373B267b0A6d0E4913
[4] Fetching on-chain contract code via gen_getContractCode...
[5] On-chain source SHA-256:      b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29
    On-chain character count:     57749
----------------------------------------------------------------
>>> VERIFICATION RESULT: PASS <<<
Byte-for-byte exact match verified between local file and on-chain contract code.
Matching SHA-256: b2ccef050d5b4ecd1088aba848bbf611187cf49738508240095a4aaef34bcf29
```

### 8. Live Contract Readback (Smoke Read)
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

## Known Limitations

1. **Evidence Accessibility**: Semantic evaluation relies on publicly accessible HTTPS endpoints for fetching disclosure documents during resolution. If an evidence URL goes down or fails SSL handshake, consensus fail-closed logic resolves as `INCONCLUSIVE` rather than assuming breach.
2. **Lifetime Epoch Bound**: Storage is constrained to a maximum of 12 lifetime reporting epochs per contract deployment to prevent state bloat on the GenVM network.
3. **Citation Exactness**: Semantic challenges require the cited text to exist literally within the hash-verified evidence documents; paraphrased or inferred citations are treated as unsupported and resolve `UPHELD`.
