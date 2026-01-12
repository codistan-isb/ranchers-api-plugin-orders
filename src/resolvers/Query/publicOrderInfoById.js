import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

export default async function publicOrderInfoById(parent, { orderId }, context) {
  const { Orders } = context.collections || {};
  if (!Orders) {
    throw new Error("Orders collection not available in context");
  }

  // Accept opaque IDs (Relay-style) or raw IDs; fall back to raw if decode fails
  let decodedId;
  try {
    decodedId = decodeOpaqueId(orderId);
  } catch (e) {
    decodedId = null;
  }
  const lookupId = decodedId?.id || orderId;

  const order = await Orders.findOne({ _id: lookupId });
  if (!order) {
    return {
      payments: [],
      kitchenOrderID: null,
      updatedAt: null,
      notes: [],
      email: null,
      customerInfo: null,
      fulfillmentGroups: [],
      summary: null,
      paymentOption: "Cash on delivery",
      finalPrice: 0,
      discountAmount: 0,
      isPaid: false,
      paymentStatus: null,
      transactionId: null
    };
  }

  const payments = order.payments || [];
  const firstPayment = payments[0] || {};

  const paymentMethod = order.paymentMethod;
  console.log("Payment Method:", paymentMethod);
  let paymentOption = "Cash on delivery";
  switch (paymentMethod) {
    case "EASYPAISA":
      paymentOption = "EasyPaisa";
      break;
    case "JAZZCASH":
      paymentOption = "JazzCash";
      break;
    case "CARD":
      paymentOption = "Card";
      break;
    case "CASH":
    case "COD":
    default:
      paymentOption = "Cash on delivery";
  }

  const finalPrice = (firstPayment.finalAmount != null) ? Number(firstPayment.finalAmount) : 0;
  const discountAmount = Number(
    order?.summary?.discountTotal?.amount ?? order?.discounts?.[0]?.amount ?? 0
  );

  return {
    payments,
    kitchenOrderID: order.kitchenOrderID || null,
    updatedAt: order.updatedAt || null,
    notes: order.notes || [],
    email: order.email || null,
    customerInfo: order.customerInfo || null,
    fulfillmentGroups: order.fulfillmentGroups || [],
    summary: order.summary || null,
    paymentOption,
    finalPrice,
    orderType: order.shipping?.[0]?.type || order.orderType || null,
    discountAmount,
    customerInfo:order.shipping?.[0]?.address,
    isPaid: Boolean(order.isPaid),
    paymentStatus: order.paymentStatus || null,
    transactionId: order.transactionId || null
  };
}
