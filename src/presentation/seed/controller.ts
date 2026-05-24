import { Request, Response } from 'express';
import { TriggerSeedDto } from '../../domain/dtos/trigger-seed.dto';
import { runSeed } from '../../data/seed';

const DEFAULT_SEED_TRIGGER_KEY = 'amira123!';

export class SeedController {
    static async run(req: Request, res: Response) {
        const [error, dto] = TriggerSeedDto.create(req.body as { [key: string]: unknown });
        if (error) {
            return res.status(400).json({ message: error });
        }

        const expectedKey = process.env.SEED_TRIGGER_KEY || DEFAULT_SEED_TRIGGER_KEY;
        if (dto!.key !== expectedKey) {
            return res.status(401).json({ message: 'Clave invalida para ejecutar seed' });
        }

        try {
            const summary = await runSeed();
            return res.status(200).json({
                success: true,
                message: 'Seed ejecutado correctamente',
                data: summary,
            });
        } catch (err) {
            console.error('Seed endpoint error:', err);
            return res.status(500).json({ message: 'No se pudo ejecutar el seed' });
        }
    }
}
