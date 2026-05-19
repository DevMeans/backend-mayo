import { AppRouter } from "./presentation/routes";
import { Server } from "./presentation/server";
import { ensureRbacSchema } from "./data/rbac-bootstrap";


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

    const server = new Server({
        port: 3000,
        routes: AppRouter.router
    });
    await server.start();

}
