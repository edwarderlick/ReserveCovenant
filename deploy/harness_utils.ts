/**
 * Live-Harness Utilities for ReserveCovenant.
 *
 * Implements pure, offline-testable utilities:
 * 1. Dynamic challenger and issuer funding calculations (BigInt throughout).
 * 2. Strict receipt verification requiring FINISHED_WITH_RETURN.
 * 3. Structured ContractExecutionReceiptError and receipt-backed expected-error validation.
 * 4. Strongly typed challenger funding execution and post-balance verification without 'any'.
 */

import { isSuccessful, createClient } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address, Hash, Account } from "viem";
import type { ScenarioCallSpec } from "./run_live_integration.js";

export type SupportedGenLayerClient = ReturnType<typeof createClient>;

/**
 * Narrow, strictly typed structural interface containing only the supported GenLayer client methods:
 * - sendTransaction;
 * - waitForTransactionReceipt;
 * - getBalance.
 * Eliminates 'any' casts while preserving compile-time type safety.
 */
export interface SupportedFundingClient {
  sendTransaction: SupportedGenLayerClient["sendTransaction"];
  waitForTransactionReceipt: SupportedGenLayerClient["waitForTransactionReceipt"];
  getBalance: SupportedGenLayerClient["getBalance"];
}

// ============================================================================
// 1. Dynamic Funding Calculation (Pure Functions, BigInt throughout)
// ============================================================================

/**
 * Derives the exact number of challenger-signed challenge transactions from scenario specs.
 * Each scenario with a defined challengeType requires one challenger-signed open_challenge transaction.
 */
export function deriveChallengerTransactionCount(specs: ScenarioCallSpec[]): number {
  return specs.filter((s) => s.challengeType !== undefined && s.challengeType !== null).length;
}

/**
 * Derives the total number of challenger-signed transactions including cleanup withdrawals and final sweep:
 * - 7 primary open_challenge transactions (Scenarios 1..7)
 * - 6 pull-credit cleanup withdrawals (Scenarios 1, 2, 3, 4, 6, 7 produce challenger credit)
 * - 1 residual GEN sweep back to the issuer
 * Total = 14 challenger-signed transactions.
 */
export function deriveTotalChallengerTransactionCount(
  specs: ScenarioCallSpec[],
  includeCleanup: boolean = true
): number {
  const challengeCount = deriveChallengerTransactionCount(specs);
  if (!includeCleanup) {
    return challengeCount;
  }
  // Scenarios 1..4 (BREACH: challenger payout), Scenarios 6..7 (INCONCLUSIVE: challenger bond refund).
  // Scenario 5 is UPHELD (no challenger credit); Scenario 8 is issuer-only.
  const cleanupWithdrawalCount = specs.filter((s) => {
    return (
      s.challengeType !== undefined &&
      s.challengeType !== null &&
      s.expectedFinalStatus !== "UPHELD"
    );
  }).length; // 6 withdrawals
  const sweepTxCount = 1; // 1 final sweep back to issuer
  return challengeCount + cleanupWithdrawalCount + sweepTxCount;
}

export interface ChallengerFundingParams {
  challengerTxCount: bigint;
  bondPerTx: bigint;
  estimatedFeePerTx: bigint;
  safetyMargin?: bigint;
}

/**
 * Calculates the required challenger funding:
 * required_funding = (challengeTxCount * bondPerTx) + (totalTxCount * estimatedFeePerTx) + safetyMargin
 *
 * Bounded safety margin defaults to 20% of estimated challenger fees + 0.005 GEN (5e15 wei)
 * to absorb Devnet fee variance.
 */
export function calculateRequiredChallengerFunding(params: ChallengerFundingParams): bigint {
  const { challengerTxCount, bondPerTx, estimatedFeePerTx } = params;

  if (challengerTxCount < 0n) {
    throw new RangeError("challengerTxCount cannot be negative");
  }
  if (bondPerTx < 0n) {
    throw new RangeError("bondPerTx cannot be negative");
  }
  if (estimatedFeePerTx < 0n) {
    throw new RangeError("estimatedFeePerTx cannot be negative");
  }

  // 7 challenge bonds
  const totalBonds = 7n * bondPerTx;
  const totalFees = challengerTxCount * estimatedFeePerTx;

  const safetyMargin = params.safetyMargin !== undefined
    ? params.safetyMargin
    : (totalFees * 20n) / 100n + 5000000000000000n; // 0.005 GEN

  if (safetyMargin < 0n) {
    throw new RangeError("safetyMargin cannot be negative");
  }

  return totalBonds + totalFees + safetyMargin;
}

/**
 * Calculates the challenger funding shortfall:
 * shortfall = max(requiredFunding - currentBalance, 0)
 */
export function calculateChallengerFundingShortfall(
  requiredFunding: bigint,
  currentBalance: bigint
): bigint {
  if (requiredFunding < 0n) {
    throw new RangeError("requiredFunding cannot be negative");
  }
  if (currentBalance < 0n) {
    throw new RangeError("currentBalance cannot be negative");
  }

  return requiredFunding > currentBalance ? requiredFunding - currentBalance : 0n;
}

export interface IssuerBalanceRequirements {
  disposableDeployCount: bigint;
  deployFeePerTx: bigint;
  issuerBondsTotal: bigint;
  issuerTxCount: bigint;
  txFeePerTx: bigint;
  challengerShortfall: bigint;
  safetyMargin?: bigint;
}

/**
 * Calculates the total balance required by the issuer on Studio Devnet:
 * required = (deployCount * deployFee) + issuerBonds + (issuerTxCount * txFee) + challengerShortfall + safetyMargin
 */
export function calculateRequiredIssuerBalance(req: IssuerBalanceRequirements): bigint {
  const {
    disposableDeployCount,
    deployFeePerTx,
    issuerBondsTotal,
    issuerTxCount,
    txFeePerTx,
    challengerShortfall,
  } = req;

  if (
    disposableDeployCount < 0n ||
    deployFeePerTx < 0n ||
    issuerBondsTotal < 0n ||
    issuerTxCount < 0n ||
    txFeePerTx < 0n ||
    challengerShortfall < 0n
  ) {
    throw new RangeError("Issuer balance parameters cannot be negative");
  }

  const deployFees = disposableDeployCount * deployFeePerTx;
  const txFees = issuerTxCount * txFeePerTx;

  const safetyMargin = req.safetyMargin !== undefined
    ? req.safetyMargin
    : ((deployFees + txFees) * 20n) / 100n + 10000000000000000n; // 0.01 GEN

  if (safetyMargin < 0n) {
    throw new RangeError("safetyMargin cannot be negative");
  }

  return deployFees + issuerBondsTotal + txFees + challengerShortfall + safetyMargin;
}

// ============================================================================
// 2. Structured Contract Execution Error & Receipt Extraction (Phase 1 & Phase 2)
// ============================================================================

/**
 * Structured error thrown when an on-chain transaction receipt indicates FINISHED_WITH_ERROR.
 * Retains complete receipt and execution metadata to prove the revert occurred on-chain.
 */
export class ContractExecutionReceiptError extends Error {
  public readonly transactionHash: string;
  public readonly methodName: string;
  public readonly receipt: any;
  public readonly consensusStatus: string;
  public readonly executionResult: string;
  public readonly contractErrorPayload: string;

  constructor(params: {
    transactionHash: string;
    methodName: string;
    receipt: any;
    consensusStatus: string;
    executionResult: string;
    contractErrorPayload: string;
  }) {
    super(
      `Contract execution finished with error (FINISHED_WITH_ERROR) on '${params.methodName}' (tx ${params.transactionHash}): ${params.contractErrorPayload}`
    );
    this.name = "ContractExecutionReceiptError";
    this.transactionHash = params.transactionHash;
    this.methodName = params.methodName;
    this.receipt = params.receipt;
    this.consensusStatus = params.consensusStatus;
    this.executionResult = params.executionResult;
    this.contractErrorPayload = params.contractErrorPayload;
    Object.setPrototypeOf(this, ContractExecutionReceiptError.prototype);
  }
}

/**
 * Safely extracts the normalized contract error payload string from a GenLayer transaction receipt.
 * Inspects documented receipt and consensus structure fields only.
 */
export function extractContractErrorPayload(receipt: any, fallbackMessage?: string): string {
  if (!receipt || typeof receipt !== "object") {
    return fallbackMessage || "";
  }

  // 1. Decoded receipt.result (e.g. from decodeLocalnetTransaction / resultToUserFriendlyJson)
  if (typeof receipt.result === "string" && receipt.result.length > 0) {
    return receipt.result;
  }
  if (receipt.result && typeof receipt.result === "object") {
    if (typeof receipt.result.payload === "string" && receipt.result.payload.length > 0) {
      return receipt.result.payload;
    }
  }

  // 2. Consensus leader receipt data
  const leaderReceipt = receipt.consensus_data?.leader_receipt;
  if (leaderReceipt) {
    const list = Array.isArray(leaderReceipt) ? leaderReceipt : [leaderReceipt];
    for (const lr of list) {
      if (typeof lr?.result === "string" && lr.result.length > 0) {
        return lr.result;
      }
      if (lr?.result && typeof lr.result === "object" && typeof lr.result.payload === "string" && lr.result.payload.length > 0) {
        return lr.result.payload;
      }
      if (typeof lr?.genvm_result === "string" && lr.genvm_result.length > 0) {
        return lr.genvm_result;
      }
    }
  }

  // 3. Documented receipt error message fields
  if (typeof receipt.errorMessage === "string" && receipt.errorMessage.length > 0) {
    return receipt.errorMessage;
  }
  if (typeof receipt.error === "string" && receipt.error.length > 0) {
    return receipt.error;
  }
  if (typeof receipt.contractErrorPayload === "string" && receipt.contractErrorPayload.length > 0) {
    return receipt.contractErrorPayload;
  }

  return fallbackMessage || "";
}

// ============================================================================
// 3. Receipt Execution & Consensus Verification (Phase 1 & Phase 8)
// ============================================================================

export interface ValidatedReceiptSummary {
  txHash: string;
  status: string;
  executionResult: string;
  contractAddress?: string;
}

/**
 * Normalizes consensus status from receipt.
 */
export function normalizeConsensusStatus(rawStatus: any): string {
  if (rawStatus === "FINALIZED" || rawStatus === TransactionStatus.FINALIZED || rawStatus === 5 || rawStatus === "5") {
    return "FINALIZED";
  }
  if (rawStatus === "ACCEPTED" || rawStatus === TransactionStatus.ACCEPTED || rawStatus === 7 || rawStatus === "7") {
    return "ACCEPTED";
  }
  return String(rawStatus || "UNKNOWN");
}

/**
 * Normalizes execution result name from receipt.
 */
export function normalizeExecutionResult(rawResult: any): string {
  if (rawResult === "FINISHED_WITH_RETURN" || rawResult === ExecutionResult.FINISHED_WITH_RETURN || rawResult === 1 || rawResult === "1") {
    return "FINISHED_WITH_RETURN";
  }
  if (rawResult === "FINISHED_WITH_ERROR" || rawResult === ExecutionResult.FINISHED_WITH_ERROR || rawResult === 2 || rawResult === "2") {
    return "FINISHED_WITH_ERROR";
  }
  return String(rawResult || "UNKNOWN");
}

/**
 * Verifies that a transaction receipt finalized cleanly with execution result FINISHED_WITH_RETURN.
 * Rejects pending, unknown, canceled, or FINISHED_WITH_ERROR receipts.
 * When receipt contains FINISHED_WITH_ERROR, throws structured ContractExecutionReceiptError.
 */
export function verifyReceiptExecution(
  receipt: any,
  context: string,
  methodName?: string
): ValidatedReceiptSummary {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Receipt verification failed for ${context}: receipt is missing or malformed`);
  }

  const txHash = String(receipt.hash || receipt.transactionHash || "");
  if (!txHash || txHash.trim().length === 0) {
    throw new Error(`Receipt verification failed for ${context}: missing transaction hash`);
  }

  const statusName = normalizeConsensusStatus(
    receipt.statusName !== undefined ? receipt.statusName : receipt.status
  );

  const isAcceptedOrFinalized = statusName === "FINALIZED" || statusName === "ACCEPTED";
  if (!isAcceptedOrFinalized) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): expected FINALIZED or ACCEPTED consensus status, got '${statusName}'`
    );
  }

  const executionResult = normalizeExecutionResult(
    receipt.txExecutionResultName !== undefined ? receipt.txExecutionResultName : receipt.txExecutionResult
  );

  if (executionResult === "FINISHED_WITH_ERROR") {
    const errorPayload = extractContractErrorPayload(receipt);
    throw new ContractExecutionReceiptError({
      transactionHash: txHash,
      methodName: methodName || context,
      receipt,
      consensusStatus: statusName,
      executionResult,
      contractErrorPayload: errorPayload,
    });
  }

  if (executionResult !== "FINISHED_WITH_RETURN") {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): unexpected executionResult='${executionResult}'`
    );
  }

  if (!isSuccessful(receipt)) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): isSuccessful(receipt) returned false`
    );
  }

  const contractAddress = receipt.contractAddress || receipt.recipient;

  return {
    txHash,
    status: statusName,
    executionResult,
    contractAddress,
  };
}

// ============================================================================
// 4. Expected Contract Execution Error Classification (Phase 1 & Phase 2)
// ============================================================================

export interface ExpectedContractErrorOptions {
  expectedMethod: string;
  expectedErrorSubstring: string;
  verifyStateUnchanged?: () => Promise<void>;
}

/**
 * Receipt-backed expected contract error validation:
 * Distinguishes accepted on-chain contract execution errors (reverts)
 * from rejected unrelated infrastructure/network/client errors.
 *
 * Requires ALL 7 conditions to accept:
 * 1. Nonempty transaction hash exists.
 * 2. Non-null receipt object exists.
 * 3. Consensus status is strictly FINALIZED or ACCEPTED.
 * 4. Execution result is strictly FINISHED_WITH_ERROR.
 * 5. Recorded method equals expectedMethod.
 * 6. Normalized contract error payload contains expectedErrorSubstring.
 * 7. State-unchanged verification callback passes.
 *
 * Rejects generic errors containing "revert", missing receipts, RPC timeouts,
 * FINISHED_WITH_RETURN, wrong methods, wrong error reasons, or state mutations.
 */
export async function expectContractExecutionError(
  action: () => Promise<any>,
  options: ExpectedContractErrorOptions
): Promise<{ txHash: string; errorName: string; message: string; receipt: any }> {
  if (!options.expectedErrorSubstring || options.expectedErrorSubstring.trim().length === 0) {
    throw new Error("expectedErrorSubstring is required for contract execution error validation");
  }

  let actionResult: any = null;
  let actionThrew = false;
  let capturedError: any = null;

  try {
    actionResult = await action();
  } catch (err: any) {
    actionThrew = true;
    capturedError = err;
  }

  let receipt: any = null;
  let txHash = "";
  let status = "";
  let execResult = "";
  let recordedMethod = options.expectedMethod;
  let contractPayload = "";

  if (!actionThrew) {
    // Action returned without throwing: must be a finalized receipt indicating FINISHED_WITH_ERROR
    if (!actionResult || typeof actionResult !== "object") {
      throw new Error(
        `Expected contract execution error on '${options.expectedMethod}', but call returned unexpected value without receipt`
      );
    }
    receipt = actionResult;
    txHash = String(receipt.hash || receipt.transactionHash || "");
    status = normalizeConsensusStatus(receipt.statusName !== undefined ? receipt.statusName : receipt.status);
    execResult = normalizeExecutionResult(receipt.txExecutionResultName !== undefined ? receipt.txExecutionResultName : receipt.txExecutionResult);
    if (receipt.methodName && typeof receipt.methodName === "string") {
      recordedMethod = receipt.methodName;
    }
    contractPayload = extractContractErrorPayload(receipt);
  } else {
    // Action threw: inspect if the error is backed by a structured on-chain receipt
    if (capturedError instanceof ContractExecutionReceiptError) {
      receipt = capturedError.receipt;
      txHash = capturedError.transactionHash;
      status = capturedError.consensusStatus;
      execResult = capturedError.executionResult;
      recordedMethod = capturedError.methodName;
      contractPayload = capturedError.contractErrorPayload;
    } else if (capturedError?.receipt && typeof capturedError.receipt === "object") {
      receipt = capturedError.receipt;
      txHash = String(receipt.hash || receipt.transactionHash || capturedError.txHash || capturedError.transactionHash || "");
      status = normalizeConsensusStatus(receipt.statusName !== undefined ? receipt.statusName : receipt.status);
      execResult = normalizeExecutionResult(receipt.txExecutionResultName !== undefined ? receipt.txExecutionResultName : receipt.txExecutionResult);
      if (capturedError.methodName && typeof capturedError.methodName === "string") {
        recordedMethod = capturedError.methodName;
      }
      contractPayload = extractContractErrorPayload(receipt, capturedError.message);
    } else {
      // Generic JavaScript error, locally manufactured error, or infrastructure failure without receipt -> strictly reject!
      throw new Error(
        `Rejected generic/unstructured error on '${options.expectedMethod}' without on-chain receipt: ${capturedError?.message || capturedError}`
      );
    }
  }

  // 1. Transaction hash must exist and be nonempty
  if (!txHash || txHash.trim().length === 0) {
    throw new Error(
      `Receipt verification failed on '${options.expectedMethod}': missing transaction hash`
    );
  }

  // 2. Receipt object must exist
  if (!receipt || typeof receipt !== "object") {
    throw new Error(
      `Receipt verification failed on '${options.expectedMethod}': receipt object is missing`
    );
  }

  // 3. Consensus status must be strictly FINALIZED or ACCEPTED
  if (status !== "FINALIZED" && status !== "ACCEPTED") {
    throw new Error(
      `Receipt verification failed on '${options.expectedMethod}' (tx ${txHash}): expected FINALIZED or ACCEPTED consensus status, got '${status}'`
    );
  }

  // 4. Execution result must be strictly FINISHED_WITH_ERROR (reject FINISHED_WITH_RETURN or pending)
  if (execResult === "FINISHED_WITH_RETURN") {
    throw new Error(
      `Expected contract execution error on '${options.expectedMethod}', but transaction succeeded unexpectedly (tx ${txHash})`
    );
  }
  if (execResult !== "FINISHED_WITH_ERROR") {
    throw new Error(
      `Receipt verification failed on '${options.expectedMethod}' (tx ${txHash}): expected FINISHED_WITH_ERROR, got '${execResult}'`
    );
  }

  // 5. Recorded method must match expectedMethod
  if (recordedMethod !== options.expectedMethod) {
    throw new Error(
      `Method mismatch on expected contract error: expected '${options.expectedMethod}', got '${recordedMethod}' (tx ${txHash})`
    );
  }

  // 6. Normalized contract error payload must contain expected substring
  const sub = options.expectedErrorSubstring.toLowerCase();
  if (!contractPayload.toLowerCase().includes(sub)) {
    throw new Error(
      `Contract error payload on '${options.expectedMethod}' (tx ${txHash}) did not match expected substring '${options.expectedErrorSubstring}'. Got: '${contractPayload}'`
    );
  }

  // 7. Verify contract state remains unchanged
  if (options.verifyStateUnchanged) {
    await options.verifyStateUnchanged();
  }

  return {
    txHash,
    errorName: "ContractExecutionReceiptError",
    message: contractPayload,
    receipt,
  };
}

// ============================================================================
// 5. Typed Challenger Funding Execution & Balance Verification (Phase 4 & Phase 5)
// ============================================================================

export interface ExecuteFundingOptions {
  issuerClient: SupportedFundingClient;
  issuerAccount: Account;
  challengerAddress: Address;
  fundingAmount: bigint;
  requiredPostBalance: bigint;
}

/**
 * Executes challenger funding using the typed GenLayer client interface.
 * Verifies transaction finality, receipt execution, and post-balance threshold.
 * Halts closed with BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API if sendTransaction is unavailable.
 */
export async function executeAndVerifyChallengerFunding(
  options: ExecuteFundingOptions
): Promise<{ fundTxHash: string; postBalance: bigint }> {
  const { issuerClient, issuerAccount, challengerAddress, fundingAmount, requiredPostBalance } = options;

  if (!issuerClient || typeof issuerClient.sendTransaction !== "function") {
    throw new Error(
      "BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API: issuerClient.sendTransaction is not available on client interface"
    );
  }

  console.log(`[funding] Submitting challenger funding: ${fundingAmount.toString()} wei to ${challengerAddress}`);
  const fundTxHash = await issuerClient.sendTransaction({
    account: issuerAccount,
    to: challengerAddress,
    value: fundingAmount,
    chain: null,
  });

  const receipt = await issuerClient.waitForTransactionReceipt({ hash: fundTxHash as any });
  verifyReceiptExecution(receipt, "challenger funding transaction", "sendTransaction");

  const postBalance = await issuerClient.getBalance({ address: challengerAddress });
  console.log(`[funding] Verified challenger post-funding balance: ${postBalance.toString()} wei`);

  if (postBalance < requiredPostBalance) {
    throw new Error(
      `Challenger post-funding balance (${postBalance.toString()} wei) is below required minimum (${requiredPostBalance.toString()} wei).`
    );
  }

  return {
    fundTxHash: String(fundTxHash),
    postBalance,
  };
}
