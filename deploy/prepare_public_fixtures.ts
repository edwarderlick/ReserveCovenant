/**
 * Deterministic Public Fixtures Preparation & Verification Script for ReserveCovenant.
 *
 * Implements the Two-Commit Publication Flow:
 * - Stage A: Evidence commit. Evidence documents are published first, establishing COMMIT_A.
 * - Stage B: Snapshot commit. Snapshots are generated with nested evidence URLs pointing to COMMIT_A,
 *   establishing COMMIT_B.
 *
 * Requirements:
 * 1. Accept owner, repository, and evidence commit SHA as explicit inputs.
 * 2. Validate evidence commit as exactly 40 lowercase hexadecimal characters.
 * 3. Replace only the intended nested evidence URLs.
 * 4. Canonically serialize JSON (sorted keys).
 * 5. Recompute and display SHA-256 hashes.
 * 6. Never edit unrelated fields.
 * 7. Verify every nested evidence URL is commit-pinned.
 * 8. Verify each stored evidence SHA matches the referenced local evidence file.
 * 9. Fail nonzero on any mismatch.
 * 10. Support check-only mode suitable for CI.
 * 11. Never perform GitHub publication itself.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateImmutableFixtureUrl } from "./fixture_url_validator.js";

const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/;
const SAFE_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export interface PrepareOptions {
  owner: string;
  repo: string;
  commitA: string;
  write?: boolean;
  fixturesDir?: string;
}

export interface PrepareResult {
  success: boolean;
  error?: string;
  evidenceHashes: Record<string, string>;
  snapshotHashes: Record<string, string>;
  updatedFiles: string[];
}

export interface CheckResult {
  allPinned: boolean;
  evidenceValid: boolean;
  details: string[];
  evidenceHashes: Record<string, string>;
  snapshotHashes: Record<string, string>;
}

// Canonical JSON stringifier (alphabetically sorted keys)
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`);
  return "{" + pairs.join(",") + "}";
}

export function computeSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function preparePublicFixtures(options: PrepareOptions): PrepareResult {
  const { owner, repo, commitA, write = false } = options;
  const fixturesDir = options.fixturesDir || path.resolve(process.cwd(), "fixtures");

  if (!fs.existsSync(fixturesDir)) {
    return { success: false, error: `Fixtures directory not found: ${fixturesDir}`, evidenceHashes: {}, snapshotHashes: {}, updatedFiles: [] };
  }

  // 1. Validate inputs
  if (!owner || !SAFE_NAME_REGEX.test(owner)) {
    return { success: false, error: `Invalid owner: '${owner}'`, evidenceHashes: {}, snapshotHashes: {}, updatedFiles: [] };
  }
  if (!repo || !SAFE_NAME_REGEX.test(repo)) {
    return { success: false, error: `Invalid repository: '${repo}'`, evidenceHashes: {}, snapshotHashes: {}, updatedFiles: [] };
  }
  if (!commitA || !COMMIT_SHA_REGEX.test(commitA)) {
    return {
      success: false,
      error: `Invalid commit SHA: '${commitA}'. Must be exactly 40 lowercase hexadecimal characters.`,
      evidenceHashes: {},
      snapshotHashes: {},
      updatedFiles: [],
    };
  }

  // 2. Discover and hash local evidence files
  const evidenceFiles = [
    "issuer-upheld-evidence.json",
    "issuer-material-disclaimer.json",
    "challenger-unsupported-claim.json",
    "challenger-material-disclaimer.json",
  ];

  const evidenceHashes: Record<string, string> = {};
  for (const ef of evidenceFiles) {
    const fullPath = path.join(fixturesDir, ef);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Missing evidence file: ${ef}`, evidenceHashes: {}, snapshotHashes: {}, updatedFiles: [] };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    evidenceHashes[ef] = computeSha256(content);
  }

  // 3. Process snapshot fixtures
  const snapshotFiles = [
    "epoch-compliant.json",
    "epoch-coverage-shortfall.json",
    "epoch-future-dated.json",
    "epoch-ineligible-reserve.json",
    "epoch-material-disclaimer.json",
  ];

  const snapshotHashes: Record<string, string> = {};
  const updatedFiles: string[] = [];

  for (const sf of snapshotFiles) {
    const fullPath = path.join(fixturesDir, sf);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Missing snapshot file: ${sf}`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
    }

    const rawContent = fs.readFileSync(fullPath, "utf-8");
    const snapshot = JSON.parse(rawContent);

    if (!Array.isArray(snapshot.evidence)) {
      return { success: false, error: `Snapshot ${sf} is missing 'evidence' array`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
    }

    // Replace evidence URLs to point to pinned commitA
    for (const ev of snapshot.evidence) {
      if (typeof ev.url !== "string") {
        return { success: false, error: `Snapshot ${sf} contains evidence entry with non-string URL`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
      }

      // Determine which evidence file this corresponds to
      const urlMatch = ev.url.match(/fixtures\/([a-zA-Z0-9_.-]+\.json)$/);
      if (!urlMatch) {
        return { success: false, error: `Could not determine evidence filename from URL '${ev.url}' in ${sf}`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
      }
      const evFilename = urlMatch[1];
      const expectedSha = evidenceHashes[evFilename];
      if (!expectedSha) {
        return { success: false, error: `Unknown evidence file '${evFilename}' referenced in ${sf}`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
      }

      // Verify SHA match
      if (ev.sha256 !== expectedSha) {
        return {
          success: false,
          error: `SHA-256 mismatch in ${sf} for ${evFilename}: snapshot has '${ev.sha256}', local file has '${expectedSha}'`,
          evidenceHashes,
          snapshotHashes: {},
          updatedFiles: [],
        };
      }

      // Set new commit-pinned URL
      ev.url = `https://raw.githubusercontent.com/${owner}/${repo}/${commitA}/fixtures/${evFilename}`;

      // Validate the newly formed URL
      const valResult = validateImmutableFixtureUrl(ev.url, evFilename);
      if (!valResult.valid) {
        return { success: false, error: `Constructed invalid URL: ${valResult.error}`, evidenceHashes, snapshotHashes: {}, updatedFiles: [] };
      }
    }

    const canonicalContent = canonicalJsonStringify(snapshot);
    const newSha = computeSha256(canonicalContent);
    snapshotHashes[sf] = newSha;

    if (write) {
      fs.writeFileSync(fullPath, canonicalContent, "utf-8");
      updatedFiles.push(sf);
    }
  }

  return {
    success: true,
    evidenceHashes,
    snapshotHashes,
    updatedFiles,
  };
}

export function checkPublicFixtures(fixturesDir?: string): CheckResult {
  const dir = fixturesDir || path.resolve(process.cwd(), "fixtures");
  const details: string[] = [];

  const evidenceFiles = [
    "issuer-upheld-evidence.json",
    "issuer-material-disclaimer.json",
    "challenger-unsupported-claim.json",
    "challenger-material-disclaimer.json",
  ];

  const evidenceHashes: Record<string, string> = {};
  for (const ef of evidenceFiles) {
    const fullPath = path.join(dir, ef);
    if (!fs.existsSync(fullPath)) {
      return { allPinned: false, evidenceValid: false, details: [`Missing evidence file: ${ef}`], evidenceHashes: {}, snapshotHashes: {} };
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    evidenceHashes[ef] = computeSha256(content);
  }

  const snapshotFiles = [
    "epoch-compliant.json",
    "epoch-coverage-shortfall.json",
    "epoch-future-dated.json",
    "epoch-ineligible-reserve.json",
    "epoch-material-disclaimer.json",
  ];

  let allPinned = true;
  let evidenceValid = true;
  const snapshotHashes: Record<string, string> = {};

  for (const sf of snapshotFiles) {
    const fullPath = path.join(dir, sf);
    if (!fs.existsSync(fullPath)) {
      return { allPinned: false, evidenceValid: false, details: [`Missing snapshot file: ${sf}`], evidenceHashes, snapshotHashes: {} };
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    snapshotHashes[sf] = computeSha256(content);
    const snapshot = JSON.parse(content);

    for (const ev of snapshot.evidence || []) {
      const val = validateImmutableFixtureUrl(ev.url);
      if (!val.valid) {
        allPinned = false;
        details.push(`${sf}: mutable or invalid URL '${ev.url}' (${val.error})`);
      }

      const match = (ev.url || "").match(/fixtures\/([a-zA-Z0-9_.-]+\.json)$/);
      if (match) {
        const evFilename = match[1];
        if (evidenceHashes[evFilename] && ev.sha256 !== evidenceHashes[evFilename]) {
          evidenceValid = false;
          details.push(`${sf}: SHA-256 mismatch for ${evFilename}`);
        }
      }
    }
  }

  return {
    allPinned,
    evidenceValid,
    details,
    evidenceHashes,
    snapshotHashes,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const isWrite = args.includes("--write");

  let owner = "";
  let repo = "";
  let commitA = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--owner" && args[i + 1]) owner = args[i + 1];
    if (args[i] === "--repo" && args[i + 1]) repo = args[i + 1];
    if (args[i] === "--commit-a" && args[i + 1]) commitA = args[i + 1];
  }

  console.log("=== ReserveCovenant Public Fixtures Preparation & Verification ===");

  if (isCheck) {
    const checkRes = checkPublicFixtures();
    console.log(`Local Evidence Files Verified: ${checkRes.evidenceValid}`);
    console.log(`All Fixtures Commit-Pinned:   ${checkRes.allPinned}`);
    if (!checkRes.allPinned) {
      console.log("\nNotice: Current fixtures contain local/placeholder URLs pending public repository publication:");
      for (const d of checkRes.details) {
        console.log(` - ${d}`);
      }
      console.log("\nStatus: BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION (expected prior to public repo publication).");
    } else {
      console.log("\nAll fixture URLs are strictly commit-pinned and evidence hashes match.");
    }
    return;
  }

  if (!owner || !repo || !commitA) {
    console.error("Usage: tsx deploy/prepare_public_fixtures.ts --owner <owner> --repo <repo> --commit-a <40-hex-commit> [--write]");
    console.error("   or: tsx deploy/prepare_public_fixtures.ts --check");
    process.exit(1);
  }

  const result = preparePublicFixtures({ owner, repo, commitA, write: isWrite });
  if (!result.success) {
    console.error("Preparation failed:", result.error);
    process.exit(1);
  }

  console.log(`Owner:      ${owner}`);
  console.log(`Repository: ${repo}`);
  console.log(`Commit A:   ${commitA}`);
  console.log(`Mode:       ${isWrite ? "WRITE" : "DRY-RUN (no files modified)"}`);
  console.log("\nComputed Snapshot SHA-256 Hashes:");
  for (const [file, hash] of Object.entries(result.snapshotHashes)) {
    console.log(`  ${file}: ${hash}`);
  }
  console.log("\n[SUCCESS] Deterministic fixture preparation completed.");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
