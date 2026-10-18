/**
 * Live Integration Harness for ReserveCovenant on GenLayer Studio Devnet.
 *
 * Implemented using public genlayer-js APIs (zero private monkey-patches).
 *
 * Distinct Signer Strategy:
 * - Issuer: Resolved from OS keychain via resolveSigner().
 * - Challenger: Generated as a fresh ephemeral account in process memory via
 *   generatePrivateKey() / createAccount().
 * - Strict assertion: normalized issuer address != normalized challenger address.
 * - Issuer funds the ephemeral challenger with minimal bond and fee allocation.
 * - Challenger signs open_challenge calls; issuer signs deploy and publish_epoch.
 * - Permissionless resolve_challenge calls are signed by issuer.
 *
 * Gates:
 * - Default: Safely skips before any network write unless RESERVECOVENANT_RUN_LIVE_TESTS=1.
 * - Public Fixture Gate: Requires RESERVECOVENANT_FIXTURE_BASE_URL pointing to immutable commit-pinned
 *   public HTTPS fixture URLs. If unconfigured or mutable (e.g. /main/), reports
 *   BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION and halts before any write.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, createAccount, generatePrivateKey, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";
import { validateImmutableFixtureBaseUrl } from "./fixture_url_validator.js";

export const DEFAULT_ISSUER_BOND = 10000000000000000n; // 0.01 GEN
export const DEFAULT_CHALLENGER_BOND = 5000000000000000n; // 0.005 GEN
export const DEFAULT_CATEGORIES = ["bank_deposits", "cash", "us_treasuries"];

export interface ScenarioRecord {
  scenarioId: number;
  name: string;
  contractAddress: string;
  deployTxHash?: string;
  publishTxHash?: string;
  challengeTxHash?: string;
  resolveTxHash?: string;
  finalStatus: string;
  accountingInvariant: boolean;
}

export interface ScenarioCallSpec {
  scenarioId: number;
  name: string;
  challengeType?: string;
  snapshotFile: string;
  evidenceFile?: string;
  citation?: string;
  statement?: string;
  expectedFinalStatus: string;
}

/**
 * Pure declarative plan of all 8 live scenarios.
 * Used for both offline harness validation and live network execution.
 */
export function getLiveScenariosSpec(): ScenarioCallSpec[] {
  return [
    {
      scenarioId: 1,
      name: "Deterministic Coverage Shortfall",
      challengeType: "COVERAGE_SHORTFALL",
      snapshotFile: "epoch-coverage-shortfall.json",
      evidenceFile: "challenger-unsupported-claim.json",
      citation: "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      statement: "Reported coverage is 95% which is below covenant minimum 100%",
      expectedFinalStatus: "BREACHED",
    },
    {
      scenarioId: 2,
      name: "Deterministic Ineligible Reserve",
      challengeType: "INELIGIBLE_RESERVE",
      snapshotFile: "epoch-ineligible-reserve.json",
      evidenceFile: "challenger-unsupported-claim.json",
      citation: "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      statement: "Reported reserves include disallowed equities category",
      expectedFinalStatus: "BREACHED",
    },
    {
      scenarioId: 3,
      name: "Future-Dated Stale Report",
      challengeType: "STALE_REPORT",
      snapshotFile: "epoch-future-dated.json",
      evidenceFile: "challenger-unsupported-claim.json",
      citation: "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      statement: "Report timestamp as_of_unix is in the future",
      expectedFinalStatus: "BREACHED",
    },
    {
      scenarioId: 4,
      name: "Material Disclaimer Semantic Breach",
      challengeType: "MATERIAL_DISCLAIMER",
      snapshotFile: "epoch-material-disclaimer.json",
      evidenceFile: "challenger-material-disclaimer.json",
      citation: "The reserves reported herein are subject to general commercial claims of the parent custodian and may be encumbered under credit facilities.",
      statement: "Attestation text explicitly disclaims reserve segregation and admits commercial liens",
      expectedFinalStatus: "BREACHED",
    },
    {
      scenarioId: 5,
      name: "Unsupported Semantic Accusation Upheld",
      challengeType: "OMITTED_LIABILITY",
      snapshotFile: "epoch-compliant.json",
      evidenceFile: "challenger-unsupported-claim.json",
      citation: "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
      statement: "Frivolous allegation with clean evidence",
      expectedFinalStatus: "UPHELD",
    },
    {
      scenarioId: 6,
      name: "Unreachable Evidence Resolves Inconclusive",
      challengeType: "COVERAGE_SHORTFALL",
      snapshotFile: "unreachable",
      evidenceFile: "unreachable",
      citation: "sample citation string longer than 16 characters",
      statement: "Testing unresolvable evidence",
      expectedFinalStatus: "INCONCLUSIVE",
    },
    {
      scenarioId: 7,
      name: "Repeated Resolution Reverts",
      challengeType: "COVERAGE_SHORTFALL",
      snapshotFile: "unreachable",
      evidenceFile: "unreachable",
      citation: "sample citation string longer than 16 characters",
      statement: "Testing repeated resolution on fresh contract",
      expectedFinalStatus: "INCONCLUSIVE",
    },
    {
      scenarioId: 8,
      name: "Pull-Credit Withdrawal & No Double-Spend",
      snapshotFile: "unreachable",
      expectedFinalStatus: "CANCELLED",
    },
  ];
}

export function assertSignerSeparation(issuerAddr: string, challengerAddr: string): void {
  const normIssuer = issuerAddr.toLowerCase().trim();
  const normChallenger = challengerAddr.toLowerCase().trim();
  if (normIssuer === normChallenger) {
    throw new Error(
      `Signer separation check failed: Issuer and Challenger cannot share address ${normIssuer}. ` +
      `ReserveCovenant rejects issuer self-challenges.`
    );
  }
}

async function deployDisposableInstance(
  issuerClient: any,
  contractSource: string,
  issuerAddr: string
): Promise<{ address: string; txHash: string }> {
  const constructorArgs = [
    issuerAddr,
    issuerAddr,
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

  const feeEstimate = await issuerClient.estimateTransactionFees();
  const txHash = await issuerClient.deployContract({
    code: contractSource,
    args: constructorArgs,
    leaderOnly: false,
    fees: {
      distribution: feeEstimate.distribution,
      feeValue: feeEstimate.feeValue,
      messageAllocations: feeEstimate.messageAllocations,
    },
  });

  const receipt = await issuerClient.waitForTransactionReceipt({ hash: txHash });
  if (!isSuccessful(receipt)) {
    throw new Error(`Disposable deployment failed for tx ${txHash}`);
  }
  const deployedAddress = (receipt as any).contractAddress || (receipt as any).recipient;
  if (!deployedAddress) {
    throw new Error(`Disposable deployment produced no contract address`);
  }
  return { address: deployedAddress, txHash };
}

async function runLiveIntegration(): Promise<void> {
  console.log("=== ReserveCovenant Live Integration Test Suite ===");

  // 1. Safe default skip
  if (process.env.RESERVECOVENANT_RUN_LIVE_TESTS !== "1") {
    console.log("[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.");
    console.log("No transactions were submitted to the network.");
    return;
  }

  // 2. Strict public fixture validation
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
  console.log(`Issuer public address:     ${issuerSigner.address}`);

  // 4. Generate distinct in-memory Ephemeral Challenger Signer
  let challengerPrivKey: `0x${string}` | null = generatePrivateKey();
  const challengerAccount = createAccount(challengerPrivKey);
  console.log(`Challenger public address: ${challengerAccount.address}`);

  // Assert signer separation
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

  // Fund ephemeral challenger from issuer with minimal bond and fee allocation
  const fundingAmount = 50000000000000000n; // 0.05 GEN
  console.log(`Funding ephemeral challenger with ${fundingAmount} wei...`);
  const fundTx = await (issuerClient as any).sendTransaction({
    account: issuerSigner.account,
    to: challengerAccount.address,
    value: fundingAmount,
  });
  await issuerClient.waitForTransactionReceipt({ hash: fundTx as any });
  console.log(`Funded challenger: tx ${fundTx}`);

  // Zero/clear private key variable reference from memory
  challengerPrivKey = null;

  const contractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  const contractSource = fs.readFileSync(contractPath, "utf-8");
  const fixturesDir = path.resolve(process.cwd(), "fixtures");

  const getFixtureSha = (filename: string): string => {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(fixturesDir, filename))).digest("hex");
  };

  const execWrite = async (
    actingClient: any,
    addr: string,
    fn: string,
    args: any[],
    val: bigint = 0n
  ): Promise<string> => {
    const feeEstimate = await actingClient.estimateTransactionFees();
    const hash = await actingClient.writeContract({
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
    const receipt = await actingClient.waitForTransactionReceipt({ hash });
    if (!isSuccessful(receipt)) {
      throw new Error(`Transaction ${fn} failed on-chain: tx ${hash}`);
    }
    return hash;
  };

  const records: ScenarioRecord[] = [];

  // Helper to run standard challenged scenario
  const runStandardChallengedScenario = async (
    spec: ScenarioCallSpec
  ): Promise<ScenarioRecord> => {
    console.log(`\n--- Scenario ${spec.scenarioId}: ${spec.name} ---`);
    const { address: dispAddr, txHash: depTx } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.address);
    console.log(`Disposable contract deployed: ${dispAddr}`);

    let snapUrl: string;
    let snapSha: string;
    if (spec.snapshotFile === "unreachable") {
      snapUrl = "https://unreachable-domain-12345.example.com/snapshot.json";
      snapSha = "0".repeat(64);
    } else {
      snapUrl = `${fixtureBaseUrl}/${spec.snapshotFile}`;
      snapSha = getFixtureSha(spec.snapshotFile);
    }

    const pubTx = await execWrite(issuerClient, dispAddr, "publish_epoch", [snapUrl, snapSha], DEFAULT_ISSUER_BOND);

    let evUrl: string;
    let evSha: string;
    if (spec.evidenceFile === "unreachable") {
      evUrl = "https://unreachable-domain-12345.example.com/evidence.json";
      evSha = "1".repeat(64);
    } else {
      evUrl = `${fixtureBaseUrl}/${spec.evidenceFile}`;
      evSha = getFixtureSha(spec.evidenceFile!);
    }

    // Challenger signs open_challenge
    const chalTx = await execWrite(
      challengerClient,
      dispAddr,
      "open_challenge",
      [1, spec.challengeType, evUrl, evSha, spec.citation, spec.statement],
      DEFAULT_CHALLENGER_BOND
    );

    // Permissionless resolution (signed by issuer client)
    const resTx = await execWrite(issuerClient, dispAddr, "resolve_challenge", [1]);

    const status = await issuerClient.readContract({
      address: dispAddr as any,
      functionName: "get_current_status",
      args: [],
    });

    if (status !== spec.expectedFinalStatus) {
      throw new Error(`Scenario ${spec.scenarioId} failed: expected ${spec.expectedFinalStatus}, got ${status}`);
    }

    const accounting = await issuerClient.readContract({
      address: dispAddr as any,
      functionName: "get_accounting",
      args: [],
    });

    const record: ScenarioRecord = {
      scenarioId: spec.scenarioId,
      name: spec.name,
      contractAddress: dispAddr,
      deployTxHash: depTx,
      publishTxHash: pubTx,
      challengeTxHash: chalTx,
      resolveTxHash: resTx,
      finalStatus: status as string,
      accountingInvariant: Boolean((accounting as any).invariant_satisfied),
    };

    console.log(`[PASS] Scenario ${spec.scenarioId} completed: Status=${status}, Invariant=${record.accountingInvariant}`);
    return record;
  };

  const specs = getLiveScenariosSpec();

  // Run Scenarios 1..6
  for (let i = 0; i < 6; i++) {
    records.push(await runStandardChallengedScenario(specs[i]));
  }

  // --- Scenario 7: Repeated Resolution Reverts on FRESH Contract ---
  console.log("\n--- Scenario 7: Repeated Resolution Reverts (Fresh Contract) ---");
  const { address: addr7, txHash: depTx7 } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.address);
  const pubTx7 = await execWrite(
    issuerClient,
    addr7,
    "publish_epoch",
    ["https://unreachable-domain-12345.example.com/snapshot.json", "0".repeat(64)],
    DEFAULT_ISSUER_BOND
  );
  const chalTx7 = await execWrite(
    challengerClient,
    addr7,
    "open_challenge",
    [
      1,
      "COVERAGE_SHORTFALL",
      "https://unreachable-domain-12345.example.com/evidence.json",
      "1".repeat(64),
      "sample citation string longer than 16 characters",
      "Repeated resolution test",
    ],
    DEFAULT_CHALLENGER_BOND
  );
  const resTx7 = await execWrite(issuerClient, addr7, "resolve_challenge", [1]);
  const status7Before = await issuerClient.readContract({
    address: addr7 as any,
    functionName: "get_current_status",
    args: [],
  });
  if (status7Before !== "INCONCLUSIVE") {
    throw new Error(`Scenario 7 setup failed: expected INCONCLUSIVE, got ${status7Before}`);
  }

  // Second resolution must revert
  let secondResolveFailed = false;
  try {
    await execWrite(issuerClient, addr7, "resolve_challenge", [1]);
  } catch (err: any) {
    secondResolveFailed = true;
    const msg = String(err.message || err);
    console.log(`Scenario 7: Re-resolve correctly rejected with: ${msg}`);
  }

  if (!secondResolveFailed) {
    throw new Error("Scenario 7 FAILED: Re-resolving terminal epoch unexpectedly succeeded");
  }

  // Verify state remained unchanged after failed second call
  const status7After = await issuerClient.readContract({
    address: addr7 as any,
    functionName: "get_current_status",
    args: [],
  });
  if (status7After !== "INCONCLUSIVE") {
    throw new Error(`Scenario 7 FAILED: State mutated on revert, got ${status7After}`);
  }

  records.push({
    scenarioId: 7,
    name: "Repeated Resolution Reverts",
    contractAddress: addr7,
    deployTxHash: depTx7,
    publishTxHash: pubTx7,
    challengeTxHash: chalTx7,
    resolveTxHash: resTx7,
    finalStatus: status7After as string,
    accountingInvariant: true,
  });
  console.log(`[PASS] Scenario 7 completed: Fresh contract ${addr7} re-resolution reverted cleanly; state preserved.`);

  // --- Scenario 8: Pull-Credit Withdrawal & No Double-Spend ---
  console.log("\n--- Scenario 8: Pull-Credit Withdrawal & No Double-Spend ---");
  const { address: addr8, txHash: depTx8 } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.address);
  const pubTx8 = await execWrite(
    issuerClient,
    addr8,
    "publish_epoch",
    ["https://unreachable-domain-12345.example.com/snapshot.json", "0".repeat(64)],
    DEFAULT_ISSUER_BOND
  );
  const cancelTx8 = await execWrite(issuerClient, addr8, "cancel_epoch", [1]);

  const creditBefore = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_credit",
    args: [issuerSigner.address],
  });
  if (BigInt(creditBefore as any) !== DEFAULT_ISSUER_BOND) {
    throw new Error(`Scenario 8 failed: credit before withdrawal was not equal to issuer bond`);
  }

  const withdrawTx8 = await execWrite(issuerClient, addr8, "withdraw_credit", []);
  const creditAfter = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_credit",
    args: [issuerSigner.address],
  });
  if (BigInt(creditAfter as any) !== 0n) {
    throw new Error(`Scenario 8 failed: credit after withdrawal is not 0`);
  }

  const acct8 = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!(acct8 as any).invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after first withdrawal");
  }

  let doubleWithdrawFailed = false;
  try {
    await execWrite(issuerClient, addr8, "withdraw_credit", []);
  } catch (err: any) {
    doubleWithdrawFailed = true;
    console.log(`Scenario 8: Double withdrawal correctly rejected: ${err.message || err}`);
  }

  if (!doubleWithdrawFailed) {
    throw new Error("Scenario 8 FAILED: Double withdrawal unexpectedly succeeded");
  }

  records.push({
    scenarioId: 8,
    name: "Pull-Credit Withdrawal & No Double-Spend",
    contractAddress: addr8,
    deployTxHash: depTx8,
    publishTxHash: pubTx8,
    challengeTxHash: cancelTx8,
    resolveTxHash: withdrawTx8,
    finalStatus: "CANCELLED",
    accountingInvariant: true,
  });
  console.log(`[PASS] Scenario 8 completed: Single withdrawal succeeded and double withdrawal reverted cleanly.`);

  console.log("\n=== ALL 8 LIVE INTEGRATION SCENARIOS PASSED ===");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runLiveIntegration().catch((err) => {
    console.error("Live integration test error:", err);
    process.exit(1);
  });
}
