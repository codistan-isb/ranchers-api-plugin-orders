import SimpleSchema from "simpl-schema";
import ReactionError from "@reactioncommerce/reaction-error";
import Logger from "@reactioncommerce/logger";
import doEasyPaisaPayment from "../util/easyPaisaPayment.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

const inputSchema = new SimpleSchema({
  orderId: String
});

/**
 * @method reattemptEasyPaisaPayment
 * @summary Reattempts EasyPaisa payment for an existing order
 * @param {Object} context - an object containing the per-request state
 * @param {Object} input - Necessary input. See SimpleSchema
 * @returns {Promise<Object>} Object with success status and payment response
 */
export default async function reattemptEasyPaisaPayment(context, input) {
  inputSchema.validate(input);

  const { orderId } = input;
  const { collections } = context;
  const { Orders, Transaction } = collections;

  // First verify that this order actually exists
    let decodedId;
    try {
      decodedId = decodeOpaqueId(orderId);
    } catch (e) {
      decodedId = null;
    }
    const lookupId = decodedId?.id || orderId;
  
  const order = await Orders.findOne({ _id: lookupId });
  if (!order) {
    throw new ReactionError("not-found", "Order not found");
  }


  // Check if the order payment method is EasyPaisa
  const paymentMethod = order.paymentMethod || order.fulfillmentGroups?.[0]?.paymentMethod;
  if (paymentMethod !== "EASYPAISA") {
    throw new ReactionError(
      "invalid-request",
      "This order does not use EasyPaisa as payment method"
    );
  }

  // Get payment amount and email
  const paymentAmount = order.payments?.[0]?.amount || order.payments?.[0]?.finalAmount || 0;
  const discountTotal = order.discountTotal || 0;
  const accountId = order.accountId || null;
  const finalAmount = paymentAmount - discountTotal;
  const email = order.email;

  // Get jazzCashNumber from the order or transaction record
  let jazzCashNumber = order.msisdn;
  if (!jazzCashNumber) {
    const transactionRecord = await Transaction.findOne({ lookupId });
    jazzCashNumber = transactionRecord?.jazzCashNumber;
  }

  if (!jazzCashNumber) {
    throw new ReactionError(
      "invalid-request",
      "Mobile number not found for this order"
    );
  }

  if (!finalAmount || finalAmount <= 0) {
    throw new ReactionError(
      "invalid-payment",
      "Invalid payment amount for this order"
    );
  }

  // Create transaction record with pending status before initiating payment
  const transactionRecordObj = {
    kitchenOrderID: order?.kitchenOrderID,
    orderId:lookupId,
    accountId,
    email,
    responseCode: "NA",
    responseMessage: "Payment initiated",
    amount: finalAmount,
    status: "PENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
    transactionId: "NA",
    transactionDateTime: "NA",
    jazzCashNumber: jazzCashNumber
  };

  await Transaction.insertOne(transactionRecordObj);

  // Attempt EasyPaisa payment in non-blocking way
  doEasyPaisaPayment(
     order?.kitchenOrderID,
    lookupId,
    null,
    finalAmount,
    null,
    jazzCashNumber,
    email
  ).then((easyPaisaResponse) => {
    // Update transaction record with EasyPaisa response
    console.log("EasyPaisa Response:", easyPaisaResponse);
    // console.log("Lookup ID:", lookupId);
    // Transaction.updateOne(
    //   { orderId: easyPaisaResponse.orderId, status: "PENDING" },
    //   {
    //     $set: {
    //       responseCode: easyPaisaResponse?.responseCode || "NA",
    //       responseMessage: easyPaisaResponse?.responseMessage || "Payment response received",
    //       transactionId: easyPaisaResponse?.transactionId || "NA",
    //       transactionDateTime: easyPaisaResponse?.transactionDateTime || new Date().toISOString(),
    //       status: easyPaisaResponse?.responseCode === "0000" ? "SUCCESS" : "FAILED",
    //       updatedAt: new Date(),
    //     },
    //   }
    // );

    Logger.info(`EasyPaisa payment reattempt for order ${lookupId}: ${easyPaisaResponse?.responseMessage}`);
  }).catch((error) => {
    Logger.error("Error reattempting EasyPaisa payment:", error);
    
    // Update transaction record with error
    // Transaction.updateOne(
    //   { orderId: lookupId, status: "PENDING" },
    //   {
    //     $set: {
    //       status: "FAILED",
    //       responseMessage: error.message || "Payment failed due to an error",
    //       updatedAt: new Date(),
    //     },
    //   }
    // );
  });
    
  // Return immediately without waiting for payment to complete
  return {
    message: "Payment requested, open your easy paisa app to complete the payment.",
    success: true
  };
}
