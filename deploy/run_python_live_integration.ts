/**
 * Python Live-Test Preflight Gate and Offline Utility Module.
 *
 * Real Behavior (Option B Fail-Closed Strategy):
 * - This module enforces strict pre-network gates: opt-in check and immutable fixture validation.
 * - Under Option B, this launcher NEVER resolves an issuer signer from OS keychain, NEVER generates
 *   an ephemeral challenger private key, NEVER funds an account, and NEVER launches pytest or submits
 *   transactions to the network.
 * - Instead, it halts fail-closed with BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED to prevent allocating
 *   ephemeral challenger funds without verified economic cleanup.
 * - The TypeScript live harness (deploy/run_live_integration.ts) serves as the sole authoritative
 *   live execution path for end-to-end multi-scenario execution and dual-party credit recovery.
 *
 * Dormant Offline Support:
 * - buildPythonLiveEnvironment() is retained as offline-tested dormant support for parameter
 *   validation and environment building. It is strictly unused while Option B remains active.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { validateImmutableFixtureBaseUrl } from "./fixture_url_validator.js";

export interface PythonLauncherDisposition {
  status: "SKIPPED" | "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION" | "BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED";
  exitCode: number;
  reason: string;
}

/**
 * Pure evaluation function for Python live launcher disposition.
 * Enforces strict pre-network gates:
 * 1. Default safe skip if RESERVECOVENANT_RUN_LIVE_TESTS != 1.
 * 2. Immutable public fixture validation before any signer/keychain access.
 * 3. Option B fail-closed halt: TypeScript harness is the sole authoritative live execution path
 *    to prevent allocating and abandoning ephemeral challenger funds without receipt-verified cleanup.
 */
export function evaluatePythonLauncherDisposition(
  env: Record<string, string | undefined> = process.env
): PythonLauncherDisposition {
  if (env.RESERVECOVENANT_RUN_LIVE_TESTS !== "1") {
    return {
      status: "SKIPPED",
      exitCode: 0,
      reason: "Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.",
    };
  }

  const fixtureBaseUrl = (env.RESERVECOVENANT_FIXTURE_BASE_URL || "").trim();
  const fixtureValidation = validateImmutableFixtureBaseUrl(fixtureBaseUrl);
  if (!fixtureValidation.valid) {
    return {
      status: "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION",
      exitCode: 1,
      reason: fixtureValidation.error || "Invalid or unconfigured fixture base URL.",
    };
  }

  return {
    status: "BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED",
    exitCode: 1,
    reason:
      "Python live-write launcher is disabled fail-closed: post-execution dual-party economic cleanup " +
      "and residual sweeping are only implemented in the authoritative TypeScript live harness " +
      "(deploy/run_live_integration.ts). Ephemeral challenger funds will not be allocated or abandoned.",
  };
}

/**
 * Injects dynamic Studio Devnet fee estimate and scenario parameters into Python child process environment.
 * Validates dynamic fee strictly before environment construction.
 *
 * NOTE: Retained as offline-tested dormant support only. Strictly unused while Option B remains active.
 */
export function buildPythonLiveEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  issuerPrivateKey: string,
  challengerPrivateKey: string,
  fixtureBaseUrl: string,
  estimatedFeeWei: bigint
): Record<string, string> {
  if (estimatedFeeWei <= 0n) {
    throw new Error(`Invalid dynamic fee estimate: ${estimatedFeeWei.toString()} wei. Must be positive.`);
  }
  return {
    ...baseEnv,
    GENLAYER_PRIVATE_KEY: issuerPrivateKey,
    RESERVECOVENANT_CHALLENGER_PRIVATE_KEY: challengerPrivateKey,
    RESERVECOVENANT_RUN_LIVE_TESTS: "1",
    RESERVECOVENANT_FIXTURE_BASE_URL: fixtureBaseUrl,
    RESERVECOVENANT_ESTIMATED_FEE_WEI: estimatedFeeWei.toString(),
    PYTHONUTF8: "1",
  };
}

export async function runPythonLiveIntegration(): Promise<void> {
  console.log("=== ReserveCovenant Python Live Integration Launcher ===");

  const disposition = evaluatePythonLauncherDisposition(process.env);
  if (disposition.status === "SKIPPED") {
    console.log(`[SKIP] ${disposition.reason}`);
    console.log("No transactions were submitted to the network.");
    return;
  }

  if (disposition.status === "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION") {
    console.error(`[BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION] ${disposition.reason}`);
    console.error("GenLayer validators require immutable public commit-pinned HTTPS fixture URLs.");
    console.error("Zero deployments and zero transactions submitted.");
    process.exit(1);
  }

  if (disposition.status === "BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED") {
    console.error(`[BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED] ${disposition.reason}`);
    console.error("The TypeScript live harness (deploy/run_live_integration.ts) is the sole authoritative live execution path.");
    console.error("Zero ephemeral challenger funds were allocated, funded, or abandoned.");
    process.exit(1);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runPythonLiveIntegration().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal launcher error:", msg);
    process.exit(1);
  });
}

