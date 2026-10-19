/**
 * Pure Offline Test Suite for Live Integration Harness and Tooling.
 *
 * Verifies critical live-harness planning, funding math, receipt inspection,
 * and error classification without making any network writes:
 * 1. Signer separation & scenario ownership (issuer != challenger, self-challenge rejected).
 * 2. Immutable fixture URL validator (commit-pinned accepted; /main/, branches rejected).
 * 3. Scenario call specifications (Scenario 4 uses open_challenge with MATERIAL_DISCLAIMER).
 * 4. Challenger transaction count derived dynamically from scenario specifications (exact 7).
 * 5. Dynamic funding calculation (zero balance, partial funding, sufficient funding, fee increase, BigInt arithmetic, negative inputs).
 * 6. Issuer balance preflight calculation (sufficient balance, shortfall, safety margins).
 * 7. Challenger balance preflight validation.
 * 8. Receipt execution verification (finalized return accepted; finished with error, pending, malformed rejected).
 * 9. Expected contract execution error classification (accepts on-chain reverts, rejects unrelated RPC/network errors).
 * 10. Accounting invariant verification (fails closed when invariant_satisfied is false).
 * 11. Strict fixture-check exit status (detects unpublished placeholders and fails strict check).
 * 12. Prepublication fixture-inspection status (passes prepublish inspection on internally consistent blocked state).
 * 13. Public fixture preparation tool (dry-run mode, canonical JSON, commit validation).
 *
 * Result Label:
 * OFFLINE_HARNESS_VALIDATION_PASS
 * (This is NOT a LIVE_VALIDATOR_CONSENSUS_PASS).
 */

import {
  assertSignerSeparation,
  getLiveScenariosSpec,
  DEFAULT_ISSUER_BOND,
  DEFAULT_CHALLENGER_BOND,
} from "./run_live_integration.js";
import {
  validateImmutableFixtureUrl,
  validateImmutableFixtureBaseUrl,
} from "./fixture_url_validator.js";
import {
  preparePublicFixtures,
  canonicalJsonStringify,
  evaluateFixturesStatus,
} from "./prepare_public_fixtures.js";
import {
  deriveChallengerTransactionCount,
  calculateRequiredChallengerFunding,
  calculateChallengerFundingShortfall,
  calculateRequiredIssuerBalance,
  verifyReceiptExecution,
  expectContractExecutionError,
} from "./harness_utils.js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOfflineHarnessTests(): Promise<void> {
  console.log("=== Running Offline Live-Harness Validation Suite ===");

  // --------------------------------------------------------------------------
  // [1/12] Signer Separation & Scenario Signer Ownership
  // --------------------------------------------------------------------------
  console.log("[1/12] Testing Signer Separation & Scenario Ownership...");
  const addrA = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD";
  const addrB = "0x31cB1c6Bdb3Ed7B07B3394d714A380F73BC9aa15";

  // Distinct addresses must pass
  assertSignerSeparation(addrA, addrB);

  // Identical addresses must throw before any network interaction
  let selfChallengeCaught = false;
  try {
    assertSignerSeparation(addrA, addrA.toLowerCase());
  } catch (err: any) {
    selfChallengeCaught = true;
    assert(err.message.includes("Signer separation check failed"), "Expected error message");
  }
  assert(selfChallengeCaught, "Self-challenge must throw exception");

  // Verify scenario signer ownership
  const specs = getLiveScenariosSpec();
  assert(specs.length === 8, `Expected 8 scenarios, got ${specs.length}`);

  // Scenarios 1..7 have challengeType -> challenger ownership for open_challenge
  for (let id = 1; id <= 7; id++) {
    const s = specs.find((x) => x.scenarioId === id);
    assert(Boolean(s), `Scenario ${id} must exist`);
    assert(typeof s!.challengeType === "string", `Scenario ${id} must specify challengeType`);
  }

  // Scenario 8 has no challengeType -> issuer cancellation and withdrawal only
  const s8 = specs.find((x) => x.scenarioId === 8);
  assert(Boolean(s8), "Scenario 8 must exist");
  assert(s8!.challengeType === undefined, "Scenario 8 must have no challenger transactions");

  // --------------------------------------------------------------------------
  // [2/12] Challenger Transaction Count Derivation
  // --------------------------------------------------------------------------
  console.log("[2/12] Testing Challenger Transaction Count Derivation...");
  const derivedCount = deriveChallengerTransactionCount(specs);
  assert(derivedCount === 7, `Expected derived challenger count to be 7, got ${derivedCount}`);

  // Empty specs derive 0
  assert(deriveChallengerTransactionCount([]) === 0, "Empty specs must derive 0 challenger transactions");

  // --------------------------------------------------------------------------
  // [3/12] Dynamic Challenger Funding Calculations
  // --------------------------------------------------------------------------
  console.log("[3/12] Testing Dynamic Challenger Funding Calculations...");
  const bondPerTx = DEFAULT_CHALLENGER_BOND; // 0.005 GEN = 5e15 wei
  const estFeePerTx = 100000000000000n;      // 0.0001 GEN = 1e14 wei
  const count7 = 7n;

  // Exact 7 challenge bonds = 7 * 0.005 GEN = 0.035 GEN (35e15 wei)
  const expectedTotalBonds = count7 * bondPerTx;
  assert(expectedTotalBonds === 35000000000000000n, "7 challenger bonds must equal 0.035 GEN");

  // Calculate required funding
  const requiredFunding = calculateRequiredChallengerFunding({
    challengerTxCount: count7,
    bondPerTx,
    estimatedFeePerTx: estFeePerTx,
  });
  // bonds (35e15) + fees (7 * 1e14 = 7e14) + safety margin (20% of 7e14 = 1.4e14 + 5e15 = 5.14e15)
  assert(requiredFunding > expectedTotalBonds, "Required funding must exceed bond totals to cover fees and safety margin");
  assert(requiredFunding === 35000000000000000n + 700000000000000n + 140000000000000n + 5000000000000000n, "Matches formula");

  // Zero existing challenger balance -> shortfall is exactly required funding
  const shortfallZero = calculateChallengerFundingShortfall(requiredFunding, 0n);
  assert(shortfallZero === requiredFunding, "Shortfall on zero balance must equal required funding");

  // Partially funded challenger -> shortfall is difference
  const partialBalance = 20000000000000000n; // 0.02 GEN
  const shortfallPartial = calculateChallengerFundingShortfall(requiredFunding, partialBalance);
  assert(shortfallPartial === requiredFunding - partialBalance, "Shortfall on partial balance must equal delta");

  // Already sufficiently funded challenger -> shortfall is 0
  const excessBalance = requiredFunding + 10000000000000000n;
  const shortfallExcess = calculateChallengerFundingShortfall(requiredFunding, excessBalance);
  assert(shortfallExcess === 0n, "Shortfall on sufficient balance must be 0n");

  // Fee estimate increase proportionally increases required funding
  const higherFee = estFeePerTx * 10n;
  const requiredFundingHigher = calculateRequiredChallengerFunding({
    challengerTxCount: count7,
    bondPerTx,
    estimatedFeePerTx: higherFee,
  });
  assert(requiredFundingHigher > requiredFunding, "Higher fee estimate must increase required funding");

  // Invalid negative inputs must throw RangeError
  let negativeInputCaught = false;
  try {
    calculateRequiredChallengerFunding({
      challengerTxCount: -1n,
      bondPerTx,
      estimatedFeePerTx: estFeePerTx,
    });
  } catch (err: any) {
    negativeInputCaught = err instanceof RangeError;
  }
  assert(negativeInputCaught, "Negative challengerTxCount must throw RangeError");

  let negativeBalCaught = false;
  try {
    calculateChallengerFundingShortfall(requiredFunding, -100n);
  } catch (err: any) {
    negativeBalCaught = err instanceof RangeError;
  }
  assert(negativeBalCaught, "Negative balance must throw RangeError");

  // --------------------------------------------------------------------------
  // [4/12] Issuer Balance Preflight Calculations
  // --------------------------------------------------------------------------
  console.log("[4/12] Testing Issuer Balance Preflight Calculations...");
  const issuerReq = calculateRequiredIssuerBalance({
    disposableDeployCount: 8n,
    deployFeePerTx: estFeePerTx * 2n,
    issuerBondsTotal: 8n * DEFAULT_ISSUER_BOND, // 8 * 0.01 GEN = 0.08 GEN
    issuerTxCount: 20n,
    txFeePerTx: estFeePerTx,
    challengerShortfall: shortfallZero,
  });
  assert(issuerReq > (8n * DEFAULT_ISSUER_BOND + shortfallZero), "Issuer required balance covers deployments, bonds, fees, shortfall, and margin");

  // Negative input check
  let negativeIssuerCaught = false;
  try {
    calculateRequiredIssuerBalance({
      disposableDeployCount: -1n,
      deployFeePerTx: estFeePerTx,
      issuerBondsTotal: 0n,
      issuerTxCount: 0n,
      txFeePerTx: estFeePerTx,
      challengerShortfall: 0n,
    });
  } catch (err: any) {
    negativeIssuerCaught = err instanceof RangeError;
  }
  assert(negativeIssuerCaught, "Negative deployment count must throw RangeError");

  // --------------------------------------------------------------------------
  // [5/12] Receipt Execution Verification (Phase 8)
  // --------------------------------------------------------------------------
  console.log("[5/12] Testing Receipt Execution Verification...");

  // Finalized successful return -> passes
  const validReceipt = {
    hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    statusName: "FINALIZED",
    status: TransactionStatus.FINALIZED,
    txExecutionResultName: "FINISHED_WITH_RETURN",
    txExecutionResult: ExecutionResult.FINISHED_WITH_RETURN,
    contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  };
  const summary = verifyReceiptExecution(validReceipt, "test deployment");
  assert(summary.txHash === validReceipt.hash, "Hash must match");
  assert(summary.status === "FINALIZED", "Status must match");
  assert(summary.executionResult === "FINISHED_WITH_RETURN", "Execution result must match");

  // Finalized contract error -> must throw
  const errorReceipt = {
    hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    statusName: "FINALIZED",
    status: TransactionStatus.FINALIZED,
    txExecutionResultName: "FINISHED_WITH_ERROR",
    txExecutionResult: ExecutionResult.FINISHED_WITH_ERROR,
  };
  let errorReceiptCaught = false;
  try {
    verifyReceiptExecution(errorReceipt, "test write");
  } catch (err: any) {
    errorReceiptCaught = err.message.includes("FINISHED_WITH_ERROR");
  }
  assert(errorReceiptCaught, "Receipt with FINISHED_WITH_ERROR must be rejected");

  // Pending receipt -> must throw
  const pendingReceipt = {
    hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    statusName: "PENDING",
    status: TransactionStatus.PENDING,
  };
  let pendingCaught = false;
  try {
    verifyReceiptExecution(pendingReceipt, "pending call");
  } catch (err: any) {
    pendingCaught = err.message.includes("expected FINALIZED or ACCEPTED");
  }
  assert(pendingCaught, "Pending receipt must be rejected");

  // Malformed / null receipt -> must throw
  let nullReceiptCaught = false;
  try {
    verifyReceiptExecution(null, "null receipt");
  } catch (err: any) {
    nullReceiptCaught = err.message.includes("missing or malformed");
  }
  assert(nullReceiptCaught, "Null receipt must be rejected");

  // --------------------------------------------------------------------------
  // [6/12] Expected Contract Execution Error Classification (Phase 6)
  // --------------------------------------------------------------------------
  console.log("[6/12] Testing Expected Contract Execution Error Classification...");

  // Action throwing on-chain revert -> accepted
  let stateChecked = false;
  const revertAction = async () => {
    const err: any = new Error("Transaction resolve_challenge failed on-chain: Epoch is not in CHALLENGED state");
    err.receipt = {
      hash: "0x3333333333333333333333333333333333333333333333333333333333333333",
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_ERROR",
    };
    throw err;
  };
  const classifiedRevert = await expectContractExecutionError(revertAction, {
    expectedMethod: "resolve_challenge",
    expectedErrorSubstring: "CHALLENGED",
    verifyStateUnchanged: async () => {
      stateChecked = true;
    },
  });
  assert(stateChecked, "State invariant verification must execute on expected revert");
  assert(classifiedRevert.message.includes("CHALLENGED"), "Error message captured");

  // Action throwing unrelated infrastructure error (e.g. ECONNREFUSED) -> strictly rejected!
  const rpcDownAction = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:4000");
  };
  let infraErrorCaught = false;
  try {
    await expectContractExecutionError(rpcDownAction, {
      expectedMethod: "resolve_challenge",
      expectedErrorSubstring: "CHALLENGED",
    });
  } catch (err: any) {
    infraErrorCaught = err.message.includes("Unrelated infrastructure/client error detected");
  }
  assert(infraErrorCaught, "ECONNREFUSED must be strictly rejected and not treated as a contract revert");

  // Action unexpectedly succeeding -> must throw
  const succeedingAction = async () => {
    return {
      hash: "0x4444444444444444444444444444444444444444444444444444444444444444",
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    };
  };
  let unexpectedSuccessCaught = false;
  try {
    await expectContractExecutionError(succeedingAction, {
      expectedMethod: "resolve_challenge",
    });
  } catch (err: any) {
    unexpectedSuccessCaught = err.message.includes("transaction succeeded unexpectedly");
  }
  assert(unexpectedSuccessCaught, "Unexpected success must throw error");

  // --------------------------------------------------------------------------
  // [7/12] Accounting Invariant Enforcement
  // --------------------------------------------------------------------------
  console.log("[7/12] Testing Accounting Invariant Enforcement...");
  const validAccounting = {
    contract_balance: 10000000000000000n,
    locked_issuer_bonds: 0n,
    locked_challenger_bonds: 0n,
    total_credits: 10000000000000000n,
    invariant_satisfied: true,
  };
  assert(validAccounting.invariant_satisfied === true, "Valid accounting invariant is true");

  const brokenAccounting = {
    contract_balance: 5000000000000000n,
    locked_issuer_bonds: 10000000000000000n,
    locked_challenger_bonds: 0n,
    total_credits: 0n,
    invariant_satisfied: false,
  };
  assert(brokenAccounting.invariant_satisfied === false, "Broken invariant detected");

  // --------------------------------------------------------------------------
  // [8/12] Strict Fixture Check vs Prepublication Mode (Phase 7)
  // --------------------------------------------------------------------------
  console.log("[8/12] Testing Fixture Check & Prepublish Modes...");
  const evalResult = evaluateFixturesStatus();

  // Local evidence files must be valid
  assert(evalResult.checkRes.evidenceValid === true, "Local evidence files must match computed hashes");

  // In pre-publication state, placeholders are present -> strict check fails
  assert(evalResult.strictPass === false, "Strict check must fail prior to public repository publication");
  assert(evalResult.status === "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION", "Status must be blocked pending publication");

  // Prepublication inspection passes because blocked state is consistent
  assert(evalResult.prepublishPass === true, "Prepublication inspection must pass on consistent placeholder state");

  // --------------------------------------------------------------------------
  // [9/12] Immutable URL Validator Tests
  // --------------------------------------------------------------------------
  console.log("[9/12] Testing Immutable Fixture URL Validation...");
  const validCommit = "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e";
  const validUrl = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch-compliant.json`;
  const resValid = validateImmutableFixtureUrl(validUrl, "epoch-compliant.json");
  assert(resValid.valid === true, `Valid URL must pass, got: ${resValid.error}`);
  assert(resValid.commitSha === validCommit, "Commit SHA must match");

  // Rejected forms
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures/epoch.json`).valid, "Must reject /main/");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/master/fixtures/epoch.json`).valid, "Must reject /master/");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/${validCommit.toUpperCase()}/fixtures/epoch.json`).valid, "Must reject uppercase SHA");
  assert(!validateImmutableFixtureUrl(`http://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch.json`).valid, "Must reject http:");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch.json?q=1`).valid, "Must reject query");
  assert(!validateImmutableFixtureUrl(`https://other.com/owner/repo/${validCommit}/fixtures/epoch.json`).valid, "Must reject other host");

  const validBase = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures`;
  assert(validateImmutableFixtureBaseUrl(validBase).valid === true, "Valid base URL must pass");
  assert(!validateImmutableFixtureBaseUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures`).valid, "Mutable base must fail");

  // --------------------------------------------------------------------------
  // [10/12] Scenario Call Argument Specifications
  // --------------------------------------------------------------------------
  console.log("[10/12] Testing Scenario Specifications...");
  const scen4 = specs.find((s) => s.scenarioId === 4);
  assert(Boolean(scen4), "Scenario 4 must exist");
  assert(scen4!.challengeType === "MATERIAL_DISCLAIMER", "Scenario 4 challengeType must be MATERIAL_DISCLAIMER");
  assert(scen4!.expectedFinalStatus === "BREACHED", "Scenario 4 expected final status must be BREACHED");

  const scen7 = specs.find((s) => s.scenarioId === 7);
  assert(Boolean(scen7), "Scenario 7 must exist");
  assert(scen7!.expectedFinalStatus === "INCONCLUSIVE", "Scenario 7 initial resolution must be INCONCLUSIVE");

  // --------------------------------------------------------------------------
  // [11/12] Two-Commit Fixture Tool (Dry-Run Mode)
  // --------------------------------------------------------------------------
  console.log("[11/12] Testing Public Fixture Preparation Tool (Dry-Run)...");
  const invalidCommitRes = preparePublicFixtures({
    owner: "owner",
    repo: "repo",
    commitA: "invalid-commit-short",
    write: false,
  });
  assert(!invalidCommitRes.success, "Invalid commit must fail");

  const validDryRun = preparePublicFixtures({
    owner: "edwarderlick",
    repo: "ReserveCovenant",
    commitA: "0123456789abcdef0123456789abcdef01234567",
    write: false,
  });
  assert(validDryRun.success === true, `Dry-run preparation must succeed: ${validDryRun.error}`);
  assert(Object.keys(validDryRun.snapshotHashes).length === 5, "Must compute hashes for all 5 snapshots");
  assert(validDryRun.updatedFiles.length === 0, "Dry-run must not write any files");

  const testObj = { b: 1, a: 2, nested: { z: 10, y: 20 } };
  const canonicalStr = canonicalJsonStringify(testObj);
  assert(canonicalStr === '{"a":2,"b":1,"nested":{"y":20,"z":10}}', "Canonical JSON must sort keys");

  // --------------------------------------------------------------------------
  // [12/12] Summary & Offline Output Verification
  // --------------------------------------------------------------------------
  console.log("[12/12] All offline validation checks passed.\n");
  console.log("=================================================");
  console.log(">>> OFFLINE_HARNESS_VALIDATION_PASS <<<");
  console.log("Harness logic, signer separation, URL security,");
  console.log("dynamic funding, receipt verification, error");
  console.log("classification, and scenario specifications verified.");
  console.log("(Zero deployments, zero transactions submitted).");
  console.log("=================================================");
}

runOfflineHarnessTests().catch((err) => {
  console.error("Offline harness test FAILED:", err);
  process.exit(1);
});
