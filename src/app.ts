import { AppRouter } from "./presentation/routes";
import { Server } from "./presentation/server";


(async () => {

    main();
})();

async function main() {
    console.log('Hello world');

    const server = new Server({
        port: 3000,
        routes: AppRouter.router
    });
    await server.start();

}