import pkg from "../package.json";
import i18n from "./i18n/index.js";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import axios from "axios";
import https from "https";
import pkgMongo from "mongodb";
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
import pubSub from "./util/pubSubIntance.js";

const { ObjectId } = pkgMongo;


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

    // EasyPaisa IPN (API Integration Guide V1.5).
    // Merchant must respond with responseCode "00" (accept) or "01" (reject).
    // Legacy query `?url=` status-fetch flow is still supported during migration.
    app.expressApp.post("/webhook/easypaisa", async (req, res) => {
      try {
        console.log("EasyPaisa IPN received. query:", req.query, "body:", req.body);

        const { collections } = context;
        const { Orders, Transaction } = collections;
        const statusUrl = req.query.url;

        let transactionData = req.body && Object.keys(req.body).length ? req.body : null;

        // Legacy V4 flow: fetch status from EasyPaisa URL
        if (!transactionData && statusUrl) {
          let parsedUrl;
          try {
            parsedUrl = new URL(statusUrl);
          } catch (err) {
            return res.status(400).json({
              responseCode: "01",
              success: false,
              message: "Invalid URL format",
            });
          }

          const allowedDomains = [
            "easypay.easypaisa.com.pk",
            "gateway-service-sandbox.easypaisa.com.pk",
            "gateway-service.easypaisa.com.pk",
          ];
          if (!allowedDomains.includes(parsedUrl.hostname)) {
            console.warn(`Rejected request to unauthorized domain: ${parsedUrl.hostname}`);
            return res.status(403).json({
              responseCode: "01",
              success: false,
              message: "URL domain not allowed. Only EasyPaisa domains are accepted.",
            });
          }

          try {
            const statusResponse = await axios.get(statusUrl, { timeout: 10000 });
            transactionData = statusResponse.data;
          } catch (fetchError) {
            console.error("Error fetching EasyPaisa status:", fetchError.message);
            return res.status(500).json({
              responseCode: "01",
              success: false,
              message: "Error fetching transaction status from EasyPaisa",
              error: fetchError.message,
            });
          }
        }

        if (!transactionData) {
          return res.status(400).json({
            responseCode: "01",
            success: false,
            message: "Missing EasyPaisa IPN payload",
          });
        }

        console.log("EasyPaisa transaction data:", JSON.stringify(transactionData, null, 2));

        const kitchenOrderID =
          transactionData?.order_id ||
          transactionData?.orderId ||
          transactionData?.optional1;
        const transactionRecord = transactionData?.optional2;
        const transactionIdFromTxn =
          transactionData?.transaction_id || transactionData?.transactionId;
        const transactionStatus = String(
          transactionData?.transaction_status ||
          transactionData?.transactionStatus ||
          ""
        ).toUpperCase();
        const responseCode =
          transactionData?.response_code ||
          transactionData?.responseCode;

        let lookupId = null;
        let orderDoc = null;

        if (kitchenOrderID) {
          // V1.5: order_id is the merchant orderId sent at initiate (kitchenOrderID).
          orderDoc = await Orders.findOne({ kitchenOrderID: String(kitchenOrderID) });

          if (!orderDoc) {
            let decodedId;
            try {
              decodedId = decodeOpaqueId(kitchenOrderID);
            } catch (e) {
              decodedId = null;
            }
            const fallbackId = decodedId?.id || kitchenOrderID;
            orderDoc = await Orders.findOne({ _id: fallbackId });
          }

          lookupId = orderDoc?._id || null;
        }

        if (lookupId) {
          const failedStatuses = new Set(["FAILED", "FAILURE", "UNPAID", "EXPIRED", "CANCELLED", "CANCELED"]);
          const successStatuses = new Set(["PAID", "SUCCESS"]);
          let isSuccess = false;
          if (successStatuses.has(transactionStatus)) {
            isSuccess = true;
          } else if (failedStatuses.has(transactionStatus)) {
            isSuccess = false;
          } else if (String(responseCode) === "0000" || String(responseCode) === "000") {
            isSuccess = true;
          }

          try {
            const orderObj = await Orders.findOneAndUpdate(
              {
                _id: lookupId,
                isPaid: { $ne: true }
              },
              {
                $set: {
                  isPaid: isSuccess,
                  paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                  transactionId: transactionIdFromTxn || null,
                  updatedAt: new Date(),
                },
              },
              { new: true }
            );

            const updatedOrder = orderObj?.value || orderDoc;
            const bId = updatedOrder?.branchID;
            const paymentMethod = updatedOrder?.paymentMethod || "EASYPAISA";

            if (bId) {
              pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${bId}`, {
                orderPaymentStatusUpdated: {
                  orderId: lookupId,
                  paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                  updatedAt: new Date(),
                  paymentMethod,
                  isPaid: isSuccess
                }
              });
            }
            pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${lookupId}`, {
              orderPaymentStatusUpdated: {
                orderId: lookupId,
                paymentStatus: isSuccess ? "SUCCESS" : "FAILED",
                paymentMethod,
                updatedAt: new Date(),
                isPaid: isSuccess
              }
            });
            console.log(`Order ${lookupId} updated from EasyPaisa IPN with status ${transactionStatus || responseCode}`);
          } catch (orderUpdateError) {
            console.error("Error updating order from EasyPaisa IPN:", orderUpdateError.message);
            return res.status(500).json({
              responseCode: "01",
              success: false,
              message: "Error updating order",
              error: orderUpdateError.message,
            });
          }

          try {
            let transactionFilter = {
              orderId: lookupId,
              status: "PENDING"
            };
            if (transactionRecord) {
              try {
                transactionFilter = { _id: ObjectId(transactionRecord) };
              } catch (e) {
                console.warn("Invalid optional2 transaction record id on EasyPaisa IPN");
              }
            } else if (transactionIdFromTxn) {
              transactionFilter = {
                $or: [
                  { orderId: lookupId, status: "PENDING" },
                  { kitchenOrderID: String(kitchenOrderID), status: "PENDING" },
                  { transactionId: transactionIdFromTxn }
                ]
              };
            }

            await Transaction.updateOne(
              transactionFilter,
              {
                $set: {
                  paidAmount: transactionData?.transaction_amount || transactionData?.transactionAmount,
                  responseMessage: transactionData?.description || transactionData?.responseDesc || transactionStatus,
                  raw: transactionData,
                  ...(statusUrl ? { statusUrl } : {}),
                  updatedAt: new Date(),
                  responseCode: responseCode,
                  status: isSuccess ? "SUCCESS" : (transactionStatus || "FAILED"),
                  transactionId: transactionIdFromTxn,
                  transactionDateTime: transactionData?.paid_datetime || transactionData?.transactionDateTime,
                  kitchenOrderID: String(kitchenOrderID),
                  orderId: lookupId,
                }
              }
            );
          } catch (transactionUpdateError) {
            console.error("Error upserting transaction record from EasyPaisa IPN:", transactionUpdateError.message);
          }
        } else {
          console.warn("EasyPaisa IPN missing resolvable order_id; rejecting notification");
          return res.status(200).json({
            responseCode: "01",
            success: false,
            message: "Order not found for IPN",
          });
        }

        // Forward for monitoring (best-effort)
        if (statusUrl) {
          void axios.post(
            "https://api.finnect.com.pk/ipn/easypaisa",
            {},
            {
              params: { url: statusUrl },
              headers: { "Content-Type": "application/json" },
              timeout: 10000,
              httpsAgent: finnectHttpsAgent,
            }
          ).catch((forwardError) => {
            console.error("Error forwarding to Finnect:", forwardError.message);
          });
        } else {
          void axios.post(
            "https://api.finnect.com.pk/ipn/easypaisa",
            transactionData,
            {
              headers: { "Content-Type": "application/json" },
              timeout: 10000,
              httpsAgent: finnectHttpsAgent,
            }
          ).catch((forwardError) => {
            console.error("Error forwarding to Finnect:", forwardError.message);
          });
        }

        if ((process.env.NODE_ENV || "").toLowerCase() === "production") {
          void axios.post(
            "https://api.staging.rancherscafe.com/webhook/easypaisa",
            transactionData,
            {
              ...(statusUrl ? { params: { url: statusUrl } } : {}),
              headers: { "Content-Type": "application/json" },
              timeout: 10000,
              httpsAgent: finnectHttpsAgent,
            }
          ).catch((ranchersForwardError) => {
            console.error("Error forwarding to Ranchers staging webhook:", ranchersForwardError.message);
          });
        }

        // V1.5: 00 = accept transaction, 01 = reject / drop
        return res.status(200).json({
          responseCode: "00",
          success: true,
          message: "IPN processed successfully",
        });
      } catch (error) {
        console.error("Error processing EasyPaisa webhook:", error);
        return res.status(500).json({
          responseCode: "01",
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
