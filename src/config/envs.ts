import { get } from "env-var";

export const envs = {
    PORT: get('PORT' ).required().asPortNumber(),
    DATABASE_URL: get('DATABASE_URL').required().asString(),
   // JWT_SECRET: get('JWT_SECRET').required().asString(),
    PUBLIC_PATH: get('PUBLIC_PATH').required().asString()
};      