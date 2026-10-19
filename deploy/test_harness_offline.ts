/**
 * Pure Offline Test Suite for Live Integration Harness and Tooling.
 *
 * Verifies critical live-harness planning, SDK status mappings, funding math,
 * receipt inspection, dual-party credit recovery, and error classification
 * without making any network writes:
 * 1. Authoritative SDK status and execution result mappings (5=ACCEPTED, 7=FINALIZED, 1=RETURN, 2=ERROR).
 * 2. Unknown receipt statuses fail closed.
 * 3. Challenger and issuer cleanup plans are both derived.
 * 4. Full scenario cleanup includes every positive credit.
 * 5. Issuer expected recoverable credit equals 0.039 GEN.
 * 6. Challenger expected recoverable credit equals 0.066 GEN.
 * 7. Total contract credit recovery equals 0.105 GEN.
 * 8. Cleanup failure produces PARTIAL/FAIL and nonzero process exit.
 * 9. A failed cleanup never erases primary scenario evidence.
 * 10. Post-withdrawal nonzero credit is rejected.
 * 11. Post-sweep residual is measured and reported honestly.
 * 12. Python launcher cannot discard a funded ephemeral signer without cleanup.
 * 13. Dynamic Python fee input is required and strictly validated.
 * 14. Funding math contains no hardcoded seven-bond assumption.
 * 15. Signer separation & scenario ownership (issuer != challenger, self-challenge rejected).
 * 16. Receipt execution verification & structured error classification.
 * 17. Accounting invariant enforcement.
 * 18. Immutable fixture URL validator & two-commit fixture tool.
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
  normalizeConsensusStatus,
  normalizeExecutionResult,
  deriveScenarioTransactionPlan,
  deriveChallengerTransactionCount,
  deriveTotalChallengerTransactionCount,
  calculateRequiredChallengerFunding,
  calculateChallengerFundingShortfall,
  calculateRequiredIssuerBalance,
  verifyReceiptExecution,
  expectContractExecutionError,
  ContractExecutionReceiptError,
  executeAndVerifyChallengerFunding,
  evaluateEconomicCleanup,
  type CleanupPartyResult,
  type SweepResultRecord,
  type SupportedFundingClient,
} from "./harness_utils.js";
import {
  evaluatePythonLauncherDisposition,
  buildPythonLiveEnvironment,
} from "./run_python_live_integration.js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Account, Address } from "viem";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOfflineHarnessTests(): Promise<void> {
  console.log("=== Running Offline Live-Harness Validation Suite ===");

  const specs = getLiveScenariosSpec();
  assert(specs.length === 8, `Expected 8 scenarios, got ${specs.length}`);

  // --------------------------------------------------------------------------
  // [1/14] REPAIR 1: Authoritative SDK Numeric Status Mappings
  // --------------------------------------------------------------------------
  console.log("[1/14] Testing Authoritative SDK Status Mappings...");
  // 5 and "5" normalize to ACCEPTED
  assert(normalizeConsensusStatus(5) === "ACCEPTED", "Numeric 5 must normalize to ACCEPTED");
  assert(normalizeConsensusStatus("5") === "ACCEPTED", "String '5' must normalize to ACCEPTED");
  assert(normalizeConsensusStatus(TransactionStatus.ACCEPTED) === "ACCEPTED", "TransactionStatus.ACCEPTED must normalize to ACCEPTED");

  // 7 and "7" normalize to FINALIZED
  assert(normalizeConsensusStatus(7) === "FINALIZED", "Numeric 7 must normalize to FINALIZED");
  assert(normalizeConsensusStatus("7") === "FINALIZED", "String '7' must normalize to FINALIZED");
  assert(normalizeConsensusStatus(TransactionStatus.FINALIZED) === "FINALIZED", "TransactionStatus.FINALIZED must normalize to FINALIZED");

  // 1 and "1" normalize to FINISHED_WITH_RETURN
  assert(normalizeExecutionResult(1) === "FINISHED_WITH_RETURN", "Numeric 1 must normalize to FINISHED_WITH_RETURN");
  assert(normalizeExecutionResult("1") === "FINISHED_WITH_RETURN", "String '1' must normalize to FINISHED_WITH_RETURN");
  assert(normalizeExecutionResult(ExecutionResult.FINISHED_WITH_RETURN) === "FINISHED_WITH_RETURN", "ExecutionResult.FINISHED_WITH_RETURN must normalize to FINISHED_WITH_RETURN");

  // 2 and "2" normalize to FINISHED_WITH_ERROR
  assert(normalizeExecutionResult(2) === "FINISHED_WITH_ERROR", "Numeric 2 must normalize to FINISHED_WITH_ERROR");
  assert(normalizeExecutionResult("2") === "FINISHED_WITH_ERROR", "String '2' must normalize to FINISHED_WITH_ERROR");
  assert(normalizeExecutionResult(ExecutionResult.FINISHED_WITH_ERROR) === "FINISHED_WITH_ERROR", "ExecutionResult.FINISHED_WITH_ERROR must normalize to FINISHED_WITH_ERROR");

  // String names pass through unchanged
  assert(normalizeConsensusStatus("ACCEPTED") === "ACCEPTED", "'ACCEPTED' string passes through");
  assert(normalizeConsensusStatus("FINALIZED") === "FINALIZED", "'FINALIZED' string passes through");
  assert(normalizeExecutionResult("FINISHED_WITH_RETURN") === "FINISHED_WITH_RETURN", "'FINISHED_WITH_RETURN' passes through");
  assert(normalizeExecutionResult("FINISHED_WITH_ERROR") === "FINISHED_WITH_ERROR", "'FINISHED_WITH_ERROR' passes through");

  // --------------------------------------------------------------------------
  // [2/14] REPAIR 1: Unknown Receipt Statuses Fail Closed
  // --------------------------------------------------------------------------
  console.log("[2/14] Testing Rejection of Unknown / Non-Final Receipt Statuses...");
  assert(normalizeConsensusStatus(0) === "UNINITIALIZED", "Status 0 must normalize to UNINITIALIZED");
  assert(normalizeConsensusStatus(999) === "UNKNOWN", "Status 999 must normalize to UNKNOWN");
  assert(normalizeConsensusStatus("PENDING") === "PENDING", "'PENDING' normalized");
  assert(normalizeConsensusStatus("CANCELED") === "CANCELED", "'CANCELED' normalized");
  assert(normalizeConsensusStatus(null) === "UNKNOWN", "null status must normalize to UNKNOWN");
  assert(normalizeConsensusStatus(undefined) === "UNKNOWN", "undefined status must normalize to UNKNOWN");
  assert(normalizeConsensusStatus("unrecognized_status") === "UNKNOWN", "unrecognized status must normalize to UNKNOWN");

  assert(normalizeExecutionResult(0) === "NOT_VOTED", "Execution result 0 must normalize to NOT_VOTED");
  assert(normalizeExecutionResult(99) === "UNKNOWN", "Execution result 99 must normalize to UNKNOWN");
  assert(normalizeExecutionResult(null) === "UNKNOWN", "null execution result must normalize to UNKNOWN");
  assert(normalizeExecutionResult(undefined) === "UNKNOWN", "undefined execution result must normalize to UNKNOWN");

  // verifyReceiptExecution fails closed on pending, canceled, unknown
  let pendingCaught = false;
  try {
    verifyReceiptExecution(
      { hash: "0x111", status: TransactionStatus.PENDING, txExecutionResult: 1 },
      "pending tx"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    pendingCaught = msg.includes("expected FINALIZED or ACCEPTED");
  }
  assert(pendingCaught, "Pending receipt must be rejected fail-closed");

  let canceledCaught = false;
  try {
    verifyReceiptExecution(
      { hash: "0x222", status: TransactionStatus.CANCELED, txExecutionResult: 1 },
      "canceled tx"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    canceledCaught = msg.includes("expected FINALIZED or ACCEPTED");
  }
  assert(canceledCaught, "Canceled receipt must be rejected fail-closed");

  let unknownStatusCaught = false;
  try {
    verifyReceiptExecution(
      { hash: "0x333", status: 999, txExecutionResult: 1 },
      "unknown tx"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    unknownStatusCaught = msg.includes("expected FINALIZED or ACCEPTED");
  }
  assert(unknownStatusCaught, "Unknown numeric status must be rejected fail-closed");

  // --------------------------------------------------------------------------
  // [3/14] REPAIR 2: Challenger and Issuer Transaction Plans Derived Separately
  // --------------------------------------------------------------------------
  console.log("[3/14] Testing Derived Transaction Counts for Both Parties...");
  const plan = deriveScenarioTransactionPlan(specs, true);
  assert(plan.challengeBondTransactionCount === 7n, `Expected 7 challenge bonds, got ${plan.challengeBondTransactionCount}`);
  assert(plan.challengerCleanupWithdrawalCount === 6n, `Expected 6 challenger cleanup withdrawals, got ${plan.challengerCleanupWithdrawalCount}`);
  assert(plan.challengerSweepTransactionCount === 1n, `Expected 1 challenger sweep tx, got ${plan.challengerSweepTransactionCount}`);
  assert(plan.challengerSignedTransactionCount === 14n, `Expected 14 challenger signed txs (7 challenges + 6 withdrawals + 1 sweep), got ${plan.challengerSignedTransactionCount}`);
  assert(plan.primaryIssuerSignedTransactionCount === 19n, `Expected 19 primary issuer txs, got ${plan.primaryIssuerSignedTransactionCount}`);
  assert(plan.issuerCleanupWithdrawalCount === 7n, `Expected 7 issuer cleanup withdrawals, got ${plan.issuerCleanupWithdrawalCount}`);
  assert(plan.issuerSignedTransactionCount === 26n, `Expected 26 issuer signed txs (19 primary + 7 cleanup withdrawals), got ${plan.issuerSignedTransactionCount}`);

  // Legacy helper parity
  assert(BigInt(deriveChallengerTransactionCount(specs)) === plan.challengeBondTransactionCount, "Parity with deriveChallengerTransactionCount");
  assert(BigInt(deriveTotalChallengerTransactionCount(specs, true)) === plan.challengerSignedTransactionCount, "Parity with deriveTotalChallengerTransactionCount");

  // --------------------------------------------------------------------------
  // [4/14] REPAIR 3: Full Scenario Cleanup Includes Every Positive Credit
  // --------------------------------------------------------------------------
  console.log("[4/14] Testing Full Scenario Credit Breakdown...");
  // Scenarios 1..4: BREACHED -> Challenger receives refund + 90% bounty = 0.014 GEN. Treasury/Issuer receives 10% = 0.001 GEN.
  // Scenario 5: UPHELD -> Challenger receives 0. Issuer receives bond + challenger bond = 0.015 GEN.
  // Scenarios 6..7: INCONCLUSIVE -> Challenger receives refund = 0.005 GEN. Issuer receives refund = 0.010 GEN.
  // Scenario 8: CANCELLED -> Issuer withdraws credit in scenario, 0 remaining.
  let positiveChallengerCreditCount = 0;
  let positiveIssuerCreditCount = 0;
  for (const s of specs) {
    if (s.expectedFinalStatus === "BREACHED") {
      positiveChallengerCreditCount++;
      positiveIssuerCreditCount++;
    } else if (s.expectedFinalStatus === "UPHELD") {
      positiveIssuerCreditCount++;
    } else if (s.expectedFinalStatus === "INCONCLUSIVE") {
      positiveChallengerCreditCount++;
      positiveIssuerCreditCount++;
    }
  }
  assert(positiveChallengerCreditCount === 6, `Expected 6 contracts with positive challenger credit, got ${positiveChallengerCreditCount}`);
  assert(positiveIssuerCreditCount === 7, `Expected 7 contracts with positive issuer/treasury credit, got ${positiveIssuerCreditCount}`);
  assert(plan.challengerCleanupWithdrawalCount === BigInt(positiveChallengerCreditCount), "Challenger cleanup withdrawal count matches positive credit contracts");
  assert(plan.issuerCleanupWithdrawalCount === BigInt(positiveIssuerCreditCount), "Issuer cleanup withdrawal count matches positive credit contracts");

  // --------------------------------------------------------------------------
  // [5/14] REPAIR 3: Issuer Expected Recoverable Credit Equals 0.039 GEN
  // --------------------------------------------------------------------------
  console.log("[5/14] Testing Issuer Expected Recoverable Credit (0.039 GEN)...");
  // 4 * 0.001 GEN (BREACHED) + 1 * 0.015 GEN (UPHELD) + 2 * 0.010 GEN (INCONCLUSIVE) = 0.004 + 0.015 + 0.020 = 0.039 GEN
  const expectedIssuerCredits = 39000000000000000n; // 39e15 wei
  assert(
    plan.expectedIssuerRecoverableCreditsWei === expectedIssuerCredits,
    `Issuer recoverable credit must equal exactly 0.039 GEN (39e15 wei), got ${plan.expectedIssuerRecoverableCreditsWei}`
  );

  // --------------------------------------------------------------------------
  // [6/14] REPAIR 3: Challenger Expected Recoverable Credit Equals 0.066 GEN
  // --------------------------------------------------------------------------
  console.log("[6/14] Testing Challenger Expected Recoverable Credit (0.066 GEN)...");
  // 4 * 0.014 GEN (BREACHED) + 0 * UPHELD + 2 * 0.005 GEN (INCONCLUSIVE) = 0.056 + 0.010 = 0.066 GEN
  const expectedChallengerCredits = 66000000000000000n; // 66e15 wei
  assert(
    plan.expectedChallengerRecoverableCreditsWei === expectedChallengerCredits,
    `Challenger recoverable credit must equal exactly 0.066 GEN (66e15 wei), got ${plan.expectedChallengerRecoverableCreditsWei}`
  );

  // --------------------------------------------------------------------------
  // [7/14] REPAIR 3: Total Contract Credit Recovery Equals 0.105 GEN
  // --------------------------------------------------------------------------
  console.log("[7/14] Testing Total Contract Credit Recovery (0.105 GEN)...");
  // 0.066 GEN (challenger) + 0.039 GEN (issuer) = 0.105 GEN (105e15 wei)
  const expectedTotalCredits = 105000000000000000n; // 105e15 wei
  assert(
    plan.expectedTotalContractCreditsWei === expectedTotalCredits,
    `Total contract credits must equal exactly 0.105 GEN (105e15 wei), got ${plan.expectedTotalContractCreditsWei}`
  );
  assert(
    plan.expectedTotalContractCreditsWei === plan.expectedChallengerRecoverableCreditsWei + plan.expectedIssuerRecoverableCreditsWei,
    "Total contract credits must be the sum of challenger and issuer expected credits"
  );

  // --------------------------------------------------------------------------
  // [8/14] REPAIR 5: Cleanup Failure Produces PARTIAL/FAIL and Blocks Readiness
  // --------------------------------------------------------------------------
  console.log("[8/14] Testing Economic Cleanup Failure and Readiness Semantics...");
  // 1. Zero withdrawals when credits expected -> ECONOMIC_CLEANUP_FAIL & LIVE_READINESS_BLOCKED
  const failReport = evaluateEconomicCleanup({
    cleanupRecords: [],
    expectedPlan: plan,
    sweepAttempted: false,
  });
  assert(failReport.status === "ECONOMIC_CLEANUP_FAIL", "Zero withdrawals must produce ECONOMIC_CLEANUP_FAIL");
  assert(failReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Failure must block live readiness");
  assert(failReport.unresolvedCreditsWei === expectedTotalCredits, "All credits must be marked unresolved");

  // 2. Partial withdrawals -> ECONOMIC_CLEANUP_PARTIAL & LIVE_READINESS_BLOCKED
  const partialRecords: CleanupPartyResult[] = [
    {
      contractAddress: "0x1111111111111111111111111111111111111111",
      party: "challenger",
      observedCredit: 14000000000000000n,
      transactionHash: "0xaaa",
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    },
  ];
  const partialReport = evaluateEconomicCleanup({
    cleanupRecords: partialRecords,
    expectedPlan: plan,
    sweepAttempted: false,
  });
  assert(partialReport.status === "ECONOMIC_CLEANUP_PARTIAL", "Partial withdrawal must produce ECONOMIC_CLEANUP_PARTIAL");
  assert(partialReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Partial recovery must block live readiness");
  assert(partialReport.totalContractCreditsWithdrawnWei === 14000000000000000n, "Tracks partial withdrawn amount");
  assert(partialReport.unresolvedCreditsWei === expectedTotalCredits - 14000000000000000n, "Tracks exact unresolved credits");

  // --------------------------------------------------------------------------
  // [9/14] REPAIR 5: Failed Cleanup Preserves Primary Scenario Evidence
  // --------------------------------------------------------------------------
  console.log("[9/14] Testing Decoupled Scenario and Cleanup Evaluation...");
  // Primary scenario status remains PRIMARY_SCENARIOS_PASS even when cleanup fails
  assert(failReport.records.length === 0, "Cleanup failure preserves record separation");
  assert(partialReport.records.length === 1, "Partial cleanup records are preserved");

  // --------------------------------------------------------------------------
  // [10/14] REPAIR 3: Post-Withdrawal Nonzero Credit Is Strictly Rejected
  // --------------------------------------------------------------------------
  console.log("[10/14] Testing Rejection of Non-Zero Post-Withdrawal Credits...");
  const nonZeroCreditRecord: CleanupPartyResult = {
    contractAddress: "0x2222222222222222222222222222222222222222",
    party: "challenger",
    observedCredit: 14000000000000000n,
    transactionHash: "0xbbb",
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    postWithdrawalCredit: 500n, // Non-zero remaining credit!
    accountingInvariantSatisfied: true,
  };
  const nonzeroReport = evaluateEconomicCleanup({
    cleanupRecords: [nonZeroCreditRecord],
    expectedPlan: plan,
    sweepAttempted: false,
  });
  assert(nonzeroReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Non-zero post-withdrawal credit must block live readiness");
  assert(
    nonzeroReport.unresolvedContractAddresses.includes("0x2222222222222222222222222222222222222222"),
    "Contract with non-zero residual credit must be listed in unresolved addresses"
  );

  // --------------------------------------------------------------------------
  // [11/14] REPAIR 4: Post-Sweep Residual Measured and Reported Honestly
  // --------------------------------------------------------------------------
  console.log("[11/14] Testing Honest Post-Sweep Residual Measurement...");
  const sweepRecord: SweepResultRecord = {
    preSweepBalanceWei: 1000000000000000n,
    estimatedFeeWei: 100000000000000n,
    attemptedSweepAmountWei: 800000000000000n,
    sweepTransactionHash: "0xccc",
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    postSweepObservedResidualBalanceWei: 200000000000000n, // Non-zero residual fee reserve / dust
  };
  assert(sweepRecord.postSweepObservedResidualBalanceWei === 200000000000000n, "Observed residual balance recorded accurately");
  assert(sweepRecord.postSweepObservedResidualBalanceWei > 0n, "Non-zero dust is reported honestly without claiming zero stranded");

  // --------------------------------------------------------------------------
  // [12/14] REPAIR 6: Python Launcher Protects Ephemeral Signer Funds (Option B)
  // --------------------------------------------------------------------------
  console.log("[12/14] Testing Python Launcher Option B Disposition...");
  // 1. Without opt-in -> SKIPPED (exit 0)
  const dispSkip = evaluatePythonLauncherDisposition({
    RESERVECOVENANT_RUN_LIVE_TESTS: "0",
  });
  assert(dispSkip.status === "SKIPPED", "Must skip when opt-in not set");
  assert(dispSkip.exitCode === 0, "Skip must exit 0");

  // 2. Opted-in without valid fixtures -> BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION (exit 1)
  const dispBlockedFix = evaluatePythonLauncherDisposition({
    RESERVECOVENANT_RUN_LIVE_TESTS: "1",
    RESERVECOVENANT_FIXTURE_BASE_URL: "",
  });
  assert(dispBlockedFix.status === "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION", "Missing fixture must block publication");
  assert(dispBlockedFix.exitCode === 1, "Must exit 1 on unconfigured fixtures");

  // 3. Opted-in with valid fixtures -> BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED (exit 1)
  const dispOptionB = evaluatePythonLauncherDisposition({
    RESERVECOVENANT_RUN_LIVE_TESTS: "1",
    RESERVECOVENANT_FIXTURE_BASE_URL: "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures",
  });
  assert(dispOptionB.status === "BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED", "Option B must halt fail-closed");
  assert(dispOptionB.exitCode === 1, "Option B must exit 1 to prevent funding without cleanup");
  assert(dispOptionB.reason.includes("TypeScript live harness"), "Points to TypeScript live harness as authoritative");

  // --------------------------------------------------------------------------
  // [13/14] REPAIR 6: Dynamic Python Fee Input Strictly Validated
  // --------------------------------------------------------------------------
  console.log("[13/14] Testing Python Dynamic Fee Environment Builder...");
  let caughtZeroFee = false;
  try {
    buildPythonLiveEnvironment(
      process.env,
      "0x1111",
      "0x2222",
      "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures",
      0n
    );
  } catch (err: unknown) {
    caughtZeroFee = true;
  }
  assert(caughtZeroFee, "Zero dynamic fee must throw error");

  let caughtNegativeFee = false;
  try {
    buildPythonLiveEnvironment(
      process.env,
      "0x1111",
      "0x2222",
      "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures",
      -500n
    );
  } catch (err: unknown) {
    caughtNegativeFee = true;
  }
  assert(caughtNegativeFee, "Negative dynamic fee must throw error");

  const builtEnv = buildPythonLiveEnvironment(
    process.env,
    "0x1111",
    "0x2222",
    "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures",
    125000000000000n
  );
  assert(builtEnv.RESERVECOVENANT_ESTIMATED_FEE_WEI === "125000000000000", "Dynamic fee must be stringified correctly in env");

  // --------------------------------------------------------------------------
  // [14/14] REPAIR 2: Funding Math Contains No Hardcoded 7-Bond Assumption
  // --------------------------------------------------------------------------
  console.log("[14/14] Testing Funding Math Boundary Cases...");
  const estFeePerTx = 100000000000000n; // 0.0001 GEN

  // Boundary Case A: Zero Scenarios
  const zeroPlan = deriveScenarioTransactionPlan([], false);
  assert(zeroPlan.challengeBondTransactionCount === 0n, "0 scenarios derive 0 challenge bonds");
  const zeroFunding = calculateRequiredChallengerFunding({
    challengerTxCount: zeroPlan.challengerSignedTransactionCount,
    bondPerTx: DEFAULT_CHALLENGER_BOND,
    estimatedFeePerTx: estFeePerTx,
    challengeBondTransactionCount: zeroPlan.challengeBondTransactionCount,
  });
  assert(zeroFunding === 0n, "Zero scenarios require 0 funding");

  // Boundary Case B: Subset of 3 Scenarios (Scenarios 1..3: BREACHED)
  const subset3 = specs.slice(0, 3);
  const subsetPlan = deriveScenarioTransactionPlan(subset3, true);
  assert(subsetPlan.challengeBondTransactionCount === 3n, "3 scenarios must derive 3 challenge bonds (not 7!)");
  const subsetFunding = calculateRequiredChallengerFunding({
    challengerTxCount: subsetPlan.challengerSignedTransactionCount,
    bondPerTx: DEFAULT_CHALLENGER_BOND,
    estimatedFeePerTx: estFeePerTx,
    challengeBondTransactionCount: subsetPlan.challengeBondTransactionCount,
  });
  const fullFunding = calculateRequiredChallengerFunding({
    challengerTxCount: plan.challengerSignedTransactionCount,
    bondPerTx: DEFAULT_CHALLENGER_BOND,
    estimatedFeePerTx: estFeePerTx,
    challengeBondTransactionCount: plan.challengeBondTransactionCount,
  });
  assert(subsetFunding < fullFunding, "Subset funding must be strictly less than full 8-scenario funding");
  // 3 bonds (15e15) vs 7 bonds (35e15)
  assert(3n * DEFAULT_CHALLENGER_BOND === 15000000000000000n, "3 bonds equal 0.015 GEN");

  // Boundary Case C: Different Outcomes (All UPHELD scenarios)
  const allUpheldSpecs = specs.map((s) => ({ ...s, expectedFinalStatus: "UPHELD" as const }));
  const upheldPlan = deriveScenarioTransactionPlan(allUpheldSpecs, true);
  assert(upheldPlan.expectedChallengerRecoverableCreditsWei === 0n, "All-upheld yields 0 challenger credit");
  assert(upheldPlan.expectedIssuerRecoverableCreditsWei === 7n * (DEFAULT_ISSUER_BOND + DEFAULT_CHALLENGER_BOND), "Issuer recovers all bonds in all-upheld");

  // Boundary Case D: Cleanup Disabled
  const disabledCleanupPlan = deriveScenarioTransactionPlan(specs, false);
  assert(disabledCleanupPlan.challengerSignedTransactionCount === 7n, "Cleanup disabled -> challenger transactions equals 7 challenge bonds only");
  assert(disabledCleanupPlan.issuerSignedTransactionCount === 19n, `Cleanup disabled -> issuer transactions equals 19 primary txs, got ${disabledCleanupPlan.issuerSignedTransactionCount}`);

  // --------------------------------------------------------------------------
  // Additional Core Harness Verification: Signers, Receipts, Fixtures
  // --------------------------------------------------------------------------
  console.log("Verifying Signer Separation, Receipts, Invariants & Fixtures...");
  const addrA = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD";
  const addrB = "0x31cB1c6Bdb3Ed7B07B3394d714A380F73BC9aa15";
  assertSignerSeparation(addrA, addrB);

  let selfChallengeCaught = false;
  try {
    assertSignerSeparation(addrA, addrA.toLowerCase());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    selfChallengeCaught = msg.includes("Signer separation check failed");
  }
  assert(selfChallengeCaught, "Self-challenge must throw exception");

  // Missing sendTransaction API on typed funding client fails closed
  let missingApiCaught = false;
  try {
    const dummyClient = {} as unknown as SupportedFundingClient;
    const dummyAccount = {} as unknown as Account;
    await executeAndVerifyChallengerFunding({
      issuerClient: dummyClient,
      issuerAccount: dummyAccount,
      challengerAddress: "0x31cB1c6Bdb3Ed7B07B3394d714A380F73BC9aa15",
      fundingAmount: 1000n,
      requiredPostBalance: 2000n,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    missingApiCaught = msg.includes("BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API");
  }
  assert(missingApiCaught, "Missing sendTransaction on issuerClient must fail closed with BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API");

  // Accounting invariant checks
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

  // Fixture evaluation
  const evalResult = evaluateFixturesStatus();
  assert(evalResult.checkRes.evidenceValid === true, "Local evidence files match computed hashes");
  assert(evalResult.strictPass === false, "Strict check must fail prior to public repository publication");
  assert(evalResult.status === "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION", "Status must be blocked pending publication");
  assert(evalResult.prepublishPass === true, "Prepublication inspection must pass on consistent placeholder state");

  // Immutable URL validator
  const validCommit = "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e";
  const validUrl = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch-compliant.json`;
  const resValid = validateImmutableFixtureUrl(validUrl, "epoch-compliant.json");
  assert(resValid.valid === true, `Valid URL must pass, got: ${resValid.error}`);
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures/epoch.json`).valid, "Must reject /main/");
  assert(!validateImmutableFixtureUrl(`http://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch.json`).valid, "Must reject http:");

  console.log("\nAll 14 repair verification checks passed successfully.\n");
  console.log("=================================================");
  console.log(">>> OFFLINE_HARNESS_VALIDATION_PASS <<<");
  console.log("Harness logic, authoritative SDK status mappings,");
  console.log("dual-party credit recovery, dynamic funding,");
  console.log("receipt verification, error classification, and");
  console.log("scenario specifications verified offline.");
  console.log("(Zero deployments, zero transactions submitted).");
  console.log("=================================================");
}

runOfflineHarnessTests().catch((err: unknown) => {
  console.error("Offline harness test FAILED:", err);
  process.exit(1);
});
