/**
 * Shared Autonomous Live-Signer Orchestration Launcher for Python Live Tests.
 *
 * Implements Phase 1 & Phase 3 & Phase 4 orchestration:
 * - Checks live test opt-in (RESERVECOVENANT_RUN_LIVE_TESTS=1).
 * - Validates strict immutable fixture base URL before signer resolution or network writes.
 * - Resolves issuer account via OS keychain (service: genlayer-cli, account: account:coverlock-submitter).
 * - Generates fresh distinct ephemeral challenger private key in process memory via public SDK API.
 * - Asserts normalized issuer != challenger address.
 * - Calculates required challenger funding dynamically from scenario call specifications.
 * - Verifies issuer Studio Devnet balance against preflight requirements.
 * - Funds the ephemeral challenger only after all preflights pass.
 * - Verifies funding transaction finality and post-balance.
 * - Injects ephemeral keys into Python child process memory only for the lifetime of that child.
 * - Never prints, logs, serializes or commits private keys.
 * - Never writes keys to disk.
 * - Spawns Python live integration suite and propagates exact exit code.
 * - Clears memory references upon completion.
 */

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";
import { validateImmutableFixtureBaseUrl } from "./fixture_url_validator.js";
import {
  assertSignerSeparation,
  getLiveScenariosSpec,
  DEFAULT_CHALLENGER_BOND,
  DEFAULT_ISSUER_BOND,
} from "./run_live_integration.js";
import {
  deriveChallengerTransactionCount,
  calculateRequiredChallengerFunding,
  calculateChallengerFundingShortfall,
  calculateRequiredIssuerBalance,
  executeAndVerifyChallengerFunding,
} from "./harness_utils.js";

export async function runPythonLiveIntegration(): Promise<void> {
  console.log("=== ReserveCovenant Python Live Integration Launcher ===");

  // 1. Safe default skip
  if (process.env.RESERVECOVENANT_RUN_LIVE_TESTS !== "1") {
    console.log("[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.");
    console.log("No transactions were submitted to the network.");
    return;
  }

  // 2. Strict public fixture validation BEFORE signer resolution or any network write
  const fixtureBaseUrl = (process.env.RESERVECOVENANT_FIXTURE_BASE_URL || "").trim();
  const fixtureValidation = validateImmutableFixtureBaseUrl(fixtureBaseUrl);
  if (!fixtureValidation.valid) {
    console.error(`[BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION] ${fixtureValidation.error}`);
    console.error("GenLayer validators require immutable public commit-pinned HTTPS fixture URLs.");
    console.error("Zero deployments and zero transactions submitted.");
    process.exit(1);
  }

  // 3. Resolve Issuer Signer from OS keychain
  const issuerSigner = await resolveSigner({ checkBalance: true });
  console.log(`[orchestration] Issuer public address:     ${issuerSigner.address}`);

  // 4. Generate distinct in-memory Ephemeral Challenger Signer
  let challengerPrivKey: string | null = generatePrivateKey();
  const challengerAccount = createAccount(challengerPrivKey as `0x${string}`);
  console.log(`[orchestration] Challenger public address: ${challengerAccount.address}`);

  // 5. Assert signer separation
  assertSignerSeparation(issuerSigner.address, challengerAccount.address);

  // Initialize issuer client for Studio Devnet
  const issuerClient = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: issuerSigner.account,
  });

  // 6. Calculate dynamic funding
  const specs = getLiveScenariosSpec();
  const challengerTxCount = BigInt(deriveChallengerTransactionCount(specs)); // 7 transactions
  const feeEstimate = await issuerClient.estimateTransactionFees();
  const feePerTx = BigInt(feeEstimate.feeValue);

  const requiredFunding = calculateRequiredChallengerFunding({
    challengerTxCount,
    bondPerTx: DEFAULT_CHALLENGER_BOND,
    estimatedFeePerTx: feePerTx,
  });

  const challengerCurrentBal = await issuerClient.getBalance({
    address: challengerAccount.address as `0x${string}`,
  });
  const shortfall = calculateChallengerFundingShortfall(requiredFunding, challengerCurrentBal);

  console.log(`[orchestration] Scenario count: ${specs.length}, Challenger transactions: ${challengerTxCount.toString()}`);
  console.log(`[orchestration] Estimated fee per tx: ${feePerTx.toString()} wei`);
  console.log(`[orchestration] Required challenger funding: ${requiredFunding.toString()} wei`);
  console.log(`[orchestration] Challenger current balance:  ${challengerCurrentBal.toString()} wei`);
  console.log(`[orchestration] Challenger funding shortfall: ${shortfall.toString()} wei`);

  // Verify Issuer balance preflight
  const issuerBal = issuerSigner.balance ?? 0n;
  const requiredIssuerBal = calculateRequiredIssuerBalance({
    disposableDeployCount: 8n,
    deployFeePerTx: feePerTx * 2n, // deployment has higher gas than standard call
    issuerBondsTotal: 8n * DEFAULT_ISSUER_BOND,
    issuerTxCount: 20n,
    txFeePerTx: feePerTx,
    challengerShortfall: shortfall,
  });

  console.log(`[orchestration] Issuer current balance:   ${issuerBal.toString()} wei`);
  console.log(`[orchestration] Required issuer balance:  ${requiredIssuerBal.toString()} wei`);

  if (issuerBal < requiredIssuerBal) {
    console.error(
      `[BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE] Issuer balance (${issuerBal.toString()} wei) ` +
      `is below required Studio Devnet preflight amount (${requiredIssuerBal.toString()} wei).`
    );
    process.exit(1);
  }

  // 7. Fund challenger if shortfall > 0
  if (shortfall > 0n) {
    await executeAndVerifyChallengerFunding({
      issuerClient,
      issuerAccount: issuerSigner.account,
      challengerAddress: challengerAccount.address,
      fundingAmount: shortfall,
      requiredPostBalance: requiredFunding,
    });
  }

  // 8. Inject into Python child process environment ONLY
  let childEnv: Record<string, string> | null = {
    ...process.env,
    GENLAYER_PRIVATE_KEY: issuerSigner.privateKey,
    RESERVECOVENANT_CHALLENGER_PRIVATE_KEY: challengerPrivKey,
    RESERVECOVENANT_RUN_LIVE_TESTS: "1",
    RESERVECOVENANT_FIXTURE_BASE_URL: fixtureBaseUrl,
    PYTHONUTF8: "1",
  };

  console.log("[orchestration] Launching Python live integration test suite...");
  const pythonCmd = process.platform === "win32" ? "pytest" : "pytest";
  const result = spawnSync(pythonCmd, ["tests/integration/test_reservecovenant_live.py", "-v"], {
    stdio: "inherit",
    shell: true,
    env: childEnv,
    cwd: process.cwd(),
  });

  // 9. Zero and clear references
  challengerPrivKey = null;
  childEnv = null;

  const exitCode = result.status ?? (result.error ? 1 : 0);
  console.log(`[orchestration] Python live integration suite completed with exit code: ${exitCode}`);
  process.exit(exitCode);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runPythonLiveIntegration().catch((err) => {
    console.error("Fatal launcher error:", err);
    process.exit(1);
  });
}
