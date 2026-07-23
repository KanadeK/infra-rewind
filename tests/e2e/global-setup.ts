import { build, preview } from "vite";

export default async function globalSetup() {
  await build();
  const server = await preview({
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    },
  });

  return async () => {
    await new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };
}
