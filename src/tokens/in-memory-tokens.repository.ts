import { SupportedChain } from "../intents/intents.types";
import { STELLAR_TOKENS, SUPPORTED_TOKENS } from "./tokens.data";
import { ITokensRepository, TokenAssetKind, TokenRecord, TokenStatus } from "./tokens.repository";

export class InMemoryTokensRepository implements ITokensRepository {
  private generation = 0;
  private readonly records: TokenRecord[] = [
    ...Object.entries(SUPPORTED_TOKENS).flatMap(([chain, tokens]) =>
      tokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        chain: chain as SupportedChain,
        priceUsd: token.priceUSD,
        isStellar: false,
        status: "active" as TokenStatus,
        assetKind: "evm" as TokenAssetKind,
      })),
    ),
    ...STELLAR_TOKENS.map((token) => ({
      address: token.contract,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      chain: "stellar" as const,
      priceUsd: token.priceUSD,
      isStellar: true,
      status: "active" as TokenStatus,
      assetKind: "stellar-sac" as TokenAssetKind,
    })),
  ];

  findAll(): TokenRecord[] {
    return this.records.map((record) => ({ ...record }));
  }

  findByChain(chain: SupportedChain | string): TokenRecord[] {
    const normalized = String(chain).toLowerCase();
    return this.records
      .filter((record) => record.chain === normalized || record.chain === chain)
      .map((record) => ({ ...record }));
  }

  findByAddressAndChain(address: string, chain: SupportedChain | string): TokenRecord | undefined {
    const match = this.findIndex(address, chain);
    return match >= 0 ? { ...this.records[match] } : undefined;
  }

  async save(record: TokenRecord): Promise<TokenRecord> {
    const stored: TokenRecord = { ...record, status: record.status ?? "active" };
    const index = this.findIndex(stored.address, stored.chain);
    if (index >= 0) this.records[index] = stored;
    else this.records.push(stored);
    this.generation += 1;
    return { ...stored };
  }

  async setStatus(
    address: string,
    chain: SupportedChain | string,
    status: TokenStatus,
  ): Promise<TokenRecord | undefined> {
    const index = this.findIndex(address, chain);
    if (index < 0) return undefined;
    this.records[index] = { ...this.records[index], status };
    this.generation += 1;
    return { ...this.records[index] };
  }

  cacheGeneration(): number {
    return this.generation;
  }

  private findIndex(address: string, chain: SupportedChain | string): number {
    const normalizedAddress = address.trim().toLowerCase();
    const chainName = String(chain).toLowerCase();
    return this.records.findIndex(
      (record) => record.address.toLowerCase() === normalizedAddress && record.chain === chainName,
    );
  }
}
