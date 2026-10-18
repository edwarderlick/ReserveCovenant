"""
Strict Immutable Fixture URL Validator for ReserveCovenant (Python).

GenLayer multi-validator consensus requires immutable, hash-pinned HTTPS evidence.
For raw GitHub URLs, fixtures must be pinned to an exact 40-character lowercase
hexadecimal commit SHA to guarantee content immutability across validators.
"""

import re
from urllib.parse import urlparse

GITHUB_RAW_HOST = "raw.githubusercontent.com"
COMMIT_SHA_REGEX = re.compile(r"^[0-9a-f]{40}$")
SAFE_NAME_REGEX = re.compile(r"^[a-zA-Z0-9_.-]+$")


class FixtureUrlValidationResult:
    def __init__(self, valid: bool, error: str = "", owner: str = "", repo: str = "", commit_sha: str = "", filename: str = ""):
        self.valid = valid
        self.error = error
        self.owner = owner
        self.repo = repo
        self.commit_sha = commit_sha
        self.filename = filename

    def __bool__(self):
        return self.valid

    def __repr__(self):
        return f"FixtureUrlValidationResult(valid={self.valid}, error='{self.error}')"


def validate_immutable_fixture_url(url_str: str, expected_filename: str = "") -> FixtureUrlValidationResult:
    """
    Validates that a complete fixture URL points to an immutable commit-pinned raw GitHub file.

    Expected structure:
    https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-commit>/fixtures/<filename.json>
    """
    if not url_str or not isinstance(url_str, str):
        return FixtureUrlValidationResult(False, "URL must be a non-empty string")

    try:
        parsed = urlparse(url_str)
    except Exception as exc:
        return FixtureUrlValidationResult(False, f"Malformed URL: {exc}")

    # 1. Protocol must be HTTPS
    if parsed.scheme != "https":
        return FixtureUrlValidationResult(False, f"Invalid protocol: '{parsed.scheme}'. HTTPS required.")

    # 2. Reject credentials embedded in URL
    if parsed.username or parsed.password:
        return FixtureUrlValidationResult(False, "URLs containing embedded credentials are prohibited")

    # 3. Hostname must be exactly raw.githubusercontent.com
    if (parsed.hostname or "").lower() != GITHUB_RAW_HOST:
        return FixtureUrlValidationResult(False, f"Disallowed hostname: '{parsed.hostname}'. Expected '{GITHUB_RAW_HOST}'.")

    # 4. Reject ports
    if parsed.port:
        return FixtureUrlValidationResult(False, "Custom ports are prohibited")

    # 5. Reject query parameters and hash fragments
    if parsed.query:
        return FixtureUrlValidationResult(False, f"Query parameters are prohibited: '{parsed.query}'")
    if parsed.fragment:
        return FixtureUrlValidationResult(False, f"URL fragments are prohibited: '{parsed.fragment}'")

    # 6. Path must split into exactly 5 segments: ['', owner, repo, commit_sha, 'fixtures', filename]
    segments = [s for s in parsed.path.split("/") if s]
    if len(segments) != 5:
        return FixtureUrlValidationResult(
            False,
            f"Invalid path structure. Expected: /<owner>/<repo>/<commit-sha>/fixtures/<filename.json>, got: '{parsed.path}'"
        )

    owner, repo, commit_sha, fixtures_dir, filename = segments

    if not SAFE_NAME_REGEX.match(owner) or owner in (".", ".."):
        return FixtureUrlValidationResult(False, f"Invalid owner segment: '{owner}'")

    if not SAFE_NAME_REGEX.match(repo) or repo in (".", ".."):
        return FixtureUrlValidationResult(False, f"Invalid repository segment: '{repo}'")

    if commit_sha in ("main", "master", "HEAD"):
        return FixtureUrlValidationResult(
            False,
            f"Mutable branch reference '{commit_sha}' is strictly disallowed. Exact 40-hex commit SHA required."
        )

    if not COMMIT_SHA_REGEX.match(commit_sha):
        return FixtureUrlValidationResult(
            False,
            f"Invalid commit SHA: '{commit_sha}'. Must be exactly 40 lowercase hexadecimal characters."
        )

    if fixtures_dir != "fixtures":
        return FixtureUrlValidationResult(False, f"Expected 'fixtures' directory in path, got '{fixtures_dir}'")

    if not SAFE_NAME_REGEX.match(filename) or not filename.endswith(".json") or filename == ".json":
        return FixtureUrlValidationResult(
            False,
            f"Invalid fixture filename: '{filename}'. Must end in .json without path traversal."
        )

    if expected_filename and filename != expected_filename:
        return FixtureUrlValidationResult(
            False,
            f"Filename mismatch: URL has '{filename}', expected '{expected_filename}'"
        )

    return FixtureUrlValidationResult(
        True,
        owner=owner,
        repo=repo,
        commit_sha=commit_sha,
        filename=filename
    )


def validate_immutable_fixture_base_url(base_url_str: str) -> FixtureUrlValidationResult:
    """
    Validates a base URL intended to serve as the root for fixture resolution.

    Expected structure:
    https://raw.githubusercontent.com/<owner>/<repo>/<40-hex-commit>/fixtures
    """
    if not base_url_str or not isinstance(base_url_str, str):
        return FixtureUrlValidationResult(False, "Base URL must be a non-empty string")

    try:
        parsed = urlparse(base_url_str)
    except Exception as exc:
        return FixtureUrlValidationResult(False, f"Malformed URL: {exc}")

    if parsed.scheme != "https":
        return FixtureUrlValidationResult(False, f"Invalid protocol: '{parsed.scheme}'. HTTPS required.")

    if parsed.username or parsed.password:
        return FixtureUrlValidationResult(False, "URLs containing embedded credentials are prohibited")

    if (parsed.hostname or "").lower() != GITHUB_RAW_HOST:
        return FixtureUrlValidationResult(False, f"Disallowed hostname: '{parsed.hostname}'. Expected '{GITHUB_RAW_HOST}'.")

    if parsed.port or parsed.query or parsed.fragment:
        return FixtureUrlValidationResult(False, "Ports, query parameters, and fragments are prohibited")

    segments = [s for s in parsed.path.split("/") if s]
    if len(segments) != 4:
        return FixtureUrlValidationResult(
            False,
            f"Invalid path structure. Expected: /<owner>/<repo>/<commit-sha>/fixtures, got: '{parsed.path}'"
        )

    owner, repo, commit_sha, fixtures_dir = segments

    if not SAFE_NAME_REGEX.match(owner) or owner in (".", ".."):
        return FixtureUrlValidationResult(False, f"Invalid owner segment: '{owner}'")

    if not SAFE_NAME_REGEX.match(repo) or repo in (".", ".."):
        return FixtureUrlValidationResult(False, f"Invalid repository segment: '{repo}'")

    if commit_sha in ("main", "master", "HEAD"):
        return FixtureUrlValidationResult(
            False,
            f"Mutable branch reference '{commit_sha}' is strictly disallowed. Exact 40-hex commit SHA required."
        )

    if not COMMIT_SHA_REGEX.match(commit_sha):
        return FixtureUrlValidationResult(
            False,
            f"Invalid commit SHA: '{commit_sha}'. Must be exactly 40 lowercase hexadecimal characters."
        )

    if fixtures_dir != "fixtures":
        return FixtureUrlValidationResult(False, f"Expected 'fixtures' directory in path, got '{fixtures_dir}'")

    return FixtureUrlValidationResult(
        True,
        owner=owner,
        repo=repo,
        commit_sha=commit_sha
    )
