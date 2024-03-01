const ethers = require("ethers")

const sendEther = async () => {
    const l2Url = `http://localhost:8545`
    const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const walletL2 = new ethers.Wallet(privateKey, l2RpcProvider)
    const tx = {
        to: '0xF1D598fD5f8367be41b0761696e643aC092b313E',
        value: 1
    }
    let receipt = await walletL2.sendTransaction(tx)
    await receipt.wait()
}

const main = async () => {
    for (let i = 0; i < 1024; i++) {
        await sendEther()
        console.log(`------- send index ${i} ---------`)
    }
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })