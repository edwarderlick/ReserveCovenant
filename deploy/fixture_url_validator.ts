/**
 * Strict Immutable Fixture URL Validator for ReserveCovenant.
 *
 * GenLayer multi-validator consensus requires immutable, hash-pinned HTTPS evidence.
 * For raw GitHub URLs, fixtures must be pinned to an exact 40-character lowercase
 * hexadecimal commit SHA to guarantee content immutability across validators.
 */

export interface FixtureUrlValidationResult {
  valid: boolean;
  error?: string;
  owner?: string;
  repo?: string;
  commitSha?: string;
  filename?: string;
}

const GITHUB_RAW_HOST = "raw.githubusercontent.com";
const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/;
const SAFE_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Validates that a complete fixture URL points to an immutable commit-pinned raw GitHub file.
 *
 * Expected structure:
 * https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-commit>/fixtures/<filename.json>
 */
export function validateImmutableFixtureUrl(
  urlStr: string,
  expectedFilename?: string
): FixtureUrlValidationResult {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: false, error: "URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: `Malformed URL: ${urlStr}` };
  }

  // 1. Protocol must be HTTPS
  if (parsed.protocol !== "https:") {
    return { valid: false, error: `Invalid protocol: '${parsed.protocol}'. HTTPS required.` };
  }

  // 2. Reject credentials embedded in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing embedded credentials are prohibited" };
  }

  // 3. Hostname must be exactly raw.githubusercontent.com
  if (parsed.hostname.toLowerCase() !== GITHUB_RAW_HOST) {
    return { valid: false, error: `Disallowed hostname: '${parsed.hostname}'. Expected '${GITHUB_RAW_HOST}'.` };
  }

  // 4. Reject ports
  if (parsed.port) {
    return { valid: false, error: "Custom ports are prohibited" };
  }

  // 5. Reject query parameters and hash fragments
  if (parsed.search) {
    return { valid: false, error: `Query parameters are prohibited: '${parsed.search}'` };
  }
  if (parsed.hash) {
    return { valid: false, error: `URL fragments are prohibited: '${parsed.hash}'` };
  }

  // 6. Path must split into exactly 5 segments: ['', owner, repo, commitSha, 'fixtures', filename]
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 5) {
    return {
      valid: false,
      error: `Invalid path structure. Expected: /<owner>/<repo>/<commit-sha>/fixtures/<filename.json>, got: '${parsed.pathname}'`,
    };
  }

  const [owner, repo, commitSha, fixturesDir, filename] = segments;

  if (!SAFE_NAME_REGEX.test(owner) || owner === "." || owner === "..") {
    return { valid: false, error: `Invalid owner segment: '${owner}'` };
  }

  if (!SAFE_NAME_REGEX.test(repo) || repo === "." || repo === "..") {
    return { valid: false, error: `Invalid repository segment: '${repo}'` };
  }

  // Reject mutable branches like 'main', 'master', 'dev', etc.
  if (commitSha === "main" || commitSha === "master" || commitSha === "HEAD") {
    return { valid: false, error: `Mutable branch reference '${commitSha}' is strictly disallowed. Exact 40-hex commit SHA required.` };
  }

  // Enforce exactly 40 lowercase hexadecimal characters
  if (!COMMIT_SHA_REGEX.test(commitSha)) {
    return {
      valid: false,
      error: `Invalid commit SHA: '${commitSha}'. Must be exactly 40 lowercase hexadecimal characters.`,
    };
  }

  if (fixturesDir !== "fixtures") {
    return { valid: false, error: `Expected 'fixtures' directory in path, got '${fixturesDir}'` };
  }

  if (!SAFE_NAME_REGEX.test(filename) || !filename.endsWith(".json") || filename === ".json") {
    return { valid: false, error: `Invalid fixture filename: '${filename}'. Must end in .json without path traversal.` };
  }

  if (expectedFilename && filename !== expectedFilename) {
    return {
      valid: false,
      error: `Filename mismatch: URL has '${filename}', expected '${expectedFilename}'`,
    };
  }

  return {
    valid: true,
    owner,
    repo,
    commitSha,
    filename,
  };
}

/**
 * Validates a base URL intended to serve as the root for fixture resolution.
 *
 * Expected structure:
 * https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-commit>/fixtures
 */
export function validateImmutableFixtureBaseUrl(
  baseUrlStr: string
): FixtureUrlValidationResult {
  if (!baseUrlStr || typeof baseUrlStr !== "string") {
    return { valid: false, error: "Base URL must be a non-empty string" };
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrlStr);
  } catch {
    return { valid: false, error: `Malformed URL: ${baseUrlStr}` };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: `Invalid protocol: '${parsed.protocol}'. HTTPS required.` };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing embedded credentials are prohibited" };
  }

  if (parsed.hostname.toLowerCase() !== GITHUB_RAW_HOST) {
    return { valid: false, error: `Disallowed hostname: '${parsed.hostname}'. Expected '${GITHUB_RAW_HOST}'.` };
  }

  if (parsed.port || parsed.search || parsed.hash) {
    return { valid: false, error: "Ports, query parameters, and fragments are prohibited" };
  }

  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length !== 4) {
    return {
      valid: false,
      error: `Invalid path structure. Expected: /<owner>/<repo>/<commit-sha>/fixtures, got: '${parsed.pathname}'`,
    };
  }

  const [owner, repo, commitSha, fixturesDir] = segments;

  if (!SAFE_NAME_REGEX.test(owner) || owner === "." || owner === "..") {
    return { valid: false, error: `Invalid owner segment: '${owner}'` };
  }

  if (!SAFE_NAME_REGEX.test(repo) || repo === "." || repo === "..") {
    return { valid: false, error: `Invalid repository segment: '${repo}'` };
  }

  if (commitSha === "main" || commitSha === "master" || commitSha === "HEAD") {
    return { valid: false, error: `Mutable branch reference '${commitSha}' is strictly disallowed. Exact 40-hex commit SHA required.` };
  }

  if (!COMMIT_SHA_REGEX.test(commitSha)) {
    return {
      valid: false,
      error: `Invalid commit SHA: '${commitSha}'. Must be exactly 40 lowercase hexadecimal characters.`,
    };
  }

  if (fixturesDir !== "fixtures") {
    return { valid: false, error: `Expected 'fixtures' directory in path, got '${fixturesDir}'` };
  }

  return {
    valid: true,
    owner,
    repo,
    commitSha,
  };
}
