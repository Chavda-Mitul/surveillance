import { FastifyInstance } from "fastify";
import { getSatellite } from "../services/satelliteService";

async function routes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/satellites", async () => {
    const data = await getSatellite();
    return data;
  });
}

export default routes;