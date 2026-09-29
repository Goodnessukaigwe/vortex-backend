import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { SUPPORTED_TOKENS, StellarToken } from "./tokens.data";
import { SupportedChain } from "../intents/intents.types";
import { ITokensRepository, TOKENS_REPOSITORY, TokenRecord } from "./tokens.repository";

/**
 * A resolved source-chain (EVM or Stellar source) token — always has a
 * canonical `address` field used by TokensService.resolveToken().
 */
export interface ResolvedSrcToken {
  kind: "src";
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chain: SupportedChain;
  priceUSD: number;
}

/**
 * A resolved Stellar destination token.
 */
export interface ResolvedDstToken {
  kind: "dst";
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD: number;
}

export type ResolvedToken = ResolvedSrcToken | ResolvedDstToken;

export interface ApiToken {
  address: string;
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD: number;
}

export interface TokensByChainResponse {
  tokens: ApiToken[] | Record<string, ApiToken[]>;
  chain?: string;
  stellarTokens?: ApiToken[];
}

@Injectable()
export class TokensService {
  constructor(
    @Inject(TOKENS_REPOSITORY)
    private readonly repo: ITokensRepository,
  ) {}

  /**
   * Look up a source token by chain + address/contract, including paused and
   * delisted rows. Existing intents keep resolving after a soft delist.
   */
  async resolveSrcToken(chain: SupportedChain, address: string): Promise<ResolvedSrcToken | undefined> {
    const token = await Promise.resolve(this.repo.findByAddressAndChain(address, chain));
    if (!token) return undefined;
    return {
      kind: "src",
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chain,
      priceUSD: token.priceUsd ?? 0,
    };
  }

  /** Look up a Stellar destination token by contract ID, including delisted rows. */
  async resolveDstToken(contract: string): Promise<ResolvedDstToken | undefined> {
    const token = await Promise.resolve(this.repo.findByAddressAndChain(contract, "stellar"));
    if (!token) return undefined;
    return {
      kind: "dst",
      contract: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      priceUSD: token.priceUsd ?? 0,
    };
  }

  /**
   * Like {@link resolveSrcToken} but rejects unknown, paused, and delisted
   * tokens. Used on the create path. Reads of an already-stored intent do not
   * come through here.
   */
  async resolveSrcTokenOrThrow(chain: SupportedChain, address: string): Promise<ResolvedSrcToken> {
    const stored = this.repo.findByAddressAndChain(address, chain);
    this.assertOfferable(stored, address, chain);
    const token = await this.resolveSrcToken(chain, address);
    if (!token) {
      throw new BadRequestException(
        `Unknown source token '${address}' for chain '${chain}' in the configured token registry`,
      );
    }
    return token;
  }

  /** Like {@link resolveDstToken} but rejects unknown, paused, and delisted tokens. */
  async resolveDstTokenOrThrow(contract: string): Promise<ResolvedDstToken> {
    const stored = this.repo.findByAddressAndChain(contract, "stellar");
    this.assertOfferable(stored, contract, "stellar");
    const token = await this.resolveDstToken(contract);
    if (!token) {
      throw new BadRequestException("Unknown destination token contract for the configured token registry");
    }
    return token;
  }

  /**
   * Normalise a stored {@link TokenRecord} into the public token shape.
   * Delisted rows are omitted by {@link getByChain}; this helper does not filter.
   */
  private toApiToken(record: TokenRecord): ApiToken {
    return {
      address: record.address,
      contract: record.address,
      symbol: record.symbol,
      name: record.name,
      decimals: record.decimals,
      priceUSD: record.priceUsd ?? 0,
    };
  }

  /**
   * Return the supported token registry, optionally narrowed to one chain.
   * Delisted tokens are hidden. Paused tokens stay visible.
   */
  async getByChain(chain?: string): Promise<TokensByChainResponse> {
    const requested = chain?.toLowerCase();

    if (requested === "stellar") {
      const records = this.listed(await Promise.resolve(this.repo.findByChain("stellar")));
      return { tokens: records.map((record) => this.toApiToken(record)), chain: "stellar" };
    }

    if (requested && requested in SUPPORTED_TOKENS) {
      const records = this.listed(await Promise.resolve(this.repo.findByChain(requested)));
      return {
        tokens: records.filter((record) => record.chain === requested).map((record) => this.toApiToken(record)),
        chain: requested,
      };
    }

    const all = this.listed(await Promise.resolve(this.repo.findAll()));
    const byChain: Record<string, ApiToken[]> = {};
    for (const key of Object.keys(SUPPORTED_TOKENS)) byChain[key] = [];
    for (const record of all) {
      if (!byChain[record.chain]) byChain[record.chain] = [];
      byChain[record.chain].push(this.toApiToken(record));
    }

    return {
      tokens: byChain,
      stellarTokens: all.filter((record) => record.chain === "stellar").map((record) => this.toApiToken(record)),
    };
  }

  async getStellarTokens(): Promise<{ tokens: StellarToken[] }> {
    const records = this.listed(await Promise.resolve(this.repo.findByChain("stellar")));
    return {
      tokens: records.map((record) => ({
        contract: record.address,
        symbol: record.symbol,
        name: record.name,
        decimals: record.decimals,
        priceUSD: record.priceUsd ?? 0,
      })),
    };
  }

  private listed(records: TokenRecord[]): TokenRecord[] {
    return records.filter((record) => (record.status ?? "active") !== "delisted");
  }

  private assertOfferable(record: TokenRecord | undefined, address: string, chain: string): void {
    const status = record?.status ?? "active";
    if (record && status !== "active") {
      throw new BadRequestException(`Token '${address}' on '${chain}' is ${status} and cannot be used for a new intent`);
    }
  }
}
