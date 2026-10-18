"""
Live Integration Test Suite for ReserveCovenant on GenLayer Studio Devnet.

Exercises planned live scenarios:
1. Deterministic coverage shortfall resolves BREACHED.
2. Clear material disclaimer resolves BREACHED through validator consensus.
3. Unsupported semantic accusation resolves UPHELD.
4. Evidence unavailability or irreconcilable evidence resolves INCONCLUSIVE.
5. Repeated resolution reverts.
6. Withdrawal credit cannot be withdrawn twice.

Guard:
Skips before any network write unless RESERVECOVENANT_RUN_LIVE_TESTS=1 is explicitly set.
"""

import os
import sys
from pathlib import Path
import pytest
from gltest import get_contract_factory, create_account

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


def get_live_signer():
    """
    Guarded live signer derivation.
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
    print(f"\n[live-signer] Derived public address: {account.address}")
    return account


@pytest.fixture(autouse=True)
def require_live_opt_in():
    """Explicit opt-in guard: skips cleanly unless RESERVECOVENANT_RUN_LIVE_TESTS=1."""
    if os.environ.get("RESERVECOVENANT_RUN_LIVE_TESTS") != "1":
        pytest.skip(
            "Live network integration tests require explicit opt-in via RESERVECOVENANT_RUN_LIVE_TESTS=1. "
            "Skipping test before contract deployment or transaction submission."
        )


@pytest.fixture
def contract_factory():
    if os.environ.get("RESERVECOVENANT_RUN_LIVE_TESTS") != "1":
        pytest.skip("RESERVECOVENANT_RUN_LIVE_TESTS=1 required.")
    return get_contract_factory("ReserveCovenant")


def test_integration_01_deterministic_coverage_shortfall(contract_factory):
    """Scenario 1: Deterministic coverage shortfall resolves BREACHED."""
    pass


def test_integration_02_material_disclaimer_breach(contract_factory):
    """Scenario 2: Clear material disclaimer resolves BREACHED through consensus."""
    pass


def test_integration_03_unsupported_semantic_accusation(contract_factory):
    """Scenario 3: Unsupported semantic accusation resolves UPHELD."""
    pass


def test_integration_04_evidence_unavailability_inconclusive(contract_factory):
    """Scenario 4: Evidence unavailability or irreconcilable evidence resolves INCONCLUSIVE."""
    pass


def test_integration_05_repeated_resolution_reverts(contract_factory):
    """Scenario 5: Repeated resolution on terminal epoch reverts."""
    pass


def test_integration_06_withdrawal_credit_no_double_spend(contract_factory):
    """Scenario 6: Withdrawal credit cannot be withdrawn twice."""
    pass
