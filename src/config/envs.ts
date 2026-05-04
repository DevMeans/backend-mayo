import env from "env-var";

export const envs = {
    PORT: env.get('PORT' ).required().asPortNumber(),
    DATABASE_URL: env.get('DATABASE_URL').required().asString(),
   // JWT_SECRET: get('JWT_SECRET').required().asString(),
    PUBLIC_PATH: env.get('PUBLIC_PATH').required().asString()
};      