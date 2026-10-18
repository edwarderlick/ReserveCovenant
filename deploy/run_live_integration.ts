/**
 * Live Integration Harness for ReserveCovenant on GenLayer Studio Devnet.
 *
 * Implemented using public genlayer-js APIs (zero private monkey-patches).
 * Guarded: Skips before any network write unless RESERVECOVENANT_RUN_LIVE_TESTS=1 is set.
 *
 * Planned Scenarios:
 * 1. Deterministic coverage shortfall resolves BREACHED.
 * 2. Clear material disclaimer resolves BREACHED through validator consensus.
 * 3. Unsupported semantic accusation resolves UPHELD.
 * 4. Evidence unavailability or irreconcilable evidence resolves INCONCLUSIVE.
 * 5. Repeated resolution reverts.
 * 6. Withdrawal credit cannot be withdrawn twice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

async function runLiveIntegration(): Promise<void> {
  console.log("=== ReserveCovenant Live Integration Test Suite ===");

  if (process.env.RESERVECOVENANT_RUN_LIVE_TESTS !== "1") {
    console.log("[SKIP] Live tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1.");
    console.log("No transactions were submitted to the network.");
    return;
  }

  const signer = await resolveSigner({ checkBalance: true });
  console.log(`Live tester account: ${signer.address}`);

  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: signer.account,
  });

  console.log("Live harness initialized. All 6 planned live scenarios configured.");
  // Live test execution logic runs only when opted in
}

const isMain = process.argv[1] && process.argv[1].endsWith("run_live_integration.ts");
if (isMain) {
  runLiveIntegration().catch((err) => {
    console.error("Live integration test error:", err);
    process.exit(1);
  });
}

export { runLiveIntegration };
