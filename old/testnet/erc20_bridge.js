const ethers = require("ethers")
const morphSDK = require("@morph-l2/sdk")
const axios = require("axios")

const L1ERC20Artifacts = require("../artifacts/contracts/MockTest/TestERC20.sol/TestERC20.json")
const L2ERC20Artifacts = require("../artifacts/contracts/universal/MorphismMintableERC20.sol/MorphismMintableERC20.json")

const L2BridgeAddress = '0x4200000000000000000000000000000000000010'
const l1Url = `https://sepolia.infura.io/v3/0747039294284c25904babb5a68e4bb5`
const l2Url = `https://rpc-testnet.morphl2.io`

const l1RpcProvider = new ethers.providers.JsonRpcProvider(l1Url)
const l2RpcProvider = new ethers.providers.JsonRpcProvider(l2Url)
let crossChainMessenger

const privateKey = '0x589a1c5aeb4f24f3ea1e48c88e7b3c844b2816986d00fe52e03ef727a4e33032'
// const privateKey = '0xd687eb0c13c15544e8d717f4637e39fbbf33367d77a3ffb81d72242ce7bad69e'

const L1ERC20Addr = '0x5F4c7D793D898e64eddd1fC82D27EcfB5F6e4596' // USDT
const L2ERC20Addr = '0xB4A71512cf4F3A8f675D2aeC76198D6419D219C7' // USDT
let l1ERC20, l2ERC20    // OUTb contracts to show ERC-20 transfers
let ourAddr             // The address of the signer we use.  
const dou = BigInt(2)
const oneToken = BigInt(1e18)

const getSigners = async () => {
    const l1Wallet = new ethers.Wallet(privateKey, l1RpcProvider)
    const l2Wallet = new ethers.Wallet(privateKey, l2RpcProvider)

    return [l1Wallet, l2Wallet]
}

const deployERC20 = async () => {
    let [l1Wallet, l2Wallet] = await getSigners()
    const l1ERC20Factory = new ethers.ContractFactory(
        L1ERC20Artifacts.abi,
        L1ERC20Artifacts.bytecode,
    ).connect(l1Wallet)
    if (L1ERC20Addr == '') {
        l1ERC20 = await l1ERC20Factory.deploy('L1Token', 'l1token')
    } else {
        l1ERC20 = l1ERC20Factory.attach(L1ERC20Addr)
    }

    const l2ERC20Factory = new ethers.ContractFactory(
        L2ERC20Artifacts.abi,
        L2ERC20Artifacts.bytecode,
    ).connect(l2Wallet)
    if (L2ERC20Addr == '') {
        l2ERC20 = await l2ERC20Factory.deploy(L2BridgeAddress, l1ERC20.address, "L2Token", "l2token")
    } else {
        l2ERC20 = l2ERC20Factory.attach(L2ERC20Addr)
    }
    console.log(`Token on L1 ${l1ERC20.address}, L2 ${l2ERC20.address}`)
}

const setup = async () => {
    const [l1Signer, l2Signer] = await getSigners()
    ourAddr = l1Signer.address
    crossChainMessenger = new morphSDK.CrossChainMessenger({
        l1ChainId: 11155111,
        l2ChainId: 2710,
        l1SignerOrProvider: l1Signer,
        l2SignerOrProvider: l2Signer,
        backendURL: "https://indexer-testnet.morphl2.io",
        contracts: {
            l1: {
                AddressManager: "0x7f1f7f8f35943cbc699167ff32dbb6ad069245c3",
                L1CrossDomainMessenger: "0xfe26613a717a793560df394928bcc22ed0d8542e",
                L1StandardBridge: "0xcb95f07b1f60868618752ceabbe4e52a1f564336",
                BondManager: "0x0000000000000000000000000000000000000000",
                MorphPortal: "0xef2afa792412ae5edf7e54dc6830f5117e2bd22c",
                Rollup: "0x9672010622c9511127b56028465afd1d8ecabc65",
            }
        }
    })
    await deployERC20()
}

const reportERC20Balances = async () => {
    const l1Balance = (await l1ERC20.balanceOf(ourAddr)).toString()
    const l2Balance = (await l2ERC20.balanceOf(ourAddr)).toString()
    console.log(`Token on L1 balances:${l1Balance}     Token on L2 balances:${l2Balance}`)
}


const depositERC20 = async () => {
    console.log("Deposit ERC20")
    await reportERC20Balances()
    const start = new Date()

    // Need the l2 address to know which bridge is responsible
    const allowanceResponse = await crossChainMessenger.approveERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    await allowanceResponse.wait()
    console.log(`Allowance given by tx ${allowanceResponse.hash}`)
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)

    const response = await crossChainMessenger.depositERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    console.log(`Deposit transaction hash (on L1): ${response.hash}`)
    await response.wait()

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.RELAYED)

    await reportERC20Balances()
    console.log(`depositERC20 took ${(new Date() - start) / 1000} seconds\n\n`)
}

const withdrawERC20 = async () => {
    console.log("Withdraw ERC20")
    const start = new Date()
    await reportERC20Balances()

    const response = await crossChainMessenger.withdrawERC20(
        l1ERC20.address, l2ERC20.address, oneToken)
    console.log('withdraw in L2 height', await l2RpcProvider.getBlockNumber())
    console.log(`Transaction hash (on L2): ${response.hash}`)
    await response.wait()

    console.log("Waiting for status to be READY_TO_PROVE")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_TO_PROVE)
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.proveMessage(response.hash)

    console.log("In the challenge period, waiting for status READY_FOR_RELAY")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response.hash,
        morphSDK.MessageStatus.READY_FOR_RELAY)
    console.log("Ready for relay, finalizing message now")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)

    await crossChainMessenger.finalizeMessage(response.hash)

    console.log("Waiting for status to change to RELAYED")
    console.log(`Time so far ${(new Date() - start) / 1000} seconds`)
    await crossChainMessenger.waitForMessageStatus(response,
        morphSDK.MessageStatus.RELAYED)
    await reportERC20Balances()
    console.log(`withdrawERC20 took ${(new Date() - start) / 1000} seconds\n\n\n`)
}

const main = async () => {
    await setup()

    const [l1Signer, l2Signer] = await getSigners()
    let allowance = await l1ERC20.allowance(l1Signer.address, '0xcb95f07b1f60868618752ceabbe4e52a1f564336')
    console.log(allowance)
    const res = await l1ERC20.connect(l1Signer).approve('0xcb95f07b1f60868618752ceabbe4e52a1f564336', 0)
    await res.wait()
    allowance = await l1ERC20.allowance(l1Signer.address, '0xcb95f07b1f60868618752ceabbe4e52a1f564336')
    console.log(allowance)
    // await depositERC20()
    // const bridge = await crossChainMessenger.getBridgeForTokenPair(L1ERC20Addr, L2ERC20Addr)
    // console.log(bridge.l1Bridge)

    // const tx = await crossChainMessenger.approveERC20(L1ERC20Addr, L2ERC20Addr, oneToken)
    // console.log(tx)
    // await withdrawERC20()
}

main().then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })