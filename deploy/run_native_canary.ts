/**
 * Native Transfer Canary for ReserveCovenant on GenLayer Studio Devnet Preview.
 *
 * Requirements (Phase 7):
 * 1. Generate a new in-memory ephemeral challenger.
 * 2. Use a minimal reasonable Studio-dev test amount (0.01 GEN).
 * 3. Record issuer and challenger pre-transfer balances.
 * 4. Transfer issuer -> challenger.
 * 5. Verify FINALIZED/ACCEPTED + NOT_VOTED through verifyNativeTransferReceipt.
 * 6. Confirm the exact challenger balance delta.
 * 7. Sweep the challenger balance back to issuer while retaining required fee reserve.
 * 8. Verify the sweep through verifyNativeTransferReceipt.
 * 9. Record the final challenger residual.
 * 10. Release the ephemeral signer only after final balance measurement.
 * 11. Require: NATIVE_TRANSFER_CANARY_PASS.
 * 12. If failure occurs after funding, run emergency cleanup, preserve all hashes, and stop.
 */

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import type { Address } from "viem";
import type { TransactionHash } from "genlayer-js/types";
import { resolveSigner } from "./signer.js";
import {
  verifyNativeTransferReceipt,
  type ValidatedNativeTransferSummary,
} from "./harness_utils.js";
import { assertSignerSeparation } from "./run_live_integration.js";

const CANARY_AMOUNT_WEI = 10_000_000_000_000_000n; // 0.01 GEN

export interface NativeCanaryResult {
  status: "NATIVE_TRANSFER_CANARY_PASS" | "NATIVE_TRANSFER_CANARY_FAIL";
  issuerAddress: Address;
  challengerAddress: Address;
  fundingTxHash: string;
  fundingReceiptSummary: ValidatedNativeTransferSummary;
  sweepTxHash: string;
  sweepReceiptSummary: ValidatedNativeTransferSummary;
  issuerPreFundingBalanceWei: bigint;
  challengerPreFundingBalanceWei: bigint;
  challengerPostFundingBalanceWei: bigint;
  fundingBalanceDeltaWei: bigint;
  challengerPreSweepBalanceWei: bigint;
  attemptedSweepAmountWei: bigint;
  issuerPreSweepBalanceWei: bigint;
  issuerPostSweepBalanceWei: bigint;
  challengerFinalResidualWei: bigint;
}

export async function runNativeCanary(): Promise<NativeCanaryResult> {
  console.log("=== ReserveCovenant Native Transfer Canary ===");
  console.log("Network: GenLayer Studio Devnet Preview (61997)");
  console.log(`Canary Transfer Amount: ${CANARY_AMOUNT_WEI.toString()} wei (0.01 GEN)`);

  // 1. Resolve Issuer Signer from OS keychain
  const issuerSigner = await resolveSigner({ checkBalance: true });
  console.log(`[canary] Issuer public address: ${issuerSigner.address}`);

  // 2. Generate new in-memory Ephemeral Challenger Signer
  let challengerPrivKey: string | null = generatePrivateKey();
  const challengerAccount = createAccount(challengerPrivKey as `0x${string}`);
  console.log(`[canary] Ephemeral Challenger public address: ${challengerAccount.address}`);

  assertSignerSeparation(issuerSigner.address, challengerAccount.address);

  // Initialize clients
  const issuerClient = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: issuerSigner.account,
  });

  const challengerClient = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: challengerAccount,
  });

  let fundingTxHash: string | undefined;
  let fundingReceiptSummary: ValidatedNativeTransferSummary | undefined;
  let sweepTxHash: string | undefined;
  let sweepReceiptSummary: ValidatedNativeTransferSummary | undefined;

  let issuerPreFundingBal = 0n;
  let challengerPreFundingBal = 0n;
  let challengerPostFundingBal = 0n;
  let fundingDelta = 0n;
  let preSweepBal = 0n;
  let attemptedSweep = 0n;
  let issuerPreSweepBal = 0n;
  let issuerPostSweepBal = 0n;
  let challengerFinalBal = 0n;

  try {
    // 3. Record pre-transfer balances
    issuerPreFundingBal = await issuerClient.getBalance({ address: issuerSigner.account.address });
    challengerPreFundingBal = await issuerClient.getBalance({ address: challengerAccount.address });
    console.log(`[canary] Issuer pre-transfer balance:     ${issuerPreFundingBal.toString()} wei`);
    console.log(`[canary] Challenger pre-transfer balance: ${challengerPreFundingBal.toString()} wei`);

    if (issuerPreFundingBal < CANARY_AMOUNT_WEI) {
      throw new Error(
        `Issuer balance (${issuerPreFundingBal.toString()} wei) insufficient for canary amount (${CANARY_AMOUNT_WEI.toString()} wei)`
      );
    }

    // 4. Transfer issuer -> challenger
    console.log(`[canary] Submitting canary transfer: ${CANARY_AMOUNT_WEI.toString()} wei to ${challengerAccount.address}...`);
    const fundHash = await issuerClient.sendTransaction({
      account: issuerSigner.account,
      to: challengerAccount.address,
      value: CANARY_AMOUNT_WEI,
      chain: null,
    });
    fundingTxHash = String(fundHash);
    console.log(`[canary] Funding transaction submitted: ${fundingTxHash}`);

    const fundReceipt = await issuerClient.waitForTransactionReceipt({
      hash: fundHash as unknown as TransactionHash,
    });

    challengerPostFundingBal = await issuerClient.getBalance({ address: challengerAccount.address });
    fundingDelta = challengerPostFundingBal - challengerPreFundingBal;
    console.log(`[canary] Challenger post-transfer balance: ${challengerPostFundingBal.toString()} wei`);
    console.log(`[canary] Challenger balance delta:        ${fundingDelta.toString()} wei`);

    // 5. Verify through native verifier
    fundingReceiptSummary = verifyNativeTransferReceipt({
      receipt: fundReceipt,
      context: "canary funding transfer",
      expectedHash: fundingTxHash,
      expectedSender: issuerSigner.account.address,
      expectedRecipient: challengerAccount.address,
      requestedAmountWei: CANARY_AMOUNT_WEI,
      preBalanceWei: challengerPreFundingBal,
      postBalanceWei: challengerPostFundingBal,
    });
    console.log(`[canary] Funding verified: status=${fundingReceiptSummary.status}, result=${fundingReceiptSummary.executionResult}`);

    // 6. Confirm exact delta
    if (fundingDelta < CANARY_AMOUNT_WEI) {
      throw new Error(
        `Challenger balance delta (${fundingDelta.toString()} wei) is less than canary amount (${CANARY_AMOUNT_WEI.toString()} wei)`
      );
    }

    // 7. Sweep challenger balance back to issuer
    preSweepBal = challengerPostFundingBal;
    const feeEstimate = await challengerClient.estimateTransactionFees();
    const feeVal = BigInt(feeEstimate.feeValue);
    const feeReserve = feeVal > 0n ? feeVal * 2n : 0n;
    attemptedSweep = preSweepBal > feeReserve ? preSweepBal - feeReserve : preSweepBal;

    console.log(`[canary] Estimated fee per tx: ${feeVal.toString()} wei (reserve: ${feeReserve.toString()} wei)`);
    console.log(`[canary] Attempting residual sweep of ${attemptedSweep.toString()} wei back to issuer...`);

    issuerPreSweepBal = await issuerClient.getBalance({ address: issuerSigner.account.address });

    const swHash = await challengerClient.sendTransaction({
      account: challengerAccount,
      to: issuerSigner.account.address,
      value: attemptedSweep,
      chain: null,
    });
    sweepTxHash = String(swHash);
    console.log(`[canary] Sweep transaction submitted: ${sweepTxHash}`);

    const sweepReceipt = await challengerClient.waitForTransactionReceipt({
      hash: swHash as unknown as TransactionHash,
    });

    issuerPostSweepBal = await issuerClient.getBalance({ address: issuerSigner.account.address });
    challengerFinalBal = await issuerClient.getBalance({ address: challengerAccount.address });

    // 8. Verify sweep through native verifier
    sweepReceiptSummary = verifyNativeTransferReceipt({
      receipt: sweepReceipt,
      context: "canary residual sweep",
      expectedHash: sweepTxHash,
      expectedSender: challengerAccount.address,
      expectedRecipient: issuerSigner.account.address,
      requestedAmountWei: attemptedSweep,
      preBalanceWei: issuerPreSweepBal,
      postBalanceWei: issuerPostSweepBal,
    });
    console.log(`[canary] Sweep verified: status=${sweepReceiptSummary.status}, result=${sweepReceiptSummary.executionResult}`);

    // 9. Record final challenger residual
    console.log(`[canary] Final Challenger residual: ${challengerFinalBal.toString()} wei (bounded dust <= ${feeReserve.toString()} wei)`);
    if (challengerFinalBal > feeReserve && challengerFinalBal > 0n) {
      throw new Error(
        `Final residual (${challengerFinalBal.toString()} wei) exceeds fee reserve (${feeReserve.toString()} wei)`
      );
    }

    console.log("\n=================================================");
    console.log(">>> NATIVE_TRANSFER_CANARY_PASS <<<");
    console.log("Funding and residual sweep verified via native transfer verifier.");
    console.log(`Funding Tx: https://explorer-studio-dev.genlayer.com/tx/${fundingTxHash}`);
    console.log(`Sweep Tx:   https://explorer-studio-dev.genlayer.com/tx/${sweepTxHash}`);
    console.log("=================================================\n");

    return {
      status: "NATIVE_TRANSFER_CANARY_PASS",
      issuerAddress: issuerSigner.address as Address,
      challengerAddress: challengerAccount.address as Address,
      fundingTxHash,
      fundingReceiptSummary,
      sweepTxHash,
      sweepReceiptSummary,
      issuerPreFundingBalanceWei: issuerPreFundingBal,
      challengerPreFundingBalanceWei: challengerPreFundingBal,
      challengerPostFundingBalanceWei: challengerPostFundingBal,
      fundingBalanceDeltaWei: fundingDelta,
      challengerPreSweepBalanceWei: preSweepBal,
      attemptedSweepAmountWei: attemptedSweep,
      issuerPreSweepBalanceWei: issuerPreSweepBal,
      issuerPostSweepBalanceWei: issuerPostSweepBal,
      challengerFinalResidualWei: challengerFinalBal,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[canary-failure] Native transfer canary encountered error: ${msg}`);

    // 12. Emergency cleanup if funded
    if (fundingTxHash && challengerPostFundingBal > 0n && !sweepTxHash) {
      console.log(`[canary-emergency] Attempting emergency sweep of remaining challenger balance...`);
      try {
        const remainingBal = await challengerClient.getBalance({ address: challengerAccount.address });
        if (remainingBal > 0n) {
          const emHash = await challengerClient.sendTransaction({
            account: challengerAccount,
            to: issuerSigner.account.address,
            value: remainingBal,
            chain: null,
          });
          console.log(`[canary-emergency] Emergency sweep submitted: ${String(emHash)}`);
          await challengerClient.waitForTransactionReceipt({ hash: emHash as unknown as TransactionHash });
        }
      } catch (emErr: unknown) {
        console.error(`[canary-emergency-error] Emergency sweep failed: ${emErr}`);
      }
    }

    throw err;
  } finally {
    // 10. Release in-memory secret references only after cleanup and residual measurement
    challengerPrivKey = null;
    console.log("[canary] Ephemeral signer in-memory reference released after balance measurement.");
  }
}

const isMain = process.argv[1] && (process.argv[1].endsWith("run_native_canary.ts") || process.argv[1].endsWith("run_native_canary.js"));
if (isMain) {
  runNativeCanary().catch((err) => {
    console.error("Canary FAILED:", err);
    process.exit(1);
  });
}
