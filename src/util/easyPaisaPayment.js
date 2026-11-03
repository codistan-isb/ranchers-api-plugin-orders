import ReactionError from "@reactioncommerce/reaction-error";
import pkg from "mongodb";
const { ObjectId } = pkg;
import pubSub from "../util/pubSubIntance.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import {
  normalizeEasyPaisaMsisdn,
  postEasyPaisaMaRequest
} from "./easyPaisaClient.js";

/**
 * Resolve whether an initiate-transaction response is success, pending, or failure.
 * Sync success uses 0000 / SUCCESS; async pending uses 040.
 * @param {Object} data
 * @returns {"SUCCESS"|"PENDING"|"FAILED"}
 */
function resolveInitiateStatus(data = {}) {
  const code = String(data.responseCode ?? "");
  const desc = String(data.responseDesc || data.responseMessage || "").toUpperCase();

  if (code === "0000" || (code === "000" && desc.includes("SUCCESS"))) {
    return "SUCCESS";
  }
  if (code === "040" || desc.includes("PAYMENT CONFIRMATION PENDING")) {
    return "PENDING";
  }
  return "FAILED";
}

function publishPaymentStatus({ branchId, opaqueOrderId, lookupId, paymentStatus, isPaid, paymentInitiatedAt }) {
  const payload = {
    orderId: lookupId,
    paymentStatus,
    updatedAt: new Date(),
    isPaid,
    paymentMethod: "EASYPAISA"
  };
  if (paymentInitiatedAt) {
    payload.paymentInitiatedAt = paymentInitiatedAt;
  }

  if (branchId) {
    pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${branchId}`, {
      orderPaymentStatusUpdated: { ...payload, orderId: lookupId }
    });
  }

  if (opaqueOrderId) {
    pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${opaqueOrderId}`, {
      orderPaymentStatusUpdated: { ...payload, orderId: opaqueOrderId }
    });
  }
}

/**
 * Initiate an EasyPaisa Mobile Account transaction (API Integration Guide V1.5).
 */
export default async function doEasyPaisaPayment(
  kitchenOrderID,
  orderId,
  storeId,
  transactionAmount,
  transactionType,
  mobileAccountNo,
  emailAddress,
  TransactionRecord,
  TransactionDb,
  OrdersDb
) {
  if (!transactionAmount || isNaN(transactionAmount) || transactionAmount <= 0) {
    throw new ReactionError(
      "invalid-payment",
      "A valid transaction amount is required for EasyPaisa payments"
    );
  }

  const msisdn = normalizeEasyPaisaMsisdn(mobileAccountNo);
  if (!msisdn) {
    throw new ReactionError(
      "invalid-payment",
      "A valid mobile number is required for EasyPaisa payments"
    );
  }

  const amount =
    process.env.ENVIRONMENT === "development" || process.env.ENVIRONMENT === "staging"
      ? 1
      : Number(transactionAmount);

  // orderId max length is 20 per V1.5; kitchenOrderID is the merchant reference.
  const easypaisaOrderId = String(kitchenOrderID || orderId || "abc123").slice(0, 20);

  const requestPayload = {
    msisdn,
    orderId: easypaisaOrderId,
    transactionAmount: amount,
    emailAddress: emailAddress || "",
    channel: process.env.EASYPAISACHANNEL || "APP",
    storeId: String(storeId || process.env.EASYPAISASTOREID || "")
  };

  let decodedId;
  try {
    decodedId = decodeOpaqueId(orderId);
  } catch (e) {
    decodedId = null;
  }
  const lookupId = decodedId?.id || orderId;
  const paymentInitiatedAt = new Date().toISOString();

  const orderData = await OrdersDb.findOneAndUpdate(
    { _id: lookupId },
    { $set: { paymentStatus: "PENDING", isPaid: false, paymentInitiatedAt } },
    { new: true }
  );
  const branchId = orderData?.value?.branchID;

  publishPaymentStatus({
    branchId,
    opaqueOrderId: orderId,
    lookupId,
    paymentStatus: "PENDING",
    isPaid: false,
    paymentInitiatedAt
  });

  try {
    console.log("EasyPaisa initiate-transaction request", JSON.stringify(requestPayload));
    const responseData = await postEasyPaisaMaRequest("/initiate-transaction", requestPayload);
    console.log("response of easypaisa", JSON.stringify(responseData));

    const status = resolveInitiateStatus(responseData);
    const {
      responseDesc,
      responseCode,
      transactionId,
      transactionDateTime,
      orderId: responseOrderId
    } = responseData || {};

    if (TransactionDb) {
      try {
        const transactionFilter = TransactionRecord
          ? { _id: ObjectId(TransactionRecord) }
          : { orderId: lookupId, kitchenOrderID: easypaisaOrderId, status: "PENDING" };

        await TransactionDb.updateOne(transactionFilter, {
          $set: {
            raw: responseData,
            responseMessage: responseDesc,
            status: status === "PENDING" ? "PENDING" : (responseDesc || status),
            responseCode,
            transactionId: transactionId || "NA",
            updatedAt: new Date(),
            transactionDateTime: transactionDateTime || "NA",
            kitchenOrderID: easypaisaOrderId,
            orderId: lookupId
          }
        });
      } catch (dbError) {
        console.error("Error updating transaction in database:", dbError);
      }
    }

    // Async (040): leave order PENDING until IPN confirms payment.
    // Sync success: mark paid. Any other code: mark failed.
    if (status !== "PENDING") {
      const isSuccess = status === "SUCCESS";
      try {
        const orderObj = await OrdersDb.findOneAndUpdate(
          { _id: lookupId },
          {
            $set: {
              isPaid: isSuccess,
              paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
              transactionId: transactionId || null,
              updatedAt: new Date()
            }
          },
          { new: true }
        );

        publishPaymentStatus({
          branchId: orderObj?.value?.branchID || branchId,
          opaqueOrderId: orderId,
          lookupId,
          paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
          isPaid: isSuccess
        });

        console.log(
          `Order ${lookupId} updated from EasyPaisa response with status ${responseDesc} (orderId=${responseOrderId})`
        );
      } catch (orderUpdateError) {
        console.error("Error updating order from EasyPaisa response:", orderUpdateError.message);
      }
    } else {
      console.log(`Order ${lookupId} EasyPaisa payment pending IPN confirmation`);
    }

    return responseData;
  } catch (error) {
    console.log("error of easypaisa ", error?.response?.data || error.message || error);

    try {
      await OrdersDb.findOneAndUpdate(
        { _id: lookupId },
        {
          $set: {
            isPaid: false,
            paymentStatus: "FAILED",
            updatedAt: new Date()
          }
        },
        { new: true }
      );
      publishPaymentStatus({
        branchId,
        opaqueOrderId: orderId,
        lookupId,
        paymentStatus: "FAILED",
        isPaid: false
      });

      if (TransactionDb && TransactionRecord) {
        await TransactionDb.updateOne(
          { _id: ObjectId(TransactionRecord) },
          {
            $set: {
              status: "FAILED",
              responseMessage: error?.response?.data?.responseDesc || error.message || "EasyPaisa request failed",
              raw: error?.response?.data || null,
              updatedAt: new Date()
            }
          }
        );
      }
    } catch (updateError) {
      console.error("Error marking EasyPaisa payment as failed:", updateError.message);
    }

    return false;
  }
}
