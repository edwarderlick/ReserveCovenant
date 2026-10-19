/**
 * Live-Harness Utilities for ReserveCovenant.
 *
 * Implements pure, offline-testable utilities:
 * 1. Dynamic challenger and issuer funding calculations (BigInt throughout).
 * 2. Strict receipt verification requiring FINISHED_WITH_RETURN.
 * 3. Categorized contract execution error helper distinguishing on-chain reverts
 *    from unrelated infrastructure/client errors.
 * 4. Typed challenger funding execution and post-balance verification.
 */

import { isSuccessful } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { ScenarioCallSpec } from "./run_live_integration.js";

// ============================================================================
// 1. Dynamic Funding Calculation (Pure Functions, BigInt throughout)
// ============================================================================

/**
 * Derives the exact number of challenger-signed transactions from the declarative scenario specifications.
 * Each scenario with a defined challengeType requires one challenger-signed open_challenge transaction.
 */
export function deriveChallengerTransactionCount(specs: ScenarioCallSpec[]): number {
  return specs.filter((s) => s.challengeType !== undefined && s.challengeType !== null).length;
}

export interface ChallengerFundingParams {
  challengerTxCount: bigint;
  bondPerTx: bigint;
  estimatedFeePerTx: bigint;
  safetyMargin?: bigint;
}

/**
 * Calculates the required challenger funding:
 * required_funding = (challengerTxCount * bondPerTx) + (challengerTxCount * estimatedFeePerTx) + safetyMargin
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

  const totalBonds = challengerTxCount * bondPerTx;
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
// 2. Receipt Execution & Consensus Verification (Phase 8)
// ============================================================================

export interface ValidatedReceiptSummary {
  txHash: string;
  status: string;
  executionResult: string;
  contractAddress?: string;
}

/**
 * Verifies that a transaction receipt finalized cleanly with execution result FINISHED_WITH_RETURN.
 * Rejects pending, unknown, canceled, or FINISHED_WITH_ERROR receipts.
 */
export function verifyReceiptExecution(
  receipt: any,
  context: string
): ValidatedReceiptSummary {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`Receipt verification failed for ${context}: receipt is missing or malformed`);
  }

  const txHash = String(receipt.hash || receipt.transactionHash || "");
  const statusName = String(
    receipt.statusName ||
    (receipt.status !== undefined ? receipt.status : "")
  );

  const isAcceptedOrFinalized =
    statusName === "FINALIZED" ||
    statusName === "ACCEPTED" ||
    statusName === TransactionStatus.FINALIZED ||
    statusName === TransactionStatus.ACCEPTED;

  if (!isAcceptedOrFinalized) {
    throw new Error(
      `Receipt verification failed for ${context} (tx ${txHash}): expected FINALIZED or ACCEPTED consensus status, got '${statusName}'`
    );
  }

  const executionResult = String(
    receipt.txExecutionResultName ||
    (receipt.txExecutionResult !== undefined ? receipt.txExecutionResult : "")
  );

  if (
    executionResult === "FINISHED_WITH_ERROR" ||
    executionResult === ExecutionResult.FINISHED_WITH_ERROR
  ) {
    throw new Error(
      `Transaction execution failed on-chain for ${context} (tx ${txHash}): status='${statusName}', executionResult='${executionResult}'`
    );
  }

  if (
    executionResult !== "FINISHED_WITH_RETURN" &&
    executionResult !== ExecutionResult.FINISHED_WITH_RETURN
  ) {
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
// 3. Expected Contract Execution Error Classification (Phase 6)
// ============================================================================

export interface ExpectedContractErrorOptions {
  expectedMethod: string;
  expectedErrorSubstring?: string;
  verifyStateUnchanged?: () => Promise<void>;
}

/**
 * Distinguishes accepted on-chain contract execution errors (reverts)
 * from rejected unrelated infrastructure/network/client errors.
 */
export async function expectContractExecutionError(
  action: () => Promise<any>,
  options: ExpectedContractErrorOptions
): Promise<{ txHash?: string; errorName: string; message: string }> {
  let actionResult: any = null;
  let actionThrew = false;
  let capturedError: any = null;

  try {
    actionResult = await action();
  } catch (err: any) {
    actionThrew = true;
    capturedError = err;
  }

  // If action returned a receipt without throwing
  if (!actionThrew && actionResult && typeof actionResult === "object") {
    const receipt = actionResult;
    const executionResult = String(receipt.txExecutionResultName || receipt.txExecutionResult || "");
    const statusName = String(receipt.statusName || receipt.status || "");

    if (
      executionResult === "FINISHED_WITH_ERROR" ||
      executionResult === ExecutionResult.FINISHED_WITH_ERROR
    ) {
      if (options.verifyStateUnchanged) {
        await options.verifyStateUnchanged();
      }
      return {
        txHash: receipt.hash,
        errorName: "FINISHED_WITH_ERROR",
        message: receipt.errorMessage || `Contract execution finished with error on ${options.expectedMethod}`,
      };
    }

    if (
      executionResult === "FINISHED_WITH_RETURN" ||
      executionResult === ExecutionResult.FINISHED_WITH_RETURN
    ) {
      throw new Error(
        `Expected contract execution error on '${options.expectedMethod}', but transaction succeeded unexpectedly (tx ${receipt.hash}, status=${statusName})`
      );
    }
  }

  if (!actionThrew) {
    throw new Error(
      `Expected contract execution error on '${options.expectedMethod}', but call succeeded without error`
    );
  }

  const errMsg = String(capturedError?.message || capturedError || "");
  const errStack = String(capturedError?.stack || "");
  const combined = `${errMsg} ${errStack}`.toLowerCase();

  // Strict list of rejected infrastructure/client/network errors
  const infrastructureErrorPatterns = [
    "econnrefused",
    "enotfound",
    "etimedout",
    "econnreset",
    "fetch failed",
    "dns",
    "timeout",
    "network error",
    "socket hang up",
    "insufficient funds",
    "insufficient balance",
    "nonce too low",
    "invalid signature",
    "unauthorized signer",
    "unknown account",
    "could not be resolved from os keychain",
    "method not found",
    "unsupported client method",
    "malformed abi",
    "parse error",
    "blocked_pending_public_fixture_publication",
    "blocked_insufficient_studio_devnet_balance",
    "blocked_no_supported_challenger_funding_api",
  ];

  for (const pat of infrastructureErrorPatterns) {
    if (combined.includes(pat)) {
      throw new Error(
        `Unrelated infrastructure/client error detected during '${options.expectedMethod}' (NOT an accepted on-chain revert): ${errMsg}`
      );
    }
  }

  const isContractExecutionError =
    capturedError?.receipt?.txExecutionResultName === "FINISHED_WITH_ERROR" ||
    capturedError?.receipt?.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR ||
    combined.includes("finished_with_error") ||
    combined.includes("revert") ||
    combined.includes("usererror") ||
    combined.includes("execution failed") ||
    combined.includes("transaction failed on-chain");

  if (options.expectedErrorSubstring) {
    const sub = options.expectedErrorSubstring.toLowerCase();
    if (!combined.includes(sub) && !isContractExecutionError) {
      throw new Error(
        `Error during '${options.expectedMethod}' did not match expected substring '${options.expectedErrorSubstring}': ${errMsg}`
      );
    }
  } else if (!isContractExecutionError) {
    throw new Error(
      `Error during '${options.expectedMethod}' is not a recognized on-chain contract execution error: ${errMsg}`
    );
  }

  if (options.verifyStateUnchanged) {
    await options.verifyStateUnchanged();
  }

  return {
    txHash: capturedError?.receipt?.hash || capturedError?.txHash,
    errorName: capturedError?.name || "ContractExecutionError",
    message: errMsg,
  };
}

// ============================================================================
// 4. Challenger Funding Execution & Balance Post-Verification (Phase 4)
// ============================================================================

export interface ExecuteFundingOptions {
  issuerClient: any;
  issuerAccount: any;
  challengerAddress: string;
  fundingAmount: bigint;
  requiredPostBalance: bigint;
}

export async function executeAndVerifyChallengerFunding(
  options: ExecuteFundingOptions
): Promise<{ fundTxHash: string; postBalance: bigint }> {
  const { issuerClient, issuerAccount, challengerAddress, fundingAmount, requiredPostBalance } = options;

  if (typeof issuerClient.sendTransaction !== "function") {
    throw new Error("BLOCKED_NO_SUPPORTED_CHALLENGER_FUNDING_API: issuerClient.sendTransaction is not available");
  }

  console.log(`[funding] Submitting challenger funding: ${fundingAmount.toString()} wei to ${challengerAddress}`);
  const fundTxHash = await issuerClient.sendTransaction({
    account: issuerAccount,
    to: challengerAddress as `0x${string}`,
    value: fundingAmount,
  });

  const receipt = await issuerClient.waitForTransactionReceipt({ hash: fundTxHash });
  verifyReceiptExecution(receipt, "challenger funding transaction");

  const postBalance = await issuerClient.getBalance({ address: challengerAddress as `0x${string}` });
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
