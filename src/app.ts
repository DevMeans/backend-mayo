import { AppRouter } from "./presentation/routes";
import { Server } from "./presentation/server";
import { ensureRbacSchema } from "./data/rbac-bootstrap";
import { ensurePaymentMethodSchema } from "./data/payment-method-bootstrap";
import { ensureSystemConfigSchema } from "./data/system-config-bootstrap";
import { ensureMarketplaceAuthSchema } from "./data/marketplace-auth-bootstrap";
import { ensureAuditLogSchema } from "./data/audit-log-bootstrap";
import { ensureUserActivitySchema } from "./data/user-activity-bootstrap";
import { ensurePickingResponsibilitySchema } from "./data/picking-responsibility-bootstrap";


(async () => {

    main();
})();

async function main() {
    console.log('Hello world');

    try {
        await ensureRbacSchema();
        console.log('RBAC schema validated');
    } catch (error) {
        console.error('RBAC bootstrap warning:', error);
    }

    try {
        await ensurePaymentMethodSchema();
        console.log('Payment method schema validated');
    } catch (error) {
        console.error('Payment method bootstrap warning:', error);
    }

    try {
        await ensureSystemConfigSchema();
        console.log('System config schema validated');
    } catch (error) {
        console.error('System config bootstrap warning:', error);
    }

    try {
        await ensureMarketplaceAuthSchema();
        console.log('Marketplace auth schema validated');
    } catch (error) {
        console.error('Marketplace auth bootstrap warning:', error);
    }

    try {
        await ensureAuditLogSchema();
        console.log('Audit log schema validated');
    } catch (error) {
        console.error('Audit log bootstrap warning:', error);
    }

    try {
        await ensureUserActivitySchema();
        console.log('User activity schema validated');
    } catch (error) {
        console.error('User activity bootstrap warning:', error);
    }

    try {
        await ensurePickingResponsibilitySchema();
        console.log('Picking responsibility schema validated');
    } catch (error) {
        console.error('Picking responsibility bootstrap warning:', error);
    }

    const server = new Server({
        port: 3000,
        routes: AppRouter.router
    });
    await server.start();

}
