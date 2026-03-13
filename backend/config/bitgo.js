const BitGo = require("bitgo");
require("dotenv").config();

let bitgo;

function getBitGo() {
  if (!bitgo) {
    bitgo = new BitGo.BitGo({
      env: process.env.BITGO_ENV,
      accessToken: process.env.BITGO_ACCESS_TOKEN
    });
  }

  return bitgo;
}

module.exports = { getBitGo };