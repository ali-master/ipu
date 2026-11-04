import { Elysia } from "elysia";
import { createServer } from "./src/runtime";
import { vercelClientIP } from "./src/client-ip";

export default new Elysia().use(await createServer(vercelClientIP));
