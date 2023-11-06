const ethers = require("ethers")
const morphismSDK = require("@morphism-labs/sdk")
const { expect } = require("chai")
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`
const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const dou = BigInt(2)
const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18

const getSigners = async () => {
    const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const sendEther = async () => {
    const provider = new ethers.providers.JsonRpcProvider(l1Url)
    const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const wallet1 = new ethers.Wallet(privateKey1, provider)

    const privateKey2 = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'
    const wallet2 = new ethers.Wallet(privateKey2, provider)

    const tx = {
        to: '0xF1D598fD5f8367be41b0761696e643aC092b313E',
        value: ethers.utils.parseEther("3")
    }
    const receipt = await wallet1.sendTransaction(tx)
    await receipt.wait()
    console.log('wallet1 balances', (await wallet1.getBalance()).toString())
    console.log('wallet2 balances', (await wallet2.getBalance()).toString())
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    addr = l1Signer.address
    crossChainMessenger = new morphismSDK.CrossChainMessenger({
        l1ChainId: 900,
        l2ChainId: 53077,
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
    })
}

const reportBalances = async () => {
    const l1Balance = (await crossChainMessenger.l1Signer.getBalance()).toString().slice(0, -9)
    const l2Balance = (await crossChainMessenger.l2Signer.getBalance()).toString().slice(0, -9)

    console.log(`On L1:${l1Balance} Gwei   On L2:${l2Balance} Gwei`)
}

const depositETH = async () => {
    console.log("Deposit ETH")
    await reportBalances()
    const start = new Date()

    const response = await crossChainMessenger.depositETH(dou * eth)
    console.log(`Transaction hash (on L1): ${response.hash}`)
    await response.wait()
    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphismSDK.MessageStatus.RELAYED)

    await reportBalances()
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawETH = async () => {
    console.log("Withdraw ETH")
    const start = new Date()
    await reportBalances()

    let balance = await l2RpcProvider.getBalance("0xe08fd3aCcA5A467e9E704c703e8D87F634Fb20da")
    console.log("balances before ",balance.toString())

    let response = await crossChainMessenger.withdrawETH(eth)
    console.log(`Transaction hash (on L2): ${response.hash}`)
    let receipt = await response.wait()
    console.log('withdraw in L2 height', receipt.blockNumber)
    expect(receipt.status.toString()).to.eq('1')
    await reportBalances()

     balance = await l2RpcProvider.getBalance("0xe08fd3aCcA5A467e9E704c703e8D87F634Fb20da")
    console.log("balances after ",balance.toString())

    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphismSDK.MessageStatus.READY_TO_PROVE)
    const syncIndex = await crossChainMessenger.getBackendTreeSyncIndex()
    console.log("sync index : ", syncIndex)

    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.proveMessage(response.hash)

    console.log("In the challenge period, waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphismSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.finalizeMessage(response.hash)

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphismSDK.MessageStatus.RELAYED)

    await reportBalances()
    console.log(`withdrawETH took ${(new Date() - start) / 1000} seconds\n\n\n`)
}

const main = async () => {
    await sendEther()
    await setup()

    await depositETH()
    await withdrawETH()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
