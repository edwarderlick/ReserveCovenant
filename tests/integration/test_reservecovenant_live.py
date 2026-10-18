"""
Live Integration Test Suite for ReserveCovenant on GenLayer Studio Devnet.

Exercises real executable live scenarios:
1. Deterministic coverage shortfall resolves BREACHED.
2. Deterministic ineligible reserve resolves BREACHED.
3. Future-dated report under STALE_REPORT resolves BREACHED.
4. Clear material disclaimer with hash-verified evidence resolves semantic BREACHED.
5. Unsupported semantic accusation resolves UPHELD.
6. Unreachable or hash-mismatched evidence resolves INCONCLUSIVE.
7. Repeated resolution of a terminal epoch reverts on a fresh contract instance.
8. Pull-credit withdrawal succeeds once and cannot double-withdraw.

Safety, Signer & Fixture Gates:
- Default: Safely skips cleanly before any network write unless RESERVECOVENANT_RUN_LIVE_TESTS=1.
- Public Fixture Gate: Requires RESERVECOVENANT_FIXTURE_BASE_URL pointing to immutable commit-pinned
  public HTTPS fixture URLs. If unconfigured or mutable (e.g. /main/), fails with
  BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION before any network write.
- Signer Separation: Enforces normalized issuer address != normalized challenger address.
"""

import os
import sys
import secrets
import hashlib
from pathlib import Path
import pytest
from gltest import get_contract_factory, create_account

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from tests.integration.fixture_url_validator import validate_immutable_fixture_base_url

DEFAULT_ISSUER_BOND = 10_000_000_000_000_000  # 0.01 GEN
DEFAULT_CHALLENGER_BOND = 5_000_000_000_000_000  # 0.005 GEN
DEFAULT_CATEGORIES = ["bank_deposits", "cash", "us_treasuries"]


def get_live_signer():
    """
    Guarded live signer derivation for Issuer.
    Requires GENLAYER_PRIVATE_KEY or PRIVATE_KEY in environment.
    Never logs or leaks the private key.
    """
    raw_key = os.environ.get("GENLAYER_PRIVATE_KEY") or os.environ.get("PRIVATE_KEY")
    if not raw_key or not raw_key.strip():
        pytest.fail(
            "Live network execution requires GENLAYER_PRIVATE_KEY or PRIVATE_KEY in environment."
        )

    clean_key = raw_key.strip()
    if not clean_key.startswith("0x"):
        clean_key = f"0x{clean_key}"

    raw_hex = clean_key[2:] if clean_key.startswith(("0x", "0X")) else clean_key
    if len(raw_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in raw_hex):
        pytest.fail("Invalid GENLAYER_PRIVATE_KEY format: expected a 64-character hex string.")

    account = create_account(clean_key)
    print(f"\n[live-issuer] Derived public address: {account.address}")
    return account


def get_challenger_signer(issuer_account):
    """
    Derives a distinct ephemeral challenger account in process memory.
    Asserts normalized issuer address != normalized challenger address.
    Never logs or leaks the private key.
    """
    challenger_key = "0x" + secrets.token_hex(32)
    challenger = create_account(challenger_key)

    if challenger.address.lower().strip() == issuer_account.address.lower().strip():
        pytest.fail(
            "Signer separation failed: Ephemeral challenger collided with issuer address. "
            "ReserveCovenant rejects issuer self-challenges."
        )

    print(f"[live-challenger] Derived distinct challenger: {challenger.address}")
    return challenger


@pytest.fixture(autouse=True)
def require_live_opt_in():
    """Explicit opt-in guard: skips cleanly unless RESERVECOVENANT_RUN_LIVE_TESTS=1."""
    if os.environ.get("RESERVECOVENANT_RUN_LIVE_TESTS") != "1":
        pytest.skip(
            "Live network integration tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1. "
            "Skipping test before contract deployment or transaction submission."
        )


@pytest.fixture
def live_fixture_base_url():
    """Public fixture gate: requires commit-pinned public HTTPS fixture URLs."""
    url = os.environ.get("RESERVECOVENANT_FIXTURE_BASE_URL", "").strip()
    res = validate_immutable_fixture_base_url(url)
    if not res.valid:
        pytest.fail(
            f"BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION: {res.error}. "
            "GenLayer validators require immutable public commit-pinned HTTPS fixture URLs. "
            "Configure RESERVECOVENANT_FIXTURE_BASE_URL once public commit-pinned fixtures are available."
        )
    return url.rstrip("/")


@pytest.fixture
def contract_factory():
    if os.environ.get("RESERVECOVENANT_RUN_LIVE_TESTS") != "1":
        pytest.skip("RESERVECOVENANT_RUN_LIVE_TESTS=1 required.")
    return get_contract_factory("ReserveCovenant")


def deploy_disposable_contract(contract_factory, issuer):
    """Deploys a fresh disposable contract instance on Studio Devnet."""
    contract = contract_factory.deploy(
        issuer.address,  # issuer
        issuer.address,  # treasury
        "usd-reserve-covenant",
        "USDR",
        "Reserve assets must be held in segregated bank deposits or direct US treasuries, unencumbered.",
        DEFAULT_CATEGORIES,
        10000,   # min_coverage_bps (100.00%)
        604800,  # max_report_age_seconds (7 days)
        86400,   # challenge_window_seconds (24h)
        86400,   # resolution_timeout_seconds (24h)
        DEFAULT_ISSUER_BOND,
        DEFAULT_CHALLENGER_BOND,
        1000,    # treasury_bps (10.00%)
        account=issuer,
    )
    return contract


def test_live_01_deterministic_coverage_shortfall(contract_factory, live_fixture_base_url):
    """Scenario 1: Deterministic coverage shortfall resolves BREACHED."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-coverage-shortfall.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-coverage-shortfall.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "COVERAGE_SHORTFALL",
        f"{live_fixture_base_url}/challenger-unsupported-claim.json",
        hashlib.sha256((fixtures_dir / "challenger-unsupported-claim.json").read_bytes()).hexdigest(),
        "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
        "Reported coverage is 95% which is below covenant minimum 100%",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "BREACHED"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True


def test_live_02_deterministic_ineligible_reserve(contract_factory, live_fixture_base_url):
    """Scenario 2: Deterministic ineligible reserve resolves BREACHED."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-ineligible-reserve.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-ineligible-reserve.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "INELIGIBLE_RESERVE",
        f"{live_fixture_base_url}/challenger-unsupported-claim.json",
        hashlib.sha256((fixtures_dir / "challenger-unsupported-claim.json").read_bytes()).hexdigest(),
        "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
        "Reported reserves include disallowed equities category",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_CATEGORY_DISALLOWED"


def test_live_03_future_dated_stale_report(contract_factory, live_fixture_base_url):
    """Scenario 3: Future-dated report under STALE_REPORT resolves BREACHED."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-future-dated.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-future-dated.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "STALE_REPORT",
        f"{live_fixture_base_url}/challenger-unsupported-claim.json",
        hashlib.sha256((fixtures_dir / "challenger-unsupported-claim.json").read_bytes()).hexdigest(),
        "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
        "Report timestamp as_of_unix is in the future",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_REPORT_FUTURE_DATED"


def test_live_04_material_disclaimer_semantic_breach(contract_factory, live_fixture_base_url):
    """Scenario 4: Clear material disclaimer with hash-verified evidence resolves semantic BREACHED."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-material-disclaimer.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-material-disclaimer.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "MATERIAL_DISCLAIMER",
        f"{live_fixture_base_url}/challenger-material-disclaimer.json",
        hashlib.sha256((fixtures_dir / "challenger-material-disclaimer.json").read_bytes()).hexdigest(),
        "The reserves reported herein are subject to general commercial claims of the parent custodian and may be encumbered under credit facilities.",
        "Attestation admits reserves are subject to parent commercial claims and credit encumbrance",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_DISCLAIMER_INVALIDATES_RESERVES"


def test_live_05_unsupported_semantic_accusation(contract_factory, live_fixture_base_url):
    """Scenario 5: Unsupported semantic accusation resolves UPHELD."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-compliant.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-compliant.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "OMITTED_LIABILITY",
        f"{live_fixture_base_url}/challenger-unsupported-claim.json",
        hashlib.sha256((fixtures_dir / "challenger-unsupported-claim.json").read_bytes()).hexdigest(),
        "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
        "Unsupported claim alleging unrecorded commercial debt",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "UPHELD"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "UPHELD_NO_UNREPORTED_LIABILITY"


def test_live_06_unreachable_or_mismatched_evidence_inconclusive(contract_factory, live_fixture_base_url):
    """Scenario 6: Unreachable or hash-mismatched evidence resolves INCONCLUSIVE."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "COVERAGE_SHORTFALL",
        "https://unreachable-domain-12345.example.com/evidence.json",
        "1" * 64,
        "sample citation string longer than 16 characters",
        "Unreachable evidence test",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status = c.get_current_status()
    assert status == "INCONCLUSIVE"


def test_live_07_repeated_resolution_reverts(contract_factory, live_fixture_base_url):
    """Scenario 7: Repeated resolution of a terminal epoch reverts on a fresh contract instance."""
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.open_challenge(
        1,
        "COVERAGE_SHORTFALL",
        "https://unreachable-domain-12345.example.com/evidence.json",
        "1" * 64,
        "sample citation string longer than 16 characters",
        "Repeated resolution test on fresh contract",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)
    status_before = c.get_current_status()
    assert status_before == "INCONCLUSIVE"

    # Second resolution must fail and revert
    with pytest.raises(Exception):
        c.resolve_challenge(1, account=issuer)

    # State must remain unchanged
    status_after = c.get_current_status()
    assert status_after == "INCONCLUSIVE"


def test_live_08_withdrawal_credit_no_double_spend(contract_factory, live_fixture_base_url):
    """Scenario 8: Pull-credit withdrawal succeeds once and cannot double-withdraw."""
    issuer = get_live_signer()
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.cancel_epoch(1, account=issuer)

    # First withdrawal succeeds
    credit_before = c.get_credit(issuer.address)
    assert credit_before == DEFAULT_ISSUER_BOND

    c.withdraw_credit(account=issuer)
    credit_after = c.get_credit(issuer.address)
    assert credit_after == 0

    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True

    # Second withdrawal must revert
    with pytest.raises(Exception):
        c.withdraw_credit(account=issuer)

    # Credit remains zero
    credit_final = c.get_credit(issuer.address)
    assert credit_final == 0
