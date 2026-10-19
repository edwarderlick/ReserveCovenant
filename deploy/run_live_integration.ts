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
import type { Address, Hash, Account } from "viem";
import type { TransactionHash, CalldataEncodable } from "genlayer-js/types";
import { resolveSigner } from "./signer.js";
import { validateImmutableFixtureBaseUrl } from "./fixture_url_validator.js";
import {
  deriveScenarioTransactionPlan,
  calculateRequiredChallengerFunding,
  calculateChallengerFundingShortfall,
  calculateRequiredIssuerBalance,
  verifyReceiptExecution,
  expectContractExecutionError,
  executeAndVerifyChallengerFunding,
  evaluateEconomicCleanup,
  buildExpectedCleanupManifest,
  WriteOperationError,
  ContractExecutionReceiptError,
  normalizeConsensusStatus,
  normalizeExecutionResult,
  type ExecWriteResult,
  type ExpectedCleanupTarget,
  type CleanupPartyResult,
  type SweepResultRecord,
  type PrimaryScenariosStatus,
  type ValidatedReceiptSummary,
} from "./harness_utils.js";

export const DEFAULT_ISSUER_BOND = 10000000000000000n; // 0.01 GEN
export const DEFAULT_CHALLENGER_BOND = 5000000000000000n; // 0.005 GEN
export const DEFAULT_CATEGORIES = ["bank_deposits", "cash", "us_treasuries"];

export interface ScenarioRecord {
  scenarioId: number;
  name: string;
  contractAddress: Address;
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

export type GenLayerClientType = ReturnType<typeof createClient>;

interface AccountingData {
  contract_balance: bigint;
  locked_issuer_bonds: bigint;
  locked_challenger_bonds: bigint;
  total_credits: bigint;
  invariant_satisfied: boolean;
}

function parseAccounting(val: unknown): AccountingData {
  if (val && typeof val === "object" && "invariant_satisfied" in val) {
    const o = val as Record<string, unknown>;
    return {
      contract_balance: BigInt(String(o.contract_balance ?? 0)),
      locked_issuer_bonds: BigInt(String(o.locked_issuer_bonds ?? 0)),
      locked_challenger_bonds: BigInt(String(o.locked_challenger_bonds ?? 0)),
      total_credits: BigInt(String(o.total_credits ?? 0)),
      invariant_satisfied: Boolean(o.invariant_satisfied),
    };
  }
  throw new Error("Invalid accounting data shape returned from contract");
}

function parseCredit(val: unknown): bigint {
  return BigInt(String(val ?? 0));
}

export function getLiveScenariosSpec(): ScenarioCallSpec[] {
  return [
    {
      scenarioId: 1,
      name: "Deterministic Coverage Shortfall Breach",
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
  issuerClient: GenLayerClientType,
  contractSource: string,
  issuerAddr: Address
): Promise<{ address: Address; txHash: string }> {
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
  const currentIssuerBal = await issuerClient.getBalance({ address: issuerAddr });
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

  const receipt = await issuerClient.waitForTransactionReceipt({ hash: txHash as unknown as TransactionHash });
  const summary = verifyReceiptExecution(receipt, "disposable deployment", "deployContract");

  const deployedAddress = summary.contractAddress as Address | undefined;
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
  const plan = deriveScenarioTransactionPlan(specs, true);
  const challengerTxCount = plan.challengerSignedTransactionCount;
  const challengeBondCount = plan.challengeBondTransactionCount;
  const feeEstimate = await issuerClient.estimateTransactionFees();
  const feePerTx = BigInt(feeEstimate.feeValue);

  const requiredFunding = calculateRequiredChallengerFunding({
    challengeBondTransactionCount: challengeBondCount,
    challengerSignedTransactionCount: challengerTxCount,
    challengerBond: DEFAULT_CHALLENGER_BOND,
    estimatedFeePerTx: feePerTx,
  });

  const challengerCurrentBal = await issuerClient.getBalance({
    address: challengerAccount.address,
  });
  const shortfall = calculateChallengerFundingShortfall(requiredFunding, challengerCurrentBal);

  console.log(`[live] Challenge bond transactions:  ${challengeBondCount.toString()}`);
  console.log(`[live] Challenger signed tx count:   ${challengerTxCount.toString()} (challenges + cleanup + sweep)`);
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
    issuerTxCount: plan.issuerSignedTransactionCount,
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
    actingClient: GenLayerClientType,
    addr: Address,
    fn: string,
    args: CalldataEncodable[] = [],
    val: bigint = 0n
  ): Promise<ExecWriteResult> => {
    const actingAddress = (actingClient.account?.address) as Address | undefined;
    if (!actingAddress) {
      throw new Error(
        `BLOCKED_MISSING_SIGNER_ADDRESS: actingClient.account?.address is unavailable for write '${fn}'`
      );
    }

    const fees = await actingClient.estimateTransactionFees();
    const feeVal = BigInt(fees.feeValue);
    // Bounded safety margin: 20% of estimated fee + 0.0001 GEN (100000000000000n wei)
    const safetyMargin = (feeVal * 20n) / 100n + 100000000000000n;
    const requiredBal = feeVal + val + safetyMargin;

    // Fresh balance preflight check immediately before write
    const currentBal = await actingClient.getBalance({ address: actingAddress });
    if (currentBal < requiredBal) {
      throw new Error(
        `BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE: Signer balance (${currentBal.toString()} wei) ` +
        `is insufficient for upcoming write '${fn}' (requires ${feeVal.toString()} fee + ${val.toString()} value + ${safetyMargin.toString()} safety margin = ${requiredBal.toString()} wei).`
      );
    }

    let hash: Hash;
    try {
      hash = (await actingClient.writeContract({
        address: addr,
        functionName: fn,
        args,
        value: val,
        fees: {
          distribution: fees.distribution,
          feeValue: fees.feeValue,
          messageAllocations: fees.messageAllocations,
        },
      })) as Hash;
    } catch (writeErr: unknown) {
      throw new WriteOperationError({
        message: `writeContract failed on '${fn}': ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        originalError: writeErr,
      });
    }

    let receipt: unknown;
    try {
      receipt = await actingClient.waitForTransactionReceipt({ hash: hash as unknown as TransactionHash });
    } catch (waitErr: unknown) {
      throw new WriteOperationError({
        message: `waitForTransactionReceipt failed on '${fn}' (tx ${hash}): ${waitErr instanceof Error ? waitErr.message : String(waitErr)}`,
        transactionHash: hash,
        originalError: waitErr,
      });
    }

    let summary: ValidatedReceiptSummary;
    try {
      summary = verifyReceiptExecution(receipt, `execWrite ${fn}`, fn);
    } catch (verifyErr: unknown) {
      const rec = receipt && typeof receipt === "object" ? (receipt as Record<string, unknown>) : undefined;
      const rawStatus = rec ? (rec.statusName !== undefined ? rec.statusName : rec.status) : undefined;
      const rawResult = rec ? (rec.txExecutionResultName !== undefined ? rec.txExecutionResultName : rec.txExecutionResult) : undefined;
      throw new WriteOperationError({
        message: `verifyReceiptExecution failed on '${fn}' (tx ${hash}): ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
        transactionHash: hash,
        rawReceipt: receipt,
        normalizedStatus: rawStatus !== undefined ? normalizeConsensusStatus(rawStatus) : undefined,
        normalizedExecutionResult: rawResult !== undefined ? normalizeExecutionResult(rawResult) : undefined,
        originalError: verifyErr,
      });
    }

    return {
      transactionHash: hash,
      receiptStatus: summary.status as "FINALIZED" | "ACCEPTED",
      executionResult: summary.executionResult as "FINISHED_WITH_RETURN",
      receiptSummary: summary,
    };
  };

  const records: ScenarioRecord[] = [];

  // Helper to run standard challenged scenario (Scenarios 1..6)
  const runStandardChallengedScenario = async (
    spec: ScenarioCallSpec
  ): Promise<ScenarioRecord> => {
    console.log(`\n--- Scenario ${spec.scenarioId}: ${spec.name} ---`);
    const { address: dispAddr, txHash: depTx } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.account.address);
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

    const pubRes = await execWrite(issuerClient, dispAddr, "publish_epoch", [snapUrl, snapSha], DEFAULT_ISSUER_BOND);

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
    const chalRes = await execWrite(
      challengerClient,
      dispAddr,
      "open_challenge",
      [1, spec.challengeType || "", evUrl, evSha, spec.citation || "", spec.statement || ""],
      DEFAULT_CHALLENGER_BOND
    );

    // Permissionless resolution (signed by issuer client)
    const resResult = await execWrite(issuerClient, dispAddr, "resolve_challenge", [1]);

    const status = await issuerClient.readContract({
      address: dispAddr,
      functionName: "get_current_status",
      args: [],
    });

    if (status !== spec.expectedFinalStatus) {
      throw new Error(`Scenario ${spec.scenarioId} failed: expected ${spec.expectedFinalStatus}, got ${status}`);
    }

    const accountingRaw = await issuerClient.readContract({
      address: dispAddr,
      functionName: "get_accounting",
      args: [],
    });
    const accounting = parseAccounting(accountingRaw);

    if (!accounting.invariant_satisfied) {
      throw new Error(`Scenario ${spec.scenarioId} failed: accounting invariant broken`);
    }

    if (accounting.locked_issuer_bonds !== 0n || accounting.locked_challenger_bonds !== 0n) {
      throw new Error(`Scenario ${spec.scenarioId} failed: bonds remained locked after terminal resolution`);
    }

    const record: ScenarioRecord = {
      scenarioId: spec.scenarioId,
      name: spec.name,
      contractAddress: dispAddr,
      deployTxHash: depTx,
      publishTxHash: pubRes.transactionHash,
      challengeTxHash: chalRes.transactionHash,
      resolveTxHash: resResult.transactionHash,
      finalStatus: status as string,
      accountingInvariant: accounting.invariant_satisfied,
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
  const { address: addr7, txHash: depTx7 } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.account.address);
  const pubRes7 = await execWrite(
    issuerClient,
    addr7,
    "publish_epoch",
    ["https://unreachable-domain-12345.example.com/snapshot.json", "0".repeat(64)],
    DEFAULT_ISSUER_BOND
  );
  const chalRes7 = await execWrite(
    challengerClient,
    addr7,
    "open_challenge",
    [
      1,
      "COVERAGE_SHORTFALL",
      "https://unreachable-domain-12345.example.com/evidence.json",
      "1".repeat(64),
      "sample citation string longer than 16 characters",
      "Repeated resolution test on fresh contract",
    ],
    DEFAULT_CHALLENGER_BOND
  );

  // First resolution succeeds and transitions to terminal INCONCLUSIVE
  const resRes7First = await execWrite(issuerClient, addr7, "resolve_challenge", [1]);
  const status7Before = await issuerClient.readContract({
    address: addr7,
    functionName: "get_current_status",
    args: [],
  });
  if (status7Before !== "INCONCLUSIVE") {
    throw new Error(`Scenario 7 failed: expected INCONCLUSIVE, got ${status7Before}`);
  }

  const acct7FirstRaw = await issuerClient.readContract({
    address: addr7,
    functionName: "get_accounting",
    args: [],
  });
  const acct7First = parseAccounting(acct7FirstRaw);
  if (!acct7First.invariant_satisfied) {
    throw new Error("Scenario 7 failed: accounting invariant broken after first resolution");
  }
  if (acct7First.locked_issuer_bonds !== 0n || acct7First.locked_challenger_bonds !== 0n) {
    throw new Error("Scenario 7 failed: bonds remained locked after first resolution");
  }

  // Second resolution must revert on-chain because epoch is no longer in CHALLENGED state
  await expectContractExecutionError(
    async () => {
      return (await execWrite(issuerClient, addr7, "resolve_challenge", [1])).receiptSummary.rawReceipt;
    },
    {
      expectedMethod: "resolve_challenge",
      expectedErrorSubstring: "resolve_challenge only allowed in CHALLENGED state",
      verifyStateUnchanged: async () => {
        const statusAfter = await issuerClient.readContract({
          address: addr7,
          functionName: "get_current_status",
          args: [],
        });
        if (statusAfter !== "INCONCLUSIVE") {
          throw new Error("Scenario 7 failed: contract status changed after revert");
        }
      },
    }
  );

  const acct7FinalRaw = await issuerClient.readContract({
    address: addr7,
    functionName: "get_accounting",
    args: [],
  });
  const acct7Final = parseAccounting(acct7FinalRaw);
  if (!acct7Final.invariant_satisfied) {
    throw new Error("Scenario 7 failed: accounting invariant broken after revert");
  }

  records.push({
    scenarioId: 7,
    name: "Repeated Resolution Reverts",
    contractAddress: addr7,
    deployTxHash: depTx7,
    publishTxHash: pubRes7.transactionHash,
    challengeTxHash: chalRes7.transactionHash,
    resolveTxHash: resRes7First.transactionHash,
    finalStatus: "INCONCLUSIVE",
    accountingInvariant: acct7Final.invariant_satisfied,
  });
  console.log(`[PASS] Scenario 7 completed: First resolution reached INCONCLUSIVE; second resolution reverted on-chain.`);

  // --- Scenario 8: Pull-Credit Withdrawal & No Double-Spend ---
  console.log("\n--- Scenario 8: Pull-Credit Withdrawal & No Double-Spend ---");
  const { address: addr8, txHash: depTx8 } = await deployDisposableInstance(issuerClient, contractSource, issuerSigner.account.address);
  const pubRes8 = await execWrite(
    issuerClient,
    addr8,
    "publish_epoch",
    ["https://unreachable-domain-12345.example.com/snapshot.json", "0".repeat(64)],
    DEFAULT_ISSUER_BOND
  );
  const cancelRes8 = await execWrite(issuerClient, addr8, "cancel_epoch", [1]);

  const acct8CancelRaw = await issuerClient.readContract({
    address: addr8,
    functionName: "get_accounting",
    args: [],
  });
  const acct8Cancel = parseAccounting(acct8CancelRaw);
  if (!acct8Cancel.invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after cancel_epoch");
  }
  if (acct8Cancel.total_credits !== DEFAULT_ISSUER_BOND) {
    throw new Error("Scenario 8 failed: total_credits does not match issuer bond after cancel");
  }

  // First withdrawal succeeds
  const creditBefore = parseCredit(await issuerClient.readContract({
    address: addr8,
    functionName: "get_credit",
    args: [issuerSigner.address],
  }));
  if (creditBefore !== DEFAULT_ISSUER_BOND) {
    throw new Error(`Scenario 8 failed: expected credit ${DEFAULT_ISSUER_BOND}, got ${creditBefore}`);
  }

  const withdrawRes8 = await execWrite(issuerClient, addr8, "withdraw_credit", []);
  const creditAfter = parseCredit(await issuerClient.readContract({
    address: addr8,
    functionName: "get_credit",
    args: [issuerSigner.address],
  }));
  if (creditAfter !== 0n) {
    throw new Error(`Scenario 8 failed: credit after withdrawal is not 0`);
  }

  const acct8FirstRaw = await issuerClient.readContract({
    address: addr8,
    functionName: "get_accounting",
    args: [],
  });
  const acct8First = parseAccounting(acct8FirstRaw);
  if (!acct8First.invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after first withdrawal");
  }
  if (acct8First.total_credits !== 0n) {
    throw new Error("Scenario 8 failed: total_credits not 0 after withdrawal");
  }

  // Second withdrawal must revert because available credit is zero
  await expectContractExecutionError(
    async () => {
      return (await execWrite(issuerClient, addr8, "withdraw_credit", [])).receiptSummary.rawReceipt;
    },
    {
      expectedMethod: "withdraw_credit",
      expectedErrorSubstring: "No withdrawal credit available",
      verifyStateUnchanged: async () => {
        const creditFinal = parseCredit(await issuerClient.readContract({
          address: addr8,
          functionName: "get_credit",
          args: [issuerSigner.address],
        }));
        if (creditFinal !== 0n) {
          throw new Error("Scenario 8 failed: credit mutated after double withdrawal attempt");
        }
      },
    }
  );

  const acct8FinalRaw = await issuerClient.readContract({
    address: addr8,
    functionName: "get_accounting",
    args: [],
  });
  const acct8Final = parseAccounting(acct8FinalRaw);
  if (!acct8Final.invariant_satisfied) {
    throw new Error("Scenario 8 failed: accounting invariant broken after second withdrawal");
  }

  records.push({
    scenarioId: 8,
    name: "Pull-Credit Withdrawal & No Double-Spend",
    contractAddress: addr8,
    deployTxHash: depTx8,
    publishTxHash: pubRes8.transactionHash,
    challengeTxHash: cancelRes8.transactionHash,
    resolveTxHash: withdrawRes8.transactionHash,
    finalStatus: "CANCELLED",
    accountingInvariant: acct8Final.invariant_satisfied,
  });
  console.log(`[PASS] Scenario 8 completed: Single withdrawal succeeded and double withdrawal reverted cleanly.`);

  // --- Phase 7: Comprehensive Economic Cleanup & Fund Recovery ---
  console.log("\n--- Phase 7: Comprehensive Economic Cleanup & Fund Recovery ---");
  console.log("Constructing exact expected cleanup manifest from completed scenario records...");

  const expectedTargets = buildExpectedCleanupManifest(records, specs);
  console.log(`Expected cleanup targets: ${expectedTargets.length} entries`);
  for (const target of expectedTargets) {
    console.log(
      ` - Scenario ${target.scenarioId} | Party: ${target.party.padEnd(10)} | Contract: ${target.contractAddress} | Expected: ${target.expectedCreditWei.toString()} wei`
    );
  }

  const cleanupRecords: CleanupPartyResult[] = [];

  for (const target of expectedTargets) {
    const { scenarioId, contractAddress, party, expectedCreditWei } = target;
    const actingClient = party === "challenger" ? challengerClient : issuerClient;
    const actingAddress = party === "challenger" ? challengerAccount.address : issuerSigner.address;

    let observedCredit: bigint | undefined;
    let withdrawHash: Hash | undefined;
    let receiptStatus: string | undefined;
    let executionResult: string | undefined;
    let receiptSummary: ValidatedReceiptSummary | undefined;
    let postWithdrawalCredit: bigint | undefined;

    // Step 1: Query credit
    try {
      const creditRaw = await issuerClient.readContract({
        address: contractAddress,
        functionName: "get_credit",
        args: [actingAddress],
      });
      observedCredit = parseCredit(creditRaw);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[cleanup-error] Query failed for ${party} on ${contractAddress}: ${errMsg}`);
      cleanupRecords.push({
        scenarioId,
        contractAddress,
        party,
        status: "QUERY_FAILED",
        expectedCredit: expectedCreditWei,
        error: `Query failed: ${errMsg}`,
      });
      continue;
    }

    if (observedCredit !== expectedCreditWei) {
      const errMsg = `Observed credit (${observedCredit.toString()} wei) does not equal expected credit (${expectedCreditWei.toString()} wei)`;
      console.warn(`[cleanup-error] Credit mismatch for ${party} on ${contractAddress}: ${errMsg}`);
      cleanupRecords.push({
        scenarioId,
        contractAddress,
        party,
        status: "QUERY_FAILED",
        expectedCredit: expectedCreditWei,
        observedCredit,
        error: errMsg,
      });
      continue;
    }

    // Step 2: Withdraw credit via execWrite (actual receipt evidence recorded)
    try {
      console.log(`[cleanup-${party}] Withdrawing ${observedCredit.toString()} wei credit from ${contractAddress}...`);
      const writeRes = await execWrite(actingClient, contractAddress, "withdraw_credit", []);
      withdrawHash = writeRes.transactionHash;
      receiptStatus = writeRes.receiptStatus;
      executionResult = writeRes.executionResult;
      receiptSummary = writeRes.receiptSummary;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[cleanup-error] Withdrawal failed for ${party} on ${contractAddress}: ${errMsg}`);
      let failedTxHash: string | undefined;
      let failedStatus: string | undefined;
      let failedResult: string | undefined;
      let failedSummary: ValidatedReceiptSummary | undefined;

      if (err instanceof WriteOperationError) {
        failedTxHash = err.transactionHash;
        failedStatus = err.normalizedStatus;
        failedResult = err.normalizedExecutionResult;
        if (err.rawReceipt && failedTxHash) {
          failedSummary = {
            txHash: failedTxHash,
            status: failedStatus || "UNKNOWN",
            executionResult: failedResult || "UNKNOWN",
            rawReceipt: err.rawReceipt,
          };
        }
      } else if (err instanceof ContractExecutionReceiptError) {
        failedTxHash = String(err.transactionHash);
        failedStatus = err.consensusStatus;
        failedResult = err.executionResult;
        if (err.receipt) {
          failedSummary = {
            txHash: failedTxHash,
            status: failedStatus,
            executionResult: failedResult,
            rawReceipt: err.receipt,
          };
        }
      }

      cleanupRecords.push({
        scenarioId,
        contractAddress,
        party,
        status: "WITHDRAW_FAILED",
        expectedCredit: expectedCreditWei,
        observedCredit,
        transactionHash: failedTxHash,
        receiptStatus: failedStatus,
        executionResult: failedResult,
        receiptSummary: failedSummary,
        error: `Withdrawal failed: ${errMsg}`,
      });
      continue;
    }

    // Step 3: Post-check credit is zero
    try {
      const postCreditRaw = await issuerClient.readContract({
        address: contractAddress,
        functionName: "get_credit",
        args: [actingAddress],
      });
      postWithdrawalCredit = parseCredit(postCreditRaw);
      if (postWithdrawalCredit !== 0n) {
        const errMsg = `Post-withdrawal credit is non-zero: ${postWithdrawalCredit.toString()} wei`;
        console.error(`[cleanup-error] ${errMsg} on ${contractAddress}`);
        cleanupRecords.push({
          scenarioId,
          contractAddress,
          party,
          status: "POSTCHECK_FAILED",
          expectedCredit: expectedCreditWei,
          observedCredit,
          transactionHash: withdrawHash,
          receiptStatus,
          executionResult,
          receiptSummary,
          postWithdrawalCredit,
          error: errMsg,
        });
        continue;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[cleanup-error] Post-check query failed for ${party} on ${contractAddress}: ${errMsg}`);
      cleanupRecords.push({
        scenarioId,
        contractAddress,
        party,
        status: "POSTCHECK_FAILED",
        expectedCredit: expectedCreditWei,
        observedCredit,
        transactionHash: withdrawHash,
        receiptStatus,
        executionResult,
        receiptSummary,
        error: `Post-check query failed: ${errMsg}`,
      });
      continue;
    }

    // Step 4: Accounting invariant check
    try {
      const acctRaw = await issuerClient.readContract({
        address: contractAddress,
        functionName: "get_accounting",
        args: [],
      });
      const acct = parseAccounting(acctRaw);
      if (!acct.invariant_satisfied) {
        const errMsg = `Accounting invariant broken on ${contractAddress} after withdrawal`;
        console.error(`[cleanup-error] ${errMsg}`);
        cleanupRecords.push({
          scenarioId,
          contractAddress,
          party,
          status: "INVARIANT_FAILED",
          expectedCredit: expectedCreditWei,
          observedCredit,
          transactionHash: withdrawHash,
          receiptStatus,
          executionResult,
          receiptSummary,
          postWithdrawalCredit: 0n,
          accountingInvariantSatisfied: false,
          error: errMsg,
        });
        continue;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[cleanup-error] Invariant query failed on ${contractAddress}: ${errMsg}`);
      cleanupRecords.push({
        scenarioId,
        contractAddress,
        party,
        status: "INVARIANT_FAILED",
        expectedCredit: expectedCreditWei,
        observedCredit,
        transactionHash: withdrawHash,
        receiptStatus,
        executionResult,
        receiptSummary,
        postWithdrawalCredit: 0n,
        error: `Invariant query failed: ${errMsg}`,
      });
      continue;
    }

    // Fully verified withdrawal with actual receipt evidence
    cleanupRecords.push({
      scenarioId,
      contractAddress,
      party,
      status: "WITHDRAWN",
      expectedCredit: expectedCreditWei,
      observedCredit,
      transactionHash: withdrawHash,
      receiptStatus,
      executionResult,
      receiptSummary,
      postWithdrawalCredit: 0n,
      accountingInvariantSatisfied: true,
    });
  }

  // 3. Measurable Challenger Balance Sweep Back to Issuer
  let sweepRecord: SweepResultRecord;
  try {
    const preSweepBal = await issuerClient.getBalance({
      address: challengerAccount.address,
    });
    console.log(`[cleanup-sweep] Pre-sweep challenger balance: ${preSweepBal.toString()} wei`);

    if (preSweepBal === 0n) {
      sweepRecord = {
        disposition: "NOT_REQUIRED_ZERO_BALANCE",
        preSweepBalanceWei: 0n,
        postSweepObservedResidualBalanceWei: 0n,
      };
      console.log(`[cleanup-sweep] Challenger balance is exactly zero; sweep not required.`);
    } else {
      const sweepFeeEst = await issuerClient.estimateTransactionFees();
      const feeVal = BigInt(sweepFeeEst.feeValue);
      const requiredFeeReserve = feeVal * 2n;

      if (preSweepBal <= requiredFeeReserve) {
        sweepRecord = {
          disposition: "BLOCKED_INSUFFICIENT_FEE",
          preSweepBalanceWei: preSweepBal,
          estimatedFeeWei: feeVal,
          postSweepObservedResidualBalanceWei: preSweepBal,
          error: `Challenger balance (${preSweepBal.toString()} wei) cannot cover sweep fee reserve (${requiredFeeReserve.toString()} wei).`,
        };
        console.warn(`[cleanup-sweep] Sweep blocked: ${sweepRecord.error}`);
      } else {
        const attemptedSweepAmount = preSweepBal - requiredFeeReserve;
        console.log(`[cleanup-sweep] Attempting sweep of ${attemptedSweepAmount.toString()} wei back to issuer...`);
        let hash: string | undefined;
        try {
          hash = await challengerClient.sendTransaction({
            account: challengerAccount,
            to: issuerSigner.account.address,
            value: attemptedSweepAmount,
            chain: null,
          });
          const receipt = await challengerClient.waitForTransactionReceipt({ hash: hash as unknown as TransactionHash });
          const summary = verifyReceiptExecution(receipt, "challenger residual sweep", "sendTransaction");
          const postSweepBal = await issuerClient.getBalance({
            address: challengerAccount.address,
          });

          sweepRecord = {
            disposition: "COMPLETED",
            preSweepBalanceWei: preSweepBal,
            estimatedFeeWei: feeVal,
            attemptedSweepAmountWei: attemptedSweepAmount,
            sweepTransactionHash: hash,
            receiptStatus: summary.status,
            executionResult: summary.executionResult,
            receiptSummary: summary,
            postSweepObservedResidualBalanceWei: postSweepBal,
          };

          console.log(`[cleanup-sweep] Sweep completed with ${summary.status} and ${summary.executionResult} (tx ${hash}).`);
          console.log(`[cleanup-sweep] Post-sweep observed residual balance (dust): ${postSweepBal.toString()} wei.`);
        } catch (sweepErr: unknown) {
          const msg = sweepErr instanceof Error ? sweepErr.message : String(sweepErr);
          console.warn(`[cleanup-warning] Challenger residual sweep transaction failed: ${msg}`);
          sweepRecord = {
            disposition: "FAILED",
            preSweepBalanceWei: preSweepBal,
            estimatedFeeWei: feeVal,
            attemptedSweepAmountWei: attemptedSweepAmount,
            sweepTransactionHash: hash,
            error: msg,
          };
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cleanup-warning] Challenger residual sweep failed: ${msg}`);
    sweepRecord = {
      disposition: "FAILED",
      error: msg,
    };
  }

  // 4. Strict Economic Cleanup Evaluation
  const primaryStatus: PrimaryScenariosStatus =
    records.length === 8 && records.every((r) => r.accountingInvariant)
      ? "PRIMARY_SCENARIOS_PASS"
      : "PRIMARY_SCENARIOS_FAIL";

  const cleanupReport = evaluateEconomicCleanup({
    cleanupRecords,
    expectedTargets,
    expectedPlan: plan,
    primaryScenariosStatus: primaryStatus,
    sweepRecord,
  });

  console.log(`\n--- Economic Cleanup Evaluation ---`);
  console.log(`Total Challenger Credits Withdrawn: ${cleanupReport.totalChallengerCreditsWithdrawnWei.toString()} wei (expected: ${plan.expectedChallengerRecoverableCreditsWei.toString()} wei)`);
  console.log(`Total Issuer Credits Withdrawn:     ${cleanupReport.totalIssuerCreditsWithdrawnWei.toString()} wei (expected: ${plan.expectedIssuerRecoverableCreditsWei.toString()} wei)`);
  console.log(`Total Contract Credits Withdrawn:   ${cleanupReport.totalContractCreditsWithdrawnWei.toString()} wei (expected: ${plan.expectedTotalContractCreditsWei.toString()} wei)`);
  console.log(`Primary Scenarios Status:           ${cleanupReport.primaryScenariosStatus}`);
  console.log(`Economic Cleanup Status:            ${cleanupReport.status}`);
  console.log(`Live Readiness Status:              ${cleanupReport.liveReadinessStatus}`);

  if (cleanupReport.liveReadinessStatus !== "LIVE_READINESS_PASS") {
    console.error(`\n[ECONOMIC_CLEANUP_FAILURE] Cleanup did not achieve complete resolution.`);
    console.error(`Unresolved credits: ${cleanupReport.unresolvedCreditsWei.toString()} wei across contracts: ${cleanupReport.unresolvedContractAddresses.join(", ")}`);
    console.error("Preserving primary scenario evidence. Halting with non-zero exit code.");
    process.exit(1);
  }

  console.log("\n=== ALL 8 LIVE INTEGRATION SCENARIOS PASSED AND ECONOMIC CLEANUP VERIFIED ===");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runLiveIntegration().catch((err) => {
    console.error("Live integration test error:", err);
    process.exit(1);
  });
}
