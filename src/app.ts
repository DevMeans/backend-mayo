import { AppRouter } from "./presentation/routes";
import { Server } from "./presentation/server";
import { ensureRbacSchema } from "./data/rbac-bootstrap";
import { ensurePaymentMethodSchema } from "./data/payment-method-bootstrap";
import { ensureSystemConfigSchema } from "./data/system-config-bootstrap";
import { ensureMarketplaceAuthSchema } from "./data/marketplace-auth-bootstrap";
import { ensureAuditLogSchema } from "./data/audit-log-bootstrap";
import { ensureUserActivitySchema } from "./data/user-activity-bootstrap";
import { ensurePickingResponsibilitySchema } from "./data/picking-responsibility-bootstrap";
import { prisma } from "./data/prisma";
import { envs } from "./config/envs";

const RAILWAY_INTERNAL_HOST_SUFFIX = '.railway.internal';
const BOOTSTRAP_STEPS: Array<{ name: string; run: () => Promise<void> }> = [
    { name: 'RBAC', run: ensureRbacSchema },
    { name: 'Payment method', run: ensurePaymentMethodSchema },
    { name: 'System config', run: ensureSystemConfigSchema },
    { name: 'Marketplace auth', run: ensureMarketplaceAuthSchema },
    { name: 'Audit log', run: ensureAuditLogSchema },
    { name: 'User activity', run: ensureUserActivitySchema },
    { name: 'Picking responsibility', run: ensurePickingResponsibilitySchema },
];

(async () => {
    await main();
})();

function getDatabaseHost(connectionString: string): string | null {
    try {
        return new URL(connectionString).hostname;
    } catch {
        return null;
    }
}

function isRailwayInternalHost(hostname: string | null): boolean {
    return Boolean(hostname?.endsWith(RAILWAY_INTERNAL_HOST_SUFFIX));
}

function isRunningOnRailway(): boolean {
    return Boolean(process.env.RAILWAY_PROJECT_ID);
}

async function ensureDatabaseReachability(): Promise<boolean> {
    try {
        await prisma.$queryRawUnsafe('SELECT 1');
        return true;
    } catch (error) {
        const databaseHost = getDatabaseHost(envs.DATABASE_URL);

        console.error('Database bootstrap warning: unable to connect to PostgreSQL. Schema bootstrap steps were skipped.');
        if (databaseHost) {
            console.error(`Configured database host: ${databaseHost}`);
        }

        if (isRailwayInternalHost(databaseHost) && !isRunningOnRailway()) {
            console.error('Detected Railway private hostname outside Railway runtime. Use DATABASE_PUBLIC_URL for external access.');
        }

        console.error(error);
        return false;
    }
}

async function runSchemaBootstraps(): Promise<void> {
    for (const step of BOOTSTRAP_STEPS) {
        try {
            await step.run();
            console.log(`${step.name} schema validated`);
        } catch (error) {
            console.error(`${step.name} bootstrap warning:`, error);
        }
    }
}

async function main() {
    console.log('Hello world');

    const databaseReachable = await ensureDatabaseReachability();
    if (databaseReachable) {
        await runSchemaBootstraps();
    }

    const server = new Server({
        port: envs.PORT,
        routes: AppRouter.router
    });
    await server.start();

}
