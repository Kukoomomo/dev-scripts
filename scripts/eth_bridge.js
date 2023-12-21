const ethers = require("ethers")
const morphSDK = require("@morph-l2/sdk")

const { expect } = require("chai")
const l1Url = `http://localhost:9545`
const l2Url = `http://localhost:8545`

const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const dou = BigInt(2)
const gwei = BigInt(1e9)
const eth = gwei * gwei   // 10^18
const privateKey = '0xe63dfa829f3ab6b3bf48c3b350c712e2e1032e23188298ba4d9097b14ddedc0f'

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const sendEther = async () => {
    console.log("send 3 ether to 0xF1D598fD5f8367be41b0761696e643aC092b313E")
    const privateKey1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const walletL1 = new ethers.Wallet(privateKey1, l1RpcProvider)
    const signerL1 = new ethers.Wallet(privateKey, l1RpcProvider)
    const tx = {
        to: '0xF1D598fD5f8367be41b0761696e643aC092b313E',
        value: ethers.utils.parseEther("100")
    }
    let l1Balance = (await signerL1.getBalance()).toString()

    if (l1Balance.length < 20) {
        let receipt = await walletL1.sendTransaction(tx)
        await receipt.wait()
    }
    console.log('l1 balances', (await signerL1.getBalance()).toString())
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    addr = l1Signer.address
    crossChainMessenger = new morphSDK.CrossChainMessenger({
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
        morphSDK.MessageStatus.RELAYED)

    await reportBalances()
    console.log(`depositETH took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawETH = async () => {
    console.log("Withdraw ETH")
    const start = new Date()
    await reportBalances()

    let response = await crossChainMessenger.withdrawETH(eth)
    console.log(`Transaction hash (on L2): ${response.hash}`)
    let receipt = await response.wait()
    console.log('withdraw in L2 height', receipt.blockNumber)
    expect(receipt.status.toString()).to.eq('1')
    await reportBalances()

    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_TO_PROVE)
    const syncIndex = await crossChainMessenger.getBackendTreeSyncIndex()
    console.log("sync index : ", syncIndex)

    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.proveMessage(response.hash)

    console.log("Waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.finalizeMessage(response.hash)

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.RELAYED)

    await reportBalances()
    console.log(`withdrawETH took ${(new Date() - start) / 1000} seconds\n\n\n`)
}

const finalizeBatchs = async () => {

    const res = await crossChainMessenger.contracts.l1.Rollup.finalizeBatchs()
    await res.wait()
    let lastCommittedBatchIndex = await crossChainMessenger.contracts.l1.Rollup.lastCommittedBatchIndex()
    let lastFinalizedBatchIndex = await crossChainMessenger.contracts.l1.Rollup.lastFinalizedBatchIndex()
    console.log("lastCommittedBatchIndex", lastCommittedBatchIndex.toNumber())
    console.log("lastFinalizedBatchIndex", lastFinalizedBatchIndex.toNumber())
}

const msgStatusCheck = async (hash) => {
    const resolved = await crossChainMessenger.toCrossChainMessage(hash)
    const withdrawal = await crossChainMessenger.toLowLevelMessage(resolved)
    const provenWithdrawal =
        await crossChainMessenger.contracts.l1.MorphPortal.provenWithdrawals(
            morphSDK.hashLowLevelMessage(withdrawal)
        )

    // check rollup confirm batch
    const withdrawalRootBatchIndex =
        await crossChainMessenger.contracts.l1.Rollup.withdrawalRoots(
            provenWithdrawal.withdrawalRoot
        )
    let lastFinalizedBatchIndex = await crossChainMessenger.contracts.l1.Rollup.lastFinalizedBatchIndex()
    const latestBlock = await crossChainMessenger.l1Provider.getBlock('latest')
    const finalizePeriod =
        await crossChainMessenger.contracts.l1.Rollup.FINALIZATION_PERIOD_SECONDS()
    if (
        withdrawalRootBatchIndex.gt(lastFinalizedBatchIndex) ||
        latestBlock.timestamp <
        provenWithdrawal.timestamp.toNumber() + finalizePeriod.toNumber()
    ) {
        console.log("in challenge period")
    } else {
        console.log("out challenge period")
    }

    console.log("withdrawal in batch ", withdrawalRootBatchIndex.toNumber())
    await finalizeBatchs()
    const status = await crossChainMessenger.getMessageStatus(hash)
    console.log("status", status)
}

const withdrawETHByHash = async (hash) => {
    console.log("Withdraw ETH,hash:", hash)
    const start = new Date()
    await reportBalances()

    const receipt = await crossChainMessenger.l2Provider.getTransactionReceipt(
        hash
    )
    console.log(`Transaction hash (on L2): ${hash}`)
    console.log('withdraw in L2 height', receipt.blockNumber)
    expect(receipt.status.toString()).to.eq('1')
    await reportBalances()

    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(hash,
        morphSDK.MessageStatus.READY_TO_PROVE)
    const syncIndex = await crossChainMessenger.getBackendTreeSyncIndex()
    console.log("sync index : ", syncIndex)

    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.proveMessage(hash)

    console.log("Waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(hash,
        morphSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.finalizeMessage(hash)

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(hash,
        morphSDK.MessageStatus.RELAYED)

    await reportBalances()
    console.log(`withdrawETH took ${(new Date() - start) / 1000} seconds\n\n\n`)
}


const main = async () => {
    await sendEther()
    await setup()
    await depositETH()
    await withdrawETH()

    // await withdrawETHByHash('')
    // await msgStatusCheck('')
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
