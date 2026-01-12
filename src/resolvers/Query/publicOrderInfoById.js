import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import formatPublicOrderResponse from "../../util/formatPublicOrderResponse.js";

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
  return formatPublicOrderResponse(order);
}
