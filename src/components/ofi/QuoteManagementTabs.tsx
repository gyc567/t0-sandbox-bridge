import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type QuoteManagementTabsProps = {
  children: ReactNode;
};

const QUOTE_MANAGEMENT_TAB = "quote-management";

export function QuoteManagementTabs({ children }: QuoteManagementTabsProps) {
  return (
    <Tabs
      defaultValue={QUOTE_MANAGEMENT_TAB}
      orientation="vertical"
      className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start"
    >
      <TabsList
        aria-label="OFI sections"
        className="h-auto w-full justify-start bg-transparent p-0 md:flex-col"
      >
        <TabsTrigger
          value={QUOTE_MANAGEMENT_TAB}
          className="w-full justify-start border border-hairline px-4 py-3 font-mono text-caption data-[state=active]:border-primary/50"
        >
          Quote management
        </TabsTrigger>
      </TabsList>
      <TabsContent value={QUOTE_MANAGEMENT_TAB} className="mt-0 min-w-0">
        {children}
      </TabsContent>
    </Tabs>
  );
}
