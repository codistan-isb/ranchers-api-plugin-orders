import SimpleSchema from "simpl-schema";
import ReactionError from "@reactioncommerce/reaction-error";
import { Order as OrderSchema } from "../simpleSchemas.js";
// import sendOrderEmail from "./sendOrderEmail.js";

const inputSchema = new SimpleSchema({
  customFields: {
    type: Object,
    blackbox: true,
    optional: true,
  },
  email: {
    type: String,
    optional: true,
  },
  orderId: String,
  status: {
    type: String,
    optional: true,
  },
});

/**
 * @method updateOrder
 * @summary Use this mutation to update order status, email, and other
 *   properties
 * @param {Object} context - an object containing the per-request state
 * @param {Object} input - Necessary input. See SimpleSchema
 * @returns {Promise<Object>} Object with `order` property containing the updated order
 */
export default async function updateOrder(context, input) {
  inputSchema.validate(input);

  const { customFields, email, orderId, status } = input;

  const { appEvents, collections, userId } = context;
  const { Orders } = collections;

  // First verify that this order actually exists
  const order = await Orders.findOne({ _id: orderId });
  if (!order) throw new ReactionError("not-found", "Order not found");
  // At this point, this mutation only updates the workflow status, which should not be allowed
  // for the order creator. In the future, if this mutation does more, we should revisit these
  // permissions to see if order owner should be allowed.
  await context.validatePermissions(
    `reaction:legacy:orders:${order._id}`,
    "update",
    { shopId: order.shopId }
  );

  const modifier = {
    $set: {
      updatedAt: new Date(),
    },
  };


  if (email) modifier.$set.email = email;

  if (customFields) modifier.$set.customFields = customFields;

  if (status && order.workflow.status !== status) {
    modifier.$set["workflow.status"] = status;
    modifier.$push = {
      "workflow.workflow": status,
    };
  }
  if (status === "ready" || status === "completed") {
    modifier.$set["prepTime"] = 0;
  }
  if (status === "confirmed" || status === "processing") {
    modifier.$set.confirmationTime = new Date();
  }
  // Skip updating if we have no updates to make
  if (Object.keys(modifier.$set).length === 1) return { order };

  OrderSchema.validate(modifier, { modifier: true });

  const { modifiedCount, value: updatedOrder } = await Orders.findOneAndUpdate(
    { _id: orderId },
    modifier,
    { returnOriginal: false }
  );
  // this moved toward the app event dnt uncomment it

  // const message = `Your order is ${status}`;
  // const appTypecustomer = "customer";
  // const Customerid = order?.accountId;
  // const CustomeruserId = order?.accountId;
  // const CustomerOrderID = order?._id;
  // const paymentIntentClientSecret =
  //   context.mutations.oneSignalCreateNotification(context, {
  //     message,
  //     id: Customerid,
  //     appType: appTypecustomer,
  //     userId: CustomeruserId,
  //     OrderID: CustomerOrderID,
  //   });
  // if (modifiedCount === 1 && status === "confirmed") {
  //   console.log("confirmed");
  //   // Send email to notify customer of a refund
  //   sendOrderEmail(context, updatedOrder, "confirmed");
  // }
  if (modifiedCount === 0 || !updatedOrder)
    throw new ReactionError("server-error", "Unable to update order");

  await appEvents.emit("afterOrderUpdate", {
    order: updatedOrder,
    updatedBy: userId,
    status
  });

  return { order: updatedOrder };
}
