// const axios = require('axios');
import axios from "axios";
import ReactionError from "@reactioncommerce/reaction-error";
import pkg from "mongodb";
const { ObjectId } = pkg;
import pubSub from "../util/pubSubIntance.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";

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


  // Validate transaction amount
  if (!transactionAmount || isNaN(transactionAmount) || transactionAmount <= 0) {
    throw new ReactionError(
      "invalid-payment",
      "A valid transaction amount is required for EasyPaisa payments"
    );
  }

  let data = JSON.stringify({
    "orderId": kitchenOrderID || "abc123",
    "storeId": storeId || process.env.EASYPAISASTOREID,
    "transactionAmount": process.env.ENVIRONMENT == "development" || process.env.ENVIRONMENT == "staging" ? 1 : transactionAmount,
    "transactionType": transactionType || "MA",
    "mobileAccountNo": mobileAccountNo,
    "emailAddress": emailAddress,
    "optional1": orderId,
    "optional2": TransactionRecord.toString(),
  });
  console.log("data ", data)
  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction',
    headers: {
      'Credentials': process.env.EASYPAISACREDENTIALS,
      'Content-Type': 'application/json',
      'Cookie': 'f5avraaaaaaaaaaaaaaaa_session_=HLMGKINDPKOJPKHOFEJMHOFEAPLIEDNBIFMADPFDMFDBKJMAKJPJNJDHBOMIFKDDNPJDBLJAELGDJNPNGKFAHGPIBDFNHNIPGPKKOPNLFAMPKIHGHMCEGFLIEIAJCECG; TS01f2a187=011c1a8db659dbb038859aba2f36856f49c5f911252f3f7aa8f963e626dc41fc3e6bf3995de8df0b30f8604415537bd0b25978dbb226ae694d9bffc43ef74feae68d5e4754; f5avraaaaaaaaaaaaaaaa_session_=DKJDJDGCAKOILNAIFIMBBPDNGBEELNCHEKICBGFHGICKPLHBPDALCJIMBPPODMIGGPFDJNOKBBCECALJIFOADBPJBCIJKCAHMDAOJGFAOIKNDBIADHNFAFCCEBAIOJHP; TS01f2a187=011c1a8db62ea093b93cb0f4b4084e8c77949764178c31e2d7b022ef68219ae814908501b769506889b7f1a1e288e8efe804be3e6a042c4ca76066fb41057d939d4f9f4cf4'
    },
    data: data
  };
    let decodedId;
    try {
      decodedId = decodeOpaqueId(orderId);
    } catch (e) {
      decodedId = null;
    }
    const lookupId = decodedId?.id || orderId;
    const paymentInitiatedAt=new Date().toISOString()
    await OrdersDb.updateOne(
    { _id: lookupId },
    { $set: { paymentStatus: "PENDING" ,isPaid: false, paymentInitiatedAt:paymentInitiatedAt } }
  );
  
  pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${orderId}`, {
    orderPaymentStatusUpdated: {
      orderId: orderId,
      paymentMethod: "EASYPASA",
      paymentStatus: "PENDING",
      updatedAt: new Date(),
      isPaid: false,
      paymentInitiatedAt:paymentInitiatedAt
    }
  });
  const response = await axios.request(config)
    .then(async (response) => {
      console.log("response of easypaisa", JSON.stringify(response.data));

      // Update transaction in database
      if (response.data && TransactionDb) {
        try {
          const { optional1, responseDesc, responseCode, transactionId, transactionDateTime, optional2 } = response.data; // Assuming optional1 contains the orderId
      
        // First verify that this order actually exists
        let decodedId;
        try {
          decodedId = decodeOpaqueId(optional1);
        } catch (e) {
          decodedId = null;
        }
        const lookupId = decodedId?.id || orderId;
          await TransactionDb.updateOne(
            { orderId: lookupId, _id: ObjectId(optional2) },
            {
              $set: {
                raw: response.data,
                responseMessage: responseDesc,
                status: responseDesc,
                responseCode: responseCode,
                transactionId: transactionId,
                updatedAt: new Date(),
                transactionDateTime: transactionDateTime
              }
            }
          );
          const isSuccess = responseDesc === "SUCCESS" && responseCode === "0000";
          try {
            await OrdersDb.updateOne(
              { _id: lookupId },
              {
                $set: {
                  isPaid: isSuccess,
                  paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                  transactionId: transactionId || null,
                  updatedAt: new Date(),
                },
              }
            );
            pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${optional1}`, {
              orderPaymentStatusUpdated: {
                orderId: optional1,
                paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                updatedAt: new Date(),
                isPaid: isSuccess,
              }
            });
            console.log(`Order ${lookupId} updated from EasyPaisa response with status ${responseDesc}`);
          } catch (orderUpdateError) {
            console.error("Error updating order from EasyPaisa response:", orderUpdateError.message);
          }
          console.log("Transaction updated in database successfully");
        } catch (dbError) {
          console.error("Error updating transaction in database:", dbError);
        }
      }

      return response.data;
    })
    .catch((error) => {
      console.log("error of easypaisa ", error);
      return false
    });
  return response
}
