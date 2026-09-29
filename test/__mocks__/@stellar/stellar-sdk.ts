/**
 * Hermetic test double for `@stellar/stellar-sdk`.
 *
 * The e2e suite must not talk to a real Soroban RPC node, but it *does* need
 * the genuine SDK for everything that is pure computation: Ed25519 keypairs
 * and signature verification (`Keypair`, `verifyStellarSignature`), Stellar
 * strkey encode/decode (`StrKey`, `Address`), XDR marshalling (`xdr`,
 * `nativeToScVal`, `scValToNative`) and transaction assembly
 * (`TransactionBuilder`, `Contract`). Re-implementing those by hand would let
 * tests pass against a fake crypto path that production never uses.
 *
 * So this mock re-exports the real module and replaces *only* the network
 * layer — `SorobanRpc.Server` — with an in-memory stub.
 *
 * Resolution note: jest maps the bare specifier `@stellar/stellar-sdk` to this
 * file, so requiring the bare specifier here would recurse forever. The real
 * module is therefore loaded by filesystem path, which the
 * `moduleNameMapper` regex (`^@stellar/stellar-sdk$`, anchored) does not match.
 * A `require`-based load also sidesteps the package's `exports` gate, which
 * only permits `.`, `./contract`, and `./rpc`.
 */

import * as path from "node:path";

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const actual: any = require(
  path.resolve(__dirname, "../../../node_modules/@stellar/stellar-sdk/lib/index.js"),
);
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

const mockServer = {
  getHealth: jest.fn().mockResolvedValue({ status: "ok" }),
  getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1 }),
  getNetwork: jest.fn().mockResolvedValue({ passphrase: "test" }),
  getAccount: jest.fn().mockResolvedValue({ id: "test", sequenceNumber: () => "0" }),
  getEvents: jest.fn().mockResolvedValue({ events: [], latestLedger: 1 }),
  getFeeStats: jest.fn().mockResolvedValue({
    sorobanInclusionFee: {
      min: "100",
      mode: "100",
      p10: "100",
      p20: "100",
      p30: "100",
      p40: "100",
      p50: "100",
      p60: "100",
      p70: "100",
      p80: "100",
      p90: "100",
      p95: "100",
      p99: "100",
      max: "100",
    },
  }),
  simulateTransaction: jest.fn().mockResolvedValue({ minResourceFee: "100" }),
  prepareTransaction: jest.fn().mockImplementation((tx: unknown) => tx),
  sendTransaction: jest.fn().mockResolvedValue({ status: "SUCCESS", hash: "mock-hash" }),
};

const mockServerClass = jest.fn().mockImplementation(() => mockServer);

function isSimulationError(response: unknown): boolean {
  return Boolean(
    response &&
      typeof response === "object" &&
      "error" in (response as Record<string, unknown>) &&
      (response as Record<string, unknown>).error != null,
  );
}

const stubbedRpc = {
  ...actual.SorobanRpc,
  Server: mockServerClass,
  Api: {
    ...actual.SorobanRpc?.Api,
    isSimulationError,
  },
};

module.exports = {
  ...actual,
  SorobanRpc: stubbedRpc,
  rpc: {
    ...actual.rpc,
    Server: mockServerClass,
  },
};
