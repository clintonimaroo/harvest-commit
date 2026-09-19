import { createApp } from "./app.ts";
const port = Number(process.env.PORT || 4173);
createApp().listen(port, "127.0.0.1", () =>
  console.log(`Harvest Commit running at http://localhost:${port}`),
);
