/**
 * ReserveCovenant Autonomous Signer Resolver.
 *
 * Implements autonomous signer discovery matching the proven GenLayer keychain pattern:
 * - Service: genlayer-cli
 * - Account entry: account:coverlock-submitter
 * - Dynamically resolves keytar from the GenLayer CLI installation.
 * - Supports environment-variable fallback only as an optional secondary mechanism.
 * - Never prints, persists, hashes, serializes, or includes the private key in an error or log.
 * - Derives and displays only the public deployer address.
 * - Verifies the address balance on Studio Devnet.
 * - Fails closed if the keychain account cannot be resolved.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, createAccount } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";

export interface SignerOptions {
  accountName?: string;
  checkBalance?: boolean;
  minBalanceWei?: bigint;
  silent?: boolean;
}

export interface ResolvedSigner {
  accountName: string;
  account: ReturnType<typeof createAccount>;
  address: string;
  privateKey: string;
  balance?: bigint;
  balanceGen?: number;
}

/**
 * Dynamically locate and import keytar from local or global GenLayer CLI installation.
 */
export async function resolveKeytar(): Promise<any> {
  const candidatePaths = [
    "keytar",
    process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.USERPROFILE
      ? path.join(
          process.env.USERPROFILE,
          "AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
    process.env.HOME
      ? path.join(
          process.env.HOME,
          ".config/genlayer/node_modules/keytar/lib/keytar.js"
        )
      : null,
  ].filter(Boolean) as string[];

  for (const cand of candidatePaths) {
    try {
      if (cand !== "keytar" && !fs.existsSync(cand)) continue;
      const mod = await import(
        cand === "keytar" ? "keytar" : pathToFileURL(cand).href
      );
      const keytar = mod.default ?? mod;
      if (keytar && typeof keytar.getPassword === "function") {
        return keytar;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return null;
}

/**
 * Resolve deployer account from GenLayer CLI OS-keychain or optional environment variable.
 */
export async function resolveSigner(
  options?: SignerOptions
): Promise<ResolvedSigner> {
  const accountName = options?.accountName ?? "coverlock-submitter";
  let rawKey: string | null = null;

  // 1. Try OS keychain first
  const keytar = await resolveKeytar();
  if (keytar) {
    try {
      rawKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
    } catch {
      // OS keychain read failure - proceed to fallback
    }
  }

  // 2. Secondary fallback to environment variables
  if (!rawKey || !rawKey.trim()) {
    rawKey =
      process.env.DEPLOYER_PRIVATE_KEY ||
      process.env.GENLAYER_PRIVATE_KEY ||
      process.env.PRIVATE_KEY ||
      null;
  }

  // 3. Fail closed if not resolved
  if (!rawKey || !rawKey.trim()) {
    throw new Error(
      `Deployer account '${accountName}' could not be resolved from OS keychain (genlayer-cli) or environment.`
    );
  }

  // 4. Sanitize format
  let keyClean = rawKey.trim();
  if (!keyClean.startsWith("0x") && !keyClean.startsWith("0X")) {
    keyClean = `0x${keyClean}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyClean)) {
    throw new Error(
      `Invalid private key format for account '${accountName}': expected 64 hex characters.`
    );
  }

  // 5. Derive public account
  const account = createAccount(keyClean as `0x${string}`);
  if (!options?.silent) {
    console.log(`[signer] Deployer account: ${accountName} (${account.address})`);
  }

  // 6. Balance verification against Studio Devnet
  let balance: bigint | undefined;
  let balanceGen: number | undefined;
  if (options?.checkBalance !== false) {
    const client = createClient({ chain: studioDevnet });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        balance = await client.getBalance({ address: account.address });
        break;
      } catch (err: any) {
        if (attempt === 3) {
          throw new Error(
            `Failed to retrieve balance for ${account.address} from Studio Devnet: ${err.message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (balance !== undefined) {
      balanceGen = Number(balance) / 1e18;
      if (!options?.silent) {
        console.log(
          `[signer] Deployer balance: ${balance.toString()} wei (~${balanceGen} GEN)`
        );
      }
      const minWei = options?.minBalanceWei ?? 0n;
      if (balance < minWei) {
        throw new Error(
          `Deployer balance (${balance.toString()} wei) is below required minimum (${minWei.toString()} wei).`
        );
      }
    }
  }

  return {
    accountName,
    account,
    address: account.address,
    privateKey: keyClean,
    balance,
    balanceGen,
  };
}

/**
 * Resolves or creates a persistent challenger account stored securely in the Windows OS keychain:
 * - Service: genlayer-cli
 * - Account: account:reservecovenant-challenger
 *
 * If the account does not exist in the OS keychain:
 * - Generates its private key in memory;
 * - Stores it directly in the OS keychain;
 * - Never prints, logs, serializes, or exposes the key;
 * - Exposes only its public address.
 *
 * Enforces signer separation (challenger !== issuer).
 */
export interface KeychainAdapter {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
}

export interface ChallengerSignerOptions extends SignerOptions {
  keychainAdapter?: KeychainAdapter;
}

const memoryKeychain = new Map<string, string>();
export const inMemoryKeychainAdapter: KeychainAdapter = {
  async getPassword(service: string, account: string): Promise<string | null> {
    return memoryKeychain.get(`${service}:${account}`) ?? null;
  },
  async setPassword(service: string, account: string, password: string): Promise<void> {
    memoryKeychain.set(`${service}:${account}`, password);
  },
};

export async function resolvePersistentChallengerSigner(
  issuerAddress: string,
  options?: ChallengerSignerOptions
): Promise<ResolvedSigner> {
  const accountName = options?.accountName ?? "reservecovenant-challenger";
  let rawKey: string | null = null;

  let keytar: KeychainAdapter | null = options?.keychainAdapter ?? (await resolveKeytar());
  if (!keytar) {
    if (process.env.CI === "true" || process.env.NODE_ENV === "test") {
      keytar = inMemoryKeychainAdapter;
    } else {
      throw new Error(
        "OS keychain (keytar) is unavailable; persistent challenger requires OS keychain access."
      );
    }
  }

  try {
    rawKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
  } catch (err: any) {
    throw new Error(
      `Failed to read challenger account '${accountName}' from OS keychain: ${err.message}`
    );
  }

  // If not found in keychain, generate in memory and persist immediately to OS keychain
  if (!rawKey || !rawKey.trim()) {
    const generated = generatePrivateKey();
    try {
      await keytar.setPassword("genlayer-cli", `account:${accountName}`, generated);
      rawKey = generated;
      if (!options?.silent) {
        console.log(
          `[signer] Generated new persistent challenger key in OS keychain (genlayer-cli / account:${accountName})`
        );
      }
    } catch (err: any) {
      throw new Error(
        `Failed to store new challenger key into OS keychain: ${err.message}`
      );
    }
  }

  let keyClean = rawKey.trim();
  if (!keyClean.startsWith("0x") && !keyClean.startsWith("0X")) {
    keyClean = `0x${keyClean}`;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyClean)) {
    throw new Error(
      `Invalid private key format for challenger account '${accountName}': expected 64 hex characters.`
    );
  }

  const account = createAccount(keyClean as `0x${string}`);

  // Assert signer separation
  if (account.address.toLowerCase() === issuerAddress.toLowerCase()) {
    throw new Error(
      `Signer separation violated: persistent challenger address (${account.address}) matches issuer address.`
    );
  }

  if (!options?.silent) {
    console.log(`[signer] Persistent challenger account: ${accountName} (${account.address})`);
  }

  // Balance verification
  let balance: bigint | undefined;
  let balanceGen: number | undefined;
  if (options?.checkBalance !== false) {
    const client = createClient({ chain: studioDevnet });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        balance = await client.getBalance({ address: account.address });
        break;
      } catch (err: any) {
        if (attempt === 3) {
          throw new Error(
            `Failed to retrieve balance for challenger ${account.address} from Studio Devnet: ${err.message}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (balance !== undefined) {
      balanceGen = Number(balance) / 1e18;
      if (!options?.silent) {
        console.log(
          `[signer] Challenger balance: ${balance.toString()} wei (~${balanceGen} GEN)`
        );
      }
      const minWei = options?.minBalanceWei ?? 0n;
      if (balance < minWei) {
        throw new Error(
          `Challenger balance (${balance.toString()} wei) is below required minimum (${minWei.toString()} wei).`
        );
      }
    }
  }

  return {
    accountName,
    account,
    address: account.address,
    privateKey: keyClean,
    balance,
    balanceGen,
  };
}
