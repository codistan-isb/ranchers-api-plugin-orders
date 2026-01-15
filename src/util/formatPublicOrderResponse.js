/**
 * @summary Formats an order object into the PublicOrderInfoPayload response structure
 * @param {Object} order - The order document from the database
 * @returns {Object} Formatted order response
 */
export default function formatPublicOrderResponse(order) {
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
    paymentInitiatedAt:order?.paymentInitiatedAt,
    payments,
    kitchenOrderID: order.kitchenOrderID || null,
    updatedAt: order.updatedAt || null,
    notes: order.notes || [],
    email: order.email || null,
    customerInfo: order.shipping?.[0]?.address || null,
    fulfillmentGroups:  order.shipping || [],
    summary: order.summary || null,
    paymentOption,
    finalPrice,
    orderType: order.shipping?.[0]?.type || order.orderType || null,
    discountAmount,
    isPaid: Boolean(order.isPaid),
    paymentStatus: order.paymentStatus || null,
    transactionId: order.transactionId || null
  };
}
