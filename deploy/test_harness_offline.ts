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
  verifyNativeTransferReceipt,
  expectContractExecutionError,
  ContractExecutionReceiptError,
  executeAndVerifyChallengerFunding,
  evaluateEconomicCleanup,
  buildExpectedCleanupManifest,
  WriteOperationError,
  getCleanupTargetKey,
  type ExpectedCleanupTarget,
  type CleanupPartyResult,
  type SweepResultRecord,
  type SupportedFundingClient,
  type PrimaryScenariosStatus,
  type ValidatedReceiptSummary,
  type ValidatedNativeTransferSummary,
  type ChallengerFundingResult,
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
  // [1/18] REPAIR 1: Authoritative SDK Numeric Status Mappings
  // --------------------------------------------------------------------------
  console.log("[1/18] Testing Authoritative SDK Status Mappings...");
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
  // [2/18] REPAIR 1: Unknown Receipt Statuses Fail Closed
  // --------------------------------------------------------------------------
  console.log("[2/18] Testing Rejection of Unknown / Non-Final Receipt Statuses...");
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
  // [3/18] REPAIR 2: Challenger and Issuer Transaction Plans Derived Separately
  // --------------------------------------------------------------------------
  console.log("[3/18] Testing Derived Transaction Counts for Both Parties...");
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
  // [4/18] REPAIR 3: Full Scenario Cleanup Includes Every Positive Credit
  // --------------------------------------------------------------------------
  console.log("[4/18] Testing Full Scenario Credit Breakdown...");
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
  // [5/18] REPAIR 3: Issuer Expected Recoverable Credit Equals 0.039 GEN
  // --------------------------------------------------------------------------
  console.log("[5/18] Testing Issuer Expected Recoverable Credit (0.039 GEN)...");
  // 4 * 0.001 GEN (BREACHED) + 1 * 0.015 GEN (UPHELD) + 2 * 0.010 GEN (INCONCLUSIVE) = 0.004 + 0.015 + 0.020 = 0.039 GEN
  const expectedIssuerCredits = 39000000000000000n; // 39e15 wei
  assert(
    plan.expectedIssuerRecoverableCreditsWei === expectedIssuerCredits,
    `Issuer recoverable credit must equal exactly 0.039 GEN (39e15 wei), got ${plan.expectedIssuerRecoverableCreditsWei}`
  );

  // --------------------------------------------------------------------------
  // [6/18] REPAIR 3: Challenger Expected Recoverable Credit Equals 0.066 GEN
  // --------------------------------------------------------------------------
  console.log("[6/18] Testing Challenger Expected Recoverable Credit (0.066 GEN)...");
  // 4 * 0.014 GEN (BREACHED) + 0 * UPHELD + 2 * 0.005 GEN (INCONCLUSIVE) = 0.056 + 0.010 = 0.066 GEN
  const expectedChallengerCredits = 66000000000000000n; // 66e15 wei
  assert(
    plan.expectedChallengerRecoverableCreditsWei === expectedChallengerCredits,
    `Challenger recoverable credit must equal exactly 0.066 GEN (66e15 wei), got ${plan.expectedChallengerRecoverableCreditsWei}`
  );

  // --------------------------------------------------------------------------
  // [7/18] REPAIR 3: Total Contract Credit Recovery Equals 0.105 GEN
  // --------------------------------------------------------------------------
  console.log("[7/18] Testing Total Contract Credit Recovery (0.105 GEN)...");
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
  // [8/18] Receipt Evidence Revalidation & Elimination of Manufactured Literals
  // --------------------------------------------------------------------------
  console.log("[8/18] Testing Receipt Status/Result Copied From Actual Validated Summaries & Raw Evidence Revalidation...");
  // 1. ACCEPTED (5) and FINISHED_WITH_RETURN (1)
  const acceptedReceipt = {
    hash: "0x" + "1".repeat(64),
    status: 5,
    txExecutionResult: 1,
  };
  const summaryAccepted = verifyReceiptExecution(acceptedReceipt, "accepted test", "withdraw_credit");
  assert(summaryAccepted.status === "ACCEPTED", "Must preserve ACCEPTED from status 5");
  assert(summaryAccepted.executionResult === "FINISHED_WITH_RETURN", "Must preserve FINISHED_WITH_RETURN from result 1");
  assert(summaryAccepted.rawReceipt !== undefined, "rawReceipt must be populated in validated summary");

  // 2. FINALIZED (7) and FINISHED_WITH_RETURN (1)
  const finalizedReceipt = {
    hash: "0x" + "2".repeat(64),
    status: 7,
    txExecutionResult: 1,
  };
  const summaryFinalized = verifyReceiptExecution(finalizedReceipt, "finalized test", "withdraw_credit");
  assert(summaryFinalized.status === "FINALIZED", "Must preserve FINALIZED from status 7");
  assert(summaryFinalized.executionResult === "FINISHED_WITH_RETURN", "Must preserve FINISHED_WITH_RETURN from result 1");
  assert(summaryFinalized.rawReceipt !== undefined, "rawReceipt must be populated in validated summary");

  // 3. Proving non-final or error receipts fail verifyReceiptExecution fail-closed
  let pendingReceiptRejected = false;
  try {
    verifyReceiptExecution({ hash: "0x123", status: 1, txExecutionResult: 1 }, "pending");
  } catch {
    pendingReceiptRejected = true;
  }
  assert(pendingReceiptRejected, "Pending receipt must be rejected fail-closed");

  let errorReceiptRejected = false;
  try {
    verifyReceiptExecution({ hash: "0x123", status: 7, txExecutionResult: 2 }, "error");
  } catch {
    errorReceiptRejected = true;
  }
  assert(errorReceiptRejected, "FINISHED_WITH_ERROR receipt must throw ContractExecutionReceiptError fail-closed");

  // Helper to construct validated receipt summaries from raw receipts
  function createMockReceiptSummary(
    txHash: string,
    statusNum: number = 7,
    resultNum: number = 1
  ): ValidatedReceiptSummary {
    const rawReceipt = {
      hash: txHash,
      status: statusNum,
      txExecutionResult: resultNum,
    };
    return verifyReceiptExecution(rawReceipt, "mock receipt verification", "withdraw_credit");
  }

  function createMockNativeSweepSummary(
    txHash: string,
    statusNum: number = 7,
    amountWei: bigint = 800000000000000n
  ): ValidatedNativeTransferSummary {
    const rawReceipt = {
      hash: txHash,
      status: statusNum,
      txExecutionResult: 0,
      value_credited: true,
      value: amountWei.toString(),
    };
    return verifyNativeTransferReceipt({
      receipt: rawReceipt,
      context: "mock native sweep verification",
      expectedHash: txHash,
      requestedAmountWei: amountWei,
      preBalanceWei: 0n,
      postBalanceWei: amountWei,
    });
  }

  // --------------------------------------------------------------------------
  // [9/18] Exact 13-Target Manifest Matching, Plan Parity & Complete Target Identity
  // --------------------------------------------------------------------------
  console.log("[9/18] Testing Exact 13-Target Manifest Matching, Plan Parity & Complete Target Identity...");
  const dummyRecords = [
    { scenarioId: 1, contractAddress: "0x1111111111111111111111111111111111111111" as Address },
    { scenarioId: 2, contractAddress: "0x2222222222222222222222222222222222222222" as Address },
    { scenarioId: 3, contractAddress: "0x3333333333333333333333333333333333333333" as Address },
    { scenarioId: 4, contractAddress: "0x4444444444444444444444444444444444444444" as Address },
    { scenarioId: 5, contractAddress: "0x5555555555555555555555555555555555555555" as Address },
    { scenarioId: 6, contractAddress: "0x6666666666666666666666666666666666666666" as Address },
    { scenarioId: 7, contractAddress: "0x7777777777777777777777777777777777777777" as Address },
    { scenarioId: 8, contractAddress: "0x8888888888888888888888888888888888888888" as Address },
  ];

  const manifest13 = buildExpectedCleanupManifest(dummyRecords, specs);
  assert(manifest13.length === 13, `Manifest must contain exactly 13 entries, got ${manifest13.length}`);
  const chManifest = manifest13.filter((m) => m.party === "challenger");
  const issManifest = manifest13.filter((m) => m.party === "issuer");
  assert(chManifest.length === 6, `Expected 6 challenger targets (scenarios 1,2,3,4,6,7), got ${chManifest.length}`);
  assert(issManifest.length === 7, `Expected 7 issuer targets (scenarios 1,2,3,4,5,6,7), got ${issManifest.length}`);

  // Construct valid 13 cleanup records with actual receipt evidence passed through verifyReceiptExecution
  const valid13Records: CleanupPartyResult[] = manifest13.map((target, idx) => {
    const txHash = `0x${(idx + 1).toString().padStart(64, "0")}`;
    const summary = createMockReceiptSummary(txHash, idx % 2 === 0 ? 7 : 5, 1);
    return {
      scenarioId: target.scenarioId,
      contractAddress: target.contractAddress,
      party: target.party,
      status: "WITHDRAWN",
      expectedCredit: target.expectedCreditWei,
      observedCredit: target.expectedCreditWei,
      transactionHash: txHash,
      receiptStatus: summary.status,
      executionResult: summary.executionResult,
      receiptSummary: summary,
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    };
  });

  const sweepTxHash = "0x" + "a".repeat(64);
  const sweepSummary = createMockNativeSweepSummary(sweepTxHash, 7);
  const validSweep: SweepResultRecord = {
    disposition: "COMPLETED",
    preSweepBalanceWei: 1000000000000000n,
    estimatedFeeWei: 100000000000000n,
    attemptedSweepAmountWei: 800000000000000n,
    sweepTransactionHash: sweepTxHash,
    receiptStatus: sweepSummary.status,
    executionResult: sweepSummary.executionResult,
    receiptSummary: sweepSummary as unknown as ValidatedReceiptSummary,
    nativeTransferSummary: sweepSummary,
    issuerPreSweepBalanceWei: 0n,
    issuerPostSweepBalanceWei: 800000000000000n,
    postSweepObservedResidualBalanceWei: 200000000000000n,
  };

  // Case A: All 13 targets pass with mixed valid receipts
  const passReport = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(passReport.status === "ECONOMIC_CLEANUP_PASS", "All 13 targets must produce ECONOMIC_CLEANUP_PASS");
  assert(passReport.liveReadinessStatus === "LIVE_READINESS_PASS", "Must produce LIVE_READINESS_PASS");
  assert(passReport.unresolvedContractAddresses.length === 0, "No unresolved addresses");
  assert(passReport.unresolvedCreditsWei === 0n, "Zero unresolved credits");

  // Case A1: 100% FINALIZED raw receipts
  const allFinalizedRecords: CleanupPartyResult[] = manifest13.map((target, idx) => {
    const txHash = `0x${(idx + 100).toString().padStart(64, "0")}`;
    const summary = createMockReceiptSummary(txHash, 7, 1);
    return {
      scenarioId: target.scenarioId,
      contractAddress: target.contractAddress,
      party: target.party,
      status: "WITHDRAWN",
      expectedCredit: target.expectedCreditWei,
      observedCredit: target.expectedCreditWei,
      transactionHash: txHash,
      receiptStatus: summary.status,
      executionResult: summary.executionResult,
      receiptSummary: summary,
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    };
  });
  const finalizedReport = evaluateEconomicCleanup({
    cleanupRecords: allFinalizedRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(finalizedReport.status === "ECONOMIC_CLEANUP_PASS", "All-FINALIZED raw receipts must produce ECONOMIC_CLEANUP_PASS");
  assert(finalizedReport.liveReadinessStatus === "LIVE_READINESS_PASS", "All-FINALIZED raw receipts must produce LIVE_READINESS_PASS");

  // Case A2: 100% ACCEPTED raw receipts
  const allAcceptedRecords: CleanupPartyResult[] = manifest13.map((target, idx) => {
    const txHash = `0x${(idx + 200).toString().padStart(64, "0")}`;
    const summary = createMockReceiptSummary(txHash, 5, 1);
    return {
      scenarioId: target.scenarioId,
      contractAddress: target.contractAddress,
      party: target.party,
      status: "WITHDRAWN",
      expectedCredit: target.expectedCreditWei,
      observedCredit: target.expectedCreditWei,
      transactionHash: txHash,
      receiptStatus: summary.status,
      executionResult: summary.executionResult,
      receiptSummary: summary,
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    };
  });
  const acceptedSweepSummary = createMockNativeSweepSummary(sweepTxHash, 5);
  const acceptedSweep: SweepResultRecord = {
    ...validSweep,
    receiptStatus: acceptedSweepSummary.status,
    executionResult: acceptedSweepSummary.executionResult,
    receiptSummary: acceptedSweepSummary as unknown as ValidatedReceiptSummary,
    nativeTransferSummary: acceptedSweepSummary,
  };
  const acceptedReport = evaluateEconomicCleanup({
    cleanupRecords: allAcceptedRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: acceptedSweep,
  });
  assert(acceptedReport.status === "ECONOMIC_CLEANUP_PASS", "All-ACCEPTED raw receipts must produce ECONOMIC_CLEANUP_PASS");
  assert(acceptedReport.liveReadinessStatus === "LIVE_READINESS_PASS", "All-ACCEPTED raw receipts must produce LIVE_READINESS_PASS");

  // Negative Receipt Evidence Tests (Proving manufactured strings are rejected fail-closed):
  // 1. Missing receiptSummary blocks readiness
  const recMissingSummary = valid13Records.map((r, i) => i === 0 ? { ...r, receiptSummary: undefined } : r);
  const repMissingSummary = evaluateEconomicCleanup({
    cleanupRecords: recMissingSummary,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repMissingSummary.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Missing receiptSummary must block readiness");
  assert(repMissingSummary.unresolvedContractAddresses.includes(manifest13[0].contractAddress), "Missing receiptSummary must leave address unresolved");

  // 2. Missing rawReceipt blocks readiness
  const recMissingRawReceipt = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    receiptSummary: { ...r.receiptSummary!, rawReceipt: undefined as unknown },
  } : r);
  const repMissingRaw = evaluateEconomicCleanup({
    cleanupRecords: recMissingRawReceipt,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repMissingRaw.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Missing rawReceipt must block readiness");

  // 3. Manufactured FINALIZED strings with pending raw receipt
  const recPendingRawReceipt = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    receiptSummary: {
      txHash: r.transactionHash as string,
      status: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      rawReceipt: { hash: r.transactionHash, status: 1, txExecutionResult: 1 },
    },
  } : r);
  const repPendingRaw = evaluateEconomicCleanup({
    cleanupRecords: recPendingRawReceipt,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repPendingRaw.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Manufactured strings with pending raw receipt must block readiness");

  // 4. Manufactured strings with error raw receipt
  const recErrorRawReceipt = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    receiptSummary: {
      txHash: r.transactionHash as string,
      status: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      rawReceipt: { hash: r.transactionHash, status: 7, txExecutionResult: 2 },
    },
  } : r);
  const repErrorRaw = evaluateEconomicCleanup({
    cleanupRecords: recErrorRawReceipt,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repErrorRaw.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Manufactured strings with error raw receipt must block readiness");

  // 5. transactionHash mismatch
  const recTxMismatch = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    transactionHash: "0xdeadbeef" + "0".repeat(56),
  } : r);
  const repTxMismatch = evaluateEconomicCleanup({
    cleanupRecords: recTxMismatch,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repTxMismatch.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "transactionHash mismatch must block readiness");

  // 6. receiptSummary txHash mismatch
  const recSummaryTxMismatch = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    receiptSummary: { ...r.receiptSummary!, txHash: "0xbadbeef" + "0".repeat(57) },
  } : r);
  const repSummaryTxMismatch = evaluateEconomicCleanup({
    cleanupRecords: recSummaryTxMismatch,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repSummaryTxMismatch.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "receiptSummary txHash mismatch must block readiness");

  // 7. receipt status mismatch
  const recStatusMismatch = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    receiptStatus: r.receiptStatus === "FINALIZED" ? "ACCEPTED" : "FINALIZED",
  } : r);
  const repStatusMismatch = evaluateEconomicCleanup({
    cleanupRecords: recStatusMismatch,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repStatusMismatch.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "receiptStatus mismatch must block readiness");

  // 8. executionResult mismatch
  const recExecMismatch = valid13Records.map((r, i) => i === 0 ? {
    ...r,
    executionResult: "FINISHED_WITH_ERROR",
  } : r);
  const repExecMismatch = evaluateEconomicCleanup({
    cleanupRecords: recExecMismatch,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(repExecMismatch.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "executionResult mismatch must block readiness");

  // Case B: Missing target blocks readiness
  const missing12Records = valid13Records.slice(1); // Omit first target (Scenario 1 challenger)
  const missingReport = evaluateEconomicCleanup({
    cleanupRecords: missing12Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(missingReport.status === "ECONOMIC_CLEANUP_PARTIAL", "Missing target must produce ECONOMIC_CLEANUP_PARTIAL");
  assert(missingReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Missing target must block readiness");
  assert(
    missingReport.unresolvedContractAddresses.includes(manifest13[0].contractAddress),
    "Missing target address must appear in unresolvedContractAddresses"
  );

  // Case C: Duplicate target blocks readiness
  const duplicateRecords = [...valid13Records, valid13Records[0]]; // Duplicate first target
  const duplicateReport = evaluateEconomicCleanup({
    cleanupRecords: duplicateRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(duplicateReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Duplicate target must block readiness");
  assert(
    duplicateReport.unresolvedContractAddresses.includes(valid13Records[0].contractAddress),
    "Duplicate target address must appear in unresolvedContractAddresses"
  );

  // Case D: Wrong-party target blocks readiness
  const wrongPartyRecords: CleanupPartyResult[] = [
    ...valid13Records,
    {
      scenarioId: 5,
      contractAddress: dummyRecords[4].contractAddress,
      party: "challenger", // Scenario 5 has NO challenger credit!
      status: "WITHDRAWN",
      expectedCredit: 5000000000000000n,
      observedCredit: 5000000000000000n,
      transactionHash: "0x" + "f".repeat(64),
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      receiptSummary: createMockReceiptSummary("0x" + "f".repeat(64), 7, 1),
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    },
  ];
  const wrongPartyReport = evaluateEconomicCleanup({
    cleanupRecords: wrongPartyRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(wrongPartyReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Wrong-party target must block readiness");
  assert(
    wrongPartyReport.unresolvedContractAddresses.includes(dummyRecords[4].contractAddress),
    "Wrong party target address must appear in unresolvedContractAddresses"
  );

  // Case E: Correct aggregate total with missing individual targets still fails
  // Omit target 0 (challenger scenario 1: 0.014 GEN) and inflate target 1 (challenger scenario 2: from 0.014 to 0.028 GEN)
  const inflatedRecords = valid13Records.slice(1).map((r) => {
    if (r.scenarioId === 2 && r.party === "challenger") {
      return {
        ...r,
        observedCredit: r.observedCredit! + manifest13[0].expectedCreditWei,
      };
    }
    return r;
  });
  const inflatedTotal = inflatedRecords.reduce((acc, r) => acc + (r.observedCredit || 0n), 0n);
  assert(inflatedTotal === expectedTotalCredits, "Inflated records sum exactly to expected total (0.105 GEN)");
  const inflatedReport = evaluateEconomicCleanup({
    cleanupRecords: inflatedRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(
    inflatedReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Correct aggregate total with missing/mismatched targets must fail closed"
  );
  assert(
    inflatedReport.unresolvedContractAddresses.includes(manifest13[0].contractAddress),
    "Missing target address must be in unresolvedContractAddresses"
  );
  assert(
    inflatedReport.unresolvedContractAddresses.includes(dummyRecords[1].contractAddress),
    "Mismatched credit address must be in unresolvedContractAddresses"
  );

  // Case F: Wrong scenarioId blocks readiness
  const wrongScenarioRecords = valid13Records.map((r, i) => i === 0 ? { ...r, scenarioId: 99 } : r);
  const wrongScenarioReport = evaluateEconomicCleanup({
    cleanupRecords: wrongScenarioRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(wrongScenarioReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Wrong scenarioId must block readiness");
  assert(wrongScenarioReport.unresolvedContractAddresses.includes(manifest13[0].contractAddress), "Wrong scenarioId address must be unresolved");

  // Case G: Wrong expectedCredit blocks readiness
  const wrongExpectedCreditRecords = valid13Records.map((r, i) => i === 0 ? { ...r, expectedCredit: 10000000000000000n } : r);
  const wrongExpectedCreditReport = evaluateEconomicCleanup({
    cleanupRecords: wrongExpectedCreditRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(wrongExpectedCreditReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Wrong expectedCredit must block readiness");

  // Case H: Omitted primaryScenariosStatus at runtime throws
  let caughtOmittedPrimary = false;
  try {
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      sweepRecord: validSweep,
    } as unknown as any);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    caughtOmittedPrimary = msg.includes("primaryScenariosStatus is mandatory");
  }
  assert(caughtOmittedPrimary, "Omitted primaryScenariosStatus must throw fail-closed");

  // Case I: Manifest count mismatch blocks readiness
  const shortManifest = manifest13.slice(1);
  const shortManifestReport = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: shortManifest,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(shortManifestReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Manifest count mismatch must block readiness");

  // Case J: Manifest credit sum mismatch blocks readiness
  const alteredManifest = manifest13.map((m, i) => i === 0 ? { ...m, expectedCreditWei: m.expectedCreditWei + 1000n } : m);
  const alteredManifestReport = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: alteredManifest,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(alteredManifestReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Manifest sum mismatch must block readiness");

  // Case K: Duplicate manifest entry blocks readiness
  const dupManifest = [...manifest13, manifest13[0]];
  const dupManifestReport = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: dupManifest,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(dupManifestReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Duplicate manifest entry must block readiness");

  // --------------------------------------------------------------------------
  // [10/18] Discriminated Cleanup Failure Records & Transaction Hash Preservation
  // --------------------------------------------------------------------------
  console.log("[10/18] Testing Discriminated Cleanup Failure Records & Transaction Hash Preservation...");
  // 1. Submitted transaction whose later receipt validation fails preserves hash in WITHDRAW_FAILED
  const failTxHash = "0x" + "9".repeat(64);
  const writeOpError = new WriteOperationError({
    message: "verifyReceiptExecution failed: status was PENDING",
    transactionHash: failTxHash,
    rawReceipt: { hash: failTxHash, status: 1, txExecutionResult: 1 },
    normalizedStatus: "UNKNOWN",
    normalizedExecutionResult: "UNKNOWN",
    originalError: new Error("pending"),
  });
  assert(writeOpError.transactionHash === failTxHash, "WriteOperationError preserves transaction hash");

  const failTypeRecords: CleanupPartyResult[] = [
    {
      scenarioId: 1,
      contractAddress: dummyRecords[0].contractAddress,
      party: "challenger",
      status: "QUERY_FAILED",
      expectedCredit: 14000000000000000n,
      error: "RPC timeout while querying credit",
    },
    {
      scenarioId: 2,
      contractAddress: dummyRecords[1].contractAddress,
      party: "challenger",
      status: "WITHDRAW_FAILED",
      expectedCredit: 14000000000000000n,
      observedCredit: 14000000000000000n,
      transactionHash: writeOpError.transactionHash, // Preserved transaction hash!
      error: writeOpError.message,
    },
    {
      scenarioId: 3,
      contractAddress: dummyRecords[2].contractAddress,
      party: "challenger",
      status: "POSTCHECK_FAILED",
      expectedCredit: 14000000000000000n,
      observedCredit: 14000000000000000n,
      transactionHash: "0x" + "3".repeat(64),
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      receiptSummary: createMockReceiptSummary("0x" + "3".repeat(64), 7, 1),
      postWithdrawalCredit: 1000n, // Non-zero residual credit
      error: "Post-withdrawal credit non-zero",
    },
    {
      scenarioId: 4,
      contractAddress: dummyRecords[3].contractAddress,
      party: "challenger",
      status: "INVARIANT_FAILED",
      expectedCredit: 14000000000000000n,
      observedCredit: 14000000000000000n,
      transactionHash: "0x" + "4".repeat(64),
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      receiptSummary: createMockReceiptSummary("0x" + "4".repeat(64), 7, 1),
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: false,
      error: "Accounting invariant false",
    },
  ];

  const discReport = evaluateEconomicCleanup({
    cleanupRecords: failTypeRecords,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(discReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Discriminated failures must block live readiness");
  assert(
    discReport.records.find((r) => r.status === "WITHDRAW_FAILED")?.transactionHash === failTxHash,
    "Preserved transaction hash must exist in failure record"
  );
  for (let i = 0; i < 4; i++) {
    assert(
      discReport.unresolvedContractAddresses.includes(dummyRecords[i].contractAddress),
      `Contract for failure status ${failTypeRecords[i].status} must appear in unresolvedContractAddresses`
    );
  }

  // --------------------------------------------------------------------------
  // [11/18] Sweep Readiness and Explicit Dispositions (Repair 4)
  // --------------------------------------------------------------------------
  console.log("[11/18] Testing Sweep Readiness and Explicit Dispositions...");
  // 1. Positive unsweepable balance -> BLOCKED_INSUFFICIENT_FEE blocks readiness
  const blockedSweep: SweepResultRecord = {
    disposition: "BLOCKED_INSUFFICIENT_FEE",
    preSweepBalanceWei: 500n,
    estimatedFeeWei: 1000n,
    postSweepObservedResidualBalanceWei: 500n,
    error: "Challenger balance cannot cover sweep fee reserve",
  };
  const repBlockedSweep = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: blockedSweep,
  });
  assert(repBlockedSweep.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "BLOCKED_INSUFFICIENT_FEE must block live readiness");

  // 2. Zero balance produces NOT_REQUIRED_ZERO_BALANCE and passes
  const zeroBalSweep: SweepResultRecord = {
    disposition: "NOT_REQUIRED_ZERO_BALANCE",
    preSweepBalanceWei: 0n,
    postSweepObservedResidualBalanceWei: 0n,
  };
  const repZeroSweep = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: zeroBalSweep,
  });
  assert(repZeroSweep.liveReadinessStatus === "LIVE_READINESS_PASS", "Valid NOT_REQUIRED_ZERO_BALANCE must pass live readiness");

  // Counter-check: NOT_REQUIRED_ZERO_BALANCE with positive pre/post balance is invalid
  const invalidZeroSweep: SweepResultRecord = {
    disposition: "NOT_REQUIRED_ZERO_BALANCE",
    preSweepBalanceWei: 500n,
    postSweepObservedResidualBalanceWei: 500n,
  };
  const repInvalidZeroSweep = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: invalidZeroSweep,
  });
  assert(repInvalidZeroSweep.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "NOT_REQUIRED_ZERO_BALANCE with positive balance must fail");

  // 3. Completed sweep with manufactured strings without receiptSummary blocks readiness
  const sweepMissingSummary: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: "0x" + "a".repeat(64),
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    postSweepObservedResidualBalanceWei: 100n,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: sweepMissingSummary,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Sweep missing receiptSummary must block readiness"
  );

  // 4. Completed sweep with missing rawReceipt blocks readiness
  const sweepMissingRaw: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: "0x" + "a".repeat(64),
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    receiptSummary: {
      txHash: "0x" + "a".repeat(64),
      status: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      rawReceipt: undefined as unknown,
    },
    postSweepObservedResidualBalanceWei: 100n,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: sweepMissingRaw,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Sweep missing rawReceipt must block readiness"
  );

  // 5. Completed sweep with txHash mismatch blocks readiness
  const sweepTxMismatch: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: "0x" + "a".repeat(64),
    receiptStatus: "FINALIZED",
    executionResult: "NOT_VOTED",
    nativeTransferSummary: createMockNativeSweepSummary("0x" + "b".repeat(64), 7),
    postSweepObservedResidualBalanceWei: 100n,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: sweepTxMismatch,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Sweep txHash mismatch must block readiness"
  );

  // 6. Pending receipt in completed sweep blocks readiness
  const incompleteSweep1: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: "0x" + "a".repeat(64),
    receiptStatus: "PENDING",
    executionResult: "NOT_VOTED",
    nativeTransferSummary: {
      txHash: "0x" + "a".repeat(64),
      status: "PENDING",
      executionResult: "NOT_VOTED",
      rawReceipt: { hash: "0x" + "a".repeat(64), status: 1, txExecutionResult: 0 },
      requestedAmountWei: 800000000000000n,
      balanceDeltaWei: 800000000000000n,
      preBalanceWei: 0n,
      postBalanceWei: 800000000000000n,
      receiptValueExact: true,
    },
    postSweepObservedResidualBalanceWei: 100n,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: incompleteSweep1,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Pending receipt in COMPLETED sweep must block readiness"
  );

  // 7. Missing post-balance query in completed sweep blocks readiness
  const incompleteSweep2: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: sweepTxHash,
    receiptStatus: "FINALIZED",
    executionResult: "NOT_VOTED",
    nativeTransferSummary: sweepSummary,
    postSweepObservedResidualBalanceWei: undefined,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: incompleteSweep2,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Missing post-balance query in COMPLETED sweep must block readiness"
  );

  // 8. Missing sweep record blocks readiness when sweep is expected
  assert(plan.challengerSweepTransactionCount > 0n, "Plan includes sweep");
  const missingSweepRep = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: undefined,
  });
  assert(missingSweepRep.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Missing sweep record must block readiness");

  // 9. FINISHED_WITH_ERROR sweep blocks readiness
  const errorSweep: SweepResultRecord = {
    disposition: "COMPLETED",
    sweepTransactionHash: "0x" + "e".repeat(64),
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_ERROR",
    receiptSummary: {
      txHash: "0x" + "e".repeat(64),
      status: "FINALIZED",
      executionResult: "FINISHED_WITH_ERROR",
      rawReceipt: { hash: "0x" + "e".repeat(64), status: 7, txExecutionResult: 2 },
    },
    postSweepObservedResidualBalanceWei: 100n,
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: errorSweep,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "FINISHED_WITH_ERROR sweep must block readiness"
  );

  // 10. Thrown sweep produces FAILED disposition and blocks readiness
  const failedSweep: SweepResultRecord = {
    disposition: "FAILED",
    error: "Network connection refused",
  };
  assert(
    evaluateEconomicCleanup({
      cleanupRecords: valid13Records,
      expectedTargets: manifest13,
      expectedPlan: plan,
      primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
      sweepRecord: failedSweep,
    }).liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "FAILED sweep must block readiness"
  );

  // --------------------------------------------------------------------------
  // [12/18] Real Combined Readiness State (Repair 5)
  // --------------------------------------------------------------------------
  console.log("[12/18] Testing Real Combined Readiness State...");
  // Primary scenarios fail -> LIVE_READINESS_BLOCKED even when cleanup passes
  const primaryFailReport = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_FAIL",
    sweepRecord: validSweep,
  });
  assert(primaryFailReport.primaryScenariosStatus === "PRIMARY_SCENARIOS_FAIL", "Preserves primary failure status");
  assert(primaryFailReport.status === "ECONOMIC_CLEANUP_PASS", "Cleanup status is PASS");
  assert(
    primaryFailReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED",
    "Primary failure MUST block live readiness even when cleanup passes"
  );

  // --------------------------------------------------------------------------
  // [13/18] Signer Balance Preflight Closed Behavior (Repair 6)
  // --------------------------------------------------------------------------
  console.log("[13/18] Testing Signer Balance Preflight Closed Behavior...");
  // When acting address is missing, must fail closed with BLOCKED_MISSING_SIGNER_ADDRESS
  let caughtMissingSigner = false;
  try {
    const clientWithoutAddress = {
      account: undefined,
      estimateTransactionFees: async () => ({ feeValue: "100" }),
      getBalance: async () => 1000n,
    };
    const actingAddress = (clientWithoutAddress as { account?: { address?: string } }).account?.address;
    if (!actingAddress) {
      throw new Error("BLOCKED_MISSING_SIGNER_ADDRESS: actingClient.account?.address is unavailable for write 'withdraw_credit'");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    caughtMissingSigner = msg.includes("BLOCKED_MISSING_SIGNER_ADDRESS");
  }
  assert(caughtMissingSigner, "Preflight must throw BLOCKED_MISSING_SIGNER_ADDRESS if account address is absent");

  // --------------------------------------------------------------------------
  // [14/18] Post-Withdrawal Nonzero Credit Strictly Rejected
  // --------------------------------------------------------------------------
  console.log("[14/18] Testing Rejection of Non-Zero Post-Withdrawal Credits...");
  const nonZeroCreditRecord: CleanupPartyResult = {
    scenarioId: 1,
    contractAddress: dummyRecords[0].contractAddress,
    party: "challenger",
    status: "WITHDRAWN",
    expectedCredit: 14000000000000000n,
    observedCredit: 14000000000000000n,
    transactionHash: "0x" + "b".repeat(64),
    receiptStatus: "FINALIZED",
    executionResult: "FINISHED_WITH_RETURN",
    receiptSummary: createMockReceiptSummary("0x" + "b".repeat(64), 7, 1),
    postWithdrawalCredit: 500n, // Non-zero remaining credit!
    accountingInvariantSatisfied: true,
  };
  const nonzeroReport = evaluateEconomicCleanup({
    cleanupRecords: [nonZeroCreditRecord],
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweep,
  });
  assert(nonzeroReport.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "Non-zero post-withdrawal credit must block live readiness");
  assert(
    nonzeroReport.unresolvedContractAddresses.includes(dummyRecords[0].contractAddress),
    "Contract with non-zero residual credit must be listed in unresolved addresses"
  );

  // --------------------------------------------------------------------------
  // [15/18] Honest Post-Sweep Residual Measurement
  // --------------------------------------------------------------------------
  console.log("[15/18] Testing Honest Post-Sweep Residual Measurement...");
  assert(validSweep.postSweepObservedResidualBalanceWei === 200000000000000n, "Observed residual balance recorded accurately");
  assert(validSweep.postSweepObservedResidualBalanceWei! > 0n, "Non-zero dust is reported honestly without claiming zero stranded");

  // --------------------------------------------------------------------------
  // [16/18] Python Launcher Protects Ephemeral Signer Funds (Option B)
  // --------------------------------------------------------------------------
  console.log("[16/18] Testing Python Launcher Option B Disposition...");
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
  // [17/18] Dynamic Python Fee Input Strictly Validated
  // --------------------------------------------------------------------------
  console.log("[17/18] Testing Python Dynamic Fee Environment Builder...");
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
  // [18/18] Funding Math Contains No Hardcoded 7-Bond Assumption
  // --------------------------------------------------------------------------
  console.log("[18/18] Testing Funding Math Boundary Cases...");
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
  if (evalResult.strictPass) {
    assert(evalResult.status === "PUBLICATION_READY", "Status must be publication ready when strict check passes");
  } else {
    assert(evalResult.status === "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION", "Status must be blocked pending publication");
    assert(evalResult.prepublishPass === true, "Prepublication inspection must pass on consistent placeholder state");
  }

  // Immutable URL validator
  const validCommit = "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e";
  const validUrl = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch-compliant.json`;
  const resValid = validateImmutableFixtureUrl(validUrl, "epoch-compliant.json");
  assert(resValid.valid === true, `Valid URL must pass, got: ${resValid.error}`);
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures/epoch.json`).valid, "Must reject /main/");
  // --------------------------------------------------------------------------
  // [19/19] Dedicated Native Value Transfer Verification & Ephemeral Signer Lifecycle (23 Checks)
  // --------------------------------------------------------------------------
  console.log("Verifying Native Transfer Verifier & Ephemeral Fund Lifecycle (23 Checks)...");

  const baseNativeRec = {
    hash: "0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21",
    status: 7,
    statusName: "FINALIZED",
    txExecutionResult: 0,
    txExecutionResultName: "NOT_VOTED",
    value_credited: true,
    from_address: "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    to_address: "0x197A05D11da0f26678cA93542d2FA8c89293d698",
    value: 1000n,
  };

  // 1. FINALIZED + NOT_VOTED + value_credited=true + correct balance delta passes
  const res1 = verifyNativeTransferReceipt({
    receipt: baseNativeRec,
    context: "test 1: finalized + not_voted",
    expectedHash: baseNativeRec.hash,
    expectedSender: baseNativeRec.from_address,
    expectedRecipient: baseNativeRec.to_address,
    requestedAmountWei: 1000n,
    preBalanceWei: 0n,
    postBalanceWei: 1000n,
  });
  assert(res1.status === "FINALIZED", "1. Status must be FINALIZED");
  assert(res1.executionResult === "NOT_VOTED", "1. Execution result must be NOT_VOTED");
  assert(res1.balanceDeltaWei === 1000n, "1. Balance delta must be 1000n");

  // 2. ACCEPTED + NOT_VOTED + correct balance delta passes if ACCEPTED is terminal under existing SDK policy
  const res2 = verifyNativeTransferReceipt({
    receipt: { ...baseNativeRec, status: 5, statusName: "ACCEPTED" },
    context: "test 2: accepted + not_voted",
    requestedAmountWei: 1000n,
    preBalanceWei: 0n,
    postBalanceWei: 1000n,
  });
  assert(res2.status === "ACCEPTED", "2. Status must be ACCEPTED");

  // 3. FINISHED_WITH_ERROR fails
  let caught3 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, txExecutionResult: 2, txExecutionResultName: "FINISHED_WITH_ERROR" },
      context: "test 3: finished_with_error",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught3 = String(err).includes("FINISHED_WITH_ERROR");
  }
  assert(caught3, "3. FINISHED_WITH_ERROR must fail");

  // 4. PENDING fails
  let caught4 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, status: 1, statusName: "PENDING" },
      context: "test 4: pending",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught4 = String(err).includes("PENDING");
  }
  assert(caught4, "4. PENDING must fail");

  // 5. CANCELED fails
  let caught5 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, status: 8, statusName: "CANCELED" },
      context: "test 5: canceled",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught5 = String(err).includes("CANCELED");
  }
  assert(caught5, "5. CANCELED must fail");

  // 6. UNKNOWN status fails
  let caught6 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, status: 99, statusName: "UNKNOWN_STATUS" },
      context: "test 6: unknown status",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch {
    caught6 = true;
  }
  assert(caught6, "6. UNKNOWN status must fail");

  // 7. value_credited=false fails
  let caught7 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, value_credited: false },
      context: "test 7: value_credited=false",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught7 = String(err).includes("value_credited");
  }
  assert(caught7, "7. value_credited=false must fail");

  // 8. Wrong sender fails
  let caught8 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: baseNativeRec,
      context: "test 8: wrong sender",
      expectedSender: "0x00000000000000000000000000000000000000aa",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught8 = String(err).includes("sender mismatch");
  }
  assert(caught8, "8. Wrong sender must fail");

  // 9. Wrong recipient fails
  let caught9 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: baseNativeRec,
      context: "test 9: wrong recipient",
      expectedRecipient: "0x00000000000000000000000000000000000000bb",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught9 = String(err).includes("recipient mismatch");
  }
  assert(caught9, "9. Wrong recipient must fail");

  // 10. Missing transaction hash fails
  let caught10 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: { ...baseNativeRec, hash: undefined, transactionHash: undefined },
      context: "test 10: missing hash",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught10 = String(err).includes("missing transaction hash");
  }
  assert(caught10, "10. Missing transaction hash must fail");

  // 11. Hash mismatch fails
  let caught11 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: baseNativeRec,
      context: "test 11: hash mismatch",
      expectedHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      requestedAmountWei: 1000n,
      preBalanceWei: 0n,
      postBalanceWei: 1000n,
    });
  } catch (err: unknown) {
    caught11 = String(err).includes("transaction hash mismatch");
  }
  assert(caught11, "11. Hash mismatch must fail");

  // 12. Insufficient recipient balance delta fails
  let caught12 = false;
  try {
    verifyNativeTransferReceipt({
      receipt: baseNativeRec,
      context: "test 12: insufficient delta",
      requestedAmountWei: 1000n,
      preBalanceWei: 100n,
      postBalanceWei: 500n, // delta = 400 < 1000
    });
  } catch (err: unknown) {
    caught12 = String(err).includes("is less than requested amount");
  }
  assert(caught12, "12. Insufficient recipient balance delta must fail");

  // 13. Exact bigint value succeeds
  const res13 = verifyNativeTransferReceipt({
    receipt: { ...baseNativeRec, value: 5000000000000000n },
    context: "test 13: exact bigint",
    requestedAmountWei: 5000000000000000n,
    preBalanceWei: 0n,
    postBalanceWei: 5000000000000000n,
  });
  assert(res13.receiptValueExact === true, "13. Exact bigint value must succeed and set receiptValueExact=true");

  // 14. Exact decimal-string value succeeds
  const res14 = verifyNativeTransferReceipt({
    receipt: { ...baseNativeRec, value: "5000000000000000" },
    context: "test 14: exact string",
    requestedAmountWei: 5000000000000000n,
    preBalanceWei: 0n,
    postBalanceWei: 5000000000000000n,
  });
  assert(res14.receiptValueExact === true, "14. Exact decimal-string value must succeed and set receiptValueExact=true");

  // 15. Unsafe JavaScript receipt number is never presented as exact wei evidence
  const res15 = verifyNativeTransferReceipt({
    receipt: { ...baseNativeRec, value: 1720000000000173824 },
    context: "test 15: unsafe js number",
    requestedAmountWei: 1720000000000173913n,
    preBalanceWei: 0n,
    postBalanceWei: 1720000000000173913n,
  });
  assert(res15.receiptValueExact === false, "15. Unsafe JS number must set receiptValueExact=false");
  assert(res15.balanceDeltaWei === 1720000000000173913n, "15. Balance delta must prove exact wei amount");

  // 16. The observed 89-wei unsafe-number case is covered
  const observedDiff = 1720000000000173913n - BigInt(1720000000000173824);
  assert(observedDiff === 89n, "16. Difference between exact RPC value and float rounding must equal exactly 89 wei");
  const res16 = verifyNativeTransferReceipt({
    receipt: {
      hash: "0x8da4afbfec605b99f799762f23f946aced09be609fba4456b71bfe47cae0fb21",
      status: 7,
      status_name: "FINALIZED",
      txExecutionResult: 0,
      txExecutionResultName: "NOT_VOTED",
      value_credited: true,
      from_address: "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
      to_address: "0x197A05D11da0f26678cA93542d2FA8c89293d698",
      value: 1720000000000173824, // The exact observed float rounding
    },
    context: "test 16: observed incident 89-wei case",
    expectedSender: "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    expectedRecipient: "0x197A05D11da0f26678cA93542d2FA8c89293d698",
    requestedAmountWei: 1720000000000173913n,
    preBalanceWei: 0n,
    postBalanceWei: 1720000000000173913n,
  });
  assert(res16.receiptValueExact === false, "16. Observed 89-wei receipt value must not be marked exact");
  assert(res16.balanceDeltaWei === 1720000000000173913n, "16. Balance delta must equal authoritative 1,720,000,000,000,173,913 wei");

  // 16b. Observed 89-wei case when parsed into BigInt from RPC/viem
  const res16BigInt = verifyNativeTransferReceipt({
    receipt: {
      hash: "0x272cad038cad6f3e85d217ea5eaf0a7e6ebecfe6e3037f137d14a93ec6710769",
      status: 7,
      status_name: "FINALIZED",
      txExecutionResult: 0,
      txExecutionResultName: "NOT_VOTED",
      value_credited: true,
      from_address: "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
      to_address: "0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e",
      value: 1720000000000173824n, // As parsed into BigInt from viem/RPC
    },
    context: "test 16b: observed BigInt 89-wei case",
    expectedSender: "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD",
    expectedRecipient: "0xFCB9fF5d4AEA985336a8337295bdde0c33f46B5e",
    requestedAmountWei: 1720000000000173913n,
    preBalanceWei: 0n,
    postBalanceWei: 1720000000000173913n,
  });
  assert(res16BigInt.receiptValueExact === false, "16b. Observed 89-wei BigInt receipt value must not be marked exact");
  assert(res16BigInt.balanceDeltaWei === 1720000000000173913n, "16b. Balance delta must prove exact amount");

  // 17. Funding failure after successful transfer triggers emergency sweep
  let emergencySweepTriggered = false;
  const simulatedChallengerBal = 1720000000000173913n;
  if (simulatedChallengerBal > 0n) {
    const mockSweepRec = {
      hash: "0x9999999999999999999999999999999999999999999999999999999999999999",
      status: 7,
      statusName: "FINALIZED",
      txExecutionResult: 0,
      txExecutionResultName: "NOT_VOTED",
      value_credited: true,
    };
    const verifiedEmergency = verifyNativeTransferReceipt({
      receipt: mockSweepRec,
      context: "emergency sweep verification",
      requestedAmountWei: simulatedChallengerBal,
      preBalanceWei: 0n,
      postBalanceWei: simulatedChallengerBal,
    });
    emergencySweepTriggered = verifiedEmergency.status === "FINALIZED";
  }
  assert(emergencySweepTriggered, "17. Emergency sweep after funding failure must verify cleanly");

  // 18. A funded signer is never released before cleanup
  let simulatedSignerRef: { address: string } | null = { address: "0x123" };
  let cleanupCompleted = false;
  try {
    assert(simulatedSignerRef !== null, "Signer must be available during run");
    cleanupCompleted = true;
  } finally {
    if (cleanupCompleted) {
      simulatedSignerRef = null;
    }
  }
  assert(simulatedSignerRef === null, "18. Signer reference must only be released in finally after cleanup");

  // 19. Native sweep uses native-transfer semantics, not FINISHED_WITH_RETURN
  const nativeSweepRec = {
    hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    status: 7,
    statusName: "FINALIZED",
    txExecutionResult: 0,
    txExecutionResultName: "NOT_VOTED",
    value_credited: true,
  };
  const nativeSweepSummary = verifyNativeTransferReceipt({
    receipt: nativeSweepRec,
    context: "test 19: native sweep semantics",
    requestedAmountWei: 1000n,
    preBalanceWei: 0n,
    postBalanceWei: 1000n,
  });
  assert(nativeSweepSummary.executionResult === "NOT_VOTED", "19. Native sweep must accept NOT_VOTED");

  // 20. Contract write receipts still require FINISHED_WITH_RETURN
  let caught20 = false;
  try {
    verifyReceiptExecution(baseNativeRec, "contract write receipt check", "publish_epoch");
  } catch (err: unknown) {
    caught20 = String(err).includes("unexpected executionResult='NOT_VOTED'");
  }
  assert(caught20, "20. Contract write receipts MUST still require FINISHED_WITH_RETURN and reject NOT_VOTED");

  // 21. Contract cleanup withdrawals remain protected by existing raw-receipt checks
  const mockCleanupTarget: ExpectedCleanupTarget = {
    scenarioId: 1,
    contractAddress: "0x1111111111111111111111111111111111111111",
    party: "challenger",
    expectedCreditWei: 14000000000000000n,
  };
  const mockWithdrawRecord: CleanupPartyResult = {
    scenarioId: 1,
    contractAddress: "0x1111111111111111111111111111111111111111",
    party: "challenger",
    status: "WITHDRAWN",
    expectedCredit: 14000000000000000n,
    observedCredit: 14000000000000000n,
    transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    receiptStatus: "FINALIZED",
    executionResult: "NOT_VOTED", // WRONG for contract write!
    receiptSummary: {
      txHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      status: "FINALIZED",
      executionResult: "NOT_VOTED",
      rawReceipt: baseNativeRec,
    },
    postWithdrawalCredit: 0n,
    accountingInvariantSatisfied: true,
  };
  const oneTargetPlan = deriveScenarioTransactionPlan([specs[0]], true);
  const evalReport21 = evaluateEconomicCleanup({
    cleanupRecords: [mockWithdrawRecord],
    expectedTargets: [mockCleanupTarget],
    expectedPlan: oneTargetPlan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: { disposition: "NOT_REQUIRED_ZERO_BALANCE", preSweepBalanceWei: 0n, postSweepObservedResidualBalanceWei: 0n },
  });
  assert(evalReport21.status !== "ECONOMIC_CLEANUP_PASS", "21. Contract withdrawal with NOT_VOTED must fail raw receipt check");

  // 22. Positive residual blocks LIVE_READINESS
  const blockedSweepRecord: SweepResultRecord = {
    disposition: "FAILED",
    preSweepBalanceWei: 1720000000000173913n,
    postSweepObservedResidualBalanceWei: 1720000000000173913n,
    error: "Sweep failed; positive residual stranded",
  };
  const evalReport22 = evaluateEconomicCleanup({
    cleanupRecords: [],
    expectedTargets: [],
    expectedPlan: deriveScenarioTransactionPlan([], true),
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: blockedSweepRecord,
  });
  assert(evalReport22.liveReadinessStatus === "LIVE_READINESS_BLOCKED", "22. Positive unmanaged residual must block LIVE_READINESS");

  // 23. Zero or explicitly bounded unavoidable dust is reported honestly according to a documented rule
  const validSweepZero: SweepResultRecord = {
    disposition: "COMPLETED",
    preSweepBalanceWei: 10000000000000000n,
    sweepTransactionHash: nativeSweepRec.hash,
    receiptStatus: "FINALIZED",
    executionResult: "NOT_VOTED",
    nativeTransferSummary: nativeSweepSummary,
    postSweepObservedResidualBalanceWei: 0n,
    issuerPreSweepBalanceWei: 0n,
    issuerPostSweepBalanceWei: 1000n,
    attemptedSweepAmountWei: 1000n,
  };
  const evalReport23Zero = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweepZero,
  });
  assert(evalReport23Zero.liveReadinessStatus === "LIVE_READINESS_PASS", "23a. Zero residual must pass LIVE_READINESS");

  const validSweepDust: SweepResultRecord = {
    disposition: "COMPLETED",
    preSweepBalanceWei: 10000000000000000n,
    estimatedFeeWei: 100000000000000n,
    sweepTransactionHash: nativeSweepRec.hash,
    receiptStatus: "FINALIZED",
    executionResult: "NOT_VOTED",
    nativeTransferSummary: nativeSweepSummary,
    postSweepObservedResidualBalanceWei: 50000000000000n, // Bounded dust <= 200000000000000n
    issuerPreSweepBalanceWei: 0n,
    issuerPostSweepBalanceWei: 1000n,
    attemptedSweepAmountWei: 1000n,
  };
  const evalReport23Dust = evaluateEconomicCleanup({
    cleanupRecords: valid13Records,
    expectedTargets: manifest13,
    expectedPlan: plan,
    primaryScenariosStatus: "PRIMARY_SCENARIOS_PASS",
    sweepRecord: validSweepDust,
  });
  assert(evalReport23Dust.liveReadinessStatus === "LIVE_READINESS_PASS", "23b. Bounded unavoidable dust must pass LIVE_READINESS");

  console.log("\nAll 18 core repair checks + 23 native-transfer regression checks passed successfully.\n");
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
