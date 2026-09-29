import { Module, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntentsService } from "./intents.service";
import { IntentsController } from "./intents.controller";
import { IntentsGateway } from "./intents.gateway";
import { IntentsSweeperService } from "./intents-sweeper.service";
import { IntentsMaintenanceJobs } from "./intents-maintenance.jobs";
import { INTENTS_REPOSITORY, InMemoryIntentsRepository } from "./intents.repository";
import { PrismaIntentsRepository } from "./prisma-intents.repository";
import { IntentCapabilityIndex } from "./solver-intent-matcher";
import { backplaneProvider } from "./backplane/backplane.factory";
import { backplaneHealthIndicator } from "./backplane/backplane-health.provider";
import { SolversModule } from "../solvers/solvers.module";
import { RoutingModule } from "../routing/routing.module";
import { TokensModule } from "../tokens/tokens.module";
import { SorobanModule } from "../soroban/soroban.module";
import { AppConfig } from "../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import { GovernanceModule } from "../governance/governance.module";
import { TokenListPublisher } from "../tokens/admin-tokens.service";

/** Side-effect provider: points token-list events at the WebSocket gateway. */
export const TOKEN_LIST_WS_BINDING = Symbol("TOKEN_LIST_WS_BINDING");

@Module({
  // Both SolversModule and SorobanModule import IntentsModule back, so both
  // edges of each cycle must be deferred — a bare import resolves to `undefined`
  // when the peer module is still mid-initialization (AppModule reaches
  // SorobanModule through HealthModule before IntentsModule has finished).
  imports: [
    forwardRef(() => SolversModule),
    RoutingModule,
    TokensModule,
    forwardRef(() => SorobanModule),
    GovernanceModule,
  ],
  controllers: [IntentsController],
  providers: [
    // Select the persistence adapter based on INTENTS_PERSISTENCE env var.
    // INTENTS_PERSISTENCE=prisma  → PrismaIntentsRepository (production/staging)
    // INTENTS_PERSISTENCE=memory  → InMemoryIntentsRepository (default, dev/test)
    {
      provide: INTENTS_REPOSITORY,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService<AppConfig, true>, prisma: PrismaService) => {
        const adapter = process.env.INTENTS_PERSISTENCE ?? "memory";
        if (adapter === "prisma") {
          return new PrismaIntentsRepository(prisma);
        }
        return new InMemoryIntentsRepository();
      },
    },
    IntentsService,
    IntentCapabilityIndex,
    backplaneProvider,
    IntentsGateway,
    backplaneHealthIndicator,
    IntentsSweeperService,
    IntentsMaintenanceJobs,
    {
      provide: TOKEN_LIST_WS_BINDING,
      inject: [TokenListPublisher, IntentsGateway],
      useFactory: (publisher: TokenListPublisher, gateway: IntentsGateway) => {
        publisher.publish = (event) =>
          gateway.broadcast(event as unknown as { type: string; [key: string]: unknown });
        return publisher;
      },
    },
  ],
  exports: [IntentsService, IntentsGateway, IntentCapabilityIndex],
})
export class IntentsModule {}
