# ReserveCovenant Studio Devnet Live Integration Evidence

## 1. Execution Context

- **Target Network**: GenLayer Studio Devnet Preview (`studioDevnet`)
- **Chain ID**: `61997`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`
- **Explorer Base**: `https://explorer-studio-dev.genlayer.com`
- **Baseline Git Commit**: [`48eef4e021c6c1c75a01144f0bec555b084a8b11`](https://github.com/edwarderlick/ReserveCovenant/commit/48eef4e021c6c1c75a01144f0bec555b084a8b11)
  - Baseline Green CI Run: [`https://github.com/edwarderlick/ReserveCovenant/actions/runs/39219903114`](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39219903114)
- **Code-Bearing Continuation Commit**: [`7f8c43a4e98f79e8cf168f86fdb43ae2fe70f901`](https://github.com/edwarderlick/ReserveCovenant/commit/7f8c43a4e98f79e8cf168f86fdb43ae2fe70f901)
  - Code-Bearing Continuation Green CI Run: [`https://github.com/edwarderlick/ReserveCovenant/actions/runs/39230843987`](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39230843987)
- **Prior Evidence-Documentation Commit**: [`f1d9b3003254aa33c7f8668086e9380f6c6de91b`](https://github.com/edwarderlick/ReserveCovenant/commit/f1d9b3003254aa33c7f8668086e9380f6c6de91b)
  - Prior Final Documentation Green CI Run: [`https://github.com/edwarderlick/ReserveCovenant/actions/runs/39233275830`](https://github.com/edwarderlick/ReserveCovenant/actions/runs/39233275830)
- **Stage-A Evidence Commit (`COMMIT_A`)**: `7060b5e631fb5e2581fc51f7d23bf331ee79184c`
- **Stage-B Snapshot Commit (`COMMIT_B`)**: `698b675e5b637f263f841ac148e1718f3c566024`
- **Authoritative Fixture Base**: `https://raw.githubusercontent.com/edwarderlick/ReserveCovenant/698b675e5b637f263f841ac148e1718f3c566024/fixtures`
- **Immutable Contract SHA-256**: `590de5d84a352dfea03b1e57c85bc44db5d5b681e9ca63a35786f5fc1d8ac96a`
- **Immutable Schema SHA-256**: `30db85a767b68d40fb5f5984b79cbd8436245693e20de03703c6dd9bd1bbe7a1`

---

## 2. Participant Accounts & Authoritative Balances

### Issuer Signer
- **Keychain Service**: `genlayer-cli`
- **Account Identifier**: `account:coverlock-submitter`
- **Public Address**: [`0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD`](https://explorer-studio-dev.genlayer.com/address/0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD)
- **Faucet Top-Up Transaction**: [`0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d`](https://explorer-studio-dev.genlayer.com/tx/0x79041ec3c1ded3a008913fabad595af3e78e594bb7365f78f9d2248a7fb3340d) (`10.000 GEN`)
- **Current Authoritative Issuer Balance**: `11,553,465,994,499,443,020 wei` (~`11.55347 GEN`)

### Persistent Keychain Challenger (Current Continuation Session)
- **Keychain Service**: `genlayer-cli`
- **Account Identifier**: `account:reservecovenant-challenger`
- **Public Address**: [`0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9`](https://explorer-studio-dev.genlayer.com/address/0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9)
- **Funding Transaction**: [`0xa17c0b0aeb7e63b655da54593e9808a385f5e27a696ee8cbf3471015f61763aa`](https://explorer-studio-dev.genlayer.com/tx/0xa17c0b0aeb7e63b655da54593e9808a385f5e27a696ee8cbf3471015f61763aa) (`0.650 GEN`)
- **Sweep Transaction 1**: [`0x4d11bc2cab2ebb8745ddca0ca05610ee34d0915524655d62dc9b39ee64e30728`](https://explorer-studio-dev.genlayer.com/tx/0x4d11bc2cab2ebb8745ddca0ca05610ee34d0915524655d62dc9b39ee64e30728)
  - Amount Swept: `509,716,429,250,049,300 wei`
  - Status: `FINALIZED`, Result: `NOT_VOTED`, Value Credited: `true`
- **Authorized Final Dust Sweep Transaction**: [`0xc7974fbea7a0ec2f0f8286b3a9d7ed9b47636c42227e5d62578b7f2fdac2535a`](https://explorer-studio-dev.genlayer.com/tx/0xc7974fbea7a0ec2f0f8286b3a9d7ed9b47636c42227e5d62578b7f2fdac2535a)
  - Amount Swept: `104,873,695,000,009,529 wei`
  - Status: `FINALIZED`, Result: `NOT_VOTED`, Value Credited: `true`
- **Final Persistent Challenger Residual Balance**: `0 wei` (strictly and authoritatively `0 wei`)

### Historical Stranded Ephemeral Balances (Prior Incidents)
- **Incident 1 Ephemeral Challenger**: [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698)
  - Balance: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
  - Funding Tx: [`0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21`](https://explorer-studio-dev.genlayer.com/tx/0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21)
  - Status: **STRANDED** (Ephemeral key was not persisted in OS keychain prior to policy enforcement)
- **Incident 2 Ephemeral Challenger**: [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e)
  - Balance: `1,720,000,000,000,173,913 wei` (`1.720000000000173913 GEN`)
  - Funding Tx: [`0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769`](https://explorer-studio-dev.genlayer.com/tx/0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769)
  - Status: **STRANDED**
- **Session 3 Ephemeral Challenger**: [`0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D`](https://explorer-studio-dev.genlayer.com/address/0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D)
  - Residual Balance: `127,873,695,000,009,529 wei` (~`0.12787 GEN`)
  - Funding Tx: [`0xa5c6327319e52114ad62b668a45746582d47ab3fea63bd2af188017611067f9e`](https://explorer-studio-dev.genlayer.com/tx/0xa5c6327319e52114ad62b668a45746582d47ab3fea63bd2af188017611067f9e)
  - Partial Native Sweep Tx: [`0x3f6ca77c7c89e145128ef83b417976839cfd4aeec916d1c27f06ec6944dcc8db`](https://explorer-studio-dev.genlayer.com/tx/0x3f6ca77c7c89e145128ef83b417976839cfd4aeec916d1c27f06ec6944dcc8db)
  - Status: **HISTORICAL RESIDUAL** (Replaced by persistent OS keychain challenger `0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9` which is now at `0 wei`)

---

## 3. Complete Primary Scenarios (1–8) Execution Record

All eight scenario workflows reached their intended terminal contract states with satisfied accounting invariants. The cited intelligent-contract writes reached `FINALIZED / MAJORITY_AGREE`. The two expected negative-path transactions reached `FINALIZED / FINISHED_WITH_ERROR / MAJORITY_AGREE`. Native transfers reached `FINALIZED / NOT_VOTED` with `value_credited=true`.

### Scenario 1: Coverage Shortfall Breach
- **Contract Address**: [`0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf`](https://explorer-studio-dev.genlayer.com/address/0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf)
- **Deployment Transaction**: [`0xb6e7ad75d71c4801089b09d9be8ce3c5b550570b61665a4bc032c1615d852bc4`](https://explorer-studio-dev.genlayer.com/tx/0xb6e7ad75d71c4801089b09d9be8ce3c5b550570b61665a4bc032c1615d852bc4)
- **Publish Epoch Transaction**: [`0xd0d04c10a4005b634ddf483c0f4f9f7d2bf64a3d5377f3747761ceebcf52ec74`](https://explorer-studio-dev.genlayer.com/tx/0xd0d04c10a4005b634ddf483c0f4f9f7d2bf64a3d5377f3747761ceebcf52ec74)
- **Open Challenge Transaction**: [`0xccb077aee29e710ff5c4a5293297a7604fdbfa5c5eeec86f0ea9ec1004e229bc`](https://explorer-studio-dev.genlayer.com/tx/0xccb077aee29e710ff5c4a5293297a7604fdbfa5c5eeec86f0ea9ec1004e229bc)
- **Resolve Challenge Transaction**: [`0xdc17a5b6d5f7ca10df6aee13175c5e62f40fe3ff4f52636f827a480d1e57c6b7`](https://explorer-studio-dev.genlayer.com/tx/0xdc17a5b6d5f7ca10df6aee13175c5e62f40fe3ff4f52636f827a480d1e57c6b7)
- **Final Contract State**: `BREACHED`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 2: Ineligible Reserve Breach
- **Contract Address**: [`0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA`](https://explorer-studio-dev.genlayer.com/address/0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA)
- **Deployment Transaction**: [`0x9ee4a4c5ce8462058e57e3f89078aeec7ddb92b67272ae40277873ce4c81061f`](https://explorer-studio-dev.genlayer.com/tx/0x9ee4a4c5ce8462058e57e3f89078aeec7ddb92b67272ae40277873ce4c81061f)
- **Publish Epoch Transaction**: [`0xafae02a246830500b46fa4360e2ce1c9eb2a36b94bfd060f64be87d3a042e616`](https://explorer-studio-dev.genlayer.com/tx/0xafae02a246830500b46fa4360e2ce1c9eb2a36b94bfd060f64be87d3a042e616)
- **Open Challenge Transaction**: [`0xb90ee10be01955fb4ea375d81232840cfeb7628841a1ba762fc385aa68a8dcba`](https://explorer-studio-dev.genlayer.com/tx/0xb90ee10be01955fb4ea375d81232840cfeb7628841a1ba762fc385aa68a8dcba)
- **Resolve Challenge Transaction**: [`0x7a3036a7153a80fcfebc979d501099684525ea285f2066d7e2311451fef06df0`](https://explorer-studio-dev.genlayer.com/tx/0x7a3036a7153a80fcfebc979d501099684525ea285f2066d7e2311451fef06df0)
- **Final Contract State**: `BREACHED`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 3: Future-Dated Stale Report
- **Contract Address**: [`0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0`](https://explorer-studio-dev.genlayer.com/address/0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0)
- **Deployment Transaction**: [`0xb7fa09d941865b45c26922df659ba91e779a5e8f4fa26b01476d05ee0e02c525`](https://explorer-studio-dev.genlayer.com/tx/0xb7fa09d941865b45c26922df659ba91e779a5e8f4fa26b01476d05ee0e02c525)
- **Publish Epoch Transaction**: [`0x140687f8f9ea32791cc30fa1400e932b6bcfa2eb1a25ec617957771746f39386`](https://explorer-studio-dev.genlayer.com/tx/0x140687f8f9ea32791cc30fa1400e932b6bcfa2eb1a25ec617957771746f39386)
- **Open Challenge Transaction**: [`0x7fb6e133d256fc832a8754b2aee0c0571d2b8b981611776ce59b43c6838a6a12`](https://explorer-studio-dev.genlayer.com/tx/0x7fb6e133d256fc832a8754b2aee0c0571d2b8b981611776ce59b43c6838a6a12)
- **Resolve Challenge Transaction**: [`0xf118c7d9da1b29a28896a237f48a8a4f9aa129e083c078aeecff1e1140939ca6`](https://explorer-studio-dev.genlayer.com/tx/0xf118c7d9da1b29a28896a237f48a8a4f9aa129e083c078aeecff1e1140939ca6)
- **Final Contract State**: `BREACHED`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 4: Material Disclaimer Semantic Breach
- **Contract Address**: [`0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4`](https://explorer-studio-dev.genlayer.com/address/0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4)
- **Deployment Transaction**: [`0xd450630b9101f37e1194206ca6bb1b1c31276063b45155f948bf81bb56ba9c97`](https://explorer-studio-dev.genlayer.com/tx/0xd450630b9101f37e1194206ca6bb1b1c31276063b45155f948bf81bb56ba9c97)
- **Publish Epoch Transaction**: [`0x98bb7eeb557aa18d533ba1eb04085c2c5c249a5b6c00d5402a5cf3a0f7936a71`](https://explorer-studio-dev.genlayer.com/tx/0x98bb7eeb557aa18d533ba1eb04085c2c5c249a5b6c00d5402a5cf3a0f7936a71)
- **Open Challenge Transaction**: [`0xa1779ba3f92e4a64861ee790696eb64139981882d8c3ae5e47878d65a8df2d06`](https://explorer-studio-dev.genlayer.com/tx/0xa1779ba3f92e4a64861ee790696eb64139981882d8c3ae5e47878d65a8df2d06)
- **Resolve Challenge Transaction**: [`0x341e97d159a68e6f1f4520bc39e802ef67b7325608b688d6ef4e057a627a4eb1`](https://explorer-studio-dev.genlayer.com/tx/0x341e97d159a68e6f1f4520bc39e802ef67b7325608b688d6ef4e057a627a4eb1)
- **Final Contract State**: `BREACHED`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 5: Unsupported Semantic Accusation Upheld
- **Contract Address**: [`0xbd80518107647cD17c1Af617c5a50fc5b9B037ee`](https://explorer-studio-dev.genlayer.com/address/0xbd80518107647cD17c1Af617c5a50fc5b9B037ee)
- **Deployment Transaction**: [`0x48a8eb6a2ba27e368a123fca9f1d0ecfe4c64b2d358cf399435b62b1bdfb6766`](https://explorer-studio-dev.genlayer.com/tx/0x48a8eb6a2ba27e368a123fca9f1d0ecfe4c64b2d358cf399435b62b1bdfb6766)
- **Publish Epoch Transaction**: [`0x50968e391b70f3548a7c549e812404e49ab0e4d0d61e428c1d58b2ced3023f97`](https://explorer-studio-dev.genlayer.com/tx/0x50968e391b70f3548a7c549e812404e49ab0e4d0d61e428c1d58b2ced3023f97)
- **Open Challenge Transaction**: [`0x5f81e8e54bb14ad0134e40946a90ca15a2030e550e40a315ad0eb51be94ae41c`](https://explorer-studio-dev.genlayer.com/tx/0x5f81e8e54bb14ad0134e40946a90ca15a2030e550e40a315ad0eb51be94ae41c)
- **Resolve Challenge Transaction**: [`0x63d87f4c12e22a35f85d9f6ef13ecc348ab4b84a605b3c724378c97f725941ed`](https://explorer-studio-dev.genlayer.com/tx/0x63d87f4c12e22a35f85d9f6ef13ecc348ab4b84a605b3c724378c97f725941ed)
- **Final Contract State**: `UPHELD`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 6: Unreachable Evidence Inconclusive
- **Contract Address**: [`0xd746297196b2c4a18bE1bA45f5541537F018cce0`](https://explorer-studio-dev.genlayer.com/address/0xd746297196b2c4a18bE1bA45f5541537F018cce0)
- **Deployment Transaction**: [`0x435c6d70c8a889ef797968ea1297953981a083de023a56bf67de845f8b6f6b24`](https://explorer-studio-dev.genlayer.com/tx/0x435c6d70c8a889ef797968ea1297953981a083de023a56bf67de845f8b6f6b24)
- **Publish Epoch Transaction**: [`0x6dd63c58e1b6340125dd2486ddc7ecfdc7499d9de26716f799780b2d676986fd`](https://explorer-studio-dev.genlayer.com/tx/0x6dd63c58e1b6340125dd2486ddc7ecfdc7499d9de26716f799780b2d676986fd)
- **Open Challenge Transaction**: [`0xde3a20f53fb2198c7a0c0aaecae756ded1f8f890be25ea49287526e5dbde6ff1`](https://explorer-studio-dev.genlayer.com/tx/0xde3a20f53fb2198c7a0c0aaecae756ded1f8f890be25ea49287526e5dbde6ff1)
- **Resolve Challenge Transaction**: [`0x19350fd4bdfb8df254a0beeb8edc87535f9e52e0656ebe42f65a2366ccb052f9`](https://explorer-studio-dev.genlayer.com/tx/0x19350fd4bdfb8df254a0beeb8edc87535f9e52e0656ebe42f65a2366ccb052f9)
- **Final Contract State**: `INCONCLUSIVE` (Deterministically verified via hash mismatch rule on reachable URL)
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 7: Repeated Resolution Revert Inconclusive
- **Contract Address**: [`0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26`](https://explorer-studio-dev.genlayer.com/address/0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26)
- **Deployment Transaction**: [`0x8495cdd394b10d3f2e7919bc992f78d4defdf3e65537bc911e2f0cbdbbf0a282`](https://explorer-studio-dev.genlayer.com/tx/0x8495cdd394b10d3f2e7919bc992f78d4defdf3e65537bc911e2f0cbdbbf0a282)
- **Publish Epoch Transaction**: [`0xb985a266ae23c231a541aedd4bfb888751f447f679f26dd93a8a3a11840443c4`](https://explorer-studio-dev.genlayer.com/tx/0xb985a266ae23c231a541aedd4bfb888751f447f679f26dd93a8a3a11840443c4)
- **Open Challenge Transaction**: [`0x84b0e45c0adfe1dd0b1ec8c69b388629a8332f3206955021c39e31d68884851e`](https://explorer-studio-dev.genlayer.com/tx/0x84b0e45c0adfe1dd0b1ec8c69b388629a8332f3206955021c39e31d68884851e)
- **First Resolve Challenge Transaction**: [`0xeae491bc4c244695d5a0addfcd51b19e228223ebd84da42042bad6f095c8a367`](https://explorer-studio-dev.genlayer.com/tx/0xeae491bc4c244695d5a0addfcd51b19e228223ebd84da42042bad6f095c8a367)
  - Result: `FINISHED_WITH_RETURN`, Consensus: `MAJORITY_AGREE`
- **Repeated Resolve Revert Transaction**: [`0x83d11b3dddd357e8b0803b5f20e9b0eea12954277431b0034a22d701b9e6d39d`](https://explorer-studio-dev.genlayer.com/tx/0x83d11b3dddd357e8b0803b5f20e9b0eea12954277431b0034a22d701b9e6d39d)
  - Result: `FINISHED_WITH_ERROR`, Consensus: `MAJORITY_AGREE`, expected revert message "resolve_challenge only allowed in CHALLENGED state" verified.
- **Final Contract State**: `INCONCLUSIVE`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

### Scenario 8: Cancel Epoch and Double Withdrawal Prevention
- **Contract Address**: [`0xa8dA22D18534453CdFA1b7693Fa460B1ef7De6AD`](https://explorer-studio-dev.genlayer.com/address/0xa8dA22D18534453CdFA1b7693Fa460B1ef7De6AD)
- **Deployment Transaction**: [`0xfc1556a0389d183005d1f56766bc8b56abb0a5dc17bff740637aff291cf09cf4`](https://explorer-studio-dev.genlayer.com/tx/0xfc1556a0389d183005d1f56766bc8b56abb0a5dc17bff740637aff291cf09cf4)
- **Publish Epoch Transaction**: [`0x3afc99e19b848e23085ef70b413446867eaebc405c745a9a4247d9999093c587`](https://explorer-studio-dev.genlayer.com/tx/0x3afc99e19b848e23085ef70b413446867eaebc405c745a9a4247d9999093c587)
- **Cancel Epoch Transaction**: [`0x9cadba17379973eec317c30c3c49221b047ba5887acedf7cd640b1f816657b28`](https://explorer-studio-dev.genlayer.com/tx/0x9cadba17379973eec317c30c3c49221b047ba5887acedf7cd640b1f816657b28)
- **First Pull-Credit Withdrawal Transaction**: [`0x05c97c52bbadce14b047d3f715307b1063fcf06fb9df4efdba99eff6d83a079d`](https://explorer-studio-dev.genlayer.com/tx/0x05c97c52bbadce14b047d3f715307b1063fcf06fb9df4efdba99eff6d83a079d)
- **Double Withdrawal Revert Transaction**: [`0xae0cce30c8554b652ae022b5a21bbbbfd37beb9f779e7d6667fae24bdc8e0518`](https://explorer-studio-dev.genlayer.com/tx/0xae0cce30c8554b652ae022b5a21bbbbfd37beb9f779e7d6667fae24bdc8e0518)
  - Result: `FINISHED_WITH_ERROR`, Consensus: `MAJORITY_AGREE`, expected revert message "No withdrawal credit available" verified.
- **Final Contract State**: `CANCELLED`
- **Consensus Receipt Status**: `FINALIZED / MAJORITY_AGREE`
- **Accounting Invariant Verified**: `true` (`get_accounting().invariant_satisfied == true`)

---

## 4. Comprehensive Economic Cleanup Verification (13/13 Targets)

All 13 cleanup targets across all 8 contracts were executed, finalized, and confirmed on-chain:

### Historical Withdrawals (Scenarios 1–4)
1. **Target 1**: Scenario 1 Challenger withdrew `14,000,000,000,000,000 wei` from `0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf` (tx: [`0x56a64e1e360f6990d0b741fc9a0c283ff1f938d227b6c50711589d81373516ff`](https://explorer-studio-dev.genlayer.com/tx/0x56a64e1e360f6990d0b741fc9a0c283ff1f938d227b6c50711589d81373516ff))
2. **Target 2**: Scenario 2 Challenger withdrew `14,000,000,000,000,000 wei` from `0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA` (tx: [`0x1994628f28fa1604a44fbc8722a44eaae90dc7aa5f0f37fefb1ee59990b7952a`](https://explorer-studio-dev.genlayer.com/tx/0x1994628f28fa1604a44fbc8722a44eaae90dc7aa5f0f37fefb1ee59990b7952a))
3. **Target 3**: Scenario 3 Challenger withdrew `14,000,000,000,000,000 wei` from `0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0` (tx: [`0x306b3281aa0fa6c5ecf0525d8869c4a8cf21da491c12140a33130c2c3104523c`](https://explorer-studio-dev.genlayer.com/tx/0x306b3281aa0fa6c5ecf0525d8869c4a8cf21da491c12140a33130c2c3104523c))
4. **Target 4**: Scenario 4 Challenger withdrew `14,000,000,000,000,000 wei` from `0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4` (tx: [`0x191e443845b73656cc3f69e6b48439df6a64e3fec023f0907090334863920950`](https://explorer-studio-dev.genlayer.com/tx/0x191e443845b73656cc3f69e6b48439df6a64e3fec023f0907090334863920950))
5. **Target 5**: Scenario 1 Issuer withdrew `1,000,000,000,000,000 wei` from `0x9fBE31b083Dcbe9207898ab1a496d4433c388Cdf` (tx: [`0xae2dbaf1bb2717088922be265d3876e987c06eb18f26017b2b638ae62ff7fa52`](https://explorer-studio-dev.genlayer.com/tx/0xae2dbaf1bb2717088922be265d3876e987c06eb18f26017b2b638ae62ff7fa52))
6. **Target 6**: Scenario 2 Issuer withdrew `1,000,000,000,000,000 wei` from `0x0ad95d5703636F9d9bc3ddcDD7e3FbA792A82DFA` (tx: [`0xb8e3b26fb5eeec5b8cf0f218bbd02d7eb7ec43e11506bf6711581e62c160538a`](https://explorer-studio-dev.genlayer.com/tx/0xb8e3b26fb5eeec5b8cf0f218bbd02d7eb7ec43e11506bf6711581e62c160538a))
7. **Target 7**: Scenario 3 Issuer withdrew `1,000,000,000,000,000 wei` from `0xBc17922E02141a1cb7A523f0E5b269A8901e3BB0` (tx: [`0x5826f74ba04a99986b4d45543fe619ff47376c7c427382343970bcfc70a92f03`](https://explorer-studio-dev.genlayer.com/tx/0x5826f74ba04a99986b4d45543fe619ff47376c7c427382343970bcfc70a92f03))
8. **Target 8**: Scenario 4 Issuer withdrew `1,000,000,000,000,000 wei` from `0xFE259c8E342fb4cF0D46A20E125A6fc7D64022e4` (tx: [`0x9fbca3d8dc93c72eef03681fbfa4335500e572e9e68c857ddca8eb3feae7738f`](https://explorer-studio-dev.genlayer.com/tx/0x9fbca3d8dc93c72eef03681fbfa4335500e572e9e68c857ddca8eb3feae7738f))

### Continuation Withdrawals (Scenarios 5–8)
9. **Target 9**: Scenario 5 Issuer withdrew `15,000,000,000,000,000 wei` from `0xbd80518107647cD17c1Af617c5a50fc5b9B037ee` (tx: [`0x0e836588b9c3b362ea73d288a8419a4300e10d8ce3f18fe31ed62a6b5abee118`](https://explorer-studio-dev.genlayer.com/tx/0x0e836588b9c3b362ea73d288a8419a4300e10d8ce3f18fe31ed62a6b5abee118))
10. **Target 10**: Scenario 6 Challenger withdrew `5,000,000,000,000,000 wei` from `0xd746297196b2c4a18bE1bA45f5541537F018cce0` (tx: [`0x6ed53c9050f9095f8b923b7cd900f5b14c5dc7ec0bd08a4cb68a9f378c511f77`](https://explorer-studio-dev.genlayer.com/tx/0x6ed53c9050f9095f8b923b7cd900f5b14c5dc7ec0bd08a4cb68a9f378c511f77))
11. **Target 11**: Scenario 6 Issuer withdrew `10,000,000,000,000,000 wei` from `0xd746297196b2c4a18bE1bA45f5541537F018cce0` (tx: [`0xb2a9051c9015fc5ca132cbde695c8cace8d4e9371fc364e05d1c6aa9cf724b1a`](https://explorer-studio-dev.genlayer.com/tx/0xb2a9051c9015fc5ca132cbde695c8cace8d4e9371fc364e05d1c6aa9cf724b1a))
12. **Target 12**: Scenario 7 Challenger withdrew `5,000,000,000,000,000 wei` from `0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26` (tx: [`0xc48581f9a71bead04fefb08e7872d1bc71f000c681f5a1527a82132df63b5042`](https://explorer-studio-dev.genlayer.com/tx/0xc48581f9a71bead04fefb08e7872d1bc71f000c681f5a1527a82132df63b5042))
13. **Target 13**: Scenario 7 Issuer withdrew `10,000,000,000,000,000 wei` from `0x98BD4E45F1dFED14f0A0A9eF7d39022864E07d26` (tx: [`0x8a886e0a1ad7b0fb2226f51d61f7c4d568eaf9f977aee746817f3e2c14441b0c`](https://explorer-studio-dev.genlayer.com/tx/0x8a886e0a1ad7b0fb2226f51d61f7c4d568eaf9f977aee746817f3e2c14441b0c))

### Aggregate Totals
- Historical Challenger Withdrawals: `56,000,000,000,000,000 wei` (`0.056 GEN`)
- Historical Issuer Withdrawals: `4,000,000,000,000,000 wei` (`0.004 GEN`)
- Continuation Challenger Withdrawals: `10,000,000,000,000,000 wei` (`0.010 GEN`)
- Continuation Issuer Withdrawals: `35,000,000,000,000,000 wei` (`0.035 GEN`)
- **Total Challenger Recovered**: `66,000,000,000,000,000 wei` (`0.066 GEN`)
- **Total Issuer Recovered**: `39,000,000,000,000,000 wei` (`0.039 GEN`)
- **Aggregate Total Recovered**: `105,000,000,000,000,000 wei` (`0.105 GEN`)

---

## 5. Live Validation State Summary

| Metric | Status | Detail |
|---|---|---|
| **Primary Scenarios** | `PRIMARY_SCENARIOS_PASS` | All eight scenario workflows reached their intended terminal contract states with satisfied accounting invariants. The cited intelligent-contract writes reached `FINALIZED / MAJORITY_AGREE`. The two expected negative-path transactions reached `FINALIZED / FINISHED_WITH_ERROR / MAJORITY_AGREE`. Native transfers reached `FINALIZED / NOT_VOTED` with `value_credited=true`. |
| **Contract Credits** | `13/13 TARGETS WITHDRAWN` | Exactly `105,000,000,000,000,000 wei` (`0.105 GEN`) pulled across all 13 withdrawal operations |
| **Contract Cleanup** | `COMPLETE FOR ALL DEPLOYED` | Zero unresolved credits across all 8 deployed contracts; verified on-chain via `get_accounting()` |
| **Persistent Challenger EOA Residual** | `0 wei` | Strictly `0 wei` verified on OS keychain account [`0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9`](https://explorer-studio-dev.genlayer.com/address/0x5fFb54b1915c2b04EfE86ae6f50bA7A3fAFf58F9) |
| **Economic Cleanup** | `ECONOMIC_CLEANUP_COMPLETE` | All 13 targets withdrawn; persistent challenger residual swept cleanly to issuer |
| **CURRENT_SESSION_LIVE_READINESS** | `READY_DISPOSABLE_CLEAN` | Live-validation and disposable-contract cleanup complete; canonical deployment and portal submission remain pending. |
| **Historical Stranded 1** | `1.720000000000173913 GEN` | Address [`0x197A05D11da0f26678cA93542d2FA8c89293d698`](https://explorer-studio-dev.genlayer.com/address/0x197A05D11da0f26678cA93542d2FA8c89293d698) |
| **Historical Stranded 2** | `1.720000000000173913 GEN` | Address [`0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e`](https://explorer-studio-dev.genlayer.com/address/0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e) |
| **Historical Session 3 Stranded** | `127,873,695,000,009,529 wei` | Address [`0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D`](https://explorer-studio-dev.genlayer.com/address/0xC795a3ebf7d2A2CeD5618d4F304e42aAbeDDfc9D) |
| **Historical Superseded Contract** | [`0x8C34faA54238b777cDe7e4373B267b0A6d0E4913`](https://explorer-studio-dev.genlayer.com/address/0x8C34faA54238b777cDe7e4373B267b0A6d0E4913) | **SUPERSEDED / NONCANONICAL — DO NOT USE** |
| **Canonical Deployment** | `NOT PERFORMED` | Canonical deployment remains gated |
| **Canonical Deployed-Source Parity** | `NOT YET PROVEN` | Requires canonical deployment before parity can be certified |
| **GenLayer Portal Submission** | `NOT PERFORMED` | No portal interaction |

---

## 6. Historical Transaction Retrieval Notice

All eight disposable contract addresses and transaction hashes cited in this evidence record were committed from live on-chain executions. While current on-chain state reads confirm that all eight disposable contracts have zero balance, zero credits, zero locked bonds, and satisfied invariants, retrieval of older individual transaction receipts from the public Studio-dev RPC endpoint may be subject to network retention and indexing policies. Committed transaction hashes are preserved without alteration or fabrication.
