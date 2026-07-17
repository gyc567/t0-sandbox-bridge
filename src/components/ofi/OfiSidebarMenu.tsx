import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MenuItem = {
  value: string;
  label: string;
};

const MENU_ITEMS: MenuItem[] = [
  { value: "quote-management", label: "Quote management" },
  { value: "payment-pre-settlement", label: "Payment-Pre-Settlement" },
  { value: "payment-continued", label: "Payment-Payment Continued" },
  { value: "payment-manual-aml", label: "Payment-Manual AML" },
  { value: "refund", label: "ReFund" },
];

export type OfiTab =
  | "quote-management"
  | "payment-pre-settlement"
  | "payment-continued"
  | "payment-manual-aml"
  | "refund";

type OfiSidebarMenuProps = {
  children: ReactNode;
  refundContent: ReactNode;
  paymentPreSettlementContent: ReactNode;
  paymentContinuedContent: ReactNode;
  paymentManualAmlContent: ReactNode;
  /** Default tab on first render. If omitted, falls back to the
   *  original "quote-management" behavior. */
  defaultTab?: OfiTab;
};

export function OfiSidebarMenu({
  children,
  refundContent,
  paymentPreSettlementContent,
  paymentContinuedContent,
  paymentManualAmlContent,
  defaultTab,
}: OfiSidebarMenuProps) {
  const [activeTab, setActiveTab] = useState<OfiTab>(defaultTab ?? "quote-management");

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as OfiTab)}
      orientation="vertical"
      className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-start"
    >
      <TabsList
        aria-label="OFI sections"
        className="h-auto w-full justify-start bg-transparent p-0 md:flex-col"
      >
        {MENU_ITEMS.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="w-full justify-start border border-hairline px-4 py-3 font-mono text-caption data-[state=active]:border-primary/50"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="quote-management" className="mt-0 min-w-0 space-y-4">
        {children}
      </TabsContent>
      <TabsContent value="payment-pre-settlement" className="mt-0 min-w-0">
        {paymentPreSettlementContent}
      </TabsContent>
      <TabsContent value="payment-continued" className="mt-0 min-w-0">
        {paymentContinuedContent}
      </TabsContent>
      <TabsContent value="payment-manual-aml" className="mt-0 min-w-0">
        {paymentManualAmlContent}
      </TabsContent>
      <TabsContent value="refund" className="mt-0 min-w-0">
        {refundContent}
      </TabsContent>
    </Tabs>
  );
}
