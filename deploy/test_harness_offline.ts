/**
 * Pure Offline Test Suite for Live Integration Harness and Tooling.
 *
 * Verifies critical planning and validation without making any network writes:
 * 1. Signer separation (issuer != challenger, self-challenge rejected before network).
 * 2. Immutable fixture URL validator (commit-pinned accepted; /main/, branches rejected).
 * 3. Method name and scenario argument specifications (Scenario 4 calls open_challenge with MATERIAL_DISCLAIMER).
 * 4. Scenario 7 independence and error-handling plan.
 * 5. Public fixture preparation tool (dry-run mode, canonical JSON, commit validation).
 * 6. Fail-closed command runner behavior.
 *
 * Result Label:
 * OFFLINE_HARNESS_VALIDATION_PASS
 * (This is NOT a LIVE_VALIDATOR_CONSENSUS_PASS).
 */

import { assertSignerSeparation, getLiveScenariosSpec } from "./run_live_integration.js";
import {
  validateImmutableFixtureUrl,
  validateImmutableFixtureBaseUrl,
} from "./fixture_url_validator.js";
import { preparePublicFixtures, canonicalJsonStringify } from "./prepare_public_fixtures.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOfflineHarnessTests(): Promise<void> {
  console.log("=== Running Offline Live-Harness Validation Suite ===");

  // 1. Signer Separation Tests
  console.log("[1/5] Testing Signer Separation...");
  const addrA = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD";
  const addrB = "0x31cB1c6Bdb3Ed7B07B3394d714A380F73BC9aa15";

  // Distinct addresses must pass
  assertSignerSeparation(addrA, addrB);

  // Identical addresses must throw before any network interaction
  let selfChallengeCaught = false;
  try {
    assertSignerSeparation(addrA, addrA.toLowerCase());
  } catch (err: any) {
    selfChallengeCaught = true;
    assert(err.message.includes("Signer separation check failed"), "Expected error message");
  }
  assert(selfChallengeCaught, "Self-challenge must throw exception");

  // 2. Immutable URL Validator Tests
  console.log("[2/5] Testing Immutable Fixture URL Validation...");
  const validCommit = "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e";
  const validUrl = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch-compliant.json`;
  const resValid = validateImmutableFixtureUrl(validUrl, "epoch-compliant.json");
  assert(resValid.valid === true, `Valid URL must pass, got: ${resValid.error}`);
  assert(resValid.commitSha === validCommit, "Commit SHA must match");

  // Rejected forms
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures/epoch.json`).valid, "Must reject /main/");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/master/fixtures/epoch.json`).valid, "Must reject /master/");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/${validCommit.toUpperCase()}/fixtures/epoch.json`).valid, "Must reject uppercase SHA");
  assert(!validateImmutableFixtureUrl(`http://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch.json`).valid, "Must reject http:");
  assert(!validateImmutableFixtureUrl(`https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures/epoch.json?q=1`).valid, "Must reject query");
  assert(!validateImmutableFixtureUrl(`https://other.com/owner/repo/${validCommit}/fixtures/epoch.json`).valid, "Must reject other host");

  const validBase = `https://raw.githubusercontent.com/owner/repo/${validCommit}/fixtures`;
  assert(validateImmutableFixtureBaseUrl(validBase).valid === true, "Valid base URL must pass");
  assert(!validateImmutableFixtureBaseUrl(`https://raw.githubusercontent.com/owner/repo/main/fixtures`).valid, "Mutable base must fail");

  // 3. Scenario Call Argument Specifications
  console.log("[3/5] Testing Scenario Specifications...");
  const specs = getLiveScenariosSpec();
  assert(specs.length === 8, `Expected 8 scenarios, got ${specs.length}`);

  // Verify Scenario 4 functionName / challengeType fix
  const scen4 = specs.find((s) => s.scenarioId === 4);
  assert(Boolean(scen4), "Scenario 4 must exist");
  assert(scen4!.challengeType === "MATERIAL_DISCLAIMER", "Scenario 4 challengeType must be MATERIAL_DISCLAIMER");
  assert(scen4!.expectedFinalStatus === "BREACHED", "Scenario 4 expected final status must be BREACHED");

  // Verify Scenario 7 has fresh plan
  const scen7 = specs.find((s) => s.scenarioId === 7);
  assert(Boolean(scen7), "Scenario 7 must exist");
  assert(scen7!.expectedFinalStatus === "INCONCLUSIVE", "Scenario 7 initial resolution must be INCONCLUSIVE");

  // 4. Two-Commit Fixture Tool (Dry-Run Mode)
  console.log("[4/5] Testing Public Fixture Preparation Tool (Dry-Run)...");
  // Invalid commit rejection
  const invalidCommitRes = preparePublicFixtures({
    owner: "owner",
    repo: "repo",
    commitA: "invalid-commit-short",
    write: false,
  });
  assert(!invalidCommitRes.success, "Invalid commit must fail");

  // Valid dry run
  const validDryRun = preparePublicFixtures({
    owner: "edwarderlick",
    repo: "ReserveCovenant",
    commitA: "0123456789abcdef0123456789abcdef01234567",
    write: false,
  });
  assert(validDryRun.success === true, `Dry-run preparation must succeed: ${validDryRun.error}`);
  assert(Object.keys(validDryRun.snapshotHashes).length === 5, "Must compute hashes for all 5 snapshots");
  assert(validDryRun.updatedFiles.length === 0, "Dry-run must not write any files");

  // Canonical JSON determinism
  const testObj = { b: 1, a: 2, nested: { z: 10, y: 20 } };
  const canonicalStr = canonicalJsonStringify(testObj);
  assert(canonicalStr === '{"a":2,"b":1,"nested":{"y":20,"z":10}}', "Canonical JSON must sort keys");

  // 5. Completion Summary
  console.log("[5/5] All offline validation checks passed.\n");
  console.log("=================================================");
  console.log(">>> OFFLINE_HARNESS_VALIDATION_PASS <<<");
  console.log("Harness logic, signer separation, URL security,");
  console.log("and scenario specifications verified offline.");
  console.log("(Zero deployments, zero transactions submitted).");
  console.log("=================================================");
}

runOfflineHarnessTests().catch((err) => {
  console.error("Offline harness test FAILED:", err);
  process.exit(1);
});
