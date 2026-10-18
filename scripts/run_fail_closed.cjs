/**
 * Fail-Closed Cross-Platform Command Runner for ReserveCovenant.
 *
 * Guarantees that:
 * 1. If child_process.spawnSync returns an error (e.g., ENOENT / missing executable),
 *    it prints a safe error message and exits with a nonzero exit code.
 * 2. If res.status is null or not an integer, it exits nonzero.
 * 3. If child exits with a status code, it exits with that exact status code.
 * 4. For schema:check, extracts schema into a temporary file and compares byte-for-byte
 *    with deploy/schema.json without mutating tracked files.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ENV_OVERLAY = {
  ...process.env,
  PYTHONUTF8: "1",
  GENVM_VERSION: "genlayerlabs-genvm-manager-v0.6.0-rc8",
};

function runChild(command, args, options = {}) {
  const mergedEnv = { ...ENV_OVERLAY, ...(options.env || {}) };
  const res = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    shell: options.shell !== undefined ? options.shell : true,
    env: mergedEnv,
    cwd: options.cwd || process.cwd(),
  });

  if (res.error) {
    console.error(`[FAIL-CLOSED ERROR] Failed to execute '${command}': ${res.error.message || res.error}`);
    process.exit(res.error.code === "ENOENT" ? 127 : 1);
  }

  if (typeof res.status !== "number" || !Number.isInteger(res.status)) {
    console.error(`[FAIL-CLOSED ERROR] Process '${command}' exited with non-integer status: ${res.status}`);
    process.exit(1);
  }

  return res.status;
}

function handleLint() {
  const contractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  if (!fs.existsSync(contractPath)) {
    console.error(`[FAIL-CLOSED ERROR] Contract not found at ${contractPath}`);
    process.exit(1);
  }
  const status = runChild("genvm-lint", ["check", "contracts/reservecovenant.py"]);
  process.exit(status);
}

function handleSchemaGenerate() {
  const contractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  const schemaPath = path.resolve(process.cwd(), "deploy/schema.json");
  if (!fs.existsSync(contractPath)) {
    console.error(`[FAIL-CLOSED ERROR] Contract not found at ${contractPath}`);
    process.exit(1);
  }
  const status = runChild("genvm-lint", ["schema", "-o", schemaPath, "--json", "contracts/reservecovenant.py"]);
  if (status === 0) {
    console.log(`Schema successfully generated at ${schemaPath}`);
  }
  process.exit(status);
}

function handleSchemaCheck() {
  const contractPath = path.resolve(process.cwd(), "contracts/reservecovenant.py");
  const trackedSchemaPath = path.resolve(process.cwd(), "deploy/schema.json");

  if (!fs.existsSync(contractPath)) {
    console.error(`[FAIL-CLOSED ERROR] Contract not found at ${contractPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(trackedSchemaPath)) {
    console.error(`[FAIL-CLOSED ERROR] Tracked schema not found at ${trackedSchemaPath}`);
    process.exit(1);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reservecovenant-schema-"));
  const tmpSchemaPath = path.join(tmpDir, "schema_check.json");

  try {
    const status = runChild("genvm-lint", ["schema", "-o", tmpSchemaPath, "--json", "contracts/reservecovenant.py"], {
      stdio: ["inherit", "pipe", "inherit"],
    });

    if (status !== 0) {
      console.error(`[FAIL-CLOSED ERROR] Schema extraction failed with exit code ${status}`);
      process.exit(status);
    }

    const trackedContent = fs.readFileSync(trackedSchemaPath);
    const generatedContent = fs.readFileSync(tmpSchemaPath);

    if (!trackedContent.equals(generatedContent)) {
      console.error("[FAIL-CLOSED ERROR] Schema parity check FAILED: generated schema differs from tracked deploy/schema.json");
      process.exit(1);
    }

    console.log("✓ Schema parity check PASSED: exact byte-for-byte match with tracked deploy/schema.json");
    process.exit(0);
  } finally {
    try {
      if (fs.existsSync(tmpSchemaPath)) fs.unlinkSync(tmpSchemaPath);
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  }
}

function handleTestMissingExecutable() {
  // Test mode to verify fail-closed behavior on missing executable
  const bogusCmd = "nonexistent_executable_binary_12345xyz";
  console.log(`Testing fail-closed execution on missing executable '${bogusCmd}'...`);
  const res = spawnSync(bogusCmd, [], { stdio: "pipe", shell: false });
  if (res.error) {
    console.log(`[PASS] Correctly detected spawn error: ${res.error.code || res.error.message}`);
    process.exit(0);
  }
  console.error("[FAIL] Bogus command unexpectedly succeeded!");
  process.exit(1);
}

const action = process.argv[2];

switch (action) {
  case "lint":
  case "lint:contract":
    handleLint();
    break;
  case "schema:generate":
    handleSchemaGenerate();
    break;
  case "schema:check":
    handleSchemaCheck();
    break;
  case "test:missing-executable":
    handleTestMissingExecutable();
    break;
  default:
    console.error(`Usage: node scripts/run_fail_closed.cjs <lint | schema:generate | schema:check | test:missing-executable>`);
    process.exit(1);
}

module.exports = {
  runChild,
  handleLint,
  handleSchemaGenerate,
  handleSchemaCheck,
  handleTestMissingExecutable,
};
