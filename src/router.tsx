import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

type AppRouter = ReturnType<typeof createRouter<typeof routeTree>>;

let routerInstance: AppRouter | undefined;

export const getRouter = (): AppRouter => {
  if (!routerInstance) {
    const queryClient = new QueryClient();

    routerInstance = createRouter({
      routeTree,
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    }) as AppRouter;
  }

  return routerInstance;
};

// Alias for TanStack Start
export const router = getRouter();
