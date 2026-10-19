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
  Ephemeral challenger is securely injected into process memory by deploy/run_python_live_integration.ts.
- Dynamic Funding: Challenger balance preflight verified prior to first deployment.
- Fail-Closed Assertions: Accounting invariants and specific contract revert classifications strictly enforced.
"""

import os
import sys
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
REQUIRED_CHALLENGER_MIN_BALANCE = 35_000_000_000_000_000  # 7 * 0.005 GEN = 0.035 GEN


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
    if not clean_key.startswith("0x") and not clean_key.startswith("0X"):
        clean_key = f"0x{clean_key}"

    raw_hex = clean_key[2:]
    if len(raw_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in raw_hex):
        pytest.fail("Invalid GENLAYER_PRIVATE_KEY format: expected a 64-character hex string.")

    account = create_account(clean_key)
    print(f"\n[live-issuer] Derived public address: {account.address}")
    return account


def get_challenger_signer(issuer_account):
    """
    Resolves the distinct funded ephemeral challenger account from child process environment.
    Must only be called after live opt-in and immutable fixture validation have passed.
    Fails closed with BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER if key is missing, malformed,
    or equals issuer.
    Never prints or leaks the challenger private key.
    Never falls back to issuer account.
    """
    raw_key = os.environ.get("RESERVECOVENANT_CHALLENGER_PRIVATE_KEY")
    if not raw_key or not raw_key.strip():
        pytest.fail(
            "BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER: RESERVECOVENANT_CHALLENGER_PRIVATE_KEY is missing from environment. "
            "Use the TypeScript live launcher (npm run test:integration:python:live) to generate and fund a distinct challenger."
        )

    clean_key = raw_key.strip()
    if not clean_key.startswith("0x") and not clean_key.startswith("0X"):
        clean_key = f"0x{clean_key}"

    raw_hex = clean_key[2:]
    if len(raw_hex) != 64 or not all(c in "0123456789abcdefABCDEF" for c in raw_hex):
        pytest.fail(
            "BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER: Invalid challenger private key format (expected 64 hex characters)."
        )

    try:
        challenger = create_account(clean_key)
    except Exception as exc:
        pytest.fail(
            f"BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER: Failed to create challenger account: {exc}"
        )

    if challenger.address.lower().strip() == issuer_account.address.lower().strip():
        pytest.fail(
            f"BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER: Challenger address {challenger.address} "
            f"matches issuer address {issuer_account.address}. Self-challenge is prohibited."
        )

    print(f"[live-challenger] Derived distinct challenger: {challenger.address}")
    return challenger


class ContractExecutionReceiptError(Exception):
    """Structured contract execution error containing receipt metadata."""
    def __init__(
        self,
        message: str,
        tx_hash: str = "",
        status: str = "",
        execution_result: str = "",
        method_name: str = "",
        contract_error_payload: str = "",
        receipt: dict = None,
    ):
        super().__init__(message)
        self.tx_hash = tx_hash
        self.status = status
        self.execution_result = execution_result
        self.method_name = method_name
        self.contract_error_payload = contract_error_payload
        self.receipt = receipt or {}


_SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE = False


def reset_session_challenger_preflight_for_tests():
    """Testing helper to reset session sentinel for offline tests."""
    global _SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE
    _SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE = False


def verify_challenger_balance_preflight_initial(
    challenger_account,
    min_balance_wei=REQUIRED_CHALLENGER_MIN_BALANCE,
    get_balance_fn=None,
):
    """
    Verifies that the challenger has sufficient balance on Studio Devnet before running scenarios.
    Executes exactly ONCE per test session (before Scenario 1).
    Does NOT re-run the full-suite minimum after earlier scenarios have legitimately spent funds.
    """
    global _SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE
    if _SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE:
        return

    if get_balance_fn is not None:
        bal = get_balance_fn(challenger_account.address)
    else:
        from genlayer_py import create_client, studio_devnet
        client = create_client(chain=studio_devnet)
        bal = client.get_balance(challenger_account.address)

    print(f"[live-challenger] Initial full-suite balance preflight: {bal} wei (minimum required: {min_balance_wei} wei)")
    if bal < min_balance_wei:
        pytest.fail(
            f"BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE: Challenger initial balance {bal} wei is below required full-suite minimum {min_balance_wei} wei."
        )

    _SESSION_INITIAL_CHALLENGER_PREFLIGHT_DONE = True


def verify_challenger_next_tx_balance(
    challenger_account,
    required_bond=DEFAULT_CHALLENGER_BOND,
    estimated_fee=100_000_000_000_000,
    safety_margin=200_000_000_000_000,
    get_balance_fn=None,
):
    """
    Verifies that the challenger has sufficient balance on Studio Devnet for the UPCOMING operation only.
    required = required_bond + estimated_fee + safety_margin (~0.0053 GEN).
    Does not require the full-suite 0.035 GEN.
    Stops before network submission with BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE if balance is insufficient.
    """
    if get_balance_fn is not None:
        bal = get_balance_fn(challenger_account.address)
    else:
        from genlayer_py import create_client, studio_devnet
        client = create_client(chain=studio_devnet)
        bal = client.get_balance(challenger_account.address)

    required_amount = required_bond + estimated_fee + safety_margin
    if bal < required_amount:
        pytest.fail(
            f"BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE: Challenger balance ({bal} wei) is insufficient for upcoming operation (requires {required_amount} wei)."
        )
    return bal


def _extract_python_receipt_error_payload(receipt, fallback=""):
    """Extracts the contract error payload string from a Python receipt dictionary."""
    if not isinstance(receipt, dict):
        return fallback

    # 1. Direct result string or payload dict
    res = receipt.get("result")
    if isinstance(res, str) and res:
        return res
    if isinstance(res, dict) and "payload" in res and isinstance(res["payload"], str):
        return res["payload"]

    # 2. leader_receipt in consensus_data
    consensus_data = receipt.get("consensus_data")
    if isinstance(consensus_data, dict):
        lr = consensus_data.get("leader_receipt")
        lr_item = lr if isinstance(lr, dict) else (lr[0] if isinstance(lr, list) and lr else None)
        if isinstance(lr_item, dict):
            lr_res = lr_item.get("result")
            if isinstance(lr_res, str) and lr_res:
                return lr_res
            if isinstance(lr_res, dict) and "payload" in lr_res:
                return str(lr_res["payload"])
            genvm_res = lr_item.get("genvm_result")
            if isinstance(genvm_res, dict):
                stderr = genvm_res.get("stderr") or ""
                stdout = genvm_res.get("stdout") or ""
                if stderr or stdout:
                    return f"{stderr} {stdout}".strip()
            elif isinstance(genvm_res, str) and genvm_res:
                return genvm_res

    # 3. Direct errorMessage / error / contract_error_payload
    for k in ("error_message", "errorMessage", "error", "contract_error_payload"):
        val = receipt.get(k)
        if isinstance(val, str) and val:
            return val

    return fallback


def assert_expected_contract_failure(call_fn, expected_substring="", expected_method="", verify_state_fn=None):
    """
    Distinguishes accepted on-chain contract execution errors (reverts)
    from rejected unrelated infrastructure/network errors.
    Requires structured receipt execution data indicating FINISHED_WITH_ERROR.
    Fails closed if the call succeeds, fails due to an unstructured or unrelated error,
    or fails to preserve contract state.
    """
    call_result = None
    threw = False
    captured_exc = None
    try:
        call_result = call_fn()
    except Exception as exc:
        threw = True
        captured_exc = exc

    # Path 1: call_fn returned a receipt dictionary or object
    if not threw and call_result is not None:
        receipt = call_result
        if not isinstance(receipt, dict):
            pytest.fail(f"Expected contract failure on '{expected_method}', but call returned non-dict object: {type(receipt)}")

        # Check for unexpected success (FINISHED_WITH_RETURN)
        exec_res = str(receipt.get("tx_execution_result_name", receipt.get("tx_execution_result", ""))).upper()
        if exec_res in {"FINISHED_WITH_RETURN", "1"}:
            pytest.fail(
                f"Expected contract execution failure on '{expected_method}', but transaction succeeded unexpectedly (hash={receipt.get('hash')})."
            )

        status = str(receipt.get("status_name", receipt.get("status", ""))).upper()
        if status not in {"ACCEPTED", "FINALIZED", "5", "7"}:
            pytest.fail(
                f"Receipt verification failed on '{expected_method}': expected FINALIZED or ACCEPTED consensus, got '{status}'."
            )

        if exec_res not in {"FINISHED_WITH_ERROR", "2"}:
            pytest.fail(
                f"Receipt verification failed on '{expected_method}': expected FINISHED_WITH_ERROR, got '{exec_res}'."
            )

        tx_hash = str(receipt.get("hash") or receipt.get("transaction_hash") or "")
        if not tx_hash:
            pytest.fail(f"Receipt on '{expected_method}' is missing transaction hash.")

        rec_method = str(receipt.get("method_name") or receipt.get("method") or "")
        if expected_method and rec_method and rec_method != expected_method:
            pytest.fail(
                f"Receipt method mismatch: expected '{expected_method}', got '{rec_method}'."
            )

        payload = _extract_python_receipt_error_payload(receipt)
        if expected_substring and expected_substring.lower() not in payload.lower():
            pytest.fail(
                f"Contract error payload on '{expected_method}' did not match expected substring '{expected_substring}'. Got: '{payload}'"
            )

        if verify_state_fn:
            verify_state_fn()
        return receipt

    # Path 2: call_fn threw an exception
    if not threw:
        pytest.fail(f"Expected contract execution failure on '{expected_method}', but call succeeded without return or error.")

    # Reject plain unstructured exceptions (like Exception("CHALLENGED") or Exception("credit"))
    receipt = getattr(captured_exc, "receipt", None) or getattr(captured_exc, "transaction", None)
    if not isinstance(receipt, dict) and not isinstance(captured_exc, ContractExecutionReceiptError):
        pytest.fail(
            f"Rejected unstructured exception without receipt on '{expected_method}': {type(captured_exc).__name__}: {captured_exc}"
        )

    # Inspect structured receipt on exception
    rec_dict = receipt if isinstance(receipt, dict) else getattr(captured_exc, "receipt", {})
    tx_hash = str(rec_dict.get("hash") or rec_dict.get("transaction_hash") or getattr(captured_exc, "tx_hash", "") or "")
    if not tx_hash:
        pytest.fail(f"Structured error on '{expected_method}' is missing transaction hash.")

    rec_method = str(rec_dict.get("method_name") or rec_dict.get("method") or getattr(captured_exc, "method_name", "") or "")
    if expected_method and rec_method and rec_method != expected_method:
        pytest.fail(
            f"Structured error method mismatch on '{expected_method}': got '{rec_method}'."
        )

    status = str(rec_dict.get("status_name", rec_dict.get("status", getattr(captured_exc, "status", "")))).upper()
    if status not in {"ACCEPTED", "FINALIZED", "5", "7"}:
        pytest.fail(f"Structured error on '{expected_method}' has non-final status: '{status}'.")

    exec_res = str(rec_dict.get("tx_execution_result_name", rec_dict.get("tx_execution_result", getattr(captured_exc, "execution_result", "")))).upper()
    if exec_res not in {"FINISHED_WITH_ERROR", "2"}:
        pytest.fail(f"Structured error on '{expected_method}' has unexpected execution result: '{exec_res}'.")

    payload = _extract_python_receipt_error_payload(rec_dict, fallback=str(captured_exc))
    if expected_substring and expected_substring.lower() not in payload.lower():
        pytest.fail(
            f"Contract error payload on '{expected_method}' did not match expected substring '{expected_substring}'. Got: '{payload}'"
        )

    if verify_state_fn:
        verify_state_fn()

    return captured_exc


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


@pytest.fixture
def live_signers(live_fixture_base_url):
    """
    Resolves both distinct signers and validates challenger balance preflight.
    Only called after live opt-in and immutable fixture validation have passed.
    Session-level full-suite check runs once; per-operation check runs before each challenger transaction.
    """
    issuer = get_live_signer()
    challenger = get_challenger_signer(issuer)
    verify_challenger_balance_preflight_initial(challenger)
    verify_challenger_next_tx_balance(challenger)
    return issuer, challenger


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


def test_live_01_deterministic_coverage_shortfall(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 1: Deterministic coverage shortfall resolves BREACHED."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-coverage-shortfall.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-coverage-shortfall.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "BREACHED"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_02_deterministic_ineligible_reserve(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 2: Deterministic ineligible reserve resolves BREACHED."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-ineligible-reserve.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-ineligible-reserve.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_CATEGORY_DISALLOWED"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_03_future_dated_stale_report(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 3: Future-dated report under STALE_REPORT resolves BREACHED."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-future-dated.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-future-dated.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
    c.open_challenge(
        1,
        "STALE_REPORT",
        f"{live_fixture_base_url}/challenger-unsupported-claim.json",
        hashlib.sha256((fixtures_dir / "challenger-unsupported-claim.json").read_bytes()).hexdigest(),
        "In our opinion, the reserve assets reported by the issuer are held in segregated, bankruptcy-remote accounts at regulated financial institutions and are free of any liens, pledges, or encumbrances.",
        "Reported timestamp as_of_unix is in the future",
        value=DEFAULT_CHALLENGER_BOND,
        account=challenger,
    )

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_REPORT_FUTURE_DATED"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_04_material_disclaimer_semantic_breach(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 4: Clear material disclaimer with hash-verified evidence resolves semantic BREACHED."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-material-disclaimer.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-material-disclaimer.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "BREACHED"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "BREACH_DISCLAIMER_INVALIDATES_RESERVES"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_05_unsupported_semantic_accusation(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 5: Unsupported semantic accusation resolves UPHELD."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    fixtures_dir = Path(__file__).resolve().parent.parent.parent / "fixtures"
    snap_url = f"{live_fixture_base_url}/epoch-compliant.json"
    snap_sha = hashlib.sha256((fixtures_dir / "epoch-compliant.json").read_bytes()).hexdigest()

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "UPHELD"
    rec = c.get_epoch(1)
    assert rec["reason_code"] == "UPHELD_NO_UNREPORTED_LIABILITY"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_06_unreachable_or_mismatched_evidence_inconclusive(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 6: Unreachable or hash-mismatched evidence resolves INCONCLUSIVE."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    c.resolve_challenge(1, account=issuer)  # Permissionless resolution signed by issuer
    status = c.get_current_status()
    assert status == "INCONCLUSIVE"
    accounting = c.get_accounting()
    assert accounting["invariant_satisfied"] is True
    assert accounting["locked_issuer_bonds"] == 0
    assert accounting["locked_challenger_bonds"] == 0


def test_live_07_repeated_resolution_reverts(contract_factory, live_fixture_base_url, live_signers):
    """Scenario 7: Repeated resolution of a terminal epoch reverts on a fresh contract instance."""
    issuer, challenger = live_signers
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    verify_challenger_next_tx_balance(challenger)
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

    # First resolution succeeds and transitions to terminal INCONCLUSIVE
    c.resolve_challenge(1, account=issuer)
    status_before = c.get_current_status()
    assert status_before == "INCONCLUSIVE"

    acct_first = c.get_accounting()
    assert acct_first["invariant_satisfied"] is True
    assert acct_first["locked_issuer_bonds"] == 0
    assert acct_first["locked_challenger_bonds"] == 0

    # Second resolution must fail on-chain because epoch is no longer CHALLENGED
    def verify_state_unchanged():
        status_after = c.get_current_status()
        assert status_after == "INCONCLUSIVE"
        acct_after = c.get_accounting()
        assert acct_after["invariant_satisfied"] is True
        assert acct_after["locked_issuer_bonds"] == 0
        assert acct_after["locked_challenger_bonds"] == 0

    assert_expected_contract_failure(
        lambda: c.resolve_challenge(1, account=issuer),
        expected_substring="resolve_challenge only allowed in CHALLENGED state",
        expected_method="resolve_challenge",
        verify_state_fn=verify_state_unchanged,
    )


def test_live_08_withdrawal_credit_no_double_spend(contract_factory, live_fixture_base_url):
    """Scenario 8: Pull-credit withdrawal succeeds once and cannot double-withdraw."""
    issuer = get_live_signer()
    c = deploy_disposable_contract(contract_factory, issuer)

    snap_url = "https://unreachable-domain-12345.example.com/snapshot.json"
    snap_sha = "0" * 64

    c.publish_epoch(snap_url, snap_sha, value=DEFAULT_ISSUER_BOND, account=issuer)
    c.cancel_epoch(1, account=issuer)

    acct_cancel = c.get_accounting()
    assert acct_cancel["invariant_satisfied"] is True
    assert acct_cancel["locked_issuer_bonds"] == 0
    assert acct_cancel["total_credits"] == DEFAULT_ISSUER_BOND

    # First withdrawal succeeds
    credit_before = c.get_credit(issuer.address)
    assert credit_before == DEFAULT_ISSUER_BOND

    c.withdraw_credit(account=issuer)
    credit_after = c.get_credit(issuer.address)
    assert credit_after == 0

    acct_first_withdraw = c.get_accounting()
    assert acct_first_withdraw["invariant_satisfied"] is True
    assert acct_first_withdraw["total_credits"] == 0

    # Second withdrawal must revert because credit is zero
    def verify_credit_remains_zero():
        credit_final = c.get_credit(issuer.address)
        assert credit_final == 0
        acct_second_withdraw = c.get_accounting()
        assert acct_second_withdraw["invariant_satisfied"] is True
        assert acct_second_withdraw["total_credits"] == 0

    assert_expected_contract_failure(
        lambda: c.withdraw_credit(account=issuer),
        expected_substring="No withdrawal credit available",
        expected_method="withdraw_credit",
        verify_state_fn=verify_credit_remains_zero,
    )
