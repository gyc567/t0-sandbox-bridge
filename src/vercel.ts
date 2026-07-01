/**
 * Vercel 服务端入口
 *
 * 将 TanStack Start 适配到 Vercel Edge Functions
 * 使用 createStartHandler 从 @tanstack/start-server-core
 */

import { createStartHandler } from "@tanstack/start-server";
import { getRouter } from "./router";

export default createStartHandler({
  createRouter: () => getRouter(),
});