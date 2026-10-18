/**
 * Live Integration Harness for ReserveCovenant on GenLayer Studio Devnet.
 *
 * Implemented using public genlayer-js APIs (zero private monkey-patches).
 *
 * Executable Scenarios:
 * 1. Deterministic coverage shortfall resolves BREACHED.
 * 2. Deterministic ineligible reserve resolves BREACHED.
 * 3. Future-dated report under STALE_REPORT resolves BREACHED.
 * 4. Clear material disclaimer with hash-verified evidence resolves semantic BREACHED.
 * 5. Unsupported semantic accusation resolves UPHELD.
 * 6. Unreachable or hash-mismatched evidence resolves INCONCLUSIVE.
 * 7. Repeated resolution of a terminal epoch reverts.
 * 8. Pull-credit withdrawal succeeds once and cannot double-withdraw.
 *
 * Gates:
 * - Default: Safely skips before any network write unless RESERVECOVENANT_RUN_LIVE_TESTS=1.
 * - Fixture Gate: Requires RESERVECOVENANT_FIXTURE_BASE_URL pointing to immutable commit-pinned
 *   public HTTPS fixture URLs. If unconfigured, reports BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createClient, isSuccessful } from "genlayer-js";
import type { TransactionFeeOptions } from "genlayer-js/types";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

const DEFAULT_ISSUER_BOND = 10000000000000000n; // 0.01 GEN
const DEFAULT_CHALLENGER_BOND = 5000000000000000n; // 0.005 GEN
const DEFAULT_CATEGORIES = ["bank_deposits", "cash", "us_treasuries"];

async function deployDisposableInstance(client: any, contractSource: string, deployerAddr: string): Promise<string> {
  const constructorArgs = [
    deployerAddr,
    deployerAddr,
    "usd-reserve-covenant",
    "USDR",
    "Reserve assets must be held in segregated bank deposits or direct US treasuries, unencumbered.",
    DEFAULT_CATEGORIES,
    10000,
    604800,
    86400,
    86400,
    DEFAULT_ISSUER_BOND,
    DEFAULT_CHALLENGER_BOND,
    1000,
  ];

  const feeEstimate = await client.estimateTransactionFees();
  const txHash = await client.deployContract({
    code: contractSource,
    args: constructorArgs,
    leaderOnly: false,
    fees: {
      distribution: feeEstimate.distribution,
      feeValue: feeEstimate.feeValue,
      messageAllocations: feeEstimate.messageAllocations,
    },
  });

  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (!isSuccessful(receipt)) {
    throw new Error(`Disposable deployment failed for tx ${txHash}`);
  }
  const deployedAddress = (receipt as any).contractAddress || (receipt as any).recipient;
  if (!deployedAddress) {
    throw new Error(`Disposable deployment produced no contract address`);
  }
  return deployedAddress;
}

async function runLiveIntegration(): Promise<void> {
  console.log("=== ReserveCovenant Live Integration Test Suite ===");

  if (process.env.RESERVECOVENANT_RUN_LIVE_TESTS !== "1") {
    console.log("[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.");
    console.log("No transactions were submitted to the network.");
    return;
  }

  const fixtureBaseUrl = (process.env.RESERVECOVENANT_FIXTURE_BASE_URL || "").trim();
  if (!fixtureBaseUrl.startsWith("https://")) {
    console.log("[BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION] GenLayer consensus validators require immutable public HTTPS fixture URLs.");
    console.log("No public repository exists yet for commit-pinned fixtures. Stopping before live scenario transactions.");
    return;
  }

  const signer = await resolveSigner({ checkBalance: true });
  console.log(`Live tester account: ${signer.address}`);

  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: signer.account,
  });

  const contractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  const contractSource = fs.readFileSync(contractPath, "utf-8");
  const fixturesDir = path.resolve(process.cwd(), "fixtures");

  const getFixtureSha = (filename: string): string => {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(fixturesDir, filename))).digest("hex");
  };

  // Helper for write transactions
  const execWrite = async (addr: string, fn: string, args: any[], val: bigint = 0n): Promise<void> => {
    const feeEstimate = await client.estimateTransactionFees();
    const hash = await client.writeContract({
      address: addr as any,
      functionName: fn,
      args,
      value: val,
      fees: {
        distribution: feeEstimate.distribution,
        feeValue: feeEstimate.feeValue,
        messageAllocations: feeEstimate.messageAllocations,
      },
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (!isSuccessful(receipt)) {
      throw new Error(`Transaction ${fn} failed: tx ${hash}`);
    }
  };

  console.log("\n--- Scenario 1: Deterministic Coverage Shortfall ---");
  const addr1 = await deployDisposableInstance(client, contractSource, signer.address);
  const snap1Sha = getFixtureSha("epoch-coverage-shortfall.json");
  await execWrite(addr1, "publish_epoch", [`${fixtureBaseUrl}/epoch-coverage-shortfall.json`, snap1Sha], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr1,
    "open_challenge",
    [
      1,
      "COVERAGE_SHORTFALL",
      `${fixtureBaseUrl}/challenger-unsupported-claim.json`,
      getFixtureSha("challenger-unsupported-claim.json"),
      "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      "Coverage shortfall: reported 95% against 100% policy minimum",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr1, "resolve_challenge", [1]);
  const status1 = await client.readContract({ address: addr1 as any, functionName: "get_current_status", args: [] });
  if (status1 !== "BREACHED") throw new Error(`Scenario 1 failed: expected BREACHED, got ${status1}`);
  console.log(`[PASS] Scenario 1 completed. Disposable contract ${addr1} resolved BREACHED.`);

  console.log("\n--- Scenario 2: Deterministic Ineligible Reserve ---");
  const addr2 = await deployDisposableInstance(client, contractSource, signer.address);
  const snap2Sha = getFixtureSha("epoch-ineligible-reserve.json");
  await execWrite(addr2, "publish_epoch", [`${fixtureBaseUrl}/epoch-ineligible-reserve.json`, snap2Sha], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr2,
    "open_challenge",
    [
      1,
      "INELIGIBLE_RESERVE",
      `${fixtureBaseUrl}/challenger-unsupported-claim.json`,
      getFixtureSha("challenger-unsupported-claim.json"),
      "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      "Disallowed reserve category 'equities' present in reserves",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr2, "resolve_challenge", [1]);
  const status2 = await client.readContract({ address: addr2 as any, functionName: "get_current_status", args: [] });
  if (status2 !== "BREACHED") throw new Error(`Scenario 2 failed: expected BREACHED, got ${status2}`);
  console.log(`[PASS] Scenario 2 completed. Disposable contract ${addr2} resolved BREACHED.`);

  console.log("\n--- Scenario 3: Future-Dated Stale Report ---");
  const addr3 = await deployDisposableInstance(client, contractSource, signer.address);
  const snap3Sha = getFixtureSha("epoch-future-dated.json");
  await execWrite(addr3, "publish_epoch", [`${fixtureBaseUrl}/epoch-future-dated.json`, snap3Sha], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr3,
    "open_challenge",
    [
      1,
      "STALE_REPORT",
      `${fixtureBaseUrl}/challenger-unsupported-claim.json`,
      getFixtureSha("challenger-unsupported-claim.json"),
      "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      "Future-dated report timestamp violates covenant policy",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr3, "resolve_challenge", [1]);
  const status3 = await client.readContract({ address: addr3 as any, functionName: "get_current_status", args: [] });
  if (status3 !== "BREACHED") throw new Error(`Scenario 3 failed: expected BREACHED, got ${status3}`);
  console.log(`[PASS] Scenario 3 completed. Disposable contract ${addr3} resolved BREACHED.`);

  console.log("\n--- Scenario 4: Material Disclaimer Semantic Breach ---");
  const addr4 = await deployDisposableInstance(client, contractSource, signer.address);
  const snap4Sha = getFixtureSha("epoch-material-disclaimer.json");
  await execWrite(addr4, "publish_epoch", [`${fixtureBaseUrl}/epoch-material-disclaimer.json`, snap4Sha], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr4,
    "MATERIAL_DISCLAIMER",
    [
      1,
      "MATERIAL_DISCLAIMER",
      `${fixtureBaseUrl}/challenger-material-disclaimer.json`,
      getFixtureSha("challenger-material-disclaimer.json"),
      "The reserves reported herein are subject to general commercial claims of the parent custodian and may be encumbered under credit facilities.",
      "Attestation text explicitly disclaims reserve segregation and admits commercial liens",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr4, "resolve_challenge", [1]);
  const status4 = await client.readContract({ address: addr4 as any, functionName: "get_current_status", args: [] });
  if (status4 !== "BREACHED") throw new Error(`Scenario 4 failed: expected BREACHED, got ${status4}`);
  console.log(`[PASS] Scenario 4 completed. Disposable contract ${addr4} resolved BREACHED.`);

  console.log("\n--- Scenario 5: Unsupported Semantic Accusation Upheld ---");
  const addr5 = await deployDisposableInstance(client, contractSource, signer.address);
  const snap5Sha = getFixtureSha("epoch-compliant.json");
  await execWrite(addr5, "publish_epoch", [`${fixtureBaseUrl}/epoch-compliant.json`, snap5Sha], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr5,
    "open_challenge",
    [
      1,
      "OMITTED_LIABILITY",
      `${fixtureBaseUrl}/challenger-unsupported-claim.json`,
      getFixtureSha("challenger-unsupported-claim.json"),
      "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      "Frivolous allegation with clean evidence",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr5, "resolve_challenge", [1]);
  const status5 = await client.readContract({ address: addr5 as any, functionName: "get_current_status", args: [] });
  if (status5 !== "UPHELD") throw new Error(`Scenario 5 failed: expected UPHELD, got ${status5}`);
  console.log(`[PASS] Scenario 5 completed. Disposable contract ${addr5} resolved UPHELD.`);

  console.log("\n--- Scenario 6: Unreachable Evidence Resolves Inconclusive ---");
  const addr6 = await deployDisposableInstance(client, contractSource, signer.address);
  await execWrite(addr6, "publish_epoch", ["https://unreachable-host.example.com/snapshot.json", "0".repeat(64)], DEFAULT_ISSUER_BOND);
  await execWrite(
    addr6,
    "open_challenge",
    [
      1,
      "COVERAGE_SHORTFALL",
      "https://unreachable-host.example.com/evidence.json",
      "1".repeat(64),
      "sample citation string longer than 16 characters",
      "Testing unresolvable evidence",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  await execWrite(addr6, "resolve_challenge", [1]);
  const status6 = await client.readContract({ address: addr6 as any, functionName: "get_current_status", args: [] });
  if (status6 !== "INCONCLUSIVE") throw new Error(`Scenario 6 failed: expected INCONCLUSIVE, got ${status6}`);
  console.log(`[PASS] Scenario 6 completed. Disposable contract ${addr6} resolved INCONCLUSIVE.`);

  console.log("\n--- Scenario 7: Repeated Resolution Reverts ---");
  let threwTerminalError = false;
  try {
    await execWrite(addr6, "resolve_challenge", [1]);
  } catch {
    threwTerminalError = true;
  }
  if (!threwTerminalError) throw new Error("Scenario 7 failed: expected repeated resolution to revert");
  console.log(`[PASS] Scenario 7 completed. Re-resolving terminal epoch successfully reverted.`);

  console.log("\n--- Scenario 8: Pull-Credit Withdrawal & No Double-Spend ---");
  const addr8 = await deployDisposableInstance(client, contractSource, signer.address);
  await execWrite(addr8, "publish_epoch", ["https://unreachable-host.example.com/snapshot.json", "0".repeat(64)], DEFAULT_ISSUER_BOND);
  await execWrite(addr8, "cancel_epoch", [1]);
  const creditBefore = await client.readContract({ address: addr8 as any, functionName: "get_credit", args: [signer.address] });
  if (BigInt(creditBefore as any) !== DEFAULT_ISSUER_BOND) {
    throw new Error(`Scenario 8 failed: credit before withdrawal was not equal to issuer bond`);
  }
  await execWrite(addr8, "withdraw_credit", []);
  const creditAfter = await client.readContract({ address: addr8 as any, functionName: "get_credit", args: [signer.address] });
  if (BigInt(creditAfter as any) !== 0n) {
    throw new Error(`Scenario 8 failed: credit after withdrawal is not 0`);
  }
  let threwDoubleWithdraw = false;
  try {
    await execWrite(addr8, "withdraw_credit", []);
  } catch {
    threwDoubleWithdraw = true;
  }
  if (!threwDoubleWithdraw) throw new Error("Scenario 8 failed: expected double withdrawal to revert");
  console.log(`[PASS] Scenario 8 completed. Single withdrawal succeeded and double withdrawal reverted.`);

  console.log("\n=== ALL 8 LIVE INTEGRATION SCENARIOS PASSED ===");
}

const isMain = process.argv[1] && process.argv[1].endsWith("run_live_integration.ts");
if (isMain) {
  runLiveIntegration().catch((err) => {
    console.error("Live integration test error:", err);
    process.exit(1);
  });
}

export { runLiveIntegration };
