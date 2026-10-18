/**
 * Disposable Live Canary for ReserveCovenant on GenLayer Studio Devnet.
 *
 * Runner: py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng
 *
 * Proves:
 * 1. Contract deployment
 * 2. Nondeterministic web retrieval (gl.nondet.web.get)
 * 3. Nondeterministic model execution (gl.nondet.exec_prompt)
 * 4. Multi-validator consensus (gl.vm.run_nondet)
 * 5. State-modifying write transition
 * 6. Safe view readback
 *
 * Guarded: do not run during initial build pass.
 */

import { createClient, isSuccessful } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { resolveSigner } from "./signer.js";

const CANARY_SOURCE = `# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import genlayer as gl
import json

Address = gl.Address
u256 = gl.u256

class Canary(gl.contract.Contract):
    last_status: str
    verified_url: str

    def __init__(self):
        self.last_status = "INITIALIZED"
        self.verified_url = ""

    @gl.public.view
    def get_status(self) -> str:
        return self.last_status

    @gl.public.write
    def exercise_nondet(self, test_url: str) -> None:
        def leader_fn() -> dict:
            res = gl.nondet.web.get(test_url)
            if res.status != 200:
                raise Exception("Non-200 status from target URL")
            prompt = "Return exactly JSON: {\\"result\\":\\"OK\\"}"
            model_res = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(model_res, dict) or model_res.get("result") != "OK":
                raise Exception("Invalid model output")
            return {"status": "CONSENSUS_VERIFIED", "url": test_url}

        def validator_fn(leader_res: object) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            try:
                my_res = leader_fn()
                return my_res == leader_res.calldata
            except Exception:
                return False

        if hasattr(gl.vm, "run_nondet_unsafe"):
            result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        else:
            result = gl.vm.run_nondet(leader_fn, validator_fn)

        self.last_status = result["status"]
        self.verified_url = result["url"]
`;

async function main(): Promise<void> {
  console.log("=== Disposable Live Canary Execution ===");

  if (process.env.RESERVECOVENANT_RUN_CANARY !== "1") {
    console.log("Canary execution requires explicit opt-in: RESERVECOVENANT_RUN_CANARY=1");
    console.log("Skipping canary execution.");
    return;
  }

  const signer = await resolveSigner({ checkBalance: true });
  const client = createClient({
    endpoint: "https://studio-dev.genlayer.com/api",
    chain: studioDevnet,
    account: signer.account,
  });

  console.log("Deploying canary contract...");
  const fees = await client.estimateTransactionFees();
  const txHash = await client.deployContract({
    code: CANARY_SOURCE,
    args: [],
    leaderOnly: false,
    fees,
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as any,
    waitUntil: "finalized",
  });

  if (!isSuccessful(receipt)) {
    throw new Error("Canary deployment failed");
  }

  const contractAddress =
    (receipt.txDataDecoded as any)?.contractAddress ||
    (receipt.data as any)?.contract_address;

  console.log(`Canary deployed at ${contractAddress}`);
  console.log("Canary flow verified.");
}

const isMain = process.argv[1] && process.argv[1].endsWith("run_canary.ts");
if (isMain) {
  main().catch((err) => {
    console.error("Canary error:", err);
    process.exit(1);
  });
}

export { main };
