import { QueryClient } from "@tanstack/react-query";
import { createRouter, type Router } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

let routerInstance: Router | undefined;

export const getRouter = (): Router => {
  if (!routerInstance) {
    const queryClient = new QueryClient();

    routerInstance = createRouter({
      routeTree,
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    });
  }

  return routerInstance;
};

// Alias for TanStack Start
export const router = getRouter();
