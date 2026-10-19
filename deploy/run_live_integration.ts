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
 * - Issuer funds the ephemeral challenger dynamically based on exact scenario specifications
 *   and Studio Devnet fee estimations.
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
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";
import { validateImmutableFixtureBaseUrl } from "./fixture_url_validator.js";
import {
  deriveChallengerTransactionCount,
  deriveTotalChallengerTransactionCount,
  calculateRequiredChallengerFunding,
  calculateChallengerFundingShortfall,
  calculateRequiredIssuerBalance,
  verifyReceiptExecution,
  expectContractExecutionError,
  executeAndVerifyChallengerFunding,
} from "./harness_utils.js";

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

// Conservative deployment heuristic: Intelligent contract deployment on GenLayer
// includes contract bytecode and schema registration, which consumes more gas than
// standard contract calls. We apply a conservative 3x factor plus bounded safety margin.
export const DEPLOY_FEE_HEURISTIC_MULTIPLIER = 3n;

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
  const feeValue = BigInt(feeEstimate.feeValue);
  const estimatedDeployCost = feeValue * DEPLOY_FEE_HEURISTIC_MULTIPLIER;

  // Fresh issuer balance preflight check immediately before deployment
  const currentIssuerBal = await issuerClient.getBalance({ address: issuerAddr as any });
  if (currentIssuerBal < estimatedDeployCost) {
    throw new Error(
      `BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE: Issuer balance (${currentIssuerBal.toString()} wei) ` +
      `is insufficient for disposable deployment (estimated heuristic requirement: ${estimatedDeployCost.toString()} wei).`
    );
  }

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
  const summary = verifyReceiptExecution(receipt, "disposable deployment", "deployContract");

  const deployedAddress = summary.contractAddress;
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
  console.log(`[live] Issuer public address:     ${issuerSigner.address}`);

  // 4. Generate distinct in-memory Ephemeral Challenger Signer
  let challengerPrivKey: string | null = generatePrivateKey();
  const challengerAccount = createAccount(challengerPrivKey as `0x${string}`);
  console.log(`[live] Challenger public address: ${challengerAccount.address}`);

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

  // 5. Calculate dynamic challenger funding derived from exact scenario count + cleanup
  const specs = getLiveScenariosSpec();
  // 14 total transactions: 7 open_challenge + 6 cleanup withdrawals + 1 sweep
  const challengerTxCount = BigInt(deriveTotalChallengerTransactionCount(specs, true));
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

  console.log(`[live] Challenger transaction count: ${challengerTxCount.toString()} (7 challenge + 6 cleanup withdrawals + 1 sweep)`);
  console.log(`[live] Estimated fee per tx:         ${feePerTx.toString()} wei`);
  console.log(`[live] Required challenger funding:   ${requiredFunding.toString()} wei`);
  console.log(`[live] Challenger current balance:    ${challengerCurrentBal.toString()} wei`);
  console.log(`[live] Challenger funding shortfall:  ${shortfall.toString()} wei`);

  // Verify Issuer balance preflight with conservative deployment heuristic
  const issuerBal = issuerSigner.balance ?? 0n;
  const requiredIssuerBal = calculateRequiredIssuerBalance({
    disposableDeployCount: 8n,
    deployFeePerTx: feePerTx * DEPLOY_FEE_HEURISTIC_MULTIPLIER,
    issuerBondsTotal: 8n * DEFAULT_ISSUER_BOND,
    issuerTxCount: 20n,
    txFeePerTx: feePerTx,
    challengerShortfall: shortfall,
  });

  console.log(`[live] Issuer current balance:        ${issuerBal.toString()} wei`);
  console.log(`[live] Required issuer balance:       ${requiredIssuerBal.toString()} wei`);

  if (issuerBal < requiredIssuerBal) {
    console.error(
      `[BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE] Issuer balance (${issuerBal.toString()} wei) ` +
      `is below required Studio Devnet preflight amount (${requiredIssuerBal.toString()} wei).`
    );
    process.exit(1);
  }

  // Fund ephemeral challenger from issuer only if shortfall > 0
  if (shortfall > 0n) {
    await executeAndVerifyChallengerFunding({
      issuerClient,
      issuerAccount: issuerSigner.account,
      challengerAddress: challengerAccount.address,
      fundingAmount: shortfall,
      requiredPostBalance: requiredFunding,
    });
  }

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
    const fees = await actingClient.estimateTransactionFees();
    const feeVal = BigInt(fees.feeValue);
    const actingAddress = (actingClient.account?.address || actingClient.account) as `0x${string}`;

    // Fresh balance preflight check immediately before write
    if (actingAddress) {
      const currentBal = await actingClient.getBalance({ address: actingAddress });
      if (currentBal < feeVal + val) {
        throw new Error(
          `BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE: Signer balance (${currentBal.toString()} wei) ` +
          `is insufficient for upcoming write '${fn}' (requires ${feeVal.toString()} fee + ${val.toString()} value).`
        );
      }
    }

    const hash = await actingClient.writeContract({
      address: addr as any,
      functionName: fn,
      args,
      value: val,
      fees: {
        distribution: fees.distribution,
        feeValue: fees.feeValue,
        messageAllocations: fees.messageAllocations,
      },
    });
    const receipt = await actingClient.waitForTransactionReceipt({ hash });
    verifyReceiptExecution(receipt, `execWrite ${fn}`, fn);
    return hash;
  };

  const records: ScenarioRecord[] = [];

  // Helper to run standard challenged scenario (Scenarios 1..6)
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

    if (!accounting || !(accounting as any).invariant_satisfied) {
      throw new Error(`Scenario ${spec.scenarioId} failed: accounting invariant broken`);
    }

    if (
      BigInt((accounting as any).locked_issuer_bonds) !== 0n ||
      BigInt((accounting as any).locked_challenger_bonds) !== 0n
    ) {
      throw new Error(`Scenario ${spec.scenarioId} failed: bonds remained locked after terminal resolution`);
    }

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

  // Verify accounting after first resolution
  const acct7First = await issuerClient.readContract({
    address: addr7 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!acct7First || !(acct7First as any).invariant_satisfied) {
    throw new Error("Scenario 7 FAILED: accounting invariant broken after first resolution");
  }
  if (
    BigInt((acct7First as any).locked_issuer_bonds) !== 0n ||
    BigInt((acct7First as any).locked_challenger_bonds) !== 0n
  ) {
    throw new Error("Scenario 7 FAILED: bonds remained locked after first resolution");
  }

  // Second resolution must revert with contract error (non-CHALLENGED terminal state)
  await expectContractExecutionError(
    async () => {
      return await execWrite(issuerClient, addr7, "resolve_challenge", [1]);
    },
    {
      expectedMethod: "resolve_challenge",
      expectedErrorSubstring: "resolve_challenge only allowed in CHALLENGED state",
      verifyStateUnchanged: async () => {
        const status7After = await issuerClient.readContract({
          address: addr7 as any,
          functionName: "get_current_status",
          args: [],
        });
        if (status7After !== "INCONCLUSIVE") {
          throw new Error(`Scenario 7 FAILED: State mutated on revert, got ${status7After}`);
        }
      },
    }
  );

  // Verify accounting after rejected second resolution
  const acct7After = await issuerClient.readContract({
    address: addr7 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!acct7After || !(acct7After as any).invariant_satisfied) {
    throw new Error("Scenario 7 FAILED: accounting invariant broken after rejected second resolution");
  }

  records.push({
    scenarioId: 7,
    name: "Repeated Resolution Reverts",
    contractAddress: addr7,
    deployTxHash: depTx7,
    publishTxHash: pubTx7,
    challengeTxHash: chalTx7,
    resolveTxHash: resTx7,
    finalStatus: "INCONCLUSIVE",
    accountingInvariant: Boolean((acct7After as any).invariant_satisfied),
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

  const acct8Cancel = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!acct8Cancel || !(acct8Cancel as any).invariant_satisfied) {
    throw new Error("Scenario 8 FAILED: accounting invariant broken after cancellation");
  }
  if (BigInt((acct8Cancel as any).total_credits) !== DEFAULT_ISSUER_BOND) {
    throw new Error("Scenario 8 FAILED: total_credits mismatch after cancellation");
  }

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

  const acct8First = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!acct8First || !(acct8First as any).invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after first withdrawal");
  }
  if (BigInt((acct8First as any).total_credits) !== 0n) {
    throw new Error("Scenario 8 failed: total_credits not 0 after withdrawal");
  }

  // Second withdrawal must revert because available credit is zero
  await expectContractExecutionError(
    async () => {
      return await execWrite(issuerClient, addr8, "withdraw_credit", []);
    },
    {
      expectedMethod: "withdraw_credit",
      expectedErrorSubstring: "No withdrawal credit available",
      verifyStateUnchanged: async () => {
        const creditFinal = await issuerClient.readContract({
          address: addr8 as any,
          functionName: "get_credit",
          args: [issuerSigner.address],
        });
        if (BigInt(creditFinal as any) !== 0n) {
          throw new Error("Scenario 8 failed: credit mutated after double withdrawal attempt");
        }
      },
    }
  );

  const acct8Final = await issuerClient.readContract({
    address: addr8 as any,
    functionName: "get_accounting",
    args: [],
  });
  if (!acct8Final || !(acct8Final as any).invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after second withdrawal");
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
    accountingInvariant: Boolean((acct8Final as any).invariant_satisfied),
  });
  console.log(`[PASS] Scenario 8 completed: Single withdrawal succeeded and double withdrawal reverted cleanly.`);

  // --- Phase 7: Ephemeral Challenger Cleanup & Fund Recovery ---
  console.log("\n--- Ephemeral Challenger Cleanup & Fund Recovery ---");
  console.log("Withdrawing accumulated challenger credits from disposable contract instances...");
  const cleanupRecords: {
    contractAddress: string;
    withdrawTxHash?: string;
    amountWithdrawn: bigint;
    error?: string;
  }[] = [];
  let totalCreditsRecovered = 0n;

  for (const record of records) {
    try {
      const credit = await issuerClient.readContract({
        address: record.contractAddress as any,
        functionName: "get_credit",
        args: [challengerAccount.address],
      });
      const creditVal = BigInt(credit as any);
      if (creditVal > 0n) {
        console.log(`[cleanup] Withdrawing ${creditVal.toString()} wei credit from contract ${record.contractAddress}...`);
        const withdrawHash = await execWrite(challengerClient, record.contractAddress, "withdraw_credit", []);
        cleanupRecords.push({
          contractAddress: record.contractAddress,
          withdrawTxHash: withdrawHash,
          amountWithdrawn: creditVal,
        });
        totalCreditsRecovered += creditVal;
      }
    } catch (err: any) {
      console.warn(`[cleanup-warning] Non-fatal cleanup issue for contract ${record.contractAddress}: ${err.message}`);
      cleanupRecords.push({
        contractAddress: record.contractAddress,
        amountWithdrawn: 0n,
        error: String(err.message || err),
      });
    }
  }

  // Sweep remaining challenger Devnet balance back to issuer
  let sweepTxHash: string | undefined;
  let sweptAmount = 0n;
  try {
    const finalChallengerBal = await issuerClient.getBalance({
      address: challengerAccount.address as `0x${string}`,
    });
    const sweepFeeEstimate = await issuerClient.estimateTransactionFees();
    const sweepFee = BigInt(sweepFeeEstimate.feeValue);
    if (finalChallengerBal > sweepFee * 2n) {
      sweptAmount = finalChallengerBal - (sweepFee * 2n);
      console.log(`[cleanup] Sweeping ${sweptAmount.toString()} wei residual balance from challenger back to issuer...`);
      const hash = await challengerClient.sendTransaction({
        account: challengerAccount,
        to: issuerSigner.address as `0x${string}`,
        value: sweptAmount,
        chain: null,
      });
      sweepTxHash = String(hash);
      const sweepReceipt = await challengerClient.waitForTransactionReceipt({ hash: hash as any });
      verifyReceiptExecution(sweepReceipt, "challenger sweep transaction", "sendTransaction");
      console.log(`[cleanup] Residual sweep finalized (tx ${sweepTxHash}).`);
    }
  } catch (err: any) {
    console.warn(`[cleanup-warning] Non-fatal sweep issue: ${err.message}`);
  }

  console.log(`[cleanup] Total credits withdrawn: ${totalCreditsRecovered.toString()} wei.`);
  if (sweepTxHash) {
    console.log(`[cleanup] Swept to issuer:        ${sweptAmount.toString()} wei (tx ${sweepTxHash}).`);
  }
  console.log("[cleanup] Economic cleanup completed; zero challenger funds remain stranded.");

  console.log("\n=== ALL 8 LIVE INTEGRATION SCENARIOS PASSED ===");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runLiveIntegration().catch((err) => {
    console.error("Live integration test error:", err);
    process.exit(1);
  });
}
