import Fastify from "fastify";
import cors from "@fastify/cors";
import satelliteRoutes from "./routes/satellite";
import { connectRedis } from "./lib/redis";
import { startSatelliteJob } from "./job/satelliteJob";


const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: "http://localhost:5173", // Vite dev server
});

fastify.register(satelliteRoutes, { prefix: "/api" });

startSatelliteJob();

const start = async () => {
  try {
    await connectRedis();
    await fastify.listen({ port: 3000 });
    console.log("Server running at http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();