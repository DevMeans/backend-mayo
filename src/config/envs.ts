import "dotenv/config";
import env from "env-var";

export const envs = {
    PORT: env.get('PORT' ).required().asPortNumber(),
    DATABASE_URL: env.get('DATABASE_URL').required().asString(),
    CLOUDINARY_CLOUD_NAME: env.get('CLOUDINARY_CLOUD_NAME').required().asString(),
    CLOUDINARY_API_KEY: env.get('CLOUDINARY_API_KEY').required().asString(),
    CLOUDINARY_API_SECRET: env.get('CLOUDINARY_API_SECRET').required().asString(),
   // JWT_SECRET: get('JWT_SECRET').required().asString(),
    PUBLIC_PATH: env.get('PUBLIC_PATH').required().asString()
};      