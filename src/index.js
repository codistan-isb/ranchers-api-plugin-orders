import pkg from "../package.json";
import i18n from "./i18n/index.js";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import axios from "axios";
import https from "https";
import mutations from "./mutations/index.js";
import policies from "./policies.json";
import preStartup from "./preStartup.js";
import queries from "./queries/index.js";
import resolvers from "./resolvers/index.js";
import schemas from "./schemas/index.js";
import { Order, OrderFulfillmentGroup, OrderItem } from "./simpleSchemas.js";
import startup from "./startup.js";
import getDataForOrderEmail from "./util/getDataForOrderEmail.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";


/**
 * @summary Import and call this function to add this plugin to your API.
 * @param {ReactionAPI} app The ReactionAPI instance
 * @returns {undefined}
 */


function IPNPayment(context) {
  const { app } = context;

  // Optional: allow forwarding to Finnect with self-signed certs if explicitly enabled
  const finnectHttpsAgent = process.env.FINNECT_ALLOW_INSECURE_TLS === "true"
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

  if (app.expressApp) {
    app.expressApp.use(cors());
    app.expressApp.use(bodyParser.json());
    app.expressApp.use(bodyParser.urlencoded({ extended: true }));
    app.expressApp.use(morgan("dev"));

    app.expressApp.post("/jazzcash/ipn", async (req, res) => {
      try {
        console.log("Collections available:", Object.keys(context.collections));

        const { collections } = context;
        const { Transaction } = collections;
        const payload = req.body;

        let transactionDetails = await Transaction.findOne({ transactionId: payload.pp_TxnRefNo });

        console.log("Transaction Details:", transactionDetails);

        console.log("Payload received from JazzCash:", payload);
        console.log("IPN Received: SECURE HASH ", payload.pp_SecureHash);

        if (payload.pp_ResponseCode === "121") {
          console.log("Payment success. Mark order as PAID.");
          await Transaction.updateOne(
            { transactionId: payload.pp_TxnRefNo },
            {
              $set: {
                statusCode: payload.pp_ResponseCode,
                paymentResMsg: payload.pp_ResponseMessage,
              },
            }
          );
          console.log("Transaction record updated with JazzCash response.");
        } else {
          console.log("Payment failed or cancelled.");
        }

        // Send IPN response back to JazzCash
        return res.status(200).json({
          transactionDetails,
          pp_ResponseCode: payload.pp_ResponseCode,
          pp_ResponseMessage: payload.pp_ResponseMessage,
        });
      } catch (error) {
        console.error("Error processing JazzCash IPN:", error);
        return res.status(500).json({
          transactionDetails,
          pp_ResponseCode: payload.pp_ResponseCode,
          pp_ResponseMessage: payload.pp_ResponseMessage,
        });
      }
    });

    // Webhook endpoint for receiving EasyPaisa events (POST request with URL parameter)
    app.expressApp.post("/webhook/easypaisa", async (req, res) => {
      try {
        console.log("EasyPaisa webhook received with query params:", req.query);

        const { collections } = context;
        const { Orders, Transaction } = collections;
        const statusUrl = req.query.url;

        if (!statusUrl) {
          return res.status(400).json({
            success: false,
            message: "Missing url parameter",
          });
        }

        // Validate URL to prevent SSRF attacks
        let parsedUrl;
        try {
          parsedUrl = new URL(statusUrl);
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: "Invalid URL format",
          });
        }

        // Whitelist allowed domains for EasyPaisa
        const allowedDomains = ["easypay.easypaisa.com.pk"];
        const isAllowedDomain = allowedDomains.some(domain => parsedUrl.hostname === domain);

        if (!isAllowedDomain) {
          console.warn(`Rejected request to unauthorized domain: ${parsedUrl.hostname}`);
          return res.status(403).json({
            success: false,
            message: "URL domain not allowed. Only EasyPaisa domains are accepted.",
          });
        }

        console.log("EasyPaisa status URL:", statusUrl);

        // Fetch transaction status from EasyPaisa
        let transactionData;
        try {
          const statusResponse = await axios.get(statusUrl, {
            timeout: 10000, // 10 second timeout
          });
          transactionData = statusResponse.data;
          console.log("EasyPaisa transaction data:", JSON.stringify(transactionData, null, 2));
        } catch (fetchError) {
          console.error("Error fetching EasyPaisa status:", fetchError.message);
          return res.status(500).json({
            success: false,
            message: "Error fetching transaction status from EasyPaisa",
            error: fetchError.message,
          });
        }

        // Forward to Finnect with statusUrl as query param
        // try {
        //   const forwardResponse = await axios.post(
        //     "https://api.finnect.com.pk/ipn/easypaisa",
        //     {},
        //     {
        //       params: { url: statusUrl },
        //       headers: {
        //         "Content-Type": "application/json",
        //       },
        //       timeout: 10000,
        //       httpsAgent: finnectHttpsAgent,
        //     }
        //   );
        //   console.log("Forwarded to Finnect successfully:", forwardResponse.data);
        // } catch (forwardError) {
        //   console.error("Error forwarding to Finnect:", forwardError.message);
        //   // continue processing even if forward fails
        // }

        // Update order based on transaction data
        const orderIdFromTxn =  transactionData?.optional1;
        const transactionRecord = transactionData?.optional2;
        const kitchenOrderID = transactionData?.order_id ;
        const transactionIdFromTxn = transactionData?.transaction_id ;
        const transactionStatus = (transactionData?.transaction_status || "").toUpperCase();
        const responseCode = transactionData?.response_code;

  // First verify that this order actually exists
  let decodedId;
  try {
    decodedId = decodeOpaqueId(orderIdFromTxn);
  } catch (e) {
    decodedId = null;
  }
  const lookupId = decodedId?.id || orderId;
        if (orderIdFromTxn) {
          const isSuccess = transactionStatus === "PAID" && responseCode === "0000";
          try {
            await Orders.updateOne(
              { 
                _id: lookupId,
                isPaid: { $ne: true }  // Only update if not already paid
              },
              {
                $set: {
                  isPaid: isSuccess,
                  paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                  transactionId: transactionIdFromTxn || null,
                  updatedAt: new Date(),
                },
              }
            );
               pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${orderIdFromTxn}`, {
              orderPaymentStatusUpdated: {
                orderId: orderIdFromTxn,
                  paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                updatedAt: new Date(),
                                  isPaid: isSuccess

              }
            });
            console.log(`Order ${lookupId} updated from EasyPaisa webhook with status ${transactionStatus}`);
          } catch (orderUpdateError) {
            console.error("Error updating order from EasyPaisa webhook:", orderUpdateError.message);
          }

          // Optionally persist transaction data for audit
          try {
            await Transaction.updateOne(
              {
                orderId: lookupId,
                _id:ObjectId(transactionRecord)
              },
              {
                $set: {
                  // orderId: orderIdFromTxn,
                  paidAmount: transactionData?.transaction_amount,
                  responseMessage: `Transaction description: ${transactionData?.description}`,
                  raw: transactionData,
                  statusUrl: statusUrl,
                  updatedAt: new Date(),
                  responseCode: responseCode,
                  status: transactionStatus,
                  transactionId: transactionIdFromTxn,
                  transactionDateTime: transactionData?.paid_datetime,
                }
              }
            );
          } catch (transactionUpdateError) {
            console.error("Error upserting transaction record from EasyPaisa webhook:", transactionUpdateError.message);
          }
        } else {
          console.warn("EasyPaisa webhook missing order_id; skipping order update");
        }


        // Send acknowledgment response
        return res.status(200).json({
          success: true,
          message: "Webhook processed successfully",
          transactionData: transactionData,
        });
      } catch (error) {
        console.error("Error processing EasyPaisa webhook:", error);
        return res.status(500).json({
          success: false,
          message: "Error processing webhook",
          error: error.message,
        });
      }
    });

  }
}
export default async function register(app) {

  await app.registerPlugin({
    label: "Orders",
    name: "orders",
    version: pkg.version,
    i18n,
    collections: {
      Orders: {
        name: "Orders",
        indexes: [
          // Create indexes. We set specific names for backwards compatibility
          // with indexes created by the aldeed:schema-index Meteor package.
          [{ accountId: 1, shopId: 1 }],
          [{ createdAt: -1 }, { name: "c2_createdAt" }],
          [{ email: 1 }, { name: "c2_email" }],
          [{ referenceId: 1 }, { unique: true }],
          [{ shopId: 1 }, { name: "c2_shopId" }],
          [{ "shipping.items.productId": 1 }],
          [{ "shipping.items.variantId": 1 }],
          [{ "payments.address.fullName": 1 }],
          [{ "shipping.address.fullName": 1 }],
          [{ "payments.address.phone": 1 }],
          [{ "workflow.status": 1 }, { name: "c2_workflow.status" }],
        ],
      },
      CartHistory: {
        name: "CartHistory",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      WhatsAppMessage: {
        name: "WhatsAppMessage",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      Transaction: {
        name: "Transaction",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      FavoriteOrder: {
        name: "FavoriteOrder",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },

    },
    functionsByType: {
      getDataForOrderEmail: [getDataForOrderEmail],
      preStartup: [preStartup, IPNPayment],
      startup: [startup],
    },
    graphQL: {
      resolvers,
      schemas,
    },
    mutations,
    queries,
    policies,
    simpleSchemas: {
      Order,
      OrderFulfillmentGroup,
      OrderItem,
    },
  });
}
