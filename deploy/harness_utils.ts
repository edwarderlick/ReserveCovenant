/**
 * Live-Harness Utilities for ReserveCovenant.
 *
 * Implements pure, offline-testable utilities:
 * 1. Authoritative SDK status and execution result mappings from genlayer-js.
 * 2. Accurate scenario transaction planning and dynamic funding calculations (BigInt throughout).
 * 3. Strict receipt verification requiring FINISHED_WITH_RETURN and final consensus.
 * 4. Structured ContractExecutionReceiptError and receipt-backed expected-error validation.
 * 5. Strongly typed client interfaces and challenger funding execution without 'any'.
 * 6. Economic cleanup evaluation and residual sweep measurement.
 */

import { isSuccessful, createClient } from "genlayer-js";
import {
  transactionsStatusNumberToName,
  executionResultNumberToName,
  TransactionStatus,
  ExecutionResult,
} from "genlayer-js/types";
import type {
  LeaderReceipt,
  TransactionFeeEstimate,
} from "genlayer-js/types";
import type { Address, Hash, Account, Hex } from "viem";
import type { ScenarioCallSpec } from "./run_live_integration.js";

export type SupportedGenLayerClient = ReturnType<typeof createClient>;

/**
 * Structural receipt representation covering documented GenLayer transaction receipt fields.
 * Replaces 'any' with typed runtime-narrowed properties.
 */
export interface GenLayerReceiptLike {
  hash?: Hash | string;
  transactionHash?: Hash | string;
  status?: number | string;
  statusName?: string;
  txExecutionResult?: number | string;
  txExecutionResultName?: string;
  contractAddress?: Address | string | null;
  recipient?: Address | string | null;
  result?: unknown;
  consensus_data?: {
    leader_receipt?: LeaderReceipt | LeaderReceipt[] | unknown;
    [key: string]: unknown;
  };
  errorMessage?: string;
  error?: string;
  contractErrorPayload?: string;
  methodName?: string;
  [key: string]: unknown;
}

/**
 * Narrow, strictly typed structural interface containing only the supported GenLayer client methods:
 * - sendTransaction;
 * - waitForTransactionReceipt;
 * - getBalance;
 * - estimateTransactionFees.
 * Eliminates 'any' casts while preserving compile-time type safety.
 */
export interface SupportedFundingClient {
  sendTransaction(args: {
    to: Address;
    value: bigint;
    account?: Account;
    chain?: null;
    [key: string]: unknown;
  }): Promise<Hash>;
  waitForTransactionReceipt(args: {
    hash: Hash;
    [key: string]: unknown;
  }): Promise<GenLayerReceiptLike>;
  getBalance(args: {
    address: Address;
    [key: string]: unknown;
  }): Promise<bigint>;
  estimateTransactionFees?(): Promise<TransactionFeeEstimate>;
}

// ============================================================================
// 1. Transaction-Count & Dynamic Funding Models (Repair 2)
// ============================================================================

export interface ScenarioTransactionPlan {
  // Challenger counts
  challengeBondTransactionCount: bigint;
  challengerCleanupWithdrawalCount: bigint;
  challengerSweepTransactionCount: bigint;
  challengerSignedTransactionCount: bigint;

  // Issuer counts
  primaryIssuerSignedTransactionCount: bigint;
  issuerCleanupWithdrawalCount: bigint;
  issuerSignedTransactionCount: bigint;

  // Expected recoverable credits in disposable contracts
  expectedChallengerRecoverableCreditsWei: bigint;
  expectedIssuerRecoverableCreditsWei: bigint;
  expectedTotalContractCreditsWei: bigint;
}

/**
 * Derives the complete scenario transaction plan directly from scenario specifications
 * and expected terminal outcomes.
 *
 * Credit and withdrawal rules in disposable contracts (treasury == issuer):
 * - BREACHED (Scenarios 1..4):
 *   - Challenger payout: challenger bond (0.005 GEN refund) + 90% issuer bond (0.009 GEN) = 0.014 GEN
 *   - Treasury (issuer) payout: 10% issuer bond = 0.001 GEN
 *   - Both parties have positive credit to withdraw.
 * - UPHELD (Scenario 5):
 *   - Issuer payout: issuer bond refund (0.010 GEN) + forfeited challenger bond (0.005 GEN) = 0.015 GEN
 *   - Challenger payout: 0 GEN (no credit, no challenger withdrawal).
 *   - Issuer has positive credit to withdraw.
 * - INCONCLUSIVE (Scenarios 6..7):
 *   - Challenger refund: 0.005 GEN
 *   - Issuer refund: 0.010 GEN
 *   - Both parties have positive credit to withdraw.
 * - CANCELLED (Scenario 8):
 *   - Issuer cancels and withdraws credit within Scenario 8; credit is 0 at scenario completion.
 */
export function deriveScenarioTransactionPlan(
  specs: ScenarioCallSpec[],
  includeCleanup: boolean = true,
  bonds = {
    issuerBond: 10000000000000000n, // 0.01 GEN
    challengerBond: 5000000000000000n, // 0.005 GEN
    treasuryBps: 1000n, // 10.00%
  }
): ScenarioTransactionPlan {
  let challengeBondCount = 0n;
  let challengerWithdrawCount = 0n;
  let issuerWithdrawCount = 0n;
  let expectedChallengerCredits = 0n;
  let expectedIssuerCredits = 0n;

  for (const s of specs) {
    if (s.challengeType !== undefined && s.challengeType !== null) {
      challengeBondCount += 1n;

      if (includeCleanup) {
        if (s.expectedFinalStatus === "BREACHED") {
          const treasuryShare = (bonds.issuerBond * bonds.treasuryBps) / 10000n;
          const challengerShare = bonds.challengerBond + (bonds.issuerBond - treasuryShare);
          expectedChallengerCredits += challengerShare;
          expectedIssuerCredits += treasuryShare;
          challengerWithdrawCount += 1n;
          issuerWithdrawCount += 1n;
        } else if (s.expectedFinalStatus === "UPHELD") {
          expectedIssuerCredits += bonds.issuerBond + bonds.challengerBond;
          issuerWithdrawCount += 1n;
        } else if (s.expectedFinalStatus === "INCONCLUSIVE") {
          expectedChallengerCredits += bonds.challengerBond;
          expectedIssuerCredits += bonds.issuerBond;
          challengerWithdrawCount += 1n;
          issuerWithdrawCount += 1n;
        }
      }
    }
  }

  const sweepCount = includeCleanup && challengeBondCount > 0n ? 1n : 0n;
  const challengerSignedCount = challengeBondCount + challengerWithdrawCount + sweepCount;

  // Primary issuer non-deploy transactions:
  // For each scenario: publish_epoch (1)
  // For scenarios with challenge: resolve_challenge (1), except Scenario 7 has 2 resolves (1 success + 1 expected revert)
  // For Scenario 8 (no challenge): cancel_epoch (1), withdraw_credit (2: 1 success + 1 expected revert)
  let primaryIssuerTxCount = 0n;
  for (const s of specs) {
    primaryIssuerTxCount += 1n; // publish_epoch
    if (s.challengeType !== undefined && s.challengeType !== null) {
      if (s.scenarioId === 7) {
        primaryIssuerTxCount += 2n;
      } else {
        primaryIssuerTxCount += 1n;
      }
    } else if (s.scenarioId === 8) {
      primaryIssuerTxCount += 3n; // 1 cancel + 2 withdraw attempts
    }
  }

  const issuerSignedCount = primaryIssuerTxCount + (includeCleanup ? issuerWithdrawCount : 0n);

  return {
    challengeBondTransactionCount: challengeBondCount,
    challengerCleanupWithdrawalCount: includeCleanup ? challengerWithdrawCount : 0n,
    challengerSweepTransactionCount: sweepCount,
    challengerSignedTransactionCount: challengerSignedCount,
    primaryIssuerSignedTransactionCount: primaryIssuerTxCount,
    issuerCleanupWithdrawalCount: includeCleanup ? issuerWithdrawCount : 0n,
    issuerSignedTransactionCount: issuerSignedCount,
    expectedChallengerRecoverableCreditsWei: includeCleanup ? expectedChallengerCredits : 0n,
    expectedIssuerRecoverableCreditsWei: includeCleanup ? expectedIssuerCredits : 0n,
    expectedTotalContractCreditsWei: includeCleanup ? expectedChallengerCredits + expectedIssuerCredits : 0n,
  };
}

/**
 * Derives the exact number of challenger-signed challenge transactions from scenario specs.
 */
export function deriveChallengerTransactionCount(specs: ScenarioCallSpec[]): number {
  return Number(deriveScenarioTransactionPlan(specs, false).challengeBondTransactionCount);
}

/**
 * Derives the total number of challenger-signed transactions including cleanup withdrawals and sweep.
 */
export function deriveTotalChallengerTransactionCount(
  specs: ScenarioCallSpec[],
  includeCleanup: boolean = true
): number {
  return Number(deriveScenarioTransactionPlan(specs, includeCleanup).challengerSignedTransactionCount);
}

export interface ChallengerFundingParams {
  challengeBondTransactionCount?: bigint;
  challengerSignedTransactionCount?: bigint;
  challengerBond?: bigint;
  estimatedFeePerTx: bigint;
  safetyMargin?: bigint;
  // Backward-compatible aliases
  challengerTxCount?: bigint;
  bondPerTx?: bigint;
}

/**
 * Calculates the required challenger funding without hardcoded bond multipliers:
 * challenge bonds = challengeBondTransactionCount * challengerBond
 * challenger fees = challengerSignedTransactionCount * estimatedFeePerTx
 * required_funding = challenge bonds + challenger fees + safetyMargin
 */
export function calculateRequiredChallengerFunding(params: ChallengerFundingParams): bigint {
  const challengeBondTransactionCount = params.challengeBondTransactionCount !== undefined
    ? params.challengeBondTransactionCount
    : (params.challengerTxCount !== undefined ? params.challengerTxCount : 0n);

  const challengerSignedTransactionCount = params.challengerSignedTransactionCount !== undefined
    ? params.challengerSignedTransactionCount
    : (params.challengerTxCount !== undefined ? params.challengerTxCount : challengeBondTransactionCount);

  const challengerBond = params.challengerBond !== undefined
    ? params.challengerBond
    : (params.bondPerTx !== undefined ? params.bondPerTx : 0n);

  const estimatedFeePerTx = params.estimatedFeePerTx;

  if (challengeBondTransactionCount < 0n) {
    throw new RangeError("challengeBondTransactionCount cannot be negative");
  }
  if (challengerSignedTransactionCount < 0n) {
    throw new RangeError("challengerSignedTransactionCount cannot be negative");
  }
  if (challengerBond < 0n) {
    throw new RangeError("challengerBond cannot be negative");
  }
  if (estimatedFeePerTx < 0n) {
    throw new RangeError("estimatedFeePerTx cannot be negative");
  }

  if (challengeBondTransactionCount === 0n && challengerSignedTransactionCount === 0n) {
    return 0n;
  }

  const challengeBonds = challengeBondTransactionCount * challengerBond;
  const challengerFees = challengerSignedTransactionCount * estimatedFeePerTx;

  const safetyMargin = params.safetyMargin !== undefined
    ? params.safetyMargin
    : (challengerFees * 20n) / 100n + 5000000000000000n; // 0.005 GEN

  if (safetyMargin < 0n) {
    throw new RangeError("safetyMargin cannot be negative");
  }

  return challengeBonds + challengerFees + safetyMargin;
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
// 2. Authoritative SDK Status Normalization (Repair 1)
// ============================================================================

/**
 * Normalizes consensus status from receipt using authoritative SDK mappings.
 * SDK authoritative mapping:
 * - 5 = ACCEPTED
 * - 7 = FINALIZED
 * - 1 = PENDING
 * - 8 = CANCELED
 * Rejects pending, unknown, canceled, or malformed statuses fail-closed.
 */
export function normalizeConsensusStatus(rawStatus: unknown): string {
  if (rawStatus === null || rawStatus === undefined) {
    return "UNKNOWN";
  }
  if (typeof rawStatus === "number") {
    const name = (transactionsStatusNumberToName as Record<number, string>)[rawStatus];
    return name || "UNKNOWN";
  }
  if (typeof rawStatus === "string") {
    const trimmed = rawStatus.trim();
    if (trimmed === "") {
      return "UNKNOWN";
    }
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && (transactionsStatusNumberToName as Record<number, string>)[asNum] !== undefined) {
      return (transactionsStatusNumberToName as Record<number, string>)[asNum];
    }
    const upper = trimmed.toUpperCase();
    if (upper in TransactionStatus) {
      return upper;
    }
  }
  return "UNKNOWN";
}

/**
 * Normalizes execution result name from receipt using authoritative SDK mappings.
 * SDK authoritative mapping:
 * - 1 = FINISHED_WITH_RETURN
 * - 2 = FINISHED_WITH_ERROR
 * - 3 = TIMEOUT
 * - 4 = NONDET_DISAGREE
 */
export function normalizeExecutionResult(rawResult: unknown): string {
  if (rawResult === null || rawResult === undefined) {
    return "UNKNOWN";
  }
  if (typeof rawResult === "number") {
    const name = (executionResultNumberToName as Record<number, string>)[rawResult];
    return name || "UNKNOWN";
  }
  if (typeof rawResult === "string") {
    const trimmed = rawResult.trim();
    if (trimmed === "") {
      return "UNKNOWN";
    }
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && (executionResultNumberToName as Record<number, string>)[asNum] !== undefined) {
      return (executionResultNumberToName as Record<number, string>)[asNum];
    }
    const upper = trimmed.toUpperCase();
    if (upper in ExecutionResult) {
      return upper;
    }
  }
  return "UNKNOWN";
}

// ============================================================================
// 3. Structured Contract Execution Error & Receipt Extraction
// ============================================================================

/**
 * Structured error thrown when an on-chain transaction receipt indicates FINISHED_WITH_ERROR.
 * Retains complete receipt and execution metadata to prove the revert occurred on-chain.
 */
export class ContractExecutionReceiptError extends Error {
  public readonly transactionHash: Hash | string;
  public readonly methodName: string;
  public readonly receipt: GenLayerReceiptLike | unknown;
  public readonly consensusStatus: string;
  public readonly executionResult: string;
  public readonly contractErrorPayload: string;

  constructor(params: {
    transactionHash: Hash | string;
    methodName: string;
    receipt: GenLayerReceiptLike | unknown;
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
 * Inspects documented receipt and consensus structure fields only without 'any'.
 */
export function extractContractErrorPayload(receipt: unknown, fallbackMessage?: string): string {
  if (!receipt || typeof receipt !== "object") {
    return fallbackMessage || "";
  }

  const rec = receipt as Record<string, unknown>;

  // 1. Decoded receipt.result
  if (typeof rec.result === "string" && rec.result.length > 0) {
    return rec.result;
  }
  if (rec.result && typeof rec.result === "object") {
    const resObj = rec.result as Record<string, unknown>;
    if (typeof resObj.payload === "string" && resObj.payload.length > 0) {
      return resObj.payload;
    }
  }

  // 2. Consensus leader receipt data
  if (rec.consensus_data && typeof rec.consensus_data === "object") {
    const cd = rec.consensus_data as Record<string, unknown>;
    const leaderReceipt = cd.leader_receipt;
    if (leaderReceipt) {
      const list = Array.isArray(leaderReceipt) ? leaderReceipt : [leaderReceipt];
      for (const item of list) {
        if (item && typeof item === "object") {
          const lr = item as Record<string, unknown>;
          if (typeof lr.result === "string" && lr.result.length > 0) {
            return lr.result;
          }
          if (lr.result && typeof lr.result === "object") {
            const lrRes = lr.result as Record<string, unknown>;
            if (typeof lrRes.payload === "string" && lrRes.payload.length > 0) {
              return lrRes.payload;
            }
          }
          if (typeof lr.genvm_result === "string" && lr.genvm_result.length > 0) {
            return lr.genvm_result;
          }
        }
      }
    }
  }

  // 3. Documented receipt error message fields
  if (typeof rec.errorMessage === "string" && rec.errorMessage.length > 0) {
    return rec.errorMessage;
  }
  if (typeof rec.error === "string" && rec.error.length > 0) {
    return rec.error;
  }
  if (typeof rec.contractErrorPayload === "string" && rec.contractErrorPayload.length > 0) {
    return rec.contractErrorPayload;
  }

  return fallbackMessage || "";
}

export interface ValidatedReceiptSummary {
  txHash: string;
  status: string;
  executionResult: string;
  contractAddress?: string;
  rawReceipt: unknown;
}

/**
 * Structured write operation error preserving transaction hash and raw receipt
 * when submission succeeds but receipt retrieval or verification fails.
 */
export class WriteOperationError extends Error {
  public readonly transactionHash?: string;
  public readonly rawReceipt?: unknown;
  public readonly normalizedStatus?: string;
  public readonly normalizedExecutionResult?: string;
  public readonly originalError?: unknown;

  constructor(params: {
    message: string;
    transactionHash?: string;
    rawReceipt?: unknown;
    normalizedStatus?: string;
    normalizedExecutionResult?: string;
    originalError?: unknown;
  }) {
    super(params.message);
    this.name = "WriteOperationError";
    this.transactionHash = params.transactionHash;
    this.rawReceipt = params.rawReceipt;
    this.normalizedStatus = params.normalizedStatus;
    this.normalizedExecutionResult = params.normalizedExecutionResult;
    this.originalError = params.originalError;
    Object.setPrototypeOf(this, WriteOperationError.prototype);
  }
}

/**
 * Verifies that a transaction receipt finalized cleanly with execution result FINISHED_WITH_RETURN.
 * Rejects pending, unknown, canceled, or FINISHED_WITH_ERROR receipts.
 * When receipt contains FINISHED_WITH_ERROR, throws structured ContractExecutionReceiptError.
 */
export function verifyReceiptExecution(
  receipt: unknown,
  context: string,
  methodName?: string
): ValidatedReceiptSummary {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Receipt verification failed for ${context}: receipt is missing or malformed`);
  }

  const rec = receipt as Record<string, unknown>;
  const txHash = String(rec.hash || rec.transactionHash || "");
  if (!txHash || txHash.trim().length === 0) {
    throw new Error(`Receipt verification failed for ${context}: missing transaction hash`);
  }

  const statusName = normalizeConsensusStatus(
    rec.statusName !== undefined ? rec.statusName : rec.status
  );

  const isAcceptedOrFinalized = statusName === "FINALIZED" || statusName === "ACCEPTED";
  if (!isAcceptedOrFinalized) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): expected FINALIZED or ACCEPTED consensus status, got '${statusName}'`
    );
  }

  const executionResult = normalizeExecutionResult(
    rec.txExecutionResultName !== undefined ? rec.txExecutionResultName : rec.txExecutionResult
  );

  if (executionResult === "FINISHED_WITH_ERROR") {
    const errorPayload = extractContractErrorPayload(receipt);
    throw new ContractExecutionReceiptError({
      transactionHash: txHash,
      methodName: methodName || context,
      receipt: receipt as GenLayerReceiptLike,
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

  if (!isSuccessful(receipt as unknown as Parameters<typeof isSuccessful>[0])) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): isSuccessful(receipt) returned false`
    );
  }

  const contractAddress = (rec.contractAddress || rec.recipient) as string | undefined;

  return {
    txHash,
    status: statusName,
    executionResult,
    contractAddress,
    rawReceipt: receipt,
  };
}

// ============================================================================
// 3b. Dedicated Native Value Transfer Verification (Repair: Phase 1)
// ============================================================================

export interface VerifyNativeTransferOptions {
  receipt: unknown;
  context: string;
  expectedHash?: string;
  expectedSender?: string;
  expectedRecipient?: string;
  requestedAmountWei: bigint;
  preBalanceWei: bigint;
  postBalanceWei: bigint;
}

export interface ValidatedNativeTransferSummary {
  txHash: string;
  status: string;
  executionResult: string;
  sender?: string;
  recipient?: string;
  requestedAmountWei: bigint;
  balanceDeltaWei: bigint;
  preBalanceWei: bigint;
  postBalanceWei: bigint;
  receiptValueExact: boolean;
  valueCredited?: boolean;
  rawReceipt: unknown;
}

/**
 * Purpose-built native transfer verifier for EOA value transfers (funding and sweeps).
 * Does not reuse contract-call success semantics (does NOT require FINISHED_WITH_RETURN).
 *
 * Verifies:
 * 1. Receipt is a non-null object.
 * 2. Nonempty transaction hash matching expected hash (if provided).
 * 3. Consensus status is ACCEPTED or FINALIZED.
 * 4. EVM receipt status is not failure (rejects 0 / "0x0" / false).
 * 5. txExecutionResult is NOT_VOTED or absent for native transfer.
 * 6. FINISHED_WITH_ERROR is always rejected.
 * 7. value_credited is strictly true when present.
 * 8. Sender matches expected sender (case-insensitive).
 * 9. Recipient matches expected recipient (case-insensitive).
 * 10. contractAddress is null or absent.
 * 11. Recipient balance delta proves intended transfer amount (postBalance - preBalance >= requestedAmountWei).
 * 12. Requested amount is a bigint.
 * 13. All wei arithmetic uses bigint.
 * 14. If receipt.value arrives as an unsafe JS number (> MAX_SAFE_INTEGER), it is marked
 *     receiptValueExact = false and not used as exact evidence; exact balance delta is used instead.
 * 15. If receipt.value is string, bigint, or safe integer, it is compared exactly against requestedAmountWei.
 * 16. Missing hashes, wrong addresses, failed status, false value_credited, or insufficient delta fail closed.
 */
export function verifyNativeTransferReceipt(
  options: VerifyNativeTransferOptions
): ValidatedNativeTransferSummary {
  const {
    receipt,
    context,
    expectedHash,
    expectedSender,
    expectedRecipient,
    requestedAmountWei,
    preBalanceWei,
    postBalanceWei,
  } = options;

  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Receipt verification failed for ${context}: receipt is missing or malformed`);
  }

  if (typeof requestedAmountWei !== "bigint") {
    throw new TypeError(`Receipt verification failed for ${context}: requestedAmountWei must be a bigint`);
  }
  if (requestedAmountWei <= 0n) {
    throw new RangeError(`Receipt verification failed for ${context}: requestedAmountWei must be positive`);
  }
  if (typeof preBalanceWei !== "bigint" || typeof postBalanceWei !== "bigint") {
    throw new TypeError(`Receipt verification failed for ${context}: preBalanceWei and postBalanceWei must be bigint`);
  }

  const rec = receipt as Record<string, unknown>;

  // 1. Transaction hash
  const txHash = String(rec.hash || rec.transactionHash || "").trim();
  if (!txHash) {
    throw new Error(`Receipt verification failed for ${context}: missing transaction hash`);
  }
  if (expectedHash && expectedHash.trim().toLowerCase() !== txHash.toLowerCase()) {
    throw new Error(
      `Receipt verification failed for ${context}: transaction hash mismatch: expected '${expectedHash}', got '${txHash}'`
    );
  }

  // 2. EVM receipt status check (reject failed EVM status)
  const evmStatus = rec.evmStatus !== undefined ? rec.evmStatus : rec.evm_status;
  if (evmStatus !== undefined && (evmStatus === 0 || evmStatus === "0x0" || evmStatus === "0" || evmStatus === false)) {
    throw new Error(`Receipt verification failed for ${context} (tx ${txHash}): EVM receipt status indicates failure`);
  }
  if (rec.status === 0 || rec.status === "0x0" || rec.status === "0") {
    throw new Error(`Receipt verification failed for ${context} (tx ${txHash}): receipt status indicates failure (status=0)`);
  }

  // 3. Consensus status (FINALIZED or ACCEPTED)
  const rawStatus =
    rec.statusName !== undefined
      ? rec.statusName
      : rec.status_name !== undefined
      ? rec.status_name
      : rec.status;
  const statusName = normalizeConsensusStatus(rawStatus);
  if (statusName !== "FINALIZED" && statusName !== "ACCEPTED") {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): expected FINALIZED or ACCEPTED consensus status, got '${statusName}'`
    );
  }

  // 4. Execution result (NOT_VOTED or absent for native transfer; FINISHED_WITH_ERROR rejected)
  const rawExec =
    rec.txExecutionResultName !== undefined
      ? rec.txExecutionResultName
      : rec.txExecutionResult;
  let executionResult = "NOT_VOTED";
  if (rawExec !== undefined && rawExec !== null) {
    executionResult = normalizeExecutionResult(rawExec);
  }
  if (executionResult === "FINISHED_WITH_ERROR") {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): native transfer failed with FINISHED_WITH_ERROR`
    );
  }
  if (executionResult !== "NOT_VOTED" && executionResult !== "UNKNOWN") {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): unexpected executionResult='${executionResult}' for native transfer (expected NOT_VOTED or absent)`
    );
  }

  // 5. value_credited strictly true when present
  if (rec.value_credited !== undefined) {
    if (rec.value_credited !== true) {
      throw new Error(
        `Receipt verification failed for ${context} (tx ${txHash}): value_credited is not true (got '${String(rec.value_credited)}')`
      );
    }
  }

  // 6. Sender matching
  const actualSender = (rec.from || rec.from_address || rec.sender) as string | undefined;
  if (expectedSender && actualSender) {
    if (actualSender.toLowerCase() !== expectedSender.toLowerCase()) {
      throw new Error(
        `Receipt verification failed for ${context} (tx ${txHash}): sender mismatch: expected '${expectedSender}', got '${actualSender}'`
      );
    }
  }

  // 7. Recipient matching
  const actualRecipient = (rec.to || rec.to_address || rec.recipient) as string | undefined;
  if (expectedRecipient && actualRecipient) {
    if (actualRecipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      throw new Error(
        `Receipt verification failed for ${context} (tx ${txHash}): recipient mismatch: expected '${expectedRecipient}', got '${actualRecipient}'`
      );
    }
  }

  // 8. contractAddress must be null or absent
  const contractAddress = rec.contractAddress || rec.contract_address;
  if (
    contractAddress !== undefined &&
    contractAddress !== null &&
    String(contractAddress).trim() !== "" &&
    String(contractAddress).trim() !== "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): contractAddress must be null or absent for native transfer, got '${contractAddress}'`
    );
  }

  // 9. Recipient balance delta verification
  const balanceDeltaWei = postBalanceWei - preBalanceWei;
  if (balanceDeltaWei < requestedAmountWei) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): recipient balance delta (${balanceDeltaWei.toString()} wei) is less than requested amount (${requestedAmountWei.toString()} wei)`
    );
  }

  // 10. Receipt value verification with IEEE-754 precision safety
  let receiptValueExact = false;
  if (rec.value !== undefined && rec.value !== null) {
    if (typeof rec.value === "number") {
      if (Number.isSafeInteger(rec.value)) {
        const valBigInt = BigInt(rec.value);
        if (valBigInt !== requestedAmountWei) {
          throw new Error(
            `Receipt verification failed for ${context} (tx ${txHash}): receipt value (${valBigInt.toString()} wei) does not match requested amount (${requestedAmountWei.toString()} wei)`
          );
        }
        receiptValueExact = true;
      } else {
        // Unsafe JS number (> Number.MAX_SAFE_INTEGER).
        // Do NOT convert to fake exact BigInt; mark unsafe and rely on exact balanceDelta.
        receiptValueExact = false;
      }
    } else if (typeof rec.value === "bigint") {
      if (rec.value === requestedAmountWei) {
        receiptValueExact = true;
      } else if (
        requestedAmountWei > BigInt(Number.MAX_SAFE_INTEGER) &&
        (rec.value === BigInt(Math.floor(Number(requestedAmountWei))) ||
          rec.value === BigInt(Math.round(Number(requestedAmountWei))) ||
          Math.abs(Number(rec.value - requestedAmountWei)) <= 256)
      ) {
        // rec.value arrived as a BigInt formatted from an unsafe JS number (> MAX_SAFE_INTEGER),
        // exhibiting the observed IEEE-754 float precision loss (e.g. 89 wei difference).
        // Do not compare it as exact evidence; mark unsafe and rely on exact balanceDelta.
        receiptValueExact = false;
      } else {
        throw new Error(
          `Receipt verification failed for ${context} (tx ${txHash}): receipt value (${rec.value.toString()} wei) does not match requested amount (${requestedAmountWei.toString()} wei)`
        );
      }
    } else if (typeof rec.value === "string") {
      const trimmed = rec.value.trim();
      let valBigInt: bigint;
      try {
        valBigInt = BigInt(trimmed);
      } catch {
        throw new Error(
          `Receipt verification failed for ${context} (tx ${txHash}): invalid string value in receipt: '${trimmed}'`
        );
      }
      if (valBigInt === requestedAmountWei) {
        receiptValueExact = true;
      } else if (
        requestedAmountWei > BigInt(Number.MAX_SAFE_INTEGER) &&
        (valBigInt === BigInt(Math.floor(Number(requestedAmountWei))) ||
          valBigInt === BigInt(Math.round(Number(requestedAmountWei))) ||
          Math.abs(Number(valBigInt - requestedAmountWei)) <= 256)
      ) {
        // String represents float-rounded representation
        receiptValueExact = false;
      } else {
        throw new Error(
          `Receipt verification failed for ${context} (tx ${txHash}): receipt string value (${valBigInt.toString()} wei) does not match requested amount (${requestedAmountWei.toString()} wei)`
        );
      }
    }
  }

  return {
    txHash,
    status: statusName,
    executionResult,
    sender: actualSender,
    recipient: actualRecipient,
    requestedAmountWei,
    balanceDeltaWei,
    preBalanceWei,
    postBalanceWei,
    receiptValueExact,
    valueCredited: rec.value_credited as boolean | undefined,
    rawReceipt: receipt,
  };
}

// ============================================================================
// 4. Expected Contract Execution Error Classification
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
 */
export async function expectContractExecutionError(
  action: () => Promise<unknown>,
  options: ExpectedContractErrorOptions
): Promise<{ txHash: string; errorName: string; message: string; receipt: unknown }> {
  if (!options.expectedErrorSubstring || options.expectedErrorSubstring.trim().length === 0) {
    throw new Error("expectedErrorSubstring is required for contract execution error validation");
  }

  let actionResult: unknown = null;
  let actionThrew = false;
  let capturedError: unknown = null;

  try {
    actionResult = await action();
  } catch (err: unknown) {
    actionThrew = true;
    capturedError = err;
  }

  let receipt: unknown = null;
  let txHash = "";
  let status = "";
  let execResult = "";
  let recordedMethod = options.expectedMethod;
  let contractPayload = "";

  if (!actionThrew) {
    if (!actionResult || typeof actionResult !== "object") {
      throw new Error(
        `Expected contract execution error on '${options.expectedMethod}', but call returned unexpected value without receipt`
      );
    }
    const recObj = actionResult as Record<string, unknown>;
    receipt = actionResult;
    txHash = String(recObj.hash || recObj.transactionHash || "");
    status = normalizeConsensusStatus(
      recObj.statusName !== undefined
        ? recObj.statusName
        : recObj.receiptStatus !== undefined
        ? recObj.receiptStatus
        : recObj.status
    );
    execResult = normalizeExecutionResult(
      recObj.txExecutionResultName !== undefined
        ? recObj.txExecutionResultName
        : recObj.executionResult !== undefined
        ? recObj.executionResult
        : recObj.txExecutionResult
    );
    if (typeof recObj.methodName === "string" && recObj.methodName.length > 0) {
      recordedMethod = recObj.methodName;
    }
    contractPayload = extractContractErrorPayload(receipt);
  } else {
    if (capturedError instanceof ContractExecutionReceiptError) {
      receipt = capturedError.receipt;
      txHash = capturedError.transactionHash;
      status = capturedError.consensusStatus;
      execResult = capturedError.executionResult;
      recordedMethod = capturedError.methodName;
      contractPayload = capturedError.contractErrorPayload;
    } else if (
      capturedError &&
      typeof capturedError === "object" &&
      "receipt" in capturedError &&
      typeof (capturedError as Record<string, unknown>).receipt === "object"
    ) {
      const errObj = capturedError as Record<string, unknown>;
      const recObj = errObj.receipt as Record<string, unknown>;
      receipt = recObj;
      txHash = String(recObj.hash || recObj.transactionHash || errObj.txHash || errObj.transactionHash || "");
      status = normalizeConsensusStatus(recObj.statusName !== undefined ? recObj.statusName : recObj.status);
      execResult = normalizeExecutionResult(recObj.txExecutionResultName !== undefined ? recObj.txExecutionResultName : recObj.txExecutionResult);
      if (typeof errObj.methodName === "string" && errObj.methodName.length > 0) {
        recordedMethod = errObj.methodName;
      }
      const msg = capturedError instanceof Error ? capturedError.message : String(capturedError);
      contractPayload = extractContractErrorPayload(receipt, msg);
    } else {
      const msg = capturedError instanceof Error ? capturedError.message : String(capturedError);
      throw new Error(
        `Rejected generic/unstructured error on '${options.expectedMethod}' without on-chain receipt: ${msg}`
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

  // 4. Execution result must be strictly FINISHED_WITH_ERROR
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
// 5. Typed Challenger Funding Execution (Repair 7)
// ============================================================================

export interface ExecuteFundingOptions {
  issuerClient: SupportedFundingClient;
  issuerAccount: Account;
  challengerAddress: Address;
  fundingAmount: bigint;
  requiredPostBalance: bigint;
}

export interface ChallengerFundingResult {
  fundTxHash: string;
  preBalance: bigint;
  postBalance: bigint;
  balanceDelta: bigint;
  requestedAmount: bigint;
  expectedSender: Address;
  expectedRecipient: Address;
  rawReceipt: unknown;
  nativeTransferSummary: ValidatedNativeTransferSummary;
}

/**
 * Executes challenger funding using the strictly typed GenLayer client interface.
 * Halts closed with BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API if sendTransaction is unavailable.
 * Verifies funding via verifyNativeTransferReceipt using native transfer semantics (NOT_VOTED).
 */
export async function executeAndVerifyChallengerFunding(
  options: ExecuteFundingOptions
): Promise<ChallengerFundingResult> {
  const { issuerClient, issuerAccount, challengerAddress, fundingAmount, requiredPostBalance } = options;

  if (!issuerClient || typeof issuerClient.sendTransaction !== "function") {
    throw new Error(
      "BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API: issuerClient.sendTransaction is not available on client interface"
    );
  }

  const preBalance = await issuerClient.getBalance({ address: challengerAddress });
  console.log(`[funding] Pre-funding challenger balance: ${preBalance.toString()} wei`);
  console.log(`[funding] Submitting challenger funding: ${fundingAmount.toString()} wei to ${challengerAddress}`);

  const fundTxHash = await issuerClient.sendTransaction({
    account: issuerAccount,
    to: challengerAddress,
    value: fundingAmount,
    chain: null,
  });

  const receipt = await issuerClient.waitForTransactionReceipt({ hash: fundTxHash });

  const postBalance = await issuerClient.getBalance({ address: challengerAddress });
  console.log(`[funding] Verified challenger post-funding balance: ${postBalance.toString()} wei`);

  const summary = verifyNativeTransferReceipt({
    receipt,
    context: "challenger funding transaction",
    expectedHash: String(fundTxHash),
    expectedSender: issuerAccount.address,
    expectedRecipient: challengerAddress,
    requestedAmountWei: fundingAmount,
    preBalanceWei: preBalance,
    postBalanceWei: postBalance,
  });

  if (postBalance < requiredPostBalance) {
    throw new Error(
      `Challenger post-funding balance (${postBalance.toString()} wei) is below required minimum (${requiredPostBalance.toString()} wei).`
    );
  }

  const balanceDelta = postBalance - preBalance;

  return {
    fundTxHash: String(fundTxHash),
    preBalance,
    postBalance,
    balanceDelta,
    requestedAmount: fundingAmount,
    expectedSender: issuerAccount.address,
    expectedRecipient: challengerAddress,
    rawReceipt: receipt,
    nativeTransferSummary: summary,
  };
}

// ============================================================================
// 6. Economic Cleanup, 13-Target Manifest & Readiness Evaluation
// ============================================================================

export interface ExecWriteResult {
  transactionHash: Hash;
  receiptStatus: string;
  executionResult: string;
  receiptSummary: ValidatedReceiptSummary;
}

export interface ExpectedCleanupTarget {
  scenarioId: number;
  contractAddress: Address;
  party: "challenger" | "issuer";
  expectedCreditWei: bigint;
}

/**
 * Constructs the exact expected cleanup manifest containing one entry per expected positive credit:
 * - Challenger: scenarios 1, 2, 3, 4, 6, 7 (6 entries)
 * - Issuer/treasury: scenarios 1, 2, 3, 4, 5, 6, 7 (7 entries)
 * - Total: 13 unique party/contract targets.
 */
export function buildExpectedCleanupManifest(
  scenarioRecords: { scenarioId: number; contractAddress: Address }[],
  specs: ScenarioCallSpec[],
  bonds = {
    issuerBond: 10000000000000000n, // 0.01 GEN
    challengerBond: 5000000000000000n, // 0.005 GEN
    treasuryBps: 1000n, // 10.00%
  }
): ExpectedCleanupTarget[] {
  const manifest: ExpectedCleanupTarget[] = [];
  const specMap = new Map<number, ScenarioCallSpec>(specs.map((s) => [s.scenarioId, s]));

  for (const record of scenarioRecords) {
    const spec = specMap.get(record.scenarioId);
    if (!spec) {
      continue;
    }
    const contractAddress = record.contractAddress;
    const finalStatus = spec.expectedFinalStatus;

    if (finalStatus === "BREACHED") {
      const treasuryShare = (bonds.issuerBond * bonds.treasuryBps) / 10000n; // 0.001 GEN
      const challengerShare = bonds.challengerBond + (bonds.issuerBond - treasuryShare); // 0.014 GEN

      manifest.push({
        scenarioId: record.scenarioId,
        contractAddress,
        party: "challenger",
        expectedCreditWei: challengerShare,
      });
      manifest.push({
        scenarioId: record.scenarioId,
        contractAddress,
        party: "issuer",
        expectedCreditWei: treasuryShare,
      });
    } else if (finalStatus === "UPHELD") {
      const issuerPayout = bonds.issuerBond + bonds.challengerBond; // 0.015 GEN
      manifest.push({
        scenarioId: record.scenarioId,
        contractAddress,
        party: "issuer",
        expectedCreditWei: issuerPayout,
      });
    } else if (finalStatus === "INCONCLUSIVE") {
      manifest.push({
        scenarioId: record.scenarioId,
        contractAddress,
        party: "challenger",
        expectedCreditWei: bonds.challengerBond, // 0.005 GEN
      });
      manifest.push({
        scenarioId: record.scenarioId,
        contractAddress,
        party: "issuer",
        expectedCreditWei: bonds.issuerBond, // 0.010 GEN
      });
    }
    // CANCELLED (scenario 8): Issuer withdraws credit inside scenario; remaining credit is 0.
  }

  return manifest;
}

export type CleanupRecordStatus =
  | "WITHDRAWN"
  | "QUERY_FAILED"
  | "WITHDRAW_FAILED"
  | "POSTCHECK_FAILED"
  | "INVARIANT_FAILED";

export interface CleanupPartyResult {
  scenarioId: number;
  contractAddress: Address;
  party: "challenger" | "issuer";
  status: CleanupRecordStatus;
  expectedCredit: bigint;
  observedCredit?: bigint;
  transactionHash?: Hash | string;
  receiptStatus?: string;
  executionResult?: string;
  receiptSummary?: ValidatedReceiptSummary;
  postWithdrawalCredit?: bigint;
  accountingInvariantSatisfied?: boolean;
  error?: string;
}

export type SweepDisposition =
  | "COMPLETED"
  | "NOT_REQUIRED_ZERO_BALANCE"
  | "BLOCKED_INSUFFICIENT_FEE"
  | "FAILED";

export interface SweepResultRecord {
  disposition: SweepDisposition;
  preSweepBalanceWei?: bigint;
  estimatedFeeWei?: bigint;
  attemptedSweepAmountWei?: bigint;
  sweepTransactionHash?: Hash | string;
  receiptStatus?: string;
  executionResult?: string;
  receiptSummary?: ValidatedReceiptSummary | ValidatedNativeTransferSummary;
  nativeTransferSummary?: ValidatedNativeTransferSummary;
  postSweepObservedResidualBalanceWei?: bigint;
  issuerPreSweepBalanceWei?: bigint;
  issuerPostSweepBalanceWei?: bigint;
  error?: string;
}

export type PrimaryScenariosStatus = "PRIMARY_SCENARIOS_PASS" | "PRIMARY_SCENARIOS_FAIL";
export type EconomicCleanupStatus = "ECONOMIC_CLEANUP_PASS" | "ECONOMIC_CLEANUP_PARTIAL" | "ECONOMIC_CLEANUP_FAIL";
export type LiveReadinessStatus = "LIVE_READINESS_PASS" | "LIVE_READINESS_BLOCKED";

export interface EvaluateCleanupOptions {
  cleanupRecords: CleanupPartyResult[];
  expectedTargets: ExpectedCleanupTarget[];
  expectedPlan: ScenarioTransactionPlan;
  primaryScenariosStatus: PrimaryScenariosStatus;
  sweepRecord?: SweepResultRecord;
}

export interface EconomicCleanupReport {
  primaryScenariosStatus: PrimaryScenariosStatus;
  status: EconomicCleanupStatus;
  liveReadinessStatus: LiveReadinessStatus;
  records: CleanupPartyResult[];
  expectedTargets: ExpectedCleanupTarget[];
  totalChallengerCreditsWithdrawnWei: bigint;
  totalIssuerCreditsWithdrawnWei: bigint;
  totalContractCreditsWithdrawnWei: bigint;
  expectedChallengerCreditsWei: bigint;
  expectedIssuerCreditsWei: bigint;
  expectedTotalContractCreditsWei: bigint;
  sweepRecord?: SweepResultRecord;
  unresolvedCreditsWei: bigint;
  unresolvedContractAddresses: Address[];
}

/**
 * Computes composite lookup key for expected cleanup target or record.
 */
export function getCleanupTargetKey(scenarioId: number, party: string, contractAddress: string): string {
  return `${scenarioId}:${party}:${contractAddress.toLowerCase()}`;
}

/**
 * Pure evaluation function assessing economic cleanup completeness and combined live readiness.
 *
 * Strict manifest rules:
 * 1. Every expected target in the manifest must appear exactly once.
 * 2. Manifest internal parity against expectedPlan:
 *    - unique entries
 *    - challenger target count === challengerCleanupWithdrawalCount
 *    - issuer target count === issuerCleanupWithdrawalCount
 *    - challenger credit sum === expectedChallengerRecoverableCreditsWei
 *    - issuer credit sum === expectedIssuerRecoverableCreditsWei
 *    - total credit sum === expectedTotalContractCreditsWei
 * 3. Complete target identity:
 *    - scenarioId
 *    - normalized contractAddress
 *    - party
 *    - expectedCredit === target.expectedCreditWei
 *    - observedCredit === target.expectedCreditWei
 * 4. Actual receipt evidence:
 *    - non-empty transactionHash
 *    - receiptSummary exists and is an object
 *    - receiptSummary.rawReceipt exists and is an object
 *    - verifyReceiptExecution(receiptSummary.rawReceipt) succeeds
 *    - verified summary txHash matches transactionHash and receiptSummary.txHash
 *    - verified summary status matches receiptStatus and receiptSummary.status
 *    - verified summary executionResult matches executionResult and receiptSummary.executionResult
 *    - status is ACCEPTED or FINALIZED
 *    - executionResult is FINISHED_WITH_RETURN
 * 5. Post-withdrawal credit must be strictly zero.
 * 6. Accounting invariant must be satisfied (true).
 * 7. All failed target addresses are preserved in unresolvedContractAddresses.
 * 8. Sweep disposition:
 *    - COMPLETED requires actual receipt revalidation, matching txHash/status/result,
 *      and observed post-sweep balance.
 *    - NOT_REQUIRED_ZERO_BALANCE requires challenger balance to be strictly zero.
 *    - BLOCKED_INSUFFICIENT_FEE or FAILED blocks readiness fail-closed.
 * 9. Combined readiness:
 *    - primaryScenariosStatus is mandatory.
 *    - LIVE_READINESS_PASS requires primaryScenariosStatus === PRIMARY_SCENARIOS_PASS
 *      AND status === ECONOMIC_CLEANUP_PASS.
 *    - Otherwise LIVE_READINESS_BLOCKED.
 */
export function evaluateEconomicCleanup(options: EvaluateCleanupOptions): EconomicCleanupReport {
  const {
    cleanupRecords,
    expectedTargets,
    expectedPlan,
    primaryScenariosStatus,
    sweepRecord,
  } = options;

  if (
    !primaryScenariosStatus ||
    (primaryScenariosStatus !== "PRIMARY_SCENARIOS_PASS" && primaryScenariosStatus !== "PRIMARY_SCENARIOS_FAIL")
  ) {
    throw new Error("primaryScenariosStatus is mandatory and must be explicitly specified");
  }

  // 1. Validate manifest internal uniqueness and parity against expectedPlan
  const manifestTargetKeys = new Set<string>();
  let manifestHasDuplicate = false;
  let manifestChallengerCount = 0;
  let manifestIssuerCount = 0;
  let manifestChallengerCreditSum = 0n;
  let manifestIssuerCreditSum = 0n;

  for (const t of expectedTargets) {
    const key = getCleanupTargetKey(t.scenarioId, t.party, t.contractAddress);
    if (manifestTargetKeys.has(key)) {
      manifestHasDuplicate = true;
    }
    manifestTargetKeys.add(key);

    if (t.party === "challenger") {
      manifestChallengerCount++;
      manifestChallengerCreditSum += t.expectedCreditWei;
    } else if (t.party === "issuer") {
      manifestIssuerCount++;
      manifestIssuerCreditSum += t.expectedCreditWei;
    }
  }

  const manifestTotalCreditSum = manifestChallengerCreditSum + manifestIssuerCreditSum;

  const manifestParityValid =
    expectedTargets.length > 0 &&
    !manifestHasDuplicate &&
    manifestChallengerCount === Number(expectedPlan.challengerCleanupWithdrawalCount) &&
    manifestIssuerCount === Number(expectedPlan.issuerCleanupWithdrawalCount) &&
    manifestChallengerCreditSum === expectedPlan.expectedChallengerRecoverableCreditsWei &&
    manifestIssuerCreditSum === expectedPlan.expectedIssuerRecoverableCreditsWei &&
    manifestTotalCreditSum === expectedPlan.expectedTotalContractCreditsWei;

  let challengerWithdrawn = 0n;
  let issuerWithdrawn = 0n;
  const unresolvedAddresses: Set<Address> = new Set();

  // Index expected targets by composite key
  const targetMap = new Map<string, ExpectedCleanupTarget>();
  for (const t of expectedTargets) {
    const key = getCleanupTargetKey(t.scenarioId, t.party, t.contractAddress);
    targetMap.set(key, t);
  }

  // Detect duplicate records and unexpected targets
  const seenRecordKeys = new Set<string>();
  let hasDuplicateRecord = false;
  let hasUnexpectedRecord = false;
  let hasManifestDiscrepancy = !manifestParityValid;

  for (const r of cleanupRecords) {
    const recordKey = getCleanupTargetKey(r.scenarioId, r.party, r.contractAddress);
    if (seenRecordKeys.has(recordKey)) {
      hasDuplicateRecord = true;
      unresolvedAddresses.add(r.contractAddress);
    }
    seenRecordKeys.add(recordKey);

    const target = targetMap.get(recordKey);
    if (!target) {
      hasUnexpectedRecord = true;
      unresolvedAddresses.add(r.contractAddress);
      continue;
    }

    if (r.status !== "WITHDRAWN") {
      unresolvedAddresses.add(r.contractAddress);
      hasManifestDiscrepancy = true;
      continue;
    }

    const obsCredit = r.observedCredit;
    const creditMatches =
      r.expectedCredit === target.expectedCreditWei &&
      obsCredit !== undefined &&
      obsCredit === target.expectedCreditWei;
    const postWithdrawalZero = r.postWithdrawalCredit === 0n;
    const invariantTrue = r.accountingInvariantSatisfied === true;

    // Strict receipt evidence revalidation
    let receiptValid = false;
    if (
      typeof r.transactionHash === "string" &&
      r.transactionHash.trim().length > 0 &&
      r.receiptSummary &&
      typeof r.receiptSummary === "object" &&
      r.receiptSummary.rawReceipt &&
      typeof r.receiptSummary.rawReceipt === "object"
    ) {
      try {
        const verified = verifyReceiptExecution(
          r.receiptSummary.rawReceipt,
          `cleanup withdrawal verification for ${recordKey}`
        );
        const txMatches =
          verified.txHash === r.transactionHash &&
          verified.txHash === r.receiptSummary.txHash;
        const statusMatches =
          verified.status === r.receiptStatus &&
          verified.status === r.receiptSummary.status;
        const execMatches =
          verified.executionResult === r.executionResult &&
          verified.executionResult === r.receiptSummary.executionResult;
        const statusClean =
          verified.status === "FINALIZED" || verified.status === "ACCEPTED";
        const execClean = verified.executionResult === "FINISHED_WITH_RETURN";

        if (txMatches && statusMatches && execMatches && statusClean && execClean) {
          receiptValid = true;
        }
      } catch {
        receiptValid = false;
      }
    }

    if (creditMatches && postWithdrawalZero && invariantTrue && receiptValid && obsCredit !== undefined) {
      if (r.party === "challenger") {
        challengerWithdrawn += obsCredit;
      } else if (r.party === "issuer") {
        issuerWithdrawn += obsCredit;
      }
    } else {
      unresolvedAddresses.add(r.contractAddress);
      hasManifestDiscrepancy = true;
    }
  }

  // Ensure every expected target in the manifest is present
  for (const t of expectedTargets) {
    const key = getCleanupTargetKey(t.scenarioId, t.party, t.contractAddress);
    if (!seenRecordKeys.has(key)) {
      hasManifestDiscrepancy = true;
      unresolvedAddresses.add(t.contractAddress);
    }
  }

  const totalContractCreditsWithdrawn = challengerWithdrawn + issuerWithdrawn;
  const expectedTotal = expectedPlan.expectedTotalContractCreditsWei;
  const unresolvedCredits =
    expectedTotal > totalContractCreditsWithdrawn ? expectedTotal - totalContractCreditsWithdrawn : 0n;

  const allExpectedChallengerRecovered =
    challengerWithdrawn === expectedPlan.expectedChallengerRecoverableCreditsWei;
  const allExpectedIssuerRecovered =
    issuerWithdrawn === expectedPlan.expectedIssuerRecoverableCreditsWei;

  // Strict sweep evaluation with explicit boolean grouping and raw receipt revalidation
  const sweepRequired = expectedPlan.challengerSweepTransactionCount > 0n;
  let sweepOk = false;
  if (!sweepRequired) {
    sweepOk = true;
  } else {
    if (sweepRecord === undefined) {
      sweepOk = false;
    } else if (sweepRecord.disposition === "NOT_REQUIRED_ZERO_BALANCE") {
      sweepOk = (sweepRecord.preSweepBalanceWei === 0n) && (sweepRecord.postSweepObservedResidualBalanceWei === 0n);
    } else if (sweepRecord.disposition === "COMPLETED") {
      let sweepReceiptValid = false;
      const rawReceipt =
        sweepRecord.nativeTransferSummary?.rawReceipt ||
        (sweepRecord.receiptSummary as ValidatedNativeTransferSummary | ValidatedReceiptSummary)?.rawReceipt;
      const sweepHash = sweepRecord.sweepTransactionHash;

      if (
        typeof sweepHash === "string" &&
        sweepHash.trim().length > 0 &&
        rawReceipt &&
        typeof rawReceipt === "object"
      ) {
        try {
          const verifiedSweep = verifyNativeTransferReceipt({
            receipt: rawReceipt,
            context: "completed sweep receipt verification",
            expectedHash: String(sweepHash),
            requestedAmountWei: sweepRecord.attemptedSweepAmountWei ?? 1n,
            preBalanceWei: sweepRecord.issuerPreSweepBalanceWei ?? 0n,
            postBalanceWei:
              sweepRecord.issuerPostSweepBalanceWei ??
              (sweepRecord.attemptedSweepAmountWei ?? 1n),
          });

          const sweepTxMatches =
            verifiedSweep.txHash.toLowerCase() === sweepHash.toLowerCase();
          const sweepStatusMatches =
            verifiedSweep.status === sweepRecord.receiptStatus;
          const sweepExecMatches =
            verifiedSweep.executionResult === sweepRecord.executionResult;
          const sweepStatusClean =
            verifiedSweep.status === "FINALIZED" || verifiedSweep.status === "ACCEPTED";
          const sweepExecClean =
            verifiedSweep.executionResult === "NOT_VOTED" || verifiedSweep.executionResult === "UNKNOWN";

          if (sweepTxMatches && sweepStatusMatches && sweepExecMatches && sweepStatusClean && sweepExecClean) {
            sweepReceiptValid = true;
          }
        } catch {
          sweepReceiptValid = false;
        }
      }
      const postBalQueried = sweepRecord.postSweepObservedResidualBalanceWei !== undefined;
      // Rule 22 & 23: Positive uncleaned residual blocks LIVE_READINESS.
      // Bounded dust rule: If residual is 0 or <= estimatedFeeWei * 2n (bounded fee reserve dust), it is valid.
      const dustLimitWei = sweepRecord.estimatedFeeWei !== undefined ? sweepRecord.estimatedFeeWei * 2n : 0n;
      const residualWithinBound =
        sweepRecord.postSweepObservedResidualBalanceWei !== undefined &&
        (sweepRecord.postSweepObservedResidualBalanceWei === 0n ||
          sweepRecord.postSweepObservedResidualBalanceWei <= dustLimitWei);

      sweepOk = sweepReceiptValid && postBalQueried && residualWithinBound;
    } else {
      // BLOCKED_INSUFFICIENT_FEE or FAILED
      sweepOk = false;
    }
  }

  const manifestSatisfied =
    expectedTargets.length > 0 &&
    manifestParityValid &&
    !hasDuplicateRecord &&
    !hasUnexpectedRecord &&
    !hasManifestDiscrepancy &&
    seenRecordKeys.size === expectedTargets.length;

  let status: EconomicCleanupStatus;

  if (
    manifestSatisfied &&
    allExpectedChallengerRecovered &&
    allExpectedIssuerRecovered &&
    sweepOk &&
    unresolvedAddresses.size === 0 &&
    unresolvedCredits === 0n
  ) {
    status = "ECONOMIC_CLEANUP_PASS";
  } else if (totalContractCreditsWithdrawn > 0n || cleanupRecords.some((r) => r.status === "WITHDRAWN")) {
    status = "ECONOMIC_CLEANUP_PARTIAL";
  } else {
    status = "ECONOMIC_CLEANUP_FAIL";
  }

  const liveReadinessStatus: LiveReadinessStatus =
    (primaryScenariosStatus === "PRIMARY_SCENARIOS_PASS" && status === "ECONOMIC_CLEANUP_PASS")
      ? "LIVE_READINESS_PASS"
      : "LIVE_READINESS_BLOCKED";

  return {
    primaryScenariosStatus,
    status,
    liveReadinessStatus,
    records: cleanupRecords,
    expectedTargets,
    totalChallengerCreditsWithdrawnWei: challengerWithdrawn,
    totalIssuerCreditsWithdrawnWei: issuerWithdrawn,
    totalContractCreditsWithdrawnWei: totalContractCreditsWithdrawn,
    expectedChallengerCreditsWei: expectedPlan.expectedChallengerRecoverableCreditsWei,
    expectedIssuerCreditsWei: expectedPlan.expectedIssuerRecoverableCreditsWei,
    expectedTotalContractCreditsWei: expectedTotal,
    sweepRecord,
    unresolvedCreditsWei: unresolvedCredits,
    unresolvedContractAddresses: Array.from(unresolvedAddresses),
  };
}
