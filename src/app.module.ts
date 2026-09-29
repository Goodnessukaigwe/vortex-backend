import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { TokensModule } from "./tokens/tokens.module";
import { IntentsModule } from "./intents/intents.module";
import { MetricsModule } from "./metrics/metrics.module";
import { SolversModule } from "./solvers/solvers.module";
import { StatsModule } from "./stats/stats.module";
import { SorobanModule } from "./soroban/soroban.module";
import { RoutingModule } from "./routing/routing.module";
import { KillSwitchModule } from "./killswitch/killswitch.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TreasuryModule } from "./treasury/treasury.module";
import { GovernanceModule } from "./governance/governance.module";
import { LeaderElectionModule } from "./common/leader-election";
import { AdminModule } from "./admin/admin.module";
import { JobsModule } from "./jobs/jobs.module";
import { FlagsModule } from "./flags/flags.module";
import { GuardianStateModule } from "./governance/guardian-state.service";
import { PricingModule } from "./pricing/pricing.module";

@Module({
  imports: [
    // Issue #44 — global rate limit: 100 requests per 60 s per IP
    ThrottlerModule.forRoot([
      {
        name: "global",
        ttl: 60_000, // ms
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    // @Global() — registers MetricsService / MetricsInterceptor / MetricsController
    // for the whole app. Must be imported here or the global providers never
    // become visible to other modules (e.g. IntentsSweeperService).
    MetricsModule,
    KillSwitchModule,
    LeaderElectionModule.forRoot(),
    AdminModule,
    JobsModule,
    FlagsModule,
    GuardianStateModule,
    HealthModule,
    TokensModule,
    PricingModule,
    IntentsModule,
    SolversModule,
    StatsModule,
    SorobanModule,
    RoutingModule,
    TreasuryModule,
    GovernanceModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
