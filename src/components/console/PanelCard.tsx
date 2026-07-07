// PanelCard — glass-style numbered panel shared by Provider and OFI consoles.

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface PanelCardProps {
  step: string;
  title: string;
  children: React.ReactNode;
}

export function PanelCard({ step, title, children }: PanelCardProps) {
  return (
    <Card className="border-hairline bg-glass backdrop-blur-xl">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-hairline">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-accent-cyan"
            style={{ fontSize: "11px", letterSpacing: "0.1em" }}
          >
            {step}
          </span>
          <CardTitle
            className="font-mono uppercase text-foreground"
            style={{ fontSize: "12px", letterSpacing: "0.08em" }}
          >
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}