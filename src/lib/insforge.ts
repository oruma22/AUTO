import { createClient, createAdminClient } from "@insforge/sdk";

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_API_URL || "https://d3bmbw3q.us-east.insforge.app";
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || "ik_3a41e6c3914015cdaaea978893f65689";

export const insforge = createClient({
  baseUrl,
  anonKey
});

export const insforgeAdmin = createAdminClient({
  baseUrl,
  apiKey: process.env.INSFORGE_API_KEY || anonKey
});

