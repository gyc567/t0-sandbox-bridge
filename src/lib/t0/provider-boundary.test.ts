// Anti-regression guards for the role boundary after the T-0 Network
// protocol alignment refactor. If any of these fail, a method has leaked
// back into the wrong role (Provider vs Network orchestrator).

import { describe, it, expect, vi } from "vitest";
import { PayoutProviderService } from "./provider";
import { SandboxNetwork } from "./network";
import { OFIService } from "./ofi";
import { MockT0Client } from "./client";

describe("role boundary guards", () => {
  it("PayoutProviderService.prototype no longer exposes OFI / Network orchestrator methods", () => {
    const svc = new PayoutProviderService(new MockT0Client());
    const proto = Object.getPrototypeOf(svc);
    // The phase-8 + accept methods were moved to SandboxNetwork.
    expect(proto.acceptPayment).toBeUndefined();
    expect(proto.completeManualAml).toBeUndefined();
    expect(proto.approvePaymentQuote).toBeUndefined();
    expect(proto.createPaymentIntent).toBeUndefined();
    expect(proto.confirmFunds).toBeUndefined();
    expect(proto.processPayout).toBeUndefined(); // renamed to executePayout
    expect(proto.requestPayout).toBeUndefined();
    expect(proto.notifyUsdtSettlement).toBeTypeOf("function");
    expect(proto.notifyCreditUsage).toBeTypeOf("function");
    expect(proto.executePayout).toBeTypeOf("function");
  });

  it("SandboxNetwork.prototype exposes the orchestrator surface", () => {
    const svc = new PayoutProviderService(new MockT0Client());
    const network = new SandboxNetwork(svc);
    const proto = Object.getPrototypeOf(network);
    expect(proto.createPayment).toBeTypeOf("function");
    expect(proto.completeManualAml).toBeTypeOf("function");
    expect(proto.approvePaymentQuote).toBeTypeOf("function");
    expect(proto.createPaymentIntent).toBeTypeOf("function");
    expect(proto.confirmFunds).toBeTypeOf("function");
    expect(proto.requestPayout).toBeTypeOf("function");
    expect(proto.handleNetworkPayout).toBeTypeOf("function");
    expect(proto.handleNetworkAccepted).toBeTypeOf("function");
    expect(proto.handleManualAmlCheck).toBeTypeOf("function");
    expect(proto.getQuote).toBeTypeOf("function");
    expect(proto.getQuoteById).toBeTypeOf("function");
    expect(proto.listPayments).toBeTypeOf("function");
  });

  it("OFIService routes createPayment through SandboxNetwork (not directly to Provider)", async () => {
    const svc = new PayoutProviderService(new MockT0Client());
    const network = new SandboxNetwork(svc);
    const ofi = new OFIService(network);
    const spy = vi.spyOn(network, "createPayment");
    expect(spy).toBeTypeOf("function");
    await ofi.createPayment({
      paymentClientId: "baxs_ofi_routed",
      quoteId: "x",
      beneficiaryRef: "B",
      usdAmount: 1_000,
    });
    expect(spy).toHaveBeenCalled();
  });
});
