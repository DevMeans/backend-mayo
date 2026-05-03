import { Router } from "express";

export class AuthRouter {
    static get router():Router{
        const router = Router();
        router.post('/login', (req, res) => {
            const { username, password } = req.body;
            if (username === 'admin' && password === 'password') {
                res.json({ token: 'fake-jwt-token' });
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }   
        });
        return router;
    }
}