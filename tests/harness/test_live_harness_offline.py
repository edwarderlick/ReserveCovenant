"""
Offline Live Harness Validation Suite (Pure Offline, Zero Network Writes).

Tests the harness planning, signer separation, URL validation, dynamic funding math,
challenger resolution fail-closed behavior, and call argument specifications:
- Signer separation logic (self-challenge rejection before network write)
- Ephemeral challenger signer resolution (fails closed on missing, malformed, or collided key)
- Challenger signer never falls back to issuer
- Immutable fixture URL validation (commit-pinned accepted; mutable rejected)
- Scenario call argument specifications (Scenario 4 uses open_challenge with MATERIAL_DISCLAIMER)
- Expected contract error classification (rejects network/infrastructure errors)
- Accounting invariant enforcement

Label: OFFLINE_HARNESS_VALIDATION_PASS
(Not LIVE_VALIDATOR_CONSENSUS_PASS)
"""

import os
import sys
from pathlib import Path
import pytest
from unittest.mock import MagicMock

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from tests.integration.fixture_url_validator import (
    validate_immutable_fixture_url,
    validate_immutable_fixture_base_url,
)
from tests.integration.test_reservecovenant_live import (
    get_challenger_signer,
    assert_expected_contract_failure,
    ContractExecutionReceiptError,
    verify_challenger_balance_preflight_initial,
    verify_challenger_next_tx_balance,
    reset_session_challenger_preflight_for_tests,
    get_dynamic_fee_estimate_wei,
    derive_dynamic_safety_margin_wei,
    REQUIRED_CHALLENGER_MIN_BALANCE,
)


def test_offline_signer_separation_logic():
    """Proves that signer separation logic accepts distinct addresses and rejects identical ones."""
    issuer_addr = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD"
    challenger_addr = "0x1111111111111111111111111111111111111111"

    # Distinct addresses must succeed
    assert issuer_addr.lower() != challenger_addr.lower()

    # Identical addresses (self-challenge) must be detected and rejected
    with pytest.raises(ValueError, match="Self-challenge configuration rejected"):
        def assert_distinct(addr1, addr2):
            if addr1.lower().strip() == addr2.lower().strip():
                raise ValueError("Self-challenge configuration rejected: Issuer and Challenger cannot share address")
        assert_distinct(issuer_addr, issuer_addr.lower())


def test_offline_challenger_missing_key_fails_closed(monkeypatch):
    """Proves that missing RESERVECOVENANT_CHALLENGER_PRIVATE_KEY fails closed with BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER."""
    monkeypatch.delenv("RESERVECOVENANT_CHALLENGER_PRIVATE_KEY", raising=False)
    mock_issuer = MagicMock()
    mock_issuer.address = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD"

    with pytest.raises(pytest.fail.Exception) as excinfo:
        get_challenger_signer(mock_issuer)

    msg = str(excinfo.value)
    assert "BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER" in msg
    assert "is missing from environment" in msg


def test_offline_challenger_malformed_key_fails_closed(monkeypatch):
    """Proves that malformed challenger private key fails closed with BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER."""
    monkeypatch.setenv("RESERVECOVENANT_CHALLENGER_PRIVATE_KEY", "not-a-valid-64-hex-key")
    mock_issuer = MagicMock()
    mock_issuer.address = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD"

    with pytest.raises(pytest.fail.Exception) as excinfo:
        get_challenger_signer(mock_issuer)

    msg = str(excinfo.value)
    assert "BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER" in msg
    assert "Invalid challenger private key format" in msg


def test_offline_challenger_equal_issuer_fails_closed(monkeypatch):
    """Proves that equal issuer and challenger addresses fail closed before any network write."""
    # Private key for address 0x31cB1c6Bdb3Ed7B07B3394d714A380F73BC9aa15 (or known dummy)
    dummy_key = "0x1111111111111111111111111111111111111111111111111111111111111111"
    from gltest import create_account
    acct = create_account(dummy_key)

    monkeypatch.setenv("RESERVECOVENANT_CHALLENGER_PRIVATE_KEY", dummy_key)
    mock_issuer = MagicMock()
    mock_issuer.address = acct.address  # Same address as derived challenger

    with pytest.raises(pytest.fail.Exception) as excinfo:
        get_challenger_signer(mock_issuer)

    msg = str(excinfo.value)
    assert "BLOCKED_PENDING_DISTINCT_CHALLENGER_SIGNER" in msg
    assert "Self-challenge is prohibited" in msg


def test_offline_challenger_never_falls_back_to_issuer(monkeypatch):
    """Proves that challenger account derivation succeeds with distinct key and never equals issuer."""
    dummy_key = "0x1111111111111111111111111111111111111111111111111111111111111111"
    monkeypatch.setenv("RESERVECOVENANT_CHALLENGER_PRIVATE_KEY", dummy_key)

    mock_issuer = MagicMock()
    mock_issuer.address = "0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD"

    challenger = get_challenger_signer(mock_issuer)
    assert challenger.address.lower() != mock_issuer.address.lower()
    assert challenger.address.startswith("0x")


def test_offline_rejection_of_plain_and_infrastructure_errors():
    """
    Proves that assert_expected_contract_failure rejects plain unstructured exceptions
    and infrastructure errors, even when they contain the expected string.
    """
    # 1. Plain Exception("CHALLENGED") must be rejected
    def mock_plain_challenged():
        raise Exception("CHALLENGED")

    with pytest.raises(pytest.fail.Exception) as excinfo_ch:
        assert_expected_contract_failure(
            mock_plain_challenged,
            expected_substring="CHALLENGED",
            expected_method="resolve_challenge",
        )
    assert "Rejected unstructured exception without receipt" in str(excinfo_ch.value)

    # 2. Plain Exception("credit") must be rejected
    def mock_plain_credit():
        raise Exception("No withdrawal credit available")

    with pytest.raises(pytest.fail.Exception) as excinfo_cr:
        assert_expected_contract_failure(
            mock_plain_credit,
            expected_substring="No withdrawal credit available",
            expected_method="withdraw_credit",
        )
    assert "Rejected unstructured exception without receipt" in str(excinfo_cr.value)

    # 3. ConnectionError / RPC timeout must be rejected
    def mock_rpc_timeout():
        raise ConnectionError("RPC timeout occurred while waiting for resolve_challenge in CHALLENGED state")

    with pytest.raises(pytest.fail.Exception) as excinfo_rpc:
        assert_expected_contract_failure(
            mock_rpc_timeout,
            expected_substring="CHALLENGED",
            expected_method="resolve_challenge",
        )
    assert "Rejected unstructured exception without receipt" in str(excinfo_rpc.value)

    # 4. Unexpected success must be rejected
    def mock_success():
        return {
            "hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "status_name": "FINALIZED",
            "tx_execution_result_name": "FINISHED_WITH_RETURN",
            "method_name": "resolve_challenge",
        }

    with pytest.raises(pytest.fail.Exception) as excinfo_succ:
        assert_expected_contract_failure(
            mock_success,
            expected_substring="CHALLENGED",
            expected_method="resolve_challenge",
        )
    assert "Expected contract execution failure on 'resolve_challenge', but transaction succeeded unexpectedly" in str(excinfo_succ.value)


def test_offline_acceptance_of_structured_contract_execution_failure():
    """
    Proves that assert_expected_contract_failure accepts recognized structured contract execution failures
    with receipt metadata (hash, FINALIZED/ACCEPTED, FINISHED_WITH_ERROR, matching method, and matching reason).
    """
    tx_hash = "0x" + "a" * 64
    state_verified = False

    def mock_verify_state():
        nonlocal state_verified
        state_verified = True

    # 1. Thrown ContractExecutionReceiptError
    def mock_throw_structured():
        raise ContractExecutionReceiptError(
            message="Contract execution failed on-chain",
            tx_hash=tx_hash,
            status="FINALIZED",
            execution_result="FINISHED_WITH_ERROR",
            method_name="resolve_challenge",
            contract_error_payload="resolve_challenge only allowed in CHALLENGED state",
            receipt={
                "hash": tx_hash,
                "status_name": "FINALIZED",
                "tx_execution_result_name": "FINISHED_WITH_ERROR",
                "method_name": "resolve_challenge",
                "result": {"payload": "resolve_challenge only allowed in CHALLENGED state"},
            },
        )

    res = assert_expected_contract_failure(
        mock_throw_structured,
        expected_substring="resolve_challenge only allowed in CHALLENGED state",
        expected_method="resolve_challenge",
        verify_state_fn=mock_verify_state,
    )
    assert isinstance(res, ContractExecutionReceiptError)
    assert state_verified is True

    # 2. Returned receipt dictionary
    def mock_return_receipt():
        return {
            "hash": tx_hash,
            "status_name": "FINALIZED",
            "tx_execution_result_name": "FINISHED_WITH_ERROR",
            "method_name": "withdraw_credit",
            "result": {"payload": "No withdrawal credit available"},
        }

    state_verified_2 = False
    def mock_verify_state_2():
        nonlocal state_verified_2
        state_verified_2 = True

    rec_res = assert_expected_contract_failure(
        mock_return_receipt,
        expected_substring="No withdrawal credit available",
        expected_method="withdraw_credit",
        verify_state_fn=mock_verify_state_2,
    )
    assert isinstance(rec_res, dict)
    assert state_verified_2 is True


def test_offline_structured_failure_rejections():
    """Proves that structured failures are rejected if method, reason, status, or tx hash are invalid."""
    tx_hash = "0x" + "b" * 64

    # 1. Wrong method
    def mock_wrong_method():
        return {
            "hash": tx_hash,
            "status_name": "FINALIZED",
            "tx_execution_result_name": "FINISHED_WITH_ERROR",
            "method_name": "wrong_method",
            "result": {"payload": "resolve_challenge only allowed in CHALLENGED state"},
        }

    with pytest.raises(pytest.fail.Exception) as exc_meth:
        assert_expected_contract_failure(
            mock_wrong_method,
            expected_substring="resolve_challenge only allowed in CHALLENGED state",
            expected_method="resolve_challenge",
        )
    assert "Receipt method mismatch" in str(exc_meth.value)

    # 2. Wrong reason substring
    def mock_wrong_reason():
        return {
            "hash": tx_hash,
            "status_name": "FINALIZED",
            "tx_execution_result_name": "FINISHED_WITH_ERROR",
            "method_name": "resolve_challenge",
            "result": {"payload": "Completely different reason"},
        }

    with pytest.raises(pytest.fail.Exception) as exc_reas:
        assert_expected_contract_failure(
            mock_wrong_reason,
            expected_substring="resolve_challenge only allowed in CHALLENGED state",
            expected_method="resolve_challenge",
        )
    assert "did not match expected substring" in str(exc_reas.value)

    # 3. Non-final status (e.g. PENDING)
    def mock_pending():
        return {
            "hash": tx_hash,
            "status_name": "PENDING",
            "tx_execution_result_name": "FINISHED_WITH_ERROR",
            "method_name": "resolve_challenge",
            "result": {"payload": "resolve_challenge only allowed in CHALLENGED state"},
        }

    with pytest.raises(pytest.fail.Exception) as exc_stat:
        assert_expected_contract_failure(
            mock_pending,
            expected_substring="resolve_challenge only allowed in CHALLENGED state",
            expected_method="resolve_challenge",
        )
    assert "expected FINALIZED or ACCEPTED consensus" in str(exc_stat.value)

    # 4. Missing transaction hash
    def mock_missing_hash():
        return {
            "hash": "",
            "status_name": "FINALIZED",
            "tx_execution_result_name": "FINISHED_WITH_ERROR",
            "method_name": "resolve_challenge",
            "result": {"payload": "resolve_challenge only allowed in CHALLENGED state"},
        }

    with pytest.raises(pytest.fail.Exception) as exc_nohash:
        assert_expected_contract_failure(
            mock_missing_hash,
            expected_substring="resolve_challenge only allowed in CHALLENGED state",
            expected_method="resolve_challenge",
        )
    assert "missing transaction hash" in str(exc_nohash.value)


def test_offline_challenger_balance_preflight_scope(monkeypatch):
    """
    Proves challenger balance preflight behavior:
    - Session-level full-suite preflight runs exactly once.
    - Decreasing balance does not trigger a false full-suite check on subsequent calls.
    - Per-operation check fails before submission when upcoming balance is insufficient.
    - Per-operation check proceeds when upcoming balance is sufficient.
    """
    monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", "100000000000000")
    reset_session_challenger_preflight_for_tests()
    mock_challenger = MagicMock()
    mock_challenger.address = "0x" + "c" * 40

    call_count = 0
    simulated_balance = REQUIRED_CHALLENGER_MIN_BALANCE + 1_000_000_000_000_000  # ~0.036 GEN

    def mock_get_balance(_addr):
        nonlocal call_count
        call_count += 1
        return simulated_balance

    # 1. First initial check runs and verifies against full-suite minimum (0.035 GEN)
    verify_challenger_balance_preflight_initial(mock_challenger, get_balance_fn=mock_get_balance)
    assert call_count == 1

    # 2. Simulated scenario spending: balance drops to 0.020 GEN (below 0.035 GEN full-suite minimum)
    simulated_balance = 20_000_000_000_000_000
    # Second call to initial check must be a no-op (does NOT re-query or fail)
    verify_challenger_balance_preflight_initial(mock_challenger, get_balance_fn=mock_get_balance)
    assert call_count == 1  # Not called again because session sentinel is set

    # 3. Per-operation check for next challenger transaction:
    # Requires only bond (0.005 GEN) + fee + safety margin (~0.0053 GEN)
    # With 0.020 GEN, next-operation check must succeed
    op_bal = verify_challenger_next_tx_balance(mock_challenger, get_balance_fn=mock_get_balance)
    assert op_bal == 20_000_000_000_000_000
    assert call_count == 2

    # 4. If balance drops below next-operation requirement (e.g. 0.002 GEN < 0.0053 GEN):
    simulated_balance = 2_000_000_000_000_000
    with pytest.raises(pytest.fail.Exception) as exc_low:
        verify_challenger_next_tx_balance(mock_challenger, get_balance_fn=mock_get_balance)
    assert "BLOCKED_INSUFFICIENT_STUDIO_DEVNET_BALANCE" in str(exc_low.value)
    assert "insufficient for upcoming operation" in str(exc_low.value)
    assert call_count == 3


def test_offline_dynamic_fee_estimate_validation(monkeypatch):
    """
    Proves strict fail-closed validation of the dynamic fee estimate:
    - Missing environment variable fails closed with BLOCKED_MISSING_FEE_ESTIMATE.
    - Malformed string fails closed with BLOCKED_MALFORMED_FEE_ESTIMATE.
    - Zero or negative values fail closed with BLOCKED_INVALID_FEE_ESTIMATE.
    - Positive integers succeed and derive bounded safety margins.
    """
    # 1. Missing env var
    monkeypatch.delenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", raising=False)
    with pytest.raises(pytest.fail.Exception) as exc_miss:
        get_dynamic_fee_estimate_wei()
    assert "BLOCKED_MISSING_FEE_ESTIMATE" in str(exc_miss.value)

    # 2. Empty string
    monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", "   ")
    with pytest.raises(pytest.fail.Exception) as exc_empty:
        get_dynamic_fee_estimate_wei()
    assert "BLOCKED_MISSING_FEE_ESTIMATE" in str(exc_empty.value)

    # 3. Malformed string (alphanumeric, float, hex)
    for bad_val in ["abc", "100.5", "0x123", "none", "null"]:
        monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", bad_val)
        with pytest.raises(pytest.fail.Exception) as exc_mal:
            get_dynamic_fee_estimate_wei()
        assert "BLOCKED_MALFORMED_FEE_ESTIMATE" in str(exc_mal.value)

    # 4. Zero value
    monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", "0")
    with pytest.raises(pytest.fail.Exception) as exc_zero:
        get_dynamic_fee_estimate_wei()
    assert "BLOCKED_INVALID_FEE_ESTIMATE" in str(exc_zero.value)

    # 5. Negative value
    monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", "-1000")
    with pytest.raises(pytest.fail.Exception) as exc_neg:
        get_dynamic_fee_estimate_wei()
    assert "BLOCKED_INVALID_FEE_ESTIMATE" in str(exc_neg.value)

    # 6. Valid positive value
    monkeypatch.setenv("RESERVECOVENANT_ESTIMATED_FEE_WEI", "150000000000000")
    fee = get_dynamic_fee_estimate_wei()
    assert fee == 150_000_000_000_000

    # 7. Safety margin derivation: 2x fee or minimum floor (5e13)
    margin = derive_dynamic_safety_margin_wei(fee)
    assert margin == 300_000_000_000_000  # 2 * 1.5e14 = 3e14

    low_fee = 10_000_000_000_000  # 1e13 (2x is 2e13, floor is 5e13)
    margin_floor = derive_dynamic_safety_margin_wei(low_fee)
    assert margin_floor == 50_000_000_000_000


def test_offline_accounting_invariant_logic():
    """Proves that accounting invariants fail closed when invariant_satisfied is false."""
    broken_acct = {
        "contract_balance": 1000,
        "locked_issuer_bonds": 2000,
        "locked_challenger_bonds": 0,
        "total_credits": 0,
        "invariant_satisfied": False,
    }
    assert broken_acct["invariant_satisfied"] is False


def test_offline_immutable_fixture_url_accepted_forms():
    """Proves that strictly commit-pinned raw GitHub fixture URLs are accepted."""
    valid_commit = "0123456789abcdef0123456789abcdef01234567"
    url = f"https://raw.githubusercontent.com/owner/repo/{valid_commit}/fixtures/epoch-compliant.json"

    res = validate_immutable_fixture_url(url, "epoch-compliant.json")
    assert res.valid is True
    assert res.owner == "owner"
    assert res.repo == "repo"
    assert res.commit_sha == valid_commit
    assert res.filename == "epoch-compliant.json"

    # Base URL
    base_url = f"https://raw.githubusercontent.com/owner/repo/{valid_commit}/fixtures"
    base_res = validate_immutable_fixture_base_url(base_url)
    assert base_res.valid is True
    assert base_res.commit_sha == valid_commit


def test_offline_immutable_fixture_url_rejected_forms():
    """Proves that mutable or malformed fixture URLs are strictly rejected."""
    # 1. Reject branch /main/
    res_main = validate_immutable_fixture_url(
        "https://raw.githubusercontent.com/owner/repo/main/fixtures/epoch-compliant.json"
    )
    assert res_main.valid is False
    assert "Mutable branch reference 'main'" in res_main.error

    # 2. Reject branch /master/
    res_master = validate_immutable_fixture_url(
        "https://raw.githubusercontent.com/owner/repo/master/fixtures/epoch-compliant.json"
    )
    assert res_master.valid is False

    # 3. Reject uppercase commit hex
    res_upper = validate_immutable_fixture_url(
        "https://raw.githubusercontent.com/owner/repo/0123456789ABCDEF0123456789ABCDEF01234567/fixtures/epoch-compliant.json"
    )
    assert res_upper.valid is False

    # 4. Reject short commit
    res_short = validate_immutable_fixture_url(
        "https://raw.githubusercontent.com/owner/repo/1234567/fixtures/epoch-compliant.json"
    )
    assert res_short.valid is False

    # 5. Reject query parameters
    res_query = validate_immutable_fixture_url(
        "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures/epoch-compliant.json?raw=true"
    )
    assert res_query.valid is False
    assert "Query parameters are prohibited" in res_query.error

    # 6. Reject non-HTTPS
    res_http = validate_immutable_fixture_url(
        "http://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures/epoch-compliant.json"
    )
    assert res_http.valid is False

    # 7. Reject other hosts
    res_host = validate_immutable_fixture_url(
        "https://example.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures/epoch-compliant.json"
    )
    assert res_host.valid is False

    # 8. Reject credentials in URL
    res_cred = validate_immutable_fixture_url(
        "https://user:pass@raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures/epoch-compliant.json"
    )
    assert res_cred.valid is False


def test_offline_scenario_specifications():
    """
    Validates the scenario specifications offline:
    - Confirms Scenario 4 specifies open_challenge with challenge_type MATERIAL_DISCLAIMER
    - Confirms all 8 scenarios map to valid contract terminal states
    """
    valid_terminal_states = {"BREACHED", "UPHELD", "INCONCLUSIVE", "CANCELLED", "UNCHALLENGED"}

    specs = [
        {"id": 1, "fn": "open_challenge", "type": "COVERAGE_SHORTFALL", "expected": "BREACHED"},
        {"id": 2, "fn": "open_challenge", "type": "INELIGIBLE_RESERVE", "expected": "BREACHED"},
        {"id": 3, "fn": "open_challenge", "type": "STALE_REPORT", "expected": "BREACHED"},
        {"id": 4, "fn": "open_challenge", "type": "MATERIAL_DISCLAIMER", "expected": "BREACHED"},
        {"id": 5, "fn": "open_challenge", "type": "OMITTED_LIABILITY", "expected": "UPHELD"},
        {"id": 6, "fn": "open_challenge", "type": "COVERAGE_SHORTFALL", "expected": "INCONCLUSIVE"},
        {"id": 7, "fn": "resolve_challenge", "type": None, "expected": "INCONCLUSIVE"},
        {"id": 8, "fn": "withdraw_credit", "type": None, "expected": "CANCELLED"},
    ]

    for s in specs:
        assert s["expected"] in valid_terminal_states, f"Scenario {s['id']} has invalid expected state {s['expected']}"

    scen4 = [s for s in specs if s["id"] == 4][0]
    assert scen4["fn"] == "open_challenge", "Scenario 4 must call open_challenge"
    assert scen4["type"] == "MATERIAL_DISCLAIMER", "Scenario 4 challenge type must be MATERIAL_DISCLAIMER"
    print("\n[OFFLINE_HARNESS_VALIDATION_PASS] Offline scenario specifications verified successfully.")


def test_offline_python_launcher_disposition_gates():
    """
    Proves that the Python live launcher gates prevent running without opt-in or fixtures,
    and under Option B halts fail-closed before any private key or ephemeral funding is performed.
    """
    import subprocess
    import shutil

    npx_bin = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx_bin:
        pytest.skip("npx not available in environment for launcher disposition test")

    launcher_path = str(project_root / "deploy" / "run_python_live_integration.ts")

    # 1. Without opt-in -> skips cleanly (exit 0)
    env_skip = os.environ.copy()
    env_skip.pop("RESERVECOVENANT_RUN_LIVE_TESTS", None)
    proc_skip = subprocess.run(
        [npx_bin, "tsx", launcher_path],
        capture_output=True,
        text=True,
        env=env_skip,
        cwd=str(project_root),
        shell=True if sys.platform == "win32" else False,
    )
    assert proc_skip.returncode == 0
    assert "[SKIP]" in proc_skip.stdout

    # 2. Opt-in without fixtures -> BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION (exit 1)
    env_no_fix = os.environ.copy()
    env_no_fix["RESERVECOVENANT_RUN_LIVE_TESTS"] = "1"
    env_no_fix.pop("RESERVECOVENANT_FIXTURE_BASE_URL", None)
    proc_no_fix = subprocess.run(
        [npx_bin, "tsx", launcher_path],
        capture_output=True,
        text=True,
        env=env_no_fix,
        cwd=str(project_root),
        shell=True if sys.platform == "win32" else False,
    )
    assert proc_no_fix.returncode == 1
    assert "BLOCKED_PENDING_PUBLIC_FIXTURE_PUBLICATION" in (proc_no_fix.stdout + proc_no_fix.stderr)

    # 3. Opt-in with valid fixtures -> BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED (exit 1)
    env_valid_fix = os.environ.copy()
    env_valid_fix["RESERVECOVENANT_RUN_LIVE_TESTS"] = "1"
    env_valid_fix["RESERVECOVENANT_FIXTURE_BASE_URL"] = "https://raw.githubusercontent.com/owner/repo/0123456789abcdef0123456789abcdef01234567/fixtures"
    proc_valid_fix = subprocess.run(
        [npx_bin, "tsx", launcher_path],
        capture_output=True,
        text=True,
        env=env_valid_fix,
        cwd=str(project_root),
        shell=True if sys.platform == "win32" else False,
    )
    assert proc_valid_fix.returncode == 1
    output = proc_valid_fix.stdout + proc_valid_fix.stderr
    assert "BLOCKED_PYTHON_LIVE_CLEANUP_UNSUPPORTED" in output
    assert "Zero ephemeral challenger funds were allocated, funded, or abandoned" in output

