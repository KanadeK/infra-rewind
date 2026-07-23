import path from "node:path";
import { closeStaticSite, listenStaticSite } from "../../scripts/static-site-server";
import { build } from "vite";

export default async function globalSetup() {
  await build();
  const site = await listenStaticSite(path.resolve("dist"));
  process.env.INFRA_REWIND_E2E_URL = site.url;

  return async () => closeStaticSite(site);
}
