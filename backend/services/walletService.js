const { getBitGo } = require("../config/bitgo");

async function sendFunds(recipientAddress, amount) {
  try {
    const bitgo = getBitGo();
    const coin = bitgo.coin("teth");

    const wallet = await coin.wallets().get({
      id: process.env.BITGO_WALLET_ID
    });

    const tx = await wallet.send({
      address: recipientAddress,
      amount: amount,
      walletPassphrase: process.env.WALLET_PASSPHRASE
    });

    return {
      status: "success",
      txHash: tx.txid
    };

  } catch (error) {

    return {
      status: "error",
      message: error.message
    };

  }
}

module.exports = { sendFunds };