import { AppRouter } from "./presentation/routes";
import { Server } from "./presentation/server";
import { ensureRbacSchema } from "./data/rbac-bootstrap";
import { ensurePaymentMethodSchema } from "./data/payment-method-bootstrap";
import { ensureSystemConfigSchema } from "./data/system-config-bootstrap";
import { ensureMarketplaceAuthSchema } from "./data/marketplace-auth-bootstrap";


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

    const server = new Server({
        port: 3000,
        routes: AppRouter.router
    });
    await server.start();

}
