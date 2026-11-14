import path from "node:path";
import { createApp } from "./app";
import { config } from "./config";
import { openSqliteDb } from "./store";

const { db, close } = openSqliteDb(path.join(config.dataDir, "tobe.sqlite"));
const { app } = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`ToBe API prête sur http://localhost:${config.port}  (démo: ${config.demo}, code SMS visible: ${config.exposeOtp})`);
});
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close();
    close();
    process.exit(0);
  });
}
