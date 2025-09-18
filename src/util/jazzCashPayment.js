import axios from "axios";
import moment from "moment";
import cryptoJS from "crypto-js";

export default async function jazzCashPayment(
  orderId,
  orderTotal,
  finalFulfillmentGroups
) {
  const fulfillmentGroup = finalFulfillmentGroups[0];

  // console.log(`finalFulfillmentGroups ===: INSIDE THE PAYMENT FUNCTION ${JSON.stringify(finalFulfillmentGroups, null, 2)}`);

  // Extracting phone and cnic
  let phone = fulfillmentGroup?.address?.jazzCashPhone || "";

  function formatPhoneNumber(number) {
    // Convert to string just in case it's a number
    phone = String(phone).trim();

    // If the number doesn't start with '0' and length is 10, add '0' at the beginning
    if (number.length === 10 && !number.startsWith("0")) {
      return "0" + number;
    }

    // Return as is if already correctly formatted
    return number;
  }

  console.log("FORMATED NUMBER", formatPhoneNumber(phone));
  let cnicNo = fulfillmentGroup?.address?.cnic || "";

  console.log("cnicNo", cnicNo);

  const url =
    "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction";
  const merchantId = "MC150326";
  const password = "fy8d58bxg0";
  const integritySalt = "vw68g1t9xf";
  const txnRefNo = `T${moment().format("YYYYMMDDHHmmss")}`;
  const amount = orderTotal;
  const txnCurrency = "PKR";
  const txnDateTime = moment().format("YYYYMMDDHHmmss");
  const billReference = "billref";
  const description = "Description Of Transaction";
  const txnExpiryDateTime = moment().format("YYYYMMDDHHmmss");
  const cnic = cnicNo || "345678";
  const mobileNo = formatPhoneNumber(phone) || "03123456789";
  const language = "EN";
  const MerchantMPIN = "1234";
  const ppmpf1 = "";
  const ppmpf2 = "";
  const ppmpf3 = "";
  const ppmpf4 = "";
  const ppmpf5 = "";

  console.log("txnRefNo", txnDateTime);
  console.log("txnDateTime", txnRefNo);

  const fields = {
    pp_Amount: amount,
    pp_BillReference: billReference,
    pp_CNIC: cnic,
    pp_Description: description,
    pp_Language: language,
    pp_MerchantID: merchantId,
    pp_MobileNumber: mobileNo,
    pp_Password: password,
    pp_TxnCurrency: txnCurrency,
    pp_TxnDateTime: txnDateTime,
    pp_TxnExpiryDateTime: txnExpiryDateTime,
    pp_TxnRefNo: txnRefNo,
  };

  const message = `${integritySalt}&${fields.pp_Amount}&${fields.pp_BillReference}&${fields.pp_CNIC}&${fields.pp_Description}&${fields.pp_Language}&${fields.pp_MerchantID}&${fields.pp_MobileNumber}&${fields.pp_Password}&${fields.pp_TxnCurrency}&${fields.pp_TxnDateTime}&${fields.pp_TxnExpiryDateTime}&${fields.pp_TxnRefNo}`;
  console.log("message", message);

  const createdHash = cryptoJS
    .HmacSHA256(message, integritySalt)
    .toString(cryptoJS.enc.Hex)
    .toUpperCase();
  console.log("createdHash", createdHash);

  const requestBody = {
    pp_Amount: amount,
    pp_BillReference: "billref",
    pp_CNIC: cnic,
    pp_Description: description,
    pp_Language: "EN",
    pp_MerchantID: merchantId,
    pp_MobileNumber: mobileNo,
    pp_Password: password,
    pp_SecureHash: createdHash,
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: txnDateTime,
    pp_TxnExpiryDateTime: txnExpiryDateTime,
    pp_TxnRefNo: txnRefNo,
    ppmpf_1: "",
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };

  // console.log('requestBody', JSON.stringify(requestBody));

  const { data: response } = await axios.post(url, requestBody);
  console.log("response", response);
  return response;
}
