
// const axios = require('axios');
import axios from "axios";
export default async function doEasyPaisaPayment(
    orderId,
    storeId,
    transactionAmount,
    transactionType,
    mobileAccountNo,
    emailAddress
) {
  console.log(orderId,
    storeId,
    transactionAmount,
    transactionType,
    mobileAccountNo,
    emailAddress)
    let data = JSON.stringify({
        "orderId": orderId||"abc123",
        "storeId": storeId||"397634",
        "transactionAmount": transactionAmount||"1.00",
        "transactionType": transactionType||"MA",
        "mobileAccountNo": mobileAccountNo||"03364445126",
        "emailAddress": emailAddress||"usama.sama@gmail.com"
      });
      console.log("data ",data)
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initiate-ma-transaction',
        headers: { 
          'Credentials': 'UmFuY2hlcnNjYWZlOjU1MDU4ZjY2NWQ1ODc5MDYxZDg1NDBlZTEyMzUzYjZh', 
          'Content-Type': 'application/json', 
          'Cookie': 'f5avraaaaaaaaaaaaaaaa_session_=HLMGKINDPKOJPKHOFEJMHOFEAPLIEDNBIFMADPFDMFDBKJMAKJPJNJDHBOMIFKDDNPJDBLJAELGDJNPNGKFAHGPIBDFNHNIPGPKKOPNLFAMPKIHGHMCEGFLIEIAJCECG; TS01f2a187=011c1a8db659dbb038859aba2f36856f49c5f911252f3f7aa8f963e626dc41fc3e6bf3995de8df0b30f8604415537bd0b25978dbb226ae694d9bffc43ef74feae68d5e4754; f5avraaaaaaaaaaaaaaaa_session_=DKJDJDGCAKOILNAIFIMBBPDNGBEELNCHEKICBGFHGICKPLHBPDALCJIMBPPODMIGGPFDJNOKBBCECALJIFOADBPJBCIJKCAHMDAOJGFAOIKNDBIADHNFAFCCEBAIOJHP; TS01f2a187=011c1a8db62ea093b93cb0f4b4084e8c77949764178c31e2d7b022ef68219ae814908501b769506889b7f1a1e288e8efe804be3e6a042c4ca76066fb41057d939d4f9f4cf4'
        },
        data : data
      };
      
      const response=await axios.request(config)
      .then((response) => {
        console.log(JSON.stringify(response.data));
        return response.data;
      })
      .catch((error) => {
        console.log(error);
        return false
      });
      return response
}
