import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Agents
  app.get("/api/agents", async (_req, res) => {
    const { category, search, featured } = _req.query;
    if (featured === "true") {
      const agents = await storage.getFeaturedAgents();
      return res.json(agents);
    }
    if (search && typeof search === "string") {
      const agents = await storage.searchAgents(search);
      return res.json(agents);
    }
    if (category && typeof category === "string") {
      const agents = await storage.getAgentsByCategory(category);
      return res.json(agents);
    }
    const agents = await storage.getAgents();
    res.json(agents);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  // Creators
  app.get("/api/creators", async (_req, res) => {
    const { featured } = _req.query;
    if (featured === "true") {
      const creators = await storage.getFeaturedCreators();
      return res.json(creators);
    }
    const creators = await storage.getCreators();
    res.json(creators);
  });

  app.get("/api/creators/:id", async (req, res) => {
    const creator = await storage.getCreator(req.params.id);
    if (!creator) return res.status(404).json({ message: "Creator not found" });
    const agents = await storage.getAgentsByCreator(creator.id);
    res.json({ ...creator, agents });
  });

  // Subscriptions
  app.post("/api/subscriptions", async (req, res) => {
    const sub = await storage.createSubscription(req.body);
    res.status(201).json(sub);
  });

  // Stats
  app.get("/api/stats", async (_req, res) => {
    const agents = await storage.getAgents();
    const creators = await storage.getCreators();
    res.json({
      totalAgents: agents.length,
      totalCreators: creators.length,
      totalDownloads: agents.reduce((sum, a) => sum + a.downloads, 0),
      totalSubscribers: creators.reduce((sum, c) => sum + c.subscribers, 0),
    });
  });

  return httpServer;
}
