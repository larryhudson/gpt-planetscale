import type { Config, Context } from "https://edge.netlify.com/";
import { connect } from "https://esm.sh/@planetscale/database";

export default async function handler(req: Request, context: Context) {
  const config = {
    host: Deno.env.get("DATABASE_HOST"),
    username: Deno.env.get("DATABASE_USERNAME"),
    password: Deno.env.get("DATABASE_PASSWORD"),
  };

  const conn = connect(config);

  const results = await conn
    .execute(`SELECT * from messages`)
    .then((result) => result.rows);

  return context.json(results);
}

export const config: Config = {
  path: "/",
};
